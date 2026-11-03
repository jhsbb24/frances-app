// Pantalla «Ajustes»: conexión con GitHub (token), nombre del
// dispositivo, plantilla de la consigna, exportar e importar JSON
// y copias de seguridad de este dispositivo.
import { APP_VERSION, DEFAULT_REPO, DATA_PATH, TIME_ZONE } from '../config.js';
import { h, section, textField, button, toast, confirmDialog, openDialog, downloadText, externalLink, fitTextarea } from '../dom.js';
import { today, formatDateTime } from '../dates.js';
import { normalizeData, countData } from '../model.js';
import { parseRepo, maskToken } from '../github.js';
import { local, browserStorage, usedKB, detectDevice } from '../local.js';
import { serialize } from '../sync.js';
import { DEFAULT_TEMPLATE, PLACEHOLDERS } from '../registro.js';
import { COLLECTIONS } from '../diff.js';

export function render(main, ctx) {
  main.append(h('h1', { text: 'Ajustes' }));
  main.append(connectionSection(ctx), deviceSection(), templateSection(ctx), dataSection(ctx), aboutSection());
}

// ── Conexión con GitHub ───────────────────────────────────────

function connectionSection(ctx) {
  const repo = local.get('repo') || DEFAULT_REPO;
  const token = local.get('token') || '';
  const out = h('div', { class: 'test-output', 'aria-live': 'polite' });
  const sec = section('Conexión con GitHub');

  const repoField = textField({ id: 'ajustes-repo', label: 'Repositorio privado de datos', hint: `Escríbelo como usuario/repositorio. Tus datos se guardan en ${DATA_PATH}.`, value: repo, spellcheck: false });
  repoField.input.addEventListener('change', () => {
    const parsed = parseRepo(repoField.input.value);
    if (!parsed) {
      toast('Ese nombre no es válido. Ejemplo: jhsbb24/frances-datos');
      repoField.input.value = local.get('repo') || DEFAULT_REPO;
      return;
    }
    repoField.input.value = parsed.full;
    local.set('repo', parsed.full);
    toast('Repositorio guardado');
    ctx.sync.reconnect();
  });
  sec.append(repoField);

  const tokenBox = h('div', { class: 'subcard' });
  const paintToken = (editing = false) => {
    const saved = local.get('token') || '';
    tokenBox.replaceChildren();
    if (saved && !editing) {
      tokenBox.append(
        h('p', {}, 'Token guardado en este dispositivo: ', h('code', { text: maskToken(saved) })),
        h('div', { class: 'row-actions' },
          button('Cambiar token', () => paintToken(true), 'secondary small'),
          button('Quitar de este dispositivo', async () => {
            if (await confirmDialog('La app dejará de guardar en GitHub desde este dispositivo hasta que pegues otro token. Tus datos en GitHub no se tocan.', { title: '¿Quitar el token?', confirmLabel: 'Quitar', danger: true })) {
              local.remove('token');
              toast('Token quitado');
              ctx.sync.reconnect();
              paintToken();
            }
          }, 'danger small'),
        ),
      );
      return;
    }
    const input = h('input', { type: 'password', id: 'ajustes-token', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'github_pat_…' });
    const errorEl = h('p', { class: 'form-error', role: 'alert' });
    const save = () => {
      const value = input.value.replace(/\s+/g, '');
      if (!value) {
        errorEl.textContent = 'Pega el token.';
        return;
      }
      local.set('token', value);
      input.value = '';
      toast(value.startsWith('github_pat_') ? 'Token guardado' : 'Token guardado (no parece fine-grained: revisa que empiece por github_pat_)');
      ctx.sync.reconnect();
      paintToken();
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && save());
    tokenBox.append(
      h('label', { for: 'ajustes-token', class: 'field-label', text: saved ? 'Token nuevo' : 'Token de GitHub (fine-grained)' }),
      h('p', { class: 'hint', text: 'Se guarda solo en este navegador y solo se envía a api.github.com. El README explica cómo crearlo.' }),
      input,
      errorEl,
      h('div', { class: 'row-actions' }, button('Guardar token', save, 'primary'), saved ? button('Cancelar', () => paintToken(), 'secondary') : null),
    );
  };
  paintToken();
  sec.append(tokenBox);

  const test = async () => {
    out.replaceChildren(h('p', { text: 'Probando…' }));
    const lines = [];
    try {
      const info = await ctx.sync.api.checkAccess();
      lines.push(`✓ Conectado a ${info.fullName}.`);
      if (!info.isPrivate) lines.push('⚠ Este repositorio es PÚBLICO. Tus datos deberían ir en uno privado.');
      const file = await ctx.sync.api.readFile();
      lines.push(file ? `✓ ${DATA_PATH} encontrado.` : `${DATA_PATH} todavía no existe: se creará en el primer guardado.`);
    } catch (err) {
      lines.push(`✗ ${err.message}`);
    }
    out.replaceChildren(...lines.map((text) => h('p', { text })));
  };

  const full = parseRepo(local.get('repo') || DEFAULT_REPO)?.full || DEFAULT_REPO;
  sec.append(
    h('div', { class: 'row-actions' },
      button('Probar conexión', test, 'secondary'),
      button('Sincronizar ahora', () => {
        ctx.sync.reconnect();
        toast('Sincronizando…');
      }, 'secondary'),
    ),
    out,
    h('p', {}, externalLink('Ver el historial de guardados en GitHub', `https://github.com/${full}/commits/main/${DATA_PATH}`, 'link')),
  );
  if (!token) sec.classList.add('notice');
  return sec;
}

