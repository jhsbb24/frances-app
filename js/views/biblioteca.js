// Pantalla «Biblioteca»: tus referencias de Édito B1 y B2
// (edición, unidad, página, enlace de audio y notas), con búsqueda.
// La app no incluye contenido de los libros: solo tus referencias.
import { BOOKS } from '../config.js';
import { h, chips, groupLabel, textField, empty, button, linkButton, toast, confirmDialog, openDialog, externalLink } from '../dom.js';
import { formatShort } from '../dates.js';
import { referenceUsage } from '../insights.js';
import { newReference, refText, safeUrl, nowIso, nextStep } from '../model.js';
import { plain } from '../registro.js';
import { short } from '../components.js';

const filters = { text: '', book: '', kind: '' }; // se recuerdan mientras la app está abierta
const openUnits = new Set(); // unidades abiertas (la primera vez: la del paso actual del plan)
let touched = false;

/** Tipo de ficha, según el comienzo de la nota («Audio: …», «Gramática: …»). */
const KINDS = ['Gramática', 'Vocabulario', 'Fonética', 'Audio', 'Vídeo'];
export const refKind = (r) => KINDS.find((k) => r.notes.startsWith(`${k}:`)) || '';
const KIND_CHIPS = [
  { value: '', label: 'Todo' },
  { value: 'Gramática', label: 'Gramática' },
  { value: 'Vocabulario', label: 'Vocabulario' },
  { value: 'Fonética', label: 'Fonética' },
  { value: 'Audio', label: 'Audios' },
  { value: 'Vídeo', label: 'Vídeos' },
  { value: 'mias', label: 'Mis notas' },
];

const unitKey = (r) => `${r.book}·${r.unit || '—'}`;
const byNumber = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true });

export function render(main, ctx) {
  const list = h('div', { class: 'list' });
  const count = h('p', { class: 'hint', 'aria-live': 'polite' });
  const search = h('input', { type: 'search', id: 'biblioteca-buscar', placeholder: 'Buscar: «subjonctif», «p. 44», «audio unidad 3»…', autocomplete: 'off', 'aria-label': 'Buscar en la Biblioteca' });
  search.value = filters.text;
  search.addEventListener('input', () => {
    filters.text = search.value;
    paint();
  });

  // Títulos de las unidades (vienen del plan) y la unidad en la que vas.
  const data = ctx.sync.data;
  const unitTitles = new Map(data.steps.map((st) => [`${st.book}·${st.unit}`, st.unitTitle]));
  const next = nextStep(data);
  if (!touched && next) openUnits.add(`${next.book}·${next.unit}`);

  const row = (r) => {
    const use = referenceUsage(ctx.sync.data, r);
    const used = use.sessions + use.conversations;
    const usage = used
      ? `Usada en ${[use.sessions && `${use.sessions} ${use.sessions === 1 ? 'sesión' : 'sesiones'}`, use.conversations && `${use.conversations} ${use.conversations === 1 ? 'conversación' : 'conversaciones'}`].filter(Boolean).join(' y ')} · última: ${formatShort(use.last)}`
      : '';
    const kind = refKind(r);
    const text = kind ? r.notes.slice(kind.length + 1).trim() : r.notes;
    return h('article', { class: 'ref-row' },
      h('div', { class: 'item-main' },
        h('p', { class: 'item-title' }, r.page ? `p. ${r.page}` : 'Sin página', kind ? h('span', { class: `badge kind-${plain(kind)}`, text: kind }) : null),
        text ? h('p', { class: 'pre item-text', text }) : null,
        usage ? h('p', { class: 'item-meta', text: usage }) : null,
      ),
      h('div', { class: 'row-actions' },
        r.audioUrl ? externalLink('Audio', r.audioUrl, 'btn secondary small') : null,
        linkButton('Empezar sesión', `#/sesion/nueva/referencia/${r.id}`, 'secondary small'),
        button('Editar', () => openReferenceDialog(ctx, r.id, paint), 'secondary small'),
      ),
    );
  };

  const paint = () => {
    const all = ctx.sync.data.references;
    const words = plain(filters.text).split(/\s+/).filter(Boolean);
    const refs = all
      .filter((r) => !filters.book || r.book === filters.book)
      .filter((r) => !filters.kind || (filters.kind === 'mias' ? !refKind(r) : refKind(r) === filters.kind))
      .filter((r) => {
        const haystack = plain([`edito ${r.book}`, r.edition, `unidad ${r.unit}`, `u${r.unit}`, `p. ${r.page}`, `p ${r.page}`, `pagina ${r.page}`, r.notes, r.audioUrl, unitTitles.get(unitKey(r))].join(' '));
        return words.every((w) => haystack.includes(w));
      });
    list.replaceChildren();
    count.textContent = all.length ? `${refs.length === all.length ? `${all.length} fichas` : `${refs.length} de ${all.length} fichas`}.` : '';
    if (!all.length) {
      list.append(empty('Todavía no tienes referencias. Añade la primera con el botón de arriba (o carga el plan de estudio).'));
      return;
    }
    if (!refs.length) {
      list.append(empty('Nada coincide con la búsqueda o el filtro.'));
      return;
    }
    // Agrupadas por libro y unidad; dentro, por página.
    const groups = new Map();
    for (const r of refs) {
      const key = unitKey(r);
      if (!groups.has(key)) groups.set(key, { key, book: r.book, unit: r.unit, refs: [] });
      groups.get(key).refs.push(r);
    }
    const filtering = words.length > 0 || Boolean(filters.kind);
    const ordered = [...groups.values()].sort((a, b) => byNumber(a.book, b.book) || byNumber(a.unit || '999', b.unit || '999'));
    for (const g of ordered) {
      g.refs.sort((a, b) => byNumber(a.page || '999', b.page || '999') || a.notes.localeCompare(b.notes, 'es'));
      const title = unitTitles.get(g.key);
      // Abiertas: al buscar o filtrar, la unidad en la que vas del plan, o todas si son pocas fichas.
      const details = h('details', { class: 'card unit', open: filtering || openUnits.has(g.key) || ordered.length === 1 || all.length <= 20 || (!next && !touched) },
        h('summary', {},
          h('span', { class: 'summary-title', text: `Édito ${g.book} · ${g.unit ? `Unidad ${g.unit}` : 'Sin unidad'}${title ? ` — ${title}` : ''}` }),
          h('span', { class: 'summary-meta', text: `${g.refs.length} ${g.refs.length === 1 ? 'ficha' : 'fichas'}` }),
        ),
        ...g.refs.map(row),
      );
      details.addEventListener('toggle', () => {
        if (filtering) return; // abrir y cerrar mientras buscas no cambia lo que recuerdas
        touched = true;
        if (details.open) openUnits.add(g.key);
        else openUnits.delete(g.key);
      });
      list.append(details);
    }
  };

  main.append(
    h('h1', { text: 'Biblioteca' }),
    h('p', { class: 'subtitle', text: 'Tus referencias de Édito: gramática, vocabulario, fonética, audios y vídeos de cada unidad.' }),
    button('Nueva referencia', () => openReferenceDialog(ctx, '', paint), 'primary block'),
    h('div', { class: 'toolbar' },
      search,
      chips(KIND_CHIPS, filters.kind, (v) => {
        filters.kind = v;
        paint();
      }, { label: 'Filtrar por tipo' }),
      BOOKS.some((b) => b !== 'B1' && data.references.some((r) => r.book === b))
        ? chips([{ value: '', label: 'B1 y B2' }, ...BOOKS.map((b) => ({ value: b, label: `Solo ${b}` }))], filters.book, (v) => {
          filters.book = v;
          paint();
        }, { label: 'Filtrar por libro' })
        : null,
    ),
    count,
    list,
  );
  paint();
}

