// Pantalla «Plan»: tu plan de estudio paso a paso (unidad, página,
// actividades y audio). Cada paso se hace en una sesión; al terminar
// la sesión, el paso queda hecho y el plan pasa al siguiente.
// El contenido del plan se carga con Ajustes → Importar JSON.
import { stepType, statusLabel } from '../config.js';
import { h, section, button, linkButton, toast } from '../dom.js';
import { formatDateTime } from '../dates.js';
import { sortedSteps, nextStep, nowIso } from '../model.js';
import { notFound } from '../components.js';
import { createConversation } from './conversacion.js';

export const stepLabel = (step) => [`Édito ${step.book}`, step.unit && `Unidad ${step.unit}`, step.pages && `p. ${step.pages}`].filter(Boolean).join(' · ');

/** La sesión abierta que está trabajando este paso (si hay). */
export const openSessionFor = (data, stepId) => data.sessions.find((s) => s.stepId === stepId && !s.closedAt) || null;

/** Un paso solo de conversación no necesita sesión. */
const onlyConversation = (step) => Boolean(step.conversation) && step.instructions.every((i) => ['conversacion', 'nota', 'extra'].includes(i.type));

/** Lista de tareas de un paso. Con onToggle, cada tarea se puede marcar. */
export function instructionList(step, { checks = [], onToggle } = {}) {
  return h('ol', { class: 'tasks' },
    step.instructions.map((task, i) => {
      const label = h('span', { class: `task-type type-${task.type}`, text: stepType(task.type).label });
      const text = h('span', { class: 'task-text', text: task.text });
      if (!onToggle) return h('li', {}, label, ' ', text);
      const id = `tarea-${step.id}-${i}`;
      const box = h('input', { type: 'checkbox', id, checked: checks.includes(i) });
      box.addEventListener('change', () => onToggle(i, box.checked));
      return h('li', { class: 'task-check' }, box, h('label', { for: id }, label, ' ', text));
    }),
  );
}

/** «Cómo trabajar cada tarea»: el método de los tipos de tarea del paso. */
export function methodBox(step) {
  const types = [...new Set(step.instructions.map((i) => i.type))].map(stepType).filter((t) => t.method);
  if (!types.length) return null;
  return h('details', { class: 'method' },
    h('summary', { text: 'Cómo trabajar cada tarea' }),
    h('dl', { class: 'fields' }, types.map((t) => [h('dt', { text: t.label }), h('dd', { text: t.method })])),
  );
}

export function audioNote(step) {
  return step.audio ? h('p', { class: 'audio-note' }, h('strong', { text: 'Audio: ' }), step.audio) : null;
}

/** Marca un paso como hecho (o pendiente). */
export function setStepDone(ctx, stepId, done, sessionId = '') {
  ctx.sync.update(`Plan: ${done ? 'paso hecho' : 'paso pendiente'}`, (d) => {
    const step = d.steps.find((x) => x.id === stepId);
    if (!step) return;
    step.doneAt = done ? step.doneAt || nowIso() : null;
    if (sessionId) step.sessionId = sessionId;
    step.updatedAt = nowIso();
  });
}

/** Prepara una conversación con el rol y las expresiones del paso. */
export function conversationFromStep(ctx, step) {
  const data = ctx.sync.data;
  const objectiveId = step.objectiveIds.find((id) => data.objectives.some((o) => o.id === id)) || '';
  const session = openSessionFor(data, step.id);
  const ref = { book: step.book, unit: step.unit, page: step.pages, note: step.title };
  return createConversation(ctx, { objectiveId, ref, sessionId: session?.id || '' }, { role: step.conversation?.role || '', expr1: step.conversation?.expr1 || '', expr2: step.conversation?.expr2 || '' });
}

