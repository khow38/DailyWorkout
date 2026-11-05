import * as T from "three";
import { trimHeadGeometry, sourcePoint, canonicalPoint } from "./portrait.js";
import { retargetJointPose } from "./joint-poses.js";
import {
  normalizeAppearance,
  appearanceColor,
  smoothSurfaceNormals,
} from "./appearance.js";

export const BODY_DEFAULT = Object.freeze({
  model: "male",
  height: 175,
  weight: 72,
  shoulders: 1,
  waist: 1,
  hips: 1,
  chest: 1,
  legs: 1,
  skin: "#d7a47f",
});
export const BODY_LIMITS = {
  height: [140, 210],
  weight: [40, 160],
  shoulders: [0.85, 1.18],
  waist: [0.8, 1.25],
  hips: [0.85, 1.2],
  chest: [0.88, 1.14],
  legs: [0.94, 1.06],
};
export function normalizeBody(input = {}) {
  if (!input || typeof input !== "object") input = {};
  const result = { ...BODY_DEFAULT };
  result.model = input.model === "female" ? "female" : "male";
  for (const [key, [min, max]] of Object.entries(BODY_LIMITS))
    if (Number.isFinite(input[key]))
      result[key] = T.MathUtils.clamp(input[key], min, max);
  if (/^#[0-9a-f]{6}$/i.test(input.skin || ""))
    result.skin = input.skin.toLowerCase();
  result.appearance = normalizeAppearance(input.appearance, result.model);
  return result;
}
const v = (a) => new T.Vector3(...a),
  clamp = T.MathUtils.clamp;
const X = new T.Vector3(1, 0, 0),
  Y = new T.Vector3(0, 1, 0);
export const radians = T.MathUtils.degToRad;
export function twoBoneIK(
  start,
  target,
  pole,
  l1,
  l2,
  minFlex = 1,
  maxFlex = 150,
) {
  const raw = target.clone().sub(start),
    rawDistance = raw.length();
  const direction =
    rawDistance > 1e-8
      ? raw.clone().divideScalar(rawDistance)
      : new T.Vector3(0, -1, 0);
  const lengthFor = (angle) =>
    Math.sqrt(l1 * l1 + l2 * l2 + 2 * l1 * l2 * Math.cos(radians(angle)));
  const distance = clamp(rawDistance, lengthFor(maxFlex), lengthFor(minFlex));
  let bend = pole.clone().sub(start);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < 1e-9) {
    bend.copy(Math.abs(direction.y) < 0.9 ? Y : X);
    bend.addScaledVector(direction, -bend.dot(direction));
  }
  bend.normalize();
  const axial = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
  const lateral = Math.sqrt(Math.max(0, l1 * l1 - axial * axial));
  const middle = start
    .clone()
    .addScaledVector(direction, axial)
    .addScaledVector(bend, lateral);
  const end = start.clone().addScaledVector(direction, distance);
  const flex = T.MathUtils.radToDeg(
    Math.acos(
      clamp((distance * distance - l1 * l1 - l2 * l2) / (2 * l1 * l2), -1, 1),
    ),
  );
  return { middle, end, flex, reachError: Math.abs(rawDistance - distance) };
}

function localFrame(axis, normal) {
  const x = axis.clone().normalize(),
    z = normal.clone().addScaledVector(x, -normal.dot(x)).normalize();
  return new T.Matrix4().makeBasis(
    x,
    new T.Vector3().crossVectors(z, x).normalize(),
    z,
  );
}
function rotationBetweenFrames(localAxis, localNormal, worldAxis, worldNormal) {
  return new T.Quaternion().setFromRotationMatrix(
    localFrame(worldAxis, worldNormal).multiply(
      localFrame(localAxis, localNormal).invert(),
    ),
  );
}

