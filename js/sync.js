// ─────────────────────────────────────────────────────────────
// Motor de guardado y sincronización.
//
// · Cada cambio se guarda al instante en este navegador (borrador).
// · Unos segundos después de dejar de escribir (o al cambiar de
//   pantalla) se sube data.json a GitHub como un commit.
// · Se usa el «sha» del archivo: si GitHub dice que cambió en otro
//   dispositivo, NO se sobrescribe; se avisa con un conflicto.
// · Sin conexión, los cambios quedan «Pendientes» y se suben una
//   sola vez cuando vuelve la conexión.
// ─────────────────────────────────────────────────────────────
import { TIMING } from './config.js';
import { formatTime } from './dates.js';
import { emptyData, normalizeData, clone } from './model.js';
import { sameContent } from './diff.js';

/** Texto que se guarda en GitHub: legible y con un salto de línea final. */
export const serialize = (data) => `${JSON.stringify(data, null, 2)}\n`;

/** Mensaje de commit a partir de los cambios acumulados. */
export function buildCommitMessage(messages, device) {
  const unique = [...new Set(messages.map((m) => m.text).filter(Boolean))];
  let summary;
  if (unique.length === 0) summary = 'Guardar cambios';
  else if (unique.length <= 3) summary = unique.join('; ');
  else summary = `${unique.slice(0, 3).join('; ')} y ${unique.length - 3} cambios más`;
  return device ? `${summary} (${device})` : summary;
}

function safeNormalize(raw) {
  try {
    return normalizeData(raw);
  } catch {
    return null;
  }
}

export class SyncEngine {
  /**
   * api:      cliente de github.js (o uno falso en las pruebas)
   * storage:  { load(), save(state), backup(reason, data) }
   * isOnline: () => boolean
   */
  constructor({ api, storage, isOnline = () => true, now = () => new Date(), deviceName = () => '', timing = TIMING }) {
    Object.assign(this, { api, storage, isOnline, now, deviceName, timing });
    this.listeners = new Set();
    this.queue = Promise.resolve();
    this.timers = { save: null, retry: null, persist: null };
    this.pushing = false;
    this.pulling = false;
    this.offline = false;
    this.error = null;
    this.conflict = null;
    this.lastPushStart = 0;
    this.attempts = []; // últimos textos que intentamos subir (por si se pierde una respuesta)
    this.state = this.loadState();
  }

  loadState() {
    const saved = this.storage.load();
    const data = saved && safeNormalize(saved.data);
    if (!data) {
      return { data: emptyData(), base: null, baseSha: null, dirty: false, rev: 0, messages: [], lastSavedAt: null, staleShas: [] };
    }
    const dirty = Boolean(saved.dirty);
    return {
      data,
      // Si no había cambios pendientes, la base es igual a los datos.
      base: dirty ? (saved.base && safeNormalize(saved.base)) || null : clone(data),
      baseSha: saved.baseSha || null,
      dirty,
      rev: Number(saved.rev) || 0,
      messages: Array.isArray(saved.messages) ? saved.messages : [],
      lastSavedAt: saved.lastSavedAt || null,
      staleShas: Array.isArray(saved.staleShas) ? saved.staleShas : [],
    };
  }

  get data() {
    return this.state.data;
  }

  // ── Avisos a la interfaz ────────────────────────────────────

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(type) {
    for (const listener of this.listeners) listener(type, this);
  }

  /** Lo que muestra el indicador de arriba. */
  statusInfo() {
    const s = this.state;
    if (this.conflict) return { kind: 'conflict', text: 'Conflicto', detail: 'Esto cambió en otro dispositivo. Toca para decidir.' };
    if (this.pushing) return { kind: 'saving', text: 'Guardando…' };
    if (this.error) return { kind: 'error', text: 'Error', detail: this.error.message };
    if (!this.api.isConfigured()) {
      return { kind: 'pending', text: 'Pendiente (falta el token)', detail: 'Tus datos están solo en este navegador. Pon tu token en Ajustes.' };
    }
    if (s.dirty && (this.offline || !this.isOnline())) {
      return { kind: 'pending', text: 'Pendiente (sin conexión)', detail: 'Tus cambios están guardados en este dispositivo y se subirán al volver la conexión.' };
    }
    if (s.dirty) return { kind: 'saving', text: 'Guardando…' };
    if (!s.lastSavedAt && (this.offline || !this.isOnline())) {
      return { kind: 'pending', text: 'Pendiente (sin conexión)', detail: 'No se pudo descargar data.json. Se intentará al volver la conexión.' };
    }
    if (s.lastSavedAt) {
      const offline = this.offline || !this.isOnline();
      return {
        kind: 'saved',
        text: `Guardado en GitHub · ${formatTime(s.lastSavedAt)}`,
        detail: offline ? 'Sin conexión ahora mismo. No hay nada pendiente.' : 'Todo está guardado en GitHub.',
      };
    }
    return { kind: 'saving', text: 'Cargando…' };
  }

