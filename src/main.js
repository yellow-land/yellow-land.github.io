import * as THREE from 'three';
import './main.css';

// -------------------- Configurable Constants --------------------
const AUTO_ROT_SPEED = 0.5;          // rad/s automatic spin speed
const ROTATION_SENS_X = 0.01;        // radians per horizontal pixel drag
const AUTO_RESUME_DELAY = 250;       // ms after (drag end + inertia end) to resume auto rotation
const CLAMP_DT = 0.05;               // max dt per frame to avoid big jumps
const MOMENTUM_DAMPING = 3.0;        // exponential damping factor (higher = quicker stop)
const MIN_VELOCITY_THRESHOLD = 0.02; // rad/s below which momentum stops
// ----------------------------------------------------------------

const container = document.getElementById('app');

// Scene & Camera
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 0, 3);

// Renderer:
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

// Lighting;
scene.add(new THREE.AmbientLight(0xffffff, 1));
const keyLight = new THREE.DirectionalLight(0xffff00, 1);
keyLight.position.set(2, 1, -2);
keyLight.target.position.set(0, 0, 0);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0xffff00, 1);
rimLight.position.set(-2, -1, -2);
rimLight.target.position.set(0, 0, 0);
scene.add(rimLight);

// Material;
const material = new THREE.MeshStandardMaterial({
  color: 0x1a1a1a,
  metalness: 0.35,
  roughness: 0.55
});

// Shape:
const shapeGroup = new THREE.Group();
const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
function makeCube(x, y, z = 0) {
  const m = new THREE.Mesh(cubeGeo, material);
  m.position.set(x, y, z);
  m.rotation.z = Math.PI / 4;
  return m;
}

shapeGroup.add(makeCube(0, Math.SQRT2 / 2));
shapeGroup.add(makeCube(0, -Math.SQRT2 / 2));
shapeGroup.add(makeCube(Math.SQRT2 / 2, Math.SQRT2));
shapeGroup.add(makeCube(-Math.SQRT2 / 2, Math.SQRT2));

// Scale:
shapeGroup.position.y = -0.1;
const box = new THREE.Box3().setFromObject(shapeGroup);
const size = new THREE.Vector3();
box.getSize(size);
const maxDim = Math.max(size.x, size.y, size.z);
const targetSpan = 0.85;
const scale = targetSpan / maxDim;
shapeGroup.scale.setScalar(scale);

scene.add(shapeGroup);

// Remove loading overlay
const loadingEl = document.getElementById('loading');
if (loadingEl) loadingEl.remove();

// Raycaster:
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
function updatePointerNDC(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = event.clientX !== undefined ? event.clientX : event.touches[0].clientX;
  const y = event.clientY !== undefined ? event.clientY : event.touches[0].clientY;
  pointerNDC.x = ((x - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((y - rect.top) / rect.height) * 2 + 1;
}

// Interaction:
let isDragging = false;
let dragEligible = false;
let lastPointerX = 0;
let lastPointerTime = 0;
let angularVelocityY = 0;
let inertiaActive = false;
let lastInteractionTime = performance.now();

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Pointer events:
function onPointerDown(e) {
  if (e.cancelable) e.preventDefault();

  updatePointerNDC(e);
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObjects(shapeGroup.children, true);
  dragEligible = hits.length > 0;

  if (!dragEligible) return;

  isDragging = true;
  inertiaActive = false;
  angularVelocityY = 0;
  lastPointerX = e.clientX !== undefined ? e.clientX : e.touches[0].clientX;
  lastPointerTime = performance.now();
  lastInteractionTime = lastPointerTime;
  container.style.cursor = 'grabbing';
}

function onPointerMove(e) {
  if (!isDragging) return;
  if (e.cancelable) e.preventDefault();

  const clientX = e.clientX !== undefined ? e.clientX : e.touches[0].clientX;
  const now = performance.now();
  const dx = clientX - lastPointerX;
  const dt = (now - lastPointerTime) / 1000;

  if (dt > 0) {
    const rotDelta = dx * ROTATION_SENS_X;
    shapeGroup.rotation.y += rotDelta;

    angularVelocityY = rotDelta / dt;
  }

  lastPointerX = clientX;
  lastPointerTime = now;
  lastInteractionTime = now;
}


function onPointerUp() {
  if (!isDragging) return;
  isDragging = false;
  container.style.cursor = 'auto';

  if (Math.abs(angularVelocityY) > MIN_VELOCITY_THRESHOLD) {
    inertiaActive = true;
  } else {
    angularVelocityY = 0;
    inertiaActive = false;
    lastInteractionTime = performance.now();
  }
}

// Listeners:
const passiveTouch = { passive: false };
container.addEventListener('mousedown', onPointerDown);
window.addEventListener('mousemove', onPointerMove);
window.addEventListener('mouseup', onPointerUp);

container.addEventListener('touchstart', onPointerDown, passiveTouch);
window.addEventListener('touchmove', onPointerMove, passiveTouch);
window.addEventListener('touchend', onPointerUp, passiveTouch);
window.addEventListener('touchcancel', onPointerUp, passiveTouch);

// prevent context menu
container.addEventListener('contextmenu', e => e.preventDefault());

// Animation loop:
let last = performance.now();
function animate(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > CLAMP_DT) dt = CLAMP_DT;

  if (!prefersReducedMotion) {
    if (isDragging) {
    } else if (inertiaActive) {
      // apply momentum
      shapeGroup.rotation.y += angularVelocityY * dt;

      // damping
      const dampingFactor = Math.exp(-MOMENTUM_DAMPING * dt);
      angularVelocityY *= dampingFactor;

      if (Math.abs(angularVelocityY) < MIN_VELOCITY_THRESHOLD) {
        angularVelocityY = 0;
        inertiaActive = false;
        lastInteractionTime = performance.now();
      }
    } else {
      const inactive = now - lastInteractionTime;
      const shouldAutoRotate = inactive > AUTO_RESUME_DELAY;
      if (shouldAutoRotate) {
        shapeGroup.rotation.y += dt * AUTO_ROT_SPEED;
      }
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// Resize:
window.addEventListener('resize',() => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  },
  { passive: true }
);
