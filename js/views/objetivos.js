// Pantalla «Objetivos»: cada objetivo tiene una habilidad y un
// estado. Cambiar de estado pide un motivo y queda en el historial.
import { SKILLS, STATUSES, statusLabel, statusHelp } from '../config.js';
import { h, chips, groupLabel, textField, section, empty, button, linkButton, toast, confirmDialog, openDialog } from '../dom.js';
import { formatShort, formatDateTime, today, dayKey, relativeDay } from '../dates.js';
import { newObjective, nowIso } from '../model.js';
import { lastActivity, practiceCounts } from '../insights.js';
import { skillBadge, statusBadge, openStatusDialog, short, notFound, byCreatedDesc } from '../components.js';
import { createConversation } from './conversacion.js';

/** «Última práctica: hace 3 días · 2 sesiones · 1 conversación» */
function practiceSummary(data, objectiveId) {
  const last = lastActivity(data, objectiveId);
  const { sessions, conversations } = practiceCounts(data, objectiveId);
  if (!last) return 'Sin practicar todavía';
  const parts = [`Última práctica: ${relativeDay(dayKey(new Date(last)), today())}`];
  if (sessions) parts.push(`${sessions} ${sessions === 1 ? 'sesión' : 'sesiones'}`);
  if (conversations) parts.push(`${conversations} ${conversations === 1 ? 'conversación' : 'conversaciones'}`);
  return parts.join(' · ');
}

const filters = { skill: '' };

export function render(main, ctx, params) {
  const [id] = params;
  if (id) {
    if (!ctx.sync.data.objectives.some((o) => o.id === id)) return notFound(main, 'No encuentro este objetivo. Quizá se borró en otro dispositivo.', '#/objetivos');
    return renderDetail(main, ctx, id);
  }
  return renderList(main, ctx);
}

function renderList(main, ctx) {
  const data = ctx.sync.data;
  const groups = h('div', {});
  const paint = () => {
    groups.replaceChildren();
    const objectives = data.objectives.filter((o) => !filters.skill || o.skill === filters.skill);
    if (!data.objectives.length) {
      groups.append(empty('Todavía no tienes objetivos. Crea el primero con el botón de arriba.'));
      return;
    }
    for (const st of STATUSES) {
      const items = objectives.filter((o) => o.status === st.id).sort((a, b) => a.title.localeCompare(b.title, 'es'));
      if (!items.length) continue;
      groups.append(
        section(`${st.label} (${items.length})`,
          h('p', { class: 'hint', text: st.help }),
          ...items.map((o) =>
            h('a', { class: 'item link-item', href: `#/objetivos/${o.id}` },
              h('div', { class: 'item-main' },
                h('p', { class: 'item-title', text: o.title || 'Sin título' }),
                h('p', { class: 'item-meta' }, skillBadge(o.skill), ` ${practiceSummary(data, o.id)}`),
              ),
            ),
          ),
        ),
      );
    }
    if (!groups.children.length) groups.append(empty('No hay objetivos con esta habilidad.'));
  };
  main.append(
    h('h1', { text: 'Objetivos' }),
    button('Nuevo objetivo', () => openNewObjectiveDialog(ctx, (o) => ctx.go(`#/objetivos/${o.id}`)), 'primary block'),
    h('div', { class: 'toolbar' }, chips([{ value: '', label: 'Todas' }, ...SKILLS.map((s) => ({ value: s.id, label: s.label }))], filters.skill, (v) => ((filters.skill = v), paint()), { label: 'Filtrar por habilidad' })),
    groups,
  );
  paint();
}

export function openNewObjectiveDialog(ctx, onDone) {
  const draft = { title: '', skill: filters.skill || 'oral', description: '' };
  const errorEl = h('p', { class: 'form-error', role: 'alert' });
  openDialog({
    title: 'Nuevo objetivo',
    content: [
      textField({ id: 'obj-nuevo-titulo', label: 'Objetivo', placeholder: 'Ej.: Contar una anécdota en pasado', value: '', autocapitalize: 'sentences', onInput: (v) => (draft.title = v) }),
      groupLabel('Habilidad', chips(SKILLS.map((s) => ({ value: s.id, label: s.label })), draft.skill, (v) => (draft.skill = v), { label: 'Habilidad' })),
      textField({ id: 'obj-nuevo-desc', label: 'Cómo sabré que lo logré (opcional)', multiline: true, rows: 3, value: '', onInput: (v) => (draft.description = v) }),
      h('p', { class: 'hint', text: 'Empieza como «Pendiente de observar».' }),
      errorEl,
    ],
    actions: [
      { label: 'Cancelar', class: 'secondary' },
      {
        label: 'Crear',
        class: 'primary',
        onClick: () => {
          if (!draft.title.trim()) {
            errorEl.textContent = 'Escribe el objetivo.';
            return false;
          }
          const o = newObjective({ title: draft.title.trim(), skill: draft.skill, description: draft.description.trim() });
          ctx.sync.update(`Objetivo nuevo: «${short(o.title)}»`, (d) => d.objectives.push(o));
          toast('Objetivo creado');
          onDone?.(o);
          return true;
        },
      },
    ],
  });
}

