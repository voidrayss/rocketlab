// ===========================================================================
// motors.js — model rocket motor presets and the thrust model.
//
// Real hobby motors are classified by total impulse (A, B, C, D, ...). Each
// letter is roughly double the previous one's impulse. The "6" in "C6" is the
// average thrust in newtons.
//
// For the hackathon we use a simplified "boxcar" thrust curve: constant
// average thrust for the burn duration. Tier-2 upgrade: load real .eng thrust
// curves. The data below is close to real Estes/commercial motor specs.
// ===========================================================================

// mass values in kg, thrust in N, time in s.
export const MOTORS = {
  "A8": {
    name: "A8 (Estes)",
    avgThrust: 2.5, burnTime: 0.5, totalImpulse: 2.5,
    propellantMass: 0.0032, totalMass: 0.0162,
  },
  "B6": {
    name: "B6 (Estes)",
    avgThrust: 4.3, burnTime: 0.8, totalImpulse: 5.0,
    propellantMass: 0.0062, totalMass: 0.0197,
  },
  "C6": {
    name: "C6 (Estes)",
    avgThrust: 6.0, burnTime: 1.7, totalImpulse: 10.0,
    propellantMass: 0.0108, totalMass: 0.0258,
  },
  "D12": {
    name: "D12 (Estes)",
    avgThrust: 12.0, burnTime: 1.65, totalImpulse: 20.0,
    propellantMass: 0.0211, totalMass: 0.0432,
  },
  "E12": {
    name: "E12 (Estes)",
    avgThrust: 12.0, burnTime: 2.5, totalImpulse: 30.0,
    propellantMass: 0.0357, totalMass: 0.0640,
  },
  "F15": {
    name: "F15 (Estes)",
    avgThrust: 15.0, burnTime: 3.45, totalImpulse: 50.0,
    propellantMass: 0.0600, totalMass: 0.1010,
  },
  "G80": {
    name: "G80 (AeroTech)",
    avgThrust: 80.0, burnTime: 1.25, totalImpulse: 100.0,
    propellantMass: 0.0625, totalMass: 0.1240,
  },
};

export function getMotor(id) {
  return MOTORS[id] ?? MOTORS["C6"];
}

export function motorOptions() {
  return Object.entries(MOTORS).map(([id, m]) => ({ id, label: m.name }));
}

// Instantaneous thrust (N) at time t into the burn.
// Simple model: constant average thrust until burnTime, then zero.
export function thrustAt(motor, t) {
  if (t < 0 || t > motor.burnTime) return 0;
  return motor.avgThrust;
}

// Instantaneous motor mass (kg) at time t: propellant burns off linearly.
export function motorMassAt(motor, t) {
  if (t <= 0) return motor.totalMass;
  if (t >= motor.burnTime) return motor.totalMass - motor.propellantMass;
  const fracBurned = t / motor.burnTime;
  return motor.totalMass - motor.propellantMass * fracBurned;
}
