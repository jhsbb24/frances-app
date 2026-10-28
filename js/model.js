// ─────────────────────────────────────────────────────────────
// Estructura de tus datos (lo que se guarda en data.json).
//
// data.json = {
//   app, version, meta, settings,
//   objectives:    objetivos (habilidad + estado + historial)
//   sessions:      sesiones de estudio
//   conversations: consignas y registros de ChatGPT
//   references:    tu Biblioteca de referencias de Édito
//   cards:         tarjetas de repaso
// }
// ─────────────────────────────────────────────────────────────
import { BOOKS, DURATIONS, SKILLS, STATUSES, DIFFICULTIES } from './config.js';
import { firstDue } from './review.js';

export const SCHEMA_VERSION = 1;
const COLLECTION_KEYS = ['objectives', 'sessions', 'conversations', 'references', 'cards'];

export function newId(prefix) {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${Date.now().toString(36)}${random}`;
}

export const nowIso = () => new Date().toISOString();

export function emptyData() {
  return {
    app: 'mi-frances',
    version: SCHEMA_VERSION,
    meta: { updatedAt: null, device: '' },
    settings: { promptTemplate: '' }, // vacío = usar la plantilla original
    objectives: [],
    sessions: [],
    conversations: [],
    references: [],
    cards: [],
  };
}

export const emptyRef = () => ({ refId: '', book: '', unit: '', page: '', note: '' });

// ── Creación de elementos ─────────────────────────────────────

export function newObjective({ title, skill, description = '' }, now = nowIso()) {
  return { id: newId('obj'), createdAt: now, updatedAt: now, title, skill, description, status: 'pendiente', history: [] };
}

export function newSession({ minutes, objectiveId, ref }, now = nowIso()) {
  return {
    id: newId('ses'),
    createdAt: now,
    updatedAt: now,
    closedAt: null,
    minutes,
    objectiveId: objectiveId || '',
    ref: { ...emptyRef(), ...ref },
    draft: '',
    attempt1: '',
    attempt2: '',
    closing: { achievement: '', difficulty: '', nextStep: '' },
    timer: { elapsedMs: 0, runningSince: now },
  };
}

export function newConversation({ objectiveId = '', ref = emptyRef(), sessionId = '' } = {}, now = nowIso()) {
  return {
    id: newId('conv'),
    createdAt: now,
    updatedAt: now,
    sessionId,
    objectiveId,
    role: '',
    difficulty: 'facil',
    ref: { ...emptyRef(), ...ref },
    expr1: '',
    expr2: '',
    errors: '',
    prompt: '',
    promptEdited: false,
    registro: '',
    registroAt: null,
    actions: [],
  };
}

export function newReference(fields, now = nowIso()) {
  return { id: newId('ref'), createdAt: now, updatedAt: now, book: 'B1', edition: '', unit: '', page: '', audioUrl: '', notes: '', ...fields };
}

export function newCard({ kind, prompt, answer, note = '', source = { type: 'manual', id: '' } }, todayKey, now = nowIso()) {
  return {
    id: newId('card'),
    createdAt: now,
    updatedAt: now,
    kind,
    prompt,
    answer,
    note,
    source,
    step: 0,
    due: firstDue(todayKey),
    repeatToday: '',
    archived: false,
    reviews: [],
  };
}

// ── Cronómetro de la sesión ───────────────────────────────────

export function elapsedMs(session, nowMs = Date.now()) {
  const t = session.timer || {};
  let total = t.elapsedMs || 0;
  if (t.runningSince) total += Math.max(0, nowMs - Date.parse(t.runningSince));
  return total;
}
export const remainingMs = (session, nowMs = Date.now()) => session.minutes * 60000 - elapsedMs(session, nowMs);
export const isRunning = (session) => Boolean(session.timer?.runningSince);

export function pauseTimer(session, nowMs = Date.now()) {
  if (!isRunning(session)) return;
  session.timer = { elapsedMs: elapsedMs(session, nowMs), runningSince: null };
}

// ── Textos para mostrar ───────────────────────────────────────

export function refText(ref) {
  if (!ref) return '';
  const parts = [];
  if (ref.book) parts.push(`Édito ${ref.book}${ref.edition ? ` (${ref.edition})` : ''}`);
  if (ref.unit) parts.push(`Unidad ${ref.unit}`);
  if (ref.page) parts.push(`p. ${ref.page}`);
  if (ref.note) parts.push(ref.note);
  return parts.join(' · ');
}

export function objectiveTitle(data, id) {
  if (!id) return '';
  return data.objectives.find((o) => o.id === id)?.title || '(objetivo eliminado)';
}

/** Acepta solo enlaces http(s); cualquier otra cosa se ignora. */
export function safeUrl(text) {
  const value = String(text || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

// ── Normalización: limpia datos que vienen de GitHub o de un archivo ──

const str = (v) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const iso = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
const dayStr = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

function normRef(r) {
  const x = isObj(r) ? r : {};
  return { refId: str(x.refId), book: oneOf(x.book, BOOKS, ''), unit: str(x.unit), page: str(x.page), note: str(x.note) };
}

function base(item) {
  if (!isObj(item) || !str(item.id)) return null;
  const created = iso(item.createdAt) || new Date(0).toISOString();
  return { ...item, id: str(item.id), createdAt: created, updatedAt: iso(item.updatedAt) || created };
}

function normObjective(item) {
  const o = base(item);
  if (!o) return null;
  return {
    ...o,
    title: str(o.title),
    skill: oneOf(o.skill, SKILLS.map((s) => s.id), 'oral'),
    status: oneOf(o.status, STATUSES.map((s) => s.id), 'pendiente'),
    description: str(o.description),
    history: arr(o.history).filter(isObj).map((h) => ({
      ...h,
      at: iso(h.at) || o.createdAt,
      from: str(h.from),
      to: str(h.to),
      reason: str(h.reason),
      source: isObj(h.source) ? { type: str(h.source.type), id: str(h.source.id) } : null,
    })),
  };
}

function normSession(item) {
  const s = base(item);
  if (!s) return null;
  const closing = isObj(s.closing) ? s.closing : {};
  const timer = isObj(s.timer) ? s.timer : {};
  return {
    ...s,
    closedAt: iso(s.closedAt),
    minutes: DURATIONS.includes(Number(s.minutes)) ? Number(s.minutes) : 30,
    objectiveId: str(s.objectiveId),
    ref: normRef(s.ref),
    draft: str(s.draft),
    attempt1: str(s.attempt1),
    attempt2: str(s.attempt2),
    closing: { achievement: str(closing.achievement), difficulty: str(closing.difficulty), nextStep: str(closing.nextStep) },
    timer: { elapsedMs: Math.max(0, Number(timer.elapsedMs) || 0), runningSince: iso(timer.runningSince) },
  };
}

function normConversation(item) {
  const c = base(item);
  if (!c) return null;
  return {
    ...c,
    sessionId: str(c.sessionId),
    objectiveId: str(c.objectiveId),
    role: str(c.role),
    difficulty: oneOf(c.difficulty, DIFFICULTIES.map((d) => d.id), 'facil'),
    ref: normRef(c.ref),
    expr1: str(c.expr1),
    expr2: str(c.expr2),
    errors: str(c.errors),
    prompt: str(c.prompt),
    promptEdited: Boolean(c.promptEdited),
    registro: str(c.registro),
    registroAt: iso(c.registroAt),
    actions: arr(c.actions).filter(isObj).map((a) => ({ at: iso(a.at) || c.createdAt, text: str(a.text) })),
  };
}

function normReference(item) {
  const r = base(item);
  if (!r) return null;
  return {
    ...r,
    book: oneOf(r.book, BOOKS, 'B1'),
    edition: str(r.edition),
    unit: str(r.unit),
    page: str(r.page),
    audioUrl: safeUrl(r.audioUrl),
    notes: str(r.notes),
  };
}

function normCard(item) {
  const c = base(item);
  if (!c) return null;
  const source = isObj(c.source) ? c.source : {};
  return {
    ...c,
    kind: oneOf(c.kind, ['expresion', 'error'], 'expresion'),
    prompt: str(c.prompt),
    answer: str(c.answer),
    note: str(c.note),
    source: { type: oneOf(source.type, ['session', 'conversation', 'manual'], 'manual'), id: str(source.id) },
    step: Number.isInteger(c.step) ? c.step : 0,
    due: dayStr(c.due),
    repeatToday: dayStr(c.repeatToday),
    archived: Boolean(c.archived),
    reviews: arr(c.reviews).filter(isObj),
  };
}

const NORMALIZERS = {
  objectives: normObjective,
  sessions: normSession,
  conversations: normConversation,
  references: normReference,
  cards: normCard,
};

/**
 * Comprueba y limpia unos datos. Lanza un error con un mensaje en
 * español si no parecen datos de «Mi francés».
 */
export function normalizeData(raw) {
  if (!isObj(raw)) throw new Error('El archivo no tiene el formato de Mi francés.');
  const looksRight = raw.app === 'mi-frances' || COLLECTION_KEYS.some((k) => Array.isArray(raw[k]));
  if (!looksRight) throw new Error('El archivo no tiene el formato de Mi francés.');
  if (typeof raw.version === 'number' && raw.version > SCHEMA_VERSION) {
    throw new Error('Estos datos son de una versión más nueva de la app. Recarga la página para actualizarla.');
  }
  const data = emptyData();
  const meta = isObj(raw.meta) ? raw.meta : {};
  data.meta = { updatedAt: iso(meta.updatedAt), device: str(meta.device) };
  data.settings = { promptTemplate: str(isObj(raw.settings) ? raw.settings.promptTemplate : '') };
  for (const key of COLLECTION_KEYS) {
    const seen = new Set();
    data[key] = arr(raw[key])
      .map(NORMALIZERS[key])
      .filter((item) => item && !seen.has(item.id) && seen.add(item.id));
  }
  return data;
}

/** Copia profunda (los datos son JSON puro). */
export const clone = (value) => JSON.parse(JSON.stringify(value));

/** Resumen en números, para la importación y los conflictos. */
export function countData(data) {
  return {
    objectives: data.objectives.length,
    sessions: data.sessions.length,
    conversations: data.conversations.length,
    references: data.references.length,
    cards: data.cards.length,
  };
}
