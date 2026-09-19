import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js";
import * as BufferGeometryUtils from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/utils/BufferGeometryUtils.js";

const container = document.getElementById("canvas-wrap");
const loading = document.getElementById("loading");
const resetButton = document.getElementById("reset");
const musicToggle = document.getElementById("music-toggle");
const musicPlayer = document.querySelector(".music-player");
const volumeControl = document.getElementById("music-volume");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// A coarse pointer (touch) or a small viewport means a phone/tablet-class GPU —
// dial back the most expensive rendering features there so the scene stays smooth.
const lowPower = window.matchMedia("(pointer: coarse)").matches || innerWidth < 800;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0c08);
scene.fog = new THREE.FogExp2(0x0a0c08, 0.043);

const camera = new THREE.PerspectiveCamera(33, innerWidth / innerHeight, 0.1, 100);
camera.position.set(7.5, 4.5, 10.5);

const renderer = new THREE.WebGLRenderer({
  antialias: !lowPower,
  alpha: true,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
container.appendChild(renderer.domElement);

function mat(color, roughness = .5, metalness = 0, transmission = 0, opacity = 1) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness,
    transmission,
    transparent: opacity < 1 || transmission > 0,
    opacity,
    thickness: transmission ? .12 : 0,
    side: THREE.DoubleSide
  });
}

const bronze = new THREE.MeshStandardMaterial({
  color: 0x5c5141,
  roughness: .3,
  metalness: .78
});

const darkBronze = new THREE.MeshStandardMaterial({
  color: 0x302d25,
  roughness: .32,
  metalness: .72
});

// Glass "transmission" (true refraction) needs an extra render pass that's costly on
// phone GPUs. On low-power devices we fall back to a slightly denser tinted glass
// with no transmission — it reads almost identically but is far cheaper to draw.
const glass = new THREE.MeshPhysicalMaterial({
  color: 0xc7d0c0,
  roughness: .12,
  metalness: .05,
  transmission: lowPower ? 0 : .62,
  transparent: true,
  opacity: lowPower ? .34 : .25,
  thickness: .16,
  ior: 1.45,
  side: THREE.DoubleSide
});

const warmGlass = new THREE.MeshPhysicalMaterial({
  color: 0xe8b979,
  emissive: 0xc77e35,
  emissiveIntensity: 1.4,
  roughness: .25,
  transmission: lowPower ? 0 : .18,
  transparent: true,
  opacity: lowPower ? .87 : .78,
  side: THREE.DoubleSide
});

const stemMat = new THREE.MeshStandardMaterial({
  color: 0x506347,
  roughness: .75
});

const leafMat = new THREE.MeshStandardMaterial({
  color: 0x43583f,
  roughness: .68,
  side: THREE.DoubleSide
});

const centerMat = new THREE.MeshStandardMaterial({ color: 0x5a392d, roughness: .7 });

const tulipMats = [
  new THREE.MeshStandardMaterial({ color: 0xf5cbc5, roughness: .42, emissive: 0x6a3634, emissiveIntensity: .17 }),
  new THREE.MeshStandardMaterial({ color: 0xeeb49f, roughness: .43, emissive: 0x6d3929, emissiveIntensity: .15 }),
  new THREE.MeshStandardMaterial({ color: 0xf5d6ae, roughness: .4, emissive: 0x6b4526, emissiveIntensity: .16 })
];

// --- Lighting: a warm lantern glow inside, a cool dusk fill outside — that
// warm/cool contrast is most of what reads as "cozy" at night. ---
scene.add(new THREE.HemisphereLight(0xc9c2a6, 0x0a0a08, 1.16));

const warm = new THREE.PointLight(0xffb968, 12, 8, 2);
warm.position.set(0, 1.1, 0);
warm.castShadow = true;
warm.shadow.mapSize.set(lowPower ? 512 : 1024, lowPower ? 512 : 1024);
scene.add(warm);

const softTop = new THREE.PointLight(0xdccaa8, 2.5, 12, 2);
softTop.position.set(-2, 7, 3);
scene.add(softTop);

const duskFill = new THREE.PointLight(0x5f6c8c, 1.55, 13, 2);
duskFill.position.set(-5, 3, -4);
scene.add(duskFill);

// A quiet warm rim light from behind so the far glass panels and pillars catch a
// soft edge highlight instead of going flat and dark — adds depth cheaply.
const rimLight = new THREE.PointLight(0xffcf95, 1.5, 11, 2);
rimLight.position.set(4.6, 3.4, -5.2);
scene.add(rimLight);

