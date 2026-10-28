// ─────────────────────────────────────────────────────────────
// Arranque de «Mi francés»: crea la conexión con GitHub, el motor
// de sincronización, la navegación entre pantallas y el indicador
// de guardado que siempre está visible arriba.
// ─────────────────────────────────────────────────────────────
import { DEFAULT_REPO } from './config.js';
import { h, icon, toast, closeTransientDialogs, refitAll, openDialog } from './dom.js';
import { createGitHubApi } from './github.js';
import { local, browserStorage, deviceName } from './local.js';
import { SyncEngine } from './sync.js';
import { openConflictDialog, closeConflictDialogIfResolved } from './views/conflicto.js';
import * as Hoy from './views/hoy.js';
import * as Sesion from './views/sesion.js';
import * as Conversacion from './views/conversacion.js';
import * as Biblioteca from './views/biblioteca.js';
import * as Objetivos from './views/objetivos.js';
import * as Repaso from './views/repaso.js';
import * as Progreso from './views/progreso.js';
import * as Ajustes from './views/ajustes.js';
import * as Mas from './views/mas.js';

const ROUTES = {
  hoy: { view: Hoy.render, title: 'Hoy' },
  sesion: { view: Sesion.render, title: 'Sesión' },
  sesiones: { view: Sesion.renderList, title: 'Sesiones', nav: 'sesion' },
  conversacion: { view: Conversacion.render, title: 'Conversación' },
  biblioteca: { view: Biblioteca.render, title: 'Biblioteca' },
  objetivos: { view: Objetivos.render, title: 'Objetivos' },
  repaso: { view: Repaso.render, title: 'Repaso' },
  progreso: { view: Progreso.render, title: 'Progreso' },
  ajustes: { view: Ajustes.render, title: 'Ajustes' },
  mas: { view: Mas.render, title: 'Más' },
};

// Barra de navegación. En el iPhone en vertical solo caben 5:
// las demás están dentro de «Más».
const NAV = [
  { id: 'hoy', label: 'Hoy', icon: 'hoy', phone: true },
  { id: 'sesion', label: 'Sesión', icon: 'sesion', phone: true },
  { id: 'conversacion', label: 'Conversación', short: 'Conversar', icon: 'chat', phone: true },
  { id: 'repaso', label: 'Repaso', icon: 'repaso', phone: true },
  { id: 'biblioteca', label: 'Biblioteca', icon: 'libro' },
  { id: 'objetivos', label: 'Objetivos', icon: 'objetivo' },
  { id: 'progreso', label: 'Progreso', icon: 'progreso' },
  { id: 'ajustes', label: 'Ajustes', icon: 'ajustes' },
  { id: 'mas', label: 'Más', icon: 'mas', phone: true, phoneOnly: true },
];
const IN_MORE = new Set(['biblioteca', 'objetivos', 'progreso', 'ajustes', 'mas']);

const api = createGitHubApi({ getToken: () => local.get('token') || '', getRepo: () => local.get('repo') || DEFAULT_REPO });
const sync = new SyncEngine({ api, storage: browserStorage, isOnline: () => navigator.onLine !== false, deviceName });

const main = document.getElementById('main');
const nav = document.getElementById('nav');
const statusButton = document.getElementById('sync-status');
const statusText = statusButton.querySelector('.status-text');

let cleanup = null;

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const name = ROUTES[parts[0]] ? parts[0] : 'hoy';
  return { name, params: parts.slice(1) };
}

const ctx = {
  sync,
  go(hash) {
    if (location.hash === hash) renderRoute();
    else location.hash = hash;
  },
  rerender: () => renderRoute({ keepPosition: true }),
};

function renderRoute({ keepPosition = false } = {}) {
  const { name, params } = parseHash();
  // Recordar dónde estabas escribiendo, para no perder el foco.
  const active = document.activeElement;
  const focusId = keepPosition && active && main.contains(active) ? active.id : '';
  const selection = focusId && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  const scroll = window.scrollY;

  if (cleanup) {
    try {
      cleanup();
    } catch {
      /* nada */
    }
    cleanup = null;
  }
  if (!keepPosition) closeTransientDialogs();
  main.replaceChildren();
  const route = ROUTES[name];
  try {
    cleanup = route.view(main, ctx, params) || null;
  } catch (err) {
    console.error(err);
    main.replaceChildren(h('h1', { text: 'Algo salió mal' }), h('p', { text: 'Esta pantalla no se pudo mostrar. Tus datos están a salvo.' }), h('pre', { class: 'pre', text: String(err?.message || err) }), h('a', { class: 'btn', href: '#/hoy', text: 'Ir a Hoy' }));
  }
  document.title = `${route.title} · Mi francés`;
  paintNav(route.nav || name);
  requestAnimationFrame(() => {
    refitAll(main);
    if (keepPosition) {
      window.scrollTo(0, scroll);
      const el = focusId && document.getElementById(focusId);
      if (el) {
        el.focus({ preventScroll: true });
        if (selection && el.setSelectionRange) {
          try {
            el.setSelectionRange(...selection);
          } catch {
            /* algunos campos no lo permiten */
          }
        }
      }
    } else {
      window.scrollTo(0, 0);
    }
  });
}

