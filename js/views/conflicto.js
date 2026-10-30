// Ventana «Esto cambió en otro dispositivo».
// Aparece cuando GitHub rechaza un guardado porque data.json cambió
// desde otro dispositivo. Nada se sobrescribe hasta que eliges:
//  · Usar la versión de la nube
//  · Mantener la mía
//  · Ver ambas (comparar y elegir elemento por elemento)
import { REVIEW_INTERVALS, skillLabel, statusLabel, difficultyOf } from '../config.js';
import { h, openDialog, toast } from '../dom.js';
import { formatDateTime, formatShort } from '../dates.js';
import { refText } from '../model.js';
import { compareVersions, mergeVersions, KIND_TEXT, COLLECTIONS, stable } from '../diff.js';
import { CARD_KINDS, short } from '../components.js';

const FIELD_LABELS = {
  objectives: { title: 'Objetivo', skill: 'Habilidad', status: 'Estado', description: 'Cómo sabré que lo logré', history: 'Historial de estados' },
  sessions: { minutes: 'Duración (min)', objectiveId: 'Objetivo', ref: 'Referencia', draft: 'Borrador', attempt1: 'Primer intento', feedback: 'Correcciones', attempt2: 'Segundo intento', closing: 'Cierre', closedAt: 'Cerrada', timer: 'Cronómetro' },
  conversations: { objectiveId: 'Objetivo', role: 'Rol', difficulty: 'Dificultad', ref: 'Referencia', expr1: 'Expresión 1', expr2: 'Expresión 2', errors: 'Errores a repasar', prompt: 'Consigna', registro: 'REGISTRO', actions: 'Acciones confirmadas' },
  references: { book: 'Libro', edition: 'Edición', unit: 'Unidad', page: 'Página', audioUrl: 'Audio', notes: 'Notas' },
  cards: { kind: 'Tipo', prompt: 'Pista', answer: 'Respuesta', note: 'Nota', due: 'Próximo repaso', step: 'Intervalo', archived: 'Archivada', reviews: 'Repasos' },
  settings: { promptTemplate: 'Plantilla de la consigna' },
};
const IGNORED = new Set(['id', 'createdAt', 'updatedAt', 'repeatToday', 'promptEdited', 'registroAt', 'sessionId', 'source']);

let current = null; // ventana abierta, para no abrir dos

