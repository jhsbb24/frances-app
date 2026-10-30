// Pantalla «Conversación»: arma la consigna para ChatGPT Voice
// con una plantilla, cópiala, abre ChatGPT y, al volver, pega el
// REGISTRO. El registro se guarda íntegro y NO cambia estados ni
// fechas por sí solo: la app te propone acciones y tú confirmas.
import { DIFFICULTIES, ROLE_SUGGESTIONS, CHATGPT_URL, statusLabel, difficultyOf } from '../config.js';
import { h, chips, groupLabel, textField, section, empty, button, toast, confirmDialog, copyText, externalLink, fitTextarea } from '../dom.js';
import { dayKey, formatDay, formatShort, formatDateTime } from '../dates.js';
import { newConversation, objectiveTitle, refText, nowIso } from '../model.js';
import { buildPrompt, parseRegistro, DEFAULT_TEMPLATE, REGISTRO_FIELDS, objectiveValues, statusDefinitions, plain } from '../registro.js';
import { refEditor, objectivePicker, openStatusDialog, openBulkCardsDialog, byCreatedDesc, byUpdatedDesc, short, notFound } from '../components.js';

export const templateOf = (data) => data.settings.promptTemplate.trim() || DEFAULT_TEMPLATE;

/** Valores que rellenan la plantilla. */
export function promptValues(conv, data) {
  const obj = data.objectives.find((o) => o.id === conv.objectiveId);
  return {
    ...objectiveValues(obj),
    fecha: formatDay(dayKey(new Date(conv.createdAt)), { year: true }),
    estados: statusDefinitions(),
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
 * `extra` puede traer rol, dificultad, expresiones y errores.
 */
export function createConversation(ctx, defaults = {}, extra = {}) {
  const data = ctx.sync.data;
  let init = defaults;
  if (!defaults.objectiveId) {
    const open = data.sessions.filter((s) => !s.closedAt).sort(byUpdatedDesc)[0];
    if (open) init = { objectiveId: open.objectiveId, ref: open.ref, sessionId: open.id };
  }
  const conv = newConversation(init);
  for (const key of ['role', 'difficulty', 'expr1', 'expr2', 'errors']) if (typeof extra[key] === 'string') conv[key] = extra[key];
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

const listFilter = { text: '' };

function renderList(main, ctx) {
  const data = ctx.sync.data;
  const results = h('div', {});
  const item = (c) => {
    const logro = c.registro.trim() ? parseRegistro(c.registro).fields.logro : '';
    return h('a', { class: 'item link-item', href: `#/conversacion/${c.id}` },
      h('div', { class: 'item-main' },
        h('p', { class: 'item-title', text: objectiveTitle(data, c.objectiveId) || 'Conversación sin objetivo' }),
        h('p', { class: 'item-meta', text: [formatShort(c.createdAt), c.role && short(c.role, 50), refText(c.ref)].filter(Boolean).join(' · ') }),
        logro ? h('p', { class: 'item-text', text: `Logro: ${short(logro, 120)}` }) : null,
      ),
    );
  };
  const paint = () => {
    const words = plain(listFilter.text).split(/\s+/).filter(Boolean);
    const text = (c) => plain([objectiveTitle(data, c.objectiveId), c.role, refText(c.ref), c.expr1, c.expr2, c.errors, c.registro].join(' '));
    const all = data.conversations.filter((c) => words.every((w) => text(c).includes(w))).sort(byCreatedDesc);
    const waiting = all.filter((c) => !c.registro.trim());
    const done = all.filter((c) => c.registro.trim());
    results.replaceChildren();
    if (waiting.length) results.append(section('Esperando el REGISTRO', ...waiting.map(item)));
    const none = words.length ? 'Ninguna conversación contiene ese texto.' : 'Todavía no has guardado ningún registro.';
    results.append(section('Con registro', done.length ? done.slice(0, 80).map(item) : empty(none)));
  };
  const search = h('input', { type: 'search', id: 'conversaciones-buscar', placeholder: 'Buscar en consignas y registros…', autocomplete: 'off', 'aria-label': 'Buscar en tus conversaciones' });
  search.value = listFilter.text;
  search.addEventListener('input', () => ((listFilter.text = search.value), paint()));
  main.append(
    h('h1', { text: 'Conversación' }),
    h('p', { class: 'subtitle', text: 'Prepara una consigna, practica con ChatGPT Voice y pega aquí el REGISTRO al terminar.' }),
    button('Nueva consigna', () => ctx.go(`#/conversacion/${createConversation(ctx)}`), 'primary big block'),
    h('div', { class: 'toolbar' }, search),
    results,
  );
  paint();
}

/** Añade texto a un campo sin borrar lo que ya había (y sin repetirlo). */
export const appendText = (current, addition) => {
  const a = String(addition || '').trim();
  const c = String(current || '').trim();
  if (!a || c.includes(a)) return current;
  return c ? `${c}\n${a}` : a;
};

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
    // Los botones vuelven a leer el REGISTRO al tocarlos, por si acabas de cambiarlo.
    const fresh = () => parseRegistro(get()?.registro || '');
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
        box.append(
          h('p', { text: `Estado sugerido: ${statusLabel(parsed.status)} (ahora: ${statusLabel(obj.status)}).` }),
          button('Revisar y cambiar el estado…', () => {
            const now = fresh();
            const evidence = now.fields.evidencia ? ` Evidencia: ${short(now.fields.evidencia, 280)}` : '';
            openStatusDialog(ctx, obj.id, {
              suggested: now.status || '',
              reason: `Registro de la conversación del ${formatShort(x.createdAt)}.${evidence}`,
              source: { type: 'conversation', id },
              onDone: ({ from, to }) => {
                edit('acción confirmada', (y) => y.actions.push({ at: nowIso(), text: `Estado de «${obj.title}»: ${statusLabel(from)} → ${statusLabel(to)}` }));
                paintAnalysis();
              },
            });
          }, 'secondary'),
        );
      }
    }

    // Expresiones
    if (parsed.expressions.length) {
      box.append(
        h('p', { text: `Expresiones para recuperar: ${parsed.expressions.length}.` }),
        button('Crear tarjetas de repaso…', () => openBulkCardsDialog(ctx, {
          kind: 'expresion',
          items: fresh().expressions,
          source: { type: 'conversation', id },
          onDone: (n) => {
            edit('acción confirmada', (y) => y.actions.push({ at: nowIso(), text: `${n} ${n === 1 ? 'tarjeta creada' : 'tarjetas creadas'}` }));
            paintAnalysis();
          },
        }), 'secondary'),
      );
    }
    // Pasar al cierre de la sesión de la que salió esta conversación
    const session = d.sessions.find((y) => y.id === x.sessionId);
    const closingFrom = (p) =>
      [
        ['achievement', 'Logro', p.fields.logro],
        ['difficulty', 'Dificultad', p.fields.prioridad],
        ['nextStep', 'Siguiente paso', p.fields.siguiente],
      ].filter(([, , value]) => value);
    const closingMap = closingFrom(parsed);
    if (session && closingMap.length) {
      box.append(
        h('p', { text: `Puedes pasar ${closingMap.map(([, name]) => name.toLowerCase()).join(', ')} al cierre de la sesión del ${formatShort(session.createdAt)}.` }),
        button('Pasar al cierre de la sesión…', async () => {
          const items = closingFrom(fresh());
          if (!items.length) return;
          const ok = await confirmDialog(`Se añadirá al cierre de la sesión del ${formatShort(session.createdAt)}: ${items.map(([, name, value]) => `${name}: «${short(value, 80)}»`).join(' · ')}. Lo que ya tenía el cierre no se borra.`, { title: '¿Pasar al cierre de la sesión?', confirmLabel: 'Pasar al cierre' });
          if (!ok) return;
          ctx.sync.update(`Sesión del ${formatShort(session.createdAt)}: cierre desde el REGISTRO`, (dd) => {
            const target = dd.sessions.find((y) => y.id === session.id);
            if (!target) return;
            for (const [field, , value] of items) target.closing[field] = appendText(target.closing[field], value);
            target.updatedAt = nowIso();
          });
          edit('acción confirmada', (y) => y.actions.push({ at: nowIso(), text: 'Registro pasado al cierre de la sesión' }));
          toast('Pasado al cierre de la sesión');
          paintAnalysis();
        }, 'secondary'),
      );
    }

    box.append(
      h('p', { class: 'hint', text: 'Nada cambia hasta que tú lo confirmes.' }),
      button('Repetir esta práctica', () => {
        const priority = fresh().fields.prioridad || '';
        const newId = createConversation(
          ctx,
          { objectiveId: x.objectiveId, ref: x.ref, sessionId: x.sessionId },
          { role: x.role, difficulty: x.difficulty, expr1: x.expr1, expr2: x.expr2, errors: appendText(x.errors, priority) },
        );
        toast('Consigna nueva con la prioridad del registro');
        ctx.go(`#/conversacion/${newId}`);
      }, 'secondary'),
    );

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
