// ===========================================================================
// scripts/smoke-onshape.mjs - headless validation for the Onshape scaffolding.
//
// Framework-free, DOM-free, NETWORK-free. It imports the pure geometry and
// FeatureScript builders plus the client seam and asserts:
//   - nose profile points are monotonic in x, start at r ~ 0, end at r = R;
//   - body inner diameter < outer diameter;
//   - fin trapezoid has exactly 4 points and the radial pattern angle = 360/count;
//   - the FeatureScript builder returns non-empty strings and objects for every
//     part family;
//   - the OnshapeClient makes NO network call: a method on an unconfigured
//     client throws the documented "not configured" error rather than fetching.
//
// Exits 0 on success, non-zero on the first failed assertion.
//
// Run from the repo root:  node scripts/smoke-onshape.mjs
// ===========================================================================

import {
  createNose,
  createBody,
  createTransition,
  createFins,
  defaultRocket,
} from "../js/rocket.js";
import {
  noseDefinition,
  bodyDefinition,
  transitionDefinition,
  finsDefinition,
  rocketDefinitions,
} from "../js/onshape/geometry.js";
import {
  noseFeatureScript,
  bodyFeatureScript,
  transitionFeatureScript,
  finsFeatureScript,
  rocketFeatureScripts,
} from "../js/onshape/featurescript.js";
import {
  OnshapeClient,
  OnshapeNotConfiguredError,
} from "../js/onshape/client.js";

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    console.error(`  FAIL  ${name}`);
    failures++;
  }
}

console.log("RocketLab Onshape scaffolding smoke test");
console.log("========================================");

// --- Nose profile invariants -------------------------------------------
console.log("\nNose geometry");
const nose = createNose({ length: 0.15, diameter: 0.05, shape: "ogive" });
const noseDef = noseDefinition(nose, 48);
const profile = noseDef.profile;
const R = nose.diameter / 2;

check("nose profile has >= 2 points", profile.length >= 2);

let xMonotonic = true;
for (let i = 1; i < profile.length; i++) {
  if (profile[i].x < profile[i - 1].x) xMonotonic = false;
}
check("nose profile x is non-decreasing (monotonic)", xMonotonic);
check("nose profile starts at r ~ 0", Math.abs(profile[0].r) < 1e-6);
check(
  "nose profile ends at r = R",
  Math.abs(profile[profile.length - 1].r - R) < 1e-6
);
check("nose definition revolves about the x axis", noseDef.revolveAxis === "x");
check("nose definition is shelled inward", noseDef.shellInward === true);
check("nose definition units are meters", noseDef.units === "m");

// --- Body tube invariants ----------------------------------------------
console.log("\nBody geometry");
const body = createBody({ length: 0.3, diameter: 0.05, wallThickness: 0.001 });
const bodyDef = bodyDefinition(body);
check(
  "body innerDiameter < outerDiameter",
  bodyDef.innerDiameter < bodyDef.outerDiameter
);
check("body innerDiameter > 0", bodyDef.innerDiameter > 0);
check(
  "body revolve profile has 4 corner points",
  bodyDef.revolveProfile.length === 4
);

// --- Transition invariants ---------------------------------------------
console.log("\nTransition geometry");
const transition = createTransition({
  length: 0.05,
  frontDiameter: 0.05,
  rearDiameter: 0.08,
});
const trDef = transitionDefinition(transition);
check("transition has a 2-point outer profile", trDef.profile.length === 2);
check(
  "transition profile goes front radius -> rear radius",
  trDef.profile[0].r === transition.frontDiameter / 2 &&
    trDef.profile[1].r === transition.rearDiameter / 2
);

// --- Fin invariants ----------------------------------------------------
console.log("\nFin geometry");
const fins = createFins({ count: 4, rootChord: 0.08, tipChord: 0.04, span: 0.05, sweep: 0.04 });
const finDef = finsDefinition(fins);
check("fin trapezoid has exactly 4 points", finDef.trapezoid.length === 4);
check(
  "fin radial pattern angle = 360 / count",
  Math.abs(finDef.radialPattern.angleDeg - 360 / fins.count) < 1e-9
);
check("fin pattern count matches component count", finDef.radialPattern.count === fins.count);

// --- FeatureScript builders: non-empty strings + objects ---------------
console.log("\nFeatureScript builders");
const builders = [
  ["nose", noseFeatureScript(nose)],
  ["body", bodyFeatureScript(body)],
  ["transition", transitionFeatureScript(transition)],
  ["fins", finsFeatureScript(fins)],
];
for (const [label, fs] of builders) {
  check(`${label} source is a non-empty string`, typeof fs.source === "string" && fs.source.length > 0);
  check(`${label} parameters is a non-empty object`, fs.parameters && typeof fs.parameters === "object");
  check(`${label} source mentions defineFeature`, fs.source.includes("defineFeature"));
}

// Whole-rocket builders work on the default rocket.
const rocket = defaultRocket();
const defs = rocketDefinitions(rocket);
const payloads = rocketFeatureScripts(rocket);
check("rocketDefinitions returns one def per component", defs.length === rocket.components.length);
check("rocketFeatureScripts returns one payload per component", payloads.length === rocket.components.length);

// --- Client seam: NO network call --------------------------------------
console.log("\nClient seam (no network)");
const client = new OnshapeClient(); // no transport injected
check("unconfigured client reports not configured", client.isConfigured() === false);

let threw = false;
let threwRightType = false;
try {
  await client.createDocument("Should not reach the network");
} catch (err) {
  threw = true;
  threwRightType = err instanceof OnshapeNotConfiguredError;
}
check("createDocument throws instead of fetching", threw);
check("createDocument throws the documented not-configured error", threwRightType);

// A method with payload also refuses without a transport.
let featureThrew = false;
try {
  await client.createPartStudioFeature("did", "wid", payloads[0]);
} catch (err) {
  featureThrew = err instanceof OnshapeNotConfiguredError;
}
check("createPartStudioFeature throws not-configured without transport", featureThrew);

// An INJECTED transport is used instead of any real network: prove the seam.
let transportCalled = false;
const mockTransport = async () => {
  transportCalled = true;
  return { id: "mockDoc", defaultWorkspace: "mockWs" };
};
const configured = new OnshapeClient({ transport: mockTransport });
check("client with transport reports configured", configured.isConfigured() === true);
const doc = await configured.createDocument("mock");
check("injected transport is used (no real network)", transportCalled && doc.id === "mockDoc");

// --- Result ------------------------------------------------------------
if (failures > 0) {
  console.error(`\nFAIL: ${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nPASS: all Onshape scaffolding assertions passed (no network, no DOM).");
process.exit(0);
