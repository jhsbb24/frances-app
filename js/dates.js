// ─────────────────────────────────────────────────────────────
// Fechas. Los días de repaso se guardan como texto "AAAA-MM-DD"
// calculado SIEMPRE en la zona horaria de config.js
// (America/Vancouver), aunque el dispositivo esté en otra zona.
// Sumar días a ese texto no depende del cambio de hora.
// ─────────────────────────────────────────────────────────────
import { TIME_ZONE } from './config.js';

const formatters = new Map();
function formatter(locale, options) {
  const key = locale + JSON.stringify(options);
  if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat(locale, options));
  return formatters.get(key);
}

/** Día ("AAAA-MM-DD") de un momento dado, en la zona horaria indicada. */
export function dayKey(date = new Date(), timeZone = TIME_ZONE) {
  const parts = formatter('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const p = {};
  for (const part of parts) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}`;
}

/** El día de hoy en Vancouver. */
export const today = (now = new Date()) => dayKey(now);

function keyToUTC(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Suma (o resta) días a un día "AAAA-MM-DD". */
export function addDays(key, n) {
  return new Date(keyToUTC(key) + n * 86400000).toISOString().slice(0, 10);
}

/** Cuántos días van de `from` a `to` (puede ser negativo). */
export function diffDays(from, to) {
  return Math.round((keyToUTC(to) - keyToUTC(from)) / 86400000);
}

/** "miércoles, 28 de octubre" */
export function formatDay(key, { weekday = true, year = false } = {}) {
  const options = { timeZone: 'UTC', day: 'numeric', month: 'long' };
  if (weekday) options.weekday = 'long';
  if (year) options.year = 'numeric';
  return formatter('es', options).format(new Date(keyToUTC(key) + 12 * 3600000));
}

/** "28 oct" a partir de una fecha ISO. */
export function formatShort(iso) {
  if (!iso) return '';
  return formatter('es', { timeZone: TIME_ZONE, day: 'numeric', month: 'short' }).format(new Date(iso));
}

/** "10:32" a partir de una fecha ISO. */
export function formatTime(iso) {
  if (!iso) return '';
  return formatter('es', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

/** "28 oct, 10:32" */
export function formatDateTime(iso) {
  if (!iso) return '';
  return `${formatShort(iso)}, ${formatTime(iso)}`;
}

/** "hoy", "mañana", "en 3 días", "hace 2 días"... */
export function relativeDay(key, todayKey = today()) {
  const n = diffDays(todayKey, key);
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  if (n > 1) return n < 7 ? `en ${n} días` : `el ${formatDay(key)}`;
  return `hace ${-n} días`;
}

/** "12:05" o "+02:10" si ya pasó el tiempo. */
export function formatClock(ms) {
  const over = ms < 0;
  const total = Math.floor(Math.abs(ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${over ? '+' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const capitalize = (text) => (text ? text[0].toUpperCase() + text.slice(1) : text);