  // ── Cambios locales ─────────────────────────────────────────

  /**
   * Única forma de cambiar los datos. `message` describe el cambio
   * (aparece en el mensaje del commit). `mutate(data)` hace el cambio.
   */
  update(message, mutate) {
    const s = this.state;
    mutate(s.data);
    s.data.meta = { updatedAt: this.now().toISOString(), device: this.deviceName() };
    s.rev += 1;
    s.dirty = true;
    if (message) {
      const last = s.messages[s.messages.length - 1];
      if (last && last.text === message) last.rev = s.rev;
      else s.messages.push({ rev: s.rev, text: message });
      if (s.messages.length > 100) s.messages = s.messages.slice(-100);
    }
    this.persistSoon();
    this.schedulePush();
    this.emit('status');
  }

  /** Reemplaza todo (importar un archivo). Guarda antes una copia. */
  replaceAll(newData, message) {
    this.storage.backup?.('Antes de importar un archivo', this.state.data);
    this.update(message, (d) => {
      for (const key of Object.keys(d)) delete d[key];
      Object.assign(d, clone(newData));
    });
    this.flush();
  }

  // ── Guardar en el navegador ─────────────────────────────────

  persistSoon() {
    clearTimeout(this.timers.persist);
    this.timers.persist = setTimeout(() => this.persistNow(), 300);
  }

  persistNow() {
    clearTimeout(this.timers.persist);
    this.timers.persist = null;
    const s = this.state;
    const ok = this.storage.save({
      v: 1,
      data: s.data,
      base: s.dirty ? s.base : null, // sin cambios pendientes, base = datos
      baseSha: s.baseSha,
      dirty: s.dirty,
      rev: s.rev,
      messages: s.messages,
      lastSavedAt: s.lastSavedAt,
      staleShas: s.staleShas,
    });
    if (!ok && !this.storageWarned) {
      this.storageWarned = true;
      this.emit('storage-error');
    }
  }

  // ── Programar subidas ───────────────────────────────────────

  schedulePush(delay = this.timing.saveDelay) {
    clearTimeout(this.timers.save);
    if (this.stopped) return;
    const sinceLast = Date.now() - this.lastPushStart;
    const wait = Math.max(delay, this.timing.minGap - sinceLast);
    this.timers.save = setTimeout(() => this.push(), wait);
  }

  /** Al cambiar de pantalla o salir de la app: guardar ya. */
  flush() {
    this.persistNow();
    if (this.state.dirty && !this.conflict) {
      clearTimeout(this.timers.save);
      this.push();
    }
  }

  scheduleRetry(ms = this.timing.retry) {
    if (this.timers.retry || this.stopped) return;
    this.timers.retry = setTimeout(() => {
      this.timers.retry = null;
      this.syncNow();
    }, ms);
  }

  /** Detiene los temporizadores (solo lo usan las pruebas). */
  stop() {
    this.stopped = true;
    for (const timer of Object.values(this.timers)) clearTimeout(timer);
  }

