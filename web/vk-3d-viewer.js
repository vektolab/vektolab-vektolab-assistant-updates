// Vektolab · Visor 3D de producto (módulo ES)
// Se importa dinámicamente desde producto.html solo cuando el usuario
// toca "Vista 3D", para no cargar three.js en páginas que no lo necesitan.
import * as THREE from "three";
import { ThreeMFLoader } from "three/addons/loaders/3MFLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

let viewer = null; // { scene, camera, renderer, canvas, group, raf, resizeHandler, setCamDist }
let modalEl = null;

function ensureModal() {
  if (modalEl) return modalEl;
  const modal = document.createElement("div");
  modal.id = "vkViewerModal";
  modal.innerHTML =
    '<div class="vk-viewer-backdrop"></div>' +
    '<div class="vk-viewer-box">' +
      '<button type="button" class="vk-viewer-close" aria-label="Cerrar">✕</button>' +
      '<div class="vk-viewer-title" id="vkViewerTitle"></div>' +
      '<div class="vk-viewer-canvas-wrap">' +
        '<canvas id="vkViewerCanvas"></canvas>' +
        '<div class="vk-viewer-status" id="vkViewerStatus">Cargando modelo…</div>' +
      "</div>" +
      '<div class="vk-viewer-hint">Arrastrá para rotar · rueda del mouse para zoom</div>' +
    "</div>";
  const style = document.createElement("style");
  style.textContent =
    "#vkViewerModal{position:fixed;inset:0;z-index:9999;display:none;}" +
    "#vkViewerModal.open{display:block;}" +
    ".vk-viewer-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.72);}" +
    ".vk-viewer-box{position:relative;max-width:900px;margin:4vh auto;background:var(--bg,#fff);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;height:88vh;box-shadow:0 20px 60px rgba(0,0,0,.4);}" +
    ".vk-viewer-close{position:absolute;top:10px;right:10px;z-index:2;width:36px;height:36px;border-radius:50%;border:none;background:rgba(0,0,0,.55);color:#fff;font-size:16px;cursor:pointer;}" +
    ".vk-viewer-title{padding:14px 50px 0 16px;font-weight:700;font-size:15px;}" +
    ".vk-viewer-canvas-wrap{position:relative;flex:1;min-height:0;}" +
    "#vkViewerCanvas{width:100%;height:100%;display:block;cursor:grab;touch-action:none;}" +
    "#vkViewerCanvas.dragging{cursor:grabbing;}" +
    ".vk-viewer-status{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;color:#666;pointer-events:none;background:rgba(244,244,244,.6);}" +
    ".vk-viewer-status.hidden{display:none;}" +
    ".vk-viewer-hint{padding:8px 16px 14px;font-size:12px;opacity:.6;text-align:center;}";
  document.head.appendChild(style);
  document.body.appendChild(modal);
  modal.querySelector(".vk-viewer-backdrop").onclick = closeModel;
  modal.querySelector(".vk-viewer-close").onclick = closeModel;
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModel(); });
  modalEl = modal;
  return modal;
}

function initScene() {
  if (viewer) return;
  const canvas = document.getElementById("vkViewerCanvas");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f4f4);
  const camera = new THREE.PerspectiveCamera(35, canvas.clientWidth / canvas.clientHeight || 1, 0.1, 8000);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd4d4d4, 0.3));
  const key = new THREE.DirectionalLight(0xffffff, 0.6);
  key.position.set(50, 120, 70);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-70, 90, 40);
  scene.add(fill);

  const group = new THREE.Group();
  scene.add(group);

  let rotY = Math.PI / 4, rotX = 0.4, camDist = 200;
  let dragging = false, lastX = 0, lastY = 0;

  function updateCameraPos() {
    camera.position.set(
      camDist * Math.sin(rotY) * Math.cos(rotX),
      camDist * Math.sin(rotX),
      camDist * Math.cos(rotY) * Math.cos(rotX)
    );
    camera.lookAt(0, 0, 0);
  }
  updateCameraPos();

  canvas.addEventListener("pointerdown", e => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    canvas.classList.add("dragging");
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointerup", () => { dragging = false; canvas.classList.remove("dragging"); });
  canvas.addEventListener("pointercancel", () => { dragging = false; canvas.classList.remove("dragging"); });
  canvas.addEventListener("pointermove", e => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    rotY -= dx * 0.008;
    rotX = Math.max(-1.5, Math.min(1.5, rotX + dy * 0.006));
    updateCameraPos();
  });
  canvas.addEventListener("wheel", e => {
    camDist = Math.max(20, Math.min(2000, camDist + e.deltaY * 0.4));
    updateCameraPos();
    e.preventDefault();
  }, { passive: false });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  function animate() {
    viewer.raf = requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }

  viewer = {
    scene, camera, renderer, canvas, group, resizeHandler: resize, raf: 0,
    setCamDist: v => { camDist = v; updateCameraPos(); }
  };
  animate();
}

function frameCamera(object) {
  if (!viewer) return;
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 1) * 0.75;
  viewer.setCamDist(radius * 2.4);
}

export function closeModel() {
  if (modalEl) modalEl.classList.remove("open");
  if (viewer) {
    cancelAnimationFrame(viewer.raf);
    window.removeEventListener("resize", viewer.resizeHandler);
    viewer.renderer.dispose();
    viewer = null;
  }
}

export async function showModel(url, title) {
  if (!url) return;
  const modal = ensureModal();
  modal.classList.add("open");
  const titleEl = document.getElementById("vkViewerTitle");
  if (titleEl) titleEl.textContent = title || "";
  const statusEl = document.getElementById("vkViewerStatus");
  statusEl.textContent = "Cargando modelo…";
  statusEl.classList.remove("hidden");

  initScene();

  const isGltf = /\.(glb|gltf)(\?|$)/i.test(url);
  const onError = err => {
    console.error("Vektolab · error cargando modelo 3D:", err);
    if (statusEl) {
      statusEl.textContent = "No se pudo cargar el modelo 3D.";
      statusEl.classList.remove("hidden");
    }
  };
  const onLoaded = object => {
    try {
      if (!viewer) return;
      viewer.group.clear();
      viewer.group.add(object);
      frameCamera(object);
      statusEl.classList.add("hidden");
    } catch (err) {
      onError(err);
    }
  };

  try {
    if (isGltf) {
      const loader = new GLTFLoader();
      loader.load(url, gltf => onLoaded(gltf.scene), undefined, onError);
    } else {
      const loader = new ThreeMFLoader();
      loader.load(url, onLoaded, undefined, onError);
    }
  } catch (err) {
    onError(err);
  }
}
