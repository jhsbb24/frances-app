// Pantalla «Sesión»: elegir 15, 30 o 40 minutos y un objetivo,
// referencia de Édito, borrador, primer intento, corrección
// (opcional, con ChatGPT), segundo intento, tarjetas para repasar
// y un cierre corto. Se puede pausar y retomar sin llenar todo.
import { DURATIONS, SESSION_PLAN, CHATGPT_URL, statusLabel } from '../config.js';
import { h, chips, groupLabel, textField, section, empty, linkButton, button, confirmDialog, toast, copyText, externalLink } from '../dom.js';
import { formatShort, formatDateTime, formatClock, relativeDay } from '../dates.js';
import { newSession, newObjective, emptyRef, objectiveTitle, refText, remainingMs, elapsedMs, isRunning, pauseTimer, currentPhase, sessionAsText, nowIso } from '../model.js';
import { buildPrompt, CORRECTION_TEMPLATE, objectiveValues, splitCorrections, plain } from '../registro.js';
import { refEditor, objectivePicker, NEW_OBJECTIVE, cardQuickForm, byCreatedDesc, byUpdatedDesc, short, clip, notFound, CARD_KINDS, openCardDialog, openStatusDialog, openBulkCardsDialog } from '../components.js';
import { createConversation } from './conversacion.js';

export function render(main, ctx, params) {
  const [sub, ...rest] = params;
  const data = ctx.sync.data;
  if (sub === 'nueva') return renderNew(main, ctx, rest);
  if (sub) {
    if (!data.sessions.some((s) => s.id === sub)) return notFound(main, 'No encuentro esta sesión. Quizá se borró en otro dispositivo.', '#/sesiones', 'Ver mis sesiones');
    return renderSession(main, ctx, sub);
  }
  const open = data.sessions.filter((s) => !s.closedAt);
  if (open.length === 1) return renderSession(main, ctx, open[0].id);
  if (open.length === 0) return renderNew(main, ctx, []);
  return renderList(main, ctx);
}

/** Todo el texto de una sesión, para buscar en ella. */
const sessionText = (s, data) =>
  plain([objectiveTitle(data, s.objectiveId), refText(s.ref), s.draft, s.attempt1, s.feedback, s.attempt2, s.closing.achievement, s.closing.difficulty, s.closing.nextStep].join(' '));

// ── Lista de sesiones ─────────────────────────────────────────

const listFilter = { text: '' };

export function renderList(main, ctx) {
  const data = ctx.sync.data;
  const results = h('div', {});
  const item = (s) =>
    h('a', { class: 'item link-item', href: `#/sesion/${s.id}` },
      h('div', { class: 'item-main' },
        h('p', { class: 'item-title', text: objectiveTitle(data, s.objectiveId) || 'Sesión sin objetivo' }),
        h('p', { class: 'item-meta', text: [`${formatShort(s.createdAt)} · ${s.minutes} min`, refText(s.ref)].filter(Boolean).join(' · ') }),
        s.closing.achievement ? h('p', { class: 'item-text', text: `Logro: ${short(s.closing.achievement, 120)}` }) : null,
      ),
    );
  const paint = () => {
    const words = plain(listFilter.text).split(/\s+/).filter(Boolean);
    const match = (s) => !words.length || words.every((w) => sessionText(s, data).includes(w));
    const open = data.sessions.filter((s) => !s.closedAt && match(s)).sort(byUpdatedDesc);
    const closed = data.sessions.filter((s) => s.closedAt && match(s)).sort(byCreatedDesc);
    results.replaceChildren();
    if (open.length) results.append(section('Abiertas', ...open.map(item)));
    const none = words.length ? 'Ninguna sesión contiene ese texto.' : 'Todavía no has cerrado ninguna sesión.';
    results.append(section('Anteriores', closed.length ? closed.slice(0, 80).map(item) : empty(none)));
  };
  const search = h('input', { type: 'search', id: 'sesiones-buscar', placeholder: 'Buscar en tus sesiones (texto, unidad, objetivo…)', autocomplete: 'off', 'aria-label': 'Buscar en tus sesiones' });
  search.value = listFilter.text;
  search.addEventListener('input', () => ((listFilter.text = search.value), paint()));
  main.append(h('h1', { text: 'Sesiones' }), linkButton('Nueva sesión', '#/sesion/nueva', 'primary big block'), h('div', { class: 'toolbar' }, search), results);
  paint();
}

