// Pantalla «Ayuda»: cómo sacar partido a la app, en pocas líneas.
import { STATUSES, REVIEW_INTERVALS, TIME_ZONE } from '../config.js';
import { h, section, externalLink } from '../dom.js';

const README = 'https://github.com/jhsbb24/frances-app#readme';

const list = (items, ordered = false) => h(ordered ? 'ol' : 'ul', { class: 'plain-list' }, items.map((t) => h('li', { text: t })));

export function render(main) {
  main.append(
    h('h1', { text: 'Cómo usar «Mi francés»' }),
    h('p', { class: 'subtitle', text: 'Una guía corta. Los pasos para instalarla y crear el token están en el README.' }),

    section(
      'Una rutina sencilla',
      list([
        'Elige un objetivo concreto (por ejemplo, «Reservar una mesa por teléfono») y la página de Édito que vas a usar.',
        'Sesión de 15, 30 o 40 minutos: borrador → primer intento sin mirar → corrección → segundo intento → cierre de tres frases. Debajo del cronómetro tienes un plan sugerido.',
        'Dos o tres veces por semana, una conversación con ChatGPT Voice sobre el mismo objetivo.',
        'Cada día, 5 o 10 minutos de Repaso con tus tarjetas.',
        'Una vez por semana, mira Progreso: si una dificultad se repite, conviértela en tarjetas o en un objetivo.',
      ], true),
    ),

    section(
      'Conversación con ChatGPT Voice',
      list([
        'En Conversación, elige el objetivo, el rol y la dificultad. La consigna se escribe sola (y puedes editarla).',
        'Toca «Copiar consigna» y «Abrir ChatGPT». Pega la consigna, envíala y toca el botón de voz.',
        'Habla en francés. Para terminar, di «on termine». ChatGPT te dará una prioridad y te pedirá un segundo intento.',
        'Al final pide «REGISTRO». Si solo te contesta por voz, sal del modo voz y escribe «Escribe el REGISTRO».',
        'Copia el REGISTRO y pégalo en la app. Se guarda tal cual; después decides si cambias el estado, creas tarjetas o lo pasas al cierre de la sesión.',
      ], true),
    ),

    section(
      'Corregir un texto escrito',
      list([
        'En la sesión, escribe tu primer intento sin mirar nada.',
        'Toca «Copiar consigna de corrección» y pégala en ChatGPT: te señala los errores sin reescribirte el texto.',
        'Pega su respuesta en «Correcciones recibidas». Las líneas «lo que escribí → forma correcta» se convierten en tarjetas con un toque.',
        'Haz el segundo intento y anota el logro en el cierre.',
      ], true),
    ),

    section(
      'Los estados de un objetivo',
      h('dl', { class: 'fields' }, STATUSES.map((s) => [h('dt', { text: s.label }), h('dd', { text: s.help })])),
      h('p', { class: 'hint', text: 'Cambiar de estado siempre pide un motivo, que queda en el historial. La app nunca cambia un estado sola.' }),
    ),

    section(
      'Repaso',
      list([
        `Intervalos: ${REVIEW_INTERVALS.join(', ')} días.`,
        'Sin ayuda: pasa al siguiente intervalo. Con ayuda: vuelve a salir hoy, al final. No lo logré: vuelve mañana y empieza de nuevo.',
        'Puedes escribir la respuesta antes de verla: la app te avisa si coincide o si solo fallan los acentos.',
        'Después de una pausa, «Reprogramar» reparte las atrasadas en varios días.',
        `Los días se cuentan con la hora de ${TIME_ZONE}.`,
      ]),
    ),

    section(
      'El indicador de arriba',
      h('dl', { class: 'fields' },
        h('dt', { text: 'Guardado en GitHub · hora' }), h('dd', { text: 'Todo está en GitHub.' }),
        h('dt', { text: 'Guardando…' }), h('dd', { text: 'Se subirá en unos segundos.' }),
        h('dt', { text: 'Pendiente (sin conexión)' }), h('dd', { text: 'Está guardado en este dispositivo; se sube solo al volver la conexión.' }),
        h('dt', { text: 'Conflicto' }), h('dd', { text: 'Otro dispositivo guardó a la vez. Toca el indicador y elige qué conservar: no se pierde nada.' }),
        h('dt', { text: 'Error' }), h('dd', { text: 'Normalmente, el token caducó. Toca el indicador para ver qué pasa.' }),
      ),
    ),

    section(
      'En la pantalla de inicio',
      list([
        'iPhone y iPad: en Safari, Compartir → Agregar a inicio. Después abre la app desde el icono y pega allí el token (la app del icono guarda sus datos aparte de Safari).',
        'Mac: en Safari, Archivo → Añadir al Dock.',
      ]),
    ),

    section(
      'Tus datos',
      list([
        'Se guardan en tu repositorio privado frances-datos (archivo data.json). Cada guardado es un commit: el historial de GitHub es tu copia de seguridad.',
        'En Ajustes puedes exportar todo a un archivo JSON e importarlo (con un resumen antes de aplicar).',
      ]),
      h('p', {}, externalLink('Abrir el README completo', README, 'link')),
    ),
  );
}