  /** Las operaciones con GitHub van de una en una, nunca a la vez. */
  enqueue(task) {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => {});
    return run;
  }

  /** Descargar data.json (y subir lo pendiente si hace falta). */
  syncNow() {
    return this.enqueue(() => this.pull());
  }

  /** Subir los cambios pendientes, si los hay. */
  push() {
    return this.enqueue(async () => {
      if (this.state.dirty && !this.conflict) await this.upload();
    });
  }

  markOffline() {
    this.offline = true;
    this.emit('status');
  }

  /** Tras cambiar el token o el repositorio. */
  reconnect() {
    this.error = null;
    this.offline = false;
    this.emit('status');
    return this.syncNow();
  }

  canReachGitHub() {
    if (!this.api.isConfigured()) return false;
    if (!this.isOnline()) {
      this.offline = true;
      if (this.state.dirty) this.scheduleRetry();
      return false;
    }
    return true;
  }

  handleError(err) {
    if (err.kind === 'network') {
      this.offline = true;
      this.scheduleRetry();
    } else if (err.kind === 'ratelimit' || err.kind === 'server') {
      this.error = { kind: err.kind, message: err.message };
      this.scheduleRetry(err.retryAfterMs || this.timing.retry);
    } else {
      // Token, permisos o repositorio: no se reintenta solo.
      this.error = { kind: err.kind || 'other', message: err.message || 'Error desconocido.' };
    }
    this.persistNow();
    this.emit('status');
  }

  // ── Descargar ───────────────────────────────────────────────

  async pull() {
    if (!this.canReachGitHub()) {
      this.emit('status');
      return;
    }
    this.pulling = true;
    this.emit('status');
    let remote;
    try {
      remote = await this.api.readFile();
    } catch (err) {
      this.pulling = false;
      this.handleError(err);
      return;
    }
    this.pulling = false;
    this.offline = false;
    this.error = null;
    await this.reconcile(remote);
    this.emit('status');
  }

  /** Decide qué hacer con lo que hay en GitHub. */
  async reconcile(remote) {
    const s = this.state;
    if (remote === null) {
      // data.json no existe todavía (o se borró): crearlo con lo que hay aquí.
      this.conflict = null;
      s.baseSha = null;
      s.dirty = true;
      s.messages.unshift({ rev: s.rev, text: 'Crear data.json' });
      await this.upload();
      return;
    }
    if (this.conflict) {
      if (remote.sha !== this.conflict.remoteSha) await this.refreshConflict(remote);
      return;
    }
    if (remote.sha === s.baseSha || s.staleShas.includes(remote.sha)) {
      // Nadie más guardó (o GitHub aún enseña una versión anterior a la nuestra).
      if (s.dirty) await this.upload();
      else this.markSynced();
      return;
    }
    if (this.ownUploadLanded(remote)) {
      if (s.dirty) await this.upload();
      return;
    }
    let remoteData;
    try {
      remoteData = normalizeData(JSON.parse(remote.text));
    } catch {
      this.error = { kind: 'other', message: 'El data.json de GitHub no se puede leer. Revisa su historial en GitHub o importa una copia.' };
      return;
    }
    if (!s.dirty) {
      this.adopt(remoteData, remote.sha);
      this.emit('data');
      return;
    }
    if (sameContent(remoteData, s.data)) {
      // Mismo contenido en los dos lados: no hay conflicto real.
      this.adopt(s.data, remote.sha);
      return;
    }
    this.enterConflict(remoteData, remote.sha);
  }

  /** Si la respuesta de una subida se perdió, GitHub tiene nuestro propio texto. */
  ownUploadLanded(remote) {
    const attempt = this.attempts.find((a) => a.text === remote.text);
    if (!attempt) return false;
    const s = this.state;
    if (s.baseSha) s.staleShas = [...s.staleShas, s.baseSha].slice(-30);
    s.baseSha = remote.sha;
    s.base = JSON.parse(attempt.text);
    s.messages = s.messages.filter((m) => m.rev > attempt.rev);
    if (s.rev === attempt.rev) s.dirty = false;
    s.lastSavedAt = this.now().toISOString();
    this.attempts = [];
    this.persistNow();
    return true;
  }

  markSynced() {
    this.state.lastSavedAt = this.now().toISOString();
    this.persistNow();
  }

  adopt(data, sha) {
    const s = this.state;
    if (s.baseSha && s.baseSha !== sha) s.staleShas = [...s.staleShas, s.baseSha].slice(-30);
    s.data = data;
    s.base = clone(data);
    s.baseSha = sha;
    s.dirty = false;
    s.messages = [];
    s.lastSavedAt = this.now().toISOString();
    this.persistNow();
  }

  // ── Subir ───────────────────────────────────────────────────

  async upload() {
    const s = this.state;
    if (!this.canReachGitHub()) {
      this.emit('status');
      return;
    }
    clearTimeout(this.timers.save);
    const rev = s.rev;
    const text = serialize(s.data);
    const message = buildCommitMessage(
      s.messages.filter((m) => m.rev <= rev),
      this.deviceName(),
    );
    this.pushing = true;
    this.lastPushStart = Date.now();
    this.attempts = [...this.attempts, { text, rev }].slice(-5);
    this.emit('status');
    let result;
    try {
      result = await this.api.writeFile(text, s.baseSha, message);
    } catch (err) {
      this.pushing = false;
      if (err.kind === 'conflict') await this.afterRejectedUpload();
      else this.handleError(err);
      return;
    }
    this.pushing = false;
    this.attempts = [];
    if (s.baseSha) s.staleShas = [...s.staleShas, s.baseSha].slice(-30);
    s.baseSha = result.sha;
    s.base = JSON.parse(text);
    s.lastSavedAt = this.now().toISOString();
    s.messages = s.messages.filter((m) => m.rev > rev);
    if (s.rev === rev) s.dirty = false;
    else this.schedulePush(); // hubo más cambios mientras se subía
    this.offline = false;
    this.error = null;
    this.persistNow();
    this.emit('status');
  }

  /** GitHub rechazó el guardado porque el sha ya no coincide. */
  async afterRejectedUpload() {
    let remote;
    try {
      remote = await this.api.readFile();
    } catch (err) {
      this.handleError(err);
      return;
    }
    const s = this.state;
    if (remote === null) {
      this.error = { kind: 'other', message: 'GitHub rechazó el guardado. Se reintentará.' };
      s.baseSha = null;
      this.scheduleRetry();
      this.emit('status');
      return;
    }
    if (this.ownUploadLanded(remote)) {
      if (s.dirty) this.schedulePush();
      this.emit('status');
      return;
    }
    if (remote.sha === s.baseSha) {
      // GitHub todavía no muestra el cambio que lo rechazó: probar más tarde.
      this.error = { kind: 'server', message: 'GitHub rechazó el guardado. Se reintentará en unos segundos.' };
      this.scheduleRetry();
      this.emit('status');
      return;
    }
    this.offline = false;
    this.error = null;
    await this.reconcile(remote);
    this.emit('status');
  }

  // ── Conflictos ──────────────────────────────────────────────

  enterConflict(remoteData, remoteSha) {
    clearTimeout(this.timers.save);
    this.conflict = { remoteData, remoteSha, at: this.now().toISOString() };
    this.persistNow();
    this.emit('status');
    this.emit('conflict');
  }

  async refreshConflict(remote) {
    try {
      this.conflict = { remoteData: normalizeData(JSON.parse(remote.text)), remoteSha: remote.sha, at: this.now().toISOString() };
      this.emit('conflict');
    } catch {
      /* se queda el conflicto anterior */
    }
  }

  /** «Usar la versión de la nube» (guarda antes una copia de la tuya). */
  resolveUseCloud() {
    const c = this.conflict;
    if (!c) return;
    this.storage.backup?.('Antes de usar la versión de la nube', this.state.data);
    this.conflict = null;
    this.adopt(c.remoteData, c.remoteSha);
    this.emit('data');
    this.emit('status');
  }

  /** «Mantener la mía»: sube tu versión. La de la nube queda en el historial. */
  resolveKeepMine() {
    return this.resolveWith(this.state.data, 'Mantener la versión de este dispositivo (conflicto resuelto)');
  }

  /** «Ver ambas» → guardar la combinación elegida. */
  resolveMerge(merged) {
    this.storage.backup?.('Antes de combinar las dos versiones', this.state.data);
    return this.resolveWith(merged, 'Combinar las dos versiones (conflicto resuelto)');
  }

  resolveWith(data, message) {
    const c = this.conflict;
    if (!c) return Promise.resolve();
    const s = this.state;
    s.data = data;
    s.base = clone(c.remoteData);
    s.baseSha = c.remoteSha;
    s.dirty = true;
    s.rev += 1;
    s.messages.push({ rev: s.rev, text: message });
    this.conflict = null;
    this.persistNow();
    this.emit('data');
    this.emit('status');
    return this.push();
  }
}
