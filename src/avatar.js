import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import {
  HumanoidRig,
  normalizeBody,
  BODY_DEFAULT,
  BODY_LIMITS,
} from "./kinematics.js";
import { sampleMotion, motionInfo, EXERCISES } from "./motions.js";
import {
  sampleJointPose,
  JOINTS,
  MOTION_CLIPS,
  jointLabel,
  rotationDegrees,
} from "./joint-poses.js";
import {
  attachAppearance,
  dressMaterial,
  normalizeAppearance,
  appearancePreset,
  STYLE_PRESETS,
  APPEARANCE_LIMITS,
  HAIRSTYLES,
  FACE_SHAPES,
} from "./appearance.js";
export { normalizeBody, BODY_DEFAULT, BODY_LIMITS, EXERCISES };
export { JOINTS, MOTION_CLIPS };
export { creatorFields, presetPortrait } from "./creator-ui.js";
export {
  normalizeAppearance,
  appearancePreset,
  STYLE_PRESETS,
  APPEARANCE_LIMITS,
  HAIRSTYLES,
  FACE_SHAPES,
};

const modelPromises = new Map();
function model(type) {
  if (!modelPromises.has(type)) {
    const raw = atob(
        type === "female" ? __FEMALE_CHARACTER_BASE64__ : __CHARACTER_BASE64__,
      ),
      bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    modelPromises.set(
      type,
      new GLTFLoader().parseAsync(bytes.buffer, "").then((g) => g.scene),
    );
  }
  return modelPromises.get(type);
}
const memory = new Map();
export function markup(id = "pushup", compact = false, mode = "workout") {
  return `<div class="avatar-view ${compact ? "avatar-compact" : ""}" data-avatar="${id}" data-avatar-mode="${mode}"><div class="avatar-stage" role="img" aria-label="회전 가능한 3D 운동 시범"><div class="avatar-loading" role="status">3D 시범 준비 중…</div></div>${mode === "creator" ? '<div class="creator-views"><button type="button" data-avatar-action="portrait" aria-pressed="true">얼굴</button><button type="button" data-avatar-action="fullbody" aria-pressed="false">전신</button><button type="button" data-avatar-action="motion" aria-pressed="false">운동 보기</button></div>' : ""}<div class="avatar-caption"><span class="avatar-phase">사람형 3D · 관절 IK</span><button type="button" data-avatar-action="joints" aria-pressed="false">관절 보기</button></div><div class="avatar-controls"><button type="button" data-avatar-action="play" aria-label="시범 재생 또는 일시정지">일시정지</button><input data-avatar-scrub type="range" min="0" max="1000" value="0" aria-label="동작 구간"><select data-avatar-speed aria-label="재생 속도"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option></select></div><div class="avatar-views"><span>드래그로 회전</span><button type="button" data-avatar-action="front">정면</button><button type="button" data-avatar-action="side">측면</button><button type="button" data-avatar-action="angle">사선</button></div><details class="joint-panel"><summary>관절 회전값 · 65 joints</summary><p>선택 모델의 기본 자세 대비 로컬 X / Y / Z 각도입니다. 입력을 모델의 관절 축에 맞춘 뒤 접지 IK로 보정합니다.</p><div class="joint-table-scroll"><table><thead><tr><th>Joint</th><th>입력 X/Y/Z</th><th>IK 후 X/Y/Z</th></tr></thead><tbody>${JOINTS.map((j) => `<tr><th>${jointLabel(j.name)}<small>${j.name}</small></th><td data-joint-input="${j.name}">—</td><td data-joint-output="${j.name}">—</td></tr>`).join("")}</tbody></table></div></details><p class="avatar-fallback" hidden>3D를 표시할 수 없습니다. WebGL을 지원하는 브라우저에서 하드웨어 가속을 켠 후 다시 열어주세요.</p></div>`;
}

