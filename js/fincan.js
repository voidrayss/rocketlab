// Manufacturing dimensions in meters. The sleeve is an inline body section.
export function validateFinCan(c) {
  for (const k of ['length', 'diameter', 'innerDiameter', 'rootChord', 'tipChord', 'span', 'thickness']) {
    if (!Number.isFinite(c[k]) || c[k] <= 0 || c[k] > 2) throw new Error(`Fin can: ${k} must be between 0 and 2 m.`);
  }
  if (c.innerDiameter >= c.diameter) throw new Error('Sleeve inner diameter must be smaller than outer diameter.');
  if (!Number.isInteger(c.count) || c.count < 2 || c.count > 12) throw new Error('Fin count must be 2–12.');
  if (!Number.isFinite(c.sweep) || c.sweep < 0 || c.sweep + c.tipChord > c.rootChord + 1e-10 || c.rootChord > c.length) throw new Error('Fins must fit along the sleeve: sweep + tip chord ≤ root chord ≤ sleeve length.');
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
  const rootVolume = c.rootChord * rootArea;
  const panelVolume = area * c.thickness;
  const panelX = c.span * (c.sweep * (c.rootChord + 2 * c.tipChord) + c.rootChord ** 2 + c.rootChord * c.tipChord + c.tipChord ** 2) / (6 * area);
  const finX = c.length - c.rootChord;
  const volume = sleeveVolume + c.count * (rootVolume + panelVolume);
  const centroidX = (sleeveVolume * c.length / 2 + c.count * (rootVolume * (finX + c.rootChord / 2) + panelVolume * (finX + panelX))) / volume;
  return { volume, centroidX, sleeveVolume, finVolume: volume - sleeveVolume };
}
