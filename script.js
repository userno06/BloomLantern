/* =========================================================================
   BLOOM LANTERN — cozy 3D
   A glass lantern full of tulips, sitting in a firefly garden.

   Sections
     1. Helpers, device tier & quality settings
     2. Renderer, scene, camera
     3. Environment + lights (the cozy part)
     4. Lantern, tulips, ground, grass
     5. Particles: fireflies, dust motes, sparks, bokeh, stars
     6. Post-processing (bloom)
     7. Controls, responsive framing, interaction
     8. Animation loop
   ========================================================================= */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { MusicPlayer, GENERATED_TRACKS, initMusicUI } from "./music.js";

/* ---------- 1. Helpers, device tier, quality ---------- */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const container = document.getElementById("canvas-wrap");
const loading = document.getElementById("loading");
const loadingText = loading.querySelector(".loading-text");
const resetButton = document.getElementById("reset");
const introEl = document.querySelector(".intro");
const topbarEl = document.querySelector(".topbar");
const bottomEl = document.querySelector(".bottom-info");
const hintEl = document.getElementById("gesture-hint");

const isTouch = matchMedia("(pointer: coarse)").matches;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const shortSide = Math.min(screen.width, screen.height);
const tier = !isTouch ? "desktop" : shortSide >= 700 ? "tablet" : "phone";

// Everything that costs GPU time is scaled here. Tweak freely.
const QUALITY = {
  desktop: { dpr: 2,    msaa: 4, bloom: 0.72, bloomScale: 1,    seg: [16, 12], grass: 3400, fireflies: 64, inner: 16, motes: 230, innerMotes: 70, bokeh: 22, stars: 170, sizeMul: 1 },
  tablet:  { dpr: 1.5,  msaa: 2, bloom: 0.64, bloomScale: 0.6,  seg: [14, 10], grass: 2000, fireflies: 46, inner: 14, motes: 150, innerMotes: 50, bokeh: 14, stars: 120, sizeMul: 1.15 },
  phone:   { dpr: 1.5,  msaa: 0, bloom: 0.56, bloomScale: 0.5,  seg: [12, 8],  grass: 1000, fireflies: 30, inner: 10, motes: 80,  innerMotes: 30, bokeh: 8,  stars: 70,  sizeMul: 1.3 }
};
const Q = QUALITY[tier];

// Your own songs: drop audio files into a "music" folder next to index.html and list them here, e.g.
//   { title: "Rainy Window", src: "music/rainy-window.mp3" }
// (Visitors can also add songs from their own device with the + button in the player.)
const MUSIC_FILES = [];

// Scene layout constants
const LANTERN_Y = 0.45;                                   // lantern group height (sits on the stone slab)
const WISP = new THREE.Vector3(0, LANTERN_Y + 3.95, 0);  // the glowing heart of the lantern
const TARGET = new THREE.Vector3(0, 3.35, 0);            // what the camera looks at
const HOME_AZIMUTH = 0.62;
const HOME_POLAR = THREE.MathUtils.degToRad(78);
const OBJ_H = 7.7;                                       // world size we want to keep in frame
const OBJ_W = 6.9;

/* ---------- 2. Renderer, scene, camera ---------- */

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    antialias: false, // MSAA happens in the post-processing target instead
    alpha: false,
    stencil: false,
    powerPreference: isTouch ? "default" : "high-performance"
  });
} catch (err) {
  loadingText.textContent = "THIS SCENE NEEDS WEBGL — TRY A NEWER BROWSER";
  throw err;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

const FOG_COLOR = new THREE.Color(0x261a10); // warm dusk brown, matches the sky horizon
const scene = new THREE.Scene();
scene.background = FOG_COLOR;
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.04);

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 400);
camera.position.set(8, 5, 12);

// Uniforms shared by every particle material
const U = {
  uScale: { value: 1000 }, // pixels per world unit at distance 1 (updated on resize)
  uGain: { value: 0 }      // global brightness (intro fade + click flare)
};

/* ---------- 3. Environment + lights ---------- */

// Tiny procedural "room" used only for reflections on the brass frame and glass.
function buildEnvironment() {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(
    new THREE.BoxGeometry(40, 24, 40),
    new THREE.MeshBasicMaterial({ color: 0x0d0c0a, side: THREE.BackSide })
  ));
  const panel = (hex, k, w, h, x, y, z) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide })
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(0xffa860, 7, 9, 3, 12, 3, 8);     // warm lamp
  panel(0xffc48a, 5, 7, 3, -11, 2, 9);    // warm lamp
  panel(0xff9a50, 4, 10, 2.5, 2, 1.5, -14); // warm glow behind
  panel(0x7fa0c8, 3, 14, 4, -6, 14, -6);  // cool moon skylight
  const tex = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();
  return tex;
}
scene.environment = buildEnvironment();
scene.environmentIntensity = 0.55;

// Ambient: cool sky, warm ground bounce
const hemi = new THREE.HemisphereLight(0x7f98a0, 0x3a2414, 0.55);
scene.add(hemi);

// The lantern's flame. Inverse (not inverse-square) falloff keeps nearby petals from blowing out.
const mainLight = new THREE.PointLight(0xffa64d, 6.5, 18, 1);
mainLight.position.copy(WISP);
scene.add(mainLight);

// Low warm fill from among the stems, so petals glow from underneath too.
const fillLight = new THREE.PointLight(0xff8a3d, 3.2, 8, 1);
fillLight.position.set(0, LANTERN_Y + 1.35, 0);
scene.add(fillLight);

// Cool moonlight rim: warm inside, cool outside = cozy contrast.
const moon = new THREE.DirectionalLight(0x8fb0d8, 1.1);
moon.position.set(-9, 12, -8);
scene.add(moon);

/* ---------- Glow textures ---------- */

function radialTexture(stops, size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const glowTex = radialTexture([
  [0, "rgba(255,255,255,1)"],
  [0.2, "rgba(255,255,255,.5)"],
  [0.5, "rgba(255,255,255,.13)"],
  [1, "rgba(255,255,255,0)"]
]);

const bokehTex = radialTexture([
  [0, "rgba(255,255,255,.32)"],
  [0.7, "rgba(255,255,255,.42)"],
  [0.88, "rgba(255,255,255,.85)"],
  [0.97, "rgba(255,255,255,.22)"],
  [1, "rgba(255,255,255,0)"]
], 128);

function glowSprite(color, scale, opacity, depthTest = true) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest,
    fog: false
  }));
  s.scale.setScalar(scale);
  return s;
}

