import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FlightView } from '../js/flight.js';
const source = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');
assert(!/import\s*\{\s*Viewer3D/.test(source), 'CDN viewer must not be a startup dependency');
assert(source.includes('import("./viewer3d.js")'));
let next = 0;
const callbacks = new Map();
globalThis.requestAnimationFrame = callback => { callbacks.set(++next, callback); return next; };
globalThis.cancelAnimationFrame = id => callbacks.delete(id);
const view = Object.create(FlightView.prototype);
Object.assign(view, { result: { samples: Array(20).fill({}) }, frame: 0, playing: false, rafId: null,
  drawFrame() {}, drawPlot() {}, renderSummary() {} });
view.play(); view.play();
assert.equal(callbacks.size, 1, 'repeated Play must not add loops');
view.reset(); assert.equal(callbacks.size, 0);
view.play(); view.load({ samples: Array(10).fill({}) });
assert.equal(callbacks.size, 0, 'loading a flight must cancel old playback');
console.log('PASS: optional viewer dependency and playback lifecycle');
