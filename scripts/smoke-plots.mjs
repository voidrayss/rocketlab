import assert from 'node:assert/strict';
import { flightPlot, PLOT_TYPES } from '../js/plots.js';
import { defaultRocket } from '../js/rocket.js';
import { getMotor } from '../js/motors.js';
import { massProperties, dragCoefficient, referenceArea } from '../js/aero.js';
import { simulateFlight } from '../js/physics.js';
const rocket = defaultRocket(), motor = getMotor(rocket.motorId);
const result = simulateFlight({ rocket, motor, dryMass: massProperties(rocket).mass,
 Cd: dragCoefficient(rocket), area: referenceArea(rocket), parachuteArea: 0.1 });
for (const type of Object.keys(PLOT_TYPES)) {
 const plot = flightPlot(result, type);
 assert(plot.points.length > 1);
 assert(plot.max > plot.min);
 assert(plot.points.every(p => p.value >= plot.min && p.value <= plot.max));
 assert(plot.unit && plot.note);
}
assert(flightPlot(result, 'velocity').min < 0);
assert.equal(flightPlot(result, 'stability').points.length, 6);
assert(Math.abs(result.samples[0].accel - (motor.avgThrust / result.samples[0].mass - 9.80665)) < 1e-12);
assert.equal(flightPlot({ samples: [], stats: {} }).points.length, 0);
assert.throws(() => flightPlot(result, 'unknown'));
console.log('PASS: five flight plots, signed ranges, acceleration, and stability samples');
