import { build } from "esbuild";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = await mkdtemp(path.join(tmpdir(), "form-motion-bake-"));
try {
  const bundle = path.join(temp, "authoring.mjs");
  await build({
    stdin: {
      contents: `export {HumanoidRig} from './src/kinematics.js';export {sampleMotion,motionInfo,EXERCISES} from './src/motions.js';export {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';`,
      resolveDir: root,
    },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: bundle,
  });
  const { HumanoidRig, sampleMotion, motionInfo, EXERCISES, GLTFLoader } =
    await import(pathToFileURL(bundle));
  const bytes = await readFile(path.join(root, "assets/character.glb"));
  const original = (
    await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    )
  ).scene;
  const rig = new HumanoidRig(original, {}),
    names = Object.keys(rig.bones),
    round = (x) => Math.round(x * 1e6) / 1e6;
  const data = {
    schema: 1,
    rotation: "parent-local quaternion [x,y,z,w]; Y-up; metres",
    referenceBody: {
      height: 175,
      weight: 72,
      shoulders: 1,
      waist: 1,
      hips: 1,
      legs: 1,
    },
    joints: names.map((name) => ({
      name,
      parent: rig.bones[name].parent.isBone
        ? rig.bones[name].parent.name
        : null,
      bindRotation: rig.rest[name].quaternion.toArray().map(round),
    })),
    clips: {},
  };
  for (const id of Object.keys(EXERCISES)) {
    const frames = [];
    for (let i = 0; i <= 16; i++) {
      const phase = i / 16;
      rig.apply(sampleMotion(id, phase, rig.metrics));
      frames.push({
        phase,
        rotations: names.map((name) =>
          rig.bones[name].quaternion.toArray().map(round),
        ),
        clavicleOffsets: ["l", "r"].map((side) =>
          rig.bones["clavicle_" + side].position
            .clone()
            .sub(rig.rest["clavicle_" + side].position)
            .toArray()
            .map(round),
        ),
      });
    }
    data.clips[id] = { duration: motionInfo(id).duration, frames };
  }
  const serialized = `{\n  "schema": 1,\n  "rotation": ${JSON.stringify(data.rotation)},\n  "referenceBody": ${JSON.stringify(data.referenceBody)},\n  "joints": [\n${data.joints.map((j) => "    " + JSON.stringify(j)).join(",\n")}\n  ],\n  "clips": {\n${Object.entries(
    data.clips,
  )
    .map(
      ([id, clip]) =>
        `    "${id}": {"duration": ${clip.duration}, "frames": [\n${clip.frames.map((f) => "      " + JSON.stringify(f)).join(",\n")}\n    ]}`,
    )
    .join(",\n")}\n  }\n}\n`;
  await writeFile(path.join(root, "assets/motion-clips.json"), serialized);
  console.log(
    `Baked ${Object.keys(data.clips).length} movements × 17 keyframes × ${names.length} explicit joint rotations`,
  );
} finally {
  if (
    path.dirname(path.resolve(temp)) !== path.resolve(tmpdir()) ||
    !path.basename(temp).startsWith("form-motion-bake-")
  )
    throw Error("Unexpected bake directory");
  await rm(temp, { recursive: true, force: true });
}
