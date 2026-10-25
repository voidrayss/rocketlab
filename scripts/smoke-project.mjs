import assert from 'node:assert/strict';
import { defaultRocket, createBody, createTransition, createFins, createNose } from '../js/rocket.js';
import { serializeProject, parseProject } from '../js/project.js';
const original = defaultRocket();
original.components.push(createTransition(), createNose({ shape: 'vonKarman' }));
const text = serializeProject(original);
const loaded = parseProject(text);
const withoutIds = rocket => ({ ...rocket, components: rocket.components.map(({ id, ...c }) => ({...c,...(c.attachment?{attachment:{...c.attachment,parentId:rocket.components.find(p=>p.id===c.attachment.parentId)?.uid}}:{})})) });
assert.deepEqual(withoutIds(loaded), withoutIds(original));
assert.equal(new Set([...original.components, ...loaded.components, createBody(), createFins()].map(c => c.id)).size, 12);
assert.equal(serializeProject(loaded).includes('"version": 3'), true);
for (const mutate of [
  d => d.version = 99,
  d => d.rocket.motorId = 'missing',
  d => d.rocket.components = [],
  d => d.rocket.components[0].length = -1,
  d => d.rocket.components[0].diameter = 0,
  d => d.rocket.components[0].wallThickness = 1,
  d => d.rocket.components[0].shape = 'unknown',
  d => d.rocket.components[0].material = '__proto__',
  d => d.rocket.components[0].type = 'constructor',
  d => d.rocket.components[2].count = 2.5,
  d => d.rocket.components[2].sweep = 'bad',
]) {
  const data = JSON.parse(text); mutate(data);
  assert.throws(() => parseProject(JSON.stringify(data)));
}
assert.throws(() => parseProject('{'));
assert.throws(() => parseProject('x'.repeat(1000001)));
assert.deepEqual(withoutIds(original), withoutIds(parseProject(text)), 'invalid loads must not mutate the original');
console.log('PASS: project round trip, fresh IDs, invalid inputs, and size/version limits');
