// qzCert.js — Certificate helpers for QZ Tray "Remember this decision"
// Generates a self-signed X.509 certificate persisted in localStorage
// so QZ Tray trusts the site permanently after first approval.

const KC = 'qz_cert_pem';
const KK = 'qz_key_pem';

// ASN.1 DER helpers
const aLen = (n) => n < 0x80 ? [n] : n < 0x100 ? [0x80, n] : [0x81, n >> 8, n & 0xff];
const tlv = (t, c) => [t, ...aLen(c.length), ...c];
const dInt = (b) => { if (b[0] & 0x80) b = [0, ...b]; return tlv(0x02, b); };
const dOid = (o) => tlv(0x06, o);
const dBit = (b) => tlv(0x03, [0, ...b]);
const dSeq = (...i) => tlv(0x30, i.flat());
const dSet = (...i) => tlv(0x31, i.flat());
const dNull = () => [0x05, 0x00];
const dUtf8 = (s) => tlv(0x0c, [...new TextEncoder().encode(s)]);
const dUtc = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  const s = `${String(d.getUTCFullYear()).slice(-2)}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  return tlv(0x17, [...new TextEncoder().encode(s)]);
};

const toPem = (der, label) => {
  const b = btoa(String.fromCharCode(...der));
  const lines = b.match(/.{1,64}/g) || [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
};

const fromPem = (pem) => {
  const b = pem.replace(/-----.*?-----/g, '').replace(/\s/g, '');
  return [...atob(b)].map((c) => c.charCodeAt(0));
};

// OIDs
const OID = {
  CN: [85, 4, 3],
  RSA: [42, 134, 72, 134, 247, 13, 1, 1, 11],
  SHA256_RSA: [42, 134, 72, 134, 247, 13, 1, 1, 11],
};

// Extract raw RSA public key bytes from SPKI
function extractRawPub(spki) {
  let p = 0;
  const rLen = () => {
    const b = spki[p++];
    return b < 0x80 ? b : (spki[p++] << 8) | spki[p++];
  };
  if (spki[p] !== 0x30) throw new Error('bad seq');
  p++; rLen();
  // skip AlgorithmIdentifier
  const skipField = () => { p++; const l = rLen(); p += l; };
  skipField();
  // BIT STRING
  if (spki[p] !== 0x03) throw new Error('bad bitstr');
  p++; rLen(); p++; // skip unused bits byte
  return spki.slice(p);
}

// Build self-signed X.509 certificate
export async function getQzCertificate() {
  // Try loading from localStorage
  try {
    const certPem = localStorage.getItem(KC);
    const keyPem = localStorage.getItem(KK);
    if (certPem && keyPem) {
      const keyBytes = fromPem(keyPem);
      const privateKey = await crypto.subtle.importKey(
        'pkcs8', new Uint8Array(keyBytes),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false, ['sign']
      );
      return { certPem, privateKey };
    }
  } catch { /* regenerate */ }

  // Generate RSA 2048 key pair
  const kp = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']
  );

  const pubSpki = new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey));
  const privPkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));

  const rawPub = extractRawPub(pubSpki);

  // Parse modulus and exponent from the raw key
  let pos = 0;
  const rLen = () => { const b = rawPub[pos++]; return b < 0x80 ? b : (rawPub[pos++] << 8) | rawPub[pos++]; };

  // SEQUENCE { INTEGER(mod), INTEGER(exp) }
  if (rawPub[pos] !== 0x30) throw new Error('inner seq');
  pos++; rLen();

  // Modulus
  if (rawPub[pos] !== 0x02) throw new Error('mod int');
  pos++;
  const modLen = rLen();
  const modStart = rawPub[pos] === 0x00 ? pos + 1 : pos;
  const modulus = rawPub.slice(modStart, pos + modLen);
  pos += modLen;

  // Exponent
  if (rawPub[pos] !== 0x02) throw new Error('exp int');
  pos++;
  const expLen = rLen();
  const exponent = rawPub.slice(pos, pos + expLen);

  // SubjectPublicKeyInfo for the certificate
  const spkiData = dSeq(
    dSeq(dOid(OID.RSA), dNull()),
    dBit(dSeq(dInt([...modulus]), dInt([...exponent])))
  );

  // Build TBSCertificate
  const now = new Date();
  const notBefore = new Date(now.getTime() - 60000);
  const notAfter = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const tbsCert = dSeq(
    dInt([0x02]), // version v2
    dInt([1]), // serial number
    dSeq(dOid(OID.SHA256_RSA), dNull()), // signature algorithm
    dSeq(dUtf8('FoodHub POS')), // issuer
    dSeq(dUtc(notBefore), dUtc(notAfter)), // validity
    dSeq(dUtf8('FoodHub POS')), // subject
    spkiData // subjectPublicKeyInfo
  );

  // Sign the TBSCertificate
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' }, kp.privateKey, new Uint8Array(tbsCert)
  ));

  // Build the final certificate
  const certDer = dSeq(
    tbsCert,
    dSeq(dOid(OID.SHA256_RSA), dNull()),
    dBit([...signature])
  );

  const certPem = toPem(certDer, 'CERTIFICATE');
  const keyPem = toPem([...privPkcs8], 'PRIVATE KEY');

  // Persist in localStorage
  try {
    localStorage.setItem(KC, certPem);
    localStorage.setItem(KK, keyPem);
  } catch { /* storage full, will regenerate next time */ }

  return { certPem, privateKey: kp.privateKey };
}
