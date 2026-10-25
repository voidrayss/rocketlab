// Optional real-kernel checks. Pass downloaded loader/WASM paths; no npm install.
// node scripts/cad-check.mjs <loader.mjs> <kernel.wasm> [<independent.cjs> <independent.wasm>]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { cadJob } from '../js/cad/solid.js';
import { createFinCan, createBody } from '../js/rocket.js';
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
const body=createBody();const tube=cadJob(oc,{component:body});
const exact=Math.PI*((body.diameter/2)**2-(body.diameter/2-body.wallThickness)**2)*body.length*1e9;
assert(Math.abs(tube.properties.volumeMm3-exact)<.001);
const coarse=cadJob(oc,{component:body,toleranceMm:1});
const fine=cadJob(oc,{component:body,toleranceMm:.01});
assert(fine.mesh.indices.length>coarse.mesh.indices.length);
assert.throws(()=>cadJob(oc,{action:'import',bytes:new TextEncoder().encode('invalid STEP')}));
assert.throws(()=>cadJob(oc,{component:createFinCan(),toleranceMm:0}));
assert.throws(()=>cadJob(oc,{component:{...body,wallThickness:1}}));
console.log('PASS: tube dimensions/volume, adjustable tessellation, malformed STEP and invalid dimensions');
