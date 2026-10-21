/**
 * Element types. Each module provides:
 *   label            name shown in the editor
 *   defaults(variant) size and content for a new element
 *   create(el)       returns the element's body node
 *   update(body, el, prev)  called when the element's content changed
 *   destroy?(body)   cleanup (timers, chart instances)
 */

import { chart } from './chart.js';
import { image } from './image.js';
import { text } from './text.js';

export const registry = { text, image, chart };
