// Pantalla «Sesión»: elegir 15, 30 o 40 minutos y un objetivo,
// referencia de Édito, borrador, primer y segundo intento,
// tarjetas para repasar y un cierre corto. Se puede pausar y
// retomar sin llenar todo.
import { DURATIONS } from '../config.js';
import { h, chips, groupLabel, textField, section, empty, linkButton, button, confirmDialog, toast } from '../dom.js';
import { formatShort, formatDateTime, formatClock, relativeDay } from '../dates.js';
import { newSession, newObjective, emptyRef, objectiveTitle, refText, remainingMs, isRunning, pauseTimer, nowIso } from '../model.js';
import { refEditor, objectivePicker, NEW_OBJECTIVE, cardQuickForm, byCreatedDesc, byUpdatedDesc, short, notFound, CARD_KINDS, openCardDialog } from '../components.js';
import { createConversation } from './conversacion.js';

export function render(main, ctx, params) {
  const [sub] = params;
  const data = ctx.sync.data;
  if (sub === 'nueva') return renderNew(main, ctx);
  if (sub) {
    if (!data.sessions.some((s) => s.id === sub)) return notFound(main, 'No encuentro esta sesión. Quizá se borró en otro dispositivo.', '#/sesiones', 'Ver mis sesiones');
    return renderSession(main, ctx, sub);
  }
  const open = data.sessions.filter((s) => !s.closedAt);
  if (open.length === 1) return renderSession(main, ctx, open[0].id);
  if (open.length === 0) return renderNew(main, ctx);
  return renderList(main, ctx);
}

// ── Lista de sesiones ─────────────────────────────────────────

export function renderList(main, ctx) {
  const data = ctx.sync.data;
  main.append(h('h1', { text: 'Sesiones' }), linkButton('Nueva sesión', '#/sesion/nueva', 'primary big block'));
  const open = data.sessions.filter((s) => !s.closedAt).sort(byUpdatedDesc);
  const closed = data.sessions.filter((s) => s.closedAt).sort(byCreatedDesc);
  const item = (s) =>
    h('a', { class: 'item link-item', href: `#/sesion/${s.id}` },
      h('div', { class: 'item-main' },
        h('p', { class: 'item-title', text: objectiveTitle(data, s.objectiveId) || 'Sesión sin objetivo' }),
        h('p', { class: 'item-meta', text: [`${formatShort(s.createdAt)} · ${s.minutes} min`, refText(s.ref)].filter(Boolean).join(' · ') }),
        s.closing.achievement ? h('p', { class: 'item-text', text: `Logro: ${short(s.closing.achievement, 120)}` }) : null,
      ),
    );
  if (open.length) main.append(section('Abiertas', ...open.map(item)));
  main.append(section('Anteriores', closed.length ? closed.slice(0, 60).map(item) : empty('Todavía no has cerrado ninguna sesión.')));
}

// ── Nueva sesión ──────────────────────────────────────────────

function renderNew(main, ctx) {
  const data = ctx.sync.data;
  const last = [...data.sessions].sort(byCreatedDesc)[0];
  const lastObjective = last && data.objectives.some((o) => o.id === last.objectiveId && o.status !== 'transferido') ? last.objectiveId : '';
  const form = { minutes: last?.minutes || 30, objectiveId: lastObjective, newObjective: null, ref: emptyRef() };
  const errorEl = h('p', { class: 'form-error', role: 'alert' });

  const start = () => {
    if (form.objectiveId === NEW_OBJECTIVE && !form.newObjective?.title.trim()) {
      errorEl.textContent = 'Escribe el objetivo nuevo, o elige uno de la lista.';
      return;
    }
    const now = nowIso();
    let objectiveId = form.objectiveId;
    let objective = null;
    if (objectiveId === NEW_OBJECTIVE) {
      objective = newObjective({ title: form.newObjective.title.trim(), skill: form.newObjective.skill }, now);
      objectiveId = objective.id;
    }
    const session = newSession({ minutes: form.minutes, objectiveId, ref: form.ref }, now);
    ctx.sync.update(`Sesión del ${formatShort(now)}: empezar (${form.minutes} min)`, (d) => {
      if (objective) d.objectives.push(objective);
      d.sessions.push(session);
    });
    ctx.go(`#/sesion/${session.id}`);
  };

  main.append(
    h('h1', { text: 'Nueva sesión' }),
    section(
      null,
      groupLabel('¿Cuánto tiempo?', chips(DURATIONS.map((m) => ({ value: m, label: `${m} min` })), form.minutes, (v) => (form.minutes = v), { label: 'Duración' })),
      objectivePicker(data, form.objectiveId, (v, draft) => ((form.objectiveId = v), (form.newObjective = draft)), { id: 'nueva-objetivo', allowNew: true }),
    ),
    section('Referencia de Édito', refEditor(data, form.ref, (ref) => (form.ref = ref), { idPrefix: 'nueva' })),
    errorEl,
    button('Empezar', start, 'primary big block'),
  );
}

