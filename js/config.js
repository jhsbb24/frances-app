// ─────────────────────────────────────────────────────────────
// Configuración general de «Mi francés».
// Aquí están los valores fijos de la app. Si algún día quieres
// cambiar algo básico (por ejemplo, la zona horaria), es aquí.
// ─────────────────────────────────────────────────────────────

export const APP_VERSION = '1.0.0';

// Repositorio PRIVADO donde se guardan tus datos (se puede cambiar en Ajustes).
export const DEFAULT_REPO = 'jhsbb24/frances-datos';
export const DATA_PATH = 'data.json';
export const API_BASE = 'https://api.github.com';

// Zona horaria con la que se calculan los días de repaso.
export const TIME_ZONE = 'America/Vancouver';

// Intervalos de repaso, en días.
export const REVIEW_INTERVALS = [1, 3, 7, 14];

// Tiempos del guardado automático (en milisegundos).
// Las pruebas automáticas pueden acortarlos con window.__MI_FRANCES_PRUEBAS__.
const testing = globalThis.__MI_FRANCES_PRUEBAS__ || {};
export const TIMING = {
  saveDelay: testing.saveDelay ?? 3000, // espera después de dejar de escribir
  minGap: testing.minGap ?? 10000, // tiempo mínimo entre dos guardados en GitHub
  retry: testing.retry ?? 30000, // reintento cuando no hay conexión
  timeout: testing.timeout ?? 20000, // tiempo máximo de espera a GitHub
};

export const SKILLS = [
  { id: 'lectura', label: 'Lectura' },
  { id: 'escucha', label: 'Escucha' },
  { id: 'escritura', label: 'Escritura' },
  { id: 'oral', label: 'Interacción oral' },
];

export const STATUSES = [
  { id: 'pendiente', label: 'Pendiente de observar' },
  { id: 'practica', label: 'En práctica' },
  { id: 'apoyo', label: 'Logrado con apoyo' },
  { id: 'autonomo', label: 'Logrado de forma autónoma' },
  { id: 'transferido', label: 'Transferido' },
];

export const DURATIONS = [15, 30, 40];
export const BOOKS = ['B1', 'B2'];

export const DIFFICULTIES = [
  { id: 'facil', label: 'Fácil', text: 'fácil: habla despacio, con frases cortas y vocabulario de la unidad' },
  { id: 'media', label: 'Media', text: 'media: ritmo natural pero claro, alguna pregunta abierta' },
  { id: 'retadora', label: 'Retadora', text: 'retadora: ritmo natural, preguntas abiertas y algún imprevisto' },
];

export const ROLE_SUGGESTIONS = [
  'un ami francophone qui veut savoir comment je vais',
  'un vendeur au marché',
  'un collègue de travail',
  'un réceptionniste d’hôtel',
  'un examinateur du DELF (entretien)',
  'un voisin qui organise une fête',
];

export const skillLabel = (id) => SKILLS.find((s) => s.id === id)?.label || 'Sin habilidad';
export const statusLabel = (id) => STATUSES.find((s) => s.id === id)?.label || 'Sin estado';
export const difficultyOf = (id) => DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[0];
