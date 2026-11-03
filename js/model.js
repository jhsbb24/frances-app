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
import { BOOKS, DURATIONS, SKILLS, STATUSES, DIFFICULTIES, SESSION_PLAN, STEP_TYPES } from './config.js';
import { formatShort } from './dates.js';
import { firstDue } from './review.js';

export const SCHEMA_VERSION = 1;
export const COLLECTION_KEYS = ['objectives', 'sessions', 'conversations', 'references', 'cards', 'steps'];

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
    steps: [], // plan de estudio (pasos ordenados)
  };
}

export const emptyRef = () => ({ refId: '', book: '', unit: '', page: '', note: '' });

// ── Creación de elementos ─────────────────────────────────────

export function newObjective({ title, skill, description = '' }, now = nowIso()) {
  return { id: newId('obj'), createdAt: now, updatedAt: now, title, skill, description, status: 'pendiente', history: [] };
}

export function newSession({ minutes, objectiveId, ref, stepId = '' }, now = nowIso()) {
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
    feedback: '', // correcciones recibidas entre el primer y el segundo intento
    attempt2: '',
    closing: { achievement: '', difficulty: '', nextStep: '' },
    timer: { elapsedMs: 0, runningSince: now },
    stepId, // paso del plan del que sale la sesión (si hay)
    stepChecks: [], // tareas del paso que ya marcaste
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

/** Fase del plan sugerido según los minutos que llevas. */
export function currentPhase(minutes, elapsedMinutes) {
  const plan = SESSION_PLAN[minutes] || SESSION_PLAN[30];
  let end = 0;
  for (let i = 0; i < plan.length; i++) {
    end += plan[i][1];
    if (elapsedMinutes < end) return { index: i, name: plan[i][0], endsAt: end };
  }
  return { index: plan.length, name: '', endsAt: end };
}

/** La sesión entera como texto (para copiarla y compartirla). */
export function sessionAsText(s, data) {
  const parts = [`Sesión del ${formatShort(s.createdAt)} · ${s.minutes} min`];
  const objective = objectiveTitle(data, s.objectiveId);
  if (objective) parts.push(`Objetivo: ${objective}`);
  if (refText(s.ref)) parts.push(`Referencia: ${refText(s.ref)}`);
  const block = (title, text) => text.trim() && parts.push('', `${title}:`, text.trim());
  block('Borrador', s.draft);
  block('Primer intento', s.attempt1);
  block('Correcciones', s.feedback);
  block('Segundo intento', s.attempt2);
  const c = s.closing;
  if (c.achievement || c.difficulty || c.nextStep) {
    parts.push('', 'Cierre:');
    if (c.achievement.trim()) parts.push(`- Logro: ${c.achievement.trim()}`);
    if (c.difficulty.trim()) parts.push(`- Dificultad: ${c.difficulty.trim()}`);
    if (c.nextStep.trim()) parts.push(`- Siguiente paso: ${c.nextStep.trim()}`);
  }
  return parts.join('\n');
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
    feedback: str(s.feedback),
    attempt2: str(s.attempt2),
    closing: { achievement: str(closing.achievement), difficulty: str(closing.difficulty), nextStep: str(closing.nextStep) },
    timer: { elapsedMs: Math.max(0, Number(timer.elapsedMs) || 0), runningSince: iso(timer.runningSince) },
    stepId: str(s.stepId),
    stepChecks: arr(s.stepChecks).filter((n) => Number.isInteger(n) && n >= 0),
  };
}

const STEP_TYPE_IDS = STEP_TYPES.map((t) => t.id);

