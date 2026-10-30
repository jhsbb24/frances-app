// ─────────────────────────────────────────────────────────────
// Cálculos sencillos sobre tus datos, para orientarte:
// qué objetivo practicar, tu siguiente paso, actividad por semana,
// unidades de Édito trabajadas y dificultades recientes.
// Solo hechos (fechas y recuentos): nunca niveles MCER ni rachas.
// ─────────────────────────────────────────────────────────────
import { dayKey, diffDays, addDays } from './dates.js';
import { parseRegistro } from './registro.js';

const isoMax = (a, b) => (a > b ? a : b);

/** Fecha (ISO) de la última sesión o conversación con ese objetivo; '' si nunca. */
export function lastActivity(data, objectiveId) {
  let last = '';
  for (const s of data.sessions) if (s.objectiveId === objectiveId) last = isoMax(last, s.createdAt);
  for (const c of data.conversations) if (c.objectiveId === objectiveId && c.registro.trim()) last = isoMax(last, c.registroAt || c.createdAt);
  return last;
}

/** Cuántas sesiones y conversaciones (con registro) tiene un objetivo. */
export function practiceCounts(data, objectiveId) {
  return {
    sessions: data.sessions.filter((s) => s.objectiveId === objectiveId).length,
    conversations: data.conversations.filter((c) => c.objectiveId === objectiveId && c.registro.trim()).length,
  };
}

/**
 * Objetivo que conviene practicar: primero los que están «En práctica»
 * o «Logrado con apoyo», luego los «Pendiente de observar»; dentro de
 * cada grupo, el que hace más tiempo que no trabajas (o nunca).
 */
export function suggestObjective(data, todayKey) {
  const group = { practica: 0, apoyo: 0, pendiente: 1 };
  const candidates = data.objectives
    .filter((o) => o.status in group)
    .map((o) => ({ objective: o, last: lastActivity(data, o.id) }))
    .sort((a, b) => group[a.objective.status] - group[b.objective.status] || a.last.localeCompare(b.last) || a.objective.title.localeCompare(b.objective.title, 'es'));
  const best = candidates[0];
  if (!best) return null;
  return { ...best, days: best.last ? diffDays(dayKey(new Date(best.last)), todayKey) : null };
}

/** El «siguiente paso» más reciente: del cierre de una sesión o de un REGISTRO. */
export function latestNextStep(data) {
  const options = [];
  for (const s of data.sessions) {
    if (s.closing.nextStep.trim()) options.push({ text: s.closing.nextStep.trim(), at: s.closedAt || s.updatedAt, kind: 'sesión', href: `#/sesion/${s.id}` });
  }
  for (const c of data.conversations) {
    if (!c.registro.trim()) continue;
    const next = parseRegistro(c.registro).fields.siguiente;
    if (next) options.push({ text: next, at: c.registroAt || c.updatedAt, kind: 'conversación', href: `#/conversacion/${c.id}` });
  }
  return options.sort((a, b) => b.at.localeCompare(a.at))[0] || null;
}

/** Lunes de la semana de un día "AAAA-MM-DD". */
export function weekStart(key) {
  const [y, m, d] = key.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return addDays(key, -((weekday + 6) % 7));
}

/** Recuento por semana (de lunes a domingo, hora de Vancouver), de la más reciente a la más antigua. */
export function weeklyActivity(data, todayKey, weeks = 8) {
  const first = weekStart(todayKey);
  const rows = Array.from({ length: weeks }, (_, i) => ({ start: addDays(first, -7 * i), sessions: 0, conversations: 0, reviews: 0 }));
  const add = (day, field) => {
    const row = rows.find((r) => r.start === weekStart(day));
    if (row) row[field] += 1;
  };
  for (const s of data.sessions) add(dayKey(new Date(s.createdAt)), 'sessions');
  for (const c of data.conversations) if (c.registro.trim()) add(dayKey(new Date(c.registroAt || c.createdAt)), 'conversations');
  for (const card of data.cards) for (const r of card.reviews || []) if (r.day) add(r.day, 'reviews');
  return rows;
}

/** Unidades de Édito que aparecen en tus sesiones y conversaciones, por libro. */
export function unitsWorked(data) {
  const books = {};
  const note = (ref, kind, at) => {
    if (!ref?.book || !String(ref.unit || '').trim()) return;
    const unit = String(ref.unit).trim();
    const list = (books[ref.book] ||= {});
    const row = (list[unit] ||= { unit, sessions: 0, conversations: 0, last: '' });
    row[kind] += 1;
    row.last = isoMax(row.last, at);
  };
  for (const s of data.sessions) note(s.ref, 'sessions', s.createdAt);
  for (const c of data.conversations) note(c.ref, 'conversations', c.createdAt);
  const out = {};
  for (const [book, units] of Object.entries(books)) {
    out[book] = Object.values(units).sort((a, b) => a.unit.localeCompare(b.unit, 'es', { numeric: true }));
  }
  return out;
}

/** Cuántas veces se usó una referencia de la Biblioteca. */
export function referenceUsage(data, ref) {
  const same = (r) => r && (r.refId === ref.id || (r.book === ref.book && r.unit && r.unit === ref.unit && r.page && r.page === ref.page));
  const sessions = data.sessions.filter((s) => same(s.ref));
  const conversations = data.conversations.filter((c) => same(c.ref));
  const last = [...sessions, ...conversations].reduce((m, x) => isoMax(m, x.createdAt), '');
  return { sessions: sessions.length, conversations: conversations.length, last };
}

/** Dificultades (cierre de sesiones) y prioridades (REGISTRO) más recientes. */
export function recentDifficulties(data, limit = 8) {
  const out = [];
  for (const s of data.sessions) {
    if (s.closing.difficulty.trim()) out.push({ at: s.closedAt || s.updatedAt, text: s.closing.difficulty.trim(), kind: 'Dificultad (sesión)', href: `#/sesion/${s.id}` });
  }
  for (const c of data.conversations) {
    if (!c.registro.trim()) continue;
    const priority = parseRegistro(c.registro).fields.prioridad;
    if (priority) out.push({ at: c.registroAt || c.updatedAt, text: priority, kind: 'Prioridad (conversación)', href: `#/conversacion/${c.id}` });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
