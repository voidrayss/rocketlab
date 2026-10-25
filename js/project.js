// Versioned project interchange; pure ES module, no browser or server required.
import { createNose, createBody, createTransition, createFins, MATERIALS, NOSE_SHAPES } from './rocket.js';
import { MOTOR_CATALOG } from './motors.js';
const factories = { nose: createNose, body: createBody, transition: createTransition, fins: createFins };
const dimensions = {
  nose: ['length', 'diameter', 'wallThickness'],
  body: ['length', 'diameter', 'wallThickness'],
  transition: ['length', 'frontDiameter', 'rearDiameter', 'wallThickness'],
  fins: ['rootChord', 'tipChord', 'span', 'thickness'],
};
export function parseProject(text) {
  if (typeof text !== 'string' || text.length > 1000000) throw new Error('Project must be a JSON file smaller than 1 MB.');
  const data = JSON.parse(text);
  if (!data || data.format !== 'rocketlab' || data.version !== 1) throw new Error('Unsupported RocketLab project format or version.');
  const r = data.rocket;
  if (!r || typeof r.name !== 'string' || !r.name.trim() || r.name.length > 200) throw new Error('Project needs a name of 1–200 characters.');
  if (typeof r.motorId !== 'string' || !Object.hasOwn(MOTOR_CATALOG, r.motorId)) throw new Error('Project motor is unavailable. Wait for the motor catalog to load and try again.');
  if (!Array.isArray(r.components) || r.components.length < 1 || r.components.length > 100) throw new Error('Project needs 1–100 components.');
  const validated = r.components.map(c => {
    if (!c || !Object.hasOwn(factories, c.type)) throw new Error('Unsupported component type.');
    if (!Object.hasOwn(MATERIALS, c.material)) throw new Error('Unsupported component material.');
    const params = { material: c.material };
    for (const key of dimensions[c.type]) {
      if (!Number.isFinite(c[key]) || c[key] <= 0 || c[key] > 100) throw new Error(`${c.type}: ${key} must be positive and at most 100 m.`);
      params[key] = c[key];
    }
    if (c.type === 'nose') {
      if (![...NOSE_SHAPES, 'cone', 'blunt'].includes(c.shape)) throw new Error('Unsupported nose shape.');
      params.shape = c.shape;
    }
    if (c.type === 'fins') {
      if (!Number.isInteger(c.count) || c.count < 1 || c.count > 32) throw new Error('Fin count must be an integer from 1 to 32.');
      if (!Number.isFinite(c.sweep) || Math.abs(c.sweep) > 100) throw new Error('Invalid fin sweep.');
      Object.assign(params, { count: c.count, sweep: c.sweep });
    } else {
      const diameter = c.type === 'transition' ? Math.min(c.frontDiameter, c.rearDiameter) : c.diameter;
      if (c.wallThickness * 2 >= diameter) throw new Error('Wall thickness must leave a hollow interior.');
      if (c.type === 'transition' && c.frontDiameter === c.rearDiameter) throw new Error('Use a body tube for an equal-diameter transition.');
    }
    return { type: c.type, params };
  });
  // Allocate IDs only after the complete file has passed validation.
  return { name: r.name, motorId: r.motorId, components: validated.map(c => factories[c.type](c.params)) };
}
export function serializeProject(rocket) {
  const text = JSON.stringify({ format: 'rocketlab', version: 1, rocket }, null, 2);
  parseProject(text); // Never offer a download that cannot be reopened.
  return text;
}