// Glow around and inside the lantern
const haloBig = glowSprite(0xff9a3d, 11, 0.17);
haloBig.position.set(0, LANTERN_Y + 3.15, 0);
scene.add(haloBig);

const haloInner = glowSprite(0xffb867, 6.4, 0.2);
haloInner.position.set(0, LANTERN_Y + 3.0, 0);
scene.add(haloInner);

const wispGlow = glowSprite(0xffc27a, 2.9, 0.9);
wispGlow.position.copy(WISP);
scene.add(wispGlow);

const wispCore = new THREE.Mesh(
  new THREE.SphereGeometry(0.15, 24, 16),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe2b4).multiplyScalar(3) })
);
wispCore.position.copy(WISP);
scene.add(wispCore);

// Light spilling onto the garden floor
const poolTex = radialTexture([
  [0, "rgba(255,255,255,1)"],
  [0.25, "rgba(255,255,255,.55)"],
  [0.6, "rgba(255,255,255,.14)"],
  [1, "rgba(255,255,255,0)"]
]);
function lightPool(size, color, opacity) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      map: poolTex,
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.07;
  scene.add(m);
  return m;
}
const poolWide = lightPool(36, 0xff8a35, 0.5);
const poolCore = lightPool(15, 0xffc27a, 0.34);

/* ---------- 4. Lantern, tulips, ground, grass ---------- */

const bronze = new THREE.MeshStandardMaterial({ color: 0x7a6238, roughness: 0.36, metalness: 0.85 });
const darkBronze = new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: 0.38, metalness: 0.8 });
const roofMat = new THREE.MeshStandardMaterial({ color: 0x5a4a34, roughness: 0.34, metalness: 0.8, side: THREE.DoubleSide });

// Glass: no transmission (cheaper on phones, and the tulips stay crisp).
// depthWrite is OFF so particles inside the lantern stay visible through the panes.
const glass = new THREE.MeshPhysicalMaterial({
  color: 0xdfe6d8,
  roughness: 0.06,
  metalness: 0,
  transparent: true,
  opacity: 0.15,
  ior: 1.5,
  depthWrite: false,
  side: THREE.DoubleSide
});

const warmGlass = new THREE.MeshPhysicalMaterial({
  color: 0xe8b979,
  emissive: 0xffa04a,
  emissiveIntensity: 2.2,
  roughness: 0.25,
  transparent: true,
  opacity: 0.9
});

const stemMat = new THREE.MeshStandardMaterial({ color: 0x506b47, roughness: 0.75 });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x4a6a44, roughness: 0.68, side: THREE.DoubleSide });
const centerMat = new THREE.MeshStandardMaterial({ color: 0x5a392d, roughness: 0.7 });

const tulipMats = [
  new THREE.MeshStandardMaterial({ color: 0xf0c8c8, roughness: 0.45, emissive: 0x8a4a30, emissiveIntensity: 0.2 }),
  new THREE.MeshStandardMaterial({ color: 0xe9b2a8, roughness: 0.45, emissive: 0x8a3f2a, emissiveIntensity: 0.18 }),
  new THREE.MeshStandardMaterial({ color: 0xf0d2b2, roughness: 0.43, emissive: 0x8a5a2c, emissiveIntensity: 0.2 })
];

// Stone slab the lantern rests on (top sits exactly at the lantern's base)
const slab = new THREE.Mesh(
  new THREE.CylinderGeometry(3.7, 3.85, 0.775, 72),
  new THREE.MeshStandardMaterial({ color: 0x4a4236, roughness: 0.92 })
);
slab.position.y = 0.03 + 0.775 / 2;
scene.add(slab);

const moss = new THREE.Mesh(
  new THREE.TorusGeometry(3.66, 0.11, 10, 72),
  new THREE.MeshStandardMaterial({ color: 0x3b5a2c, roughness: 1 })
);
moss.rotation.x = Math.PI / 2;
moss.position.y = 0.8;
scene.add(moss);

const lantern = new THREE.Group();
lantern.position.y = LANTERN_Y;
scene.add(lantern);

// Static frame pieces are collected per material and merged into one mesh each,
// which means far fewer draw calls (a big win on phones).
const frameBuckets = new Map();
function addFrame(geo, material) {
  if (!frameBuckets.has(material)) frameBuckets.set(material, []);
  frameBuckets.get(material).push(geo);
}
function box(w, h, d, material, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  addFrame(g, material);
}

// Glass panels
const panelW = 4.7, panelH = 4.5, panelD = 4.7, panelY = 2.85;
const front = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, 0.045), glass);
front.position.set(0, panelY, panelD / 2);
lantern.add(front);
const back = front.clone();
back.position.z = -panelD / 2;
lantern.add(back);
const left = new THREE.Mesh(new THREE.BoxGeometry(0.045, panelH, panelD), glass);
left.position.set(-panelW / 2, panelY, 0);
lantern.add(left);
const right = left.clone();
right.position.x = panelW / 2;
lantern.add(right);

// Base
box(4.95, 0.34, 4.95, darkBronze, 0, 0.53, 0);
box(4.55, 0.18, 4.55, bronze, 0, 0.74, 0);

// Corner pillars
for (const [x, y, z] of [[-2.4, 2.95, -2.4], [2.4, 2.95, -2.4], [-2.4, 2.95, 2.4], [2.4, 2.95, 2.4]]) {
  box(0.24, 4.75, 0.24, bronze, x, y, z);
  box(0.12, 4.5, 0.12, darkBronze, x, y, z);
}

// Horizontal rails
for (const y of [0.78, 5.03]) {
  box(4.95, 0.18, 0.2, bronze, 0, y, 2.43);
  box(4.95, 0.18, 0.2, bronze, 0, y, -2.43);
  box(0.2, 0.18, 4.95, bronze, 2.43, y, 0);
  box(0.2, 0.18, 4.95, bronze, -2.43, y, 0);
}

// Crown
box(4.9, 0.25, 4.9, darkBronze, 0, 5.15, 0);
box(4.35, 0.22, 4.35, bronze, 0, 5.35, 0);