/** Botones para empezar o seguir un paso. */
export function stepActions(ctx, step, { compact = false } = {}) {
  const data = ctx.sync.data;
  const session = openSessionFor(data, step.id);
  const size = compact ? '' : ' big';
  const actions = h('div', { class: 'row-actions' });
  if (!onlyConversation(step)) {
    actions.append(session ? linkButton('Continuar la sesión', `#/sesion/${session.id}`, `primary${size}`) : linkButton('Empezar este paso', `#/sesion/nueva/paso/${step.id}`, `primary${size}`));
  }
  if (step.conversation) {
    actions.append(button('Preparar conversación', () => ctx.go(`#/conversacion/${conversationFromStep(ctx, step)}`), onlyConversation(step) ? `primary${size}` : 'secondary'));
  }
  if (onlyConversation(step) && !step.doneAt) {
    actions.append(button('Marcar como hecho', () => {
      setStepDone(ctx, step.id, true);
      toast('Paso hecho');
      ctx.rerender();
    }, 'secondary'));
  }
  return actions;
}

/** Tarjeta del próximo paso (se usa en Hoy y en el Plan). */
export function nextStepCard(ctx, { title = 'Tu próximo paso' } = {}) {
  const data = ctx.sync.data;
  const steps = sortedSteps(data);
  const next = nextStep(data);
  const done = steps.filter((s) => s.doneAt).length;
  if (!next) {
    return section(title, h('p', { text: `¡Terminaste los ${steps.length} pasos del plan!` }), linkButton('Ver el plan', '#/plan', 'secondary'));
  }
  return section(
    title,
    h('p', { class: 'item-meta', text: `Paso ${done + 1} de ${steps.length} · ${stepLabel(next)}${next.unitTitle ? ` · ${next.unitTitle}` : ''}` }),
    h('p', { class: 'item-title', text: next.title }),
    h('ul', { class: 'plain-list compact' }, next.instructions.slice(0, 3).map((t) => h('li', {}, h('strong', { text: `${stepType(t.type).label}: ` }), t.text))),
    next.instructions.length > 3 ? h('p', { class: 'hint', text: `y ${next.instructions.length - 3} tareas más…` }) : null,
    audioNote(next),
    stepActions(ctx, next),
    h('a', { class: 'link', href: `#/plan/${next.id}`, text: 'Ver el paso completo' }),
  );
}

export function render(main, ctx, params) {
  const [id] = params;
  if (id) {
    if (!ctx.sync.data.steps.some((s) => s.id === id)) return notFound(main, 'No encuentro este paso del plan.', '#/plan', 'Ver el plan');
    return renderStep(main, ctx, id);
  }
  return renderPlan(main, ctx);
}

// ── El plan entero ────────────────────────────────────────────

function renderPlan(main, ctx) {
  const data = ctx.sync.data;
  main.append(h('h1', { text: 'Plan de estudio' }));
  if (!data.steps.length) {
    main.append(
      section(
        'Todavía no tienes un plan',
        h('p', { text: 'El plan te dice cada día qué unidad, página, actividades y audio trabajar en Édito.' }),
        h('p', { text: 'Para cargarlo: Ajustes → Tus datos → Importar JSON → elige el archivo del plan → «Añadir lo nuevo». No se borra nada de lo que ya tienes.' }),
        linkButton('Ir a Ajustes', '#/ajustes', 'primary'),
      ),
    );
    return;
  }
  const steps = sortedSteps(data);
  const next = nextStep(data);
  main.append(h('p', { class: 'subtitle', text: `${steps.filter((s) => s.doneAt).length} de ${steps.length} pasos hechos.` }), nextStepCard(ctx));

  // Agrupar por libro y unidad, en el orden del plan.
  const groups = [];
  for (const step of steps) {
    const key = `${step.book}·${step.unit}`;
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) groups.push((group = { key, book: step.book, unit: step.unit, title: step.unitTitle, steps: [] }));
    group.steps.push(step);
  }
  for (const g of groups) {
    const done = g.steps.filter((s) => s.doneAt).length;
    const details = h('details', { class: 'card unit', open: g.steps.includes(next) },
      h('summary', {},
        h('span', { class: 'summary-title', text: `Édito ${g.book} · Unidad ${g.unit}${g.title ? ` — ${g.title}` : ''}` }),
        h('span', { class: 'summary-meta', text: done === g.steps.length ? `Terminada (${done} pasos)` : `${done} de ${g.steps.length} pasos hechos` }),
      ),
      h('ol', { class: 'step-list' },
        g.steps.map((s) =>
          h('li', { class: `${s.doneAt ? 'done' : ''}${s === next ? ' next' : ''}`.trim() },
            h('a', { href: `#/plan/${s.id}` },
              h('span', { class: 'check-mark', 'aria-hidden': 'true', text: s.doneAt ? '✓' : '' }),
              h('span', { class: 'step-name' }, h('span', { text: s.title }), h('small', { text: s.pages ? ` · p. ${s.pages}` : '' })),
              s.doneAt ? h('span', { class: 'visually-hidden', text: ' (hecho)' }) : s === next ? h('span', { class: 'badge ok', text: 'Siguiente' }) : null,
            ),
          ),
        ),
      ),
    );
    main.append(details);
  }
}

