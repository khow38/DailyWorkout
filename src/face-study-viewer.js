import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// This entry owns only the standalone face study; it never mounts the workout app.
// Public setters return false until ready, and reject unknown names/invalid values.
// getState() returns a detached, JSON-safe inspection snapshot. dispose() is final.
const VIEW_ANGLES = { front: 0, '45deg': Math.PI / 4, side: Math.PI / 2, back: Math.PI };
const LIGHTS = {
  neutral: { label: '뉴트럴', key: 0xfff5e9, fill: 0xe4edff, rim: 0xffffff, sky: 0xf0f2ff, ground: 0x9b8875 },
  warm: { label: '웜', key: 0xffd4aa, fill: 0xf2e7df, rim: 0xffedd4, sky: 0xffebd7, ground: 0x9b7862 },
  cool: { label: '쿨', key: 0xdce8ff, fill: 0xd7eaff, rim: 0xe9eeff, sky: 0xe2edff, ground: 0x7e8799 },
};
const $ = (selector) => document.querySelector(selector);
const canvas = $('#study-canvas');
const stage = $('#study-stage');
const notice = $('#viewer-notice');
const noticeText = $('#notice-text');
const settings = $('#study-settings');
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const events = new AbortController();
const state = {
  status: 'loading', view: 'front', framing: 'portrait', light: 'neutral',
  exposure: 1.0, hairVisible: true, autoRotate: false, wireframe: false,
  reducedMotion: motionPreference.matches, error: null,
};
let renderer, scene, camera, controls, model, environmentTarget, observer;
let keyLight, fillLight, rimLight, hemisphere;
let bounds, portraitBounds, modelSize, modelCenter, scale = 1;
let hairObjects = [], modelMaterials = new Set(), morphs = new Map();
let frame = 0, previousTime = 0, disposed = false, contextLost = false, pageHidden = false;
let resourcesReleased = false;

window.FaceStudy = Object.freeze({
  setView, setLight, setFraming, setExposure, setHairVisible, setAutoRotate,
  setWireframe, setMorph, getState, dispose,
});
initialize().catch(fail);

async function initialize() {
  bindUI();
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = state.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = !state.reducedMotion;
  controls.dampingFactor = 0.09;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.7;
  controls.autoRotateSpeed = 0.55;
  controls.minPolarAngle = Math.PI * 0.16;
  controls.maxPolarAngle = Math.PI * 0.82;
  controls.addEventListener('change', requestRender);
  controls.addEventListener('start', () => {
    if (state.status !== 'ready') return;
    setAutoRotate(false);
    state.view = 'custom';
    syncUI();
  });
  canvas.addEventListener('webglcontextlost', onContextLost, { signal: events.signal });
  canvas.addEventListener('webglcontextrestored', onContextRestored, { signal: events.signal });
  observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();

  const manager = new THREE.LoadingManager();
  let resourceErrors = 0;
  manager.onError = () => { resourceErrors++; };
  manager.setURLModifier((url) => {
    if (/^(blob:|data:)/i.test(url)) return url;
    throw new Error('외부 모델 리소스는 사용할 수 없습니다. 텍스처를 GLB에 포함해 주세요.');
  });
  const bytes = Uint8Array.from(atob(__FACE_STUDY_BASE64__), (character) => character.charCodeAt(0));
  const gltf = await new GLTFLoader(manager).parseAsync(bytes.buffer, '');
  if (disposed) {
    const seen = new Set();
    gltf.scenes.forEach((root) => disposeObject(root, seen));
    return;
  }
  model = gltf.scene;
  // Retain every scene for resource ownership, even if the asset has inactive scenes.
  model.userData.studyScenes = gltf.scenes;
  scene.add(model);
  if (resourceErrors) throw new Error('모델의 내장 텍스처를 읽지 못했습니다. GLB 이미지 데이터를 확인해 주세요.');
  model.updateMatrixWorld(true);
  bounds = new THREE.Box3().setFromObject(model, true);
  modelSize = bounds.getSize(new THREE.Vector3());
  modelCenter = bounds.getCenter(new THREE.Vector3());
  if (bounds.isEmpty() || ![...bounds.min, ...bounds.max].every(Number.isFinite) || modelSize.y <= 0) {
    throw new Error('모델에서 표시 가능한 입체 경계를 찾지 못했습니다.');
  }
  scale = Math.max(modelSize.x, modelSize.y, modelSize.z);
  discoverModelControls();
  portraitBounds = findPortraitBounds();
  configureStudio();
  if (!contextLost) refreshEnvironment();
  frameCamera(VIEW_ANGLES.front);
  syncUI();
  if (!contextLost) {
    renderer.render(scene, camera);
    setStatus('ready');
    notice.hidden = true;
    requestRender();
  }
}