// Sloped roof
function roofPanel(rotZ, x, z) {
  const g = new THREE.BoxGeometry(2.75, 0.16, 4.65);
  g.rotateZ(rotZ);
  g.translate(x, 5.58, z);
  addFrame(g, roofMat);
}
roofPanel(-0.35, -1.18, 0);
roofPanel(0.35, 1.18, 0);

// Handle
const handleCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-0.75, 5.45, 0),
  new THREE.Vector3(-0.75, 6.15, 0),
  new THREE.Vector3(0, 6.55, 0),
  new THREE.Vector3(0.75, 6.15, 0),
  new THREE.Vector3(0.75, 5.45, 0)
]);
addFrame(new THREE.TubeGeometry(handleCurve, 24, 0.09, 8, false), bronze);

// Little glowing roof beads
for (let i = -2; i <= 2; i++) {
  const g = new THREE.SphereGeometry(0.075, 12, 10);
  g.translate(i * 0.72, 5.72, 0);
  addFrame(g, warmGlass);
}

for (const [material, geos] of frameBuckets) {
  lantern.add(new THREE.Mesh(mergeGeometries(geos, false), material));
  geos.forEach((g) => g.dispose());
}

/* Tulips: one shared, pre-merged geometry per part (stem, leaves, petal cup, centre),
   so every flower is only 4 draw calls. */
const [SEG_W, SEG_H] = Q.seg;

const petalsGeo = (() => {
  const layout = [
    [-0.2, 0, 0.04, -0.32],
    [0.2, 0, 0.04, 0.32],
    [0, 0.1, 0.12, 0],
    [0, -0.02, -0.1, 0]
  ];
  const parts = layout.map(([x, y, z, rz]) => {
    const g = new THREE.SphereGeometry(0.36, SEG_W, SEG_H);
    g.scale(0.72, 1.0, 0.54);
    g.rotateZ(rz);
    g.translate(x, y + 1.25, z);
    return g;
  });
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  return merged;
})();

const centerGeo = (() => {
  const g = new THREE.SphereGeometry(0.11, 10, 8);
  g.scale(1, 0.45, 1);
  g.translate(0, 1.25 + 0.17, 0);
  return g;
})();

const stemGeo = (() => {
  const g = new THREE.CylinderGeometry(0.035, 0.055, 1.25, 7);
  g.rotateZ(0.03);
  g.translate(0, 0.62, 0);
  return g;
})();

const leavesGeo = (() => {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.16, 0.34, 0.04),
    new THREE.Vector3(0.05, 0.75, -0.02),
    new THREE.Vector3(-0.13, 1.0, 0)
  ]);
  const a = new THREE.TubeGeometry(curve, 10, 0.085, 5, false);
  a.scale(1.2, 1, 0.42);
  a.rotateZ(-0.4);
  a.translate(0.04, 0.3, 0.01);
  const b = new THREE.TubeGeometry(curve, 10, 0.085, 5, false);
  b.scale(1.2 * 0.82, 0.82, 0.42 * 0.82);
  b.rotateZ(0.55);
  b.translate(-0.03, 0.22, 0.02);
  const merged = mergeGeometries([a, b], false);
  a.dispose();
  b.dispose();
  return merged;
})();

const sways = []; // flowers that breathe gently in the warm air

function createTulip(scale = 1, materialIndex = 0) {
  const root = new THREE.Group();
  const sway = new THREE.Group();
  root.add(sway);
  sway.add(new THREE.Mesh(stemGeo, stemMat));
  sway.add(new THREE.Mesh(leavesGeo, leafMat));
  sway.add(new THREE.Mesh(petalsGeo, tulipMats[materialIndex % tulipMats.length]));
  sway.add(new THREE.Mesh(centerGeo, centerMat));
  root.scale.setScalar(scale);
  sways.push({ g: sway, p: Math.random() * TAU, a: 0.012 + Math.random() * 0.02 });
  return root;
}

const tulipSpots = [
  [-1.72, 0.83, 1.05, 0.92, 0, -0.05],
  [-0.62, 0.82, 1.38, 1.02, 1, 0.08],
  [0.58, 0.83, 1.32, 0.88, 0, -0.05],
  [1.58, 0.84, 1.02, 1.0, 2, 0.06],
  [-1.28, 0.82, 0.15, 1.05, 1, -0.08],
  [-0.25, 0.81, 0.18, 0.92, 0, 0.04],
  [0.78, 0.82, 0.22, 1.03, 2, -0.04],
  [1.62, 0.82, 0.02, 0.82, 1, 0.05],
  [-1.65, 0.82, -1.15, 0.82, 2, -0.06],
  [-0.7, 0.81, -1.28, 1.0, 0, 0.05],
  [0.35, 0.82, -1.18, 0.87, 1, -0.04],
  [1.34, 0.83, -1.2, 0.96, 0, 0.05],
  [-1.05, 0.83, -2.0, 0.76, 1, 0],
  [0.08, 0.82, -1.92, 0.86, 2, 0],
  [1.02, 0.82, -1.9, 0.78, 0, 0]
];
for (const [x, y, z, s, c, r] of tulipSpots) {
  const t = createTulip(s, c);
  t.position.set(x, y, z);
  t.rotation.y = r + Math.random() * 0.3;
  lantern.add(t);
}
// A few taller flowers rising behind the front row
for (const [x, z, scale, c] of [[-1.8, -0.35, 1.12, 1], [0.02, 0.6, 1.18, 0], [1.7, 0.48, 1.05, 2]]) {
  const t = createTulip(scale, c);
  t.position.set(x, 0.8, z);
  t.rotation.y = Math.random() * Math.PI;
  lantern.add(t);
}

