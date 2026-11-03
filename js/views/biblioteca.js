// Pantalla «Biblioteca»: tus referencias de Édito B1 y B2
// (edición, unidad, página, enlace de audio y notas), con búsqueda.
// La app no incluye contenido de los libros: solo tus referencias.
import { BOOKS } from '../config.js';
import { h, chips, groupLabel, textField, empty, button, linkButton, toast, confirmDialog, openDialog, externalLink } from '../dom.js';
import { formatShort } from '../dates.js';
import { referenceUsage } from '../insights.js';
import { newReference, refText, safeUrl, nowIso } from '../model.js';
import { plain } from '../registro.js';
import { short } from '../components.js';

const filters = { text: '', book: '' }; // se recuerdan mientras la app está abierta

export function render(main, ctx) {
  const list = h('div', { class: 'list' });
  const search = h('input', { type: 'search', id: 'biblioteca-buscar', placeholder: 'Buscar: unidad, página, nota…', autocomplete: 'off', 'aria-label': 'Buscar en la Biblioteca' });
  search.value = filters.text;
  search.addEventListener('input', () => {
    filters.text = search.value;
    paint();
  });

  const paint = () => {
    const words = plain(filters.text).split(/\s+/).filter(Boolean);
    const refs = ctx.sync.data.references
      .filter((r) => !filters.book || r.book === filters.book)
      .filter((r) => {
        const haystack = plain([`edito ${r.book}`, r.edition, `unidad ${r.unit}`, `u${r.unit}`, `p. ${r.page}`, `pagina ${r.page}`, r.notes, r.audioUrl].join(' '));
        return words.every((w) => haystack.includes(w));
      })
      .sort((a, b) => refText(a).localeCompare(refText(b), 'es', { numeric: true }));
    list.replaceChildren();
    if (!ctx.sync.data.references.length) {
      list.append(empty('Todavía no tienes referencias. Añade la primera con el botón de arriba.'));
      return;
    }
    if (!refs.length) {
      list.append(empty('Nada coincide con la búsqueda.'));
      return;
    }
    for (const r of refs) {
      const use = referenceUsage(ctx.sync.data, r);
      const used = use.sessions + use.conversations;
      const usage = used
        ? `Usada en ${[use.sessions && `${use.sessions} ${use.sessions === 1 ? 'sesión' : 'sesiones'}`, use.conversations && `${use.conversations} ${use.conversations === 1 ? 'conversación' : 'conversaciones'}`].filter(Boolean).join(' y ')} · última: ${formatShort(use.last)}`
        : 'Todavía sin usar';
      list.append(
        h('article', { class: 'card ref-card' },
          h('div', { class: 'item-main' },
            h('p', { class: 'item-title', text: [`Édito ${r.book}`, r.unit && `Unidad ${r.unit}`, r.page && `p. ${r.page}`].filter(Boolean).join(' · ') }),
            h('p', { class: 'item-meta', text: [r.edition && `Edición: ${r.edition}`, usage].filter(Boolean).join(' · ') }),
            r.notes ? h('p', { class: 'pre item-text', text: r.notes }) : null,
          ),
          h('div', { class: 'row-actions' },
            r.audioUrl ? externalLink('Audio', r.audioUrl, 'btn secondary small') : null,
            linkButton('Empezar sesión', `#/sesion/nueva/referencia/${r.id}`, 'secondary small'),
            button('Editar', () => openReferenceDialog(ctx, r.id, paint), 'secondary small'),
          ),
        ),
      );
    }
  };

  main.append(
    h('h1', { text: 'Biblioteca' }),
    h('p', { class: 'subtitle', text: 'Tus referencias de Édito B1 y B2.' }),
    button('Nueva referencia', () => openReferenceDialog(ctx, '', paint), 'primary block'),
    h('div', { class: 'toolbar' },
      search,
      chips([{ value: '', label: 'Todas' }, ...BOOKS.map((b) => ({ value: b, label: b }))], filters.book, (v) => {
        filters.book = v;
        paint();
      }, { label: 'Filtrar por libro' }),
    ),
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