function discoverModelControls() {
  model.traverse((object) => {
    const tag = `${object.name} ${object.userData.kind || ''} ${object.userData.part || ''}`;
    if (/hair|fringe|bangs|ponytail|머리카락|헤어/i.test(tag)) hairObjects.push(object);
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => modelMaterials.add(material));
    // Blend cards should not cast opaque rectangular shadows. Alpha-test cards retain theirs.
    object.castShadow = materials.every((material) => !material.transparent || material.alphaTest > 0);
    object.receiveShadow = true;
    if (!object.morphTargetDictionary || !object.morphTargetInfluences) return;
    for (const [name, index] of Object.entries(object.morphTargetDictionary)) {
      if (!Number.isInteger(index) || !Number.isFinite(object.morphTargetInfluences[index])) continue;
      if (!morphs.has(name)) morphs.set(name, []);
      morphs.get(name).push({ object, index });
    }
  });
  // Hide whole named hair groups, without touching alpha, textures, eyebrows or eyelashes.
  hairObjects = hairObjects.filter((object) => {
    for (let parent = object.parent; parent && parent !== model; parent = parent.parent) {
      if (hairObjects.includes(parent)) return false;
    }
    return true;
  });
  $('#hair-control').hidden = hairObjects.length === 0;
  const morphPanel = $('#morph-controls');
  morphPanel.hidden = morphs.size === 0;
  const labels = { smile: '미소', jawOpen: '입 벌림', blink: '눈 감기', eyeBlink: '눈 감기', browRaise: '눈썹 올림' };
  let index = 0;
  for (const [name, targets] of morphs) {
    const row = document.createElement('div');
    row.className = 'slider-row';
    const label = document.createElement('label');
    const input = document.createElement('input');
    const value = document.createElement('output');
    input.type = 'range';
    input.id = `morph-${index++}`;
    input.min = '0'; input.max = '1'; input.step = '0.01';
    input.value = String(targets[0].object.morphTargetInfluences[targets[0].index]);
    label.htmlFor = input.id;
    label.textContent = labels[name] || name;
    value.htmlFor = input.id;
    value.textContent = `${Math.round(Number(input.value) * 100)}%`;
    input.addEventListener('input', () => setMorph(name, Number(input.value)), { signal: events.signal });
    targets.input = input;
    targets.output = value;
    row.append(label, value, input);
    $('#morph-list').append(row);
  }
}

function findPortraitBounds() {
  // Use semantic parts and actual vertices, never an assumed world-space target.
  // Whole-bust meshes often include "FaceStudy" in every name: match part tokens.
  const head = new THREE.Box3();
  const eyes = new THREE.Box3();
  model.traverse((object) => {
    if (!object.isMesh) return;
    const isHead = /(?:^|[_\s.-])(head|face|skull|얼굴)(?:$|[_\s.-])/i.test(object.name);
    const isEye = /(?:^|[_\s.-])(eyes?|eyeballs?)(?:$|[_\s.-])/i.test(object.name);
    if (!isHead && !isEye) return;
    const box = new THREE.Box3().setFromObject(object, true);
    if (isEye) eyes.union(box);
    if (isHead && box.getSize(new THREE.Vector3()).y < modelSize.y * 0.88) head.union(box);
  });
  let lowerY = bounds.min.y + modelSize.y * 0.5;
  if (!head.isEmpty()) lowerY = head.min.y - modelSize.y * 0.04;
  else if (!eyes.isEmpty()) {
    const eyeY = eyes.getCenter(new THREE.Vector3()).y;
    // Crown-to-eye distance gives a scale-relative chin / upper-neck crop,
    // including the whole face instead of centering the full shoulder mesh.
    lowerY = Math.max(bounds.min.y, eyeY - (bounds.max.y - eyeY) * 1.5);
  }
  const upper = new THREE.Box3();
  const vertex = new THREE.Vector3();
  model.traverse((object) => {
    if (!object.isMesh || !object.geometry.attributes.position) return;
    const count = object.geometry.attributes.position.count;
    for (let i = 0; i < count; i++) {
      object.getVertexPosition(i, vertex).applyMatrix4(object.matrixWorld);
      if (vertex.y >= lowerY) upper.expandByPoint(vertex);
    }
  });
  return upper.isEmpty() ? bounds.clone() : upper;
}

