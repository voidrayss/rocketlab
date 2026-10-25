import { importedPoint } from "./imported.js";
// ===========================================================================
// viewer3d.js - the interactive 3D view of the rocket.
//
// This is the ONLY module that imports Three.js. It is loaded lazily by
// main.js in the browser and is NEVER imported by the pure-logic path
// (rocket.js, aero.js, motors.js, physics.js, analysis.js) that Node runs
// headlessly. Three.js is resolved at runtime from a CDN through the
// importmap declared in index.html, so this view needs internet access to
// load. The 2D Canvas builder stays available offline as a fallback.
//
// We build the rocket as a surface of revolution:
//   - nose      -> LatheGeometry fed by noseConeProfile() from rocket.js
//   - body      -> CylinderGeometry (constant radius tube)
//   - transition-> CylinderGeometry frustum (different top/bottom radii)
//   - fins      -> an extruded trapezoid, instanced `count` times evenly
//                  around the body
//
// Components are positioned along the axis using layoutPositions() from
// rocket.js so the 3D layout matches the 2D drawing exactly.
// ===========================================================================

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import {
  COMPONENT_TYPES,
  noseConeProfile,
  layoutPositions,
  totalLength,
  maxBodyDiameter,
} from "./rocket.js";

// Palette matched to the 2D view / dark theme.
const COLORS = {
  nose: 0xff9166, // nose accent (orange)
  body: 0xc9d4e0, // body light grey
  transition: 0xc9d4e0,
  fins: 0x4da3ff, // fins blue
  background: 0x0e1116,
  grid: 0x2a333f,
  gridCenter: 0x3a4555,
};

