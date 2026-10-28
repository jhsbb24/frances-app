// ─────────────────────────────────────────────────────────────
// Pruebas de la lógica (sin navegador), con un GitHub FALSO.
// Ejecutar:  node --test tests/unit.test.js
// ─────────────────────────────────────────────────────────────

// El «dispositivo» de la prueba está en Tokio a propósito: los
// repasos deben seguir la hora de Vancouver igualmente.
process.env.TZ = 'Asia/Tokyo';
globalThis.__MI_FRANCES_PRUEBAS__ = { saveDelay: 10, minGap: 0, retry: 40, timeout: 2000 };

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const { dayKey, today, addDays } = await import('../js/dates.js');
const { schedule, applyAnswer, dueCards, overdueCards, planReschedule, firstDue } = await import('../js/review.js');
const { newCard, newSession, newReference, emptyData, normalizeData, clone } = await import('../js/model.js');
const { parseRegistro, buildPrompt, DEFAULT_TEMPLATE, REGISTRO_FIELDS, splitExpressions } = await import('../js/registro.js');
const { createGitHubApi, encodeBase64, decodeBase64, maskToken, parseRepo } = await import('../js/github.js');
const { SyncEngine, buildCommitMessage } = await import('../js/sync.js');
const { compareVersions, mergeVersions } = await import('../js/diff.js');
const { createFakeGitHub, TOKEN, REPO } = await import('./fake-github.js');

const at = (iso) => new Date(iso);

// ── Fechas en America/Vancouver ───────────────────────────────

describe('Fechas con la zona horaria America/Vancouver', () => {
  test('el dispositivo de la prueba está en otra zona (Tokio)', () => {
    assert.equal(new Date('2026-10-29T06:30:00Z').getTimezoneOffset(), -540);
  });

  test('a las 23:30 en Vancouver todavía es el mismo día (aunque en UTC y Tokio ya sea el siguiente)', () => {
    assert.equal(dayKey(at('2026-10-29T06:30:00Z')), '2026-10-28'); // 23:30 PDT
    assert.equal(dayKey(at('2026-10-29T07:00:00Z')), '2026-10-29'); // 00:00 PDT
  });

  test('cambio de hora de otoño (1 nov 2026)', () => {
    assert.equal(dayKey(at('2026-11-01T08:30:00Z')), '2026-11-01'); // 01:30 PDT
    assert.equal(dayKey(at('2026-11-01T09:30:00Z')), '2026-11-01'); // 01:30 PST
    assert.equal(dayKey(at('2026-11-02T07:59:00Z')), '2026-11-01'); // 23:59 PST
    assert.equal(dayKey(at('2026-11-02T08:00:00Z')), '2026-11-02'); // 00:00 PST
  });

  test('cambio de hora de primavera (14 mar 2027)', () => {
    assert.equal(dayKey(at('2027-03-14T09:59:00Z')), '2027-03-14'); // 01:59 PST
    assert.equal(dayKey(at('2027-03-14T10:00:00Z')), '2027-03-14'); // 03:00 PDT
    assert.equal(dayKey(at('2027-03-15T06:59:00Z')), '2027-03-14'); // 23:59 PDT
    assert.equal(dayKey(at('2027-03-15T07:00:00Z')), '2027-03-15');
  });

  test('sumar días cruza meses, años y años bisiestos', () => {
    assert.equal(addDays('2026-10-31', 1), '2026-11-01');
    assert.equal(addDays('2026-12-30', 3), '2027-01-02');
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(addDays('2026-11-01', 14), '2026-11-15');
  });
});

// ── Repasos ───────────────────────────────────────────────────

