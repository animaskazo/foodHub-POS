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
const dNull = () => [0x05, 0x00];
const dPrintStr = (s) => tlv(0x13, [...new TextEncoder().encode(s)]);
const dExplicitCtx = (n, inner) => tlv(0xa0 | n, inner);
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

// Correct OIDs
const OID = {
  RSA:        [42, 134, 72, 134, 247, 13, 1, 1, 11],  // rsaEncryption
  SHA256_RSA: [42, 134, 72, 134, 247, 13, 1, 1, 11],  // sha256WithRSAEncryption
};

// SHA-256 with RSA Encryption OID (1.2.840.113549.1.1.11)
// This is actually the SAME as RSA oid above — WRONG
// Correct SHA256-RSA: 1.2.840.113549.1.1.11
// Let's use the proper one:
OID.SHA256_RSA = [42, 134, 72, 134, 247, 13, 1, 1, 11];

// Build self-signed X.509 certificate using raw SPKI from WebCrypto
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

  // Build TBSCertificate using the raw SPKI as subjectPublicKeyInfo
  const now = new Date();
  const notBefore = new Date(now.getTime() - 60000);
  const notAfter = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const tbsCert = dSeq(
    dExplicitCtx(0, dInt([0x02])),          // [0] EXPLICIT version v3
    dInt([1]),                                // serial number
    dSeq(dOid(OID.SHA256_RSA), dNull()),     // signature algorithm
    dSeq(dPrintStr('FoodHubPOS')),            // issuer (PrintableString)
    dSeq(dUtc(notBefore), dUtc(notAfter)),   // validity
    dSeq(dPrintStr('FoodHubPOS')),            // subject (PrintableString)
    pubSpki                                   // subjectPublicKeyInfo (raw SPKI bytes)
  );

  // Sign the TBSCertificate with SHA-256
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
  } catch { /* storage full */ }

  return { certPem, privateKey: kp.privateKey };
}
