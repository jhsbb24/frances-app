// ─────────────────────────────────────────────────────────────
// Consigna para ChatGPT y lectura del REGISTRO.
// La consigna se arma con una plantilla que puedes editar en
// Ajustes. Las palabras entre llaves, como {objetivo}, se
// reemplazan por lo que escribes en la pantalla Conversación.
// ─────────────────────────────────────────────────────────────
import { SKILLS } from './config.js';

export const PLACEHOLDERS = [
  ['{fecha}', 'fecha de la conversación'],
  ['{objetivo}', 'objetivo elegido'],
  ['{habilidad}', 'habilidad del objetivo'],
  ['{rol}', 'papel de ChatGPT'],
  ['{dificultad}', 'dificultad'],
  ['{referencia}', 'referencia de Édito'],
  ['{expresion1}', 'primera expresión'],
  ['{expresion2}', 'segunda expresión'],
  ['{errores}', 'errores a repasar'],
];

export const DEFAULT_TEMPLATE = `Hola. Vamos a practicar francés por voz. Durante la práctica, háblame SOLO en francés.

Fecha: {fecha}
Objetivo: {objetivo}
Habilidad: {habilidad}
Tu papel: {rol}
Dificultad: {dificultad}
Material (Édito): {referencia}
Dos expresiones que quiero usar:
- {expresion1}
- {expresion2}
Errores que quiero repasar: {errores}

Cómo trabajamos:
1. Empieza tú, en tu papel, con una pregunta corta.
2. Adapta tu francés a la dificultad indicada y espera siempre mi respuesta.
3. No me corrijas en cada frase: toma nota de mis errores.
4. Si me bloqueo, dame primero una pista pequeña. Anota cada ayuda que me des.
5. Cuando yo diga «on termine» (o tras unos 10 minutos), dime en español lo más importante que debo mejorar (una sola prioridad) y pídeme un segundo intento de la parte más difícil.
6. Después del segundo intento, escribe en texto y en español el REGISTRO, con exactamente este formato:

REGISTRO
Fecha y sesión: {fecha}
Material y objetivo:
Habilidad:
Evidencia: (frases que dije, copiadas tal cual)
Apoyos durante el intento:
Logro:
Prioridad:
Segundo intento:
Estado sugerido: (uno solo de estos: Pendiente de observar / En práctica / Logrado con apoyo / Logrado de forma autónoma / Transferido)
Expresiones para recuperar: (una por línea, así: expresión en francés = significado en español)
Siguiente práctica:

No me asignes un nivel del MCER.`;

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

export function matchStatus(text) {
  const n = plain(text);
  if (/transferid/.test(n)) return 'transferido';
  if (/autonom/.test(n)) return 'autonomo';
  if (/con apoyo/.test(n)) return 'apoyo';
  if (/practica/.test(n)) return 'practica';
  if (/pendiente|observar/.test(n)) return 'pendiente';
  return null;
}

export function matchSkill(text) {
  const n = plain(text);
  if (/oral|interaccion|conversacion|hablar/.test(n)) return 'oral';
  if (/escritura|escribir/.test(n)) return 'escritura';
  if (/escucha|comprension oral|audio/.test(n)) return 'escucha';
  if (/lectura|leer/.test(n)) return 'lectura';
  return SKILLS.find((s) => n.includes(plain(s.label)))?.id || null;
}

const stripQuotes = (s) => s.replace(/^["'«“‘\s]+|["'»”’\s]+$/g, '').trim();

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