describe('Programación de repasos (1, 3, 7, 14 días)', () => {
  test('una tarjeta creada a las 23:30 de Vancouver se repasa al día siguiente de Vancouver', () => {
    const t = today(at('2026-10-29T06:30:00Z'));
    assert.equal(t, '2026-10-28');
    const card = newCard({ kind: 'expresion', prompt: 'arreglárselas', answer: "s'en sortir" }, t);
    assert.equal(card.due, '2026-10-29');
    assert.equal(card.step, 0);
  });

  test('«Sin ayuda» avanza: 1 → 3 → 7 → 14 → 14', () => {
    const card = newCard({ kind: 'expresion', prompt: 'p', answer: 'r' }, '2026-10-28');
    const sequence = [];
    let day = card.due;
    for (let i = 0; i < 5; i++) {
      applyAnswer(card, 'sin', day, `${day}T18:00:00Z`);
      sequence.push([card.step, card.due]);
      day = card.due;
    }
    assert.deepEqual(sequence, [
      [1, '2026-11-01'], // 29 oct + 3
      [2, '2026-11-08'], // + 7
      [3, '2026-11-22'], // + 14
      [3, '2026-12-06'], // se queda en 14
      [3, '2026-12-20'],
    ]);
    assert.equal(card.reviews.length, 5);
  });

  test('«Con ayuda» no avanza y vuelve hoy; si se repite con ayuda, vuelve mañana', () => {
    const card = { step: 2, due: '2026-10-28', repeatToday: '' };
    const first = schedule(card, 'con', '2026-10-28');
    assert.deepEqual(first, { step: 2, due: '2026-10-28', repeatToday: '2026-10-28', again: true });
    Object.assign(card, first);
    const second = schedule(card, 'con', '2026-10-28');
    assert.deepEqual(second, { step: 2, due: '2026-10-29', repeatToday: '', again: false });
  });

  test('«No lo logré» vuelve mañana y reinicia el intervalo', () => {
    assert.deepEqual(schedule({ step: 3, due: '2026-10-28' }, 'no', '2026-10-28'), { step: 0, due: '2026-10-29', repeatToday: '', again: false });
  });

  test('el día de hoy para responder también es el de Vancouver', () => {
    const card = newCard({ kind: 'error', prompt: 'je suis allé au le marché', answer: 'au marché' }, '2026-10-27');
    const t = today(at('2026-10-29T06:30:00Z')); // 28 oct en Vancouver, 29 en Tokio
    applyAnswer(card, 'sin', t, '2026-10-29T06:30:00Z');
    assert.equal(card.due, '2026-10-31'); // 28 + 3, no 29 + 3
  });

  test('tarjetas para hoy: incluye atrasadas, excluye futuras y archivadas', () => {
    const cards = [
      { id: 'a', due: '2026-10-20', createdAt: '1', archived: false },
      { id: 'b', due: '2026-10-28', createdAt: '2', archived: false },
      { id: 'c', due: '2026-10-29', createdAt: '3', archived: false },
      { id: 'd', due: '2026-10-01', createdAt: '4', archived: true },
    ];
    assert.deepEqual(dueCards(cards, '2026-10-28').map((c) => c.id), ['a', 'b']);
    assert.deepEqual(overdueCards(cards, '2026-10-28').map((c) => c.id), ['a']);
  });

  test('tras una pausa larga: reprogramar reparte sin acumular (máximo por día)', () => {
    const t = '2026-10-28';
    const cards = [];
    for (let i = 0; i < 25; i++) cards.push({ id: `old${i}`, due: addDays('2026-10-01', i % 5), step: 2, createdAt: String(i), archived: false });
    for (let i = 0; i < 3; i++) cards.push({ id: `hoy${i}`, due: t, step: 1, createdAt: `h${i}`, archived: false });
    const plan = planReschedule(cards, t, 10);
    assert.equal(plan.size, 25);
    const perDay = {};
    for (const p of plan.values()) perDay[p.due] = (perDay[p.due] || 0) + 1;
    assert.deepEqual(perDay, { '2026-10-28': 7, '2026-10-29': 10, '2026-10-30': 8 }); // hoy ya tenía 3
    assert.ok([...plan.values()].every((p) => p.step === 2));
    const restart = planReschedule(cards, t, 10, true);
    assert.ok([...restart.values()].every((p) => p.step === 0));
  });

  test('primer repaso de una tarjeta nueva: mañana', () => {
    assert.equal(firstDue('2026-12-31'), '2027-01-01');
  });
});

// ── Consigna y REGISTRO ───────────────────────────────────────

