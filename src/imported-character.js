import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { HumanoidRig, normalizeBody, initializeRig } from "./kinematics.js";
import { JOINTS } from "./joint-poses.js";
import { customizePrivateCharacter } from "./private-shape.js";

// The private build supplies locally acquired assets. Public builds contain none.
export const hasPrivateCharacter =
  typeof __PRIVATE_CHARACTER__ !== "undefined" && !!__PRIVATE_CHARACTER__;
const files = hasPrivateCharacter ? __PRIVATE_CHARACTER__ : null;
const aliases = {
  root: "Bip001",
  pelvis: "Bip001-Pelvis",
  spine_01: "Bip001-Spine",
  spine_02: "Bip001-Spine1",
  spine_03: "Bip001-Spine2",
  neck_01: "Bip001-Neck",
  Head: "Bip001-Head",
};
for (const side of ["l", "r"]) {
  const prefix = "Bip001-" + side.toUpperCase() + "-";
  for (const [a, b] of Object.entries({
    clavicle: "Clavicle",
    upperarm: "UpperArm",
    lowerarm: "Forearm",
    hand: "Hand",
    thigh: "Thigh",
    calf: "Calf",
    foot: "Foot",
    ball: "Toe0",
  }))
    aliases[a + "_" + side] = prefix + b;
  for (const [finger, n] of Object.entries({
    thumb: 0,
    index: 1,
    middle: 2,
    ring: 3,
    pinky: 4,
  }))
    for (let i = 1; i <= 3; i++)
      aliases[`${finger}_0${i}_${side}`] =
        prefix + "Finger" + n + (i === 1 ? "" : i - 1);
}
const decode = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const image = (s) =>
  new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(Error("Private texture failed to decode"));
    i.src = "data:image/webp;base64," + s;
  });

export async function loadPrivateCharacter(body, { materials = true } = {}) {
  if (!files)
    throw Error("Private character assets are not included in this build");
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const loaded = await Promise.all(
    ["body", "head", "hair"].map((k) =>
      loader.parseAsync(decode(files[k]).buffer, ""),
    ),
  );
  const group = new T.Group(),
    master = new Map(),
    meshes = [];
  // Join matching bind skeletons; retain facial/accessory bones and every UV/material/morph.
  for (const [partIndex, g] of loaded.entries()) {
    const part = g.scene;
    part.updateMatrixWorld(true);
    const bones = [];
    part.traverse((o) => {
      if (o.isBone) bones.push(o);
      if (o.isSkinnedMesh) meshes.push(o);
    });
    for (const bone of bones) {
      const prior = master.get(bone.name);
      if (prior) {
        const p = bone.getWorldPosition(new T.Vector3()),
          q = bone.getWorldQuaternion(new T.Quaternion());
        if (
          p.distanceTo(prior.getWorldPosition(new T.Vector3())) > 0.0002 ||
          q.angleTo(prior.getWorldQuaternion(new T.Quaternion())) > 0.001
        ) {
          if (Object.values(aliases).includes(bone.name))
            throw Error("Incompatible bind skeleton: " + bone.name);
          // Unweighted accessory helpers can differ between exports. Keep their own bind frame.
          bone.name = partIndex + "_" + bone.name;
          master.set(bone.name, bone);
        }
      } else master.set(bone.name, bone);
    }
    if (partIndex) {
      for (const bone of bones)
        if (
          master.get(bone.name) === bone &&
          bone.parent?.isBone &&
          master.get(bone.parent.name) !== bone.parent
        )
          master.get(bone.parent.name).add(bone);
      part.traverse((o) => {
        if (o.isSkinnedMesh) {
          const old = o.skeleton;
          const inverses = old.bones.map((b, i) =>
            master
              .get(b.name)
              .matrixWorld.clone()
              .invert()
              .multiply(b.matrixWorld)
              .multiply(old.boneInverses[i]),
          );
          o.skeleton = new T.Skeleton(
            old.bones.map((b) => master.get(b.name)),
            inverses,
          );
        }
      });
      for (const bone of bones)
        if (master.get(bone.name) !== bone) bone.removeFromParent();
    }
    group.add(part);
  }
  group.updateMatrixWorld(true);
  const rig = Object.create(HumanoidRig.prototype);
  rig.scene = group;
  rig.body = normalizeBody(body);
  rig.meshes = meshes;
  rig.bones = {};
  rig.imported = true;
  for (const [name, original] of Object.entries(aliases)) {
    const bone = master.get(original);
    if (!bone) throw Error("Missing imported joint: " + original);
    bone.userData.originalName = original;
    bone.name = name;
    rig.bones[name] = bone;
  }
  for (const spec of JOINTS)
    if (!rig.bones[spec.name]) {
      if (!spec.name.includes("leaf"))
        throw Error("Unmapped joint: " + spec.name);
      const parent = rig.bones[spec.parent],
        bone = new T.Bone();
      bone.name = spec.name;
      parent.add(bone);
      rig.bones[spec.name] = bone;
    }
  // Validate actual parent topology before using source-joint retargeting.
  for (const spec of JOINTS)
    if (spec.parent && rig.bones[spec.name].parent !== rig.bones[spec.parent])
      throw Error("Imported joint topology mismatch: " + spec.name);
  customizePrivateCharacter(rig);
  const bounds = new T.Box3().setFromObject(group),
    height = bounds.max.y - bounds.min.y;
  group.scale.setScalar(rig.body.height / 100 / height);
  group.position.y = -bounds.min.y * group.scale.y;
  group.updateMatrixWorld(true);
  if (materials) await prepareMaterials(meshes, rig.body);
  initializeRig(rig, rig.body.height / 100);
  const reference = (
    await new GLTFLoader().parseAsync(decode(__CHARACTER_BASE64__).buffer, "")
  ).scene;
  calibrateMotion(rig, reference);
  rig.metrics.footY = rig.contactTarget("foot_l", {
    target: [0, 0, 0],
    surface: 0,
    pitch: 0,
  }).y;
  rig.metrics.toeY = rig.contactTarget("foot_l", {
    target: [0, 0, 0],
    surface: 0,
    pitch: T.MathUtils.degToRad(70),
  }).y;
  reference.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [].concat(o.material || [])) m.dispose();
  });
  return rig;
}

