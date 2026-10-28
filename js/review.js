// ─────────────────────────────────────────────────────────────
// Repaso espaciado.
// Intervalos: 1, 3, 7 y 14 días (config.js).
//  · «Sin ayuda»   → avanza al siguiente intervalo.
//  · «Con ayuda»   → no avanza; vuelve a salir hoy, al final.
//                    Si hoy ya la repetiste con ayuda, vuelve mañana.
//  · «No lo logré» → vuelve mañana y empieza otra vez por 1 día.
// Todas las fechas son días "AAAA-MM-DD" de Vancouver.
// ─────────────────────────────────────────────────────────────
import { REVIEW_INTERVALS } from './config.js';
import { addDays } from './dates.js';

const LAST = REVIEW_INTERVALS.length - 1;
const clampStep = (step) => Math.min(Math.max(Number.isInteger(step) ? step : 0, 0), LAST);

export const RESULTS = [
  { id: 'sin', label: 'Sin ayuda' },
  { id: 'con', label: 'Con ayuda' },
  { id: 'no', label: 'No lo logré' },
];

/** Primer repaso de una tarjeta nueva. */
export const firstDue = (todayKey) => addDays(todayKey, REVIEW_INTERVALS[0]);

export const intervalDays = (card) => REVIEW_INTERVALS[clampStep(card.step)];

const byDue = (a, b) => a.due.localeCompare(b.due) || (a.createdAt || '').localeCompare(b.createdAt || '');

/** Tarjetas que tocan hoy (incluye las atrasadas), de la más antigua a la más nueva. */
export function dueCards(cards, todayKey) {
  return cards.filter((c) => !c.archived && c.due && c.due <= todayKey).sort(byDue);
}

/** Tarjetas de días anteriores que no se repasaron. */
export function overdueCards(cards, todayKey) {
  return cards.filter((c) => !c.archived && c.due && c.due < todayKey).sort(byDue);
}

/**
 * Calcula el nuevo calendario de una tarjeta según la respuesta,
 * sin modificarla. `again` indica que vuelve a salir hoy.
 */
export function schedule(card, result, todayKey) {
  const step = clampStep(card.step);
  if (result === 'sin') {
    const next = Math.min(step + 1, LAST);
    return { step: next, due: addDays(todayKey, REVIEW_INTERVALS[next]), repeatToday: '', again: false };
  }
  if (result === 'con') {
    if (card.repeatToday === todayKey) {
      return { step, due: addDays(todayKey, 1), repeatToday: '', again: false };
    }
    return { step, due: todayKey, repeatToday: todayKey, again: true };
  }
  if (result === 'no') {
    return { step: 0, due: addDays(todayKey, REVIEW_INTERVALS[0]), repeatToday: '', again: false };
  }
  throw new Error(`Respuesta desconocida: ${result}`);
}

/** Aplica la respuesta a la tarjeta y la anota en su historial. */
export function applyAnswer(card, result, todayKey, nowIso) {
  const next = schedule(card, result, todayKey);
  card.step = next.step;
  card.due = next.due;
  card.repeatToday = next.repeatToday;
  card.updatedAt = nowIso;
  card.reviews = [...(card.reviews || []), { at: nowIso, day: todayKey, result }].slice(-60);
  return next;
}

/**
 * Después de una pausa: reparte las tarjetas atrasadas a partir de hoy,
 * sin pasar de `perDay` tarjetas por día (cuenta también las que ya
 * estaban programadas). Si `restart` es true, vuelven al intervalo de 1 día.
 * Devuelve un Map id → { due, step } y no modifica nada.
 */
export function planReschedule(cards, todayKey, perDay, restart = false) {
  const active = cards.filter((c) => !c.archived && c.due);
  const load = new Map();
  for (const c of active) if (c.due >= todayKey) load.set(c.due, (load.get(c.due) || 0) + 1);
  const plan = new Map();
  let day = todayKey;
  for (const c of overdueCards(active, todayKey)) {
    while ((load.get(day) || 0) >= perDay) day = addDays(day, 1);
    load.set(day, (load.get(day) || 0) + 1);
    plan.set(c.id, { due: day, step: restart ? 0 : clampStep(c.step) });
  }
  return plan;
}
