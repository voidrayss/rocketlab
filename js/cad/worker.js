import { cadJob } from './solid.js';
const base='https://cdn.jsdelivr.net/npm/replicad-opencascadejs@0.20.2/src/';
let kernel;
self.onmessage=async ({data})=>{
  try {
    kernel ??= import(base+'replicad_single.js').then(({default:init})=>init({locateFile:name=>base+name}));
    const result=cadJob(await kernel,data.job);
    self.postMessage({id:data.id,result});
  } catch(error) {
    kernel=null;
    self.postMessage({id:data.id,error:error?.message || String(error)});
  }
};
