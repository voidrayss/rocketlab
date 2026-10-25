// Chart data stays independent of Canvas so units and ranges can be tested.
export const PLOT_TYPES = {
  altitude: { label: 'Altitude', unit: 'm', note: 'Height above the launch point, from the vertical RK4 trajectory.' },
  velocity: { label: 'Vertical velocity', unit: 'm/s', note: 'Positive during ascent and negative during descent. This model has no wind or downrange motion.' },
  acceleration: { label: 'Vertical acceleration', unit: 'm/s²', note: 'Net vertical acceleration including gravity and drag; this is not accelerometer proper acceleration.' },
  thrust: { label: 'Thrust', unit: 'N', note: 'Interpolated motor curve or constant-thrust preset. Shipped curves are approximate.' },
  stability: { label: 'Static stability', unit: 'cal', note: 'Six samples during motor burn using fixed CP and changing motor mass. This does not simulate attitude dynamics.' },
};
export function flightPlot(result, type = 'altitude') {
  if (!Object.hasOwn(PLOT_TYPES, type)) throw new Error('Unknown flight plot.');
  const info = PLOT_TYPES[type];
  const points = type === 'stability'
    ? (result.stats.stabilityVsTime ?? []).map(s => ({ t: s.t, value: s.calibers }))
    : result.samples.map(s => ({ t: s.t, value: s[{ altitude: 'y', velocity: 'v', acceleration: 'accel', thrust: 'thrust' }[type]] }));
  const finite = points.filter(p => Number.isFinite(p.t) && Number.isFinite(p.value));
  let min = 0, max = 0;
  for (const p of finite) { min = Math.min(min, p.value); max = Math.max(max, p.value); }
  if (max === min) max = min + 1;
  return { ...info, points: finite, min, max, tMax: Math.max(1, finite.at(-1)?.t ?? 0) };
}
