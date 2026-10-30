// ─────────────────────────────────────────────────────────────
// Pruebas en un navegador real (Chromium con Playwright), con un
// GitHub FALSO que intercepta las llamadas a api.github.com.
// Simula iPhone, iPad y Mac (tamaños de pantalla y táctil).
// Ejecutar:  node --test tests/e2e.test.js
// Capturas (opcional):  CAPTURAS=/ruta/carpeta node --test tests/e2e.test.js
// ─────────────────────────────────────────────────────────────
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './server.js';
import { createFakeGitHub, TOKEN, REPO } from './fake-github.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const { emptyData, newObjective, newSession, newConversation, newReference, newCard, clone } = await import('../js/model.js');
const { serialize } = await import('../js/sync.js');

const SHOTS = process.env.CAPTURAS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
};
const DEVICES = {
  iphone: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA.iphone },
  iphoneHorizontal: { viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA.iphone },
  iphoneSE: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA.iphone },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA.ipad },
  ipadHorizontal: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA.ipad },
  mac: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, isMobile: false, hasTouch: false, userAgent: UA.mac },
};

let server;
let browser;

before(async () => {
  server = await startServer(0);
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

/** Abre un «dispositivo» (contexto del navegador) conectado al GitHub falso. */
async function openDevice(fake, kind = 'iphone', { token = TOKEN, timezoneId = 'America/Vancouver', fixedTime = null, serviceWorkers = 'block' } = {}) {
  const context = await browser.newContext({ ...DEVICES[kind], locale: 'es-ES', timezoneId, serviceWorkers, acceptDownloads: true });
  const requests = [];
  context.on('request', (r) => requests.push(r.url()));
  await context.addInitScript(({ token, repo }) => {
    window.__MI_FRANCES_PRUEBAS__ = { saveDelay: 250, minGap: 0, retry: 1200, timeout: 5000 };
    if (token && !localStorage.getItem('miFrances.token')) {
      localStorage.setItem('miFrances.token', token);
      localStorage.setItem('miFrances.repo', repo);
    }
  }, { token, repo: REPO });
  if (fake) {
    await context.route('https://api.github.com/**', async (route) => {
      const req = route.request();
      const res = fake.handle({ method: req.method(), url: req.url(), headers: await req.allHeaders(), body: req.postData() || '' });
      if (res.network) return route.abort('internetdisconnected');
      return route.fulfill({ status: res.status, headers: res.headers, body: res.body });
    });
  }
  // Cualquier otro sitio externo queda bloqueado (y anotado).
  await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|api\.github\.com)/, (route) => route.abort());
  if (fixedTime) await context.clock.setFixedTime(new Date(fixedTime));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/internetdisconnected|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  return { context, page, requests, errors };
}

const statusText = (page) => page.locator('#sync-status .status-text').textContent();

async function waitStatus(page, regex, timeout = 8000) {
  await page.waitForFunction((src) => new RegExp(src).test(document.querySelector('#sync-status .status-text')?.textContent || ''), regex.source, { timeout });
}

async function waitFor(check, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Tiempo agotado esperando la condición');
}

async function go(page, hash) {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForFunction((h) => location.hash === h && document.querySelector('main h1'), hash);
}

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false });
}

/** Datos de ejemplo (ficticios) para ver todas las pantallas con contenido. */
function sampleData() {
  const d = emptyData();
  const t0 = '2026-10-20T17:00:00.000Z';
  const o1 = newObjective({ title: 'Pedir y reservar en un restaurante', skill: 'oral', description: 'Reservo una mesa y pido sin leer.' }, t0);
  o1.status = 'practica';
  o1.history.push({ at: '2026-10-22T18:00:00.000Z', from: 'pendiente', to: 'practica', reason: 'Primera conversación: necesité muchas pistas.', source: null });
  const o2 = newObjective({ title: 'Entender un mensaje de voz sobre una cita', skill: 'escucha' }, t0);
  const o3 = newObjective({ title: 'Escribir un correo de queja formal', skill: 'escritura' }, t0);
  o3.status = 'apoyo';
  const o4 = newObjective({ title: 'Comprender un artículo sobre el teletrabajo', skill: 'lectura' }, t0);
  o4.status = 'autonomo';
  d.objectives.push(o1, o2, o3, o4);
  const r1 = newReference({ book: 'B1', edition: 'Nouvelle édition 2022', unit: '3', page: '42', audioUrl: 'https://example.com/audio/b1-u3-piste12.mp3', notes: 'Compréhension orale: au restaurant. Piste 12.' }, t0);
  const r2 = newReference({ book: 'B2', edition: '2020', unit: '5', page: '88', notes: 'Point langue: le subjonctif après « bien que ».' }, t0);
  d.references.push(r1, r2);
  const s1 = newSession({ minutes: 30, objectiveId: o1.id, ref: { refId: r1.id, book: 'B1', unit: '3', page: '42', note: 'Actividad 4' } }, '2026-10-28T17:00:00.000Z');
  s1.draft = 'réserver une table — pour quelle heure ? — en terrasse';
  s1.attempt1 = 'Bonjour, je voudrais réserver une table pour deux personnes, ce soir à vingt heures.';
  s1.timer = { elapsedMs: 9 * 60000, runningSince: null };
  const s2 = newSession({ minutes: 15, objectiveId: o3.id, ref: { book: 'B2', unit: '5', page: '88', note: '' } }, '2026-10-26T17:00:00.000Z');
  s2.closedAt = '2026-10-26T17:20:00.000Z';
  s2.closing = { achievement: 'Usé « bien que » dos veces sin ayuda.', difficulty: 'Las fórmulas de cortesía del final.', nextStep: 'Repasar «Je vous prie d’agréer…».' };
  d.sessions.push(s1, s2);
  const c1 = newConversation({ objectiveId: o1.id, ref: s1.ref, sessionId: s1.id }, '2026-10-27T18:00:00.000Z');
  c1.role = 'un serveur dans un bistrot parisien';
  c1.expr1 = 'je voudrais';
  c1.expr2 = "l'addition, s'il vous plaît";
  c1.prompt = 'Consigna de ejemplo';
  c1.registro = 'REGISTRO\nFecha y sesión: 27 oct\nHabilidad: Interacción oral\nEvidencia: « Je voudrais une table pour deux. »\nLogro: Pediste mesa y cuenta.\nEstado sugerido: Logrado con apoyo\nExpresiones para recuperar:\n- en terrasse = en la terraza';
  c1.registroAt = '2026-10-27T18:30:00.000Z';
  d.conversations.push(c1);
  for (let i = 0; i < 4; i++) {
    const card = newCard({ kind: i % 2 ? 'error' : 'expresion', prompt: ['reservar una mesa', 'je suis allé au le marché', 'la cuenta, por favor', 'il faut que tu viens'][i], answer: ['réserver une table', 'je suis allé au marché', "l'addition, s'il vous plaît", 'il faut que tu viennes'][i], source: { type: 'session', id: s1.id } }, '2026-10-27');
    d.cards.push(card); // vencen el 28 oct
  }
  d.cards.push(newCard({ kind: 'expresion', prompt: 'en la terraza', answer: 'en terrasse' }, '2026-10-29')); // vence el 30
  return { data: d, ids: { o1: o1.id, s1: s1.id, c1: c1.id } };
}

