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
export const CHATGPT_URL = 'https://chatgpt.com/';

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

// Estados de un objetivo, con su significado (se usan en la app y en la consigna).
export const STATUSES = [
  { id: 'pendiente', label: 'Pendiente de observar', help: 'Todavía no hay evidencia suficiente.' },
  { id: 'practica', label: 'En práctica', help: 'Lo intento, pero con errores frecuentes o mucha ayuda.' },
  { id: 'apoyo', label: 'Logrado con apoyo', help: 'Lo consigo con alguna pista, modelo o ayuda.' },
  { id: 'autonomo', label: 'Logrado de forma autónoma', help: 'Lo consigo sin ayuda en la situación practicada.' },
  { id: 'transferido', label: 'Transferido', help: 'Lo uso sin ayuda en una situación nueva, distinta de la practicada.' },
];

// Qué tipo de práctica pide la consigna según la habilidad del objetivo.
export const PRACTICE_MODES = {
  oral: 'conversación: tú haces tu papel y me das turnos cortos para que yo hable la mayor parte del tiempo',
  escucha: 'escucha: en tu papel, habla tú unos 60–90 segundos sobre el tema y luego hazme 3 preguntas de comprensión; repite o ve más despacio si te lo pido',
  lectura: 'lectura: te resumo o te leo en voz alta un texto que he leído; hazme preguntas sobre el texto y pídeme que explique palabras clave',
  escritura: 'preparar un texto escrito: hablamos para sacar ideas, estructura y vocabulario; al final te dicto mi texto y me ayudas a mejorarlo',
};

export const DURATIONS = [15, 30, 40];

// Plan sugerido de una sesión (minutos de cada fase). Es solo una guía.
export const SESSION_PLAN = {
  15: [['Borrador', 3], ['Primer intento', 5], ['Revisar', 3], ['Segundo intento', 3], ['Cierre', 1]],
  30: [['Borrador', 5], ['Primer intento', 10], ['Revisar', 6], ['Segundo intento', 7], ['Cierre', 2]],
  40: [['Borrador', 7], ['Primer intento', 13], ['Revisar', 8], ['Segundo intento', 9], ['Cierre', 3]],
};
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
export const statusHelp = (id) => STATUSES.find((s) => s.id === id)?.help || '';
export const difficultyOf = (id) => DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[0];