// ── Este dispositivo ──────────────────────────────────────────

function deviceSection() {
  return section(
    'Este dispositivo',
    textField({
      id: 'ajustes-dispositivo',
      label: 'Nombre',
      hint: `Aparece en los mensajes de cada guardado en GitHub. Si lo dejas vacío: «${detectDevice()}».`,
      value: local.get('dispositivo') || '',
      placeholder: detectDevice(),
      autocapitalize: 'words',
      onInput: (v) => local.set('dispositivo', v.trim()),
    }),
  );
}

// ── Plantilla de la consigna ──────────────────────────────────

function templateSection(ctx) {
  const current = ctx.sync.data.settings.promptTemplate.trim() || DEFAULT_TEMPLATE;
  const field = textField({
    id: 'ajustes-plantilla',
    label: 'Plantilla',
    hint: 'Se usa al crear consignas nuevas en Conversación. Las palabras entre llaves se reemplazan por tus datos.',
    value: current,
    multiline: true,
    rows: 14,
    onInput: (v) =>
      ctx.sync.update('Ajustes: plantilla de la consigna', (d) => {
        d.settings.promptTemplate = v.trim() === DEFAULT_TEMPLATE.trim() ? '' : v;
      }),
  });
  return h('details', { class: 'card' },
    h('summary', {}, h('span', { class: 'summary-title', text: 'Plantilla de la consigna para ChatGPT' })),
    field,
    h('p', { class: 'hint', text: 'Marcadores disponibles:' }),
    h('ul', { class: 'plain-list compact' }, PLACEHOLDERS.map(([code, text]) => h('li', {}, h('code', { text: code }), ` ${text}`))),
    button('Restaurar la plantilla original', async () => {
      if (!(await confirmDialog('Se perderán tus cambios en la plantilla.', { title: '¿Restaurar la original?', confirmLabel: 'Restaurar' }))) return;
      ctx.sync.update('Ajustes: restaurar la plantilla original', (d) => (d.settings.promptTemplate = ''));
      field.input.value = DEFAULT_TEMPLATE;
      fitTextarea(field.input);
      toast('Plantilla restaurada');
    }, 'secondary small'),
  );
}

// ── Exportar, importar y copias ───────────────────────────────

const countsText = (data) => {
  const c = countData(data);
  return COLLECTIONS.map(({ key, label }) => `${label}: ${c[key]}`).join(' · ');
};

function summaryTable(current, incoming) {
  const a = countData(current);
  const b = countData(incoming);
  return h('table', { class: 'summary-table' },
    h('thead', {}, h('tr', {}, h('th', { text: '' }), h('th', { text: 'Ahora' }), h('th', { text: 'En el archivo' }))),
    h('tbody', {}, COLLECTIONS.map(({ key, label }) => h('tr', {}, h('th', { text: label }), h('td', { text: String(a[key]) }), h('td', { text: String(b[key]) })))),
  );
}