// ── Sesión abierta o cerrada ──────────────────────────────────

function renderSession(main, ctx, id) {
  const data = ctx.sync.data;
  const get = () => ctx.sync.data.sessions.find((s) => s.id === id);
  const s = get();
  const label = `Sesión del ${formatShort(s.createdAt)}`;
  const edit = (what, fn) =>
    ctx.sync.update(`${label}: ${what}`, (d) => {
      const x = d.sessions.find((y) => y.id === id);
      if (x) {
        fn(x, d);
        x.updatedAt = nowIso();
      }
    });

  main.append(
    h('div', { class: 'title-row' },
      h('h1', { text: 'Sesión' }),
      h('span', { class: `badge ${s.closedAt ? '' : 'ok'}`, text: s.closedAt ? 'Cerrada' : 'Abierta' }),
    ),
    h('p', { class: 'subtitle', text: `${formatShort(s.createdAt)} · ${s.minutes} minutos` }),
  );

  // Cronómetro
  let interval = null;
  if (!s.closedAt) {
    const time = h('div', { class: 'timer-time', role: 'timer', 'aria-label': 'Tiempo restante' });
    const state = h('p', { class: 'timer-state' });
    const toggle = button('', () => {
      edit(isRunning(get()) ? 'pausar' : 'reanudar', (x) => {
        if (isRunning(x)) pauseTimer(x);
        else x.timer.runningSince = nowIso();
      });
      paint();
    }, 'secondary');
    const box = h('div', { class: 'timer' }, h('div', {}, time, state), toggle);
    const paint = () => {
      const x = get();
      if (!x) return;
      const rem = remainingMs(x);
      time.textContent = formatClock(rem);
      const running = isRunning(x);
      state.textContent = rem <= 0 ? 'Tiempo cumplido. Puedes cerrar la sesión o seguir un poco.' : running ? 'En marcha' : 'En pausa';
      toggle.textContent = running ? 'Pausar' : 'Reanudar';
      box.classList.toggle('done', rem <= 0);
      box.classList.toggle('paused', !running);
    };
    paint();
    interval = setInterval(paint, 1000);
    main.append(box);
  }

  // Objetivo y referencia
  const summary = h('summary', {}, h('span', { class: 'summary-title', text: 'Objetivo y referencia' }), h('span', { class: 'summary-meta', text: [objectiveTitle(data, s.objectiveId) || 'Sin objetivo', refText(s.ref)].filter(Boolean).join(' · ') }));
  main.append(
    h('details', { class: 'card', open: !s.objectiveId && !refText(s.ref) },
      summary,
      objectivePicker(data, s.objectiveId, (v) => edit('objetivo', (x) => (x.objectiveId = v)), { id: 'ses-objetivo' }),
      h('h3', { text: 'Referencia de Édito' }),
      refEditor(data, s.ref, (ref, what) => edit(what, (x) => (x.ref = ref)), { idPrefix: 'ses' }),
    ),
  );

  // Trabajo
  const area = (field, fieldLabel, hint, what) =>
    textField({ id: `ses-${field}`, label: fieldLabel, hint, value: s[field], multiline: true, rows: 5, lang: 'fr', onInput: (v) => edit(what, (x) => (x[field] = v)) });
  main.append(
    section(
      'Tu trabajo',
      area('draft', 'Borrador', 'Ideas, vocabulario, esquema. No tiene que estar bien.', 'borrador'),
      area('attempt1', 'Primer intento', 'Hazlo sin mirar la solución.', 'primer intento'),
      area('attempt2', 'Segundo intento', 'Después de revisar: corrige y vuelve a intentarlo.', 'segundo intento'),
    ),
  );

  // Tarjetas de esta sesión
  const cardList = h('ul', { class: 'card-list' });
  const paintCards = () => {
    const cards = ctx.sync.data.cards.filter((c) => c.source.type === 'session' && c.source.id === id);
    cardList.replaceChildren(
      ...cards.map((c) =>
        h('li', {},
          h('button', { type: 'button', class: 'linklike', on: { click: () => openCardDialog(ctx, { cardId: c.id, onDone: paintCards }) } },
            h('span', { class: 'badge', text: CARD_KINDS[c.kind].label }), ' ', c.answer, c.prompt ? ` — ${c.prompt}` : ''),
          h('span', { class: 'hint', text: ` · repaso ${relativeDay(c.due)}` }),
        ),
      ),
    );
  };
  paintCards();
  main.append(
    section(
      'Para repasar',
      h('p', { class: 'hint', text: 'Guarda expresiones o errores de esta sesión. Aparecerán en Repaso a partir de mañana.' }),
      cardList,
      cardQuickForm(ctx, { type: 'session', id }, paintCards, 'ses-tarjeta'),
    ),
  );

  // Cierre
  const closingField = (field, fieldLabel, placeholder) =>
    textField({ id: `ses-cierre-${field}`, label: fieldLabel, placeholder, value: s.closing[field], multiline: true, rows: 2, onInput: (v) => edit(`cierre (${fieldLabel.toLowerCase()})`, (x) => (x.closing[field] = v)) });
  const closing = section(
    'Cierre',
    h('p', { class: 'hint', text: 'Tres frases cortas bastan. Puedes dejarlo para después.' }),
    closingField('achievement', 'Logro', 'Qué conseguiste hoy'),
    closingField('difficulty', 'Dificultad', 'Qué te costó'),
    closingField('nextStep', 'Siguiente paso', 'Qué harás la próxima vez'),
  );
  if (!s.closedAt) {
    closing.append(
      h('div', { class: 'row-actions' },
        button('Terminar sesión', () => {
          edit('terminar', (x) => {
            pauseTimer(x);
            x.closedAt = nowIso();
          });
          toast('Sesión terminada');
          ctx.go('#/hoy');
        }, 'primary'),
        button('Pausar y salir', () => {
          if (isRunning(get())) edit('pausar', (x) => pauseTimer(x));
          ctx.go('#/hoy');
        }, 'secondary'),
      ),
    );
  } else {
    closing.append(
      h('p', { class: 'hint', text: `Cerrada el ${formatDateTime(s.closedAt)}.` }),
      button('Reabrir sesión', () => {
        edit('reabrir', (x) => (x.closedAt = null));
        ctx.rerender();
      }, 'secondary'),
    );
  }
  main.append(closing);

  main.append(
    h('div', { class: 'row-actions spaced' },
      button('Preparar conversación con este objetivo', () => ctx.go(`#/conversacion/${createConversation(ctx, { objectiveId: s.objectiveId, ref: s.ref, sessionId: id })}`), 'secondary'),
      linkButton('Todas las sesiones', '#/sesiones', 'secondary'),
      button('Eliminar sesión', async () => {
        if (await confirmDialog('Se eliminará esta sesión con todo lo que escribiste. (Seguirá en el historial de GitHub.)', { title: '¿Eliminar la sesión?', confirmLabel: 'Eliminar', danger: true })) {
          ctx.sync.update(`${label}: eliminar`, (d) => (d.sessions = d.sessions.filter((x) => x.id !== id)));
          toast('Sesión eliminada');
          ctx.go('#/hoy');
        }
      }, 'danger'),
    ),
  );

  return () => clearInterval(interval);
}