function frame(axis, normal) {
  const x = axis.clone().normalize(),
    z = normal.clone().addScaledVector(x, -normal.dot(x)).normalize();
  return new T.Matrix4().makeBasis(
    x,
    new T.Vector3().crossVectors(z, x).normalize(),
    z,
  );
}
function calibrateMotion(rig, reference) {
  reference.updateMatrixWorld(true);
  const src = {};
  reference.traverse((o) => {
    if (o.isBone) src[o.name] = o;
  });
  const point = (bones, name) => bones[name].getWorldPosition(new T.Vector3());
  const direction = (bones, a, b) =>
    point(bones, b).sub(point(bones, a)).normalize();
  const palm = (bones, side) =>
    new T.Vector3()
      .crossVectors(
        direction(bones, "hand_" + side, "index_01_" + side),
        direction(bones, "hand_" + side, "pinky_01_" + side),
      )
      .normalize()
      .multiplyScalar(side === "l" ? -1 : 1);
  rig.motionReference = {};
  rig.palmNormals = {};
  rig.endReference = {};
  const alignments = {};
  for (const spec of JOINTS) {
    const name = spec.name;
    let end = null,
      normal = new T.Vector3(0, 0, 1),
      sourceNormal = normal.clone();
    if (/^(upperarm|lowerarm|thigh|calf|foot|hand)_/.test(name)) {
      const next = {
        upperarm: "lowerarm",
        lowerarm: "hand",
        thigh: "calf",
        calf: "foot",
        foot: "ball",
        hand: "middle_01",
      };
      end = next[name.split("_")[0]] + "_" + name.at(-1);
      if (/^(thigh|calf|foot)/.test(name))
        (normal.set(1, 0, 0), sourceNormal.copy(normal));
      if (name.startsWith("hand"))
        ((normal = palm(rig.bones, name.at(-1))),
          (sourceNormal = palm(src, name.at(-1))));
    } else if (/^(thumb|index|middle|ring|pinky)_0[12]_/.test(name))
      end = name.replace(/_0([12])_/, (_, v) => "_0" + (+v + 1) + "_");
    let q = rig.rest[name].worldQ.clone();
    if (end) {
      let align = new T.Quaternion().setFromRotationMatrix(
        frame(direction(src, name, end), sourceNormal).multiply(
          frame(direction(rig.bones, name, end), normal).invert(),
        ),
      );
      if (name.startsWith("foot_")) {
        // The native body is posed for heeled footwear. Level the actual heel/toe sole samples.
        const points = rig.contactSamples[name].map((p) =>
          p.clone().applyQuaternion(rig.rest[name].worldQ),
        );
        const z = points.map((p) => p.z),
          lo = Math.min(...z),
          hi = Math.max(...z),
          span = hi - lo;
        const heel = points.filter((p) => p.z < lo + span / 3),
          toe = points.filter((p) => p.z > hi - span / 3);
        if (!heel.length || !toe.length)
          throw Error("Missing sole landmarks: " + name);
        let left = -Math.PI / 2,
          right = Math.PI / 4;
        for (let i = 0; i < 32; i++) {
          const angle = (left + right) / 2,
            c = Math.cos(angle),
            s = Math.sin(angle);
          const diff =
            Math.min(...toe.map((p) => p.y * c - p.z * s)) -
            Math.min(...heel.map((p) => p.y * c - p.z * s));
          if (diff > 0) left = angle;
          else right = angle;
        }
        align = new T.Quaternion().setFromAxisAngle(
          new T.Vector3(1, 0, 0),
          (left + right) / 2,
        );
      }
      alignments[name] = align;
      q.premultiply(align);
    } else if (/^(thumb|index|middle|ring|pinky)_03_/.test(name))
      q.premultiply(alignments[name.replace("_03_", "_02_")]);
    else if (name.startsWith("ball_") && !name.includes("leaf"))
      q.premultiply(alignments["foot_" + name.at(-1)]);
    rig.motionReference[name] = q;
  }
  for (const side of ["l", "r"]) {
    const name = "hand_" + side;
    rig.palmNormals[name] = palm(rig.bones, side).applyQuaternion(
      rig.rest[name].worldQ.clone().invert(),
    );
    rig.endReference["foot_" + side] =
      rig.motionReference["foot_" + side].clone();
  }
}

