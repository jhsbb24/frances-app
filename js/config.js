// ─────────────────────────────────────────────────────────────
// Configuración general de «Mi francés».
// Aquí están los valores fijos de la app. Si algún día quieres
// cambiar algo básico (por ejemplo, la zona horaria), es aquí.
// ─────────────────────────────────────────────────────────────

export const APP_VERSION = '1.1.0';

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
  minGap: testing.minGap ?? 20000, // tiempo mínimo entre dos guardados en GitHub mientras escribes (al cambiar de pantalla o salir, se guarda ya)
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

// Tipos de tarea de un paso del plan, con el método para trabajarlas.
export const STEP_TYPES = [
  { id: 'escucha', label: 'Escucha', method: '1.ª escucha sin mirar las preguntas: ¿quién habla, dónde y de qué? Lee las preguntas y escucha otra vez para responder. Comprueba con la transcripción del libro y escucha una última vez leyéndola.' },
  { id: 'video', label: 'Vídeo', method: 'Míralo una vez entero sin pausa. Lee las preguntas y míralo otra vez, parando cuando lo necesites.' },
  { id: 'lee', label: 'Lee', method: '1.ª lectura rápida: tipo de texto e idea general. 2.ª lectura para responder. Subraya las palabras nuevas, pero no traduzcas todo.' },
  { id: 'habla', label: 'Habla', method: 'Anota 3 o 4 ideas sueltas en «Borrador» (no frases). Habla en voz alta 1 o 2 minutos sin leer (puedes grabarte con el móvil). Escribe en «Primer intento» tus mejores frases; revisa y vuelve a decirlo («Segundo intento»).' },
  { id: 'escribe', label: 'Escribe', method: 'Escribe el «Primer intento» sin diccionario. Pide la corrección con «Copiar consigna de corrección» y escribe el «Segundo intento». En las tareas tipo DELF, unas 160 palabras.' },
  { id: 'gramatica', label: 'Gramática', method: 'Haz «Échauffement», lee «Fonctionnement» y escribe la regla con tus palabras en «Borrador». Haz «Entraînement». Crea tarjetas con las frases en las que dudaste.' },
  { id: 'vocabulario', label: 'Vocabulario', method: 'Haz los ejercicios. Elige de 5 a 10 palabras útiles para ti y crea tarjetas en «Para repasar».' },
  { id: 'fonetica', label: 'Fonética', method: 'Escucha, repite en voz alta y exagera un poco. Grábate y compara si puedes.' },
  { id: 'cultura', label: 'Cultura', method: 'Léelo con calma: es contexto cultural, no hace falta memorizarlo.' },
  { id: 'extra', label: 'Extra', method: 'Opcional: hazlo si te sobra tiempo o te interesa el tema.' },
  { id: 'repaso', label: 'Repaso', method: 'Hazlo sin mirar las páginas anteriores; después corrige y anota en el cierre lo que aún te cuesta.' },
  { id: 'taller', label: 'Taller', method: 'Está pensado para hacerlo en grupo: hazlo con ChatGPT como compañero o compañera, o por escrito.' },
  { id: 'delf', label: 'DELF', method: 'Hazlo como en el examen: con cronómetro, sin diccionario y sin pausas. Corrígelo después.' },
  { id: 'conversacion', label: 'Conversación', method: 'Toca «Preparar conversación»: la consigna ya trae el rol y las expresiones. Habla con ChatGPT Voice y pega el REGISTRO al terminar.' },
  { id: 'nota', label: 'Nota', method: '' },
];
export const stepType = (id) => STEP_TYPES.find((t) => t.id === id) || STEP_TYPES[STEP_TYPES.length - 1];

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