// ─────────────────────────────────────────────────────────────

describe('Guardar y cargar (GitHub simulado)', () => {
  test('crea data.json, guarda una sesión con commits claros y otro dispositivo la carga', async () => {
    const fake = createFakeGitHub();
    const iphone = await openDevice(fake, 'iphone');
    const { page } = iphone;
    await page.goto(`${server.url}/#/hoy`);
    await waitStatus(page, /^Guardado en GitHub · \d\d:\d\d$/);
    assert.ok(fake.file, 'debe crear data.json la primera vez');
    assert.match(fake.commits[0].message, /^Crear data\.json \(iPhone\)$/);

    await page.getByRole('link', { name: 'Empezar una sesión nueva' }).click();
    await page.getByRole('button', { name: '15 min' }).click();
    await page.selectOption('#nueva-objetivo', '__nuevo__');
    await page.fill('#nueva-objetivo-nuevo-titulo', 'Pedir en un restaurante');
    await page.getByRole('button', { name: 'Édito B1' }).click();
    await page.fill('#nueva-unidad', '3');
    await page.fill('#nueva-pagina', '42');
    await page.getByRole('button', { name: 'Empezar', exact: true }).click();
    await page.waitForSelector('#ses-draft');
    await page.fill('#ses-draft', "J'aimerais réserver une table pour deux.");
    await page.fill('#ses-attempt1', 'Bonjour, je voudrais une table pour deux personnes.');
    assert.match(await statusText(page), /Guardando…/);
    await waitFor(() => fake.json()?.sessions?.[0]?.attempt1 === 'Bonjour, je voudrais une table pour deux personnes.');
    await waitStatus(page, /^Guardado en GitHub/);

    const remote = fake.json();
    assert.equal(remote.sessions[0].minutes, 15);
    assert.equal(remote.sessions[0].ref.unit, '3');
    assert.equal(remote.objectives[0].title, 'Pedir en un restaurante');
    const messages = fake.commits.map((c) => c.message);
    assert.ok(messages.some((m) => /^Sesión del \d+ \w+\.?: empezar \(15 min\) \(iPhone\)$/.test(m)), messages.join(' | '));
    assert.ok(messages.some((m) => /Sesión del .*(borrador|primer intento).*\(iPhone\)$/.test(m)), messages.join(' | '));

    // El iPad (sin nada guardado) abre la app y ve la sesión.
    const ipad = await openDevice(fake, 'ipad');
    await ipad.page.goto(`${server.url}/#/hoy`);
    await waitStatus(ipad.page, /^Guardado en GitHub/);
    await ipad.page.getByText('Pedir en un restaurante').first().waitFor();
    await ipad.page.getByRole('link', { name: 'Continuar' }).click();
    assert.equal(await ipad.page.inputValue('#ses-draft'), "J'aimerais réserver une table pour deux.");
    assert.deepEqual(iphone.errors, []);
    assert.deepEqual(ipad.errors, []);
    await iphone.context.close();
    await ipad.context.close();
  });
});

