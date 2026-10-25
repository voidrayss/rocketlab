// Persistent imported geometry: original STEP + kernel properties + display mesh.
export const PROJECT_LIMIT = 50000000;
export function bytesToBase64(bytes) {
  let binary='';
  for(let i=0;i<bytes.length;i+=32768) binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(binary);
}
export function base64ToBytes(text) {
  const binary=atob(text);return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
export async function stepHash(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export function validateImported(c) {
  if (!c || !['internal','body'].includes(c.aeroRole)) throw new Error('Choose an internal mass or external cylindrical aerodynamic proxy.');
  if(typeof c.name!=='string' || !c.name.trim() || c.name.length>200) throw new Error('Imported CAD needs a name of 1–200 characters.');
  for(const key of ['density','length','diameter']) if(!Number.isFinite(c[key]) || c[key]<=0 || c[key]> (key==='density'?30000:100)) throw new Error(`Invalid imported CAD ${key}.`);
  for(const key of ['axialOffset','radialX','radialY','rotationX','rotationY','rotationZ']) if(!Number.isFinite(c[key]) || Math.abs(c[key])>(key.startsWith('rotation')?360:100)) throw new Error(`Invalid CAD placement ${key}.`);
  const cad=c.cad,p=cad?.properties;
  if(!p || !p.valid || !Number.isInteger(p.solids) || p.solids<1 || !Number.isFinite(p.volumeMm3) || p.volumeMm3<=0) throw new Error('Imported CAD needs validated solid properties.');
  if(!Array.isArray(p.centroidMm) || p.centroidMm.length!==3 || !p.centroidMm.every(Number.isFinite) || !Array.isArray(p.boundsMm) || p.boundsMm.length!==2 || p.boundsMm.some(v=>!Array.isArray(v)||v.length!==3||!v.every(Number.isFinite)) || p.boundsMm[0].some((v,i)=>v>=p.boundsMm[1][i])) throw new Error('Invalid CAD centroid or bounds.');
  if(typeof cad.stepBase64!=='string' || cad.stepBase64.length>27000000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(cad.stepBase64)) throw new Error('Invalid STEP asset (20 MB limit).');
  const bytes=base64ToBytes(cad.stepBase64);
  if(bytes.length>20000000 || !new TextDecoder().decode(bytes.subarray(0,256)).includes('ISO-10303-21;')) throw new Error('Missing STEP source geometry.');
  if(typeof cad.sha256!=='string' || !/^[a-f0-9]{64}$/.test(cad.sha256)) throw new Error('Missing STEP source fingerprint.');
  const mesh=cad.mesh;
  if(!mesh || !Array.isArray(mesh.positions)||mesh.positions.length<9||mesh.positions.length%3||mesh.positions.length>3000000||!mesh.positions.every(Number.isFinite)||!Array.isArray(mesh.indices)||!mesh.indices.length||mesh.indices.length%3||mesh.indices.length>6000000||!mesh.indices.every(i=>Number.isInteger(i)&&i>=0&&i<mesh.positions.length/3)) throw new Error('Invalid CAD display mesh.');
  return c;
}
// Source origin is normalized to radial bounds center / minimum source Z.
// Rotate X then Y then Z in source coordinates. Return [axial, radial X, radial Y] m.
export function importedPoint(c, point) {
  const [lo,hi]=c.cad.properties.boundsMm;
  let [x,y,z]=[point[0]-(lo[0]+hi[0])/2,point[1]-(lo[1]+hi[1])/2,point[2]-lo[2]];
  for(const axis of [0,1,2]) {
    const angle=c[['rotationX','rotationY','rotationZ'][axis]]*Math.PI/180,co=Math.cos(angle),si=Math.sin(angle);
    if(axis===0) [y,z]=[co*y-si*z,si*y+co*z];
    if(axis===1) [x,z]=[co*x+si*z,-si*x+co*z];
    if(axis===2) [x,y]=[co*x-si*y,si*x+co*y];
  }
  return [z/1000,x/1000+c.radialX,y/1000+c.radialY];
}
export function metadataComparison(metadata, imported) {
  if(!metadata || metadata.format!=='rocketlab-cad' || ![1,2].includes(metadata.version)) throw new Error('Unsupported CAD metadata format.');
  const p=metadata.properties,q=imported.properties;
  const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=Math.max(1e-6,Math.abs(b)*1e-6);
  const propertiesMatch=!!p && p.solids===q.solids && close(p.volumeMm3,q.volumeMm3) && p.centroidMm?.every((v,i)=>close(v,q.centroidMm[i])) && p.boundsMm?.every((a,i)=>a.every((v,j)=>close(v,q.boundsMm[i][j])));
  const exactSource=metadata.version===2 && metadata.stepSha256===imported.sha256;
  return {propertiesMatch,exactSource,canRestore:propertiesMatch&&exactSource&&['body','finCan','ring'].includes(metadata.component?.type)};
}
export async function verifyProjectAssets(rocket) {
  for(const c of rocket.components) if(c.type==='imported') {
    if(await stepHash(base64ToBytes(c.cad.stepBase64))!==c.cad.sha256) throw new Error('Saved STEP source fingerprint mismatch. Project was not loaded.');
  }
}
