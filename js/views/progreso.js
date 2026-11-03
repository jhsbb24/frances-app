// Pantalla «Progreso»: objetivos por habilidad y estado, y tus
// últimas evidencias. No convierte minutos ni rachas en niveles MCER.
import { SKILLS, STATUSES, statusLabel } from '../config.js';
import { h, chips, section, empty } from '../dom.js';
import { formatShort, formatDay, today } from '../dates.js';
import { weeklyActivity, unitsWorked, recentDifficulties } from '../insights.js';
import { parseRegistro } from '../registro.js';
import { skillBadge, clip } from '../components.js';

const filters = { skill: '' };

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function collectEvidence(data) {
  const out = [];
  const objectives = new Map(data.objectives.map((o) => [o.id, o]));
  for (const o of data.objectives) {
    for (const e of o.history) {
      out.push({ at: e.at, skill: o.skill, objective: o.title, type: 'Cambio de estado', text: `${e.from ? statusLabel(e.from) : '—'} → ${statusLabel(e.to)}. ${e.reason}`, href: `#/objetivos/${o.id}` });
    }
  }
  for (const s of data.sessions) {
    if (!s.closing.achievement.trim()) continue;
    const o = objectives.get(s.objectiveId);
    out.push({ at: s.closedAt || s.updatedAt, skill: o?.skill || '', objective: o?.title || '', type: 'Logro de una sesión', text: s.closing.achievement, href: `#/sesion/${s.id}` });
  }
  for (const c of data.conversations) {
    if (!c.registro.trim()) continue;
    const parsed = parseRegistro(c.registro);
    const o = objectives.get(c.objectiveId);
    out.push({
      at: c.registroAt || c.updatedAt,
      skill: o?.skill || parsed.skill || '',
      objective: o?.title || '',
      type: 'Conversación (REGISTRO)',
      text: parsed.fields.evidencia || parsed.fields.logro || c.registro,
      href: `#/conversacion/${c.id}`,
    });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

export function render(main, ctx) {
  const data = ctx.sync.data;
  const content = h('div', {});
  const paint = () => {
    content.replaceChildren();
    const skills = SKILLS.filter((s) => !filters.skill || s.id === filters.skill);

    // Objetivos por habilidad y estado
    const grid = h('div', { class: 'skill-grid' });
    for (const skill of skills) {
      const objs = data.objectives.filter((o) => o.skill === skill.id);
      const rows = STATUSES.map((st) => {
        const n = objs.filter((o) => o.status === st.id).length;
        const bar = h('span', { class: `bar-fill status-${st.id}` });
        bar.style.width = objs.length ? `${Math.round((n / objs.length) * 100)}%` : '0%';
        return h('div', { class: 'bar-row' }, h('span', { class: 'bar-label', text: st.label }), h('span', { class: 'bar' }, bar), h('span', { class: 'bar-count', text: String(n) }));
      });
      grid.append(h('article', { class: 'card' }, h('h3', { text: `${skill.label} · ${objs.length} ${objs.length === 1 ? 'objetivo' : 'objetivos'}` }), ...rows));
    }
    content.append(h('h2', { class: 'section-title', text: 'Objetivos por habilidad y estado' }), grid);

    // Últimas evidencias
    const evidence = collectEvidence(data).filter((e) => !filters.skill || e.skill === filters.skill).slice(0, 25);
    content.append(
      section(
        'Últimas evidencias',
        evidence.length
          ? h('ol', { class: 'timeline' },
              evidence.map((e) =>
                h('li', {},
                  h('p', { class: 'item-meta' }, `${formatShort(e.at)} · ${e.type}`, e.skill ? ' · ' : '', e.skill ? skillBadge(e.skill) : null),
                  e.objective ? h('p', { class: 'item-title', text: e.objective }) : null,
                  h('p', { class: 'pre', text: clip(e.text, 400) }),
                  h('a', { class: 'link', href: e.href, text: 'Ver' }),
                ),
              ),
            )
          : empty('Todavía no hay evidencias. Aparecerán al cerrar sesiones con un logro, guardar registros de conversación o cambiar estados.'),
      ),
    );

    // Lo que más te cuesta últimamente
    const objectives = new Map(data.objectives.map((o) => [o.id, o]));
    const skillOf = (href) => {
      const [, kind, id] = href.split('/');
      const item = kind === 'sesion' ? data.sessions.find((x) => x.id === id) : data.conversations.find((x) => x.id === id);
      return objectives.get(item?.objectiveId)?.skill || '';
    };
    const hard = recentDifficulties(data, 20).filter((d) => !filters.skill || skillOf(d.href) === filters.skill).slice(0, 8);
    content.append(
      section(
        'Dificultades y prioridades recientes',
        h('p', { class: 'hint', text: 'De tus cierres de sesión y de los REGISTROS. Si algo se repite, conviértelo en objetivo o en tarjetas.' }),
        hard.length
          ? h('ul', { class: 'plain-list' }, hard.map((d) => h('li', {}, h('span', { class: 'item-meta', text: `${formatShort(d.at)} · ${d.kind}: ` }), d.text, ' ', h('a', { class: 'link', href: d.href, text: 'Ver' }))))
          : empty('Todavía no hay dificultades anotadas.'),
      ),
    );

    // Unidades de Édito trabajadas (no depende del filtro)
    const units = unitsWorked(data);
    const books = Object.keys(units).sort();
    content.append(
      section(
        'Unidades de Édito trabajadas',
        books.length
          ? books.map((book) =>
              h('div', {},
                h('h3', { text: `Édito ${book}` }),
                h('ul', { class: 'plain-list' },
                  units[book].map((u) =>
                    h('li', {}, h('strong', { text: `Unidad ${u.unit}` }), ` · ${count(u.sessions, 'sesión', 'sesiones')}, ${count(u.conversations, 'conversación', 'conversaciones')} · última: ${formatShort(u.last)}`),
                  ),
                ),
              ),
            )
          : empty('Aparecerán cuando anotes libro y unidad en tus sesiones o conversaciones.'),
      ),
    );

    // Actividad por semana: solo recuentos, sin niveles ni rachas
    const weeks = weeklyActivity(data, today(), 8);
    content.append(
      section(
        'Actividad de las últimas semanas',
        h('p', { class: 'hint', text: 'Recuento de lunes a domingo (todas las habilidades). Sirve para ver tu ritmo, no mide tu nivel.' }),
        h('ul', { class: 'plain-list' },
          weeks.map((w, i) =>
            h('li', {}, h('strong', { text: i === 0 ? 'Esta semana' : `Semana del ${formatDay(w.start, { weekday: false })}` }), `: ${count(w.sessions, 'sesión', 'sesiones')} · ${count(w.conversations, 'conversación', 'conversaciones')} · ${count(w.reviews, 'repaso', 'repasos')}`),
          ),
        ),
      ),
    );
  };
  main.append(
    h('h1', { text: 'Progreso' }),
    h('p', { class: 'subtitle', text: 'Tus objetivos y evidencias. Esto no es un nivel MCER: el tiempo y la constancia no se convierten en niveles.' }),
    h('div', { class: 'toolbar' }, chips([{ value: '', label: 'Todas' }, ...SKILLS.map((s) => ({ value: s.id, label: s.label }))], filters.skill, (v) => ((filters.skill = v), paint()), { label: 'Filtrar por habilidad' })),
    content,
  );
  paint();
}
