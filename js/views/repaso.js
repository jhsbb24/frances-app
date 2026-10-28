// Pantalla «Repaso»: tarjetas creadas desde tus sesiones y
// conversaciones. Intervalos de 1, 3, 7 y 14 días.
// Tras una pausa larga, las atrasadas se pueden reprogramar
// (repartir en varios días) en vez de acumularse.
import { REVIEW_INTERVALS } from '../config.js';
import { h, chips, section, empty, button, linkButton, toast, select, labeled } from '../dom.js';
import { today, formatDay, relativeDay, addDays, diffDays } from '../dates.js';
import { dueCards, overdueCards, applyAnswer, planReschedule, schedule, RESULTS, intervalDays } from '../review.js';
import { nowIso } from '../model.js';
import { plain } from '../registro.js';
import { CARD_KINDS, openCardDialog } from '../components.js';

export function render(main, ctx, params) {
  const [sub] = params;
  if (sub === 'practicar') return renderPractice(main, ctx);
  if (sub === 'tarjetas') return renderCards(main, ctx);
  return renderOverview(main, ctx);
}

// ── Resumen ───────────────────────────────────────────────────

function renderOverview(main, ctx) {
  const data = ctx.sync.data;
  const t = today();
  const due = dueCards(data.cards, t);
  const overdue = overdueCards(data.cards, t);
  const active = data.cards.filter((c) => !c.archived);
  const nextWeek = active.filter((c) => c.due > t && c.due <= addDays(t, 7)).length;

  main.append(h('h1', { text: 'Repaso' }));
  main.append(
    section(
      null,
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('strong', { text: String(due.length) }), h('span', { text: 'para hoy' })),
        h('div', { class: 'stat' }, h('strong', { text: String(nextWeek) }), h('span', { text: 'próximos 7 días' })),
        h('div', { class: 'stat' }, h('strong', { text: String(active.length) }), h('span', { text: 'tarjetas activas' })),
      ),
      due.length ? linkButton('Empezar repaso', '#/repaso/practicar', 'primary big block') : empty('No tienes repasos pendientes hoy.'),
    ),
  );

  if (overdue.length) main.append(reschedulePanel(ctx, overdue, t));

  main.append(
    h('div', { class: 'row-actions' },
      button('Nueva tarjeta', () => openCardDialog(ctx, { onDone: () => ctx.rerender() }), 'secondary'),
      linkButton('Ver todas las tarjetas', '#/repaso/tarjetas', 'secondary'),
    ),
    section(
      'Cómo funciona',
      h('ul', { class: 'plain-list' },
        h('li', { text: `Sin ayuda: pasa al siguiente intervalo (${REVIEW_INTERVALS.join(' → ')} días).` }),
        h('li', { text: 'Con ayuda: no avanza y vuelve a salir hoy, al final. Si otra vez necesitas ayuda, vuelve mañana.' }),
        h('li', { text: 'No lo logré: vuelve mañana y empieza de nuevo por el intervalo de 1 día.' }),
        h('li', { text: 'Los días se cuentan con la hora de Vancouver.' }),
      ),
    ),
  );
}

function reschedulePanel(ctx, overdue, t) {
  const oldest = overdue[0].due;
  const days = diffDays(oldest, t);
  const options = { perDay: 10, restart: false };
  const restart = h('input', { type: 'checkbox', id: 'reprogramar-reiniciar' });
  restart.addEventListener('change', () => (options.restart = restart.checked));
  const perDay = select([5, 10, 15, 20].map((n) => ({ value: n, label: `${n} por día` })), options.perDay, (v) => (options.perDay = Number(v)), { id: 'reprogramar-por-dia' });
  const apply = () => {
    const plan = planReschedule(ctx.sync.data.cards, today(), options.perDay, options.restart);
    if (!plan.size) return;
    const last = [...plan.values()].reduce((m, p) => (p.due > m ? p.due : m), today());
    ctx.sync.update(`Repaso: reprogramar ${plan.size} tarjetas atrasadas`, (d) => {
      for (const c of d.cards) {
        const p = plan.get(c.id);
        if (p) Object.assign(c, { due: p.due, step: p.step, repeatToday: '', updatedAt: nowIso() });
      }
    });
    toast(`Repartidas hasta el ${formatDay(last, { weekday: false })}`);
    ctx.rerender();
  };
  return h('section', { class: 'card notice' },
    h('h2', { text: 'Repasos atrasados' }),
    h('p', { text: `Tienes ${overdue.length} ${overdue.length === 1 ? 'tarjeta' : 'tarjetas'} de días anteriores (la más antigua, de hace ${days} ${days === 1 ? 'día' : 'días'}). No hace falta hacerlas todas hoy.` }),
    labeled('Repartirlas a partir de hoy, como máximo', perDay),
    h('label', { class: 'check', for: 'reprogramar-reiniciar' }, restart, h('span', { text: ' Volver a empezar por el intervalo de 1 día' })),
    button('Reprogramar', apply, 'primary'),
  );
}

// ── Practicar ─────────────────────────────────────────────────