/* Ground */
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(60, 96),
  new THREE.MeshStandardMaterial({ color: 0x1b2015, roughness: 0.95, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0.03;
scene.add(ground);

/* Grass: instanced blades, swaying in the vertex shader and warmed by the lantern + nearby fireflies */
const flyUniform = Array.from({ length: 6 }, () => new THREE.Vector4(0, -10, 0, 0));

const grassUniforms = {
  uTime: { value: 0 },
  uFogDensity: { value: 0.04 },
  uFogColor: { value: FOG_COLOR },
  uGlow: { value: 0 },
  uLightCol: { value: new THREE.Color(0xffb35c) },
  uFly: { value: flyUniform },
  uFlyCol: { value: new THREE.Color(0xd8ff7a) }
};

function makeGrass(count) {
  const blade = new THREE.PlaneGeometry(1, 1, 1, 4);
  blade.translate(0, 0.5, 0);
  const bp = blade.attributes.position;
  for (let i = 0; i < bp.count; i++) bp.setX(i, bp.getX(i) * (1 - bp.getY(i) * 0.88)); // taper to a tip

  const geo = new THREE.InstancedBufferGeometry();
  geo.index = blade.index;
  geo.setAttribute("position", bp);

  const offsets = new Float32Array(count * 3);
  const data = new Float32Array(count * 4);

  const tufts = [];
  for (let i = 0; i < Math.max(8, Math.floor(count / 12)); i++) {
    const a = rand(0, TAU);
    const r = rand(4.2, 15);
    tufts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }

  for (let i = 0; i < count; i++) {
    let x, z;
    if (Math.random() < 0.65) {
      const t = tufts[(Math.random() * tufts.length) | 0];
      x = t[0] + (Math.random() + Math.random() + Math.random() - 1.5) * 0.7;
      z = t[1] + (Math.random() + Math.random() + Math.random() - 1.5) * 0.7;
    } else {
      const a = rand(0, TAU);
      const r = 3.9 + Math.pow(Math.random(), 0.8) * 12;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    }
    const r = Math.hypot(x, z);
    if (r < 3.95) { x *= 3.95 / r; z *= 3.95 / r; } // keep clear of the stone slab
    offsets.set([x, 0.03, z], i * 3);
    data.set([rand(0.55, 1.45), rand(0.8, 1.4), rand(0, Math.PI), Math.random()], i * 4);
  }

  geo.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offsets, 3));
  geo.setAttribute("aData", new THREE.InstancedBufferAttribute(data, 4));
  geo.instanceCount = count;

  const mat = new THREE.ShaderMaterial({
    uniforms: grassUniforms,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec3 aOffset;
      attribute vec4 aData;
      uniform float uTime;
      varying float vH;
      varying vec3 vWorld;
      varying float vDepth;
      void main() {
        float h = position.y;
        vH = h;
        float c = cos(aData.z);
        float s = sin(aData.z);
        vec3 p = position;
        p.x *= 0.075 * aData.y;
        p.y *= 0.5 * aData.x;
        vec3 r = vec3(p.x * c, p.y, -p.x * s);
        float sway = sin(uTime * 1.1 + aOffset.x * 0.6 + aOffset.z * 0.5 + aData.w * 6.283) * 0.5
                   + sin(uTime * 2.1 + aData.w * 20.0) * 0.2;
        r.x += sway * h * h * 0.14 * aData.x;
        r.z += cos(uTime * 0.9 + aOffset.z * 0.7 + aData.w * 6.283) * h * h * 0.09 * aData.x;
        vec3 world = r + aOffset;
        vWorld = world;
        vec4 mv = viewMatrix * vec4(world, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      uniform vec3 uLightCol;
      uniform float uGlow;
      uniform vec4 uFly[6];
      uniform vec3 uFlyCol;
      varying float vH;
      varying vec3 vWorld;
      varying float vDepth;
      void main() {
        vec3 base = mix(vec3(0.010, 0.024, 0.012), vec3(0.06, 0.12, 0.042), vH);
        float d = length(vWorld.xz);
        float broad = exp(-d * d * 0.045);
        float near = exp(-d * d * 0.25);
        vec3 col = base;
        col += uLightCol * (broad * 0.55 + near * 0.5) * uGlow * (0.35 + 0.9 * vH);
        for (int i = 0; i < 6; i++) {
          vec3 dv = vWorld - uFly[i].xyz;
          float fd = dot(dv, dv);
          col += uFlyCol * uFly[i].w * (0.9 / (1.0 + fd * 6.0)) * (0.3 + vH);
        }
        float f = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
        col = mix(col, uFogColor, f);
        gl_FragColor = vec4(col, 1.0);
      }`
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}
makeGrass(Q.grass);

/* Sky: a soft dusk gradient that follows the camera */
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(100, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x0a1216) },
      uMid: { value: new THREE.Color(0x141a17) },
      uHorizon: { value: FOG_COLOR }
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop;
      uniform vec3 uMid;
      uniform vec3 uHorizon;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.3, h));
        col = mix(col, uTop, smoothstep(0.15, 0.8, h));
        gl_FragColor = vec4(col, 1.0);
      }`
  })
);
sky.renderOrder = -10;
sky.frustumCulled = false;
scene.add(sky);

/* Stars */
const starPos = new Float32Array(Q.stars * 3);
for (let i = 0; i < Q.stars; i++) {
  const y = rand(0.1, 1);
  const r = Math.sqrt(1 - y * y);
  const a = rand(0, TAU);
  starPos.set([Math.cos(a) * r * 90, y * 90, Math.sin(a) * r * 90], i * 3);
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
  color: 0xcfd9ff,
  size: 1.5,
  sizeAttenuation: false,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
  fog: false
}));
stars.frustumCulled = false;
scene.add(stars);

/* ---------- 5. Particles ---------- */

const POINT_VS = /* glsl */`
  attribute float aAlpha;
  attribute float aSize;
  attribute float aTint;
  uniform float uScale;
  uniform float uMax;
  varying float vAlpha;
  varying float vTint;
  void main() {
    vAlpha = aAlpha;
    vTint = aTint;
    if (aAlpha < 0.004) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float s = aSize * uScale / max(-mv.z, 0.1);
    gl_PointSize = clamp(s * (0.6 + 0.6 * aAlpha), 1.5, uMax);
  }`;

const POINT_FS = /* glsl */`
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform float uCore;
  uniform float uHalo;
  uniform float uGain;
  uniform float uBright;
  varying float vAlpha;
  varying float vTint;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float halo = pow(1.0 - d, uHalo);
    float core = smoothstep(0.32, 0.0, d);
    vec3 tint = mix(uColA, uColB, vTint);
    vec3 col = tint * halo + mix(tint, vec3(1.0, 0.95, 0.8), 0.6) * core * uCore;
    float a = clamp(halo * 0.8 + core, 0.0, 1.0) * vAlpha * uGain * uBright;
    gl_FragColor = vec4(col, a);
  }`;

