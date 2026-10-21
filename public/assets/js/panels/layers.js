/** Left "Layers" panel: the dashboard's sections and elements as a tree. */

import { registry } from '../elements/index.js';
import { h, icon } from '../utils.js';

const TYPE_ICONS = { text: 'text', image: 'image', chart: 'bar' };

export function createLayersPanel(root, store, canvas) {
  const list = h('div', { class: 'layers', role: 'tree', 'aria-label': 'Layers' });
  root.append(h('div', { class: 'panel-head' }, h('h2', {}, 'Layers')), list);

  store.subscribe((state, prev) => {
    if (state.dashboard !== prev.dashboard || state.selection !== prev.selection) render(state);
  });

  function render(state) {
    const d = state.dashboard;
    if (!d) {
      list.replaceChildren();
      return;
    }
    const selected = state.selection?.id;
    const row = (item, kind, label, iconName, depth) => h('button', {
      class: `layer${item.id === selected ? ' is-selected' : ''}`,
      type: 'button',
      role: 'treeitem',
      style: { paddingLeft: `${8 + depth * 16}px` },
      onClick: () => {
        store.dispatch({ type: 'select', selection: { kind, id: item.id } });
        canvas.reveal(item.id);
      },
    }, icon(iconName), h('span', { class: 'layer-name' }, label));

    list.replaceChildren(
      ...(d.sections.length ? [] : [h('p', { class: 'add-hint' }, 'Nothing here yet. Add a section from the Add panel.')]),
      ...d.sections.flatMap((section, i) => [
        row(section, 'section', `Section ${i + 1}`, 'section', 0),
        ...section.elements.map((el) => row(el, 'element', registry[el.type].name(el), TYPE_ICONS[el.type], 1)),
      ]),
    );
  }
}
