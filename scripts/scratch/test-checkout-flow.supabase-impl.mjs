// Cliente Supabase simulado (en memoria). Implementa las operaciones que usa el
// flujo de compra: createPublicOrder, checkInventoryStock, deductInventoryForOrder,
// findCustomerByPhone, upsertCustomerForOrder, getOrganizationByName, getPublicCatalog.

const db = {
  organizations: [],
  branches: [],
  categories: [],
  products: [],
  product_categories: [],
  product_images: [],
  variant_groups: [],
  variant_options: [],
  product_ingredients: [],
  ingredients: [],
  bundle_slots: [],
  bundle_slot_options: [],
  orders: [],
  order_items: [],
  order_item_variants: [],
  order_item_ingredients: [],
  payments: [],
  customers: [],
  ingredient_movements: [],
};

const seen = new Set();

const log = (...args) => {
  if (process.env.DEBUG_FLOW) console.log('[mock-sb]', ...args);
};

const clone = (x) => JSON.parse(JSON.stringify(x));

function makeId(table) {
  const n = (seen.size + 1).toString(36) + Math.random().toString(36).slice(2, 8);
  seen.add(n);
  return `${table.slice(0, 2)}_${n}`;
}

function matches(row, filters) {
  for (const f of filters) {
    if (f.op === 'eq' && row[f.field] !== f.value) return false;
    if (f.op === 'neq' && row[f.field] === f.value) return false;
    if (f.op === 'in' && !f.value.includes(row[f.field])) return false;
    if (f.op === 'ilike' && !String(row[f.field] || '').toLowerCase().includes(String(f.value).toLowerCase().replace(/%/g, ''))) return false;
    if (f.op === 'or') {
      const ok = f.value.some(clause => {
        for (const sub of clause) {
          if (sub.op === 'eq' && row[sub.field] !== sub.value) return false;
          if (sub.op === 'ilike' && !String(row[sub.field] || '').toLowerCase().includes(String(sub.value).toLowerCase().replace(/%/g, ''))) return false;
        }
        return true;
      });
      if (!ok) return false;
    }
  }
  return true;
}

function applySelect(row, cols, parentTable = '') {
  if (!cols || cols === '*') return { ...row };
  const out = {};
  for (const c of cols) {
    if (c.table) {
      // Relación anidada: busca en la fila la FK hacia la tabla relacionada.
      const singular = c.table.endsWith('ies') ? `${c.table.slice(0, -3)}y` : (c.table.endsWith('s') ? c.table.slice(0, -1) : c.table);
      let relRow = null;
      let isToOne = false;
      for (const key of Object.keys(row)) {
        const keySingular = key.endsWith('_id') ? key.slice(0, -3) : key;
        if (key.endsWith('_id') && (keySingular === singular || keySingular === c.table)) {
          relRow = db[c.table]?.find(r => r.id === row[key]) || null;
          isToOne = true;
          break;
        }
      }
      // Join inverso (to-many): la fila hija tiene la FK hacia el padre.
      // La FK es <padre_singular>_id (p.ej. product_categories.product_id).
      if (!isToOne) {
        const parentSingular = parentTable.endsWith('s') ? parentTable.slice(0, -1) : parentTable;
        const backFkCandidates = [
          `${parentSingular}_id`,
          `${parentTable}_id`,
          singular.endsWith('_id') ? singular : `${singular}_id`,
          `${c.table}_id`,
        ];
        const backFk = [...new Set(backFkCandidates)].find(k => db[c.table]?.[0]?.[k] !== undefined || db[c.table]?.some(r => r[k] !== undefined));
        if (backFk) {
          const children = db[c.table]?.filter(r => r[backFk] === row.id) || [];
          if (children.length > 0) relRow = children;
        }
      }
      if (isToOne) {
        out[c.table] = relRow ? applySelect(relRow, c.cols, c.table) : null;
      } else {
        const arr = Array.isArray(relRow) ? relRow : (relRow ? [relRow] : []);
        out[c.table] = arr.map(r => applySelect(r, c.cols, c.table));
      }
    } else {
      out[c.name] = row[c.name];
    }
  }
  return out;
}