const lantern = new THREE.Group();
scene.add(lantern);
lantern.position.y = .45;

function box(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  lantern.add(mesh);
  return mesh;
}

const panelW = 4.7;
const panelH = 4.5;
const panelD = 4.7;
const panelY = 2.85;

const front = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, .045), glass);
front.position.set(0, panelY, panelD / 2);
lantern.add(front);

const back = front.clone();
back.position.z = -panelD / 2;
lantern.add(back);

const left = new THREE.Mesh(new THREE.BoxGeometry(.045, panelH, panelD), glass);
left.position.set(-panelW / 2, panelY, 0);
lantern.add(left);

const right = left.clone();
right.position.x = panelW / 2;
lantern.add(right);

box(4.95, .34, 4.95, darkBronze, 0, .53, 0);
box(4.55, .18, 4.55, bronze, 0, .74, 0);

const pillarPositions = [
  [-2.4, 2.95, -2.4], [2.4, 2.95, -2.4],
  [-2.4, 2.95, 2.4], [2.4, 2.95, 2.4]
];
for (const [x,y,z] of pillarPositions) {
  box(.24, 4.75, .24, bronze, x, y, z);
  box(.12, 4.5, .12, darkBronze, x, y, z);
}

for (const y of [.78, 5.03]) {
  box(4.95, .18, .20, bronze, 0, y, 2.43);
  box(4.95, .18, .20, bronze, 0, y, -2.43);
  box(.20, .18, 4.95, bronze, 2.43, y, 0);
  box(.20, .18, 4.95, bronze, -2.43, y, 0);
}

box(4.9, .25, 4.9, darkBronze, 0, 5.15, 0);
box(4.35, .22, 4.35, bronze, 0, 5.35, 0);

const roofMat = new THREE.MeshStandardMaterial({
  color: 0x4a4337,
  roughness: .32,
  metalness: .72,
  side: THREE.DoubleSide
});
function roofPanel(rotationY, x, z) {
  const geo = new THREE.BoxGeometry(2.75, .16, 4.65);
  const m = new THREE.Mesh(geo, roofMat);
  m.position.set(x, 5.58, z);
  m.rotation.z = rotationY;
  m.castShadow = true;
  lantern.add(m);
}
roofPanel(-.35, -1.18, 0);
roofPanel(.35, 1.18, 0);

const handleCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-.75, 5.45, 0),
  new THREE.Vector3(-.75, 6.15, 0),
  new THREE.Vector3(0, 6.55, 0),
  new THREE.Vector3(.75, 6.15, 0),
  new THREE.Vector3(.75, 5.45, 0)
]);
const handle = new THREE.Mesh(new THREE.TubeGeometry(handleCurve, 24, .09, 8, false), bronze);
handle.castShadow = true;
lantern.add(handle);

for (let i = -2; i <= 2; i++) {
  const orb = new THREE.Mesh(new THREE.SphereGeometry(.075, 10, 10), warmGlass);
  orb.position.set(i * .72, 5.72, 0);
  lantern.add(orb);
}

function createLeaf(scale = 1) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(.16, .34, .04),
    new THREE.Vector3(.05, .75, -.02),
    new THREE.Vector3(-.13, 1.0, 0)
  ]);
  const geo = new THREE.TubeGeometry(curve, 10, .085 * scale, 5, false);
  const leaf = new THREE.Mesh(geo, leafMat);
  leaf.scale.set(1.2, 1, .42);
  return leaf;
}