describe('Conflicto (sha distinto)', () => {
  test('muestra «Esto cambió en otro dispositivo», no sobrescribe ni pierde texto, y «Ver ambas» combina', async () => {
    const { data, ids } = sampleData();
    const fake = createFakeGitHub();
    fake.setRemote(serialize(data), 'Datos iniciales');
    const ipad = await openDevice(fake, 'iphone');
    const { page } = ipad;
    await page.goto(`${server.url}/#/sesion/${ids.s1}`);
    await waitStatus(page, /^Guardado en GitHub/);
    await page.waitForSelector('#ses-draft');

    // Otro dispositivo guarda mientras tanto: una referencia nueva y el segundo intento.
    const other = clone(data);
    other.references.push(newReference({ book: 'B2', unit: '7', page: '120', notes: 'Añadida en el Mac' }));
    other.sessions[0].attempt2 = 'Segundo intento escrito en el Mac.';
    other.sessions[0].updatedAt = new Date().toISOString();
    const otherSha = fake.setRemote(serialize(other), 'Cambios del Mac');

    await page.fill('#ses-draft', 'Texto que NO se debe perder');
    await page.getByRole('heading', { name: 'Esto cambió en otro dispositivo' }).waitFor();
    assert.equal(await statusText(page), 'Conflicto');
    assert.equal(fake.file.sha, otherSha, 'GitHub no se sobrescribe');
    assert.equal(await page.inputValue('#ses-draft'), 'Texto que NO se debe perder');
    const local = await page.evaluate(() => JSON.parse(localStorage.getItem('miFrances.estado')).data.sessions[0].draft);
    assert.equal(local, 'Texto que NO se debe perder');
    for (const name of ['Usar la versión de la nube', 'Mantener la mía', 'Ver ambas']) {
      assert.ok(await page.getByRole('button', { name: new RegExp(`^${name}`) }).isVisible(), name);
    }
    await shot(page, 'iphone-conflicto');

    await page.getByRole('button', { name: /^Ver ambas/ }).click();
    await page.locator('.diff-item').first().waitFor();
    assert.equal(await page.locator('.diff-item').count(), 2);
    const dialogText = await page.locator('dialog').innerText();
    assert.match(dialogText, /Texto que NO se debe perder/);
    assert.match(dialogText, /Segundo intento escrito en el Mac\./);
    assert.match(dialogText, /Juntar los cambios de los dos/);
    await shot(page, 'iphone-ver-ambas');
    await page.getByRole('button', { name: 'Guardar esta combinación' }).click();
    await waitFor(() => fake.json().sessions[0].draft === 'Texto que NO se debe perder');
    const merged = fake.json();
    assert.equal(merged.sessions[0].attempt2, 'Segundo intento escrito en el Mac.');
    assert.equal(merged.references.length, 3);
    assert.match(fake.commits.at(-1).message, /Combinar las dos versiones/);
    await waitStatus(page, /^Guardado en GitHub/);
    assert.equal(await page.inputValue('#ses-attempt2'), 'Segundo intento escrito en el Mac.');
    assert.deepEqual(ipad.errors, []);
    await ipad.context.close();
  });
});

describe('Sin conexión', () => {
  test('queda «Pendiente (sin conexión)» y al volver la conexión se sube una sola vez', async () => {
    const { data, ids } = sampleData();
    const fake = createFakeGitHub();
    fake.setRemote(serialize(data));
    const dev = await openDevice(fake, 'iphone');
    const { page, context } = dev;
    await page.goto(`${server.url}/#/sesion/${ids.s1}`);
    await waitStatus(page, /^Guardado en GitHub/);
    const putsBefore = fake.puts;

    fake.offline = true;
    await context.setOffline(true);
    await page.fill('#ses-attempt2', 'Écrit sans connexion.');
    await page.waitForTimeout(400);
    await page.fill('#ses-attempt2', 'Écrit sans connexion. Encore une phrase.');
    await go(page, '#/hoy'); // cambiar de pantalla también intenta guardar
    await waitStatus(page, /^Pendiente \(sin conexión\)$/);
    await page.waitForTimeout(3000); // pasan reintentos automáticos
    assert.equal(fake.puts, putsBefore, 'sin conexión no sube nada');
    assert.equal(await statusText(page), 'Pendiente (sin conexión)');
    await shot(page, 'iphone-pendiente');

    fake.offline = false;
    await context.setOffline(false); // dispara el evento «online»
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); // y «volver a la app»
    await waitStatus(page, /^Guardado en GitHub/);
    await page.waitForTimeout(3000); // por si algún reintento intentara subir otra vez
    assert.equal(fake.puts, putsBefore + 1, 'debe subir exactamente una vez');
    assert.equal(fake.json().sessions.find((s) => s.id === ids.s1).attempt2, 'Écrit sans connexion. Encore une phrase.');
    assert.equal(fake.json().sessions.length, data.sessions.length, 'sin duplicados');
    assert.deepEqual(dev.errors, []);
    await context.close();
  });

  test('la app se abre sin internet (service worker)', async () => {
    const dev = await openDevice(null, 'iphone', { token: '', serviceWorkers: 'allow' });
    const { page, context } = dev;
    await page.goto(`${server.url}/`);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('heading', { name: 'Hoy', exact: true }).waitFor();
    assert.match(await statusText(page), /falta el token/);
    await context.close();
  });
});

