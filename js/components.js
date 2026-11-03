// ─────────────────────────────────────────────────────────────
// Piezas de interfaz que usan varias pantallas:
// editor de referencia de Édito, selector de objetivo,
// ventana «Cambiar estado» y ventana de tarjeta de repaso.
// ─────────────────────────────────────────────────────────────
import { BOOKS, SKILLS, STATUSES, REVIEW_INTERVALS, skillLabel, statusLabel } from './config.js';
import { today, addDays, formatDay, formatDateTime, relativeDay } from './dates.js';
import { h, chips, select, textField, labeled, groupLabel, openDialog, confirmDialog, toast, externalLink } from './dom.js';
import { emptyRef, refText, newCard, nowIso } from './model.js';
import { intervalDays } from './review.js';

export const short = (text, max = 40) => {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/** Recorta un texto largo conservando los saltos de línea. */
export const clip = (text, max) => {
  const t = String(text || '').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

export const byUpdatedDesc = (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '');
export const byCreatedDesc = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '');

export function badge(text, kind = '') {
  return h('span', { class: `badge ${kind}`.trim(), text });
}

export const skillBadge = (skill) => badge(skillLabel(skill), `skill-${skill}`);
export const statusBadge = (status) => badge(statusLabel(status), `status-${status}`);

// ── Referencia de Édito ───────────────────────────────────────

/**
 * Editor de referencia: elegir de la Biblioteca o escribir libro,
 * unidad, página y nota. Llama a onChange(ref, qué) en cada cambio.
 */
export function refEditor(data, initial, onChange, { idPrefix }) {
  const ref = { ...emptyRef(), ...initial };
  const refs = [...data.references].sort((a, b) => refText(a).localeCompare(refText(b), 'es', { numeric: true }));
  const audioSlot = h('div', { class: 'ref-audio' });

  const paintAudio = () => {
    const linked = data.references.find((r) => r.id === ref.refId);
    audioSlot.replaceChildren(linked?.audioUrl ? externalLink('Abrir el audio de esta referencia', linked.audioUrl, 'link') : '');
  };

  const changed = (what, unlink = true) => {
    if (unlink && ref.refId) {
      ref.refId = '';
      libSelect.value = '';
      paintAudio();
    }
    onChange({ ...ref }, what);
  };

  const libSelect = select(
    [{ value: '', label: refs.length ? '— Ninguna (escribir a mano) —' : '(tu Biblioteca está vacía)' }, ...refs.map((r) => ({ value: r.id, label: refText(r) || 'Referencia sin datos' }))],
    ref.refId,
    (id) => {
      const r = data.references.find((x) => x.id === id);
      ref.refId = r ? r.id : '';
      if (r) {
        Object.assign(ref, { book: r.book, unit: r.unit, page: r.page });
        bookChips.setValue(ref.book);
        unit.input.value = ref.unit;
        page.input.value = ref.page;
      }
      paintAudio();
      changed('referencia', false);
    },
    { id: `${idPrefix}-biblioteca` },
  );

  const bookChips = chips(
    BOOKS.map((b) => ({ value: b, label: `Édito ${b}` })),
    ref.book,
    (v) => {
      ref.book = v;
      changed('libro');
    },
    { label: 'Libro' },
  );
  const unit = textField({ id: `${idPrefix}-unidad`, label: 'Unidad', value: ref.unit, inputmode: 'numeric', compact: true, onInput: (v) => ((ref.unit = v), changed('unidad')) });
  const page = textField({ id: `${idPrefix}-pagina`, label: 'Página', value: ref.page, inputmode: 'numeric', compact: true, onInput: (v) => ((ref.page = v), changed('página')) });
  const note = textField({
    id: `${idPrefix}-nota`,
    label: 'Nota',
    hint: 'Por ejemplo: actividad 3, documento audio 12, «Point langue».',
    value: ref.note,
    multiline: true,
    rows: 2,
    onInput: (v) => ((ref.note = v), changed('nota de la referencia', false)),
  });
  paintAudio();
  return h(
    'div',
    { class: 'ref-editor' },
    refs.length ? labeled('Desde mi Biblioteca', libSelect) : null,
    groupLabel('Libro', bookChips),
    h('div', { class: 'two-cols' }, unit, page),
    note,
    audioSlot,
  );
}

// ── Selector de objetivo ──────────────────────────────────────

export const NEW_OBJECTIVE = '__nuevo__';

/**
 * Desplegable con tus objetivos agrupados por habilidad.
 * Con allowNew, la última opción permite crear uno nuevo:
 * onChange(NEW_OBJECTIVE, { title, skill }).
 */
export function objectivePicker(data, value, onChange, { id, allowNew = false, label = 'Objetivo' } = {}) {
  const draft = { title: '', skill: 'oral' };
  const groups = SKILLS.map((s) => ({
    group: s.label,
    options: data.objectives
      .filter((o) => o.skill === s.id && (o.status !== 'transferido' || o.id === value))
      .sort((a, b) => a.title.localeCompare(b.title, 'es'))
      .map((o) => ({ value: o.id, label: `${short(o.title, 60) || 'Sin título'} · ${statusLabel(o.status)}` })),
  })).filter((g) => g.options.length);
  const options = [{ value: '', label: data.objectives.length ? '— Elige un objetivo —' : '— Sin objetivo todavía —' }, ...groups];
  if (allowNew) options.push({ value: NEW_OBJECTIVE, label: '+ Crear un objetivo nuevo…' });

  const newBox = h('div', { class: 'subcard', hidden: value !== NEW_OBJECTIVE });
  const title = textField({ id: `${id}-nuevo-titulo`, label: 'Objetivo nuevo', placeholder: 'Ej.: Pedir y comparar precios en una tienda', value: '', onInput: (v) => ((draft.title = v), onChange(NEW_OBJECTIVE, { ...draft })), autocapitalize: 'sentences' });
  const skill = chips(
    SKILLS.map((s) => ({ value: s.id, label: s.label })),
    draft.skill,
    (v) => {
      draft.skill = v;
      onChange(NEW_OBJECTIVE, { ...draft });
    },
    { label: 'Habilidad' },
  );
  newBox.append(title, groupLabel('Habilidad', skill));

  const sel = select(
    options,
    value,
    (v) => {
      newBox.hidden = v !== NEW_OBJECTIVE;
      onChange(v, v === NEW_OBJECTIVE ? { ...draft } : null);
    },
    { id },
  );
  return h('div', {}, labeled(label, sel), allowNew ? newBox : null);
}

// ── Cambiar el estado de un objetivo ──────────────────────────

/**
 * Ventana para cambiar de estado. Siempre pide un motivo, que
 * queda en el historial. Nada cambia hasta pulsar «Guardar cambio».
 */
export function openStatusDialog(ctx, objectiveId, { suggested = '', reason = '', source = null, onDone } = {}) {
  const obj = ctx.sync.data.objectives.find((o) => o.id === objectiveId);
  if (!obj) return;
  let to = suggested && suggested !== obj.status ? suggested : '';
  const list = h('div', { class: 'radio-list', role: 'radiogroup', 'aria-label': 'Nuevo estado' });
  for (const st of STATUSES) {
    const current = st.id === obj.status;
    const input = h('input', { type: 'radio', name: 'nuevo-estado', value: st.id, disabled: current, checked: st.id === to });
    input.addEventListener('change', () => (to = st.id));
    const tag = current ? ' (estado actual)' : st.id === suggested ? ' (sugerido)' : '';
    list.append(
      h(
        'label',
        { class: `radio${current ? ' current' : ''}` },
        input,
        h('span', { class: 'radio-text' }, h('span', { class: 'radio-title', text: `${st.label}${tag}` }), h('small', { class: 'radio-help', text: st.help })),
      ),
    );
  }
  const reasonField = textField({
    id: 'motivo-estado',
    label: 'Motivo (obligatorio)',
    hint: 'Qué evidencia tienes. Ej.: «Pedí la cuenta sin ayuda en la conversación del 28 oct».',
    value: reason,
    multiline: true,
    rows: 3,
  });
  const errorEl = h('p', { class: 'form-error', role: 'alert' });
  openDialog({
    title: 'Cambiar estado',
    content: [h('p', {}, h('strong', { text: obj.title || 'Objetivo sin título' }), h('br'), `Ahora: ${statusLabel(obj.status)}`), list, reasonField, errorEl],
    actions: [
      { label: 'Cancelar', class: 'secondary' },
      {
        label: 'Guardar cambio',
        class: 'primary',
        onClick: () => {
          const motivo = reasonField.input.value.trim();
          if (!to) {
            errorEl.textContent = 'Elige el nuevo estado.';
            return false;
          }
          if (!motivo) {
            errorEl.textContent = 'Escribe el motivo: quedará en el historial.';
            reasonField.input.focus();
            return false;
          }
          const at = nowIso();
          const from = obj.status;
          ctx.sync.update(`Objetivo «${short(obj.title)}»: ${statusLabel(from)} → ${statusLabel(to)}`, (d) => {
            const o = d.objectives.find((x) => x.id === objectiveId);
            if (!o) return;
            o.history.push({ at, from: o.status, to, reason: motivo, source });
            o.status = to;
            o.updatedAt = at;
          });
          toast(`Estado: ${statusLabel(to)}`);
          onDone?.({ from, to });
          return true;
        },
      },
    ],
  });
}

// ── Tarjetas de repaso ────────────────────────────────────────

export const CARD_KINDS = {
  expresion: { label: 'Expresión', prompt: 'Pista: significado o situación (en español)', answer: 'Expresión en francés' },
  error: { label: 'Error', prompt: 'Lo que dije (con el error)', answer: 'Forma correcta' },
};

const kindOptions = Object.entries(CARD_KINDS).map(([value, k]) => ({ value, label: k.label }));

/** Formulario corto para añadir una tarjeta (pantalla Sesión). */
export function cardQuickForm(ctx, source, onAdded, idPrefix) {
  const draft = { kind: 'expresion', prompt: '', answer: '' };
  const prompt = textField({ id: `${idPrefix}-pista`, label: CARD_KINDS.expresion.prompt, value: '', onInput: (v) => (draft.prompt = v), autocapitalize: 'sentences' });
  const answer = textField({ id: `${idPrefix}-respuesta`, label: CARD_KINDS.expresion.answer, value: '', lang: 'fr', onInput: (v) => (draft.answer = v), autocapitalize: 'sentences' });
  const errorEl = h('p', { class: 'form-error', role: 'alert' });
  const kind = chips(kindOptions, draft.kind, (v) => {
    draft.kind = v;
    prompt.querySelector('label').textContent = CARD_KINDS[v].prompt;
    answer.querySelector('label').textContent = CARD_KINDS[v].answer;
  }, { label: 'Tipo de tarjeta' });
  const add = () => {
    if (!draft.answer.trim()) {
      errorEl.textContent = `Escribe la ${CARD_KINDS[draft.kind].answer.toLowerCase()}.`;
      return;
    }
    errorEl.textContent = '';
    const card = newCard({ kind: draft.kind, prompt: draft.prompt.trim(), answer: draft.answer.trim(), source }, today());
    ctx.sync.update(`Repaso: nueva tarjeta «${short(card.answer, 30)}»`, (d) => d.cards.push(card));
    prompt.input.value = '';
    answer.input.value = '';
    draft.prompt = '';
    draft.answer = '';
    toast(`Tarjeta creada · primer repaso ${relativeDay(card.due)}`);
    onAdded?.(card);
  };
  return h('div', { class: 'subcard' }, groupLabel('Tipo', kind), prompt, answer, errorEl, h('button', { type: 'button', class: 'btn', text: 'Añadir tarjeta', on: { click: add } }));
}

/** Ventana para crear o editar una tarjeta. */
export function openCardDialog(ctx, { cardId = '', onDone } = {}) {
  const existing = cardId ? ctx.sync.data.cards.find((c) => c.id === cardId) : null;
  const draft = existing ? { kind: existing.kind, prompt: existing.prompt, answer: existing.answer, note: existing.note } : { kind: 'expresion', prompt: '', answer: '', note: '' };
  const prompt = textField({ id: 'tarjeta-pista', label: CARD_KINDS[draft.kind].prompt, value: draft.prompt, multiline: true, rows: 2, onInput: (v) => (draft.prompt = v) });
  const answer = textField({ id: 'tarjeta-respuesta', label: CARD_KINDS[draft.kind].answer, value: draft.answer, multiline: true, rows: 2, lang: 'fr', onInput: (v) => (draft.answer = v) });
  const note = textField({ id: 'tarjeta-nota', label: 'Nota (opcional)', value: draft.note, multiline: true, rows: 2, onInput: (v) => (draft.note = v) });
  const kind = chips(kindOptions, draft.kind, (v) => {
    draft.kind = v;
    prompt.querySelector('label').textContent = CARD_KINDS[v].prompt;
    answer.querySelector('label').textContent = CARD_KINDS[v].answer;
  }, { label: 'Tipo de tarjeta' });
  const errorEl = h('p', { class: 'form-error', role: 'alert' });
  const content = [groupLabel('Tipo', kind), prompt, answer, note, errorEl];

  let dlg;
  if (existing) {
    const t = today();
    const info = existing.archived
      ? 'Archivada: no aparece en los repasos.'
      : `Próximo repaso: ${formatDay(existing.due)} (${relativeDay(existing.due, t)}) · intervalo actual: ${intervalDays(existing)} días.`;
    const editCard = (label, fn) => {
      ctx.sync.update(`Repaso: ${label} «${short(existing.answer, 30)}»`, (d) => {
        const c = d.cards.find((x) => x.id === cardId);
        if (c) {
          fn(c, d);
          c.updatedAt = nowIso();
        }
      });
      dlg.close();
      onDone?.();
    };
    content.push(
      h('div', { class: 'subcard' }, h('p', { text: info }), existing.reviews.length ? h('p', { class: 'hint', text: `Repasada ${existing.reviews.length} veces. Última: ${formatDateTime(existing.reviews[existing.reviews.length - 1].at)}.` }) : null,
        h('div', { class: 'row-actions' },
          existing.archived ? null : h('button', { type: 'button', class: 'btn secondary small', text: 'Repasar mañana', on: { click: () => editCard('repasar mañana', (c) => ((c.due = addDays(t, 1)), (c.repeatToday = ''))) } }),
          h('button', { type: 'button', class: 'btn secondary small', text: existing.archived ? 'Volver a repasarla' : 'Archivar', on: { click: () => editCard(existing.archived ? 'desarchivar' : 'archivar', (c) => {
            c.archived = !c.archived;
            if (!c.archived && c.due < t) c.due = addDays(t, 1);
          }) } }),
          h('button', { type: 'button', class: 'btn danger small', text: 'Eliminar', on: { click: async () => {
            dlg.close();
            if (await confirmDialog('Se eliminará esta tarjeta y su historial de repasos.', { title: '¿Eliminar la tarjeta?', confirmLabel: 'Eliminar', danger: true })) {
              ctx.sync.update(`Repaso: eliminar tarjeta «${short(existing.answer, 30)}»`, (d) => (d.cards = d.cards.filter((c) => c.id !== cardId)));
              toast('Tarjeta eliminada');
            }
            onDone?.();
          } } }),
        ),
      ),
    );
  } else {
    content.push(h('p', { class: 'hint', text: `Primer repaso: mañana. Después: ${REVIEW_INTERVALS.join(', ')} días si te sale sin ayuda.` }));
  }

  dlg = openDialog({
    title: existing ? 'Editar tarjeta' : 'Nueva tarjeta',
    content,
    actions: [
      { label: 'Cancelar', class: 'secondary' },
      {
        label: 'Guardar',
        class: 'primary',
        onClick: () => {
          if (!draft.answer.trim()) {
            errorEl.textContent = `Escribe la ${CARD_KINDS[draft.kind].answer.toLowerCase()}.`;
            return false;
          }
          const values = { kind: draft.kind, prompt: draft.prompt.trim(), answer: draft.answer.trim(), note: draft.note.trim() };
          if (existing) {
            ctx.sync.update(`Repaso: editar tarjeta «${short(values.answer, 30)}»`, (d) => {
              const c = d.cards.find((x) => x.id === cardId);
              if (c) Object.assign(c, values, { updatedAt: nowIso() });
            });
          } else {
            const card = newCard(values, today());
            ctx.sync.update(`Repaso: nueva tarjeta «${short(card.answer, 30)}»`, (d) => d.cards.push(card));
            toast('Tarjeta creada · primer repaso mañana');
          }
          onDone?.();
          return true;
        },
      },
    ],
  });
}

/**
 * Ventana para crear varias tarjetas de una vez (expresiones del
 * REGISTRO o errores de una corrección). Puedes corregirlas antes.
 * items: [{ prompt, answer, note }]
 */
export function openBulkCardsDialog(ctx, { kind, items, source, onDone }) {
  const labels = CARD_KINDS[kind];
  const existing = new Set(ctx.sync.data.cards.filter((k) => k.source.id === source.id).map((k) => k.answer.trim().toLowerCase()));
  const rows = items.map((item, i) => {
    const already = existing.has(item.answer.trim().toLowerCase());
    const row = { use: !already, answer: item.answer, prompt: item.prompt || '', note: item.note || '' };
    const check = h('input', { type: 'checkbox', checked: row.use, id: `lote-usar-${i}` });
    check.addEventListener('change', () => (row.use = check.checked));
    row.el = h('div', { class: 'subcard' },
      h('label', { class: 'check', for: `lote-usar-${i}` }, check, h('span', { text: already ? ' Crear (ya existe una tarjeta igual)' : ' Crear esta tarjeta' })),
      textField({ id: `lote-pista-${i}`, label: labels.prompt, value: row.prompt, compact: true, lang: kind === 'error' ? 'fr' : undefined, onInput: (v) => (row.prompt = v) }),
      textField({ id: `lote-respuesta-${i}`, label: labels.answer, value: row.answer, lang: 'fr', compact: true, onInput: (v) => (row.answer = v) }),
      row.note ? h('p', { class: 'hint', text: `Nota: ${row.note}` }) : null,
    );
    return row;
  });
  const errorEl = h('p', { class: 'form-error', role: 'alert' });
  openDialog({
    title: 'Crear tarjetas de repaso',
    content: [h('p', { class: 'hint', text: 'Revisa y corrige antes de crear. El primer repaso será mañana.' }), ...rows.map((r) => r.el), errorEl],
    actions: [
      { label: 'Cancelar', class: 'secondary' },
      {
        label: 'Crear tarjetas',
        class: 'primary',
        onClick: () => {
          const chosen = rows.filter((r) => r.use && r.answer.trim());
          if (!chosen.length) {
            errorEl.textContent = 'No elegiste ninguna tarjeta.';
            return false;
          }
          const t = today();
          const cards = chosen.map((r) => newCard({ kind, prompt: r.prompt.trim(), answer: r.answer.trim(), note: r.note.trim(), source }, t));
          const from = source.type === 'conversation' ? 'una conversación' : 'una sesión';
          ctx.sync.update(`Repaso: ${cards.length} ${cards.length === 1 ? 'tarjeta' : 'tarjetas'} desde ${from}`, (d) => d.cards.push(...cards));
          toast(`${cards.length} ${cards.length === 1 ? 'tarjeta creada' : 'tarjetas creadas'} · primer repaso mañana`);
          onDone?.(cards.length);
          return true;
        },
      },
    ],
  });
}

/** Mensaje de «no encontrado» con botón para volver. */
export function notFound(main, text, href, label = 'Volver') {
  main.append(h('h1', { text: 'No encontrado' }), h('p', { text }), h('a', { class: 'btn', href, text: label }));
}
