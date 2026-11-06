import * as T from "three";

// Dimensionless styling controls. They describe a character, not measured anatomy.
export const PRIVATE_SHAPE_FIELDS = [
  ["headRatio", "두신 비율 · 약", 7.5, 9.5, 9.5, "body"],
  ["legs", "다리 길이", 0.94, 1.10, 1, "body"],
  ["shoulders", "어깨 너비", 0.90, 1.15, 1, "body"],
  ["waist", "허리 볼륨", 0.76, 1.18, 1, "body"],
  ["hips", "골반·힙 볼륨", 0.90, 1.28, 1, "body"],
  ["bust", "가슴 볼륨", 0.85, 1.35, 1, "body"],
  ["thighs", "허벅지 볼륨", 0.90, 1.20, 1, "body"],
  ["faceWidth", "얼굴 너비", 0.90, 1.08, 1, "face"],
  ["jawWidth", "턱선 너비", 0.85, 1.12, 1, "face"],
  ["chinLength", "턱끝 길이", -1, 1, 0, "face"],
  ["cheeks", "볼·광대 너비", 0.90, 1.10, 1, "face"],
  ["eyeSize", "눈 크기", 0.90, 1.12, 1, "face"],
  ["eyeSpacing", "눈 사이 간격", -1, 1, 0, "face"],
  ["browHeight", "눈썹 높이", -1, 1, 0, "face"],
  ["noseWidth", "코 너비", 0.85, 1.15, 1, "face"],
  ["noseBridge", "콧대 높이", -1, 1, 0, "face"],
  ["lipFullness", "입술 볼륨", 0.85, 1.18, 1, "face"],
  ["mouthWidth", "입 너비", 0.90, 1.10, 1, "face"],
  ["smile", "은은한 미소", 0, 0.5, 0, "face"],
];
export const PRIVATE_SHAPE_PRESETS = [
  { id: "original", name: "오리지널", caption: "원본에 가까운 길고 섬세한 실루엣", values: {} },
  { id: "balanced", name: "소프트 밸런스", caption: "8.3등신 · 부드러운 얼굴과 균형 잡힌 체형", values: { headRatio: 8.3, faceWidth: 0.98, jawWidth: 0.94, eyeSize: 1.03, cheeks: 1.02, lipFullness: 1.04, smile: 0.12, waist: 0.93, hips: 1.04 } },
  { id: "eight", name: "팔등신 · 슬림", caption: "8등신 · 긴 다리와 정돈된 턱선", values: { headRatio: 8, legs: 1.06, waist: 0.85, hips: 1.05, shoulders: 0.98, faceWidth: 0.95, jawWidth: 0.92, eyeSize: 1.04, noseWidth: 0.96, smile: 0.10 } },
  { id: "curvy", name: "팔등신 · 글래머", caption: "8등신 · 잘록한 허리와 풍성한 실루엣", values: { headRatio: 8, legs: 1.04, shoulders: 1.02, waist: 0.80, hips: 1.20, bust: 1.30, thighs: 1.08, faceWidth: 0.96, jawWidth: 0.92, cheeks: 1.02, eyeSize: 1.05, noseWidth: 0.94, noseBridge: 0.16, lipFullness: 1.10, smile: 0.15 } },
];
export function normalizePrivateShape(input = {}) {
  if (!input || typeof input !== "object") input = {};
  const out = { preset: PRIVATE_SHAPE_PRESETS.some(p => p.id === input.preset) ? input.preset : Object.keys(input).length ? "custom" : "original" };
  for (const [key, , lo, hi, value] of PRIVATE_SHAPE_FIELDS)
    out[key] = Number.isFinite(input[key]) ? T.MathUtils.clamp(input[key], lo, hi) : value;
  return out;
}
export function privateShapePreset(id) {
  const preset = PRIVATE_SHAPE_PRESETS.find(p => p.id === id) || PRIVATE_SHAPE_PRESETS[0];
  return normalizePrivateShape({ ...preset.values, preset: preset.id });
}

