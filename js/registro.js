// ─────────────────────────────────────────────────────────────
// Consigna para ChatGPT y lectura del REGISTRO.
// La consigna se arma con una plantilla que puedes editar en
// Ajustes. Las palabras entre llaves, como {objetivo}, se
// reemplazan por lo que escribes en la pantalla Conversación.
// ─────────────────────────────────────────────────────────────
import { SKILLS, STATUSES, PRACTICE_MODES, skillLabel } from './config.js';

export const PLACEHOLDERS = [
  ['{fecha}', 'fecha de la conversación'],
  ['{objetivo}', 'objetivo elegido'],
  ['{criterio}', '«cómo sabré que lo logré» del objetivo'],
  ['{habilidad}', 'habilidad del objetivo'],
  ['{modo}', 'tipo de práctica según la habilidad'],
  ['{rol}', 'papel de ChatGPT'],
  ['{dificultad}', 'dificultad'],
  ['{referencia}', 'referencia de Édito'],
  ['{expresion1}', 'primera expresión'],
  ['{expresion2}', 'segunda expresión'],
  ['{errores}', 'errores a repasar'],
  ['{estados}', 'significado de los cinco estados'],
];

export const DEFAULT_TEMPLATE = `Hola. Vamos a practicar francés por voz. Durante la práctica háblame SOLO en francés; lo que te pida al final, en español.

Fecha: {fecha}
Objetivo: {objetivo}
Cómo sabré que lo logré: {criterio}
Habilidad: {habilidad}
Tipo de práctica: {modo}
Tu papel: {rol}
Dificultad: {dificultad}
Material (Édito): {referencia}
Dos expresiones que quiero usar (crea situaciones para que las use):
- {expresion1}
- {expresion2}
Errores que quiero repasar (fíjate si los repito): {errores}

Cómo trabajamos:
1. No leas esta consigna en voz alta. Empieza tú, en tu papel, con una pregunta corta.
2. Adapta tu francés a la dificultad indicada. Turnos cortos: una o dos frases, y espera mi respuesta.
3. No me corrijas en cada frase: toma nota de mis errores.
4. Si me bloqueo, dame primero una pista pequeña (una palabra o el inicio de la frase). Anota cada ayuda que me des.
5. Cuando yo diga «on termine» (o tras unos 10 minutos), dime en español lo más importante que debo mejorar (una sola prioridad) y pídeme un segundo intento de la parte más difícil.
6. Cuando te pida «REGISTRO», escríbelo en texto (no solo por voz), en español, con exactamente el formato de abajo.

Para «Estado sugerido» usa uno solo de estos estados:
{estados}

REGISTRO
Fecha y sesión: {fecha}
Material y objetivo:
Habilidad:
Evidencia: (frases que dije, copiadas tal cual)
Apoyos durante el intento:
Logro:
Prioridad:
Segundo intento:
Estado sugerido:
Expresiones para recuperar: (una por línea, así: expresión en francés = significado en español)
Siguiente práctica:

No me asignes un nivel del MCER.`;

/** Consigna para pedir a ChatGPT que corrija el primer intento de una sesión. */
export const CORRECTION_TEMPLATE = `Hola. Estudio francés con el libro Édito. Corrige mi texto, pero NO lo reescribas entero: quiero hacer yo el segundo intento.

Objetivo: {objetivo}
Cómo sabré que lo logré: {criterio}
Habilidad: {habilidad}
Material (Édito): {referencia}

Mi primer intento:
"""
{texto}
"""

Responde en español, breve, con este formato:
1. Lo que está bien (una o dos cosas).
2. Prioridad: el aspecto que más mejoraría mi texto (uno solo).
3. Errores: uno por línea, así: lo que escribí → forma correcta (explicación muy corta)
4. Una pista para mi segundo intento, sin darme el texto corregido.`;

/** Los cinco estados con su significado, uno por línea. */
export const statusDefinitions = () => STATUSES.map((st) => `- ${st.label}: ${st.help}`).join('\n');

/** Valores de la plantilla que salen del objetivo. */
export function objectiveValues(obj) {
  return {
    objetivo: obj?.title?.trim() || '(sin especificar)',
    criterio: obj?.description?.trim() || '(sin especificar)',
    habilidad: obj ? skillLabel(obj.skill) : 'Interacción oral',
    modo: PRACTICE_MODES[obj?.skill] || PRACTICE_MODES.oral,
  };
}

/** Reemplaza {marcadores} por sus valores. Los desconocidos se quedan igual. */
export function buildPrompt(template, values) {
  return String(template || DEFAULT_TEMPLATE).replace(/\{([a-z0-9]+)\}/gi, (match, name) =>
    Object.prototype.hasOwnProperty.call(values, name.toLowerCase()) ? values[name.toLowerCase()] : match,
  );
}

