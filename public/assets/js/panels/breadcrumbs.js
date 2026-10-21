import { registry } from '../elements/index.js';
import { findItem } from '../store.js';
import { h, icon } from '../utils.js';

export function createBreadcrumbs(root, store) {
  store.subscribe((state, prev) => {
    if (state.dashboard !== prev.dashboard || state.selection !== prev.selection || state.mode !== prev.mode) render(state);
  });

  function render(state) {
    const d = state.dashboard;
    if (!d || state.mode !== 'edit') {
      root.replaceChildren();
      return;
    }
    const found = findItem(d, state.selection?.id);
    const crumb = (label, iconName, selection, current) => h('button', {
      class: `crumb${current ? ' is-current' : ''}`,
      type: 'button',
      'aria-current': current ? 'location' : null,
      onClick: () => store.dispatch({ type: 'select', selection }),
    }, icon(iconName), label);

    const crumbs = [crumb(d.name, 'page', null, !found)];
    if (found) {
      const index = d.sections.indexOf(found.section) + 1;
      crumbs.push(crumb(`Section ${index}`, 'section', { kind: 'section', id: found.section.id }, found.kind === 'section'));
      if (found.kind === 'element') {
        const el = found.item;
        crumbs.push(crumb(`${registry[el.type].label}: ${registry[el.type].name(el)}`, el.type === 'chart' ? 'bar' : el.type, state.selection, true));
      }
    }
    root.replaceChildren(...crumbs.flatMap((c, i) => (i ? [h('span', { class: 'crumb-sep', 'aria-hidden': 'true' }, icon('chevronRight')), c] : [c])));
  }
}