function createTulip(scale = 1, materialIndex = 0) {
  const flower = new THREE.Group();

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(.035 * scale, .055 * scale, 1.25 * scale, 7),
    stemMat
  );
  stem.position.y = .62 * scale;
  stem.rotation.z = (Math.random() - .5) * .1;
  flower.add(stem);

  const leaf = createLeaf(scale);
  leaf.position.set(.04 * scale, .3 * scale, .01);
  leaf.rotation.z = -.45 + Math.random() * .15;
  flower.add(leaf);

  const leaf2 = createLeaf(scale * .82);
  leaf2.position.set(-.03 * scale, .22 * scale, .02);
  leaf2.rotation.z = .55;
  flower.add(leaf2);

  const petalGroup = new THREE.Group();
  petalGroup.position.y = 1.25 * scale;
  const petalGeo = new THREE.SphereGeometry(.34 * scale, 16, 12);
  const blossomMat = tulipMats[materialIndex % tulipMats.length];

  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + .3;
    const p = new THREE.Mesh(petalGeo, blossomMat);
    p.scale.set(.63, 1.27, .43);
    p.position.set(Math.cos(angle) * .15 * scale, .075 * scale, Math.sin(angle) * .15 * scale);
    p.rotation.y = -angle;
    p.rotation.z = Math.cos(angle) * .19;
    p.castShadow = true;
    petalGroup.add(p);
  }

  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + .82;
    const p = new THREE.Mesh(petalGeo, blossomMat);
    p.scale.set(.46, .92, .32);
    p.position.set(Math.cos(angle) * .09 * scale, .23 * scale, Math.sin(angle) * .09 * scale);
    p.rotation.y = -angle;
    p.rotation.z = Math.cos(angle) * .12;
    p.castShadow = true;
    petalGroup.add(p);
  }

  const center = new THREE.Mesh(
    new THREE.SphereGeometry(.11 * scale, 10, 8),
    centerMat
  );
  center.position.y = .17 * scale;
  center.scale.set(1, .45, 1);
  petalGroup.add(center);

  flower.add(petalGroup);
  return flower;
}

const positions = [
  [-1.72, .83, 1.05, .92, 0, -.05],
  [-.62, .82, 1.38, 1.02, 1, .08],
  [.58, .83, 1.32, .88, 0, -.05],
  [1.58, .84, 1.02, 1.00, 2, .06],
  [-1.28, .82, .15, 1.05, 1, -.08],
  [-.25, .81, .18, .92, 0, .04],
  [.78, .82, .22, 1.03, 2, -.04],
  [1.62, .82, .02, .82, 1, .05],
  [-1.65, .82, -1.15, .82, 2, -.06],
  [-.70, .81, -1.28, 1.00, 0, .05],
  [.35, .82, -1.18, .87, 1, -.04],
  [1.34, .83, -1.20, .96, 0, .05],
  [-1.05, .83, -2.0, .76, 1, 0],
  [ .08, .82, -1.92, .86, 2, 0],
  [1.02, .82, -1.90, .78, 0, 0]
];

for (const [x,y,z,s,c,r] of positions) {
  const t = createTulip(s, c);
  t.position.set(x, y, z);
  t.rotation.y = r + Math.random() * .3;
  lantern.add(t);
}

for (const [x,z,scale,c] of [[-1.8,-.35,1.12,1],[.02,.6,1.18,0],[1.7,.48,1.05,2]]) {
  const t = createTulip(scale, c);
  t.position.set(x, .8, z);
  t.rotation.y = Math.random() * Math.PI;
  lantern.add(t);
}

// --- Collapse the lantern + garden into a handful of merged meshes. ---
// Each box/petal/leaf/stem above was its own draw call (250+ of them) — brutal
// for a phone GPU. Since none of them move independently, we bake every mesh's
// world transform straight into its geometry and merge everything that shares a
// material (and shadow behaviour) into one static mesh. The pixels on screen end
// up identical; the number of draw calls drops by well over an order of magnitude.
function mergeLanternMeshes() {
  lantern.updateMatrixWorld(true);

  const groups = new Map();
  lantern.traverse((child) => {
    if (!child.isMesh) return;
    const key = `${child.material.uuid}|${child.castShadow}|${child.receiveShadow}`;
    if (!groups.has(key)) {
      groups.set(key, {
        material: child.material,
        castShadow: child.castShadow,
        receiveShadow: child.receiveShadow,
        geometries: []
      });
    }
    const geo = child.geometry.clone();
    geo.applyMatrix4(child.matrixWorld);
    groups.get(key).geometries.push(geo);
  });

  const originals = [];
  lantern.traverse((child) => { if (child.isMesh) originals.push(child); });
  for (const mesh of originals) {
    mesh.geometry.dispose();
    mesh.parent.remove(mesh);
  }

  for (const { material, castShadow, receiveShadow, geometries } of groups.values()) {
    const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
    for (const geo of geometries) geo.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    scene.add(mesh);
  }
}
mergeLanternMeshes();