function renderDetail(main, ctx, id) {
  const data = ctx.sync.data;
  const o = data.objectives.find((x) => x.id === id);
  const edit = (what, fn) =>
    ctx.sync.update(`Objetivo «${short(o.title)}»: ${what}`, (d) => {
      const x = d.objectives.find((y) => y.id === id);
      if (x) {
        fn(x);
        x.updatedAt = nowIso();
      }
    });

  main.append(
    h('a', { class: 'back', href: '#/objetivos', text: '‹ Objetivos' }),
    h('h1', { text: o.title || 'Objetivo' }),
    section(
      'Estado',
      h('p', {}, statusBadge(o.status), ' ', skillBadge(o.skill)),
      h('p', { class: 'hint', text: `${statusHelp(o.status)} ${practiceSummary(data, id)}.` }),
      o.description.trim() ? h('p', {}, h('strong', { text: 'Cómo sabré que lo logré: ' }), o.description.trim()) : null,
      h('div', { class: 'row-actions' },
        button('Cambiar estado…', () => openStatusDialog(ctx, id, { onDone: () => ctx.rerender() }), 'primary'),
        linkButton('Empezar sesión', `#/sesion/nueva/objetivo/${id}`, 'secondary'),
        button('Preparar conversación', () => ctx.go(`#/conversacion/${createConversation(ctx, { objectiveId: id })}`), 'secondary'),
      ),
    ),
  );

  // Historial
  const history = [...o.history].reverse();
  main.append(
    section(
      'Historial',
      history.length
        ? h('ol', { class: 'timeline' },
            history.map((e) =>
              h('li', {},
                h('p', { class: 'item-meta', text: `${formatDateTime(e.at)} · ${e.from ? statusLabel(e.from) : '—'} → ${statusLabel(e.to)}` }),
                h('p', { class: 'pre', text: e.reason }),
                e.source?.type === 'conversation' ? h('a', { class: 'link', href: `#/conversacion/${e.source.id}`, text: 'Ver la conversación' }) : null,
                e.source?.type === 'session' ? h('a', { class: 'link', href: `#/sesion/${e.source.id}`, text: 'Ver la sesión' }) : null,
              ),
            ),
          )
        : empty('Sin cambios de estado todavía.'),
    ),
  );

  // Evidencias relacionadas
  const sessions = data.sessions.filter((s) => s.objectiveId === id).sort(byCreatedDesc);
  const convs = data.conversations.filter((c) => c.objectiveId === id).sort(byCreatedDesc);
  const related = [
    ...sessions.map((s) => ({ at: s.createdAt, href: `#/sesion/${s.id}`, text: `Sesión del ${formatShort(s.createdAt)}${s.closing.achievement ? ` · Logro: ${short(s.closing.achievement, 90)}` : ''}` })),
    ...convs.map((c) => ({ at: c.createdAt, href: `#/conversacion/${c.id}`, text: `Conversación del ${formatShort(c.createdAt)}${c.registro.trim() ? ' · con registro' : ' · sin registro'}` })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  main.append(section('Sesiones y conversaciones', related.length ? h('ul', { class: 'plain-list' }, related.slice(0, 30).map((r) => h('li', {}, h('a', { class: 'link', href: r.href, text: r.text })))) : empty('Todavía no hay sesiones ni conversaciones con este objetivo.')));

  // Datos del objetivo
  main.append(
    section(
      'Datos del objetivo',
      textField({ id: 'obj-titulo', label: 'Objetivo', value: o.title, autocapitalize: 'sentences', onInput: (v) => edit('título', (x) => (x.title = v)) }),
      groupLabel('Habilidad', chips(SKILLS.map((s) => ({ value: s.id, label: s.label })), o.skill, (v) => edit('habilidad', (x) => (x.skill = v)), { label: 'Habilidad' })),
      textField({ id: 'obj-desc', label: 'Cómo sabré que lo logré', value: o.description, multiline: true, rows: 3, onInput: (v) => edit('descripción', (x) => (x.description = v)) }),
      button('Eliminar objetivo', async () => {
        if (await confirmDialog('Se eliminará el objetivo y su historial de estados. Las sesiones y conversaciones se conservan. (Seguirá en el historial de GitHub.)', { title: '¿Eliminar el objetivo?', confirmLabel: 'Eliminar', danger: true })) {
          ctx.sync.update(`Objetivo «${short(o.title)}»: eliminar`, (d) => (d.objectives = d.objectives.filter((x) => x.id !== id)));
          toast('Objetivo eliminado');
          ctx.go('#/objetivos');
        }
      }, 'danger small'),
    ),
  );
}
