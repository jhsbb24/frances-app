// ─────────────────────────────────────────────────────────────
// Herramientas para construir la interfaz.
// IMPORTANTE: nunca se usa innerHTML. Todo texto se inserta como
// texto plano (textContent / value), así nada de lo que pegues
// puede convertirse en HTML ni ejecutar nada.
// ─────────────────────────────────────────────────────────────

/** Crea un elemento: h('button', { class: 'btn', on: { click } }, 'Texto') */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'value') el.value = value;
    else if (key === 'on') for (const [event, fn] of Object.entries(value)) el.addEventListener(event, fn);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (['checked', 'disabled', 'selected', 'hidden', 'open', 'required', 'multiple'].includes(key)) el[key] = Boolean(value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === undefined || child === null || child === false || child === '') continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

// ── Iconos (dibujos SVG fijos, sin datos del usuario) ─────────

const ICONS = {
  hoy: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  sesion: ['M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M12 9v4l3 2', 'M9 2h6'],
  chat: ['M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20.5l1.6-4.4A8 8 0 0 1 3 11.5 8.6 8.6 0 0 1 12 3a8.6 8.6 0 0 1 9 8.5z'],
  repaso: ['M3 12a9 9 0 0 1 15.5-6.2L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-15.5 6.2L3 16', 'M3 21v-5h5'],
  libro: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'],
  objetivo: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M12 12h.01'],
  progreso: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
  ajustes: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
  mas: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  externo: ['M14 4h6v6', 'M20 4 10 14', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
  copiar: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  cerrar: ['M6 6l12 12', 'M18 6 6 18'],
  mas_simple: ['M12 5v14', 'M5 12h14'],
};

export function icon(name, size = 24) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  for (const d of ICONS[name] || []) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

// ── Avisos breves ─────────────────────────────────────────────

let toastTimer = null;
export function toast(text) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ── Campos de formulario ──────────────────────────────────────

/** Ajusta la altura de un textarea a su contenido. */
export function fitTextarea(ta) {
  if (!ta.isConnected || ta.offsetParent === null) return;
  ta.style.height = 'auto';
  ta.style.height = `${ta.scrollHeight + 2}px`;
}

export function refitAll(root = document) {
  for (const ta of root.querySelectorAll('textarea.autosize')) fitTextarea(ta);
}

let uid = 0;
const nextId = (prefix) => `${prefix}-${++uid}`;

/**
 * Campo de texto con etiqueta.
 * opts: { id, label, hint, value, onInput, multiline, rows, lang, placeholder, type }
 */
export function textField(opts) {
  const id = opts.id || nextId('campo');
  const common = {
    id,
    placeholder: opts.placeholder,
    lang: opts.lang,
    autocomplete: 'off',
    autocapitalize: opts.autocapitalize || (opts.multiline ? 'sentences' : 'off'),
    spellcheck: opts.spellcheck === false ? 'false' : undefined,
    list: opts.list,
    inputmode: opts.inputmode,
    maxlength: opts.maxlength,
  };
  const input = opts.multiline
    ? h('textarea', { ...common, rows: opts.rows || 3, class: 'autosize' })
    : h('input', { ...common, type: opts.type || 'text' });
  input.value = opts.value || '';
  if (opts.onInput) input.addEventListener('input', () => opts.onInput(input.value));
  if (opts.multiline) {
    input.addEventListener('input', () => fitTextarea(input));
    requestAnimationFrame(() => fitTextarea(input));
  }
  const wrap = h(
    'div',
    { class: `field${opts.compact ? ' compact' : ''}` },
    h('label', { for: id, class: 'field-label', text: opts.label }),
    opts.hint ? h('p', { class: 'hint', id: `${id}-hint`, text: opts.hint }) : null,
    input,
  );
  if (opts.hint) input.setAttribute('aria-describedby', `${id}-hint`);
  wrap.input = input;
  return wrap;
}

/** Grupo de botones para elegir una opción (como pestañas). */
export function chips(options, value, onChange, { label, id } = {}) {
  const group = h('div', { class: 'chips', role: 'group', 'aria-label': label, id });
  const paint = (current) => {
    for (const btn of group.children) btn.setAttribute('aria-pressed', String(btn.dataset.value === String(current)));
  };
  for (const opt of options) {
    group.append(
      h('button', {
        type: 'button',
        class: 'chip',
        dataset: { value: String(opt.value) },
        text: opt.label,
        on: {
          click: () => {
            paint(opt.value);
            onChange(opt.value);
          },
        },
      }),
    );
  }
  paint(value);
  group.setValue = paint;
  return group;
}

/** Desplegable. options: [{ value, label }] o grupos [{ group, options }]. */
export function select(options, value, onChange, { id, label } = {}) {
  const sel = h('select', { id, 'aria-label': label });
  const addOption = (parent, opt) => {
    const o = h('option', { value: opt.value, text: opt.label });
    if (String(opt.value) === String(value)) o.selected = true;
    parent.append(o);
  };
  for (const opt of options) {
    if (opt.group) {
      const og = h('optgroup', { label: opt.group });
      for (const o of opt.options) addOption(og, o);
      sel.append(og);
    } else addOption(sel, opt);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

export function labeled(label, control, hint) {
  const id = control.id || nextId('control');
  control.id = id;
  return h(
    'div',
    { class: 'field' },
    h('label', { for: id, class: 'field-label', text: label }),
    hint ? h('p', { class: 'hint', text: hint }) : null,
    control,
  );
}

export function groupLabel(label, control, hint) {
  return h('div', { class: 'field' }, h('p', { class: 'field-label', text: label }), hint ? h('p', { class: 'hint', text: hint }) : null, control);
}

export function button(text, onClick, cls = '') {
  return h('button', { type: 'button', class: `btn ${cls}`.trim(), text, on: { click: onClick } });
}

export function linkButton(text, href, cls = '') {
  return h('a', { class: `btn ${cls}`.trim(), href, text });
}

/** Enlace a otra web: se abre aparte y sin enviar de dónde vienes. */
export function externalLink(text, url, cls = '') {
  return h('a', { class: cls, href: url, target: '_blank', rel: 'noopener noreferrer' }, text, ' ', icon('externo', 16));
}

export function section(title, ...children) {
  return h('section', { class: 'card' }, title ? h('h2', { text: title }) : null, ...children);
}

export function empty(text) {
  return h('p', { class: 'empty', text });
}

// ── Ventanas (diálogos) ───────────────────────────────────────

/**
 * Abre una ventana modal.
 * actions: [{ label, class, onClick }] — si onClick devuelve false, no se cierra.
 */
export function openDialog({ title, content = [], actions = [], onClose, wide = false, keep = false, closeLabel = 'Cerrar' }) {
  const titleId = nextId('dialogo');
  const dlg = h('dialog', { class: `dialog${wide ? ' wide' : ''}`, 'aria-labelledby': titleId, dataset: keep ? { keep: '1' } : {} });
  const titleEl = h('h2', { id: titleId, text: title, tabindex: '-1' });
  const body = h('div', { class: 'dialog-body' });
  const footer = h('div', { class: 'dialog-actions' });
  let closed = false;
  const api = {
    el: dlg,
    body,
    close(value) {
      if (closed) return;
      closed = true;
      if (dlg.open) dlg.close();
      dlg.remove();
      onClose?.(value);
    },
    setTitle(text) {
      titleEl.textContent = text;
    },
    setContent(...nodes) {
      body.replaceChildren();
      appendChildren(body, nodes);
      body.scrollTop = 0;
      requestAnimationFrame(() => refitAll(body));
    },
    setActions(list) {
      footer.replaceChildren();
      for (const a of list) {
        footer.append(
          h('button', {
            type: 'button',
            class: `btn ${a.class || ''}`.trim(),
            text: a.label,
            on: {
              click: async () => {
                const result = await a.onClick?.();
                if (result !== false) api.close(a.value);
              },
            },
          }),
        );
      }
      footer.hidden = list.length === 0;
    },
  };
  const closeBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': closeLabel, title: closeLabel, on: { click: () => api.close(null) } }, icon('cerrar'));
  dlg.append(h('div', { class: 'dialog-head' }, titleEl, closeBtn), body, footer);
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    api.close(null);
  });
  api.setContent(...[content].flat());
  api.setActions(actions);
  document.body.append(dlg);
  dlg.showModal();
  titleEl.focus({ preventScroll: true });
  return api;
}

/** Pregunta sí/no. Devuelve una promesa con true o false. */
export function confirmDialog(message, { title = '¿Seguro?', confirmLabel = 'Sí', cancelLabel = 'Cancelar', danger = false } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    openDialog({
      title,
      content: h('p', { text: message }),
      actions: [
        { label: cancelLabel, class: 'secondary' },
        { label: confirmLabel, class: danger ? 'danger' : 'primary', onClick: () => (answer = true) },
      ],
      onClose: () => resolve(answer),
    });
  });
}

/** Cierra las ventanas abiertas (al cambiar de pantalla), salvo las marcadas para seguir. */
export function closeTransientDialogs() {
  for (const dlg of document.querySelectorAll('dialog:not([data-keep])')) {
    if (dlg.open) dlg.close();
    dlg.remove();
  }
}

/** Copia texto al portapapeles (con plan B para navegadores antiguos). */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { class: 'offscreen', readonly: true });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** Descarga un texto como archivo. */
export function downloadText(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename, class: 'offscreen' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