const dustCount = lowPower ? 70 : 120;
const dustPositions = new Float32Array(dustCount * 3);
for (let i = 0; i < dustCount; i++) {
  dustPositions[i*3] = (Math.random() - .5) * 4.2;
  dustPositions[i*3+1] = .9 + Math.random() * 4.0;
  dustPositions[i*3+2] = (Math.random() - .5) * 4.2;
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
const dustMat = new THREE.PointsMaterial({
  color: 0xf4d6a1,
  size: .018,
  transparent: true,
  opacity: .58,
  blending: THREE.AdditiveBlending
});
const pollen = new THREE.Points(dustGeo, dustMat);
lantern.add(pollen);

function fireflyTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, "rgba(255, 250, 202, 1)");
  glow.addColorStop(.13, "rgba(255, 218, 118, .98)");
  glow.addColorStop(.38, "rgba(244, 178, 68, .32)");
  glow.addColorStop(1, "rgba(244, 178, 68, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

const fireflies = [];
const fireflyGroup = new THREE.Group();
const glowTexture = fireflyTexture();
const fireflyCount = innerWidth < 700 ? 20 : (lowPower ? 28 : 38);

for (let i = 0; i < fireflyCount; i++) {
  const phase = Math.random() * Math.PI * 2;
  const size = .07 + Math.random() * .11;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: i % 4 === 0 ? 0xffe0a0 : 0xffc66e,
    transparent: true,
    opacity: .3 + Math.random() * .45,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  const base = new THREE.Vector3(
    (Math.random() - .5) * 10.5,
    .45 + Math.random() * 6.8,
    -2.6 + Math.random() * 5.2
  );
  sprite.position.copy(base);
  sprite.scale.setScalar(size);
  fireflyGroup.add(sprite);
  fireflies.push({ sprite, base, phase, size, speed: .25 + Math.random() * .42 });
}
scene.add(fireflyGroup);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(30, lowPower ? 48 : 96),
  new THREE.MeshStandardMaterial({ color: 0x11120f, roughness: .92, metalness: .02 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = .03;
ground.receiveShadow = true;
scene.add(ground);

const warmPool = new THREE.PointLight(0xe6a255, 16, 9, 2);
warmPool.position.set(0, .5, 0);
scene.add(warmPool);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = .055;
controls.enablePan = false;
controls.rotateSpeed = .46;
controls.zoomSpeed = .5;
controls.minDistance = 7.4;
controls.maxDistance = 15;
controls.minPolarAngle = Math.PI * .28;
controls.maxPolarAngle = Math.PI * .67;
controls.target.set(0, 2.9, 0);
controls.autoRotate = !reducedMotion;
controls.autoRotateSpeed = .65;

let resumeTimer;
controls.addEventListener("start", () => {
  controls.autoRotate = false;
  clearTimeout(resumeTimer);
});
controls.addEventListener("end", () => {
  clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => controls.autoRotate = true, 1800);
});

resetButton.addEventListener("click", () => {
  controls.reset();
  controls.autoRotate = !reducedMotion;
});

const music = { context: null, master: null, timer: null, playing: false };

function playChime(context, at, frequency) {
  const note = context.createOscillator();
  const shimmer = context.createOscillator();
  const envelope = context.createGain();
  const shimmerGain = context.createGain();

  note.type = "sine";
  note.frequency.setValueAtTime(frequency, at);
  shimmer.type = "sine";
  shimmer.frequency.setValueAtTime(frequency * 2.01, at);

  envelope.gain.setValueAtTime(.0001, at);
  envelope.gain.exponentialRampToValueAtTime(.036, at + .035);
  envelope.gain.exponentialRampToValueAtTime(.0001, at + 2.8);
  shimmerGain.gain.setValueAtTime(.0001, at);
  shimmerGain.gain.exponentialRampToValueAtTime(.007, at + .04);
  shimmerGain.gain.exponentialRampToValueAtTime(.0001, at + 1.35);

  note.connect(envelope).connect(music.master);
  shimmer.connect(shimmerGain).connect(music.master);
  note.start(at);
  shimmer.start(at);
  note.stop(at + 3);
  shimmer.stop(at + 1.5);
}

function scheduleLullaby() {
  if (!music.context || !music.playing) return;
  const notes = [293.66, 369.99, 440, 369.99, 329.63, 293.66];
  const start = music.context.currentTime + .08;
  notes.forEach((note, index) => playChime(music.context, start + index * .68, note));
}

function createLullaby() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextClass();
  const master = context.createGain();
  const warmth = context.createBiquadFilter();
  warmth.type = "lowpass";
  warmth.frequency.value = 1450;
  master.gain.value = (Number(volumeControl.value) / 100) * .32;
  master.connect(warmth).connect(context.destination);

  [146.83, 220, 293.66].forEach((frequency, index) => {
    const pad = context.createOscillator();
    const padGain = context.createGain();
    pad.type = index === 1 ? "triangle" : "sine";
    pad.frequency.value = frequency;
    padGain.gain.value = index === 1 ? .012 : .009;
    pad.connect(padGain).connect(master);
    pad.start();
  });

  music.context = context;
  music.master = master;
}

async function toggleMusic() {
  if (!music.context) createLullaby();

  if (music.playing) {
    music.playing = false;
    clearInterval(music.timer);
    await music.context.suspend();
  } else {
    await music.context.resume();
    music.playing = true;
    scheduleLullaby();
    music.timer = setInterval(scheduleLullaby, 4300);
  }

  musicPlayer.classList.toggle("is-playing", music.playing);
  musicToggle.setAttribute("aria-pressed", String(music.playing));
  musicToggle.setAttribute("aria-label", music.playing ? "Pause Lantern Lullaby" : "Play Lantern Lullaby");
}

musicToggle.addEventListener("click", toggleMusic);
volumeControl.addEventListener("input", () => {
  if (!music.master || !music.context) return;
  music.master.gain.setTargetAtTime((Number(volumeControl.value) / 100) * .32, music.context.currentTime, .03);
});

function frame() {
  const phone = innerWidth < 700;
  const tablet = !phone && innerWidth < 1100;
  camera.fov = phone ? 41 : tablet ? 36 : 33;
  camera.position.set(
    phone ? 0 : tablet ? 6.4 : 7.5,
    phone ? 3.35 : tablet ? 4.2 : 4.5,
    phone ? 14.2 : tablet ? 13.4 : 10.5
  );
  controls.target.set(tablet ? -.72 : 0, phone ? 2.45 : 2.7, 0);
  camera.updateProjectionMatrix();
}
frame();
controls.saveState();

// Mobile browsers fire "resize" constantly as the address bar shows/hides while
// scrolling or the keyboard toggles, which used to re-run the whole camera/frame
// setup every time and made the scene feel jittery. We now collapse bursts of
// resize events into a single update per frame, and ignore small height-only
// wobbles that aren't a real orientation or viewport change.
let resizeHandle = null;
let lastWidth = innerWidth;
let lastHeight = innerHeight;

function applyResize() {
  const widthChanged = Math.abs(innerWidth - lastWidth) > 2;
  const heightChanged = Math.abs(innerHeight - lastHeight) > 120;
  if (!widthChanged && !heightChanged) return;
  lastWidth = innerWidth;
  lastHeight = innerHeight;

  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 800 ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  frame();
  controls.saveState();
}

window.addEventListener("resize", () => {
  if (resizeHandle) cancelAnimationFrame(resizeHandle);
  resizeHandle = requestAnimationFrame(applyResize);
}, { passive: true });

// Pause the render loop entirely when the tab isn't visible — saves battery and
// avoids a burst of catch-up work (and a stutter) when the person comes back.
let renderingActive = true;
document.addEventListener("visibilitychange", () => {
  renderingActive = !document.hidden;
});

// Layered, uneven sine waves read as a living candle flicker rather than a
// mechanical pulse — cheap on the CPU and does a lot for the cozy feel.
function flicker(t, seed) {
  return 1
    + Math.sin(t * 1.3 + seed) * .035
    + Math.sin(t * 4.7 + seed * 2.3) * .02
    + Math.sin(t * 9.1 + seed * 3.7) * .012;
}

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  if (!renderingActive) return;

  const t = clock.getElapsedTime();

  warm.intensity = 12 * flicker(t, 0);
  warmPool.intensity = 16 * flicker(t, 1.7);

  if (!reducedMotion) {
    pollen.rotation.y = t * .012;
    pollen.position.y = Math.sin(t * .35) * .025;

    for (const fly of fireflies) {
      const drift = t * fly.speed + fly.phase;
      fly.sprite.position.x = fly.base.x + Math.sin(drift) * .24;
      fly.sprite.position.y = fly.base.y + Math.sin(drift * 1.7) * .16;
      fly.sprite.position.z = fly.base.z + Math.cos(drift * .7) * .13;
      fly.sprite.material.opacity = .2 + (Math.sin(drift * 2.2) + 1) * .28;
      const glow = fly.size * (1 + Math.sin(drift * 2.2) * .15);
      fly.sprite.scale.setScalar(glow);
    }
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();

setTimeout(() => loading.classList.add("hide"), 850);