describe('Repasos con la zona horaria de Vancouver', () => {
  test('con el dispositivo en Tokio a las 23:30 de Vancouver, «hoy» es el día de Vancouver', async () => {
    const { data } = sampleData();
    const fake = createFakeGitHub();
    fake.setRemote(serialize(data));
    // 29 oct 06:30 UTC = 28 oct 23:30 en Vancouver = 29 oct 15:30 en Tokio
    const dev = await openDevice(fake, 'iphone', { timezoneId: 'Asia/Tokyo', fixedTime: '2026-10-29T06:30:00Z' });
    const { page } = dev;
    await page.goto(`${server.url}/#/hoy`);
    await waitStatus(page, /^Guardado en GitHub/);
    assert.match(await page.locator('.subtitle').first().textContent(), /^Miércoles, 28 de octubre$/);
    assert.match(await page.locator('.big-number').textContent(), /^4 tarjetas para hoy$/);
    await shot(page, 'iphone-hoy');

    await page.getByRole('link', { name: 'Empezar repaso' }).click();
    await page.getByRole('button', { name: 'Mostrar respuesta' }).waitFor();
    assert.equal(await page.locator('.flash-answer').isVisible(), false, 'la respuesta empieza oculta');
    assert.equal(await page.getByRole('button', { name: /^Sin ayuda/ }).isVisible(), false);
    await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
    assert.equal(await page.locator('.flash-answer').isVisible(), true);
    assert.equal(await page.getByRole('button', { name: 'Mostrar respuesta' }).isVisible(), false);
    const first = await page.locator('.flash-text').nth(1).textContent();
    await shot(page, 'iphone-repaso');
    await page.getByRole('button', { name: /^Sin ayuda/ }).click();
    await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
    await page.getByRole('button', { name: /^Con ayuda/ }).click(); // vuelve hoy
    await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
    await page.getByRole('button', { name: /^No lo logré/ }).click();
    await waitFor(() => fake.json().cards.some((c) => c.reviews.length === 1 && c.answer === first && c.due === '2026-10-31'));
    const cards = fake.json().cards;
    const sin = cards.find((c) => c.answer === first);
    assert.equal(sin.due, '2026-10-31', 'sin ayuda: 28 oct + 3 días (no 29 + 3)');
    assert.equal(sin.step, 1);
    const con = cards.find((c) => c.reviews[0]?.result === 'con');
    assert.equal(con.due, '2026-10-28', 'con ayuda: vuelve hoy');
    const no = cards.find((c) => c.reviews[0]?.result === 'no');
    assert.equal(no.due, '2026-10-29', 'no lo logré: mañana');
    assert.equal(no.reviews[0].day, '2026-10-28');

    // Una tarjeta creada ahora se repasa «mañana» en Vancouver: 29 oct.
    await go(page, `#/sesion/${data.sessions[0].id}`);
    await page.fill('#ses-tarjeta-pista', 'en la terraza (nueva)');
    await page.fill('#ses-tarjeta-respuesta', 'en terrasse');
    await page.getByRole('button', { name: 'Añadir tarjeta' }).click();
    await waitFor(() => fake.json().cards.some((c) => c.prompt === 'en la terraza (nueva)'));
    assert.equal(fake.json().cards.find((c) => c.prompt === 'en la terraza (nueva)').due, '2026-10-29');
    assert.deepEqual(dev.errors, []);
    await dev.context.close();
  });

  test('tras una pausa larga, las atrasadas se reparten sin acumularse', async () => {
    const d = emptyData();
    for (let i = 0; i < 23; i++) d.cards.push({ ...newCard({ kind: 'expresion', prompt: `pista ${i}`, answer: `réponse ${i}` }, '2026-09-30'), step: 2 });
    const fake = createFakeGitHub();
    fake.setRemote(serialize(d));
    const dev = await openDevice(fake, 'ipad', { fixedTime: '2026-10-29T06:30:00Z' });
    const { page } = dev;
    await page.goto(`${server.url}/#/repaso`);
    await page.getByRole('heading', { name: 'Repasos atrasados' }).waitFor();
    assert.match(await page.locator('.notice').innerText(), /23 tarjetas de días anteriores/);
    await shot(page, 'ipad-reprogramar');
    await page.selectOption('#reprogramar-por-dia', '10');
    await page.getByRole('button', { name: 'Reprogramar' }).click();
    await waitFor(() => fake.json().cards.every((c) => c.due >= '2026-10-28'));
    const perDay = {};
    for (const c of fake.json().cards) perDay[c.due] = (perDay[c.due] || 0) + 1;
    assert.deepEqual(perDay, { '2026-10-28': 10, '2026-10-29': 10, '2026-10-30': 3 });
    assert.equal(await page.locator('.notice').count(), 0);
    await dev.context.close();
  });
});