// A field of soft glowing points whose positions / alphas we drive from JS each frame.
function makeField(count, { colA, colB, core = 1, halo = 2.4, bright = 1, maxSize = 128 }) {
  const geometry = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const alpha = new Float32Array(count);
  const size = new Float32Array(count);
  const tint = new Float32Array(count);
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aAlpha = new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", aPos);
  geometry.setAttribute("aAlpha", aAlpha);
  geometry.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geometry.setAttribute("aTint", new THREE.BufferAttribute(tint, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uScale: U.uScale,
      uGain: U.uGain,
      uMax: { value: maxSize },
      uCore: { value: core },
      uHalo: { value: halo },
      uBright: { value: bright },
      uColA: { value: new THREE.Color(colA) },
      uColB: { value: new THREE.Color(colB) }
    },
    vertexShader: POINT_VS,
    fragmentShader: POINT_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  return { points, geometry, pos, alpha, size, tint, aPos, aAlpha };
}

/* Fireflies: wander on slow looping paths and blink on their own rhythm */
function makeFireflies(count, cfg) {
  const field = makeField(count, cfg.look);
  const S = [];
  for (let i = 0; i < count; i++) {
    const hero = !cfg.inner && i < 6; // the first six hover low and light up the grass
    let hx, hy, hz;
    if (cfg.inner) {
      hx = rand(-1.35, 1.35);
      hz = rand(-1.35, 1.35);
      hy = rand(1.9, 4.3);
    } else {
      const a = rand(0, TAU);
      const r = hero ? rand(4.8, 8.5) : 4.6 + Math.pow(Math.random(), 0.8) * 10;
      hx = Math.cos(a) * r;
      hz = Math.sin(a) * r;
      hy = hero ? rand(0.45, 1.3) : 0.5 + Math.pow(Math.random(), 1.4) * 4.2;
    }
    const amp = cfg.inner ? rand(0.18, 0.5) : rand(0.6, 1.9);
    S.push({
      hx, hy, hz,
      ax: amp, ay: cfg.inner ? rand(0.15, 0.4) : rand(0.2, 0.7), az: amp * rand(0.8, 1.2),
      fx: rand(0.12, 0.32), fy: rand(0.2, 0.5), fz: rand(0.12, 0.32),
      p: [rand(0, TAU), rand(0, TAU), rand(0, TAU), rand(0, TAU), rand(0, TAU)],
      bs: rand(0.35, 0.95),
      hero
    });
    field.size[i] = rand(cfg.size[0], cfg.size[1]) * Q.sizeMul;
    field.tint[i] = Math.random();
  }

  function update(t) {
    let hi = 0;
    for (let i = 0; i < count; i++) {
      const s = S[i];
      const x = s.hx + s.ax * Math.sin(t * s.fx + s.p[0]) + s.ax * 0.45 * Math.sin(t * s.fx * 2.7 + s.p[1]);
      const z = s.hz + s.az * Math.cos(t * s.fz + s.p[3]) + s.az * 0.45 * Math.sin(t * s.fz * 2.3 + s.p[4]);
      let y = s.hy + s.ay * Math.sin(t * s.fy + s.p[2]);
      if (!cfg.inner) y = Math.max(0.3, y);
      const b = 0.5 + 0.5 * Math.sin(t * s.bs + s.p[0] * 3);
      const g = sstep(0.28, 0.92, b);
      const a = g * (0.86 + 0.14 * Math.sin(t * 7 + s.p[1] * 3));
      field.pos[i * 3] = x;
      field.pos[i * 3 + 1] = y;
      field.pos[i * 3 + 2] = z;
      field.alpha[i] = a;
      if (s.hero && hi < 6) flyUniform[hi++].set(x, y, z, a);
    }
    field.aPos.needsUpdate = true;
    field.aAlpha.needsUpdate = true;
  }
  return { field, update };
}

const outerFlies = makeFireflies(Q.fireflies, {
  inner: false,
  size: [0.2, 0.36],
  look: { colA: 0xffd970, colB: 0xc9ff6e, core: 1.0, halo: 2.3, bright: 1.05 }
});

const innerFlies = makeFireflies(Q.inner, {
  inner: true,
  size: [0.1, 0.19],
  look: { colA: 0xffa94d, colB: 0xffd08a, core: 1.0, halo: 2.4, bright: 1.0 }
});

/* Dust motes: tiny warm specks that drift up through the light */
function makeMotes(count, cfg) {
  const field = makeField(count, cfg.look);
  const S = [];
  for (let i = 0; i < count; i++) {
    let x, z;
    if (cfg.box) {
      x = rand(-cfg.radius, cfg.radius);
      z = rand(-cfg.radius, cfg.radius);
    } else {
      const a = rand(0, TAU);
      const r = Math.sqrt(Math.random()) * cfg.radius;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    }
    S.push({
      x, z,
      y: rand(0, cfg.height),
      v: rand(0.05, 0.16) * cfg.speed,
      a: rand(0.2, 0.7) * cfg.sway,
      fx: rand(0.15, 0.4), fz: rand(0.15, 0.4),
      p: rand(0, TAU), q: rand(0, TAU),
      tw: rand(0.6, 1.8)
    });
    field.size[i] = rand(0.05, 0.11) * cfg.sizeMul * Q.sizeMul;
    field.tint[i] = Math.random();
  }

  function update(t) {
    for (let i = 0; i < count; i++) {
      const s = S[i];
      const u = ((s.y + t * s.v) / cfg.height) % 1;
      const y = cfg.y0 + u * cfg.height;
      const x = s.x + Math.sin(t * s.fx + s.p) * s.a;
      const z = s.z + Math.cos(t * s.fz + s.q) * s.a;
      const edge = Math.sin(u * Math.PI);
      const tw = 0.55 + 0.45 * Math.sin(t * s.tw + s.p * 3);
      const lit = cfg.lit ? cfg.lit(x, y, z) : 1;
      field.pos[i * 3] = x;
      field.pos[i * 3 + 1] = y;
      field.pos[i * 3 + 2] = z;
      field.alpha[i] = edge * tw * lit;
    }
    field.aPos.needsUpdate = true;
    field.aAlpha.needsUpdate = true;
  }
  return { field, update };
}

const outerMotes = makeMotes(Q.motes, {
  radius: 11, height: 9, y0: 0.2, speed: 1, sway: 1, sizeMul: 1,
  look: { colA: 0xffd9a3, colB: 0xfff0d4, core: 0.8, halo: 3.0, bright: 0.75 },
  lit: (x, y, z) => 0.2 + 0.8 * Math.exp(-(x * x + z * z) / 45)
});

const innerMotes = makeMotes(Q.innerMotes, {
  radius: 1.55, height: 3.6, y0: 1.5, box: true, speed: 0.8, sway: 0.5, sizeMul: 0.9,
  look: { colA: 0xffc98a, colB: 0xffe6c0, core: 0.9, halo: 3.0, bright: 0.9 }
});

/* Sparks: little embers released when you tap the lantern */
const SPARK_N = isTouch ? 32 : 48;
const sparks = makeField(SPARK_N, { colA: 0xffb75c, colB: 0xffe3ad, core: 1.1, halo: 2.2, bright: 1.1 });
const sparkState = Array.from({ length: SPARK_N }, () => ({ life: 0, max: 1, vx: 0, vy: 0, vz: 0 }));

function burst(n = 26) {
  let made = 0;
  for (let i = 0; i < SPARK_N && made < n; i++) {
    const s = sparkState[i];
    if (s.life > 0) continue;
    const a = rand(0, TAU);
    const spread = rand(0.2, 1);
    const speed = rand(0.7, 2.0);
    s.life = s.max = rand(1.8, 3.2);
    s.vx = Math.cos(a) * speed * spread;
    s.vz = Math.sin(a) * speed * spread;
    s.vy = rand(0.4, 1.6);
    sparks.pos[i * 3] = WISP.x + Math.cos(a) * 0.1;
    sparks.pos[i * 3 + 1] = WISP.y;
    sparks.pos[i * 3 + 2] = WISP.z + Math.sin(a) * 0.1;
    sparks.size[i] = rand(0.12, 0.24) * Q.sizeMul;
    sparks.tint[i] = Math.random();
    made++;
  }
  sparks.geometry.attributes.aSize.needsUpdate = true;
  sparks.geometry.attributes.aTint.needsUpdate = true;
}

function updateSparks(dt, t) {
  for (let i = 0; i < SPARK_N; i++) {
    const s = sparkState[i];
    if (s.life <= 0) {
      sparks.alpha[i] = 0;
      continue;
    }
    s.life -= dt;
    const k = 1 - s.life / s.max;
    const damp = 1 - 0.5 * dt;
    s.vx *= damp;
    s.vz *= damp;
    s.vy = s.vy * damp + 0.3 * dt;
    sparks.pos[i * 3] += s.vx * dt;
    sparks.pos[i * 3 + 1] += s.vy * dt;
    sparks.pos[i * 3 + 2] += s.vz * dt;
    sparks.alpha[i] = sstep(0, 0.08, k) * (1 - sstep(0.55, 1, k)) * (0.75 + 0.25 * Math.sin(t * 20 + i));
  }
  sparks.aPos.needsUpdate = true;
  sparks.aAlpha.needsUpdate = true;
}

/* Bokeh: big soft out-of-focus lights hanging in the far background.
   They live in camera space (so they never fly past the lens) and slide as you orbit. */
const bokehColors = [0xffb15a, 0xffd08a, 0xf6a96b, 0xb7d67a, 0xffc4a0];
const bokeh = [];
for (let i = 0; i < Q.bokeh; i++) {
  const m = new THREE.SpriteMaterial({
    map: bokehTex,
    color: bokehColors[i % bokehColors.length],
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false
  });
  const sp = new THREE.Sprite(m);
  scene.add(sp);
  bokeh.push({
    sp,
    x: rand(-1.3, 1.3),
    y: rand(-0.3, 1.0),
    par: rand(0.1, 0.45) * (Math.random() < 0.5 ? -1 : 1),
    rel: rand(0.05, 0.15),
    o: rand(0.05, 0.13),
    ph: rand(0, TAU),
    sp2: rand(0.15, 0.4),
    tw: rand(0.3, 0.9)
  });
}

/* ---------- 6. Post-processing ---------- */

const composerTarget = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: Q.msaa });
const composer = new EffectComposer(renderer, composerTarget);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), Q.bloom, 0.7, 0.78);
if (Q.bloomScale < 1) {
  // Bloom is blurry by nature, so running it at reduced resolution is nearly invisible but much cheaper.
  const baseSetSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w, h) => baseSetSize(Math.max(2, Math.round(w * Q.bloomScale)), Math.max(2, Math.round(h * Q.bloomScale)));
}
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ---------- 7. Controls, responsive framing, interaction ---------- */

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minPolarAngle = THREE.MathUtils.degToRad(52);
controls.maxPolarAngle = THREE.MathUtils.degToRad(98);
controls.rotateSpeed = isTouch ? 0.8 : 1;
controls.zoomSpeed = 0.8;
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.65;
controls.target.copy(TARGET);

