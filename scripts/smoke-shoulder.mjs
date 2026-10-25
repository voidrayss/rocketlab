import assert from 'node:assert/strict';
import {createNose,noseConeProfile,defaultRocket,layoutPositions,MATERIALS} from '../js/rocket.js';
import {noseGeometry} from '../js/nose.js';
import {addComponent,deleteComponent,editComponent} from '../js/components.js';
import {massProperties} from '../js/aero.js';
import {massBreakdown} from '../js/analysis.js';
import {serializeProject,parseProject,serializePart,parsePart} from '../js/project.js';
const c=createNose({shape:'conical',massModel:'profile-shell'}),g=noseGeometry(c,noseConeProfile(c,48));
const R=c.diameter/2,t=c.wallThickness,L=c.length,h=L*(R-t)/R,x0=L-h;
const Vo=Math.PI*R*R*L/3,Vi=Math.PI*(R-t)**2*h/3;
assert(Math.abs(g.volume-(Vo-Vi))<1e-15);
assert(Math.abs(g.centroidX-(Vo*.75*L-Vi*(x0+.75*h))/(Vo-Vi))<1e-12);
for(const shape of ['conical','ogive','vonKarman','haack','parabolic','elliptical']){
 const nose=createNose({shape,shoulderEnabled:true}),p=noseGeometry(nose,noseConeProfile(nose,48));
 const r={components:[nose]};assert(p.volume>0&&p.centroidX>0&&p.centroidX<.19);
 assert.equal(massProperties(r).mass,p.volume*MATERIALS.plastic);
 assert.equal(massBreakdown(r)[0].grams,p.volume*MATERIALS.plastic*1000);
 const solid=createNose({...nose,shoulderHollow:false});assert(noseGeometry(solid,noseConeProfile(solid,48)).volume>p.volume);
}
const rocket=defaultRocket(),body=rocket.components[1];deleteComponent(rocket,rocket.components[0].id);
const nose=addComponent(rocket,'nose',body.id);assert(nose.shoulderEnabled&&nose.massModel==='profile-shell');
assert(Math.abs(nose.shoulderDiameter-(body.diameter-2*body.wallThickness-.0004))<1e-12);
editComponent(rocket,body.id,{diameter:.08,length:.6});assert(Math.abs(nose.shoulderDiameter-.0776)<1e-12);
assert.equal(layoutPositions(rocket).get(body.id),nose.length);assert.equal(layoutPositions(rocket).get(nose.id),0);
const loaded=parseProject(serializeProject(rocket)).components.find(c=>c.type==='nose');assert.equal(loaded.shoulderDiameter,nose.shoulderDiameter);assert.equal(loaded.shoulderLength,nose.shoulderLength);
assert.equal(parsePart(serializePart(nose)).shoulderEnabled,true);
const before=JSON.stringify(rocket);assert.throws(()=>editComponent(rocket,nose.id,{shoulderWallThickness:1}));assert.equal(JSON.stringify(rocket),before);
assert.throws(()=>editComponent(rocket,nose.id,{massModel:'legacy-cone'}));
console.log('PASS: analytic radial conical shell, all nose families, shoulder mass/CG, fit, no gap, persistence and invalid edits');
