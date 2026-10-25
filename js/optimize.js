// Deterministic static search. No drag, strength, flight or structural optimization claim.
import {stabilityMargin} from './aero.js';
import {MATERIALS,bodyLength} from './rocket.js';
import {validateFinStyle} from './fins.js';
import {finCanProperties,validateFinCan} from './fincan.js';
export function searchFins(rocket,id,motor,{objective='mass',minMargin=1,maxMargin=2.5,minSpan=.01,maxSpan=.15,maxRoot=.2,maxMassKg=.2}={}){
  if(!motor||!Number.isFinite(motor.totalMass)||motor.totalMass<=0)throw new Error("A valid loaded motor is required for static stability.");
  const c=rocket.components.find(c=>c.id===id);
  if(!c||!['fins','finCan'].includes(c.type)||c.inAssembly===false)throw new Error('Select an assembled flat fin set or fin can.');
  validateFinStyle(c);
  if(!['mass','stability'].includes(objective))throw new Error('Only mass/material and static stability objectives are supported.');
  if(![minMargin,maxMargin,minSpan,maxSpan,maxRoot,maxMassKg].every(Number.isFinite)||minMargin<0||maxMargin<minMargin||minSpan<=0||maxSpan<minSpan||maxSpan>2||maxRoot<=0||maxRoot>2||maxMassKg<=0)throw new Error('Invalid fin-search constraints.');
  const spans=[...new Set([.7,.85,1,1.15,1.3].map(f=>Math.min(maxSpan,c.span*f)).concat(minSpan,maxSpan))].filter(v=>v>=minSpan);
  const roots=[...new Set([.8,1,1.2].map(f=>Math.min(maxRoot,c.rootChord*f)).concat(maxRoot))];
  let best=null,evaluated=0,feasible=0;
  for(const span of spans)for(const rootChord of roots)for(const ratio of [.25,.5,.75,1])for(const sweepRatio of [0,.25,.5,.75]){
    const patch={span,rootChord,tipChord:rootChord*ratio,sweep:rootChord*sweepRatio,planform:'custom',crossSection:'flat'};
    const part={...c,...patch};
    try{if(part.type==='finCan')validateFinCan(part);}catch{continue;}
    evaluated++;
    const candidate={...rocket,components:rocket.components.map(old=>old.id===id?part:old)};
    const margin=stabilityMargin(candidate,motor.totalMass,Math.max(0,bodyLength(candidate)-.05)).calibers;
    const volume=part.type==='finCan'?finCanProperties(part).volume:(part.rootChord+part.tipChord)*part.span/2*part.thickness*part.count;
    const massKg=volume*MATERIALS[part.material];
    if(!Number.isFinite(margin)||!Number.isFinite(massKg)||massKg<=0||massKg>maxMassKg||margin<minMargin||margin>maxMargin)continue;
    feasible++;
    const score=objective==='mass'?massKg:-margin;
    if(!best||score<best.score-1e-12||(Math.abs(score-best.score)<1e-12&&massKg<best.massKg))best={patch,margin,massKg,volume,score};
  }
  return {best,evaluated,feasible,objective,assumptions:'Uniform flat plates and existing Barrowman static stability at loaded motor mass; no high-fidelity drag, flight or structural optimization.'};
}