export function openConflictDialog(ctx) {
  const conflict = ctx.sync.conflict;
  if (!conflict) return;
  if (current) current.close('reabrir');
  const remoteMeta = conflict.remoteData.meta || {};
  const lookup = { objectives: [...ctx.sync.data.objectives, ...conflict.remoteData.objectives] };
  const objectiveName = (id) => lookup.objectives.find((o) => o.id === id)?.title || '(objetivo eliminado)';

  const done = (text) => {
    toast(text);
    dlg.close('resuelto');
  };

  const bigChoice = (title, text, onClick, cls = '') =>
    h('button', { type: 'button', class: `choice ${cls}`.trim(), on: { click: onClick } }, h('strong', { text: title }), h('span', { text }));

  const summaryView = () => {
    dlg.setTitle('Esto cambió en otro dispositivo');
    dlg.setContent(
      h('p', { text: `Mientras tenías cambios sin subir en este dispositivo, se guardó otra versión en GitHub${remoteMeta.device ? ` desde «${remoteMeta.device}»` : ''}${remoteMeta.updatedAt ? ` (${formatDateTime(remoteMeta.updatedAt)})` : ''}.` }),
      h('p', { text: 'No se ha perdido nada: tus cambios siguen aquí. Elige qué hacer:' }),
      h('div', { class: 'choice-list' },
        bigChoice('Usar la versión de la nube', 'Reemplaza lo de este dispositivo. Antes guardo una copia de lo tuyo en Ajustes → Copias de seguridad.', () => {
          ctx.sync.resolveUseCloud();
          done('Usando la versión de la nube');
        }),
        bigChoice('Mantener la mía', 'Sube la versión de este dispositivo. La de la nube queda en el historial de GitHub.', () => {
          ctx.sync.resolveKeepMine();
          done('Guardando tu versión');
        }),
        bigChoice('Ver ambas', 'Compara las dos versiones y elige qué conservar de cada una.', compareView, 'primary'),
      ),
    );
    dlg.setActions([]);
  };

  const valueText = (key, value) => {
    if (value === null || value === undefined || value === '') return '(vacío)';
    if (key === 'objectiveId') return objectiveName(value);
    if (key === 'ref') return refText(value) || '(sin referencia)';
    if (key === 'closing') return `Logro: ${value.achievement || '—'}\nDificultad: ${value.difficulty || '—'}\nSiguiente paso: ${value.nextStep || '—'}`;
    if (key === 'closedAt') return formatDateTime(value);
    if (key === 'timer') return `${Math.round((value.elapsedMs || 0) / 60000)} min usados${value.runningSince ? ' (en marcha)' : ''}`;
    if (key === 'skill') return skillLabel(value);
    if (key === 'status') return statusLabel(value);
    if (key === 'difficulty') return difficultyOf(value).label;
    if (key === 'kind') return CARD_KINDS[value]?.label || String(value);
    if (key === 'step') return `${REVIEW_INTERVALS[value] ?? '?'} días`;
    if (key === 'history') return value.map((e) => `${formatShort(e.at)}: ${statusLabel(e.to)} — ${e.reason}`).join('\n') || '(vacío)';
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? 'elemento' : 'elementos'}`;
    if (typeof value === 'object') return JSON.stringify(value, null, 1);
    return String(value);
  };

  const itemTitle = (it) => {
    const x = it.mine || it.cloud;
    switch (it.collection) {
      case 'objectives':
        return x.title || 'Objetivo sin título';
      case 'sessions':
        return `Sesión del ${formatShort(x.createdAt)}${x.objectiveId ? ` · ${objectiveName(x.objectiveId)}` : ''}`;
      case 'conversations':
        return `Conversación del ${formatShort(x.createdAt)}`;
      case 'references':
        return refText(x) || 'Referencia';
      case 'cards':
        return `Tarjeta: ${short(x.answer, 50)}`;
      default:
        return 'Plantilla y ajustes';
    }
  };

  const fieldKeys = (it) => {
    const labels = FIELD_LABELS[it.collection] || {};
    const keys = [...new Set([...Object.keys(it.mine || {}), ...Object.keys(it.cloud || {})])].filter((k) => !IGNORED.has(k));
    const differing = it.mine && it.cloud ? keys.filter((k) => stable(it.mine[k]) !== stable(it.cloud[k])) : keys.filter((k) => labels[k]);
    return differing.map((k) => ({ key: k, label: labels[k] || k }));
  };

  const column = (title, item, keys) =>
    h('div', { class: 'diff-col' },
      h('p', { class: 'diff-col-title', text: title }),
      item
        ? h('dl', { class: 'fields' }, keys.map(({ key, label }) => [h('dt', { text: label }), h('dd', { class: 'pre diff-value', text: valueText(key, item[key]) })]))
        : h('p', { class: 'hint', text: '(no existe)' }),
    );

  const compareView = () => {
    const items = compareVersions(ctx.sync.data, conflict.remoteData, ctx.sync.state.base);
    const choices = {};
    dlg.setTitle('Ver ambas versiones');
    if (!items.length) {
      dlg.setContent(h('p', { text: 'Las dos versiones tienen el mismo contenido. Puedes mantener la tuya sin perder nada.' }));
      dlg.setActions([
        { label: 'Volver', class: 'secondary', onClick: () => (summaryView(), false) },
        { label: 'Mantener la mía', class: 'primary', onClick: () => (ctx.sync.resolveKeepMine(), toast('Guardando tu versión')) },
      ]);
      return;
    }
    const groups = [...COLLECTIONS, { key: 'settings', label: 'Ajustes' }]
      .map(({ key, label }) => ({ label, items: items.filter((it) => it.collection === key) }))
      .filter((g) => g.items.length);
    const nodes = [
      h('p', { text: `Hay ${items.length} ${items.length === 1 ? 'diferencia' : 'diferencias'}. Para cada una, elige con qué versión te quedas (ya propongo una). Luego pulsa «Guardar esta combinación».` }),
    ];
    for (const g of groups) {
      nodes.push(h('h3', { text: g.label }));
      for (const it of g.items) {
        const keys = fieldKeys(it);
        const name = `eleccion-${it.key.replace(/[^a-z0-9]/gi, '-')}`;
        const radio = (value, text) => {
          const input = h('input', { type: 'radio', name, value, checked: it.choice === value });
          input.addEventListener('change', () => (choices[it.key] = value));
          return h('label', { class: 'radio' }, input, h('span', { text }));
        };
        nodes.push(
          h('article', { class: 'diff-item' },
            h('p', { class: 'item-title', text: itemTitle(it) }),
            h('p', { class: 'item-meta', text: KIND_TEXT[it.kind] }),
            h('div', { class: 'diff-cols' }, column('Este dispositivo', it.mine, keys), column('Nube', it.cloud, keys)),
            it.merged ? h('p', { class: 'hint', text: 'Cada dispositivo cambió una parte distinta: se pueden juntar los dos cambios.' }) : null,
            h('div', { class: `radio-list${it.merged ? '' : ' inline'}`, role: 'radiogroup', 'aria-label': `Quedarme con (${itemTitle(it)})` },
              it.merged ? radio('merge', 'Juntar los cambios de los dos (recomendado)') : null,
              radio('mine', it.mine ? 'Quedarme con la de este dispositivo' : 'Sin esto (como en este dispositivo)'),
              radio('cloud', it.cloud ? 'Quedarme con la de la nube' : 'Sin esto (como en la nube)'),
            ),
          ),
        );
      }
    }
    dlg.setContent(...nodes);
    dlg.setActions([
      { label: 'Volver', class: 'secondary', onClick: () => (summaryView(), false) },
      {
        label: 'Guardar esta combinación',
        class: 'primary',
        onClick: () => {
          const merged = mergeVersions(ctx.sync.data, conflict.remoteData, items, choices);
          ctx.sync.resolveMerge(merged);
          toast('Guardando la combinación');
        },
      },
    ]);
  };

  const dlg = openDialog({
    title: 'Esto cambió en otro dispositivo',
    wide: true,
    keep: true,
    closeLabel: 'Decidir después',
    onClose: (value) => {
      current = null;
      if (value === null && ctx.sync.conflict) toast('Conflicto sin resolver: toca «Conflicto» arriba para decidir.');
    },
  });
  current = dlg;
  summaryView();
}

/** Cierra la ventana si el conflicto ya no existe (p. ej. se resolvió solo). */
export function closeConflictDialogIfResolved(ctx) {
  if (current && !ctx.sync.conflict) current.close('resuelto');
}