// Construction: adjust native face controls -> decode posed quantized skin ->
// warp skin/clothes/hair and every bind joint together -> rebind in true metres.
// The caller measures this new rest skeleton before constructing exercise IK.
export function customizePrivateCharacter(rig) {
  const shape = rig.body.privateShape, bones = [];
  rig.scene.traverse(o => { if (o.isBone) bones.push(o); });
  const named = new Map(bones.map(b => [b.name, b]));
  shapeFace(named, shape);
  rig.scene.updateMatrixWorld(true);
  const chin = named.get("b_C_ChinTipA_0").getWorldPosition(new T.Vector3());
  const headMesh = rig.meshes.find(m => m.name === "GF_Head_001_2");
  if (!headMesh) throw Error("Missing native face surface");
  headMesh.computeBoundingBox();
  const crown = new T.Box3().setFromObject(headMesh).max.y;
  const foot = Math.min(...rig.meshes.filter(m => m.name.startsWith("GF_BaseFull")).map(m => {
    m.computeBoundingBox(); return new T.Box3().setFromObject(m).min.y;
  }));
  const hip = rig.bones.pelvis.getWorldPosition(new T.Vector3()).y;
  const ankle = rig.bones.foot_l.getWorldPosition(new T.Vector3()).y;
  const legDelta = (hip - ankle) * (shape.legs - 1);
  const headScale = (chin.y - foot + legDelta) / ((shape.headRatio - 1) * (crown - chin.y));
  const warp = bodyWarp(shape, { chin: chin.y, hip, ankle, legDelta, headScale });
  const rest = bones.map(b => ({ bone: b, point: warp(b.getWorldPosition(new T.Vector3())), q: b.getWorldQuaternion(new T.Quaternion()) }));
  for (const mesh of rig.meshes) bakeSkin(mesh, warp);
  // Traversal is parent-first; preserve native axes, remove baked facial scales.
  for (const { bone, point, q } of rest) {
    bone.position.copy(bone.parent.worldToLocal(point));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));
    bone.scale.setScalar(1);
    bone.updateMatrixWorld(true);
  }
  for (const mesh of rig.meshes) {
    mesh.skeleton.calculateInverses();
    mesh.bind(mesh.skeleton, mesh.matrixWorld);
    const smile = mesh.morphTargetDictionary?.Mph_IdleSmile;
    if (smile !== undefined) mesh.morphTargetInfluences[smile] = shape.smile;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }
  const shapedCrown = new T.Box3().setFromObject(headMesh).max.y;
  const shapedChin = named.get("b_C_ChinTipA_0").getWorldPosition(new T.Vector3()).y;
  rig.shapeMetrics = { headRatio: (shapedCrown - foot) / (shapedCrown - shapedChin), headScale };
}

function shapeFace(named, s) {
  // Native eye roots carry both the eyeball and eyelid ring. Move them together.
  for (const side of ["L", "R"]) {
    const root = named.get(`b_${side}_Eye_Root`), sign = side === "L" ? 1 : -1;
    if (!root) throw Error("Missing native eye controls");
    root.scale.setScalar(s.eyeSize);
    shift(root, sign * s.eyeSpacing * 0.003, 0, 0);
  }
  for (const [name, b] of named) {
    if (!name.startsWith("b_")) continue;
    const p = b.getWorldPosition(new T.Vector3());
    let dx = 0, dy = 0, dz = 0;
    if (/Jowl|Plastima/.test(name)) dx += p.x * (s.jawWidth - 1);
    if (/ChinTip/.test(name)) { dx += p.x * (s.jawWidth - 1); dy -= s.chinLength * 0.004; }
    if (/Cheek|Temporalis/.test(name)) dx += p.x * (s.cheeks - 1);
    if (/LidCover|Oculi/.test(name)) dx += Math.sign(p.x) * s.eyeSpacing * 0.002;
    if (/Brow/.test(name)) dy += s.browHeight * 0.003;
    if (/NoseL|Nostril|NoseWrinkle/.test(name)) dx += p.x * (s.noseWidth - 1);
    if (/NoseBridge|NoseTip/.test(name)) dz += s.noseBridge * 0.003;
    if (/Lip/.test(name)) {
      dx += p.x * (s.mouthWidth - 1);
      if (!/Corner/.test(name)) {
        dy += (name.includes("LipU") ? 1 : -1) * (s.lipFullness - 1) * 0.008;
        dz += (s.lipFullness - 1) * 0.006;
      }
    }
    if (dx || dy || dz) shift(b, dx, dy, dz);
  }
}
function shift(b, x, y, z) {
  const p = b.getWorldPosition(new T.Vector3()).add(new T.Vector3(x, y, z));
  b.position.copy(b.parent.worldToLocal(p));
  b.updateMatrixWorld(true);
}
function bodyWarp(s, m) {
  const smooth = T.MathUtils.smoothstep, bell = (y, c, w) => Math.exp(-(((y - c) / w) ** 2));
  return p => {
    const { x, y, z } = p, out = p.clone();
    const core = 1 - smooth(Math.abs(x), 0.15, 0.29);
    const hip = bell(y, 1.06, 0.16), waist = bell(y, 1.25, 0.10), shoulder = bell(y, 1.51, 0.10);
    out.x *= 1 + core * ((s.hips - 1) * hip + (s.waist - 1) * waist) + (s.shoulders - 1) * shoulder;
    out.z *= 1 + core * ((s.hips - 1) * hip * 0.65 + (s.waist - 1) * waist * 0.85);
    out.z += (s.bust - 1) * 0.13 * bell(y, 1.43, 0.085) * core * smooth(z, 0.005, 0.06);
    const thigh = bell(y, 0.86, 0.20) * (1 - smooth(Math.abs(x), 0.20, 0.28));
    out.x += (x - Math.sign(x) * 0.11) * (s.thighs - 1) * thigh;
    out.z *= 1 + (s.thighs - 1) * thigh;
    const head = smooth(y, 1.57, m.chin);
    out.x *= 1 + (m.headScale * s.faceWidth - 1) * head;
    out.z = T.MathUtils.lerp(out.z, 0.002 + (out.z - 0.002) * m.headScale, head);
    out.y += (y - m.chin) * (m.headScale - 1) * head;
    out.y += y > m.hip ? m.legDelta : Math.max(0, y - m.ankle) * (s.legs - 1);
    return out;
  };
}

