import { h, htmlToText } from '../utils.js';

// Saved HTML has already been cleaned by the server (HtmlSanitizer), and
// unsaved HTML is the user's own typing, so it is safe to set as innerHTML.

const VARIANTS = {
  heading: { width: 360, height: 48, html: '<h2 style="font-size: 28px">Heading</h2>' },
  paragraph: { width: 360, height: 72, html: '<p>Paragraph text. Double-click to edit it.</p>' },
  block: { width: 360, height: 96, html: '<h3 style="font-size: 20px">Heading</h3><p>Write something here.</p>' },
};

export const text = {
  label: 'Text',

  name: (el) => htmlToText(el.content.html).slice(0, 40) || 'Empty text',

  defaults(variant = 'block') {
    const { width, height, html } = VARIANTS[variant] ?? VARIANTS.block;
    return { width, height, content: { html } };
  },

  create(el) {
    const body = h('div', { class: 'element-body text-body' });
    body.innerHTML = el.content.html;
    return body;
  },

  update(body, el) {
    // While the user is typing, the DOM is the source of truth.
    if (body.isContentEditable) return;
    if (body.innerHTML !== el.content.html) body.innerHTML = el.content.html;
  },
};
