// ─────────────────────────────────────────────────────────────
// Comparar dos versiones de tus datos (para «Ver ambas»).
// Usa también la «versión base» (la última que este dispositivo
// vio en GitHub) para saber qué cambió en cada lado.
// ─────────────────────────────────────────────────────────────
import { clone } from './model.js';

export const COLLECTIONS = [
  { key: 'objectives', label: 'Objetivos' },
  { key: 'sessions', label: 'Sesiones' },
  { key: 'conversations', label: 'Conversaciones' },
  { key: 'references', label: 'Biblioteca' },
  { key: 'cards', label: 'Tarjetas de repaso' },
];

/** JSON con las claves ordenadas, para comparar sin importar el orden. */
export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

const same = (a, b) => stable(a) === stable(b);

/** ¿Mismo contenido? (no tiene en cuenta quién ni cuándo guardó) */
export const sameContent = (a, b) => same({ ...a, meta: null }, { ...b, meta: null });

const byId = (list) => new Map((list || []).map((item) => [item.id, item]));
const newer = (a, b) => ((a.updatedAt || '') >= (b.updatedAt || '') ? 'mine' : 'cloud');

export const KIND_TEXT = {
  'nuevo-aqui': 'Nuevo en este dispositivo',
  'nuevo-nube': 'Nuevo en la nube (otro dispositivo)',
  'cambiado-aqui': 'Cambiado en este dispositivo',
  'cambiado-nube': 'Cambiado en la nube (otro dispositivo)',
  'cambiado-ambos': 'Cambiado en los dos',
  'borrado-aqui': 'Borrado en este dispositivo',
  'borrado-nube': 'Borrado en la nube (otro dispositivo)',
};

/**
 * Si los dos lados cambiaron campos DISTINTOS de un mismo elemento,
 * se pueden juntar. Devuelve null si cambiaron el mismo campo.
 */
export function mergeFields(mine, cloud, base) {
  if (!base) return null;
  const out = {};
  for (const key of new Set([...Object.keys(mine), ...Object.keys(cloud)])) {
    if (key === 'updatedAt') continue;
    const m = mine[key];
    const c = cloud[key];
    const b = base[key];
    if (same(m, c) || same(c, b)) out[key] = m;
    else if (same(m, b)) out[key] = c;
    else return null;
  }
  if ('updatedAt' in mine || 'updatedAt' in cloud) out.updatedAt = [mine.updatedAt || '', cloud.updatedAt || ''].sort().pop();
  return out;
}

function classify(mine, cloud, base) {
  if (mine && cloud) {
    const mineChanged = !base || !same(mine, base);
    const cloudChanged = !base || !same(cloud, base);
    if (base && mineChanged && !cloudChanged) return { kind: 'cambiado-aqui', choice: 'mine' };
    if (base && cloudChanged && !mineChanged) return { kind: 'cambiado-nube', choice: 'cloud' };
    const merged = mergeFields(mine, cloud, base);
    if (merged) return { kind: 'cambiado-ambos', choice: 'merge', merged };
    return { kind: 'cambiado-ambos', choice: newer(mine, cloud) };
  }
  if (mine) {
    if (base) return { kind: 'borrado-nube', choice: same(mine, base) ? 'cloud' : 'mine' };
    return { kind: 'nuevo-aqui', choice: 'mine' };
  }
  if (base) return { kind: 'borrado-aqui', choice: same(cloud, base) ? 'mine' : 'cloud' };
  return { kind: 'nuevo-nube', choice: 'cloud' };
}

/**
 * Lista de diferencias entre «mía» y «nube».
 * Cada diferencia trae una elección propuesta ('mine' o 'cloud').
 */
export function compareVersions(mine, cloud, base = null) {
  const items = [];
  for (const { key, label } of COLLECTIONS) {
    const m = byId(mine[key]);
    const c = byId(cloud[key]);
    const b = base ? byId(base[key]) : new Map();
    for (const id of new Set([...m.keys(), ...c.keys()])) {
      const mi = m.get(id) || null;
      const ci = c.get(id) || null;
      if (mi && ci && same(mi, ci)) continue;
      items.push({ key: `${key}:${id}`, collection: key, collectionLabel: label, id, mine: mi, cloud: ci, ...classify(mi, ci, b.get(id) || null) });
    }
  }
  if (!same(mine.settings, cloud.settings)) {
    items.push({
      key: 'settings',
      collection: 'settings',
      collectionLabel: 'Ajustes',
      id: 'settings',
      mine: mine.settings,
      cloud: cloud.settings,
      ...classify(mine.settings, cloud.settings, base ? base.settings : null),
    });
  }
  return items;
}

/** Junta las dos versiones según las elecciones (clave → 'mine' | 'cloud' | 'merge'). */
export function mergeVersions(mine, cloud, items, choices = {}) {
  const pick = (it) => {
    const choice = choices[it.key] || it.choice;
    if (choice === 'merge' && it.merged) return it.merged;
    return choice === 'mine' ? it.mine : it.cloud;
  };
  const picked = new Map(items.map((it) => [it.key, pick(it)]));
  const result = clone(mine);
  for (const { key } of COLLECTIONS) {
    const out = [];
    const seen = new Set();
    for (const item of [...mine[key], ...cloud[key]]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const k = `${key}:${item.id}`;
      if (!picked.has(k)) out.push(clone(item));
      else if (picked.get(k)) out.push(clone(picked.get(k)));
    }
    result[key] = out;
  }
  if (picked.has('settings')) result.settings = clone(picked.get('settings') || { promptTemplate: '' });
  return result;
}