function buildNav() {
  nav.replaceChildren(
    ...NAV.map((item) =>
      h('a', { href: `#/${item.id}`, class: `nav-item${item.phone ? ' phone' : ''}${item.phoneOnly ? ' phone-only' : ''}`, dataset: { id: item.id } },
        icon(item.icon),
        h('span', { class: 'nav-label long', text: item.label }),
        h('span', { class: 'nav-label short', text: item.short || item.label }),
      ),
    ),
  );
}

function paintNav(name) {
  for (const a of nav.querySelectorAll('.nav-item')) {
    const id = a.dataset.id;
    const isCurrent = id === name || (id === 'mas' && IN_MORE.has(name));
    a.classList.toggle('active', isCurrent);
    a.classList.toggle('exact', id === name);
    if (id === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function paintStatus() {
  const st = sync.statusInfo();
  statusButton.dataset.kind = st.kind;
  statusText.textContent = st.text;
  statusButton.title = st.detail || st.text;
  statusButton.setAttribute('aria-label', `Estado del guardado: ${st.text}${st.detail ? `. ${st.detail}` : ''}`);
}

// Tocar el indicador: decidir el conflicto, ver el error o sincronizar.
statusButton.addEventListener('click', () => {
  const st = sync.statusInfo();
  if (st.kind === 'conflict') return openConflictDialog(ctx);
  if (st.kind === 'error' || (st.kind === 'pending' && !api.isConfigured())) {
    openDialog({
      title: st.kind === 'error' ? 'No se pudo guardar en GitHub' : 'Falta el token',
      content: [h('p', { text: st.detail || st.text }), h('p', { class: 'hint', text: 'Tus cambios siguen guardados en este dispositivo.' })],
      actions: [
        { label: 'Ir a Ajustes', class: 'secondary', onClick: () => ctx.go('#/ajustes') },
        ...(api.isConfigured() ? [{ label: 'Reintentar', class: 'primary', onClick: () => sync.reconnect() }] : []),
      ],
    });
    return;
  }
  toast(st.detail || st.text);
  sync.syncNow();
});

sync.on((type) => {
  if (type === 'status') {
    paintStatus();
    closeConflictDialogIfResolved(ctx);
  }
  if (type === 'data') renderRoute({ keepPosition: true });
  if (type === 'conflict') openConflictDialog(ctx);
  if (type === 'storage-error') toast('No queda espacio en este navegador para el borrador. Mientras haya conexión, se sigue guardando en GitHub.');
});

// Al cambiar de pantalla: guardar ya.
window.addEventListener('hashchange', () => {
  sync.flush();
  renderRoute();
});

// Al salir de la app: guardar. Al volver: descargar data.json.
let lastPull = 0;
const pullSoon = () => {
  if (Date.now() - lastPull < 5000) return;
  lastPull = Date.now();
  sync.syncNow();
};
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') sync.flush();
  else pullSoon();
});
window.addEventListener('pagehide', () => sync.flush());
window.addEventListener('focus', pullSoon);
window.addEventListener('online', () => {
  lastPull = Date.now();
  sync.syncNow();
});
window.addEventListener('offline', () => sync.markOffline());

// Mientras escribes en el iPhone, se oculta la barra de abajo.
const isTypingField = (el) => el?.matches?.('textarea, select, input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=file])');
document.addEventListener('focusin', (e) => document.body.classList.toggle('typing', isTypingField(e.target)));
document.addEventListener('focusout', () => setTimeout(() => document.body.classList.toggle('typing', isTypingField(document.activeElement)), 60));

// Los textareas crecen con su contenido.
document.addEventListener('toggle', (e) => refitAll(e.target), true);
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => refitAll(document), 150);
});

// Altura de la cabecera, para colocar el menú lateral debajo.
const header = document.querySelector('.topbar');
const setHeaderHeight = () => document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
if ('ResizeObserver' in window) new ResizeObserver(setHeaderHeight).observe(header);
setHeaderHeight();

// Funcionar sin conexión: el service worker guarda una copia de la app.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ¡Arrancar!
buildNav();
if (!location.hash) history.replaceState(null, '', '#/hoy');
paintStatus();
renderRoute();
lastPull = Date.now();
sync.syncNow();