// Parser recursivo del string de select de PostgREST:
// "id, name, product_categories ( categories ( id, name ) )"
function parseSelect(str) {
  const cols = [];
  let i = 0;
  const n = str.length;
  while (i < n) {
    while (i < n && (str[i] === ' ' || str[i] === ',' || str[i] === '\n')) i++;
    if (i >= n) break;
    let name = '';
    while (i < n && !/[ ,(\n]/.test(str[i])) {
      name += str[i];
      i++;
    }
    // saltar espacios en blanco entre el nombre y el paréntesis de relación
    while (i < n && str[i] === ' ') i++;
    if (i < n && str[i] === '(') {
      let depth = 1;
      i++; // saltar '('
      const innerStart = i;
      while (i < n && depth > 0) {
        if (str[i] === '(') depth++;
        if (str[i] === ')') depth--;
        i++;
      }
      const inner = str.slice(innerStart, i - 1);
      cols.push({ table: name, cols: parseSelect(inner) });
    } else {
      if (name) cols.push({ name });
    }
  }
  return cols;
}

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.limitVal = null;
    this.orderBy = null;
    this.orderAsc = true;
    this.cols = '*';
    this.insertRows = null;
    this.updateData = null;
    this.deleteOp = false;
    this.mode = 'array';
  }

  select(cols) {
    if (typeof cols === 'string') {
      this.cols = cols.trim() === '*' ? '*' : parseSelect(cols);
    } else if (Array.isArray(cols)) {
      this.cols = cols.map(c => ({ name: c }));
    } else {
      this.cols = '*';
    }
    return this;
  }

  eq(field, value) { this.filters.push({ op: 'eq', field, value }); return this; }
  neq(field, value) { this.filters.push({ op: 'neq', field, value }); return this; }
  in(field, value) { this.filters.push({ op: 'in', field, value }); return this; }
  ilike(field, value) { this.filters.push({ op: 'ilike', field, value }); return this; }
  or(clauses) {
    // "phone.eq.912345678,phone.eq.+569...,phone.ilike.%9%1234%5678%"
    const parsed = clauses.split(',').filter(Boolean).map(c => {
      const [field, op, ...rest] = c.split('.');
      const value = rest.join('.');
      return [{ field, op: op === 'eq' ? 'eq' : 'ilike', value }];
    });
    this.filters.push({ op: 'or', value: parsed });
    return this;
  }
  limit(n) { this.limitVal = n; return this; }
  order(field, { ascending = true } = {}) { this.orderBy = field; this.orderAsc = ascending; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybeSingle'; return this; }
  insert(rows) {
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(data) { this.updateData = data; return this; }
  delete() { this.deleteOp = true; return this; }

  _run() {
    const t = this.table;
    if (this.insertRows) {
      const inserted = this.insertRows.map(row => {
        const full = { ...row };
        if (!full.id) full.id = makeId(t);
        if (t === 'orders') {
          full.order_number = full.order_number || String(db.orders.length + 1).padStart(4, '0');
          full.created_at = new Date().toISOString();
        }
        db[t].push(full);
        return full;
      });
      log('insert', t, inserted.map(r => r.id));
      if (this.mode === 'single') {
        return { data: clone(inserted[0] ?? null), error: inserted[0] ? null : { message: 'not found' } };
      }
      if (this.cols === '*') return { data: clone(inserted), error: null };
      return { data: clone(inserted.map(r => applySelect(r, this.cols, this.table))), error: null };
    }

    if (this.updateData) {
      let matched = db[t].filter(r => matches(r, this.filters));
      for (const r of matched) Object.assign(r, this.updateData);
      log('update', t, matched.length, 'rows');
      if (this.cols === '*') return { data: clone(matched), error: null };
      return { data: clone(matched.map(r => applySelect(r, this.cols, this.table))), error: null };
    }

    if (this.deleteOp) {
      const before = db[t].length;
      db[t] = db[t].filter(r => !matches(r, this.filters));
      log('delete', t, before - db[t].length, 'rows');
      return { data: null, error: null };
    }

    let rows = db[t].filter(r => matches(r, this.filters));
    if (this.orderBy) {
      rows = [...rows].sort((a, b) => {
        const av = a[this.orderBy], bv = b[this.orderBy];
        if (av == null) return 1; if (bv == null) return -1;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return this.orderAsc ? cmp : -cmp;
      });
    }
    if (this.limitVal != null) rows = rows.slice(0, this.limitVal);
    log('select', t, rows.length, 'rows', JSON.stringify(this.filters.map(f => `${f.field}${f.op}${JSON.stringify(f.value)}`)));

    if (this.mode === 'single') {
      if (rows.length === 0) return { data: null, error: { message: 'No rows found' } };
      return { data: clone(this.cols === '*' ? rows[0] : applySelect(rows[0], this.cols, this.table)), error: null };
    }
    if (this.mode === 'maybeSingle') {
      if (rows.length === 0) return { data: null, error: null };
      return { data: clone(this.cols === '*' ? rows[0] : applySelect(rows[0], this.cols, this.table)), error: null };
    }
    return { data: clone(this.cols === '*' ? rows : rows.map(r => applySelect(r, this.cols, this.table))), error: null };
  }

  then(resolve, reject) {
    try {
      resolve(this._run());
    } catch (e) {
      reject(e);
    }
  }
}

const supabase = {
  from: (table) => new QueryBuilder(table),
  // API de test: inyectar datos
  __seed: (table, rows) => {
    db[table] = db[table].concat(clone(rows));
    return db[table].length;
  },
  __db: () => db,
  __reset: () => {
    for (const k of Object.keys(db)) db[k] = [];
  },
  auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }) },
  functions: { invoke: async () => ({ data: null, error: null }) },
};

export { supabase };
