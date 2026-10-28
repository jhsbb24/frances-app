// Pantalla «Hoy»: continuar la sesión abierta, empezar una nueva
// y ver los repasos pendientes de hoy.
import { h, section, empty, linkButton } from '../dom.js';
import { today, formatDay, formatShort, formatClock, capitalize, relativeDay, diffDays } from '../dates.js';
import { dueCards, overdueCards } from '../review.js';
import { objectiveTitle, refText, remainingMs, isRunning } from '../model.js';
import { byUpdatedDesc, byCreatedDesc, short } from '../components.js';
import { createConversation } from './conversacion.js';

export function render(main, ctx) {
  const data = ctx.sync.data;
  const t = today();
  main.append(h('h1', { text: 'Hoy' }), h('p', { class: 'subtitle', text: capitalize(formatDay(t)) }));

  if (!ctx.sync.api.isConfigured()) {
    main.append(
      section(
        'Conecta la app con GitHub',
        h('p', { text: 'Tus datos se guardan por ahora solo en este navegador. Pon tu token en Ajustes para guardarlos en tu repositorio privado.' }),
        linkButton('Ir a Ajustes', '#/ajustes', 'primary'),
      ),
    );
  }

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
  const lastClosed = data.sessions.filter((s) => s.closedAt && s.closing.nextStep.trim()).sort((a, b) => b.closedAt.localeCompare(a.closedAt))[0];
  if (lastClosed) {
    sesSection.append(h('div', { class: 'note' }, h('p', { class: 'note-title', text: `Tu siguiente paso (sesión del ${formatShort(lastClosed.createdAt)})` }), h('p', { class: 'pre', text: lastClosed.closing.nextStep })));
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
        h('button', { type: 'button', class: 'btn secondary block', text: 'Preparar una conversación', on: { click: () => ctx.go(`#/conversacion/${createConversation(ctx)}`) } }),
      ),
    );
  }

  // ── Repasos ──
  const due = dueCards(data.cards, t);
  const overdue = overdueCards(data.cards, t);
  const rev = section('Repasos de hoy');
  if (!due.length) {
    const next = data.cards.filter((c) => !c.archived && c.due > t).sort((a, b) => a.due.localeCompare(b.due))[0];
    rev.append(empty('No tienes repasos pendientes hoy.'));
    if (next) {
      const count = data.cards.filter((c) => !c.archived && c.due === next.due).length;
      rev.append(h('p', { class: 'hint', text: `Próximo repaso: ${relativeDay(next.due, t)} (${count} ${count === 1 ? 'tarjeta' : 'tarjetas'}).` }));
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
