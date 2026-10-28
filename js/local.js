// ─────────────────────────────────────────────────────────────
// Almacenamiento en ESTE navegador (localStorage).
// Aquí viven: el token, el nombre del dispositivo, el borrador de
// tus datos (para trabajar sin conexión) y hasta 2 copias de
// seguridad. Nada de esto se envía a ningún sitio salvo GitHub.
// ─────────────────────────────────────────────────────────────
const PREFIX = 'miFrances.';

export const local = {
  get(key) {
    try {
      return localStorage.getItem(PREFIX + key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* nada que hacer */
    }
  },
  getJSON(key) {
    const raw = this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  setJSON(key, value) {
    return this.set(key, JSON.stringify(value));
  },
};

/** Lo que usa el motor de sincronización para guardar su estado. */
export const browserStorage = {
  load: () => local.getJSON('estado'),
  save(state) {
    if (local.setJSON('estado', state)) return true;
    // Si no cabe, se sacrifican primero las copias de seguridad.
    local.remove('copias');
    return local.setJSON('estado', state);
  },
  backup(reason, data) {
    const list = [{ at: new Date().toISOString(), reason, data }, ...(local.getJSON('copias') || [])].slice(0, 2);
    if (!local.setJSON('copias', list)) local.setJSON('copias', list.slice(0, 1));
  },
  backups: () => local.getJSON('copias') || [],
};

/** Espacio aproximado que usa la app en este navegador, en KB. */
export function usedKB() {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(PREFIX)) total += key.length + (localStorage.getItem(key) || '').length;
    }
  } catch {
    return 0;
  }
  return Math.round((total * 2) / 1024);
}

export function detectDevice() {
  const ua = navigator.userAgent || '';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Macintosh/.test(ua)) return 'Mac';
  return 'navegador';
}

export const deviceName = () => (local.get('dispositivo') || '').trim() || detectDevice();