async function prepareMaterials(meshes, body) {
  const [irisMask, browAtlas] = await Promise.all([
    image(files.iris),
    image(files.brow),
  ]);
  const a = body.appearance,
    canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  // The shipped eye material only carries sclera. Compose the native iris mask in its central UV disk.
  ctx.drawImage(irisMask, 0, 0, 512, 512);
  const iris = ctx.getImageData(0, 0, 512, 512),
    out = ctx.createImageData(512, 512),
    color = new T.Color(a.eyeColor).convertLinearToSRGB();
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      const i = (y * 512 + x) * 4,
        r = Math.hypot(x - 256, y - 256) / 256;
      const irisRadius = 0.285,
        pupilRadius = 0.105;
      let c = [240, 233, 231];
      if (r < irisRadius) {
        const mx = Math.min(
            511,
            Math.max(0, Math.round((x - 256) / irisRadius + 256)),
          ),
          my = Math.min(
            511,
            Math.max(0, Math.round((y - 256) / irisRadius + 256)),
          ),
          mi = (my * 512 + mx) * 4;
        const detail = 0.35 + (iris.data[mi + 1] / 255) * 0.8;
        const edge =
          1 - T.MathUtils.smoothstep(r, irisRadius * 0.83, irisRadius) * 0.75;
        c = [color.r, color.g, color.b].map((v) => v * 255 * detail * edge);
        if (r < pupilRadius) c = [8, 6, 6];
      }
      out.data.set([...c, 255], i);
    }
  ctx.putImageData(out, 0, 0);
  const eyeMap = new T.CanvasTexture(canvas);
  eyeMap.flipY = false;
  eyeMap.colorSpace = T.SRGBColorSpace;
  const done = new Set();
  for (const mesh of meshes) {
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (const m of [].concat(mesh.material)) {
      if (done.has(m)) continue;
      done.add(m);
      if (m.name === "MI_GF_Head_001_Eye") {
        m.map = eyeMap;
        m.roughness = 0.18;
        m.metalness = 0;
        m.normalScale?.set(0.25, 0.25);
      } else if (m.name === "MI_GF_Head_001") {
        const c = document.createElement("canvas");
        c.width = c.height = 2048;
        const d = c.getContext("2d");
        d.drawImage(m.map.image, 0, 0, 2048, 2048);
        const bc = document.createElement("canvas");
        bc.width = 512;
        bc.height = 256;
        const b = bc.getContext("2d", { willReadFrequently: true });
        b.drawImage(browAtlas, 0, 11 * 256, 512, 256, 0, 0, 512, 256);
        const px = b.getImageData(0, 0, 512, 256);
        for (let i = 0; i < px.data.length; i += 4) {
          const alpha = Math.max(px.data[i + 3], px.data[i + 2] * 0.45);
          px.data[i] = 42;
          px.data[i + 1] = 29;
          px.data[i + 2] = 25;
          px.data[i + 3] = alpha * 0.88;
        }
        b.putImageData(px, 0, 0);
        // Base head UV is symmetric: keep brows just above the eyelid islands.
        d.drawImage(bc, 634, 645, 260, 91);
        d.save();
        d.translate(2048, 0);
        d.scale(-1, 1);
        d.drawImage(bc, 634, 645, 260, 91);
        d.restore();
        m.map.dispose();
        m.map = new T.CanvasTexture(c);
        m.map.flipY = false;
        m.map.colorSpace = T.SRGBColorSpace;
        m.metalness = 0;
        m.roughness = 0.63;
        m.normalScale?.set(0.55, 0.55);
      } else if (m.name.includes("Hair")) {
        const c = document.createElement("canvas");
        c.width = m.map.image.width;
        c.height = m.map.image.height;
        const d = c.getContext("2d", { willReadFrequently: true });
        d.drawImage(m.map.image, 0, 0);
        const pixels = d.getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < pixels.data.length; i += 4) {
          const shade = Math.min(255, 145 + pixels.data[i]);
          pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = shade;
        }
        d.putImageData(pixels, 0, 0);
        m.map.dispose();
        m.map = new T.CanvasTexture(c);
        m.map.flipY = false;
        m.map.colorSpace = T.SRGBColorSpace;
        m.map.anisotropy = 8;
        m.color.set(a.hairColor);
        m.roughness = 0.5;
        m.alphaTest = 0.08;
        m.alphaToCoverage = true;
        m.side = T.DoubleSide;
      } else if (m.name.includes("Naked")) {
        m.metalness = 0;
        m.roughness = 0.65;
      }
      if (m.name === "MI_EyeAO_Tear") mesh.visible = false;
      m.needsUpdate = true;
    }
  }
}
