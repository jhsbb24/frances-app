// Pantalla «Más» (solo en pantallas estrechas, como el iPhone en
// vertical): accesos a las pantallas que no caben en la barra.
import { h, icon } from '../dom.js';

const LINKS = [
  { href: '#/biblioteca', icon: 'libro', label: 'Biblioteca', text: 'Tus referencias de Édito B1 y B2' },
  { href: '#/objetivos', icon: 'objetivo', label: 'Objetivos', text: 'Habilidades, estados e historial' },
  { href: '#/progreso', icon: 'progreso', label: 'Progreso', text: 'Objetivos por estado y evidencias' },
  { href: '#/ajustes', icon: 'ajustes', label: 'Ajustes', text: 'Token de GitHub, exportar e importar' },
];

export function render(main) {
  main.append(
    h('h1', { text: 'Más' }),
    h('div', { class: 'big-links' },
      LINKS.map((l) => h('a', { class: 'big-link', href: l.href }, icon(l.icon, 28), h('span', {}, h('strong', { text: l.label }), h('small', { text: l.text })))),
    ),
  );
}