// ── Un paso ───────────────────────────────────────────────────

function renderStep(main, ctx, id) {
  const data = ctx.sync.data;
  const steps = sortedSteps(data);
  const index = steps.findIndex((s) => s.id === id);
  const step = steps[index];
  const objectives = step.objectiveIds.map((oid) => data.objectives.find((o) => o.id === oid)).filter(Boolean);

  main.append(
    h('a', { class: 'back', href: '#/plan', text: '‹ Plan' }),
    h('div', { class: 'title-row' }, h('h1', { text: step.title }), step.doneAt ? h('span', { class: 'badge ok', text: 'Hecho' }) : null),
    h('p', { class: 'subtitle', text: `${stepLabel(step)}${step.unitTitle ? ` · ${step.unitTitle}` : ''} · unos ${step.minutes} min` }),
    section('Qué hacer', instructionList(step), audioNote(step), methodBox(step)),
  );
  if (objectives.length) {
    main.append(section('Objetivos que trabajas', h('ul', { class: 'plain-list' }, objectives.map((o) => h('li', {}, h('a', { class: 'link', href: `#/objetivos/${o.id}`, text: o.title }), ` · ${statusLabel(o.status)}`)))));
  }
  if (step.conversation) {
    main.append(section('Conversación con ChatGPT', h('p', { text: `Rol: ${step.conversation.role}` }), h('p', { text: `Expresiones: ${[step.conversation.expr1, step.conversation.expr2].filter(Boolean).join(' · ')}` })));
  }
  const status = step.doneAt
    ? h('p', { class: 'hint', text: `Hecho el ${formatDateTime(step.doneAt)}.` })
    : h('p', { class: 'hint', text: 'Al terminar la sesión de este paso, quedará marcado como hecho.' });
  main.append(
    stepActions(ctx, step),
    status,
    h('div', { class: 'row-actions' },
      button(step.doneAt ? 'Marcar como pendiente' : 'Marcar como hecho', () => {
        setStepDone(ctx, id, !step.doneAt);
        toast(step.doneAt ? 'Paso pendiente' : 'Paso hecho');
        ctx.rerender();
      }, 'secondary small'),
      step.sessionId && data.sessions.some((s) => s.id === step.sessionId) ? linkButton('Ver la sesión', `#/sesion/${step.sessionId}`, 'secondary small') : null,
    ),
    h('div', { class: 'row-actions spaced' },
      index > 0 ? linkButton('‹ Paso anterior', `#/plan/${steps[index - 1].id}`, 'secondary small') : null,
      index < steps.length - 1 ? linkButton('Paso siguiente ›', `#/plan/${steps[index + 1].id}`, 'secondary small') : null,
    ),
  );
}