describe('Consigna y REGISTRO', () => {
  test('la plantilla incluye el REGISTRO con todos los campos, en orden', () => {
    const text = buildPrompt(DEFAULT_TEMPLATE, { fecha: '28 oct', objetivo: 'Pedir en un restaurante', habilidad: 'Interacción oral', rol: 'un serveur', dificultad: 'fácil', referencia: 'Édito B1 · Unidad 3', expresion1: 'je voudrais', expresion2: 'l’addition', errores: 'au le' });
    assert.match(text, /Pedir en un restaurante/);
    assert.ok(!/\{[a-z0-9]+\}/.test(text), 'no deben quedar marcadores sin reemplazar');
    let pos = text.indexOf('REGISTRO\n');
    assert.ok(pos > 0);
    for (const f of REGISTRO_FIELDS) {
      const next = text.indexOf(`${f.label}:`, pos);
      assert.ok(next > pos, `falta o está fuera de orden: ${f.label}`);
      pos = next;
    }
  });

  test('lee un REGISTRO con el formato típico de ChatGPT (negritas, viñetas)', () => {
    const registro = [
      '**REGISTRO**',
      '- **Fecha y sesión:** 28 de octubre de 2026',
      '- **Material y objetivo:** Édito B1, unidad 3 — pedir en un restaurante',
      '- **Habilidad:** Interacción oral',
      '- **Evidencia:** « Je voudrais une table pour deux. »',
      '« L’addition, s’il vous plaît. »',
      '- **Apoyos durante el intento:** una pista con «réserver»',
      '- **Logro:** Pediste la mesa y la cuenta.',
      '- **Prioridad:** artículo contracto «au».',
      '- **Segundo intento:** Correcto.',
      '- **Estado sugerido:** Logrado con apoyo',
      '- **Expresiones para recuperar:**',
      '  - réserver une table = reservar una mesa',
      '  - l’addition, s’il vous plaît = la cuenta, por favor',
      '- **Siguiente práctica:** Quejarse de un plato.',
    ].join('\n');
    const p = parseRegistro(registro);
    assert.equal(p.found, true);
    assert.equal(p.status, 'apoyo');
    assert.equal(p.skill, 'oral');
    assert.equal(p.fields.logro, 'Pediste la mesa y la cuenta.');
    assert.match(p.fields.evidencia, /L’addition/);
    assert.deepEqual(p.expressions, [
      { answer: 'réserver une table', prompt: 'reservar una mesa' },
      { answer: 'l’addition, s’il vous plaît', prompt: 'la cuenta, por favor' },
    ]);
  });

  test('quita las negritas de Markdown pero no otros guiones bajos', () => {
    const p = parseRegistro('__Logro:__ usar window.__x y snake_case\nEstado sugerido: **En práctica**');
    assert.equal(p.fields.logro, 'usar window.__x y snake_case');
    assert.equal(p.status, 'practica');
  });

  test('estados sugeridos reconocidos', () => {
    const st = (s) => parseRegistro(`Logro: x\nEstado sugerido: ${s}`).status;
    assert.equal(st('En práctica'), 'practica');
    assert.equal(st('Logrado de forma autónoma'), 'autonomo');
    assert.equal(st('Transferido'), 'transferido');
    assert.equal(st('Pendiente de observar'), 'pendiente');
  });

  test('expresiones sin separador quedan como respuesta sin pista', () => {
    assert.deepEqual(splitExpressions('- «se débrouiller»\n- c’est-à-dire'), [
      { answer: 'se débrouiller', prompt: '' },
      { answer: 'c’est-à-dire', prompt: '' },
    ]);
  });
});

// ── Cliente de GitHub ─────────────────────────────────────────

function apiFor(fake, token = TOKEN) {
  return createGitHubApi({ getToken: () => token, getRepo: () => REPO, fetchFn: (...a) => fake.fetch(...a), timeoutMs: 2000 });
}