function renderPractice(main, ctx) {
  const queue = dueCards(ctx.sync.data.cards, today()).map((c) => c.id);
  const counts = { sin: 0, con: 0, no: 0 };
  const stage = h('div', {});
  main.append(h('a', { class: 'back', href: '#/repaso', text: '‹ Repaso' }), h('h1', { text: 'Repasar' }), stage);

  const showNext = () => {
    stage.replaceChildren();
    const t = today();
    let card = null;
    while (queue.length && !card) {
      const id = queue.shift();
      const c = ctx.sync.data.cards.find((x) => x.id === id);
      if (c && !c.archived && c.due <= t) card = c;
    }
    if (!card) {
      const total = counts.sin + counts.con + counts.no;
      stage.append(
        section(
          total ? '¡Listo por hoy!' : 'No hay tarjetas pendientes',
          total ? h('p', { text: `Repasaste ${total} ${total === 1 ? 'vez' : 'veces'}: ${counts.sin} sin ayuda, ${counts.con} con ayuda, ${counts.no} sin lograr.` }) : null,
          linkButton('Volver a Hoy', '#/hoy', 'primary block'),
        ),
      );
      return;
    }
    const kind = CARD_KINDS[card.kind];
    const answerBox = h('div', { class: 'flash-answer', hidden: true },
      h('p', { class: 'flash-label', text: kind.answer }),
      h('p', { class: 'flash-text pre', lang: 'fr', text: card.answer }),
      card.note ? h('p', { class: 'hint pre', text: card.note }) : null,
    );
    const answers = h('div', { class: 'answer-buttons', hidden: true },
      RESULTS.map((r) =>
        h('button', { type: 'button', class: `btn answer-${r.id}`, on: { click: () => answer(card.id, r.id) } },
          h('span', { text: r.label }),
          h('small', { text: preview(card, r.id, t) }),
        ),
      ),
    );
    const reveal = button('Mostrar respuesta', () => {
      answerBox.hidden = false;
      answers.hidden = false;
      reveal.hidden = true;
      answers.querySelector('button').focus();
    }, 'primary big block');
    stage.append(
      h('p', { class: 'hint', text: `Quedan ${queue.length + 1}` }),
      h('article', { class: 'card flash' },
        h('span', { class: 'badge', text: kind.label }),
        h('p', { class: 'flash-label', text: kind.prompt }),
        h('p', { class: 'flash-text pre', text: card.prompt || '(sin pista: intenta recordar la respuesta)' }),
        answerBox,
      ),
      reveal,
      answers,
    );
  };

  const answer = (id, result) => {
    const t = today();
    let next = null;
    ctx.sync.update('Repaso de tarjetas', (d) => {
      const c = d.cards.find((x) => x.id === id);
      if (c) next = applyAnswer(c, result, t, nowIso());
    });
    counts[result] += 1;
    if (next?.again) {
      queue.push(id);
      toast('Volverá a salir hoy, al final');
    } else if (next) {
      toast(`Próximo repaso: ${relativeDay(next.due, t)}`);
    }
    showNext();
  };

  showNext();
}

function preview(card, result, t) {
  const next = schedule(card, result, t);
  return next.again ? 'otra vez hoy' : relativeDay(next.due, t);
}

// ── Todas las tarjetas ────────────────────────────────────────

const cardFilters = { text: '', archived: false };

function renderCards(main, ctx) {
  const list = h('div', { class: 'list' });
  const search = h('input', { type: 'search', id: 'tarjetas-buscar', placeholder: 'Buscar en tus tarjetas…', autocomplete: 'off', 'aria-label': 'Buscar tarjetas' });
  search.value = cardFilters.text;
  search.addEventListener('input', () => ((cardFilters.text = search.value), paint()));
  const paint = () => {
    const t = today();
    const words = plain(cardFilters.text).split(/\s+/).filter(Boolean);
    const cards = ctx.sync.data.cards
      .filter((c) => c.archived === cardFilters.archived)
      .filter((c) => words.every((w) => plain(`${c.prompt} ${c.answer} ${c.note}`).includes(w)))
      .sort((a, b) => a.due.localeCompare(b.due));
    list.replaceChildren(
      ...(cards.length
        ? cards.map((c) =>
            h('button', { type: 'button', class: 'item link-item', on: { click: () => openCardDialog(ctx, { cardId: c.id, onDone: paint }) } },
              h('div', { class: 'item-main' },
                h('p', { class: 'item-title', lang: 'fr', text: c.answer }),
                c.prompt ? h('p', { class: 'item-text', text: c.prompt }) : null,
                h('p', { class: 'item-meta', text: c.archived ? `${CARD_KINDS[c.kind].label} · archivada` : `${CARD_KINDS[c.kind].label} · repaso ${relativeDay(c.due, t)} · intervalo ${intervalDays(c)} días` }),
              ),
            ),
          )
        : [empty(cardFilters.archived ? 'No tienes tarjetas archivadas.' : 'No hay tarjetas que coincidan.')]),
    );
  };
  main.append(
    h('a', { class: 'back', href: '#/repaso', text: '‹ Repaso' }),
    h('h1', { text: 'Tarjetas' }),
    button('Nueva tarjeta', () => openCardDialog(ctx, { onDone: paint }), 'primary block'),
    h('div', { class: 'toolbar' },
      search,
      chips([{ value: 'activas', label: 'Activas' }, { value: 'archivadas', label: 'Archivadas' }], cardFilters.archived ? 'archivadas' : 'activas', (v) => ((cardFilters.archived = v === 'archivadas'), paint()), { label: 'Mostrar' }),
    ),
    list,
  );
  paint();
}
