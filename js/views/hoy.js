// Pantalla «Hoy»: continuar la sesión abierta, empezar una nueva
// y ver los repasos pendientes de hoy. También: primeros pasos,
// tu siguiente paso y una sugerencia de qué objetivo practicar.
import { statusLabel } from '../config.js';
import { h, section, empty, linkButton, button } from '../dom.js';
import { today, formatDay, formatShort, formatClock, capitalize, relativeDay, diffDays } from '../dates.js';
import { dueCards, overdueCards } from '../review.js';
import { objectiveTitle, refText, remainingMs, isRunning } from '../model.js';
import { local, detectDevice } from '../local.js';
import { suggestObjective, latestNextStep } from '../insights.js';
import { byUpdatedDesc, byCreatedDesc, short } from '../components.js';
import { createConversation } from './conversacion.js';

const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

/** Lista de primeros pasos; desaparece cuando lo esencial está hecho o la ocultas. */
function firstSteps(ctx) {
  if (local.get('primerosPasosOcultos') === '1') return null;
  const data = ctx.sync.data;
  const phone = ['iPhone', 'iPad'].includes(detectDevice());
  const steps = [
    { done: ctx.sync.api.isConfigured(), text: 'Conectar la app con GitHub (token)', href: '#/ajustes' },
    phone ? { done: isInstalled(), text: 'Agregarla a la pantalla de inicio (Compartir → Agregar a inicio)', href: '#/ayuda', optional: true } : null,
    { done: data.objectives.length > 0, text: 'Crear tu primer objetivo', href: '#/objetivos' },
    { done: data.references.length > 0, text: 'Añadir una referencia de Édito a la Biblioteca', href: '#/biblioteca' },
    { done: data.sessions.length > 0, text: 'Hacer tu primera sesión', href: '#/sesion/nueva' },
    { done: data.conversations.some((c) => c.registro.trim()), text: 'Practicar con ChatGPT Voice y guardar el REGISTRO', href: '#/conversacion' },
  ].filter(Boolean);
  const done = steps.filter((s) => s.done).length;
  if (steps.every((s) => s.done || s.optional)) return null;
  const card = section(
    `Primeros pasos (${done} de ${steps.length})`,
    h('ol', { class: 'checklist' },
      steps.map((s) => h('li', { class: s.done ? 'done' : '' }, h('span', { class: 'check-mark', 'aria-hidden': 'true', text: s.done ? '✓' : '' }), s.done ? h('span', { text: s.text }) : h('a', { href: s.href, text: s.text }), s.done ? h('span', { class: 'visually-hidden', text: ' (hecho)' }) : null)),
    ),
    h('div', { class: 'row-actions' },
      h('a', { class: 'btn secondary small', href: '#/ayuda', text: 'Cómo usar la app' }),
      button('Ocultar esta lista', () => {
        local.set('primerosPasosOcultos', '1');
        ctx.rerender();
      }, 'secondary small'),
    ),
  );
  card.classList.add('notice');
  return card;
}

