import { Quaternion, Euler, MathUtils, Vector3 } from "three";
import library from "../assets/motion-clips.json";

// The stored clips are the complete rotation inputs, including hands and toes.
// Explicit baking authors the inputs; ordinary builds preserve these clips.
export const JOINTS = Object.freeze(library.joints);
export const MOTION_CLIPS = library.clips;
const referenceWorld = {};
for (const joint of JOINTS) {
  referenceWorld[joint.name] = (
    referenceWorld[joint.parent]?.clone() || new Quaternion()
  ).multiply(new Quaternion().fromArray(joint.bindRotation).normalize());
}

// Transfer world-space rotation deltas from the authored bind pose to the
// selected model's bind axes. Names alone do not imply identical joint frames.
export function retargetJointPose(input, rest) {
  const sourcePose = {},
    targetBind = {},
    targetPose = {},
    rotations = {};
  for (const joint of JOINTS) {
    const name = joint.name,
      parent = joint.parent;
    if (!rest[name] || !input.rotations[name])
      throw Error("Incomplete skeleton: " + name);
    sourcePose[name] = (
      sourcePose[parent]?.clone() || new Quaternion()
    ).multiply(new Quaternion().fromArray(input.rotations[name]).normalize());
    targetBind[name] = (
      targetBind[parent]?.clone() || new Quaternion()
    ).multiply(rest[name].quaternion);
    targetPose[name] = sourcePose[name]
      .clone()
      .multiply(referenceWorld[name].clone().invert())
      .multiply(targetBind[name]);
    rotations[name] = (targetPose[parent]?.clone().invert() || new Quaternion())
      .multiply(targetPose[name])
      .normalize()
      .toArray();
  }
  // Scapular offsets are in their parent's bind frame; convert that basis too.
  const clavicleOffsets = {};
  for (const side of ["l", "r"]) {
    const parent = JOINTS.find((j) => j.name === "clavicle_" + side).parent;
    const basis = targetBind[parent]
      .clone()
      .invert()
      .multiply(referenceWorld[parent]);
    clavicleOffsets[side] = new Vector3()
      .fromArray(input.clavicleOffsets[side])
      .applyQuaternion(basis)
      .toArray();
  }
  return { rotations, clavicleOffsets };
}
export function sampleJointPose(id, phase) {
  const clip = MOTION_CLIPS[id];
  if (!clip) throw Error("Missing joint clip: " + id);
  const wrapped = ((phase % 1) + 1) % 1,
    index = Math.max(
      1,
      clip.frames.findIndex((frame) => frame.phase >= wrapped),
    );
  const a = clip.frames[index - 1],
    b = clip.frames[index],
    mix = (wrapped - a.phase) / (b.phase - a.phase),
    rotations = {};
  for (let j = 0; j < JOINTS.length; j++)
    rotations[JOINTS[j].name] = new Quaternion()
      .fromArray(a.rotations[j])
      .normalize()
      .slerp(new Quaternion().fromArray(b.rotations[j]).normalize(), mix)
      .toArray();
  const clavicleOffsets = {};
  for (let j = 0; j < 2; j++)
    clavicleOffsets[j ? "r" : "l"] = a.clavicleOffsets[j].map((v, k) =>
      MathUtils.lerp(v, b.clavicleOffsets[j][k], mix),
    );
  return { rotations, clavicleOffsets };
}
export function rotationDegrees(quaternion, bind) {
  const relative = new Quaternion()
    .fromArray(bind)
    .invert()
    .multiply(new Quaternion().fromArray(quaternion));
  const e = new Euler().setFromQuaternion(relative, "XYZ");
  return [e.x, e.y, e.z].map((v) => MathUtils.radToDeg(v));
}
export const JOINT_LABELS = {
  root: "기준축",
  pelvis: "골반",
  spine_01: "척추 아래",
  spine_02: "척추 중간",
  spine_03: "척추 위",
  neck_01: "목",
  Head: "머리",
  clavicle: "쇄골·어깨뼈",
  upperarm: "위팔 / 어깨",
  lowerarm: "아래팔 / 팔꿈치",
  hand: "손목",
  thigh: "허벅지 / 고관절",
  calf: "종아리 / 무릎",
  foot: "발목",
  ball: "발가락",
  thumb: "엄지",
  index: "검지",
  middle: "중지",
  ring: "약지",
  pinky: "소지",
};
export function jointLabel(name) {
  const exact = JOINT_LABELS[name];
  if (exact) return exact;
  const base = name.split("_")[0],
    side = name.endsWith("_l") ? "L" : name.endsWith("_r") ? "R" : "";
  return `${JOINT_LABELS[base] || base} ${side}${/_0\d/.test(name) ? " · " + name.match(/_0(\d)/)[1] : ""}`;
}