// A real weighted humanoid mesh retains its original 65-joint hierarchy.
// Shape changes are applied to both bind vertices and bind joints before rebinding.
export class HumanoidRig {
  constructor(scene, body) {
    this.scene = scene;
    this.body = normalizeBody(body);
    this.bones = {};
    this.meshes = [];
    scene.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isSkinnedMesh) {
        o.geometry = o.geometry.clone();
        o.skeleton.boneInverses = o.skeleton.boneInverses.map((matrix) =>
          matrix.clone(),
        );
        this.meshes.push(o);
      }
    });
    scene.updateMatrixWorld(true);
    const bounds = new T.Box3().setFromObject(scene),
      sourceHeight = bounds.max.y - bounds.min.y;
    const h = this.body.height / 100,
      scale = h / sourceHeight;
    const mass = clamp(
      Math.sqrt(this.body.weight / 72) * Math.pow(1.75 / h, 0.8),
      0.82,
      1.3,
    );
    const warp = (point) => {
      const t = clamp((point.y - bounds.min.y) / sourceHeight, 0, 1);
      const shoulder = Math.exp(-Math.pow((t - 0.8) / 0.12, 2)),
        waist = Math.exp(-Math.pow((t - 0.61) / 0.1, 2)),
        hip = Math.exp(-Math.pow((t - 0.5) / 0.09, 2));
      const core = clamp(1 - Math.max(0, Math.abs(point.x) - 0.22) * 4, 0, 1);
      const xScale =
        1 +
        (this.body.shoulders - 1) * shoulder +
        (this.body.hips - 1) * hip +
        ((this.body.waist - 1) * waist + (mass - 1) * 0.5) * core;
      const zScale =
        1 +
        ((mass - 1) * 0.85 +
          (this.body.waist - 1) * waist * 0.8 +
          (this.body.chest - 1) * Math.exp(-Math.pow((t - 0.76) / 0.065, 2))) *
          core;
      const legRatio = this.body.legs;
      const y =
        t < 0.54
          ? t * legRatio
          : 0.54 * legRatio + ((t - 0.54) * (1 - 0.54 * legRatio)) / 0.46;
      return new T.Vector3(
        point.x * scale * xScale,
        y * h,
        point.z * scale * zScale,
      );
    };
    const restWorld = new Map(
      Object.values(this.bones).map((b) => [
        b,
        warp(b.getWorldPosition(new T.Vector3())),
      ]),
    );
    const shapeNeck = (point) => {
      const p = point.clone(),
        c = canonicalPoint(p, this.body.model),
        region =
          T.MathUtils.smoothstep(c.y, 1.49, 1.535) *
          (1 - T.MathUtils.smoothstep(c.y, 1.6, 1.635)) *
          (1 - T.MathUtils.smoothstep(Math.abs(c.x), 0.1, 0.22));
      p.x *= 1 - region * (this.body.model === "female" ? 0.28 : 0.42);
      p.z = -0.035 + (p.z + 0.035) * (1 - region * 0.16);
      return p;
    };
    this.mapAppearancePoint = (point) => warp(shapeNeck(point));
    this.mapHeadPoint = (point) => warp(sourcePoint(point, this.body.model));
    this.neckBoundary = [];
    for (const mesh of this.meshes) {
      const pos = mesh.geometry.attributes.position,
        inv = mesh.matrixWorld.clone().invert(),
        colors = [],
        sourcePositions = [];
      for (let i = 0; i < pos.count; i++) {
        const original = new T.Vector3()
          .fromBufferAttribute(pos, i)
          .applyMatrix4(mesh.matrixWorld);
        const p = this.mapAppearancePoint(original, mesh.name);
        sourcePositions.push(original.x, original.y, original.z);
        pos.setXYZ(i, ...p.clone().applyMatrix4(inv).toArray());
        const color = appearanceColor(original, mesh.name, this.body);
        colors.push(color.r, color.g, color.b);
      }
      mesh.geometry.setAttribute(
        "color",
        new T.Float32BufferAttribute(colors, 3),
      );
      mesh.geometry.setAttribute(
        "sourcePosition",
        new T.Float32BufferAttribute(sourcePositions, 3),
      );
      this.neckBoundary.push(
        ...trimHeadGeometry(mesh, this.body.model).map((p) =>
          canonicalPoint(
            shapeNeck(sourcePoint(p, this.body.model)),
            this.body.model,
          ),
        ),
      );
      smoothSurfaceNormals(mesh.geometry);
      mesh.geometry.computeBoundingSphere();
    }
    this.neckSamples = [];
    for (const mesh of this.meshes) {
      const { position, normal, sourcePosition, skinIndex, skinWeight } =
        mesh.geometry.attributes;
      const cut = this.body.model === "female" ? 1.57 - 0.042527 : 1.57;
      for (let i = 0; i < position.count; i++)
        if (Math.abs(sourcePosition.getY(i) - cut) < 0.000001) {
          this.neckSamples.push({
            position: new T.Vector3()
              .fromBufferAttribute(position, i)
              .applyMatrix4(mesh.matrixWorld),
            normal: new T.Vector3()
              .fromBufferAttribute(normal, i)
              .transformDirection(mesh.matrixWorld),
            joints: Array.from(skinIndex.array.slice(i * 4, i * 4 + 4)).map(
              (n) => mesh.skeleton.bones[n].name,
            ),
            weights: Array.from(skinWeight.array.slice(i * 4, i * 4 + 4)),
          });
        }
    }
    const depth = (b) => {
      let n = 0;
      while (b.parent) {
        n++;
        b = b.parent;
      }
      return n;
    };
    for (const bone of Object.values(this.bones).sort(
      (a, b) => depth(a) - depth(b),
    )) {
      bone.position.copy(bone.parent.worldToLocal(restWorld.get(bone).clone()));
      bone.updateMatrixWorld(true);
    }
    scene.updateMatrixWorld(true);
    for (const mesh of this.meshes) {
      mesh.skeleton.calculateInverses();
      mesh.bind(mesh.skeleton, mesh.matrixWorld);
    }
    this.rest = {};
    for (const [name, b] of Object.entries(this.bones))
      this.rest[name] = {
        position: b.position.clone(),
        quaternion: b.quaternion.clone(),
        world: b.getWorldPosition(new T.Vector3()),
        worldQ: b.getWorldQuaternion(new T.Quaternion()),
      };
    this.chains = {};
    for (const side of ["l", "r"])
      for (const [type, names, limit] of [
        ["arm", ["upperarm", "lowerarm", "hand"], 150],
        ["leg", ["thigh", "calf", "foot"], 155],
      ]) {
        const [a, b, c] = names.map((n) => this.bones[n + "_" + side]);
        const p = [a, b, c].map((n) => n.getWorldPosition(new T.Vector3())),
          d1 = p[1].clone().sub(p[0]),
          d2 = p[2].clone().sub(p[1]);
        let hinge = new T.Vector3().crossVectors(d1, d2).normalize();
        if (hinge.lengthSq() < 0.1) hinge.copy(type === "leg" ? X : Y);
        this.chains[type + "_" + side] = {
          a,
          b,
          c,
          l1: d1.length(),
          l2: d2.length(),
          limit,
          hingeA: hinge
            .clone()
            .applyQuaternion(this.rest[a.name].worldQ.clone().invert()),
          hingeB: hinge
            .clone()
            .applyQuaternion(this.rest[b.name].worldQ.clone().invert()),
        };
      }
    const r = this.rest;
    this.metrics = {
      height: h,
      hip: r.pelvis.world.y,
      shoulder: r.upperarm_l.world.y - r.pelvis.world.y,
      shoulderX: r.upperarm_l.world.x,
      hipX: r.thigh_l.world.x,
      arm: this.chains.arm_l.l1 + this.chains.arm_l.l2,
      thigh: this.chains.leg_l.l1,
      shin: this.chains.leg_l.l2,
      leg: this.chains.leg_l.l1 + this.chains.leg_l.l2,
      scale: h / 1.75,
    };
    this.contactSamples = {};
    for (const name of ["hand_l", "hand_r", "foot_l", "foot_r"]) {
      const joint = this.bones[name],
        side = name.endsWith("_l") ? "_l" : "_r",
        hand = name.startsWith("hand");
      const points = [];
      for (const mesh of this.meshes) {
        const p = mesh.geometry.attributes.position,
          ids = mesh.geometry.attributes.skinIndex,
          weights = mesh.geometry.attributes.skinWeight;
        for (let i = 0; i < p.count; i++) {
          let weight = 0;
          for (let k = 0; k < 4; k++) {
            const b = mesh.skeleton.bones[ids.array[i * 4 + k]];
            if (
              b?.name.endsWith(side) &&
              (hand
                ? /hand|index|middle|pinky|ring|thumb/.test(b.name)
                : /foot|ball/.test(b.name))
            )
              weight += weights.array[i * 4 + k];
          }
          if (weight > 0.7)
            points.push(
              new T.Vector3()
                .fromBufferAttribute(p, i)
                .applyMatrix4(mesh.matrixWorld)
                .sub(this.rest[name].world)
                .applyQuaternion(this.rest[name].worldQ.clone().invert()),
            );
        }
      }
      this.contactSamples[name] = points;
    }
    this.diagnostics = {};
    this.metrics.toeY = this.contactTarget("foot_l", {
      target: [0, 0, 0],
      surface: 0,
      pitch: radians(70),
    }).y;
    this.metrics.footY = this.contactTarget("foot_l", {
      target: [0, 0, 0],
      surface: 0,
      pitch: 0,
    }).y;
  }
  world(name) {
    return this.bones[name].getWorldPosition(new T.Vector3());
  }
  setWorldQ(b, q) {
    b.quaternion.copy(
      b.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q),
    );
    b.updateMatrixWorld(true);
  }
  reset() {
    for (const [n, b] of Object.entries(this.bones)) {
      b.position.copy(this.rest[n].position);
      b.quaternion.copy(this.rest[n].quaternion);
    }
    this.scene.updateMatrixWorld(true);
  }
  orientTorso(pose) {
    if (pose.jointPose) {
      const values = pose.jointPose.rotations;
      for (const [name, bone] of Object.entries(this.bones)) {
        const q = values[name];
        if (!q || q.length !== 4 || !q.every(Number.isFinite))
          throw Error("Missing/invalid rotation input: " + name);
        bone.quaternion.fromArray(q).normalize();
      }
      this.scene.updateMatrixWorld(true);
      const pelvis = this.bones.pelvis;
      pelvis.position.copy(pelvis.parent.worldToLocal(v(pose.root)));
      for (const side of ["l", "r"]) {
        const b = this.bones["clavicle_" + side];
        b.position
          .copy(this.rest[b.name].position)
          .add(
            v(pose.jointPose.clavicleOffsets[side]).multiplyScalar(
              this.metrics.scale,
            ),
          );
      }
      this.scene.updateMatrixWorld(true);
      return;
    }
    const b = this.bones.pelvis;
    b.position.copy(b.parent.worldToLocal(v(pose.root)));
    b.updateMatrixWorld(true);
    if (pose.lineToFeet) {
      const end = pose.ends.leg_l,
        foot = this.contactTarget("foot_l", end);
      pose = {
        ...pose,
        pitch: Math.atan2(
          pose.root[2] - foot.z,
          pose.root[1] + 0.02 * this.metrics.scale - foot.y,
        ),
      };
    }
    for (const name of [
      "pelvis",
      "spine_01",
      "spine_02",
      "spine_03",
      "neck_01",
      "Head",
    ]) {
      const pitch =
        name === "pelvis"
          ? (pose.pelvisPitch ?? pose.pitch)
          : name === "Head" || name === "neck_01"
            ? (pose.headPitch ?? pose.pitch)
            : (pose.spinePitch ?? pose.pitch);
      const q = new T.Quaternion()
        .setFromAxisAngle(Y, pose.yaw || 0)
        .multiply(new T.Quaternion().setFromAxisAngle(X, pitch));
      this.setWorldQ(this.bones[name], q.multiply(this.rest[name].worldQ));
    }
    for (const side of ["l", "r"]) {
      const b = this.bones["clavicle_" + side],
        n = side === "l" ? 1 : -1;
      b.position.copy(this.rest[b.name].position);
      b.quaternion.copy(this.rest[b.name].quaternion);
      const down = new T.Vector3(
        0,
        clamp(pose.scapula || 0, -0.04, 0.04) * this.metrics.scale,
        0,
      ).applyQuaternion(
        b.parent.getWorldQuaternion(new T.Quaternion()).invert(),
      );
      b.position.add(down);
      b.updateMatrixWorld(true);
      // Couple overhead/reaching arm motion to the shoulder girdle, with bounded
      // upward rotation and protraction rather than rotating only the humerus.
      const end = pose.ends["arm_" + side];
      if (end) {
        const torso = new T.Quaternion()
          .setFromAxisAngle(Y, pose.yaw || 0)
          .multiply(
            new T.Quaternion().setFromAxisAngle(
              X,
              pose.spinePitch ?? pose.pitch,
            ),
          );
        const direction = this.contactTarget("hand_" + side, end)
          .sub(this.world("upperarm_" + side))
          .normalize()
          .applyQuaternion(torso.clone().invert());
        const elevation = Math.acos(clamp(-direction.y, -1, 1));
        const upward = clamp((elevation - radians(30)) * 0.18, 0, radians(25));
        const protraction = clamp(direction.z * 0.13, -radians(4), radians(8));
        const q = b
          .getWorldQuaternion(new T.Quaternion())
          .premultiply(
            new T.Quaternion().setFromAxisAngle(
              new T.Vector3(0, 0, 1).applyQuaternion(torso),
              n * upward,
            ),
          )
          .premultiply(
            new T.Quaternion().setFromAxisAngle(
              Y.clone().applyQuaternion(torso),
              -n * protraction,
            ),
          );
        this.setWorldQ(b, q);
      }
    }
  }
  endRotation(name, end) {
    if (name.startsWith("foot"))
      return new T.Quaternion()
        .setFromAxisAngle(Y, end.yaw || 0)
        .multiply(new T.Quaternion().setFromAxisAngle(X, end.pitch || 0))
        .multiply(this.rest[name].worldQ);
    const localForward = this.rest["middle_01_" + name.at(-1)].world
      .clone()
      .sub(this.rest[name].world)
      .normalize()
      .applyQuaternion(this.rest[name].worldQ.clone().invert());
    const localNormal = new T.Vector3(0, -1, 0).applyQuaternion(
      this.rest[name].worldQ.clone().invert(),
    );
    return rotationBetweenFrames(
      localForward,
      localNormal,
      v(end.fingers || [0, 0, 1]),
      v(end.normal || [0, -1, 0]),
    );
  }
  contactTarget(name, end) {
    const target = v(end.target);
    if (end.surface !== undefined) {
      const q = this.endRotation(name, end);
      let min = Infinity;
      for (const p of this.contactSamples[name])
        min = Math.min(min, p.clone().applyQuaternion(q).y);
      target.y = end.surface - min;
    }
    return target;
  }
  apply(pose) {
    if (pose.jointPose)
      pose = {
        ...pose,
        jointPose: retargetJointPose(pose.jointPose, this.rest),
      };
    this.reset();
    this.orientTorso(pose);
    // Whole-body reach correction keeps contact targets fixed while the root adapts to the user's limb lengths.
    const targets = Object.fromEntries(
      Object.entries(pose.ends).map(([key, end]) => [
        key,
        this.contactTarget(this.chains[key].c.name, end),
      ]),
    );
    for (let k = 0; k < 48; k++) {
      let correction = new T.Vector3(),
        weight = 0;
      for (const [key, end] of Object.entries(pose.ends)) {
        const c = this.chains[key],
          a = c.a.getWorldPosition(new T.Vector3());
        if (end.anchor) {
          const d = targets[key].clone().sub(a),
            len = d.length(),
            max =
              Math.sqrt(
                c.l1 * c.l1 +
                  c.l2 * c.l2 +
                  2 * c.l1 * c.l2 * Math.cos(radians(1)),
              ) - 0.00005,
            min =
              Math.sqrt(
                c.l1 * c.l1 +
                  c.l2 * c.l2 +
                  2 * c.l1 * c.l2 * Math.cos(radians(end.maxFlex || c.limit)),
              ) + 0.00005;
          if (len > max || len < min) {
            correction.addScaledVector(
              d,
              (len - clamp(len, min, max)) / Math.max(len, 0.000001),
            );
            weight++;
          }
        }
        if (end.jointContact) {
          const d = v(end.jointContact).sub(a),
            len = d.length();
          if (Math.abs(len - c.l1) > 0.0001) {
            correction.addScaledVector(d, (len - c.l1) / len);
            weight++;
          }
        }
      }
      if (!weight || correction.length() < 0.00005) break;
      const adjusted = {
        ...pose,
        root: this.world("pelvis")
          .addScaledVector(correction, 1 / weight)
          .toArray(),
      };
      this.orientTorso(adjusted);
    }
    const diagnostics = {
      chains: {},
      maxContactError: 0,
      root: this.world("pelvis").toArray(),
    };
    for (const [key, end] of Object.entries(pose.ends)) {
      const c = this.chains[key],
        start = c.a.getWorldPosition(new T.Vector3()),
        target =
          pose.jointPose && !end.anchor && !end.jointContact
            ? c.c.getWorldPosition(new T.Vector3())
            : this.contactTarget(c.c.name, end);
      const fkEndQ = c.c.getWorldQuaternion(new T.Quaternion());
      const pole = end.jointContact
        ? v(end.jointContact)
        : pose.jointPose
          ? c.b.getWorldPosition(new T.Vector3())
          : v(end.pole);
      const solution = twoBoneIK(
        start,
        target,
        pole,
        c.l1,
        c.l2,
        1,
        end.maxFlex || c.limit,
      );
      const d1 = solution.middle.clone().sub(start).normalize(),
        d2 = solution.end.clone().sub(solution.middle).normalize();
      let plane = new T.Vector3().crossVectors(d1, d2).normalize();
      if (plane.lengthSq() < 0.1)
        plane.copy(c.hingeA).applyQuaternion(this.rest[c.a.name].worldQ);
      this.setWorldQ(
        c.a,
        rotationBetweenFrames(c.b.position, c.hingeA, d1, plane),
      );
      this.setWorldQ(
        c.b,
        rotationBetweenFrames(c.c.position, c.hingeB, d2, plane),
      );
      let endQ =
          pose.jointPose && !end.anchor
            ? fkEndQ
            : this.endRotation(c.c.name, end),
        distalAngle = 0;
      // Free hands follow the forearm unless a particular palm direction is required.
      // Limit wrist bend to 90 degrees (95 for loaded palms) instead of allowing a broken wrist.
      if (key.startsWith("arm")) {
        const localForward = this.rest["middle_01_" + key.at(-1)].world
          .clone()
          .sub(this.rest[c.c.name].world)
          .normalize()
          .applyQuaternion(this.rest[c.c.name].worldQ.clone().invert());
        const forward = localForward.clone().applyQuaternion(endQ),
          angle = d2.angleTo(forward),
          limit = radians(end.surface !== undefined ? 95 : 85);
        if (angle > limit) {
          const axis = new T.Vector3().crossVectors(forward, d2).normalize();
          if (axis.lengthSq() > 0.01)
            endQ.premultiply(
              new T.Quaternion().setFromAxisAngle(axis, angle - limit),
            );
        }
        distalAngle = T.MathUtils.radToDeg(
          d2.angleTo(localForward.clone().applyQuaternion(endQ)),
        );
      } else {
        const forward = this.rest["ball_" + key.at(-1)].world
          .clone()
          .sub(this.rest[c.c.name].world)
          .normalize()
          .applyQuaternion(this.rest[c.c.name].worldQ.clone().invert())
          .applyQuaternion(endQ);
        const angle = d2.angleTo(forward),
          limited = clamp(angle, radians(30), radians(145));
        const axis = new T.Vector3().crossVectors(forward, d2).normalize();
        if (Math.abs(angle - limited) > 0.0001 && axis.lengthSq() > 0.01)
          endQ.premultiply(
            new T.Quaternion().setFromAxisAngle(axis, angle - limited),
          );
        distalAngle = T.MathUtils.radToDeg(limited);
      }
      this.setWorldQ(c.c, endQ);
      const actual = c.c.getWorldPosition(new T.Vector3());
      const error = actual.distanceTo(target);
      if (end.anchor)
        diagnostics.maxContactError = Math.max(
          diagnostics.maxContactError,
          error,
        );
      diagnostics.chains[key] = {
        flex: solution.flex,
        distalAngle,
        error,
        anchor: !!end.anchor,
        target: target.toArray(),
        actual: actual.toArray(),
        jointContactError: end.jointContact
          ? c.b
              .getWorldPosition(new T.Vector3())
              .distanceTo(v(end.jointContact))
          : null,
        boneLengths: [
          start.distanceTo(c.b.getWorldPosition(new T.Vector3())),
          c.b.getWorldPosition(new T.Vector3()).distanceTo(actual),
        ],
      };
      if (key.startsWith("arm") && end.grip && !pose.jointPose) {
        const axis = new T.Vector3()
          .crossVectors(v(end.fingers), v(end.normal))
          .normalize();
        for (const finger of ["index", "middle", "ring", "pinky", "thumb"])
          for (let j = 1; j <= 3; j++) {
            const b = this.bones[`${finger}_0${j}_${key.at(-1)}`];
            if (!b) continue;
            const q = b
              .getWorldQuaternion(new T.Quaternion())
              .premultiply(
                new T.Quaternion().setFromAxisAngle(
                  axis,
                  radians(finger === "thumb" ? 18 : j === 1 ? 50 : 60),
                ),
              );
            this.setWorldQ(b, q);
          }
      }
    }
    this.scene.updateMatrixWorld(true);
    diagnostics.joints = Object.fromEntries(
      Object.entries(this.bones).map(([name, b]) => [
        name,
        {
          input: pose.jointPose?.rotations[name] || null,
          output: b.quaternion.toArray(),
          parent: b.parent.isBone ? b.parent.name : null,
        },
      ]),
    );
    this.diagnostics = diagnostics;
    return diagnostics;
  }
}