export function render(main, ctx) {
  const data = ctx.sync.data;
  const t = today();
  main.append(h('h1', { text: 'Hoy' }), h('p', { class: 'subtitle', text: capitalize(formatDay(t)) }));

  const steps = firstSteps(ctx);
  if (steps) main.append(steps);

  // ── Sesión ──
  const open = data.sessions.filter((s) => !s.closedAt).sort(byUpdatedDesc);
  const sesSection = section('Sesión de estudio');
  for (const s of open) {
    const rem = remainingMs(s);
    const state = rem <= 0 ? 'tiempo cumplido' : `quedan ${formatClock(rem)}${isRunning(s) ? '' : ' · en pausa'}`;
    sesSection.append(
      h(
        'div',
        { class: 'item' },
        h('div', { class: 'item-main' }, h('p', { class: 'item-title', text: objectiveTitle(data, s.objectiveId) || 'Sesión sin objetivo' }), h('p', { class: 'item-meta', text: [`${formatShort(s.createdAt)} · ${s.minutes} min · ${state}`, refText(s.ref)].filter(Boolean).join(' · ') })),
        linkButton('Continuar', `#/sesion/${s.id}`, 'primary'),
      ),
    );
  }
  sesSection.append(linkButton(open.length ? 'Empezar otra sesión' : 'Empezar una sesión nueva', '#/sesion/nueva', open.length ? 'secondary block' : 'primary big block'));

  const next = latestNextStep(data);
  if (next) {
    sesSection.append(
      h('div', { class: 'note' },
        h('p', { class: 'note-title', text: `Tu siguiente paso (${next.kind} del ${formatShort(next.at)})` }),
        h('p', { class: 'pre', text: next.text }),
        h('a', { class: 'link', href: next.href, text: `Ver la ${next.kind}` }),
      ),
    );
  }

  const suggestion = suggestObjective(data, t);
  if (suggestion) {
    const { objective, days } = suggestion;
    const when = days === null ? 'Todavía no lo has practicado.' : days === 0 ? 'Lo practicaste hoy.' : days === 1 ? 'Lo practicaste ayer.' : `Lo practicaste por última vez hace ${days} días.`;
    sesSection.append(
      h('div', { class: 'note' },
        h('p', { class: 'note-title', text: 'Sugerencia de objetivo' }),
        h('p', {}, h('strong', { text: objective.title || 'Objetivo sin título' }), ` · ${statusLabel(objective.status)}`),
        h('p', { class: 'hint', text: when }),
        h('div', { class: 'row-actions' },
          linkButton('Sesión con este objetivo', `#/sesion/nueva/objetivo/${objective.id}`, 'secondary small'),
          button('Conversación', () => ctx.go(`#/conversacion/${createConversation(ctx, { objectiveId: objective.id })}`), 'secondary small'),
        ),
      ),
    );
  }
  main.append(sesSection);

  // ── Conversaciones esperando el registro ──
  const waiting = data.conversations.filter((c) => !c.registro.trim() && diffDays(today(new Date(c.createdAt)), t) <= 7).sort(byCreatedDesc);
  if (waiting.length) {
    const conv = section('Conversación esperando el REGISTRO');
    for (const c of waiting.slice(0, 3)) {
      conv.append(
        h(
          'div',
          { class: 'item' },
          h('div', { class: 'item-main' }, h('p', { class: 'item-title', text: objectiveTitle(data, c.objectiveId) || 'Conversación' }), h('p', { class: 'item-meta', text: `${formatShort(c.createdAt)}${c.role ? ` · ${short(c.role, 50)}` : ''}` })),
          linkButton('Pegar registro', `#/conversacion/${c.id}`, 'primary'),
        ),
      );
    }
    main.append(conv);
  } else {
    main.append(
      section(
        'Conversación',
        h('p', { text: 'Prepara una consigna para practicar con ChatGPT Voice.' }),
        button('Preparar una conversación', () => ctx.go(`#/conversacion/${createConversation(ctx)}`), 'secondary block'),
      ),
    );
  }

  // ── Repasos ──
  const due = dueCards(data.cards, t);
  const overdue = overdueCards(data.cards, t);
  const rev = section('Repasos de hoy');
  if (!due.length) {
    const upcoming = data.cards.filter((c) => !c.archived && c.due > t).sort((a, b) => a.due.localeCompare(b.due))[0];
    rev.append(empty('No tienes repasos pendientes hoy.'));
    if (upcoming) {
      const count = data.cards.filter((c) => !c.archived && c.due === upcoming.due).length;
      rev.append(h('p', { class: 'hint', text: `Próximo repaso: ${relativeDay(upcoming.due, t)} (${count} ${count === 1 ? 'tarjeta' : 'tarjetas'}).` }));
    }
  } else {
    rev.append(h('p', { class: 'big-number' }, h('strong', { text: String(due.length) }), due.length === 1 ? ' tarjeta para hoy' : ' tarjetas para hoy'));
    const list = h('ul', { class: 'plain-list' });
    for (const c of due.slice(0, 5)) list.append(h('li', { text: c.prompt || c.answer }));
    if (due.length > 5) list.append(h('li', { class: 'hint', text: `y ${due.length - 5} más…` }));
    rev.append(list, linkButton('Empezar repaso', '#/repaso/practicar', 'primary big block'));
    if (overdue.length) {
      rev.append(h('p', { class: 'hint', text: `${overdue.length} ${overdue.length === 1 ? 'es' : 'son'} de días anteriores. No hace falta hacerlas todas hoy: puedes reprogramarlas en Repaso.` }), linkButton('Reprogramar', '#/repaso', 'secondary'));
    }
  }
  main.append(rev);
}