let W = 1;
let H = 1;
let dpr = Math.min(window.devicePixelRatio || 1, Q.dpr);
let fitDist = 16;
let firstLayout = true;
let introActive = true;
let camAnim = null;
let resumeTimer = 0;

function scheduleAutoRotate(delay = 1800) {
  clearTimeout(resumeTimer);
  if (reduceMotion) return;
  resumeTimer = setTimeout(() => { controls.autoRotate = true; }, delay);
}

function applyRenderSize() {
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  composer.setPixelRatio(dpr);
  composer.setSize(W, H);
  stars.material.size = 1.5 * dpr;
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  U.uScale.value = renderer.domElement.height / (2 * tanHalf);
}

// Work out how far back the camera must sit, and how far to slide the picture,
// so the lantern fits the free area left over after the text and buttons.
function layoutScene() {
  const cr = container.getBoundingClientRect();
  const ir = introEl.getBoundingClientRect();
  const br = bottomEl.getBoundingClientRect();
  const tr = topbarEl.getBoundingClientRect();
  const portrait = W / H < 1.1;

  let x0 = 0;
  let x1 = W;
  let y0 = tr.bottom - cr.top + 4;
  let y1 = br.top - cr.top - 4;

  if (portrait) y0 = Math.max(y0, ir.bottom - cr.top + 6);
  else x0 = Math.max(ir.right - cr.left + 10, 0);

  if (x1 - x0 < W * 0.4) x0 = x1 - W * 0.4;
  if (y1 - y0 < H * 0.3) y0 = Math.max(0, y1 - H * 0.3);

  const rw = Math.max(x1 - x0, 120);
  const rh = Math.max(y1 - y0, 120);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));

  const prevFit = fitDist;
  fitDist = Math.max(OBJ_H / rh, OBJ_W / rw) * (H / (2 * tanHalf)) * 1.04;

  controls.minDistance = fitDist * 0.55;
  controls.maxDistance = fitDist * 1.5;

  if (firstLayout) {
    firstLayout = false;
    const sph = new THREE.Spherical(fitDist * 1.22, HOME_POLAR, HOME_AZIMUTH);
    camera.position.setFromSpherical(sph).add(controls.target);
  } else {
    // Keep the user's viewing angle and zoom level, just re-fit for the new window
    const off = camera.position.clone().sub(controls.target);
    const zoom = off.length() / prevFit;
    off.setLength(fitDist * zoom);
    camera.position.copy(controls.target).add(off);
  }

  const dx = (x0 + x1) / 2 - W / 2;
  const dy = (y0 + y1) / 2 - H / 2;
  camera.aspect = W / H;
  camera.setViewOffset(W, H, -dx, -dy, W, H);
  camera.updateProjectionMatrix();
  controls.update();
}