describe('Cliente de la API de GitHub (con GitHub falso)', () => {
  test('base64 conserva acentos y emojis', () => {
    const text = 'Élève, ça va ? Œuvre « déjà » — ñ 🇫🇷';
    assert.equal(decodeBase64(encodeBase64(text)), text);
  });

  test('si data.json no existe devuelve null; luego se crea y se lee igual', async () => {
    const fake = createFakeGitHub();
    const api = apiFor(fake);
    assert.equal(await api.readFile(), null);
    const { sha } = await api.writeFile('{"hola":"ça va"}\n', null, 'Crear data.json');
    const back = await api.readFile();
    assert.equal(back.sha, sha);
    assert.equal(back.text, '{"hola":"ça va"}\n');
    assert.equal(fake.commits[0].message, 'Crear data.json');
  });

  test('un sha distinto se rechaza como conflicto (409) y sin sha también (422)', async () => {
    const fake = createFakeGitHub();
    const api = apiFor(fake);
    await api.writeFile('a', null, 'uno');
    await assert.rejects(api.writeFile('b', 'sha-viejo', 'dos'), (e) => e.kind === 'conflict');
    await assert.rejects(api.writeFile('b', null, 'dos'), (e) => e.kind === 'conflict');
    assert.equal(fake.file.text, 'a');
  });

  test('token malo → error de token; sin conexión → error de red', async () => {
    const fake = createFakeGitHub();
    await assert.rejects(apiFor(fake, 'github_pat_otro').readFile(), (e) => e.kind === 'auth');
    fake.offline = true;
    await assert.rejects(apiFor(fake).readFile(), (e) => e.kind === 'network');
  });

  test('el token solo va a api.github.com y nunca se muestra completo', async () => {
    const fake = createFakeGitHub();
    const seen = [];
    const api = createGitHubApi({ getToken: () => TOKEN, getRepo: () => REPO, fetchFn: (url, opts) => (seen.push({ url, opts }), fake.fetch(url, opts)) });
    await api.readFile();
    assert.ok(seen.length > 0);
    for (const { url, opts } of seen) {
      assert.ok(url.startsWith('https://api.github.com/'), url);
      assert.ok(!url.includes(TOKEN));
      assert.equal(opts.headers.Authorization, `Bearer ${TOKEN}`);
    }
    const masked = maskToken(TOKEN);
    assert.equal(masked, 'github_pat_…XYZ9');
    assert.ok(!masked.includes(TOKEN.slice(11, -4)));
  });

  test('nombres de repositorio', () => {
    assert.equal(parseRepo('https://github.com/jhsbb24/frances-datos.git').full, 'jhsbb24/frances-datos');
    assert.equal(parseRepo('jhsbb24/frances-datos').full, 'jhsbb24/frances-datos');
    assert.equal(parseRepo('no vale'), null);
  });
});

// ── Motor de sincronización ───────────────────────────────────

function memoryStorage() {
  const store = {
    saved: null,
    backupsList: [],
    load: () => (store.saved ? clone(store.saved) : null),
    save: (state) => ((store.saved = clone(state)), true),
    backup: (reason, data) => store.backupsList.unshift({ reason, data: clone(data) }),
  };
  return store;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(check, ms = 3000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await check()) return;
    await sleep(10);
  }
  throw new Error('Tiempo agotado esperando la condición');
}

function device(fake, name, storage = memoryStorage()) {
  const engine = new SyncEngine({
    api: apiFor(fake),
    storage,
    deviceName: () => name,
    timing: { saveDelay: 10, minGap: 0, retry: 40, timeout: 2000 },
  });
  engine.storage = storage;
  return engine;
}

const settled = (engine) => waitFor(async () => {
  await engine.queue;
  return !engine.state.dirty && !engine.pushing;
});

function addSession(engine, text) {
  const s = newSession({ minutes: 30, objectiveId: '', ref: { book: 'B1', unit: '3' } }, '2026-10-28T18:00:00.000Z');
  engine.update('Sesión del 28 oct: empezar (30 min)', (d) => d.sessions.push(s));
  engine.update('Sesión del 28 oct: borrador', (d) => (d.sessions.find((x) => x.id === s.id).draft = text));
  return s.id;
}

describe('Guardar y cargar', () => {
  test('la primera vez crea data.json; los cambios se suben y otro dispositivo los carga', async () => {
    const fake = createFakeGitHub();
    const iphone = device(fake, 'iPhone');
    await iphone.syncNow();
    assert.ok(fake.file, 'debe crear data.json');
    assert.match(fake.commits[0].message, /Crear data\.json/);

    const id = addSession(iphone, 'J’aimerais réserver une table pour deux.');
    await settled(iphone);
    assert.equal(fake.json().sessions[0].draft, 'J’aimerais réserver une table pour deux.');
    const last = fake.commits.at(-1).message;
    assert.equal(last, 'Sesión del 28 oct: empezar (30 min); Sesión del 28 oct: borrador (iPhone)');
    assert.equal(iphone.statusInfo().kind, 'saved');
    assert.match(iphone.statusInfo().text, /^Guardado en GitHub · \d\d:\d\d$/);

    const ipad = device(fake, 'iPad');
    await ipad.syncNow();
    assert.equal(ipad.data.sessions.find((s) => s.id === id).draft, 'J’aimerais réserver une table pour deux.');
    assert.equal(fake.puts, 2, 'cargar no debe crear commits');
    iphone.stop();
    ipad.stop();
  });

  test('el borrador local sobrevive a cerrar la app (se recarga del navegador)', async () => {
    const fake = createFakeGitHub();
    const storage = memoryStorage();
    const a = device(fake, 'Mac', storage);
    await a.syncNow();
    addSession(a, 'texte non sauvegardé');
    a.persistNow();
    a.stop();
    const again = device(fake, 'Mac', storage);
    assert.equal(again.data.sessions[0].draft, 'texte non sauvegardé');
    assert.equal(again.state.dirty, true);
    await again.syncNow();
    await settled(again);
    assert.equal(fake.json().sessions[0].draft, 'texte non sauvegardé');
    again.stop();
  });
});

