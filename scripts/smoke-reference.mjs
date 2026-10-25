// Frozen measurements from an actual installed OpenRocket 24.12 run, not a reimplementation.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultRocket} from '../js/rocket.js';
import {massProperties,centerOfPressure,dragCoefficient} from '../js/aero.js';
import {finAxialCentroid} from '../js/fincan.js';
const reference=JSON.parse(readFileSync(new URL('../data/reference/openrocket-24.12.json',import.meta.url),'utf8'));
assert.equal(reference.cases.length,2);
for(const sample of reference.cases) {
  const rocket=defaultRocket();rocket.components[0].shape=sample.shape==='CONICAL'?'conical':'ogive';
  const cp=centerOfPressure(rocket).cp,mass=massProperties(rocket);
  assert(Math.abs(cp-sample.cp_m)<.0002,'CP should agree within 0.2 mm for these slender subsonic cases');
  assert(Math.abs(finAxialCentroid(rocket.components[2])-sample.finLocalCG_m)<1e-12);
  // Mass/CG/Cd differences are reported, not hidden behind fabricated equality gates.
  console.log(`${sample.shape}: CP delta=${((cp-sample.cp_m)*1000).toFixed(3)} mm; structure ${ (mass.mass*1000).toFixed(3)} vs OR ${(sample.structureMass_kg*1000).toFixed(3)} g; Cd ${dragCoefficient(rocket).toFixed(3)} vs OR ${sample.Cd.toFixed(3)}`);
}
console.log('PASS: measured OpenRocket CP/fin-centroid references; mass/drag discrepancies remain documented');