function onResize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (!w || !h) return;
  const changed = w !== W || h !== H;
  W = w;
  H = h;
  if (changed) applyRenderSize(); // re-allocating render targets is expensive, so only when needed
  layoutScene();
}

// Mobile browsers fire many resizes while the address bar slides in and out; wait for them to settle.
let resizeTimer = 0;
function onResizeSoon() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(onResize, 90);
}
onResize();
new ResizeObserver(onResizeSoon).observe(container);
window.addEventListener("orientationchange", () => setTimeout(onResize, 250));
if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize);

// Smooth "reset view"
function goHome(duration = 1100) {
  const off = camera.position.clone().sub(controls.target);
  const from = new THREE.Spherical().setFromVector3(off);
  camAnim = {
    start: performance.now(),
    dur: duration,
    from,
    dTheta: wrapAngle(HOME_AZIMUTH - from.theta),
    toPhi: HOME_POLAR,
    toR: fitDist
  };
  controls.autoRotate = false;
  clearTimeout(resumeTimer);
  introActive = false;
}
resetButton.addEventListener("click", () => goHome());

// Hints
function showHint() {
  hintEl.textContent = isTouch
    ? "Drag to look around · pinch to zoom · tap for a spark"
    : "Drag to look around · scroll to zoom · click for a spark";
  hintEl.classList.add("show");
  hintTimer = setTimeout(hideHint, 9000);
}
let hintTimer = 0;
function hideHint() {
  clearTimeout(hintTimer);
  hintEl.classList.remove("show");
}

controls.addEventListener("start", () => {
  controls.autoRotate = false;
  camAnim = null;
  introActive = false;
  clearTimeout(resumeTimer);
  hideHint();
});
controls.addEventListener("end", () => scheduleAutoRotate());

// Tap / click (without dragging) makes the lantern flare and release sparks
let flare = 0;
const activePointers = new Set();
let tap = null;

container.addEventListener("pointerdown", (e) => {
  activePointers.add(e.pointerId);
  tap = activePointers.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
});
container.addEventListener("pointerup", (e) => {
  activePointers.delete(e.pointerId);
  if (tap && activePointers.size === 0) {
    const moved = Math.hypot(e.clientX - tap.x, e.clientY - tap.y);
    if (moved < 10 && performance.now() - tap.t < 450) {
      flare = 1;
      burst(isTouch ? 18 : 26);
    }
  }
  tap = null;
});
container.addEventListener("pointercancel", (e) => {
  activePointers.delete(e.pointerId);
  tap = null;
});

// Music: ambient tracks composed live in the browser, plus your own songs
const music = new MusicPlayer({ tracks: GENERATED_TRACKS, files: MUSIC_FILES });
initMusicUI(music);
music.onStart = () => { flare = Math.max(flare, 0.5); }; // a little warm flare when the music begins

// Stop iOS Safari from pinch-zooming the whole page while you pinch the lantern
document.addEventListener("gesturestart", (e) => e.preventDefault());

// Keyboard: arrows to look around, +/- to zoom, R to reset
function nudge(dTheta, dPhi, dZoom = 1) {
  const off = camera.position.clone().sub(controls.target);
  const s = new THREE.Spherical().setFromVector3(off);
  s.theta += dTheta;
  s.phi = clamp(s.phi + dPhi, controls.minPolarAngle, controls.maxPolarAngle);
  s.radius = clamp(s.radius * dZoom, controls.minDistance, controls.maxDistance);
  camera.position.setFromSpherical(s).add(controls.target);
  controls.autoRotate = false;
  introActive = false;
  camAnim = null;
  scheduleAutoRotate(2500);
  hideHint();
}
window.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target && e.target.tagName === "INPUT") return; // let the volume slider use its own arrow keys
  switch (e.key) {
    case "ArrowLeft": nudge(-0.14, 0); break;
    case "ArrowRight": nudge(0.14, 0); break;
    case "ArrowUp": nudge(0, -0.06); break;
    case "ArrowDown": nudge(0, 0.06); break;
    case "+": case "=": nudge(0, 0, 0.92); break;
    case "-": case "_": nudge(0, 0, 1.08); break;
    case "r": case "R": goHome(); break;
    case "m": case "M": music.toggle(); break;
    default: return;
  }
});

/* ---------- 8. Animation loop ---------- */

const INTRO_DELAY = 0.45;  // seconds before the lantern "lights up"
const INTRO_DUR = 3.4;
const timeScale = reduceMotion ? 0.35 : 1;
const flickerAmt = reduceMotion ? 0.35 : 1;

// Candle-like breathing: a few slow sines layered together.
function candle(t) {
  const n =
    Math.sin(t * 1.3) * 0.035 +
    Math.sin(t * 3.1 + 1.7) * 0.03 +
    Math.sin(t * 7.7 + 0.6) * 0.02 +
    Math.sin(t * 13.3) * 0.01 * Math.sin(t * 0.9);
  return 1 + n * flickerAmt;
}

const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
const sphTmp = new THREE.Spherical();
const fwd = new THREE.Vector3();
const rightV = new THREE.Vector3();
const upV = new THREE.Vector3();

