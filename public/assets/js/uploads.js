/**
 * Image uploads: the file picker, dropping image files onto the canvas, and
 * double-clicking an image to replace it.
 */

import { api } from './api.js';
import { registry } from './elements/index.js';
import { sectionAt } from './interactions.js';
import { findItem } from './store.js';
import { clamp, h, toast, uuid } from './utils.js';

const TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

export function createUploads({ viewport, store, canvas }) {
  const picker = h('input', { type: 'file', accept: TYPES.join(','), hidden: true });
  document.body.append(picker);
  let pickFor = null;

  picker.addEventListener('change', () => {
    const file = picker.files[0];
    picker.value = '';
    if (file && pickFor) replace(pickFor, file);
  });

  function pick(id) {
    pickFor = id;
    picker.click();
  }

  async function upload(file) {
    if (!TYPES.includes(file.type)) throw new Error('Only PNG, JPEG, GIF and WebP images can be uploaded.');
    if (file.size > MAX_BYTES) throw new Error('Images must be 5 MB or smaller.');
    return api.uploadImage(file);
  }

  /** Uploads a file into an existing image element. */
  async function replace(id, file) {
    canvas.nodeFor(id)?.classList.add('is-uploading');
    try {
      const result = await upload(file);
      const found = findItem(store.getState().dashboard, id);
      if (!found) return;
      const changes = { content: { src: result.url, alt: found.item.content.alt || altFromName(file.name) } };
      // A first image takes its own shape rather than the placeholder's.
      if (!found.item.content.src) changes.height = Math.round((found.item.width * result.height) / result.width);
      store.dispatch({ type: 'item/update', id, changes });
    } catch (error) {
      toast(error.message, { error: true });
    } finally {
      canvas.nodeFor(id)?.classList.remove('is-uploading');
    }
  }

  /** Uploads a file and places it as a new image element centred on a canvas point. */
  async function addAt(file, point) {
    const d = store.getState().dashboard;
    const section = sectionAt(d, point) ?? d.sections[d.sections.length - 1];
    if (!section) {
      toast('Add a section first, then drop the image into it.', { error: true });
      return;
    }
    toast('Uploading image…');
    try {
      const result = await upload(file);
      const current = findItem(store.getState().dashboard, section.id)?.item;
      if (!current) return;
      const width = Math.min(320, result.width, current.width - 32);
      const height = Math.round((width * result.height) / result.width);
      const element = {
        id: uuid(),
        type: 'image',
        x: clamp(Math.round(point.x - current.x - width / 2), 0, current.width - width),
        y: Math.max(0, Math.round(point.y - current.y - height / 2)),
        width,
        height,
        zIndex: 1,
        content: { ...registry.image.defaults().content, src: result.url, alt: altFromName(file.name) },
      };
      store.dispatch({ type: 'element/add', sectionId: section.id, element, select: { kind: 'element', id: element.id } });
    } catch (error) {
      toast(error.message, { error: true });
    }
  }

  // ---- Drag and drop files ------------------------------------------------------

  const hasFiles = (event) => event.dataTransfer?.types.includes('Files');
  let highlighted = null;
  const highlight = (node) => {
    if (highlighted === node) return;
    highlighted?.classList.remove('is-drop-target');
    node?.classList.add('is-drop-target');
    highlighted = node;
  };

  viewport.addEventListener('dragover', (event) => {
    if (!hasFiles(event) || store.getState().mode !== 'edit') return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    highlight(event.target.closest('.element-image, .section'));
  });
  viewport.addEventListener('dragleave', (event) => {
    if (!viewport.contains(event.relatedTarget)) highlight(null);
  });
  viewport.addEventListener('drop', (event) => {
    if (!hasFiles(event) || store.getState().mode !== 'edit') return;
    event.preventDefault();
    highlight(null);
    const file = [...event.dataTransfer.files].find((f) => f.type.startsWith('image/'));
    if (!file) {
      toast('Drop an image file (PNG, JPEG, GIF or WebP).', { error: true });
      return;
    }
    const imageNode = event.target.closest('.element-image');
    if (imageNode) replace(imageNode.dataset.id, file);
    else addAt(file, canvas.toCanvasPoint({ x: event.clientX, y: event.clientY }));
  });

  // ---- Shortcuts on the canvas ----------------------------------------------------

  viewport.addEventListener('dblclick', (event) => {
    const node = event.target.closest('.element-image');
    if (node && store.getState().mode === 'edit') pick(node.dataset.id);
  });
  viewport.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="upload"]');
    if (button && store.getState().mode === 'edit') pick(button.closest('.element').dataset.id);
  });

  return { pick };
}

function altFromName(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, 200);
}
