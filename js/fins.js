export const PLANFORMS=['custom','rectangular','trapezoidal','swept','clippedDelta'];
export function validateFinStyle(c){
  if(!PLANFORMS.includes(c.planform??'custom'))throw new Error('Unsupported fin planform; only four-point flat planforms are implemented.');
  if((c.crossSection??'flat')!=='flat')throw new Error('Only flat-plate cross-sections are implemented.');
}
export function finAngles(c){
  return {leading:Math.atan2(c.sweep,c.span)*180/Math.PI,trailing:Math.atan2(c.sweep+c.tipChord-c.rootChord,c.span)*180/Math.PI};
}
export function anglePatch(c,edge,degrees){
  if(!['leading','trailing'].includes(edge)||!Number.isFinite(degrees)||Math.abs(degrees)>=85)throw new Error('Edge sweep angle must be between −85° and 85°, measured from radial.');
  const distance=c.span*Math.tan(degrees*Math.PI/180);
  if(edge==='leading')return {sweep:distance,planform:'custom'};
  const tipChord=c.rootChord-c.sweep+distance;
  if(tipChord<=0)throw new Error('Trailing angle would produce a non-positive tip chord.');
  return {tipChord,planform:'custom'};
}
export function planformPatch(c,planform){
  if(!PLANFORMS.includes(planform))throw new Error('Unsupported fin planform.');
  const cr=c.rootChord;
  const values={custom:{},rectangular:{tipChord:cr,sweep:0},trapezoidal:{tipChord:cr*.5,sweep:cr*.25},swept:{tipChord:cr*.5,sweep:cr*.75},clippedDelta:{tipChord:cr*.2,sweep:cr*.8}};
  return {...values[planform],planform};
}