export const REGISTRO_FIELDS = [
  { key: 'fecha', label: 'Fecha y sesión' },
  { key: 'material', label: 'Material y objetivo' },
  { key: 'habilidad', label: 'Habilidad' },
  { key: 'evidencia', label: 'Evidencia' },
  { key: 'apoyos', label: 'Apoyos durante el intento' },
  { key: 'logro', label: 'Logro' },
  { key: 'prioridad', label: 'Prioridad' },
  { key: 'segundo', label: 'Segundo intento' },
  { key: 'estado', label: 'Estado sugerido' },
  { key: 'expresiones', label: 'Expresiones para recuperar' },
  { key: 'siguiente', label: 'Siguiente práctica' },
];

/** Minúsculas y sin acentos, para comparar textos. */
export const plain = (text) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const LABELS = REGISTRO_FIELDS.map((f) => ({ ...f, norm: plain(f.label) }));

/** Quita adornos típicos de ChatGPT: viñetas, negritas, almohadillas. */
function cleanLine(line) {
  return line
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/^\s*(?:#{1,6}\s*|>\s*|[-*•·]\s+|\d+[.)]\s+)/, '')
    .trim();
}

/**
 * Lee el texto pegado y devuelve los campos del REGISTRO que encuentre.
 * No cambia nada: solo sirve para proponerte acciones que tú confirmas.
 */
export function parseRegistro(text) {
  const fields = {};
  let current = null;
  for (const rawLine of String(text || '').normalize('NFC').replace(/\r\n?/g, '\n').split('\n')) {
    const line = cleanLine(rawLine);
    const normLine = plain(line);
    const label = LABELS.find((l) => normLine.startsWith(l.norm) && /^\s*[:：]/.test(line.slice(l.label.length)));
    if (label) {
      current = label.key;
      fields[current] = line.slice(label.label.length).replace(/^\s*[:：]\s*/, '');
    } else if (current && line && normLine !== 'registro') {
      fields[current] = fields[current] ? `${fields[current]}\n${line}` : line;
    } else if (current && !line && fields[current]) {
      fields[current] += '\n';
    }
  }
  for (const key of Object.keys(fields)) fields[key] = fields[key].trim();
  return {
    found: Object.keys(fields).length >= 2,
    fields,
    status: fields.estado ? matchStatus(fields.estado) : null,
    skill: fields.habilidad ? matchSkill(fields.habilidad) : null,
    expressions: fields.expresiones ? splitExpressions(fields.expresiones) : [],
  };
}

const STATUS_PATTERNS = [
  ['transferido', /transferid/],
  ['autonomo', /autonom/],
  ['apoyo', /con apoyo/],
  ['practica', /practica/],
  ['pendiente', /pendiente|observar/],
];

/** El estado que se nombra PRIMERO en el texto («En práctica; aún no autónomo» → En práctica). */
export function matchStatus(text) {
  const n = plain(text);
  let best = null;
  for (const [id, re] of STATUS_PATTERNS) {
    const m = re.exec(n);
    if (m && (!best || m.index < best.index)) best = { id, index: m.index };
  }
  return best ? best.id : null;
}

export function matchSkill(text) {
  const n = plain(text);
  if (/oral|interaccion|conversacion|hablar/.test(n)) return 'oral';
  if (/escritura|escribir/.test(n)) return 'escritura';
  if (/escucha|comprension oral|audio/.test(n)) return 'escucha';
  if (/lectura|leer/.test(n)) return 'lectura';
  return SKILLS.find((s) => n.includes(plain(s.label)))?.id || null;
}

const stripQuotes = (s) => s.replace(/^["'«“‘*_\s]+|["'»”’*_\s]+$/g, '').trim();

/**
 * Correcciones de ChatGPT: «lo que escribí → forma correcta (explicación)».
 * Devuelve tarjetas de error: { prompt: lo que escribí, answer: forma correcta, note }.
 * Las líneas sin flecha se ignoran.
 */
export function splitCorrections(text) {
  return String(text || '')
    .normalize('NFC')
    .split(/\n/)
    .map(cleanLine)
    .map((line) => line.match(/^(.+?)\s*(?:→|->|⟶|=>)\s*(.+)$/))
    .filter(Boolean)
    .map(([, wrong, right]) => {
      const explained = right.match(/^(.*?)\s*\(([^()]*)\)\s*\.?$/);
      return {
        prompt: stripQuotes(wrong.replace(/^(?:errores?|error)\s*:\s*/i, '')),
        answer: stripQuotes(explained ? explained[1] : right),
        note: explained ? explained[2].trim() : '',
      };
    })
    .filter((c) => c.prompt && c.answer);
}

/** "s'en sortir = arreglárselas" → { answer: "s'en sortir", prompt: "arreglárselas" } */
export function splitExpressions(text) {
  return String(text || '')
    .split(/\n|;|•/)
    .map(cleanLine)
    .filter((line) => line && !/^\(.*\)$/.test(line))
    .map((line) => {
      const m = line.match(/^(.+?)\s*(?:=|→|->|\s:\s|\s[—–-]\s)\s*(.+)$/);
      return m ? { answer: stripQuotes(m[1]), prompt: stripQuotes(m[2]) } : { answer: stripQuotes(line), prompt: '' };
    })
    .filter((e) => e.answer);
}
