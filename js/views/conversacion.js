// Pantalla «Conversación»: arma la consigna para ChatGPT Voice
// con una plantilla, cópiala, abre ChatGPT y, al volver, pega el
// REGISTRO. El registro se guarda íntegro y NO cambia estados ni
// fechas por sí solo: la app te propone acciones y tú confirmas.
import { DIFFICULTIES, ROLE_SUGGESTIONS, skillLabel, statusLabel, difficultyOf } from '../config.js';
import { h, chips, groupLabel, textField, section, empty, button, toast, confirmDialog, copyText, externalLink, fitTextarea, openDialog } from '../dom.js';
import { today, dayKey, formatDay, formatShort, formatDateTime } from '../dates.js';
import { newConversation, newCard, objectiveTitle, refText, nowIso } from '../model.js';
import { buildPrompt, parseRegistro, DEFAULT_TEMPLATE, REGISTRO_FIELDS } from '../registro.js';
import { refEditor, objectivePicker, openStatusDialog, byCreatedDesc, byUpdatedDesc, short, notFound } from '../components.js';

const CHATGPT_URL = 'https://chatgpt.com/';

export const templateOf = (data) => data.settings.promptTemplate.trim() || DEFAULT_TEMPLATE;

/** Valores que rellenan la plantilla. */
export function promptValues(conv, data) {
  const obj = data.objectives.find((o) => o.id === conv.objectiveId);
  return {
    fecha: formatDay(dayKey(new Date(conv.createdAt)), { year: true }),
    objetivo: obj?.title || '(sin especificar)',
    habilidad: obj ? skillLabel(obj.skill) : 'interacción oral',
    rol: conv.role.trim() || 'un(e) francophone amable que conversa conmigo',
    dificultad: difficultyOf(conv.difficulty).text,
    referencia: refText(conv.ref) || '(sin referencia)',
    expresion1: conv.expr1.trim() || '(libre)',
    expresion2: conv.expr2.trim() || '(libre)',
    errores: conv.errors.trim() || '(ninguno en especial)',
  };
}

/**
 * Crea una conversación nueva y devuelve su id. Si no se indica
 * objetivo, usa el de la sesión abierta más reciente.
 */
export function createConversation(ctx, defaults = {}) {
  const data = ctx.sync.data;
  let init = defaults;
  if (!defaults.objectiveId) {
    const open = data.sessions.filter((s) => !s.closedAt).sort(byUpdatedDesc)[0];
    if (open) init = { objectiveId: open.objectiveId, ref: open.ref, sessionId: open.id };
  }
  const conv = newConversation(init);
  conv.prompt = buildPrompt(templateOf(data), promptValues(conv, data));
  ctx.sync.update(`Conversación del ${formatShort(conv.createdAt)}: nueva consigna`, (d) => d.conversations.push(conv));
  return conv.id;
}

export function render(main, ctx, params) {
  const [id] = params;
  if (id) {
    if (!ctx.sync.data.conversations.some((c) => c.id === id)) return notFound(main, 'No encuentro esta conversación. Quizá se borró en otro dispositivo.', '#/conversacion');
    return renderConversation(main, ctx, id);
  }
  return renderList(main, ctx);
}

// ── Lista ─────────────────────────────────────────────────────

function renderList(main, ctx) {
  const data = ctx.sync.data;
  main.append(
    h('h1', { text: 'Conversación' }),
    h('p', { class: 'subtitle', text: 'Prepara una consigna, practica con ChatGPT Voice y pega aquí el REGISTRO al terminar.' }),
    button('Nueva consigna', () => ctx.go(`#/conversacion/${createConversation(ctx)}`), 'primary big block'),
  );
  const item = (c) =>
    h('a', { class: 'item link-item', href: `#/conversacion/${c.id}` },
      h('div', { class: 'item-main' },
        h('p', { class: 'item-title', text: objectiveTitle(data, c.objectiveId) || 'Conversación sin objetivo' }),
        h('p', { class: 'item-meta', text: [formatShort(c.createdAt), c.role && short(c.role, 50), refText(c.ref)].filter(Boolean).join(' · ') }),
      ),
    );
  const all = [...data.conversations].sort(byCreatedDesc);
  const waiting = all.filter((c) => !c.registro.trim());
  const done = all.filter((c) => c.registro.trim());
  if (waiting.length) main.append(section('Esperando el REGISTRO', ...waiting.map(item)));
  main.append(section('Con registro', done.length ? done.slice(0, 60).map(item) : empty('Todavía no has guardado ningún registro.')));
}

