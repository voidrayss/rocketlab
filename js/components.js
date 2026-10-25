import {createNose,createBody,createTransition,createFins,createFinCan,createRing,layoutPositions} from './rocket.js';
import {applyAssembly,defaultAttachment,assembled} from './assembly.js';
import {serializeProject,serializePart,parsePart} from './project.js';
export function editComponent(rocket,id,patch){
  const source=rocket.components.find(c=>c.id===id);
  if(source?.attachment && source.attachment.matching!=="manual" && ["diameter","innerDiameter","shoulderDiameter"].some(k=>Object.hasOwn(patch,k)))throw new Error('Diameter is derived or locked; select Manual override first.');
  const draft={...rocket,components:rocket.components.map(c=>({...c,...(c.attachment?{attachment:{...c.attachment}}:{}),...(c.id===id?patch:{})}))};
  applyAssembly(draft);serializeProject(draft);
  for(const c of draft.components)Object.assign(rocket.components.find(old=>old.id===c.id),c);
}
export function addComponent(rocket,type,selectedId){
  const factories={nose:createNose,body:createBody,transition:createTransition,fins:createFins,finCan:createFinCan,ring:createRing};
  if(!Object.hasOwn(factories,type))throw new Error('Unsupported component type.');
  if(['fins','finCan'].includes(type)&&rocket.components.some(c=>assembled(c)&&c.type==='finCan'))throw new Error('Edit or remove the assembled fin can before adding another tail fin set.');
  const bodies=rocket.components.filter(c=>assembled(c)&&c.type==='body');
  const body=bodies.find(c=>c.id===selectedId) || (type==='nose'?bodies[0]:bodies.at(-1));
  const c=factories[type]();
  if(body && ['nose','finCan'].includes(type))c.attachment=defaultAttachment(body.id,type,type==='finCan'?'over':'butt');
  let components=rocket.components.filter(old=>!(type==='finCan'&&assembled(old)&&old.type==='fins'));
  const index=type==='nose'&&body?components.findIndex(old=>old.id===body.id):components.findIndex(old=>old.type==='fins'&&assembled(old));
  if(index>=0)components.splice(index,0,c);else components.push(c);
  const draft={...rocket,components:components.map(old=>({...old}))};applyAssembly(draft);serializeProject(draft);
  rocket.components=draft.components.map(next=>{const old=rocket.components.find(old=>old.id===next.id);return old?Object.assign(old,next):next;});return rocket.components.find(old=>old.id===c.id);
}
export function deleteComponent(rocket,id){
  // Dependents remain reusable parts rather than silently attaching elsewhere.
  rocket.components=rocket.components.filter(c=>c.id!==id).map(c=>c.attachment?.parentId===id?Object.assign(c,{attachment:undefined,inAssembly:false}):c);
  applyAssembly(rocket);
}
export function duplicateComponent(rocket,id){
  const source=rocket.components.find(c=>c.id===id);if(!source)throw new Error('Select a part first.');
  const c=parsePart(serializePart(source));c.name=(source.name||source.type)+' copy';rocket.components.push(c);return c;
}
export function localPart(c){return {...c,attachment:undefined,inAssembly:true,axialOffset:0,...(c.type==='fins'?{finOffset:c.rootChord}:{})};}