describe('Conversación y REGISTRO', () => {
  test('el registro se guarda íntegro como texto y nada cambia sin confirmar', async () => {
    const { data, ids } = sampleData();
    const fake = createFakeGitHub();
    fake.setRemote(serialize(data));
    const dev = await openDevice(fake, 'mac');
    const { page } = dev;
    await page.goto(`${server.url}/#/conversacion`);
    await waitStatus(page, /^Guardado en GitHub/);
    await page.getByRole('button', { name: 'Nueva consigna' }).click();
    await page.waitForSelector('#conv-consigna');
    await page.selectOption('#conv-objetivo', ids.o1);
    await page.fill('#conv-rol', 'un serveur pressé');
    await page.fill('#conv-expr1', 'je voudrais');
    const prompt = await page.inputValue('#conv-consigna');
    assert.match(prompt, /Pedir y reservar en un restaurante/);
    assert.match(prompt, /un serveur pressé/);
    assert.match(prompt, /REGISTRO\nFecha y sesión:/);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copiar consigna' }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), prompt);
    const chatgpt = page.getByRole('link', { name: /Abrir ChatGPT/ });
    assert.equal(await chatgpt.getAttribute('href'), 'https://chatgpt.com/');
    assert.equal(await chatgpt.getAttribute('rel'), 'noopener noreferrer');

    const registro = [
      'REGISTRO',
      'Fecha y sesión: 28 oct',
      'Habilidad: Interacción oral',
      'Evidencia: <img src=x onerror="window.__xss=1"> « Je voudrais une table. » <b>gras</b>',
      'Logro: Pedí sin leer.',
      'Estado sugerido: Logrado con apoyo',
      'Expresiones para recuperar:',
      '- une table en terrasse = una mesa en la terraza',
      '- pressé = con prisa',
      'Siguiente práctica: quejarme de un plato',
    ].join('\n');
    await page.fill('#conv-registro', registro);
    await page.getByText('Estado sugerido: Logrado con apoyo (ahora: En práctica).').waitFor();
    await waitFor(() => fake.json().conversations.some((c) => c.registro === registro));
    assert.equal(fake.json().objectives.find((o) => o.id === ids.o1).status, 'practica', 'pegar el registro no cambia estados');
    assert.equal(fake.json().cards.length, data.cards.length, 'pegar el registro no crea tarjetas');
    assert.equal(await page.evaluate(() => document.querySelectorAll('main img, dialog img').length), 0, 'el texto pegado no se convierte en HTML');
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    await page.getByText('Ver los campos leídos').click();
    assert.match(await page.locator('.analysis').innerText(), /<img src=x onerror="window.__xss=1">/);
    await shot(page, 'mac-conversacion');

    // Cambiar el estado pide motivo y queda en el historial.
    await page.getByRole('button', { name: 'Revisar y cambiar el estado…' }).click();
    await page.getByRole('heading', { name: 'Cambiar estado' }).waitFor();
    assert.ok(await page.locator('input[value="apoyo"]').isChecked());
    await page.fill('#motivo-estado', '');
    await page.getByRole('button', { name: 'Guardar cambio' }).click();
    await page.getByText('Escribe el motivo: quedará en el historial.').waitFor();
    await page.fill('#motivo-estado', 'Pedí la mesa con una sola pista.');
    await page.getByRole('button', { name: 'Guardar cambio' }).click();
    await waitFor(() => fake.json().objectives.find((o) => o.id === ids.o1).status === 'apoyo');
    const history = fake.json().objectives.find((o) => o.id === ids.o1).history.at(-1);
    assert.equal(history.reason, 'Pedí la mesa con una sola pista.');
    assert.equal(history.source.type, 'conversation');
    assert.ok(fake.commits.some((c) => /Objetivo «Pedir y reservar en un restaurante»: En práctica → Logrado con apoyo/.test(c.message)));

    // Crear tarjetas pide confirmación.
    await page.getByRole('button', { name: 'Crear tarjetas de repaso…' }).click();
    await page.getByRole('button', { name: 'Crear tarjetas', exact: true }).click();
    await waitFor(() => fake.json().cards.length === data.cards.length + 2);
    assert.ok(fake.json().cards.some((c) => c.answer === 'une table en terrasse' && c.prompt === 'una mesa en la terraza'));
    await page.getByText('Ya confirmaste').waitFor();
    assert.deepEqual(dev.errors, []);
    await dev.context.close();
  });
});