// ── Una conversación ──────────────────────────────────────────

function renderConversation(main, ctx, id) {
  const data = ctx.sync.data;
  const get = () => ctx.sync.data.conversations.find((c) => c.id === id);
  const c = get();
  const label = `Conversación del ${formatShort(c.createdAt)}`;
  const edit = (what, fn) =>
    ctx.sync.update(`${label}: ${what}`, (d) => {
      const x = d.conversations.find((y) => y.id === id);
      if (x) {
        fn(x, d);
        x.updatedAt = nowIso();
      }
    });

  // Paso 2 (se crea antes porque los campos del paso 1 lo actualizan)
  const promptField = textField({
    id: 'conv-consigna',
    label: 'Consigna para ChatGPT',
    hint: 'Puedes editarla aquí antes de copiarla.',
    value: c.prompt,
    multiline: true,
    rows: 10,
    onInput: (v) => {
      edit('consigna', (x) => {
        x.prompt = v;
        x.promptEdited = true;
      });
      paintEdited();
    },
  });
  const editedNote = h('div', { class: 'note' },
    h('p', { text: 'Editaste la consigna a mano, así que ya no cambia sola cuando cambias los campos.' }),
    button('Volver a generarla desde los campos', async () => {
      if (!(await confirmDialog('Se perderán los cambios que hiciste a mano en la consigna.', { title: '¿Volver a generar la consigna?', confirmLabel: 'Generar de nuevo' }))) return;
      edit('generar consigna', (x, d) => {
        x.promptEdited = false;
        x.prompt = buildPrompt(templateOf(d), promptValues(x, d));
      });
      promptField.input.value = get().prompt;
      fitTextarea(promptField.input);
      paintEdited();
    }, 'secondary small'),
  );
  const paintEdited = () => (editedNote.hidden = !get().promptEdited);
  paintEdited();

  // Cambia un campo del paso 1 y, si no editaste la consigna a mano, la regenera.
  const fieldChanged = (what, fn) => {
    edit(what, (x, d) => {
      fn(x);
      if (!x.promptEdited) x.prompt = buildPrompt(templateOf(d), promptValues(x, d));
    });
    const x = get();
    if (!x.promptEdited && document.activeElement !== promptField.input) {
      promptField.input.value = x.prompt;
      fitTextarea(promptField.input);
    }
  };

  main.append(h('h1', { text: 'Conversación' }), h('p', { class: 'subtitle', text: formatDay(dayKey(new Date(c.createdAt))) }));

  // Paso 1
  const roles = h('datalist', { id: 'roles-sugeridos' }, ROLE_SUGGESTIONS.map((r) => h('option', { value: r })));
  const errorsField = textField({ id: 'conv-errores', label: 'Errores a repasar', hint: 'Uno por línea. Por ejemplo: «je suis allé au le marché» → «au marché».', value: c.errors, multiline: true, rows: 3, lang: 'fr', onInput: (v) => fieldChanged('errores', (x) => (x.errors = v)) });
  const bringErrors = button('Traer errores de mis tarjetas', () => {
    const recent = ctx.sync.data.cards.filter((k) => k.kind === 'error' && !k.archived).sort(byUpdatedDesc).slice(0, 3);
    if (!recent.length) {
      toast('No tienes tarjetas de errores todavía.');
      return;
    }
    const lines = recent.map((k) => (k.prompt ? `«${k.prompt}» → «${k.answer}»` : `«${k.answer}»`));
    const current = errorsField.input.value.trim();
    const value = [current, ...lines.filter((l) => !current.includes(l))].filter(Boolean).join('\n');
    errorsField.input.value = value;
    fitTextarea(errorsField.input);
    fieldChanged('errores', (x) => (x.errors = value));
  }, 'secondary small');

  main.append(
    section(
      '1. Prepara la consigna',
      objectivePicker(data, c.objectiveId, (v) => fieldChanged('objetivo', (x) => (x.objectiveId = v)), { id: 'conv-objetivo' }),
      roles,
      textField({ id: 'conv-rol', label: 'Rol de ChatGPT', hint: 'Quién es ChatGPT en la conversación. Puedes elegir una sugerencia o escribir otro.', value: c.role, list: 'roles-sugeridos', autocapitalize: 'sentences', lang: 'fr', onInput: (v) => fieldChanged('rol', (x) => (x.role = v)) }),
      groupLabel('Dificultad', chips(DIFFICULTIES.map((d) => ({ value: d.id, label: d.label })), c.difficulty, (v) => fieldChanged('dificultad', (x) => (x.difficulty = v)), { label: 'Dificultad' })),
      h('h3', { text: 'Referencia de Édito' }),
      refEditor(data, c.ref, (ref, what) => fieldChanged(what, (x) => (x.ref = ref)), { idPrefix: 'conv' }),
      h('div', { class: 'two-cols' },
        textField({ id: 'conv-expr1', label: 'Expresión 1', value: c.expr1, lang: 'fr', autocapitalize: 'none', onInput: (v) => fieldChanged('expresión 1', (x) => (x.expr1 = v)) }),
        textField({ id: 'conv-expr2', label: 'Expresión 2', value: c.expr2, lang: 'fr', autocapitalize: 'none', onInput: (v) => fieldChanged('expresión 2', (x) => (x.expr2 = v)) }),
      ),
      errorsField,
      bringErrors,
    ),
  );

  // Paso 2
  main.append(
    section(
      '2. Copia la consigna y habla con ChatGPT',
      promptField,
      editedNote,
      h('div', { class: 'row-actions' },
        button('Copiar consigna', async () => toast((await copyText(promptField.input.value)) ? 'Consigna copiada' : 'No se pudo copiar. Selecciona el texto y cópialo a mano.'), 'primary'),
        externalLink('Abrir ChatGPT', CHATGPT_URL, 'btn secondary'),
      ),
      h('ol', { class: 'steps' },
        h('li', { text: 'Copia la consigna y ábrela en ChatGPT: pégala y envíala.' }),
        h('li', { text: 'Toca el botón de voz y habla en francés.' }),
        h('li', { text: 'Al terminar di «on termine». Cuando ChatGPT escriba el REGISTRO, cópialo y vuelve aquí.' }),
      ),
    ),
  );

  // Paso 3
  const analysis = h('div', { class: 'analysis', 'aria-live': 'polite' });
  let analysisTimer = null;
  const registroField = textField({
    id: 'conv-registro',
    label: 'REGISTRO de ChatGPT',
    hint: 'Pega aquí el texto completo. Se guarda tal cual, como texto.',
    value: c.registro,
    multiline: true,
    rows: 8,
    autocapitalize: 'none',
    onInput: (v) => {
      edit('registro', (x) => {
        x.registro = v;
        if (!x.registroAt && v.trim()) x.registroAt = nowIso();
      });
      clearTimeout(analysisTimer);
      analysisTimer = setTimeout(paintAnalysis, 400);
    },
  });

  const paintAnalysis = () => {
    const x = get();
    if (!x) return;
    analysis.replaceChildren();
    if (!x.registro.trim()) return;
    const d = ctx.sync.data;
    const parsed = parseRegistro(x.registro);
    const box = h('div', { class: 'subcard' }, h('h3', { text: 'Lo que encontré en el registro' }));
    if (!parsed.found) {
      box.append(h('p', { text: 'No reconozco el formato del REGISTRO. Se guardó tal cual; puedes cambiar estados y crear tarjetas a mano.' }));
      analysis.append(box);
      return;
    }
    const fields = h('dl', { class: 'fields' });
    for (const f of REGISTRO_FIELDS) {
      if (parsed.fields[f.key]) fields.append(h('dt', { text: f.label }), h('dd', { class: 'pre', text: parsed.fields[f.key] }));
    }
    box.append(h('details', {}, h('summary', { text: 'Ver los campos leídos' }), fields));

    // Estado sugerido
    const obj = d.objectives.find((o) => o.id === x.objectiveId);
    if (parsed.status) {
      if (!obj) {
        box.append(h('p', { text: `Estado sugerido: ${statusLabel(parsed.status)}. Para cambiar el estado de un objetivo, elígelo en el paso 1.` }));
      } else if (obj.status === parsed.status) {
        box.append(h('p', { text: `Estado sugerido: ${statusLabel(parsed.status)}. Coincide con el estado actual de «${obj.title}».` }));
      } else {
        const evidence = parsed.fields.evidencia ? ` Evidencia: ${short(parsed.fields.evidencia, 280)}` : '';
        box.append(
          h('p', { text: `Estado sugerido: ${statusLabel(parsed.status)} (ahora: ${statusLabel(obj.status)}).` }),
          button('Revisar y cambiar el estado…', () =>
            openStatusDialog(ctx, obj.id, {
              suggested: parsed.status,
              reason: `Registro de la conversación del ${formatShort(x.createdAt)}.${evidence}`,
              source: { type: 'conversation', id },
              onDone: ({ from, to }) => {
                edit('acción confirmada', (y) => y.actions.push({ at: nowIso(), text: `Estado de «${obj.title}»: ${statusLabel(from)} → ${statusLabel(to)}` }));
                paintAnalysis();
              },
            }), 'secondary'),
        );
      }
    }

    // Expresiones
    if (parsed.expressions.length) {
      box.append(
        h('p', { text: `Expresiones para recuperar: ${parsed.expressions.length}.` }),
        button('Crear tarjetas de repaso…', () => openExpressionsDialog(ctx, id, parsed.expressions, (n) => {
          edit('acción confirmada', (y) => y.actions.push({ at: nowIso(), text: `${n} ${n === 1 ? 'tarjeta creada' : 'tarjetas creadas'}` }));
          paintAnalysis();
        }), 'secondary'),
      );
    }
    box.append(h('p', { class: 'hint', text: 'Nada cambia hasta que tú lo confirmes.' }));

    const actions = get().actions;
    if (actions.length) {
      box.append(h('h3', { text: 'Ya confirmaste' }), h('ul', { class: 'plain-list' }, actions.map((a) => h('li', { text: `${formatDateTime(a.at)} · ${a.text}` }))));
    }
    analysis.append(box);
  };
  paintAnalysis();

  main.append(section('3. Pega el REGISTRO', registroField, analysis));

  main.append(
    h('div', { class: 'row-actions spaced' },
      button('Eliminar conversación', async () => {
        if (await confirmDialog('Se eliminará esta conversación con su consigna y su registro. (Seguirá en el historial de GitHub.)', { title: '¿Eliminar la conversación?', confirmLabel: 'Eliminar', danger: true })) {
          ctx.sync.update(`${label}: eliminar`, (d) => (d.conversations = d.conversations.filter((x) => x.id !== id)));
          toast('Conversación eliminada');
          ctx.go('#/conversacion');
        }
      }, 'danger'),
    ),
  );
  return () => clearTimeout(analysisTimer);
}