function configureStudio() {
  hemisphere = new THREE.HemisphereLight(0xf0f2ff, 0x9b8875, 0.35);
  keyLight = new THREE.DirectionalLight(0xfff5e9, 2.4);
  fillLight = new THREE.DirectionalLight(0xe4edff, 0.8);
  rimLight = new THREE.DirectionalLight(0xffffff, 1.6);
  for (const [light, offset] of [[keyLight, [-1.5, 1.8, 2.4]], [fillLight, [1.8, 0.4, 1.5]], [rimLight, [0.8, 1.2, -1.8]]]) {
    light.position.copy(modelCenter).addScaledVector(new THREE.Vector3(...offset), scale);
    light.target.position.copy(modelCenter);
    scene.add(light, light.target);
  }
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  Object.assign(keyLight.shadow.camera, { left: -scale, right: scale, top: scale, bottom: -scale, near: scale * 0.1, far: scale * 8 });
  keyLight.shadow.camera.updateProjectionMatrix();
  keyLight.shadow.normalBias = scale * 0.002;
  keyLight.shadow.bias = -0.0001;
  keyLight.shadow.radius = 3;
  scene.add(hemisphere);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(scale * 12, scale * 12), new THREE.ShadowMaterial({ opacity: 0.13 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(modelCenter.x, bounds.min.y - scale * 0.012, modelCenter.z);
  ground.receiveShadow = true;
  scene.add(ground);
  scene.environmentIntensity = 0.5;
}

function refreshEnvironment() {
  environmentTarget?.dispose();
  const generator = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  try {
    environmentTarget = generator.fromScene(room, 0.04);
    scene.environment = environmentTarget.texture;
  } finally {
    room.dispose();
    generator.dispose();
  }
}

function fittedDistance(box, direction) {
  const center = box.getCenter(new THREE.Vector3());
  const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanH = tanV * camera.aspect;
  const margin = state.framing === 'portrait' ? 1.13 : 1.16;
  let distance = 0;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const relative = new THREE.Vector3(x, y, z).sub(center);
    const depth = relative.dot(direction);
    distance = Math.max(distance, depth + Math.abs(relative.dot(right)) * margin / tanH, depth + Math.abs(relative.dot(up)) * margin / tanV);
  }
  return Math.max(distance, scale * 0.25);
}

function frameCamera(angle, polar = Math.PI / 2) {
  const box = state.framing === 'portrait' ? portraitBounds : bounds;
  const direction = new THREE.Vector3().setFromSphericalCoords(1, polar, angle);
  const distance = fittedDistance(box, direction);
  // Flush residual drag damping before applying an exact preset.
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  controls.update(0);
  controls.target.copy(box.getCenter(new THREE.Vector3()));
  controls.minDistance = Math.max(scale * 0.38, distance * 0.42);
  controls.maxDistance = Math.max(distance * 3, scale * 5);
  camera.near = scale / 1000;
  camera.far = Math.max(scale * 40, distance * 8);
  camera.position.copy(controls.target).addScaledVector(direction, distance);
  camera.updateProjectionMatrix();
  controls.update(0);
  controls.enableDamping = damping;
  requestRender();
}

function setView(name) {
  if (!Object.hasOwn(VIEW_ANGLES, name)) throw new RangeError(`Unknown view: ${name}`);
  if (state.status !== 'ready') return false;
  setAutoRotate(false);
  state.view = name;
  frameCamera(VIEW_ANGLES[name]);
  syncUI();
  return true;
}

function setFraming(name) {
  if (!['portrait', 'bust'].includes(name)) throw new RangeError(`Unknown framing: ${name}`);
  if (state.status !== 'ready') return false;
  state.framing = name;
  frameCamera(controls.getAzimuthalAngle(), controls.getPolarAngle());
  syncUI();
  return true;
}

function setLight(name) {
  if (!Object.hasOwn(LIGHTS, name)) throw new RangeError(`Unknown light: ${name}`);
  if (state.status !== 'ready') return false;
  state.light = name;
  const palette = LIGHTS[name];
  keyLight.color.setHex(palette.key);
  fillLight.color.setHex(palette.fill);
  rimLight.color.setHex(palette.rim);
  hemisphere.color.setHex(palette.sky);
  hemisphere.groundColor.setHex(palette.ground);
  syncUI();
  requestRender();
  return true;
}

function setExposure(value) {
  if (!Number.isFinite(value) || value < 0.6 || value > 1.6) throw new RangeError('Exposure must be between 0.6 and 1.6');
  if (state.status !== 'ready') return false;
  state.exposure = value;
  renderer.toneMappingExposure = value;
  syncUI();
  requestRender();
  return true;
}

function setHairVisible(visible) {
  if (state.status !== 'ready' || !hairObjects.length) return false;
  state.hairVisible = Boolean(visible);
  hairObjects.forEach((object) => { object.visible = state.hairVisible; });
  syncUI();
  requestRender();
  return true;
}

function setWireframe(enabled) {
  if (state.status !== 'ready') return false;
  state.wireframe = Boolean(enabled);
  modelMaterials.forEach((material) => { material.wireframe = state.wireframe; });
  syncUI();
  requestRender();
  return true;
}

function setAutoRotate(enabled) {
  if (state.status !== 'ready') return false;
  state.autoRotate = Boolean(enabled);
  controls.autoRotate = state.autoRotate;
  if (state.autoRotate) state.view = 'custom';
  syncUI();
  requestRender();
  return true;
}

function setMorph(name, value) {
  if (!morphs.has(name)) throw new RangeError(`Unknown morph: ${name}`);
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('Morph weight must be between 0 and 1');
  if (state.status !== 'ready') return false;
  const targets = morphs.get(name);
  targets.forEach(({ object, index }) => { object.morphTargetInfluences[index] = value; });
  targets.input.value = String(value);
  targets.output.textContent = `${Math.round(value * 100)}%`;
  requestRender();
  return true;
}

function getState() {
  return {
    ...state, ready: state.status === 'ready',
    availableViews: Object.keys(VIEW_ANGLES), availableLights: Object.keys(LIGHTS),
    hairAvailable: hairObjects.length > 0,
    hairParts: hairObjects.map((object) => ({ name: object.name, visible: object.visible })),
    morphs: Object.fromEntries([...morphs].map(([name, targets]) => [name, targets[0].object.morphTargetInfluences[targets[0].index]])),
    camera: camera ? { position: camera.position.toArray(), target: controls?.target.toArray() || null, fov: camera.fov, aspect: camera.aspect } : null,
    bounds: bounds ? { min: bounds.min.toArray(), max: bounds.max.toArray(), size: modelSize.toArray() } : null,
    portraitBounds: portraitBounds ? { min: portraitBounds.min.toArray(), max: portraitBounds.max.toArray() } : null,
    canvas: { width: canvas.width, height: canvas.height },
  };
}

function bindUI() {
  const on = (target, type, handler) => target.addEventListener(type, handler, { signal: events.signal });
  document.querySelectorAll('[data-view]').forEach((button) => on(button, 'click', () => setView(button.dataset.view)));
  document.querySelectorAll('[data-framing]').forEach((button) => on(button, 'click', () => setFraming(button.dataset.framing)));
  document.querySelectorAll('[data-light]').forEach((button) => on(button, 'click', () => setLight(button.dataset.light)));
  on($('#exposure'), 'input', (event) => setExposure(Number(event.target.value)));
  on($('#hair'), 'change', (event) => setHairVisible(event.target.checked));
  on($('#rotate'), 'change', (event) => setAutoRotate(event.target.checked));
  on($('#wireframe'), 'change', (event) => setWireframe(event.target.checked));
  on($('#reset-view'), 'click', () => setView('front'));
  on($('#zoom-in'), 'click', () => zoom(0.88));
  on($('#zoom-out'), 'click', () => zoom(1.14));
  on($('#retry'), 'click', () => location.reload());
  on($('#dismiss-notice'), 'click', () => { notice.hidden = true; $('#dismiss-notice').hidden = true; });
  on(canvas, 'keydown', onCanvasKey);
  on(motionPreference, 'change', (event) => {
    state.reducedMotion = event.matches;
    if (controls) controls.enableDamping = !event.matches;
    if (event.matches) setAutoRotate(false);
  });
  on(document, 'visibilitychange', () => { previousTime = 0; document.hidden ? stopFrame() : requestRender(); });
  on(window, 'pagehide', (event) => {
    pageHidden = true;
    if (event.persisted) stopFrame(); else dispose();
  });
  on(window, 'pageshow', () => { pageHidden = false; previousTime = 0; resize(); requestRender(); });
  on(window, 'resize', resize);
}

function onCanvasKey(event) {
  if (state.status !== 'ready' || event.altKey || event.ctrlKey || event.metaKey) return;
  const turns = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.08], ArrowDown: [0, 0.08] };
  if (turns[event.key]) {
    event.preventDefault();
    setAutoRotate(false);
    state.view = 'custom';
    const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    spherical.theta += turns[event.key][0];
    spherical.phi = THREE.MathUtils.clamp(spherical.phi + turns[event.key][1], controls.minPolarAngle, controls.maxPolarAngle);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    controls.update(0);
    syncUI(); requestRender();
  } else if (['+', '=', '-', '_', 'Home', ' '].includes(event.key)) {
    event.preventDefault();
    if (event.key === 'Home') setView('front');
    else if (event.key === ' ') setAutoRotate(!state.autoRotate);
    else zoom(['+', '='].includes(event.key) ? 0.88 : 1.14);
  }
}