describe('Ajustes: token, exportar e importar', () => {
  test('el token nunca se muestra completo y solo se habla con api.github.com', async () => {
    const { data } = sampleData();
    const fake = createFakeGitHub();
    fake.setRemote(serialize(data));
    const dev = await openDevice(fake, 'mac');
    const { page, requests } = dev;
    await page.goto(`${server.url}/#/ajustes`);
    await waitStatus(page, /^Guardado en GitHub/);
    const text = await page.locator('body').innerText();
    assert.ok(!text.includes(TOKEN), 'el token completo no aparece');
    assert.match(text, /github_pat_…XYZ9/);
    assert.equal(await page.locator('input[type=password]').count(), 0);
    await page.getByRole('button', { name: 'Probar conexión' }).click();
    await page.getByText(`✓ Conectado a ${REPO}.`).waitFor();
    await shot(page, 'mac-ajustes');
    const hosts = new Set(requests.map((u) => new URL(u).host));
    for (const host of hosts) assert.ok(host === 'api.github.com' || host.startsWith('localhost'), `petición inesperada a ${host}`);
    assert.ok(fake.requests.every((r) => !r.url.includes(TOKEN)));

    // Cambiar el token: se escribe en un campo de contraseña y se enmascara al guardar.
    await page.getByRole('button', { name: 'Cambiar token' }).click();
    assert.equal(await page.locator('#ajustes-token').getAttribute('type'), 'password');
    await page.getByRole('button', { name: 'Cancelar' }).click();
    assert.deepEqual(dev.errors, []);
    await dev.context.close();
  });

  test('exportar descarga el JSON e importar muestra un resumen antes de aplicar', async () => {
    const { data } = sampleData();
    const fake = createFakeGitHub();
    fake.setRemote(serialize(data));
    const dev = await openDevice(fake, 'mac');
    const { page } = dev;
    await page.goto(`${server.url}/#/ajustes`);
    await waitStatus(page, /^Guardado en GitHub/);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar JSON' }).click()]);
    assert.match(download.suggestedFilename(), /^mi-frances-\d{4}-\d{2}-\d{2}\.json$/);
    const exported = JSON.parse(readFileSync(await download.path(), 'utf8'));
    assert.equal(exported.sessions.length, data.sessions.length);

    const incoming = clone(exported);
    incoming.references = incoming.references.slice(0, 1);
    incoming.cards.push(newCard({ kind: 'expresion', prompt: 'importada', answer: 'importée' }, '2026-10-28'));
    const file = join(process.env.TMPDIR || '/tmp', `importar-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify(incoming));
    await page.setInputFiles('#ajustes-importar', file);
    await page.getByRole('heading', { name: 'Importar JSON' }).waitFor();
    const summary = await page.locator('.summary-table').innerText();
    assert.match(summary, /Biblioteca\s+2\s+1/);
    assert.match(summary, /Tarjetas de repaso\s+5\s+6/);
    assert.equal(fake.json().references.length, 2, 'nada cambia antes de confirmar');
    await shot(page, 'mac-importar');
    await page.getByRole('button', { name: 'Reemplazar mis datos' }).click();
    await waitFor(() => fake.json().references.length === 1 && fake.json().cards.length === 6);
    assert.match(fake.commits.at(-1).message, /^Importar JSON/);
    const backups = await page.evaluate(() => JSON.parse(localStorage.getItem('miFrances.copias')));
    assert.equal(backups[0].data.references.length, 2, 'copia de seguridad de lo anterior');
    assert.deepEqual(dev.errors, []);
    await dev.context.close();
  });
});

describe('Ayudas para estudiar', () => {
  test('sesión: plan por fases, corrección con ChatGPT, tarjetas de los errores y estado desde el cierre', async () => {
    const { data, ids } = sampleData();
    const fake = createFakeGitHub();
    fake.setRemote(serialize(data));
    const dev = await openDevice(fake, 'iphone');
    const { page, context } = dev;
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`${server.url}/#/sesion/${ids.s1}`);
    await waitStatus(page, /^Guardado en GitHub/);
    assert.equal(await page.locator('.phases li.current').count(), 1);
    assert.match(await page.locator('.phases').innerText(), /Plan sugerido · ahora: primer intento \(hasta el minuto 15\)/);

    await page.getByRole('button', { name: 'Copiar consigna de corrección' }).click();
    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(prompt, /Pedir y reservar en un restaurante/);
    assert.match(prompt, /Bonjour, je voudrais réserver une table pour deux personnes/);
    assert.match(prompt, /Cómo sabré que lo logré: Reservo una mesa y pido sin leer\./);

    assert.equal(await page.getByRole('button', { name: /^Crear tarjetas con/ }).isVisible(), false);
    await page.fill('#ses-feedback', '3. Errores:\n- nous avons allé au cinéma → nous sommes allés au cinéma (verbo être)\n- bien que je suis fatigué → bien que je sois fatigué');
    await page.getByRole('button', { name: 'Crear tarjetas con 2 errores…' }).click();
    await page.getByRole('button', { name: 'Crear tarjetas', exact: true }).click();
    await waitFor(() => fake.json().cards.filter((c) => c.kind === 'error' && c.source.id === ids.s1).length === 4);
    const card = fake.json().cards.find((c) => c.note === 'verbo être');
    assert.equal(card.prompt, 'nous avons allé au cinéma');
    assert.equal(card.answer, 'nous sommes allés au cinéma');
    assert.ok(fake.json().cards.some((c) => c.answer === 'bien que je sois fatigué'));
    assert.equal(fake.json().sessions.find((s) => s.id === ids.s1).feedback.split('\n').length, 3);

    await page.fill('#ses-cierre-achievement', 'Reservé sin pistas.');
    await page.getByRole('button', { name: 'Cambiar estado del objetivo…' }).click();
    assert.match(await page.inputValue('#motivo-estado'), /^Sesión del .*Logro: Reservé sin pistas\./);
    assert.match(await page.locator('dialog').innerText(), /Lo consigo sin ayuda en la situación practicada/);
    await page.locator('input[value="autonomo"]').check();
    await page.getByRole('button', { name: 'Guardar cambio' }).click();
    await waitFor(() => fake.json().objectives.find((o) => o.id === ids.o1).status === 'autonomo');
    assert.equal(fake.json().objectives.find((o) => o.id === ids.o1).history.at(-1).source.type, 'session');
    await shot(page, 'iphone-sesion-correccion');
    assert.deepEqual(dev.errors, []);
    await context.close();
  });

  test('conversación: pasar el REGISTRO al cierre de la sesión y repetir la práctica', async () => {
    const { data, ids } = sampleData();
    const fake = createFakeGitHub();
    fake.setRemote(serialize(data));
    const dev = await openDevice(fake, 'ipad');
    const { page } = dev;
    await page.goto(`${server.url}/#/conversacion/${ids.c1}`);
    await waitStatus(page, /^Guardado en GitHub/);
    const registro = 'REGISTRO\nLogro: Pedí la cuenta sin ayuda.\nPrioridad: el artículo contracto «au».\nEstado sugerido: Logrado con apoyo\nSiguiente práctica: quejarme de un plato frío.';
    await page.fill('#conv-registro', registro);
    await page.getByRole('button', { name: 'Pasar al cierre de la sesión…' }).click();
    await page.getByRole('button', { name: 'Pasar al cierre', exact: true }).click();
    await waitFor(() => fake.json().sessions.find((s) => s.id === ids.s1).closing.nextStep === 'quejarme de un plato frío.');
    const closing = fake.json().sessions.find((s) => s.id === ids.s1).closing;
    assert.equal(closing.achievement, 'Pedí la cuenta sin ayuda.');
    assert.equal(closing.difficulty, 'el artículo contracto «au».');
    assert.equal(fake.json().objectives.find((o) => o.id === ids.o1).status, 'practica', 'el estado no cambia sin confirmar');

    const before = fake.json().conversations.length;
    await page.getByRole('button', { name: 'Repetir esta práctica' }).click();
    await page.waitForFunction((id) => location.hash.startsWith('#/conversacion/') && !location.hash.endsWith(id), ids.c1);
    assert.match(await page.inputValue('#conv-errores'), /el artículo contracto «au»/);
    assert.equal(await page.inputValue('#conv-rol'), 'un serveur dans un bistrot parisien');
    await waitFor(() => fake.json().conversations.length === before + 1);
    assert.deepEqual(dev.errors, []);
    await dev.context.close();
  });

  test('Hoy: primeros pasos (y ocultarlos), siguiente paso, sugerencia y número de repasos', async () => {
    const fresh = await openDevice(null, 'iphone', { token: '' });
    await fresh.page.goto(`${server.url}/#/hoy`);
    await fresh.page.getByRole('heading', { name: 'Primeros pasos (0 de 6)' }).waitFor();
    await shot(fresh.page, 'iphone-primeros-pasos');
    await fresh.page.getByRole('button', { name: 'Ocultar esta lista' }).click();
    await fresh.page.reload();
    await fresh.page.getByRole('heading', { name: 'Hoy', exact: true }).waitFor();
    assert.equal(await fresh.page.getByText(/^Primeros pasos/).count(), 0);
    await fresh.context.close();

    const { data } = sampleData();
    const fake = createFakeGitHub();
    fake.setRemote(serialize(data));
    const dev = await openDevice(fake, 'iphone', { fixedTime: '2026-10-28T19:00:00Z' });
    const { page } = dev;
    await page.goto(`${server.url}/#/hoy`);
    await waitStatus(page, /^Guardado en GitHub/);
    const text = await page.locator('main').innerText();
    assert.match(text, /Tu siguiente paso \(sesión del 26 oct\.?\)/);
    assert.match(text, /Sugerencia de objetivo/);
    assert.equal(await page.locator('#repasos-pendientes').textContent(), '4');
    await shot(page, 'iphone-hoy-sugerencia');
    assert.deepEqual(dev.errors, []);
    await dev.context.close();
  });

  test('Repaso: escribir la respuesta (acentos) y atajos de teclado en el Mac', async () => {
    const { data } = sampleData();
    const answers = Object.fromEntries(data.cards.map((c) => [c.prompt, c.answer]));
    const fake = createFakeGitHub();
    fake.setRemote(serialize(data));
    const dev = await openDevice(fake, 'mac', { fixedTime: '2026-10-28T19:00:00Z' });
    const { page } = dev;
    await page.goto(`${server.url}/#/repaso/practicar`);
    await waitStatus(page, /^Guardado en GitHub/);
    const promptNow = async () => page.locator('.flash-text').first().textContent();

    // 1) Escribe sin acentos → aviso de acentos; atajo ⌘+Intro y «1».
    let prompt = await promptNow();
    await page.fill('#repaso-escribir', answers[prompt].normalize('NFD').replace(/[̀-ͯ]/g, ''));
    await page.keyboard.press('Meta+Enter');
    const accents = /[̀-ͯ]/.test(answers[prompt].normalize('NFD'));
    assert.equal(await page.locator('.compare').textContent(), accents ? 'Casi: revisa los acentos.' : '✓ Lo escribiste igual.');
    await page.keyboard.press('1');
    await page.getByText('Quedan 3').waitFor();

    // 2) Escribe igual → «Lo escribiste igual»; «3».
    prompt = await promptNow();
    await page.fill('#repaso-escribir', answers[prompt]);
    await page.keyboard.press('Control+Enter');
    assert.equal(await page.locator('.compare').textContent(), '✓ Lo escribiste igual.');
    await shot(page, 'mac-repaso-escrito');
    await page.keyboard.press('3');
    await page.getByText('Quedan 2').waitFor();

    // 3) Sin escribir: Espacio para ver y «2».
    await page.locator('h1').click();
    await page.keyboard.press(' ');
    assert.ok(await page.locator('.flash-answer').isVisible());
    await page.keyboard.press('2');
    await waitFor(() => fake.json().cards.filter((c) => c.reviews.length).length === 3);
    const results = fake.json().cards.flatMap((c) => c.reviews.map((r) => r.result)).sort();
    assert.deepEqual(results, ['con', 'no', 'sin']);
    assert.deepEqual(dev.errors, []);
    await dev.context.close();
  });

  test('Biblioteca y Objetivos: empezar una sesión ya rellenada; Progreso con unidades y actividad', async () => {
    const { data, ids } = sampleData();
    const fake = createFakeGitHub();
    fake.setRemote(serialize(data));
    const dev = await openDevice(fake, 'ipadHorizontal', { fixedTime: '2026-10-28T19:00:00Z' });
    const { page } = dev;
    await page.goto(`${server.url}/#/biblioteca`);
    await waitStatus(page, /^Guardado en GitHub/);
    assert.match(await page.locator('main').innerText(), /Usada en 1 sesión y 1 conversación/);
    await page.locator('.ref-card', { hasText: 'Unidad 3' }).getByRole('link', { name: 'Empezar sesión' }).click();
    await page.waitForSelector('#nueva-unidad');
    assert.equal(await page.inputValue('#nueva-unidad'), '3');
    assert.equal(await page.inputValue('#nueva-pagina'), '42');

    await go(page, `#/objetivos/${ids.o1}`);
    await page.getByRole('link', { name: 'Empezar sesión' }).click();
    await page.waitForSelector('#nueva-objetivo');
    assert.equal(await page.inputValue('#nueva-objetivo'), ids.o1);

    await go(page, '#/objetivos');
    assert.match(await page.locator('main').innerText(), /Última práctica: (hoy|ayer|hace \d+ días)/);

    await go(page, '#/progreso');
    const progress = await page.locator('main').innerText();
    assert.match(progress, /Unidad 3 · 1 sesión, 1 conversación/);
    assert.match(progress, /Esta semana: 2 sesiones · 1 conversación · 0 repasos/);
    assert.match(progress, /Dificultad \(sesión\): Las fórmulas de cortesía del final\./);
    await shot(page, 'ipadHorizontal-progreso-nuevo');
    assert.deepEqual(dev.errors, []);
    await dev.context.close();
  });
});

describe('Pantallas de iPhone, iPad y Mac', () => {
  const ROUTES = (ids) => ['#/hoy', '#/sesion/nueva', `#/sesion/${ids.s1}`, '#/sesiones', '#/conversacion', `#/conversacion/${ids.c1}`, '#/biblioteca', '#/objetivos', `#/objetivos/${ids.o1}`, '#/repaso', '#/repaso/practicar', '#/repaso/tarjetas', '#/progreso', '#/ajustes', '#/ayuda', '#/mas'];

  for (const kind of Object.keys(DEVICES)) {
    test(`${kind}: sin desbordes, indicador y navegación siempre visibles, botones grandes`, async () => {
      const { data, ids } = sampleData();
      const fake = createFakeGitHub();
      fake.setRemote(serialize(data));
      const dev = await openDevice(fake, kind, { fixedTime: '2026-10-28T19:00:00Z' });
      const { page } = dev;
      await page.goto(`${server.url}/#/hoy`);
      await waitStatus(page, /^Guardado en GitHub/);
      for (const route of ROUTES(ids)) {
        if (kind === 'mac' || kind === 'ipadHorizontal' || kind === 'ipad' || kind === 'iphoneHorizontal') {
          if (route === '#/mas') continue; // «Más» solo existe en pantallas estrechas
        }
        await go(page, route);
        await page.waitForTimeout(80);
        const r = await page.evaluate(() => {
          const vw = window.innerWidth;
          const wide = [...document.querySelectorAll('body *')]
            .filter((el) => {
              const b = el.getBoundingClientRect();
              return b.width > 0 && b.right > vw + 1 && getComputedStyle(el).position !== 'fixed' && !el.closest('.offscreen');
            })
            .slice(0, 3)
            .map((el) => `${el.tagName}.${el.className}`);
          window.scrollTo(0, document.documentElement.scrollHeight);
          const st = document.querySelector('#sync-status').getBoundingClientRect();
          const nav = document.querySelector('#nav');
          const navBox = nav.getBoundingClientRect();
          const visibleNavItems = [...nav.querySelectorAll('.nav-item')].filter((a) => a.getBoundingClientRect().width > 0);
          const small = [...document.querySelectorAll('main .btn, main .chip, .nav-item, #sync-status')]
            .filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height < 36)
            .map((el) => `${el.className}:${el.textContent.trim().slice(0, 20)}`);
          const stText = document.querySelector('#sync-status .status-text');
          window.scrollTo(0, 0);
          return {
            statusFull: stText.scrollWidth <= stText.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            vw,
            wide,
            statusVisible: st.top >= 0 && st.bottom <= window.innerHeight && st.width > 40,
            navVisible: navBox.width > 0 && navBox.height > 0 && navBox.top < window.innerHeight,
            navItems: visibleNavItems.length,
            small,
          };
        });
        assert.ok(r.scrollWidth <= r.vw, `${kind} ${route}: scroll horizontal ${r.scrollWidth}>${r.vw} ${r.wide.join(', ')}`);
        assert.deepEqual(r.wide, [], `${kind} ${route}: elementos más anchos que la pantalla`);
        assert.ok(r.statusVisible, `${kind} ${route}: el indicador de guardado no se ve tras desplazar`);
        assert.ok(r.statusFull, `${kind} ${route}: el texto del indicador se corta`);
        assert.ok(r.navVisible, `${kind} ${route}: no se ve la navegación`);
        assert.ok(r.navItems >= 5, `${kind} ${route}: faltan pantallas en la navegación`);
        assert.deepEqual(r.small, [], `${kind} ${route}: botones demasiado pequeños`);
      }
      await go(page, '#/hoy');
      await shot(page, `${kind}-hoy`);
      await go(page, `#/sesion/${ids.s1}`);
      await shot(page, `${kind}-sesion`);
      await go(page, '#/progreso');
      await shot(page, `${kind}-progreso`);
      assert.deepEqual(dev.errors, []);
      await dev.context.close();
    });
  }
});