describe('Conflicto: el sha cambió en otro dispositivo', () => {
  async function twoDevices() {
    const fake = createFakeGitHub();
    const iphone = device(fake, 'iPhone');
    await iphone.syncNow();
    const sessionId = addSession(iphone, 'versión inicial');
    await settled(iphone);
    const ipad = device(fake, 'iPad');
    await ipad.syncNow();
    return { fake, iphone, ipad, sessionId };
  }

  test('no sobrescribe, avisa del conflicto y no pierde texto', async () => {
    const { fake, iphone, ipad, sessionId } = await twoDevices();
    // El iPad añade una referencia y guarda.
    ipad.update('Biblioteca: nueva referencia', (d) => d.references.push(newReference({ book: 'B2', unit: '5', page: '88' })));
    await settled(ipad);
    const remoteBefore = fake.file.text;
    const putsBefore = fake.puts;

    // El iPhone (que no se enteró) escribe y guarda.
    iphone.update('Sesión del 28 oct: primer intento', (d) => (d.sessions.find((s) => s.id === sessionId).attempt1 = 'Je voudrais commander, s’il vous plaît.'));
    await waitFor(() => iphone.conflict);
    assert.equal(iphone.statusInfo().kind, 'conflict');
    assert.equal(iphone.statusInfo().text, 'Conflicto');
    assert.equal(fake.file.text, remoteBefore, 'GitHub no debe cambiar');
    assert.equal(fake.puts, putsBefore);
    // El texto sigue en memoria y en el almacenamiento del navegador.
    assert.equal(iphone.data.sessions[0].attempt1, 'Je voudrais commander, s’il vous plaît.');
    assert.equal(iphone.storage.saved.data.sessions[0].attempt1, 'Je voudrais commander, s’il vous plaît.');
    // Mientras hay conflicto, no se sube nada aunque sigas escribiendo.
    iphone.update('Sesión del 28 oct: segundo intento', (d) => (d.sessions[0].attempt2 = 'Encore un essai'));
    await sleep(80);
    assert.equal(fake.puts, putsBefore);

    // «Ver ambas»: cada lado tiene su cambio y la propuesta los conserva.
    const items = compareVersions(iphone.data, iphone.conflict.remoteData, iphone.state.base);
    const kinds = Object.fromEntries(items.map((it) => [it.collection, it.kind]));
    assert.deepEqual(kinds, { sessions: 'cambiado-aqui', references: 'nuevo-nube' });
    const merged = mergeVersions(iphone.data, iphone.conflict.remoteData, items);
    await iphone.resolveMerge(merged);
    await settled(iphone);
    const remote = fake.json();
    assert.equal(remote.sessions[0].attempt1, 'Je voudrais commander, s’il vous plaît.');
    assert.equal(remote.sessions[0].attempt2, 'Encore un essai');
    assert.equal(remote.references.length, 1);
    assert.match(fake.commits.at(-1).message, /Combinar las dos versiones/);
    assert.equal(iphone.conflict, null);
    iphone.stop();
    ipad.stop();
  });

  test('si los dos cambiaron campos distintos de la misma sesión, «Ver ambas» propone juntarlos', async () => {
    const { fake, iphone, ipad } = await twoDevices();
    ipad.update('x', (d) => (d.sessions[0].attempt2 = 'segundo intento (iPad)'));
    await settled(ipad);
    iphone.update('y', (d) => (d.sessions[0].draft = 'borrador (iPhone)'));
    await waitFor(() => iphone.conflict);
    const items = compareVersions(iphone.data, iphone.conflict.remoteData, iphone.state.base);
    assert.equal(items.length, 1);
    assert.equal(items[0].kind, 'cambiado-ambos');
    assert.equal(items[0].choice, 'merge');
    await iphone.resolveMerge(mergeVersions(iphone.data, iphone.conflict.remoteData, items));
    await settled(iphone);
    assert.equal(fake.json().sessions[0].draft, 'borrador (iPhone)');
    assert.equal(fake.json().sessions[0].attempt2, 'segundo intento (iPad)');
    // Si cambiaron el MISMO campo, hay que elegir (propone el más reciente).
    ipad.update('x', (d) => (d.sessions[0].draft = 'otra vez iPad'));
    await waitFor(() => ipad.conflict);
    await ipad.resolveUseCloud();
    ipad.update('x2', (d) => (d.sessions[0].draft = 'iPad de nuevo'));
    await settled(ipad);
    iphone.update('y2', (d) => (d.sessions[0].draft = 'iPhone de nuevo'));
    await waitFor(() => iphone.conflict);
    const again = compareVersions(iphone.data, iphone.conflict.remoteData, iphone.state.base);
    assert.equal(again[0].merged, undefined);
    assert.equal(again[0].choice, 'mine');
    iphone.stop();
    ipad.stop();
  });

  test('«Usar la versión de la nube» guarda antes una copia de la tuya', async () => {
    const { fake, iphone, ipad } = await twoDevices();
    ipad.update('x', (d) => (d.sessions[0].draft = 'desde el iPad'));
    await settled(ipad);
    iphone.update('y', (d) => (d.sessions[0].draft = 'desde el iPhone'));
    await waitFor(() => iphone.conflict);
    const puts = fake.puts;
    iphone.resolveUseCloud();
    assert.equal(iphone.data.sessions[0].draft, 'desde el iPad');
    assert.equal(iphone.storage.backupsList[0].data.sessions[0].draft, 'desde el iPhone');
    assert.equal(iphone.state.dirty, false);
    assert.equal(fake.puts, puts, 'usar la nube no sube nada');
    iphone.stop();
    ipad.stop();
  });

  test('«Mantener la mía» sube tu versión y la de la nube queda en el historial', async () => {
    const { fake, iphone, ipad } = await twoDevices();
    ipad.update('x', (d) => (d.sessions[0].draft = 'desde el iPad'));
    await settled(ipad);
    iphone.update('y', (d) => (d.sessions[0].draft = 'desde el iPhone'));
    await waitFor(() => iphone.conflict);
    await iphone.resolveKeepMine();
    await settled(iphone);
    assert.equal(fake.json().sessions[0].draft, 'desde el iPhone');
    assert.ok(fake.commits.some((c) => JSON.parse(c.text).sessions[0]?.draft === 'desde el iPad'), 'la versión del iPad sigue en el historial');
    iphone.stop();
    ipad.stop();
  });
});

