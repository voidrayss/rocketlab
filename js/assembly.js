// Pure dependency resolver. UI materializes derived dimensions; engines resolve copies.
const RESOLVED=Symbol('resolved assembly');
export const assembled = c => c.inAssembly !== false;
export const internal = c => c.type==='ring' || (c.type==='imported' && c.aeroRole==='internal');
export const finStart = c => c.finOffset ?? (c.length-c.rootChord);
export function validateAttachment(c, byId) {
  const a=c.attachment;if(!a)return;
  if(!byId.has(a.parentId) || !assembled(byId.get(a.parentId)))throw new Error('Attachment target is missing or not in the assembly.');
  if(a.parentId===c.id)throw new Error('A component cannot attach to itself.');
  if(byId.get(a.parentId).type!=='body')throw new Error('Attachment target must be a body tube.');
  if(!['nose','finCan','ring','body'].includes(c.type))throw new Error('This component does not support body attachments.');
  if(!['forward','aft'].includes(a.end)||!['butt','over','inside'].includes(a.fit)||!['auto','manual','locked'].includes(a.matching))throw new Error('Invalid attachment relationship.');
  if(!Number.isFinite(a.offset)||Math.abs(a.offset)>100||!Number.isFinite(a.clearance)||a.clearance<0||a.clearance>.01)throw new Error('Invalid attachment offset or radial clearance.');
  if(c.type==='nose' && (a.end!=='forward'||a.fit!=='butt'))throw new Error('A nose attaches to the forward end with a butt connection.');
  if(c.type==='body' && a.fit!=='butt')throw new Error('Body-to-body attachment currently supports butt connections only.');
}
export function resolveAssembly(rocket) {
  if(rocket[RESOLVED])return rocket;
  const all=rocket.components.map(c=>({...c,...(c.attachment?{attachment:{...c.attachment}}:{})}));
  const map=new Map(all.map(c=>[c.id,c]));
  if(map.size!==all.length)throw new Error('Component IDs must be unique.');
  const done=new Set(),visiting=new Set(),warnings=[];
  function size(c){
    if(done.has(c.id))return;if(visiting.has(c.id))throw new Error('Circular assembly constraints.');
    visiting.add(c.id);validateAttachment(c,map);
    if(c.attachment){
      const a=c.attachment,p=map.get(a.parentId);size(p);
      const bore=p.diameter-2*p.wallThickness;
      if(a.matching==='auto'){
        if(c.type==='nose'||c.type==='body')c.diameter=p.diameter;
        if(c.type==='finCan'){
          const wall=(c.diameter-c.innerDiameter)/2;
          if(a.fit==='over'){c.innerDiameter=p.diameter+2*a.clearance;c.diameter=c.innerDiameter+2*wall;}
          else if(a.fit==='inside'){c.diameter=bore-2*a.clearance;c.innerDiameter=c.diameter-2*wall;}
          else {c.diameter=p.diameter;c.innerDiameter=c.diameter-2*wall;}
        }
        if(c.type==='ring')c.diameter=bore-2*a.clearance;
        if(c.type==='nose' && c.shoulderEnabled)c.shoulderDiameter=bore-2*a.clearance;
      }
      if(c.diameter<=0 || (c.innerDiameter!==undefined && (c.innerDiameter<=0||c.innerDiameter>=c.diameter)))throw new Error('Attachment fit leaves no valid hollow wall.');
      if(c.type==='finCan' && a.fit==='inside')warnings.push('Inside-body fin cans need body slots for the fins. Slot geometry and interference are not generated automatically.');
      if(a.matching!=='auto')warnings.push(`${c.name||c.type}: attachment dimensions are ${a.matching}; confirm fit after resizing its body.`);
    }
    visiting.delete(c.id);done.add(c.id);
  }
  all.forEach(size);
  let cursor=0;const base=new Map();
  for(const c of all){
    if(!assembled(c))continue;
    if(c.type==='fins'||internal(c))continue;
    base.set(c.id,cursor+(c.type==='imported'?c.axialOffset:0));
    if(!c.attachment || c.type==='nose')cursor+=c.length;
  }
  const pos=new Map(),placing=new Set();
  function place(c){
    if(pos.has(c.id))return pos.get(c.id);
    if(placing.has(c.id))throw new Error('Circular placement constraints.');
    placing.add(c.id);let x=base.get(c.id)??0;
    if(c.attachment){
      const a=c.attachment,p=map.get(a.parentId),px=place(p);
      if(a.fit==='butt' && c.type!=='ring')x=a.end==='forward'?px-c.length:px+p.length;
      else x=a.end==='forward'?px:px+p.length-c.length;
      x+=a.offset;
    }else if(internal(c))x=c.axialOffset??0;
    pos.set(c.id,x);placing.delete(c.id);return x;
  }
  all.filter(c=>assembled(c)&&c.type!=='fins').forEach(place);
  let bodyEnd=0;
  for(const c of all)if(assembled(c)&&!internal(c)&&c.type!=='fins')bodyEnd=Math.max(bodyEnd,(pos.get(c.id)??0)+c.length);
  for(const c of all)if(assembled(c)&&c.type==='fins')pos.set(c.id,bodyEnd-c.rootChord+(c.finOffset??0));
  for(const c of all.filter(c=>assembled(c)&&c.attachment)){
    const p=map.get(c.attachment.parentId),a=c.attachment,cx=pos.get(c.id),px=pos.get(p.id);
    const overlap=(start,end)=>Math.min(end,px+p.length)-Math.max(start,px);
    if(c.type==='finCan'&&a.fit!=='butt'&&overlap(cx,cx+c.length)<=1e-6)throw new Error('Sleeve attachment needs axial overlap with its body. Reduce the offset or use a butt joint.');
    if(c.type==='nose'&&c.shoulderEnabled&&overlap(cx+c.length,cx+c.length+c.shoulderLength)<=1e-6)throw new Error('The shoulder does not engage its body at this axial offset.');
    const bore=p.diameter-2*p.wallThickness;
    if((c.type==='finCan'&&a.fit==='over'&&c.innerDiameter<p.diameter)||(c.type==='finCan'&&a.fit==='inside'&&c.diameter>bore)||(c.type==='nose'&&c.shoulderEnabled&&c.shoulderDiameter>bore)||(c.type==='ring'&&c.diameter>bore))warnings.push((c.name||c.type)+': interference with body material. Fix the locked/manual fit before manufacturing; no automatic material subtraction is performed.');
    if(c.type==='nose'&&c.shoulderEnabled&&c.shoulderLength>p.length)warnings.push('The nose shoulder is longer than its body. Confirm assembly fit.');
  }
  let overallEnd=bodyEnd;
  for(const c of all)if(assembled(c)){
    if(c.type==='nose'&&c.shoulderEnabled)overallEnd=Math.max(overallEnd,pos.get(c.id)+c.length+c.shoulderLength);
    if(c.type==='fins')overallEnd=Math.max(overallEnd,pos.get(c.id)+Math.max(c.rootChord,c.sweep+c.tipChord));
    if(c.type==='finCan')overallEnd=Math.max(overallEnd,pos.get(c.id)+finStart(c)+Math.max(c.rootChord,c.sweep+c.tipChord));
  }
  return {...rocket,components:all.filter(assembled),libraryComponents:all,assemblyPositions:pos,bodyEnd,overallEnd,assemblyWarnings:warnings,[RESOLVED]:true};
}
export function applyAssembly(rocket){
  const resolved=resolveAssembly(rocket);
  for(const c of resolved.libraryComponents)Object.assign(rocket.components.find(old=>old.id===c.id),c);
  return resolved;
}
export function defaultAttachment(parentId,type,fit='butt'){
  return {parentId,end:type==='nose'?'forward':'aft',fit,offset:0,clearance:.0002,matching:'auto'};
}