export class Viewer3D {
  // container: the DOM element the renderer canvas is appended into.
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.rocketGroup = null;
    this.rafId = null;      // active requestAnimationFrame handle
    this.running = false;   // guards against multiple RAF loops
    this.initialized = false;
    this.lastRocket = null; // remember the model so start() can draw it
    this._animate = this._animate.bind(this);
  }

  // Lazily build the scene the first time the 3D view is shown. Kept out of
  // the constructor so no WebGL context is created until the user needs it.
  init() {
    if (this.initialized) return;

    const width = this.container.clientWidth || 400;
    const height = this.container.clientHeight || 640;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.background);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
    this.camera.position.set(0.6, 0.3, 0.9);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setSize(width, height);
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);

    // Lighting: a soft ambient fill plus a directional key light.
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(1, 1.5, 1);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(-1, 0.5, -1);
    this.scene.add(fill);

    // Ground grid for orientation.
    this.grid = new THREE.GridHelper(2, 20, COLORS.gridCenter, COLORS.grid);
    this.scene.add(this.grid);

    this.rocketGroup = new THREE.Group();
    this.scene.add(this.rocketGroup);

    window.addEventListener("resize", () => this.resize());

    this.initialized = true;
  }

  // Rebuild the rocket meshes from the current model. Safe to call before the
  // view is shown; it just stores the model until init()/start() run.
  render(rocket) {
    this.lastRocket = rocket;
    if (!this.initialized) return;
    this._rebuild(rocket);
  }

  _rebuild(rocket) {
    // Clear the previous rocket meshes.
    this._clearGroup(this.rocketGroup);
    if (!rocket || !rocket.components || rocket.components.length === 0) return;

    const pos = layoutPositions(rocket);
    const maxD = maxBodyDiameter(rocket);
    const L = totalLength(rocket) || 0.5;

    for (const c of rocket.components) {
      const x0 = pos.get(c.id) ?? 0;
      let mesh = null;

      if (c.type === "imported") {
        const positions = [];
        const data = c.cad.mesh;
        for (let i=0; i<data.positions.length; i+=3) {
          const [axial,rx,ry] = importedPoint(c,data.positions.slice(i,i+3));
          positions.push(rx,-(x0+axial),ry);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
        geometry.setIndex(data.indices); geometry.computeVertexNormals();
        mesh = new THREE.Mesh(geometry,this._material(0x8bd3b0));
      } else if (c.type === COMPONENT_TYPES.NOSE) {
        mesh = this._buildNose(c);
      } else if (c.type === COMPONENT_TYPES.BODY) {
        mesh = this._buildBody(c);
      } else if (c.type === COMPONENT_TYPES.TRANSITION) {
        mesh = this._buildTransition(c);
      } else if (c.type === "finCan" || c.type === "ring") {
        mesh = new THREE.Group();
        const shape = new THREE.Shape();
        shape.absarc(0, 0, c.diameter / 2, 0, Math.PI * 2, false);
        const hole = new THREE.Path();
        hole.absarc(0, 0, c.innerDiameter / 2, 0, Math.PI * 2, true);
        shape.holes.push(hole);
        const sleeve = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: c.length, bevelEnabled: false, curveSegments: 48 }), this._material(COLORS.fins));
        sleeve.rotation.x = Math.PI / 2;
        sleeve.position.y = -x0;
        mesh.add(sleeve);
        if (c.type === "finCan") mesh.add(this._buildFins(c, c.diameter, x0 + c.length - c.rootChord));
      } else if (c.type === COMPONENT_TYPES.FINS) {
        mesh = this._buildFins(c, maxD, x0);
      }

      if (mesh) this.rocketGroup.add(mesh);
    }

    // Center the rocket on the grid: our model runs along +Y from the nose
    // tip (y = 0) downward. Shift so the body midpoint sits at the origin and
    // the nose points up.
    this.rocketGroup.position.set(0, L / 2, 0);

    // Frame the camera to the rocket size the first time we draw something.
    this._frameCamera(L, maxD);
  }

  // --- Component mesh builders -----------------------------------------
  // The model's axis is X (nose tip at x = 0 growing down). In the 3D scene
  // we lay the rocket out along Y, nose tip at the top, so we convert each
  // component's axial position x into a Y offset of -x (down from the tip).

  _buildNose(c) {
    // Revolve the nose profile. noseConeProfile returns {x, r} from tip to
    // base; LatheGeometry revolves a set of 2D points (x = radius, y = height)
    // around the Y axis.
    const profile = noseConeProfile(c, 32);
    const points = profile.map((p) => new THREE.Vector2(Math.max(p.r, 1e-5), -p.x));
    const geo = new THREE.LatheGeometry(points, 48);
    const mat = this._material(COLORS.nose);
    return new THREE.Mesh(geo, mat);
  }

  _buildBody(c) {
    const r = c.diameter / 2;
    const geo = new THREE.CylinderGeometry(r, r, c.length, 48, 1, true);
    const mat = this._material(COLORS.body);
    const mesh = new THREE.Mesh(geo, mat);
    // Cylinder is centered on its own origin; shift so its top sits at the
    // start of this component.
    const x0 = this._axialStart(c);
    mesh.position.y = -(x0 + c.length / 2);
    return mesh;
  }

  _buildTransition(c) {
    const rTop = c.frontDiameter / 2;
    const rBot = c.rearDiameter / 2;
    const geo = new THREE.CylinderGeometry(rTop, rBot, c.length, 48, 1, true);
    const mat = this._material(COLORS.transition);
    const mesh = new THREE.Mesh(geo, mat);
    const x0 = this._axialStart(c);
    mesh.position.y = -(x0 + c.length / 2);
    return mesh;
  }

  _buildFins(c, maxD, x0) {
    const group = new THREE.Group();
    const bodyR = maxD / 2;

    // Build one flat fin in the XY plane as a trapezoid, then extrude it a
    // little for thickness. Coordinates: local u runs along the chord
    // (axial), v runs along the span (radial out from the body).
    const shape = new THREE.Shape();
    const root = c.rootChord;
    const tip = c.tipChord;
    const span = c.span;
    const sweep = c.sweep;

    // Leading edge at u = 0 at root; sweep pushes the tip leading edge back.
    shape.moveTo(0, 0);              // root leading edge
    shape.lineTo(sweep, span);       // tip leading edge
    shape.lineTo(sweep + tip, span); // tip trailing edge
    shape.lineTo(root, 0);           // root trailing edge
    shape.closePath();

    const extrude = new THREE.ExtrudeGeometry(shape, {
      depth: c.thickness,
      bevelEnabled: false,
    });
    // Center the thickness around 0 so the fin sits flat on the body surface.
    extrude.translate(0, 0, -c.thickness / 2);

    const mat = this._material(COLORS.fins);
    const count = Math.max(1, Math.round(c.count || 3));

    for (let i = 0; i < count; i++) {
      const fin = new THREE.Mesh(extrude, mat);
      // Orient the fin: chord along -Y (down the body), span along +X out
      // from the surface. The shape was built in XY (u=x chord, v=y span),
      // so rotate it into place.
      const pivot = new THREE.Group();

      // Move the flat fin so its root sits at the body radius and its chord
      // runs down the body from x0.
      fin.rotation.z = -Math.PI / 2; // chord (u) now points down -Y
      fin.position.set(bodyR, -x0, 0);

      pivot.add(fin);
      // Rotate each fin evenly around the body axis (Y).
      pivot.rotation.y = (i / count) * Math.PI * 2;
      group.add(pivot);
    }

    return group;
  }

  // Axial start (x from nose tip) for body/transition components, looked up
  // from the stored model so meshes line up with the 2D layout.
  _axialStart(c) {
    if (!this.lastRocket) return 0;
    const pos = layoutPositions(this.lastRocket);
    return pos.get(c.id) ?? 0;
  }

  _material(color) {
    return new THREE.MeshStandardMaterial({
      color,
      metalness: 0.1,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
  }

  // Display tessellation produced from a genuine B-rep, in an isolated CAD view.
  renderCAD(data, properties) {
    this.init();
    this.lastRocket = null;
    this._clearGroup(this.rocketGroup);
    const positions = [];
    for (let i = 0; i < data.positions.length; i += 3) {
      positions.push(data.positions[i] / 1000, -data.positions[i + 2] / 1000, data.positions[i + 1] / 1000);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    this.rocketGroup.add(new THREE.Mesh(geometry, this._material(COLORS.fins)));
    const [lo, hi] = properties.boundsMm;
    this.rocketGroup.position.set(-(lo[0]+hi[0])/2000, (lo[2]+hi[2])/2000, -(lo[1]+hi[1])/2000);
    const size = Math.max(...hi.map((v,i)=>(v-lo[i])/1000));
    this._frameCamera(size, size / 4);
    this.start();
  }

  // --- Animation loop ---------------------------------------------------
  // Start the RAF loop only when the 3D view is shown. The `running` guard
  // ensures we never stack multiple loops if start() is called repeatedly.
  start() {
    this.init();
    if (this.lastRocket) this._rebuild(this.lastRocket);
    this.resize();
    if (this.running) return;
    this.running = true;
    this._animate();
  }

  // Pause the loop when the 3D view is hidden to avoid wasting cycles.
  stop() {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  _animate() {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this._animate);
    if (this.controls) this.controls.update();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  resize() {
    if (!this.initialized) return;
    const width = this.container.clientWidth || 400;
    const height = this.container.clientHeight || 640;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  // --- Helpers ----------------------------------------------------------
  _frameCamera(L, maxD) {
    // Point the camera at the rocket center with a sensible standoff distance.
    const span = Math.max(L, maxD * 4);
    this.camera.position.set(span * 0.9, span * 0.25, span * 1.1);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  _clearGroup(group) {
    if (!group) return;
    for (let i = group.children.length - 1; i >= 0; i--) {
      const child = group.children[i];
      this._clearGroup(child); // recurse into nested groups (fins)
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      group.remove(child);
    }
  }
}