export function mount(host, body = {}, onReady) {
  if (!host) return { dispose() {} };
  const id = host.dataset.avatar,
    creator = host.dataset.avatarMode === "creator",
    memoryKey = id + (creator ? ":creator" : ":workout"),
    info = motionInfo(id),
    stage = host.querySelector(".avatar-stage");
  let alive = true,
    frame = 0,
    observer,
    renderer,
    rig,
    scene,
    camera,
    ground,
    equipment,
    markers,
    skeleton;
  let phase = memory.get(memoryKey)?.phase || 0,
    playing =
      memory.get(memoryKey)?.playing ??
      (!creator && !matchMedia("(prefers-reduced-motion: reduce)").matches),
    speed = memory.get(memoryKey)?.speed || 1;
  let viewMode =
    memory.get(memoryKey)?.viewMode || (creator ? "portrait" : "motion");
  let azimuth = memory.get(memoryKey)?.azimuth ?? (creator ? 0.15 : 1.0),
    elevation = creator ? 0.06 : 0.24,
    zoom = 1,
    last = 0,
    drag = null,
    phaseText = "";
  const speedInput = host.querySelector("[data-avatar-speed]"),
    scrub = host.querySelector("[data-avatar-scrub]"),
    playButton = host.querySelector('[data-avatar-action="play"]');
  speedInput.value = String(speed);
  const sync = () => {
    playButton.textContent = playing ? "일시정지" : "재생";
    playButton.setAttribute("aria-pressed", String(playing));
  };
  sync();
  for (const button of host.querySelectorAll(".creator-views button"))
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.avatarAction === viewMode),
    );
  const abort = new AbortController(),
    opts = { signal: abort.signal };
  host.querySelector(".joint-panel").addEventListener(
    "toggle",
    (event) => {
      if (event.currentTarget.open) setFrame();
    },
    opts,
  );
  const disposables = new Set();
  function mat(material) {
    disposables.add(material);
    return material;
  }
  function geo(geometry) {
    disposables.add(geometry);
    return geometry;
  }
  function cameraPosition() {
    if (!camera || !rig) return;
    const s = rig.metrics.scale;
    if (creator && viewMode === "portrait") {
      const center = rig
          .world("Head")
          .add(new T.Vector3(0, 0.115 * s, 0.015 * s)),
        distance = 0.59 * s * Math.max(1, 0.85 / camera.aspect);
      camera.position.set(
        center.x + Math.sin(azimuth) * Math.cos(elevation) * distance,
        center.y + Math.sin(elevation) * distance,
        center.z + Math.cos(azimuth) * Math.cos(elevation) * distance,
      );
      camera.lookAt(center);
      return;
    }
    const floor = info.floor || id === "compression";
    const center = new T.Vector3(
      0,
      (floor
        ? 0.35
        : info.family === "pike"
          ? 0.65
          : info.family === "pull"
            ? 1.32
            : 0.87) * s,
      0,
    );
    const aspect = camera.aspect,
      portrait = Math.max(1, 0.85 / aspect),
      distance =
        (floor ? 2.65 : info.family === "pull" ? 4.2 : 3.4) *
        s *
        portrait *
        zoom;
    camera.position.set(
      center.x + Math.sin(azimuth) * Math.cos(elevation) * distance,
      center.y + Math.sin(elevation) * distance,
      center.z + Math.cos(azimuth) * Math.cos(elevation) * distance,
    );
    camera.lookAt(center);
  }
  function setFrame() {
    if (!rig || !alive) return;
    const activeId = creator ? (viewMode === "motion" ? "squat" : "calf") : id,
      activePhase = creator && viewMode !== "motion" ? 0 : phase;
    const pose = sampleMotion(activeId, activePhase, rig.metrics);
    pose.jointPose = sampleJointPose(activeId, activePhase);
    rig.apply(pose);
    if (equipment) equipment.visible = pose.equipment !== "none";
    skeleton.visible =
      host
        .querySelector('[data-avatar-action="joints"]')
        .getAttribute("aria-pressed") === "true";
    markers.visible = skeleton.visible;
    for (const [key, end] of Object.entries(rig.diagnostics.chains)) {
      const dot = markers.getObjectByName(key);
      dot.visible = end.anchor;
      dot.position.fromArray(end.target);
    }
    const next =
      creator && viewMode !== "motion"
        ? "나만의 캐릭터 · 드래그로 회전"
        : pose.phaseLabel;
    if (next !== phaseText) {
      host.querySelector(".avatar-phase").textContent = next;
      phaseText = next;
    }
    if (document.activeElement !== scrub)
      scrub.value = String(Math.round(phase * 1000));
    renderer.render(scene, camera);
    const panel = host.querySelector(".joint-panel");
    if (panel?.open) {
      for (const spec of JOINTS) {
        const joint = rig.diagnostics.joints[spec.name];
        const bind = rig.rest[spec.name].quaternion.toArray();
        const degrees = rotationDegrees(joint.input, bind)
          .map((v) => v.toFixed(1) + "°")
          .join(" / ");
        const solved = rotationDegrees(joint.output, bind)
          .map((v) => v.toFixed(1) + "°")
          .join(" / ");
        host.querySelector(`[data-joint-input="${spec.name}"]`).textContent =
          degrees;
        host.querySelector(`[data-joint-output="${spec.name}"]`).textContent =
          solved;
      }
    }
  }
  host.addEventListener(
    "click",
    (e) => {
      const b = e.target.closest("[data-avatar-action]");
      if (!b) return;
      const action = b.dataset.avatarAction;
      if (action === "play") {
        playing = !playing;
        sync();
      } else if (["portrait", "fullbody", "motion"].includes(action)) {
        viewMode = action;
        playing = action === "motion";
        azimuth = action === "portrait" ? 0.15 : 0.7;
        elevation = action === "portrait" ? 0.06 : 0.24;
        sync();
        setFrame();
        cameraPosition();
        for (const button of host.querySelectorAll(".creator-views button"))
          button.setAttribute(
            "aria-pressed",
            String(button.dataset.avatarAction === action),
          );
      } else if (action === "joints") {
        b.setAttribute(
          "aria-pressed",
          String(b.getAttribute("aria-pressed") !== "true"),
        );
      } else {
        azimuth = action === "front" ? 0 : action === "side" ? Math.PI / 2 : 1;
        elevation = creator && viewMode === "portrait" ? 0.06 : 0.24;
        zoom = 1;
        cameraPosition();
      }
      setFrame();
    },
    opts,
  );
  scrub.addEventListener(
    "input",
    () => {
      playing = false;
      sync();
      phase = Number(scrub.value) / 1000;
      setFrame();
    },
    opts,
  );
  speedInput.addEventListener(
    "change",
    () => {
      speed = Number(speedInput.value);
    },
    opts,
  );
  stage.addEventListener(
    "pointerdown",
    (e) => {
      drag = { x: e.clientX, y: e.clientY };
      stage.setPointerCapture(e.pointerId);
    },
    opts,
  );
  stage.addEventListener(
    "pointermove",
    (e) => {
      if (!drag) return;
      azimuth -= (e.clientX - drag.x) * 0.009;
      elevation = T.MathUtils.clamp(
        elevation + (e.clientY - drag.y) * 0.007,
        -0.04,
        1.25,
      );
      drag = { x: e.clientX, y: e.clientY };
      cameraPosition();
      setFrame();
    },
    opts,
  );
  stage.addEventListener("pointerup", () => (drag = null), opts);
  stage.addEventListener("pointercancel", () => (drag = null), opts);
  function dispose() {
    if (!alive) return;
    alive = false;
    memory.set(memoryKey, { phase, playing, speed, azimuth, viewMode });
    cancelAnimationFrame(frame);
    abort.abort();
    observer?.disconnect();
    if (scene)
      scene.traverse((o) => {
        if (o.geometry) disposables.add(o.geometry);
        if (o.material)
          for (const m of [].concat(o.material)) {
            disposables.add(m);
            for (const value of Object.values(m))
              if (value?.isTexture) disposables.add(value);
          }
      });
    for (const d of disposables) d.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
  const api = {
    dispose,
    get rig() {
      return rig;
    },
    get diagnostics() {
      return rig?.diagnostics;
    },
    setPhase(value) {
      phase = value;
      playing = false;
      sync();
      setFrame();
    },
    get ready() {
      return !!rig;
    },
  };
  host.avatar = api;
  host
    .querySelector(".joint-panel")
    ?.addEventListener("toggle", setFrame, opts);
  (async () => {
    try {
      const original = await model(normalizeBody(body).model);
      if (!alive) return;
      renderer = new T.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "low-power",
      });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
      renderer.setClearColor("#151f1c");
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
      renderer.domElement.setAttribute("aria-hidden", "true");
      stage.replaceChildren(renderer.domElement);
      renderer.domElement.addEventListener(
        "webglcontextlost",
        (e) => {
          e.preventDefault();
          if (alive) {
            playing = false;
            sync();
            host.querySelector(".avatar-fallback").hidden = false;
          }
        },
        opts,
      );
      scene = new T.Scene();
      scene.fog = new T.Fog("#151f1c", 7, 14);
      camera = new T.PerspectiveCamera(38, 1, 0.02, 30);
      const human = clone(original);
      scene.add(human);
      rig = new HumanoidRig(human, body);
      const shades = new T.DataTexture(
        new Uint8Array([80, 120, 158, 190, 222, 255]),
        6,
        1,
        T.RedFormat,
      );
      shades.minFilter = shades.magFilter = T.LinearFilter;
      shades.needsUpdate = true;
      disposables.add(shades);
      const toon = mat(
        new T.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.82,
          emissive: new T.Color(rig.body.skin).multiplyScalar(0.12),
        }),
      );
      dressMaterial(toon, rig.body);
      const outline = mat(
        new T.MeshBasicMaterial({ color: "#09110e", side: T.BackSide }),
      );
      // Extrude the bind mesh before skinning, keeping outlines attached to the same skeleton.
      outline.onBeforeCompile = (shader) => {
        shader.vertexShader =
          "attribute vec3 sourcePosition; varying float vOutlineHeight;\n" +
          shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          "vec3 transformed = position + normal * 0.00045; vOutlineHeight = sourcePosition.y;",
        );
        shader.fragmentShader =
          "varying float vOutlineHeight;\n" + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "void main() {",
          "void main() { if (vOutlineHeight > " +
            (rig.body.model === "female" ? "1.515" : "1.56") +
            ") discard;",
        );
      };
      for (const mesh of rig.meshes) {
        mesh.material = toon;
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        const edge = mesh.clone(false);
        edge.material = outline;
        edge.skeleton = mesh.skeleton;
        edge.castShadow = false;
        edge.renderOrder = -1;
        mesh.parent.add(edge);
      }
      attachAppearance(rig, shades);
      scene.add(new T.HemisphereLight("#eff0ff", "#617080", 1.75));
      const fill = new T.DirectionalLight("#bed5ff", 1.1);
      fill.position.set(-3, 2, -2);
      scene.add(fill);
      const key = new T.DirectionalLight("#fff0e3", 2.35);
      key.position.set(2.5, 4, 3);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = -2.5;
      key.shadow.camera.right = 2.5;
      key.shadow.camera.top = 3;
      key.shadow.camera.bottom = -3;
      key.shadow.normalBias = 0.02;
      key.shadow.bias = -0.0003;
      scene.add(key);
      ground = new T.Mesh(
        geo(new T.PlaneGeometry(200, 200)),
        mat(new T.MeshStandardMaterial({ color: "#192722", roughness: 1 })),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.008;
      ground.receiveShadow = true;
      scene.add(ground);
      const grid = new T.GridHelper(8, 32, "#334b3e", "#25392e");
      grid.position.y = -0.006;
      grid.material.transparent = true;
      grid.material.opacity = 0.42;
      scene.add(grid);
      equipment = new T.Group();
      scene.add(equipment);
      const metal = mat(
          new T.MeshToonMaterial({ color: "#829891", gradientMap: shades }),
        ),
        s = rig.metrics.scale;
      function rod(from, to, r = 0.027 * s) {
        const va = new T.Vector3(...from),
          vb = new T.Vector3(...to),
          d = vb.clone().sub(va);
        const o = new T.Mesh(
          geo(new T.CylinderGeometry(r, r, d.length(), 12)),
          metal,
        );
        o.position.copy(va).add(vb).multiplyScalar(0.5);
        o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
        o.castShadow = true;
        equipment.add(o);
      }
      const first = sampleMotion(id, 0, rig.metrics);
      if (info.equipment === "bar") {
        const y = first.barHeight + 0.035 * s;
        rod([-0.62 * s, y, 0], [0.62 * s, y, 0]);
        for (const n of [-1, 1]) {
          rod([n * 0.62 * s, 0, 0], [n * 0.62 * s, y, 0]);
          rod([n * 0.62 * s, 0, -0.35 * s], [n * 0.62 * s, 0, 0.35 * s]);
        }
      }
      if (info.equipment === "dip") {
        const x = rig.metrics.shoulderX + 0.06 * s,
          y = first.barHeight - 0.035 * s;
        for (const n of [-1, 1]) {
          rod([n * x, y, -0.45 * s], [n * x, y, 0.55 * s]);
          for (const z of [-0.4, 0.5])
            rod([n * x, 0, z * s], [n * x, y, z * s]);
        }
      }
      skeleton = new T.SkeletonHelper(human);
      skeleton.material.depthTest = false;
      skeleton.material.transparent = true;
      skeleton.material.opacity = 0.75;
      skeleton.renderOrder = 10;
      scene.add(skeleton);
      markers = new T.Group();
      for (const key of ["arm_l", "arm_r", "leg_l", "leg_r"]) {
        const dot = new T.Mesh(
          geo(new T.SphereGeometry(0.018 * s, 8, 8)),
          mat(new T.MeshBasicMaterial({ color: "#ccff00", depthTest: false })),
        );
        dot.name = key;
        dot.renderOrder = 11;
        markers.add(dot);
      }
      scene.add(markers);
      const resize = () => {
        if (!alive) return;
        const width = Math.max(1, stage.clientWidth),
          height = Math.max(1, stage.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        setFrame();
        cameraPosition();
        renderer.render(scene, camera);
      };
      observer = new ResizeObserver(resize);
      observer.observe(stage);
      resize();
      host.dataset.ready = "true";
      onReady?.(api);
      function loop(now) {
        if (!alive) return;
        frame = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (document.hidden) return;
        if (playing) {
          const clip =
            MOTION_CLIPS[creator && viewMode === "motion" ? "squat" : id];
          phase = (phase + (dt * speed) / clip.duration) % 1;
          setFrame();
        }
      }
      frame = requestAnimationFrame(loop);
    } catch (error) {
      if (!alive) return;
      host.dataset.error = "true";
      stage.innerHTML =
        '<div class="avatar-loading">3D 표시를 사용할 수 없습니다</div>';
      host.querySelector(".avatar-fallback").hidden = false;
      host.querySelector(".avatar-controls").hidden = true;
      console.error("Avatar initialization:", error);
    }
  })();
  return api;
}