function zoom(factor) {
  if (state.status !== 'ready') return;
  const offset = camera.position.clone().sub(controls.target);
  offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance));
  camera.position.copy(controls.target).add(offset);
  controls.update(0);
  requestRender();
}

function syncUI() {
  for (const key of ['view', 'framing', 'light']) {
    document.querySelectorAll(`[data-${key}]`).forEach((button) => button.setAttribute('aria-pressed', String(button.dataset[key] === state[key])));
  }
  $('#exposure').value = String(state.exposure);
  $('#exposure-value').textContent = `${state.exposure.toFixed(2)}×`;
  $('#hair').checked = state.hairVisible;
  $('#rotate').checked = state.autoRotate;
  $('#wireframe').checked = state.wireframe;
  stage.dataset.light = state.light;
  $('#stage-framing').textContent = state.framing === 'portrait' ? 'PORTRAIT' : 'BUST';
  $('#stage-light').textContent = `${LIGHTS[state.light].label} 스튜디오`;
}

function resize() {
  if (!renderer || disposed || contextLost || resourcesReleased) return;
  const width = stage.clientWidth, height = stage.clientHeight;
  if (!width || !height) return;
  const nextAspect = width / height;
  const aspectChanged = Math.abs(camera.aspect - nextAspect) > 0.001;
  camera.aspect = nextAspect;
  camera.updateProjectionMatrix();
  // Limit the backing buffer on very large / high-DPI displays without blurring phones.
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2, Math.sqrt(4200000 / (width * height))));
  renderer.setSize(width, height, false);
  if (bounds && aspectChanged) frameCamera(controls.getAzimuthalAngle(), controls.getPolarAngle());
  requestRender();
}