/** Ventana para elegir qué expresiones del registro pasan a ser tarjetas. */
function openExpressionsDialog(ctx, convId, expressions, onDone) {
  const existing = new Set(ctx.sync.data.cards.filter((k) => k.source.id === convId).map((k) => k.answer.trim().toLowerCase()));
  const rows = expressions.map((e, i) => {
    const already = existing.has(e.answer.trim().toLowerCase());
    const row = { use: !already, answer: e.answer, prompt: e.prompt };
    const check = h('input', { type: 'checkbox', checked: row.use, id: `expr-usar-${i}` });
    check.addEventListener('change', () => (row.use = check.checked));
    row.el = h('div', { class: 'subcard' },
      h('label', { class: 'check', for: `expr-usar-${i}` }, check, h('span', { text: already ? ' Crear (ya existe una tarjeta igual)' : ' Crear esta tarjeta' })),
      textField({ id: `expr-respuesta-${i}`, label: 'Expresión en francés', value: e.answer, lang: 'fr', compact: true, onInput: (v) => (row.answer = v) }),
      textField({ id: `expr-pista-${i}`, label: 'Pista (significado o situación)', value: e.prompt, compact: true, onInput: (v) => (row.prompt = v) }),
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
            errorEl.textContent = 'No elegiste ninguna expresión.';
            return false;
          }
          const t = today();
          const cards = chosen.map((r) => newCard({ kind: 'expresion', prompt: r.prompt.trim(), answer: r.answer.trim(), source: { type: 'conversation', id: convId } }, t));
          ctx.sync.update(`Repaso: ${cards.length} tarjetas desde una conversación`, (d) => d.cards.push(...cards));
          toast(`${cards.length} ${cards.length === 1 ? 'tarjeta creada' : 'tarjetas creadas'}`);
          onDone(cards.length);
          return true;
        },
      },
    ],
  });
}
