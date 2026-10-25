// Internal manufacturing part; never contributes external reference area/CP.
export function ringProperties(c) {
  for(const key of ['length','diameter','innerDiameter']) if(!Number.isFinite(c[key]) || c[key]<=0 || c[key]>2) throw new Error(`Ring ${key} must be positive and at most 2 m.`);
  if(c.innerDiameter>=c.diameter) throw new Error('Ring inner diameter must be smaller than its outer diameter.');
  if(!Number.isFinite(c.axialOffset) || c.axialOffset<0 || c.axialOffset>100) throw new Error('Ring axial position must be 0–100 m from the nose.');
  return {volume:Math.PI*(c.diameter**2-c.innerDiameter**2)*c.length/4,centroidX:c.length/2};
}
