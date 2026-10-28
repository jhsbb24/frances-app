// ─────────────────────────────────────────────────────────────
// Service worker: guarda una copia de los archivos de la app para
// que se abra aunque no haya internet.
// Estrategia «primero la red»: si hay conexión, siempre usa la
// versión más nueva; si no, usa la copia guardada.
// NUNCA toca las peticiones a GitHub (api.github.com).
// ─────────────────────────────────────────────────────────────
const CACHE = 'mi-frances-v1';

const APP_FILES = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icons/favicon-32.png',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/app.js',
  'js/components.js',
  'js/config.js',
  'js/dates.js',
  'js/diff.js',
  'js/dom.js',
  'js/github.js',
  'js/local.js',
  'js/model.js',
  'js/registro.js',
  'js/review.js',
  'js/sync.js',
  'js/views/ajustes.js',
  'js/views/biblioteca.js',
  'js/views/conflicto.js',
  'js/views/conversacion.js',
  'js/views/hoy.js',
  'js/views/mas.js',
  'js/views/objetivos.js',
  'js/views/progreso.js',
  'js/views/repaso.js',
  'js/views/sesion.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // GitHub y otras webs: sin tocar
  event.respondWith(networkFirst(request, url));
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function networkFirst(request, url) {
  const cache = await caches.open(CACHE);
  const key = url.origin + url.pathname;
  try {
    let response = await withTimeout(fetch(key, { cache: 'no-cache', credentials: 'same-origin' }), 6000);
    if (response.redirected) {
      // Safari no acepta respuestas redirigidas para abrir páginas.
      response = new Response(await response.blob(), { status: response.status, statusText: response.statusText, headers: response.headers });
    }
    if (response.ok) cache.put(key, response.clone());
    return response;
  } catch {
    const cached = (await cache.match(key)) || (request.mode === 'navigate' ? await cache.match(new URL('./', self.location).href) : null);
    return cached || Response.error();
  }
}