// ── Nueva sesión ──────────────────────────────────────────────

/**
 * Formulario de sesión nueva. Se puede abrir ya rellenado:
 * #/sesion/nueva/objetivo/<id>  o  #/sesion/nueva/referencia/<id>
 */
function renderNew(main, ctx, params) {
  const data = ctx.sync.data;
  const [what, preId] = params;
  const last = [...data.sessions].sort(byCreatedDesc)[0];
  const usable = (id) => data.objectives.some((o) => o.id === id && o.status !== 'transferido');
  let objectiveId = last && usable(last.objectiveId) ? last.objectiveId : '';
  if (what === 'objetivo' && data.objectives.some((o) => o.id === preId)) objectiveId = preId;

  let ref = emptyRef();
  let refHint = '';
  const libRef = what === 'referencia' && data.references.find((r) => r.id === preId);
  if (libRef) {
    ref = { ...emptyRef(), refId: libRef.id, book: libRef.book, unit: libRef.unit, page: libRef.page };
  } else if (last && refText(last.ref)) {
    ref = { ...emptyRef(), refId: last.ref.refId, book: last.ref.book, unit: last.ref.unit, page: last.ref.page };
    refHint = 'Copiada de tu última sesión. Cámbiala si hoy trabajas otra parte.';
  }
  const form = { minutes: last?.minutes || 30, objectiveId, newObjective: null, ref };
  const errorEl = h('p', { class: 'form-error', role: 'alert' });

  const start = () => {
    if (form.objectiveId === NEW_OBJECTIVE && !form.newObjective?.title.trim()) {
      errorEl.textContent = 'Escribe el objetivo nuevo, o elige uno de la lista.';
      return;
    }
    const now = nowIso();
    let chosenId = form.objectiveId;
    let objective = null;
    if (chosenId === NEW_OBJECTIVE) {
      objective = newObjective({ title: form.newObjective.title.trim(), skill: form.newObjective.skill }, now);
      chosenId = objective.id;
    }
    const session = newSession({ minutes: form.minutes, objectiveId: chosenId, ref: form.ref }, now);
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
    section('Referencia de Édito', refHint ? h('p', { class: 'hint', text: refHint }) : null, refEditor(data, form.ref, (r) => (form.ref = r), { idPrefix: 'nueva' })),
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

  // Cronómetro y plan sugerido
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
    const plan = SESSION_PLAN[s.minutes] || SESSION_PLAN[30];
    const phaseItems = plan.map(([name, min]) => h('li', {}, h('span', { text: name }), h('small', { text: ` ${min} min` })));
    const phaseText = h('p', { class: 'hint' });
    const phases = h('div', { class: 'phases' }, h('ol', { 'aria-label': 'Plan sugerido de la sesión' }, phaseItems), phaseText);
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
      const phase = currentPhase(x.minutes, elapsedMs(x) / 60000);
      phaseItems.forEach((li, i) => {
        li.classList.toggle('done', i < phase.index);
        li.classList.toggle('current', i === phase.index);
      });
      phaseText.textContent = phase.name ? `Plan sugerido · ahora: ${phase.name.toLowerCase()} (hasta el minuto ${phase.endsAt}).` : 'Plan sugerido completado.';
    };
    paint();
    interval = setInterval(paint, 1000);
    main.append(box, phases);
  }

  // Objetivo y referencia
  const summary = h('summary', {}, h('span', { class: 'summary-title', text: 'Objetivo y referencia' }), h('span', { class: 'summary-meta', text: [objectiveTitle(data, s.objectiveId) || 'Sin objetivo', refText(s.ref)].filter(Boolean).join(' · ') }));
  const criterion = data.objectives.find((o) => o.id === s.objectiveId)?.description.trim();
  main.append(
    h('details', { class: 'card', open: !s.objectiveId && !refText(s.ref) },
      summary,
      objectivePicker(data, s.objectiveId, (v) => edit('objetivo', (x) => (x.objectiveId = v)), { id: 'ses-objetivo' }),
      criterion ? h('p', { class: 'hint', text: `Cómo sabré que lo logré: ${criterion}` }) : null,
      h('h3', { text: 'Referencia de Édito' }),
      refEditor(data, s.ref, (ref, what) => edit(what, (x) => (x.ref = ref)), { idPrefix: 'ses' }),
    ),
  );

  // Tarjetas de esta sesión (se usan también en la corrección)
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

  // Trabajo
  const area = (field, fieldLabel, hint, what, rows = 5) =>
    textField({ id: `ses-${field}`, label: fieldLabel, hint, value: s[field], multiline: true, rows, lang: 'fr', onInput: (v) => edit(what, (x) => (x[field] = v)) });

  const fromFeedback = button('', () => openBulkCardsDialog(ctx, { kind: 'error', items: splitCorrections(get().feedback), source: { type: 'session', id }, onDone: paintCards }), 'secondary');
  const paintFeedbackButton = () => {
    const n = splitCorrections(get()?.feedback || '').length;
    fromFeedback.hidden = n === 0;
    fromFeedback.textContent = `Crear tarjetas con ${n} ${n === 1 ? 'error' : 'errores'}…`;
  };
  const feedbackField = textField({
    id: 'ses-feedback',
    label: 'Correcciones recibidas',
    hint: 'Pega aquí la respuesta de ChatGPT (o tus propias notas). Las líneas «lo que escribí → forma correcta» se pueden convertir en tarjetas.',
    value: s.feedback,
    multiline: true,
    rows: 3,
    autocapitalize: 'none',
    onInput: (v) => {
      edit('correcciones', (x) => (x.feedback = v));
      paintFeedbackButton();
    },
  });
  paintFeedbackButton();

  const copyCorrection = async () => {
    const x = get();
    if (!x.attempt1.trim()) {
      toast('Escribe primero tu primer intento.');
      return;
    }
    const obj = ctx.sync.data.objectives.find((o) => o.id === x.objectiveId);
    const text = buildPrompt(CORRECTION_TEMPLATE, { ...objectiveValues(obj), referencia: refText(x.ref) || '(sin referencia)', texto: x.attempt1.trim() });
    toast((await copyText(text)) ? 'Consigna de corrección copiada' : 'No se pudo copiar.');
  };

  main.append(
    section(
      'Tu trabajo',
      area('draft', 'Borrador', 'Ideas, vocabulario, esquema. No tiene que estar bien.', 'borrador'),
      area('attempt1', 'Primer intento', 'Hazlo sin mirar la solución.', 'primer intento'),
      h('div', { class: 'subcard' },
        h('h3', { text: 'Corrección (opcional)' }),
        h('p', { class: 'hint', text: 'Copia una consigna con tu primer intento y pégala en ChatGPT: te señala los errores sin darte el texto hecho.' }),
        h('div', { class: 'row-actions' }, button('Copiar consigna de corrección', copyCorrection, 'secondary'), externalLink('Abrir ChatGPT', CHATGPT_URL, 'btn secondary')),
        feedbackField,
        fromFeedback,
      ),
      area('attempt2', 'Segundo intento', 'Después de revisar: corrige y vuelve a intentarlo.', 'segundo intento'),
    ),
  );

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
  const objective = data.objectives.find((o) => o.id === s.objectiveId);
  if (objective) {
    closing.append(
      h('div', { class: 'note' },
        h('p', { class: 'note-title', text: `${objective.title} · ${statusLabel(objective.status)}` }),
        h('p', { class: 'hint', text: '¿Esta sesión muestra un avance? Cambia el estado con el logro como motivo.' }),
        button('Cambiar estado del objetivo…', () => {
          const achievement = get().closing.achievement.trim();
          openStatusDialog(ctx, objective.id, {
            reason: `${label}.${achievement ? ` Logro: ${clip(achievement, 280)}` : ''}`,
            source: { type: 'session', id },
            onDone: () => ctx.rerender(),
          });
        }, 'secondary small'),
      ),
    );
  }
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
      button('Copiar como texto', async () => toast((await copyText(sessionAsText(get(), ctx.sync.data))) ? 'Sesión copiada como texto' : 'No se pudo copiar.'), 'secondary'),
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