function normStep(item) {
  const s = base(item);
  if (!s) return null;
  const conv = isObj(s.conversation) ? s.conversation : null;
  return {
    ...s,
    order: Number.isFinite(Number(s.order)) ? Number(s.order) : 0,
    book: oneOf(s.book, BOOKS, 'B1'),
    unit: str(s.unit),
    unitTitle: str(s.unitTitle),
    title: str(s.title),
    pages: str(s.pages),
    minutes: DURATIONS.includes(Number(s.minutes)) ? Number(s.minutes) : 30,
    instructions: arr(s.instructions)
      .map((i) => (isObj(i) ? { type: oneOf(i.type, STEP_TYPE_IDS, 'nota'), text: str(i.text) } : { type: 'nota', text: str(i) }))
      .filter((i) => i.text),
    audio: str(s.audio),
    objectiveIds: arr(s.objectiveIds).map(str).filter(Boolean),
    conversation: conv ? { role: str(conv.role), expr1: str(conv.expr1), expr2: str(conv.expr2) } : null,
    doneAt: iso(s.doneAt),
    sessionId: str(s.sessionId),
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
  steps: normStep,
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
    steps: data.steps.length,
  };
}

// ── Plan de estudio ───────────────────────────────────────────

export const sortedSteps = (data) => [...data.steps].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

/** El primer paso del plan que aún no está hecho. */
export const nextStep = (data) => sortedSteps(data).find((s) => !s.doneAt) || null;

/** Lo que define un paso (sin tu progreso), para saber si cambió. */
const stepContent = (s) => JSON.stringify([s.order, s.book, s.unit, s.unitTitle, s.title, s.pages, s.minutes, s.instructions, s.audio, s.objectiveIds, s.conversation]);

/** Prefijo de los elementos que vienen de un plan («plan-b1-», «ref-b1-»…); null si los creaste tú. */
const planPrefix = (id) => id.match(/^([a-z]+-[a-z0-9]+-)/i)?.[1] || null;

/** ¿Sigue como vino del plan? (no lo hiciste ni lo editaste) */
const untouched = (key, item) => (key === 'steps' ? !item.doneAt && !item.sessionId : item.updatedAt === item.createdAt);

/**
 * Añade a tus datos lo que trae un archivo, sin borrar nada tuyo.
 * Lo que ya tienes se queda como está. Con un plan nuevo:
 * · los pasos y las fichas del plan se actualizan (se conserva lo
 *   que hiciste y lo que editaste);
 * · los pasos y fichas antiguos del mismo plan que ya no están en el
 *   archivo se quitan, salvo si los hiciste o los editaste.
 */
export function addMissing(current, incoming) {
  const data = clone(current);
  const added = {};
  const removed = { steps: 0, references: 0 };
  let updated = 0;
  for (const key of COLLECTION_KEYS) {
    added[key] = 0;
    const position = new Map(data[key].map((item, i) => [item.id, i]));
    for (const item of incoming[key]) {
      if (!position.has(item.id)) {
        data[key].push(clone(item));
        added[key] += 1;
      } else if (key === 'steps') {
        const i = position.get(item.id);
        const mine = data.steps[i];
        if (stepContent(mine) !== stepContent(item)) {
          data.steps[i] = { ...clone(item), doneAt: mine.doneAt, sessionId: mine.sessionId };
          updated += 1;
        }
      } else if (key === 'references' && planPrefix(item.id)) {
        const i = position.get(item.id);
        const mine = data.references[i];
        if (untouched(key, mine) && JSON.stringify([mine.notes, mine.page, mine.unit, mine.book]) !== JSON.stringify([item.notes, item.page, item.unit, item.book])) {
          data.references[i] = clone(item);
          updated += 1;
        }
      }
    }
  }
  for (const key of ['steps', 'references']) {
    const ids = new Set(incoming[key].map((x) => x.id));
    const prefixes = new Set(incoming[key].map((x) => planPrefix(x.id)).filter(Boolean));
    data[key] = data[key].filter((item) => {
      const prefix = planPrefix(item.id);
      if (!prefix || !prefixes.has(prefix) || ids.has(item.id) || !untouched(key, item)) return true;
      removed[key] += 1;
      return false;
    });
  }
  return { data, added, updated, removed };
}
