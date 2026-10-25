import {validateFinStyle} from "./fins.js";
// Area centroid along the root chord for a uniform trapezoidal plate.
export function finAxialCentroid({rootChord: cr, tipChord: ct, sweep}) {
  return (sweep * (cr + 2 * ct) + cr * cr + cr * ct + ct * ct) / (3 * (cr + ct));
}
// Manufacturing dimensions in meters, local to the sleeve; assembly may attach it over/inside a body.
export function validateFinCan(c) {
  validateFinStyle(c);
  for (const k of ['length', 'diameter', 'innerDiameter', 'rootChord', 'tipChord', 'span', 'thickness']) {
    if (!Number.isFinite(c[k]) || c[k] <= 0 || c[k] > 2) throw new Error(`Fin can: ${k} must be between 0 and 2 m.`);
  }
  if (c.innerDiameter >= c.diameter) throw new Error('Sleeve inner diameter must be smaller than outer diameter.');
  if (!Number.isInteger(c.count) || c.count < 2 || c.count > 12) throw new Error('Fin count must be 2–12.');
  if(!Number.isFinite(c.sweep)||Math.abs(c.sweep)>2)throw new Error('Fin sweep must be finite and within ±2 m.');
  const start=c.finOffset??(c.length-c.rootChord);
  if(!Number.isFinite(start)||Math.abs(start)>2)throw new Error('Fin axial offset must be within ±2 m.');
  if(Math.min(c.length,start+c.rootChord)-Math.max(0,start)<=1e-5)throw new Error('Fin root is disconnected from the sleeve. Keep a positive root overlap.');
  if (c.thickness >= c.innerDiameter * Math.sin(Math.PI / c.count)) throw new Error('Fin thickness is too large for separated radial fins.');
  return c;
}
export function finCanProperties(c) {
  validateFinCan(c);
  const R = c.diameter / 2, r = c.innerDiameter / 2, h = c.thickness / 2;
  const sleeveVolume = Math.PI * (R * R - r * r) * c.length;
  const area = (c.rootChord + c.tipChord) * c.span / 2;
  // Extra material beyond the circular sleeve under the rectangular root.
  const rootArea = R * c.thickness - (h * Math.sqrt(R * R - h * h) + R * R * Math.asin(h / R));
  const finX=c.finOffset??(c.length-c.rootChord);
  const supportStart=Math.max(0,finX),supportEnd=Math.min(c.length,finX+c.rootChord);
  const rootVolume = (supportEnd-supportStart) * rootArea;
  const panelVolume = area * c.thickness;
  const panelX = finAxialCentroid(c);
  const volume = sleeveVolume + c.count * (rootVolume + panelVolume);
  const centroidX = (sleeveVolume * c.length / 2 + c.count * (rootVolume * (supportStart+supportEnd)/2 + panelVolume * (finX + panelX))) / volume;
  return { volume, centroidX, sleeveVolume, finVolume: volume - sleeveVolume, supportFraction:(supportEnd-supportStart)/c.rootChord };
}