let real = 0;
let time = 0;
let ready = false;
let azAcc = 0;
let lastAz = 0;
const perf = { acc: 0, n: 0, slow: 0 };
let thinned = false;

// If a device is struggling, step down quietly: resolution -> bloom -> particle count.
function degrade() {
  const floor = isTouch ? 1.25 : 1;
  if (dpr > floor) {
    dpr = Math.max(floor, dpr - 0.25);
    applyRenderSize();
  } else if (bloom.enabled) {
    bloom.enabled = false;
  } else if (!thinned) {
    thinned = true;
    outerFlies.field.geometry.setDrawRange(0, Math.ceil(Q.fireflies * 0.6));
    outerMotes.field.geometry.setDrawRange(0, Math.ceil(Q.motes * 0.5));
    innerMotes.field.geometry.setDrawRange(0, Math.ceil(Q.innerMotes * 0.5));
  }
}

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  real += dt;
  time += dt * timeScale;

  /* Lights come up slowly on load, breathe like a candle, and flare when tapped */
  const lit = easeOutCubic(clamp((real - INTRO_DELAY) / INTRO_DUR, 0, 1));
  flare *= Math.exp(-dt * 1.6);
  const breath = candle(time);
  const mLevel = music.getLevel(); // 0..1, how loud the music is right now
  const glow = lit * breath * (1 + flare * 0.6 + mLevel * 0.25);

  mainLight.intensity = 6.5 * glow;
  fillLight.intensity = 3.2 * lit * (0.5 + 0.5 * breath) * (1 + flare * 0.5);
  hemi.intensity = 0.55 * (0.35 + 0.65 * lit);
  moon.intensity = 1.1 * (0.4 + 0.6 * lit);

  const bob = Math.sin(time * 0.9) * 0.06;
  mainLight.position.y = WISP.y + bob;
  wispCore.position.y = WISP.y + bob;
  wispGlow.position.y = WISP.y + bob;
  wispCore.scale.setScalar(0.9 + 0.2 * glow);
  wispGlow.material.opacity = clamp(0.72 * glow, 0, 1);
  haloInner.material.opacity = 0.2 * glow;
  haloBig.material.opacity = 0.17 * glow;
  poolWide.material.opacity = 0.5 * glow;
  poolCore.material.opacity = 0.34 * glow;

  U.uGain.value = lit * (1 + flare * 0.5 + mLevel * 0.2);
  grassUniforms.uGlow.value = glow;
  grassUniforms.uTime.value = time;
  bloom.strength = Q.bloom * (0.5 + 0.5 * lit) + flare * 0.35 + mLevel * 0.12;

  // Gentle tulip sway
  for (const s of sways) {
    s.g.rotation.z = Math.sin(time * 0.7 + s.p) * s.a;
    s.g.rotation.x = Math.cos(time * 0.55 + s.p * 1.3) * s.a * 0.7;
  }

  /* Particles */
  outerFlies.update(time);
  innerFlies.update(time);
  outerMotes.update(time);
  innerMotes.update(time);
  updateSparks(dt, time);
  stars.material.opacity = 0.42 + 0.1 * Math.sin(time * 0.4);

  /* Camera: intro dolly, reset animation, auto-rotate */
  if (camAnim) {
    const k = clamp((performance.now() - camAnim.start) / camAnim.dur, 0, 1);
    const e = easeInOutCubic(k);
    sphTmp.set(
      lerp(camAnim.from.radius, camAnim.toR, e),
      lerp(camAnim.from.phi, camAnim.toPhi, e),
      camAnim.from.theta + camAnim.dTheta * e
    );
    camera.position.setFromSpherical(sphTmp).add(controls.target);
    if (k >= 1) {
      camAnim = null;
      scheduleAutoRotate(1200);
    }
  } else if (introActive) {
    const k = clamp((real - INTRO_DELAY) / INTRO_DUR, 0, 1);
    tmp.copy(camera.position).sub(controls.target);
    tmp.setLength(fitDist * (1 + 0.22 * (1 - easeOutCubic(k))));
    camera.position.copy(controls.target).add(tmp);
    if (k >= 1) introActive = false;
  }

  controls.update();

  // Fog scales with camera distance so phones (camera further back) stay just as clear
  const dist = camera.position.distanceTo(controls.target);
  const fogD = clamp(0.5 / dist, 0.02, 0.06);
  scene.fog.density = fogD;
  grassUniforms.uFogDensity.value = fogD;

  sky.position.copy(camera.position);
  stars.position.copy(camera.position);

  /* Bokeh lives in camera space */
  const az = controls.getAzimuthalAngle();
  azAcc += wrapAngle(az - lastAz);
  lastAz = az;
  camera.updateMatrixWorld();
  fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  rightV.set(1, 0, 0).applyQuaternion(camera.quaternion);
  upV.set(0, 1, 0).applyQuaternion(camera.quaternion);
  const D = 60;
  const halfH = D * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const halfW = halfH * camera.aspect;
  for (const b of bokeh) {
    let x = b.x + azAcc * b.par;
    x = ((((x + 1.35) % 2.7) + 2.7) % 2.7) - 1.35;
    const y = b.y + Math.sin(time * b.sp2 + b.ph) * 0.025;
    b.sp.position.copy(camera.position)
      .addScaledVector(fwd, D)
      .addScaledVector(rightV, x * halfW)
      .addScaledVector(upV, y * halfH);
    b.sp.scale.setScalar(b.rel * halfH * 2);
    const edge = 1 - sstep(1.0, 1.35, Math.abs(x));
    b.sp.material.opacity = b.o * (0.65 + 0.35 * Math.sin(time * b.tw + b.ph)) * edge * lit;
  }

  composer.render();

  /* First frame is on screen: fade the loader, then show the hint */
  if (!ready && real > 0.5) {
    ready = true;
    window.__lanternReady = true;
    loading.classList.add("hide");
    setTimeout(showHint, 3200);
  }

  /* Watch the frame rate; two slow windows in a row trigger one step down (never back up) */
  if (real > 3.5) {
    perf.acc += dt;
    perf.n++;
    if (perf.acc > 1.5) {
      const fps = perf.n / perf.acc;
      perf.slow = fps < 26 ? perf.slow + 1 : 0;
      if (perf.slow >= 2) {
        degrade();
        perf.slow = 0;
      }
      perf.acc = 0;
      perf.n = 0;
    }
  }
}
animate();
