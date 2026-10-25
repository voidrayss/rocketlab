// Optional real-kernel checks. Pass downloaded loader/WASM paths; no npm install.
// node scripts/cad-check.mjs <loader.mjs> <kernel.wasm> [<independent.cjs> <independent.wasm>]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { cadJob } from '../js/cad/solid.js';
import { createFinCan, createBody, createRing, createNose, noseConeProfile } from '../js/rocket.js';
import {noseGeometry} from '../js/nose.js';
import { finCanProperties } from '../js/fincan.js';
const [loader,wasm,reader,readerWasm]=process.argv.slice(2);
if(!loader || !wasm) {console.error('Provide the pinned OpenCascade loader (.mjs) and WASM paths. See docs/CAD.md.');process.exit(1);}
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=dirname(resolve(loader));
const {default:init}=await import(pathToFileURL(resolve(loader)).href);
const oc=await init({wasmBinary:readFileSync(wasm),print:()=>{},printErr:()=>{}});
let independent;
if(reader) independent=await (await import(pathToFileURL(resolve(reader)).href)).default({wasmBinary:readFileSync(readerWasm)});
for(const count of [2,3,4,6,12]) {
 const component=createFinCan({count});
 const r=cadJob(oc,{component});const analytic=finCanProperties(component);
 assert(r.properties.valid && r.properties.solids===1);
 assert(Math.abs(r.properties.volumeMm3-analytic.volume*1e9)<analytic.volume*1e9*1e-7);
 assert(Math.abs(r.properties.centroidMm[2]-analytic.centroidX*1000)<1e-7);
 assert.equal(r.properties.boundsMm[1][2],120);
 assert.equal(r.reopened.solids,1);
 const imported=cadJob(oc,{action:'import',bytes:r.step});
 assert(Math.abs(imported.properties.volumeMm3-r.properties.volumeMm3)<.001);
 assert(r.mesh.indices.length>0 && r.mesh.positions.every(Number.isFinite));
 if(independent) {
  const parsed=independent.ReadStepFile(r.step,null);
  assert(parsed.success && parsed.meshes.length===1);
  let volume=0;
  for(const mesh of parsed.meshes) {
   const p=mesh.attributes.position.array,idx=mesh.index.array;
   for(let i=0;i<idx.length;i+=3) {
    const a=idx[i]*3,b=idx[i+1]*3,c=idx[i+2]*3;
    volume+=(p[a]*(p[b+1]*p[c+2]-p[b+2]*p[c+1])+p[a+1]*(p[b+2]*p[c]-p[b]*p[c+2])+p[a+2]*(p[b]*p[c+1]-p[b+1]*p[c]))/6;
   }
  }
  assert(Math.abs(Math.abs(volume)-r.properties.volumeMm3)/r.properties.volumeMm3<.01,'independent tessellated volume must match within 1%');
 }
 console.log(`PASS: ${count}-fin single solid, analytic mass/CG, STEP round trip${independent?', independent parser/volume':''}`);
}
for(const dimensions of [{finOffset:.08,rootChord:.12,tipChord:.08,sweep:.05},{finOffset:-.08,rootChord:.2,tipChord:.12,sweep:-.05}]){
 const c=createFinCan(dimensions),p=finCanProperties(c),r=cadJob(oc,{component:c});
 assert(r.properties.valid&&r.properties.solids===1);
 assert(Math.abs(r.properties.volumeMm3-p.volume*1e9)<.00001);
 assert(Math.abs(r.properties.centroidMm[2]-p.centroidX*1000)<1e-6);
 const start=c.finOffset,expectedMax=Math.max(c.length,start+Math.max(c.rootChord,c.sweep+c.tipChord))*1000;
 assert(Math.abs(r.properties.boundsMm[1][2]-expectedMax)<1e-7);
 if(independent)assert(independent.ReadStepFile(r.step,null).success);
 console.log('PASS: overhanging connected fin solid, actual bounds, exact volume/centroid and STEP reader');
}
for(const shape of ['conical','ogive','vonKarman','haack','parabolic','elliptical']) {
 const nose=createNose({shape,shoulderEnabled:true});const analytic=noseGeometry(nose,noseConeProfile(nose,48));
 const result=cadJob(oc,{component:nose});assert(result.properties.valid&&result.properties.solids===1);
 assert(Math.abs(result.properties.volumeMm3-analytic.volume*1e9)<.00001);
 assert(Math.abs(result.properties.centroidMm[2]-analytic.centroidX*1000)<1e-6);
 assert(Math.abs(result.properties.boundsMm[1][2]-(nose.length+nose.shoulderLength)*1000)<1e-8);
 if(independent)assert(independent.ReadStepFile(result.step,null).success);
 console.log(`PASS: ${shape} joined shoulder/nose, analytic volume/CG, STEP round trip and external reader`);
}
for(const options of [{shoulderEnabled:true,shoulderHollow:false},{massModel:'profile-shell'}]){const nose=createNose(options);const result=cadJob(oc,{component:nose});const p=noseGeometry(nose,noseConeProfile(nose,48));assert(Math.abs(result.properties.volumeMm3-p.volume*1e9)<.00001);}
const body=createBody();const tube=cadJob(oc,{component:body});
const exact=Math.PI*((body.diameter/2)**2-(body.diameter/2-body.wallThickness)**2)*body.length*1e9;
assert(Math.abs(tube.properties.volumeMm3-exact)<.001);
const coarse=cadJob(oc,{component:body,toleranceMm:1});
const fine=cadJob(oc,{component:body,toleranceMm:.01});
assert(fine.mesh.indices.length>coarse.mesh.indices.length);
assert.throws(()=>cadJob(oc,{action:'import',bytes:new TextEncoder().encode('invalid STEP')}));
assert.throws(()=>cadJob(oc,{component:createFinCan(),toleranceMm:0}));
assert.throws(()=>cadJob(oc,{component:{...body,wallThickness:1}}));
const ring=createRing();const ringCAD=cadJob(oc,{component:ring});
const ringVolume=Math.PI*(ring.diameter**2-ring.innerDiameter**2)*ring.length/4*1e9;
assert.equal(ringCAD.properties.solids,1);assert(Math.abs(ringCAD.properties.volumeMm3-ringVolume)<1e-6);
assert(Math.abs(ringCAD.properties.centroidMm[2]-ring.length*500)<1e-9);
console.log('PASS: centering-ring solid, exact volume/centroid and STEP round trip');
console.log('PASS: tube dimensions/volume, adjustable tessellation, malformed STEP and invalid dimensions');