describe('Sin conexión', () => {
  test('queda «Pendiente (sin conexión)» y al reconectar se sube UNA sola vez', async () => {
    const fake = createFakeGitHub();
    const mac = device(fake, 'Mac');
    await mac.syncNow();
    const putsBefore = fake.puts;

    fake.offline = true;
    const id = addSession(mac, 'Hors ligne 1');
    await sleep(60);
    mac.update('Sesión del 28 oct: borrador', (d) => (d.sessions.find((s) => s.id === id).draft = 'Hors ligne 1, 2'));
    await sleep(60);
    mac.update('Sesión del 28 oct: borrador', (d) => (d.sessions.find((s) => s.id === id).draft = 'Hors ligne 1, 2, 3'));
    await sleep(120); // pasan varios reintentos automáticos
    assert.equal(mac.statusInfo().text, 'Pendiente (sin conexión)');
    assert.equal(fake.puts, putsBefore, 'sin conexión no se sube nada');
    assert.equal(mac.storage.saved.data.sessions[0].draft, 'Hors ligne 1, 2, 3');

    // Vuelve la conexión y se disparan varias cosas a la vez.
    fake.offline = false;
    mac.syncNow(); // evento «online»
    mac.syncNow(); // volver a la app
    mac.push(); // temporizador de guardado
    mac.flush(); // cambiar de pantalla
    await settled(mac);
    await sleep(150); // dejar que salten los reintentos pendientes
    await mac.queue;
    assert.equal(fake.puts, putsBefore + 1, 'debe subir exactamente una vez');
    assert.equal(fake.json().sessions.length, 1, 'sin duplicar sesiones');
    assert.equal(fake.json().sessions[0].draft, 'Hors ligne 1, 2, 3');
    assert.equal(mac.statusInfo().kind, 'saved');
    mac.stop();
  });

  test('si GitHub guardó pero la respuesta se perdió, no se duplica ni hay conflicto falso', async () => {
    const fake = createFakeGitHub();
    const mac = device(fake, 'Mac');
    await mac.syncNow();
    fake.loseNextPutResponse = true;
    addSession(mac, 'respuesta perdida');
    await waitFor(() => mac.offline);
    assert.equal(mac.state.dirty, true);
    const puts = fake.puts;
    await mac.syncNow();
    await settled(mac);
    assert.equal(fake.puts, puts, 'no vuelve a subir lo mismo');
    assert.equal(mac.conflict, null);
    assert.equal(mac.state.baseSha, fake.file.sha);
    mac.stop();
  });

  test('respuesta perdida y más cambios después: sin conflicto falso', async () => {
    const fake = createFakeGitHub();
    const mac = device(fake, 'Mac');
    await mac.syncNow();
    fake.loseNextPutResponse = true;
    const id = addSession(mac, 'primera parte');
    await waitFor(() => mac.offline);
    mac.update('Sesión: borrador', (d) => (d.sessions.find((s) => s.id === id).draft = 'primera parte + segunda'));
    await mac.syncNow();
    await settled(mac);
    assert.equal(mac.conflict, null);
    assert.equal(fake.json().sessions[0].draft, 'primera parte + segunda');
    const contents = fake.commits.map((c) => c.text);
    assert.equal(new Set(contents).size, contents.length, 'ningún commit repetido');
    mac.stop();
  });

  test('si GitHub muestra un instante la versión anterior, no se pisan los datos', async () => {
    const fake = createFakeGitHub();
    const mac = device(fake, 'Mac');
    await mac.syncNow();
    addSession(mac, 'última versión');
    await settled(mac);
    fake.serveStaleOnce = true;
    await mac.syncNow();
    assert.equal(mac.data.sessions[0].draft, 'última versión');
    assert.equal(mac.conflict, null);
    mac.stop();
  });
});