function requestRender() {
  if (frame || disposed || contextLost || document.hidden || pageHidden || state.status !== 'ready') return;
  frame = requestAnimationFrame(render);
}

function render(time) {
  frame = 0;
  if (disposed || contextLost || state.status !== 'ready') return;
  const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
  previousTime = time;
  try {
    const changing = controls.update(delta);
    renderer.render(scene, camera);
    if (changing || state.autoRotate) requestRender();
  } catch (error) { fail(error); }
}

function stopFrame() {
  cancelAnimationFrame(frame);
  frame = 0;
  previousTime = 0;
}

function setStatus(status) {
  state.status = status;
  document.body.dataset.ready = String(status === 'ready');
  document.body.dataset.status = status;
  stage.setAttribute('aria-busy', String(status === 'loading'));
  settings.disabled = status !== 'ready';
  if (controls) controls.enabled = status === 'ready';
  document.querySelectorAll('[data-stage-action]').forEach((button) => { button.disabled = status !== 'ready'; });
  $('#status-label').textContent = ({ ready: '탐색 준비 완료', loading: '모델 준비 중', error: '표시 오류', 'context-lost': '그래픽 복구 대기', disposed: '뷰어 종료' })[status];
}

function showNotice(message, retry = false) {
  noticeText.textContent = message;
  $('#retry').hidden = !retry;
  $('#dismiss-notice').hidden = true;
  notice.hidden = false;
}