function confirmReplace(ctx, incoming, { title, origin, message }) {
  const meta = incoming.meta?.updatedAt ? `Último cambio en el archivo: ${formatDateTime(incoming.meta.updatedAt)}${incoming.meta.device ? ` (${incoming.meta.device})` : ''}.` : '';
  openDialog({
    title,
    content: [
      h('p', { text: origin }),
      meta ? h('p', { class: 'hint', text: meta }) : null,
      summaryTable(ctx.sync.data, incoming),
      h('p', { class: 'warning', text: 'Esto REEMPLAZA todos tus datos actuales por los del archivo. Antes guardo una copia de los actuales en este dispositivo, y la versión actual seguirá en el historial de GitHub.' }),
    ],
    actions: [
      { label: 'Cancelar', class: 'secondary' },
      {
        label: 'Reemplazar mis datos',
        class: 'danger',
        onClick: () => {
          ctx.sync.replaceAll(incoming, message);
          toast('Datos reemplazados');
          ctx.rerender();
        },
      },
    ],
  });
}

function dataSection(ctx) {
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'offscreen', id: 'ajustes-importar', 'aria-label': 'Elegir archivo JSON' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    let incoming;
    try {
      incoming = normalizeData(JSON.parse(await file.text()));
    } catch (err) {
      openDialog({ title: 'No pude leer el archivo', content: h('p', { text: err instanceof SyntaxError ? 'El archivo no es un JSON válido.' : err.message }), actions: [{ label: 'Entendido', class: 'primary' }] });
      return;
    }
    confirmReplace(ctx, incoming, { title: 'Importar JSON', origin: `Archivo: ${file.name}`, message: `Importar JSON (${countsText(incoming)})` });
  });

  const backups = browserStorage.backups();
  const backupList = backups.length
    ? h('ul', { class: 'plain-list' },
        backups.map((b, i) => {
          let data = null;
          try {
            data = normalizeData(b.data);
          } catch {
            /* copia dañada */
          }
          return h('li', { class: 'backup' },
            h('p', { text: `${formatDateTime(b.at)} · ${b.reason}` }),
            data ? h('p', { class: 'hint', text: countsText(data) }) : h('p', { class: 'hint', text: 'Copia dañada.' }),
            data
              ? h('div', { class: 'row-actions' },
                  button('Descargar', () => downloadText(`mi-frances-copia-${i + 1}.json`, serialize(data)), 'secondary small'),
                  button('Restaurar…', () => confirmReplace(ctx, data, { title: 'Restaurar copia', origin: `Copia del ${formatDateTime(b.at)}.`, message: `Restaurar copia del ${formatDateTime(b.at)}` }), 'secondary small'),
                )
              : null,
          );
        }),
      )
    : h('p', { class: 'hint', text: 'No hay copias. Se crean solas antes de reemplazar tus datos (conflictos, importaciones).' });

  return section(
    'Tus datos',
    h('p', { class: 'hint', text: countsText(ctx.sync.data) }),
    h('div', { class: 'row-actions' },
      button('Exportar JSON', () => {
        downloadText(`mi-frances-${today()}.json`, serialize(ctx.sync.data));
        toast('Archivo descargado');
      }, 'secondary'),
      button('Importar JSON', () => fileInput.click(), 'secondary'),
      fileInput,
    ),
    h('h3', { text: 'Copias de seguridad en este dispositivo' }),
    backupList,
    h('p', { class: 'hint', text: 'Tu respaldo principal es el historial de GitHub: cada guardado es un commit.' }),
  );
}

function aboutSection() {
  return section(
    'Acerca de',
    h('ul', { class: 'plain-list' },
      h('li', { text: `Zona horaria de los repasos: ${TIME_ZONE}` }),
      h('li', { text: `Espacio usado en este navegador: ${usedKB()} KB` }),
      h('li', { text: `Versión ${APP_VERSION}` }),
    ),
  );
}