function openReferenceDialog(ctx, id, onDone) {
  const existing = id ? ctx.sync.data.references.find((r) => r.id === id) : null;
  const draft = existing ? { ...existing } : { book: 'B1', edition: '', unit: '', page: '', audioUrl: '', notes: '' };
  const errorEl = h('p', { class: 'form-error', role: 'alert' });
  const field = (key, label, extra = {}) => textField({ id: `ref-${key}`, label, value: draft[key], onInput: (v) => (draft[key] = v), ...extra });
  const content = [
    groupLabel('Libro', chips(BOOKS.map((b) => ({ value: b, label: `Édito ${b}` })), draft.book, (v) => (draft.book = v), { label: 'Libro' })),
    field('edition', 'Edición', { hint: 'Por ejemplo: 2018 o «nouvelle édition 2022».', autocapitalize: 'sentences' }),
    h('div', { class: 'two-cols' }, field('unit', 'Unidad', { inputmode: 'numeric', compact: true }), field('page', 'Página', { inputmode: 'numeric', compact: true })),
    field('audioUrl', 'Enlace de audio', { type: 'url', placeholder: 'https://…', spellcheck: false, hint: 'Opcional. Debe empezar por https://' }),
    field('notes', 'Notas', { multiline: true, rows: 4 }),
    errorEl,
  ];
  if (existing) {
    content.push(
      button('Eliminar referencia', async () => {
        dlg.close();
        if (await confirmDialog('Se eliminará de tu Biblioteca. Las sesiones que la usaron conservan sus datos.', { title: '¿Eliminar la referencia?', confirmLabel: 'Eliminar', danger: true })) {
          ctx.sync.update(`Biblioteca: eliminar «${short(refText(existing))}»`, (d) => (d.references = d.references.filter((r) => r.id !== id)));
          toast('Referencia eliminada');
          onDone();
        }
      }, 'danger small'),
    );
  }
  const dlg = openDialog({
    title: existing ? 'Editar referencia' : 'Nueva referencia',
    content,
    actions: [
      { label: 'Cancelar', class: 'secondary' },
      {
        label: 'Guardar',
        class: 'primary',
        onClick: () => {
          const audio = draft.audioUrl.trim();
          if (audio && !safeUrl(audio)) {
            errorEl.textContent = 'El enlace de audio debe empezar por https:// (o http://).';
            return false;
          }
          const values = { book: draft.book, edition: draft.edition.trim(), unit: draft.unit.trim(), page: draft.page.trim(), audioUrl: safeUrl(audio), notes: draft.notes.trim() };
          if (existing) {
            ctx.sync.update(`Biblioteca: editar «${short(refText({ ...values }))}»`, (d) => {
              const r = d.references.find((x) => x.id === id);
              if (r) Object.assign(r, values, { updatedAt: nowIso() });
            });
          } else {
            const ref = newReference(values);
            ctx.sync.update(`Biblioteca: nueva referencia «${short(refText(ref))}»`, (d) => d.references.push(ref));
            toast('Referencia guardada');
          }
          onDone();
          return true;
        },
      },
    ],
  });
}
