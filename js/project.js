import { noseGeometry } from "./nose.js";
import { applyAssembly, validateAttachment } from "./assembly.js";
import { ringProperties } from "./rings.js";
import { validateImported, PROJECT_LIMIT } from "./imported.js";
import { validateFinCan } from "./fincan.js";
// Versioned project interchange; pure ES module, no browser or server required.
import { createNose, createBody, createTransition, createFins, createFinCan, createImported, createRing, newUID, noseConeProfile, MATERIALS, NOSE_SHAPES } from './rocket.js';
import { MOTOR_CATALOG } from './motors.js';
const factories = { nose: createNose, body: createBody, transition: createTransition, fins: createFins, finCan: createFinCan, imported: createImported, ring: createRing };
const dimensions = {
  nose: ['length', 'diameter', 'wallThickness'],
  body: ['length', 'diameter', 'wallThickness'],
  transition: ['length', 'frontDiameter', 'rearDiameter', 'wallThickness'],
  ring: ['length','diameter','innerDiameter'],
  finCan: ['length', 'diameter', 'innerDiameter', 'rootChord', 'tipChord', 'span', 'thickness'],
  fins: ['rootChord', 'tipChord', 'span', 'thickness'],
};
export function parseProject(text) {
  if (typeof text !== 'string' || text.length > PROJECT_LIMIT) throw new Error('Project must be a JSON file smaller than 50 MB.');
  const data = JSON.parse(text);
  if (!data || data.format !== 'rocketlab' || ![1,2,3].includes(data.version)) throw new Error('Unsupported RocketLab project format or version.');
  const r = data.rocket;
  if (!r || typeof r.name !== 'string' || !r.name.trim() || r.name.length > 200) throw new Error('Project needs a name of 1–200 characters.');
  if (typeof r.motorId !== 'string' || !Object.hasOwn(MOTOR_CATALOG, r.motorId)) throw new Error('Project motor is unavailable. Wait for the motor catalog to load and try again.');
  if (!Array.isArray(r.components) || r.components.length < 1 || r.components.length > 100) throw new Error('Project needs 1–100 components.');
  if (r.components.some(c => c?.type === 'finCan' && c.inAssembly!==false) && r.components.filter(c => c?.inAssembly!==false && (c?.type === 'finCan' || c?.type === 'fins')).length !== 1) throw new Error('Use one fin can without overlapping separate tail fins.');
  const validated = r.components.map(c => {
    if (!c || !Object.hasOwn(factories, c.type)) throw new Error('Unsupported component type.');
    if (!Object.hasOwn(MATERIALS, c.material)) throw new Error('Unsupported component material.');
    if (c.type === 'imported') {
      validateImported(c);
      const {id, type, ...params} = c;
      return {type, params};
    }
    const params = { material: c.material };
    for (const key of dimensions[c.type]) {
      if (!Number.isFinite(c[key]) || c[key] <= 0 || c[key] > 100) throw new Error(`${c.type}: ${key} must be positive and at most 100 m.`);
      params[key] = c[key];
    }
    if (c.sourceStepSha256 !== undefined) {
      if(typeof c.sourceStepSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(c.sourceStepSha256)) throw new Error('Invalid source STEP provenance.');
      params.sourceStepSha256=c.sourceStepSha256;
    }
    if (c.type === 'nose') {
      if (![...NOSE_SHAPES, 'cone', 'blunt'].includes(c.shape)) throw new Error('Unsupported nose shape.');
      params.shape = c.shape;
      for(const key of ['massModel','shoulderEnabled','shoulderLength','shoulderDiameter','shoulderWallThickness','shoulderHollow','shoulderJoinThickness'])if(c[key]!==undefined)params[key]=c[key];
    }
    if (c.type === 'fins' || c.type === 'finCan') {
      if (!Number.isInteger(c.count) || c.count < 1 || c.count > 32) throw new Error('Fin count must be an integer from 1 to 32.');
      if (!Number.isFinite(c.sweep) || Math.abs(c.sweep) > 100) throw new Error('Invalid fin sweep.');
      if(c.finOffset!==undefined && c.finOffset!==null && (!Number.isFinite(c.finOffset)||Math.abs(c.finOffset)>2))throw new Error('Invalid fin axial offset.');
      Object.assign(params, { count: c.count, sweep: c.sweep, ...(c.planform!==undefined?{planform:c.planform}:{}),...(c.crossSection!==undefined?{crossSection:c.crossSection}:{}), ...(c.finOffset!==undefined?{finOffset:c.finOffset}:{}) });
    } else {
      const diameter = c.type === 'transition' ? Math.min(c.frontDiameter, c.rearDiameter) : c.diameter;
      if (c.wallThickness * 2 >= diameter) throw new Error('Wall thickness must leave a hollow interior.');
    }
    if (c.type === 'finCan') validateFinCan(params);
    if (c.type === 'ring') {params.axialOffset=c.axialOffset;ringProperties(params);}
    return { type: c.type, params };
  });
  // Allocate IDs only after the complete file has passed validation.
  const components=validated.map(c => { const component=factories[c.type](c.params); if(c.params.sourceStepSha256) component.sourceStepSha256=c.params.sourceStepSha256; return component; });
  const ids=new Map();
  r.components.forEach((old,i)=>{if(ids.has(old.id) && r.components.some(c=>c.attachment))throw new Error('Duplicate attachment IDs.');ids.set(old.id,components[i].id);});
  const uids=new Set();
  r.components.forEach((old,i)=>{
    const c=components[i];
    if(old.uid!==undefined){if(typeof old.uid!=='string'||old.uid.length>100||!old.uid||uids.has(old.uid))throw new Error('Part identities must be unique.');c.uid=old.uid;uids.add(c.uid);}
    if(old.name!==undefined){if(typeof old.name!=='string'||!old.name.trim()||old.name.length>200)throw new Error('Invalid part name.');c.name=old.name;}
    for(const key of ['visible','inAssembly'])if(old[key]!==undefined){if(typeof old[key]!=='boolean')throw new Error('Invalid component state.');c[key]=old[key];}
    if(old.attachment){if(!ids.has(old.attachment.parentId))throw new Error('Missing attachment target.');c.attachment={...old.attachment,parentId:ids.get(old.attachment.parentId)};}
  });
  const result={name:r.name,motorId:r.motorId,components};applyAssembly(result);
  for(const c of result.components)if(c.type==="nose"&&(c.shoulderEnabled||c.massModel==="profile-shell"))noseGeometry(c,noseConeProfile(c,48));
  return result;
}
export function serializeProject(rocket) {
  const text = JSON.stringify({ format: 'rocketlab', version: 3, rocket }, null, 2);
  parseProject(text); // Never offer a download that cannot be reopened.
  return text;
}

export function serializePart(component) {
  const part={...component,attachment:undefined,inAssembly:true};
  const project=serializeProject({name:component.name||component.type,motorId:'C6',components:[part]});
  return JSON.stringify({format:'rocketlab-part',version:1,component:JSON.parse(project).rocket.components[0]},null,2);
}
export function parsePart(text){
  if(typeof text!=='string'||text.length>PROJECT_LIMIT)throw new Error('Part file exceeds project size limit.');
  const data=JSON.parse(text);if(data.format!=='rocketlab-part'||data.version!==1)throw new Error('Unsupported part file.');
  const c=parseProject(JSON.stringify({format:'rocketlab',version:3,rocket:{name:'Imported part',motorId:'C6',components:[{...data.component,attachment:undefined}]}})).components[0];
  c.uid=newUID();c.inAssembly=false;return c;
}