function onContextLost(event) {
  if (disposed || resourcesReleased) return;
  event.preventDefault();
  contextLost = true;
  stopFrame();
  state.autoRotate = false;
  controls.autoRotate = false;
  setStatus('context-lost');
  syncUI();
  showNotice('그래픽 연결이 일시 중단되었습니다. 자동 복구를 기다리는 중입니다. 계속되면 다시 열어 주세요.', true);
}

function onContextRestored() {
  if (disposed || resourcesReleased) return;
  contextLost = false;
  if (!model || !keyLight) {
    setStatus('loading');
    showNotice('그래픽 연결이 복구되었습니다. 모델을 준비하고 있습니다.');
    return;
  }
  try {
    refreshEnvironment();
    resize();
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    setStatus('ready');
    showNotice('그래픽 연결이 복구되었습니다. 다시 탐색할 수 있습니다.');
    $('#dismiss-notice').hidden = false;
    requestRender();
  } catch (error) { fail(error); }
}

function fail(error) {
  if (disposed) return;
  console.error('Face study:', error);
  state.error = error instanceof Error ? error.message : String(error);
  state.autoRotate = false;
  releaseResources();
  setStatus('error');
  showNotice(`3D 시안을 표시하지 못했습니다. WebGL 2와 하드웨어 가속을 지원하는 브라우저에서 다시 열어 주세요. ${state.error}`, true);
}

function disposeObject(root, seen = new Set()) {
  root.traverse((object) => {
    if (object.geometry && !seen.has(object.geometry)) { seen.add(object.geometry); object.geometry.dispose(); }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material || seen.has(material)) continue;
      seen.add(material);
      for (const value of Object.values(material)) {
        if (!value?.isTexture || seen.has(value)) continue;
        seen.add(value);
        const images = Array.isArray(value.source?.data) ? value.source.data : [value.source?.data];
        for (const image of images) {
          if (image && !seen.has(image)) { seen.add(image); image.close?.(); }
        }
        value.dispose();
      }
      material.dispose();
    }
    if (object.skeleton && !seen.has(object.skeleton)) { seen.add(object.skeleton); object.skeleton.dispose(); }
    object.shadow?.dispose();
  });
}

function releaseResources() {
  if (resourcesReleased) return;
  resourcesReleased = true;
  stopFrame();
  observer?.disconnect();
  controls?.dispose();
  environmentTarget?.dispose();
  if (scene) {
    const seen = new Set();
    disposeObject(scene, seen);
    model?.userData.studyScenes?.forEach((root) => disposeObject(root, seen));
    scene.clear();
    scene.environment = null;
  }
  renderer?.dispose();
  renderer?.forceContextLoss();
  modelMaterials.clear();
  morphs.clear();
  hairObjects = [];
  model = null;
  environmentTarget = null;
}

function dispose() {
  if (disposed) return;
  disposed = true;
  state.autoRotate = false;
  events.abort();
  releaseResources();
  setStatus('disposed');
}