describe('Datos e importación', () => {
  test('normalizar rechaza archivos que no son de la app', () => {
    assert.throws(() => normalizeData({ hola: 1 }), /formato/);
    assert.throws(() => normalizeData([]), /formato/);
    assert.throws(() => normalizeData({ app: 'mi-frances', version: 99 }), /versión más nueva/);
  });

  test('normalizar limpia valores raros y enlaces peligrosos', () => {
    const d = normalizeData({ app: 'mi-frances', references: [{ id: 'r1', book: 'B9', audioUrl: 'javascript:alert(1)' }], cards: [{ id: 'c1', kind: 'otro', due: 'mañana' }, { id: 'c1' }], sessions: [{ nope: true }] });
    assert.equal(d.references[0].book, 'B1');
    assert.equal(d.references[0].audioUrl, '');
    assert.equal(d.cards.length, 1, 'ids duplicados fuera');
    assert.equal(d.cards[0].kind, 'expresion');
    assert.equal(d.sessions.length, 0);
  });

  test('exportar e importar conserva todo', () => {
    const d = emptyData();
    d.sessions.push(newSession({ minutes: 15, objectiveId: '', ref: {} }));
    d.cards.push(newCard({ kind: 'error', prompt: 'au le', answer: 'au' }, '2026-10-28'));
    const roundTrip = normalizeData(JSON.parse(JSON.stringify(d)));
    assert.deepEqual(roundTrip, d);
  });

  test('mensaje del commit resume los cambios', () => {
    assert.equal(buildCommitMessage([{ text: 'a' }, { text: 'b' }, { text: 'a' }], 'iPad'), 'a; b (iPad)');
    assert.equal(buildCommitMessage([{ text: '1' }, { text: '2' }, { text: '3' }, { text: '4' }, { text: '5' }], ''), '1; 2; 3 y 2 cambios más');
  });
});
