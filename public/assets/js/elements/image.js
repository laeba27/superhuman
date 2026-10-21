import { h, icon } from '../utils.js';

export const image = {
  label: 'Image',

  name: (el) => el.content.alt || (el.content.src ? 'Image' : 'Empty image'),

  defaults() {
    return { width: 240, height: 160, content: { src: '', fit: 'cover', alt: '' } };
  },

  create(el) {
    const body = h('div', { class: 'element-body image-body' });
    render(body, el.content);
    return body;
  },

  update(body, el) {
    render(body, el.content);
  },
};

function render(body, { src, fit, alt }) {
  if (!src) {
    body.replaceChildren(h('div', { class: 'image-placeholder' },
      icon('image'),
      h('button', { class: 'placeholder-button', type: 'button', dataset: { action: 'upload' } }, 'Upload image'),
      h('span', {}, 'or drop a file here')));
    return;
  }
  let img = body.querySelector('img');
  if (!img) {
    img = h('img', { draggable: false });
    body.replaceChildren(img);
  }
  if (img.getAttribute('src') !== src) img.src = src;
  img.alt = alt;
  img.style.objectFit = fit;
}
