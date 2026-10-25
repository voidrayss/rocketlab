// Radial-wall manufacturing profile. Curved families use the same 48 axial samples
// for CAD, display and exact piecewise-frustum volume/centroid integration.
export function validateNose(c){
  for(const k of ['length','diameter','wallThickness'])if(!Number.isFinite(c[k])||c[k]<=0||c[k]>2)throw new Error(`Nose ${k} must be positive and at most 2 m.`);
  if(c.wallThickness>=c.diameter/2)throw new Error('Nose wall must leave a hollow interior.');
  if(!['legacy-cone','profile-shell'].includes(c.massModel??'legacy-cone'))throw new Error('Unsupported nose mass model.');
  for(const k of ['shoulderEnabled','shoulderHollow'])if(c[k]!==undefined&&typeof c[k]!=='boolean')throw new Error('Invalid shoulder setting.');
  if(c.shoulderEnabled){
    for(const k of ['shoulderLength','shoulderDiameter','shoulderWallThickness','shoulderJoinThickness'])if(!Number.isFinite(c[k])||c[k]<=0)throw new Error(`Invalid ${k}.`);
    if(c.shoulderLength>2||c.shoulderDiameter>c.diameter||(c.shoulderHollow!==false&&c.shoulderWallThickness>=c.shoulderDiameter/2)||c.shoulderJoinThickness>=c.length/2)throw new Error('Shoulder must fit within the nose diameter with a valid wall and short join web.');
  }
  return c;
}
function radiusAt(profile,x){
  const i=profile.findIndex(p=>p.x>=x);if(i<=0)return profile[Math.max(i,0)].r;
  const a=profile[i-1],b=profile[i];return a.r+(b.r-a.r)*(x-a.x)/(b.x-a.x);
}
function integral(profile){
  let volume=0,moment=0;
  for(let i=1;i<profile.length;i++){
    const a=profile[i-1],b=profile[i],h=b.x-a.x;if(h<=0)continue;
    const d=b.r-a.r,V=Math.PI*h*(a.r*a.r+a.r*b.r+b.r*b.r)/3;
    volume+=V;moment+=a.x*V+Math.PI*h*h*(a.r*a.r/2+2*a.r*d/3+d*d/4);
  }
  return {volume,moment};
}
export function noseGeometry(c,profile){
  validateNose(c);
  const outer=profile.map(p=>({x:p.x,r:Math.max(0,p.r)}));
  const stop=c.shoulderEnabled?c.length-c.shoulderJoinThickness:c.length;
  const wall=c.wallThickness;
  let crossing=0;
  for(let i=1;i<outer.length;i++)if(outer[i].r>=wall){const a=outer[i-1],b=outer[i];crossing=a.x+(wall-a.r)*(b.x-a.x)/(b.r-a.r);break;}
  if(crossing>=stop)throw new Error('Nose cavity does not reach the shoulder join.');
  const inner=[{x:crossing,r:0},...outer.filter(p=>p.x>crossing&&p.x<stop).map(p=>({x:p.x,r:Math.max(0,p.r-wall)})),{x:stop,r:Math.max(0,radiusAt(outer,stop)-wall)}];
  if(c.shoulderEnabled){
    const bore=c.shoulderHollow===false?0:c.shoulderDiameter/2-c.shoulderWallThickness;
    if(bore>=radiusAt(outer,stop))throw new Error('Shoulder bore intersects the nose wall at the join; shorten the join web or increase shoulder wall.');
    inner.push({x:stop,r:bore},{x:c.length,r:bore},{x:c.length+c.shoulderLength,r:bore});
    outer.push({x:c.length,r:c.shoulderDiameter/2},{x:c.length+c.shoulderLength,r:c.shoulderDiameter/2});
  }
  const out=integral(outer),inside=integral(inner),volume=out.volume-inside.volume;
  if(!(volume>0))throw new Error('Nose shell has no positive volume.');
  return {outer,inner,profile:[...outer,...inner.slice().reverse()],volume,centroidX:(out.moment-inside.moment)/volume};
}