function bakeSkin(mesh, warp) {
  const old = mesh.geometry, g = old.clone();
  const p = old.attributes.position, normal = old.attributes.normal;
  const positions = new Float32Array(p.count * 3), normals = new Float32Array(p.count * 3);
  const morphs = (old.morphAttributes.position || []).map(() => new Float32Array(p.count * 3));
  const inverse = mesh.matrixWorld.clone().invert(), eps = 0.00002;
  const skin = new T.Matrix4(), part = new T.Matrix4(), v = new T.Vector3();
  for (let i = 0; i < p.count; i++) {
    skin.elements.fill(0);
    for (let k = 0; k < 4; k++) {
      const index = old.attributes.skinIndex.getComponent(i, k), w = old.attributes.skinWeight.getComponent(i, k);
      if (!w) continue;
      part.multiplyMatrices(mesh.skeleton.bones[index].matrixWorld, mesh.skeleton.boneInverses[index]);
      for (let j = 0; j < 16; j++) skin.elements[j] += part.elements[j] * w;
    }
    skin.elements[15] = 1;
    skin.premultiply(mesh.matrixWorld.clone().multiply(mesh.bindMatrixInverse)).multiply(mesh.bindMatrix);
    const source = new T.Vector3().fromBufferAttribute(p, i), world = source.clone().applyMatrix4(skin);
    const changed = warp(world), local = changed.clone().applyMatrix4(inverse);
    local.toArray(positions, i * 3);
    const columns = [new T.Vector3(eps, 0, 0), new T.Vector3(0, eps, 0), new T.Vector3(0, 0, eps)].map(d => warp(world.clone().add(d)).sub(warp(world.clone().sub(d))).multiplyScalar(0.5 / eps));
    const jacobian = new T.Matrix4().makeBasis(...columns);
    const transform = inverse.clone().multiply(jacobian).multiply(skin);
    v.fromBufferAttribute(normal, i).applyMatrix3(new T.Matrix3().getNormalMatrix(transform)).normalize().toArray(normals, i * 3);
    for (let j = 0; j < morphs.length; j++) {
      const delta = new T.Vector3().fromBufferAttribute(old.morphAttributes.position[j], i);
      if (old.morphTargetsRelative) delta.add(source);
      warp(delta.applyMatrix4(skin)).applyMatrix4(inverse).sub(local).toArray(morphs[j], i * 3);
    }
  }
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  // Tangent-space normal maps use derivative tangents after shape changes.
  g.deleteAttribute("tangent");
  if (morphs.length) g.morphAttributes.position = morphs.map(a => new T.Float32BufferAttribute(a, 3));
  else delete g.morphAttributes.position;
  delete g.morphAttributes.normal;
  g.morphTargetsRelative = true;
  g.computeBoundingBox(); g.computeBoundingSphere();
  mesh.geometry = g;
  old.dispose();
}
