import fs from "node:fs";
import { build } from "esbuild";
const clean = (name) => {
  const b = fs.readFileSync("assets/private/aion2/" + name + ".glb"),
    len = b.readUInt32LE(12),
    j = JSON.parse(b.subarray(20, 20 + len));
  delete j.images;
  delete j.textures;
  delete j.materials;
  for (const m of j.meshes) for (const p of m.primitives) delete p.material;
  const raw = Buffer.from(JSON.stringify(j)),
    json = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 32);
  raw.copy(json);
  const bin = b.subarray(20 + len),
    out = Buffer.alloc(20 + json.length + bin.length);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(json.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  json.copy(out, 20);
  bin.copy(out, 20 + json.length);
  return out.toString("base64");
};
await build({
  stdin: {
    contents: `export * from './src/imported-character.js'; export * from './src/private-shape.js'; export {normalizeBody} from './src/kinematics.js'; export * from './src/motions.js'; export * from './src/joint-poses.js'; export * as T from 'three';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "assets/private/test-rig.mjs",
  define: {
    __CHARACTER_BASE64__: JSON.stringify(
      fs.readFileSync("assets/character.glb").toString("base64"),
    ),
    __PRIVATE_CHARACTER__: JSON.stringify({
      body: clean("GF_BaseFull"),
      head: clean("GF_Head_001"),
      hair: clean("GF_Hair_204"),
    }),
  },
});

const { loadPrivateCharacter, sampleMotion, sampleJointPose, T, EXERCISES, PRIVATE_SHAPE_FIELDS, PRIVATE_SHAPE_PRESETS, privateShapePreset, normalizeBody } =
  await import("../assets/private/test-rig.mjs");
const { default: assert } = await import("node:assert/strict");
let cases = 0,
  maxContact = 0,
  minGround = 0;
const profiles = [
  ...[140, 168, 210].map(height => ({ height, privateShape: privateShapePreset("original") })),
  ...PRIVATE_SHAPE_PRESETS.filter(p => p.id !== "original").map(p => ({ height: 175, privateShape: privateShapePreset(p.id) })),
  ...[2, 3].map(end => ({ height: end === 2 ? 140 : 210, privateShape: Object.fromEntries(PRIVATE_SHAPE_FIELDS.map(f => [f[0], f[end]])) })),
  { height: 168, privateShape: { ...privateShapePreset("curvy"), legs: 1.1, shoulders: 0.9, hips: 1.28, waist: 0.76, bust: 1.35 } },
];
for (const profile of profiles) {
  const r = await loadPrivateCharacter(
    { model: "female", ...profile },
    { materials: false },
  );
  assert.deepEqual(normalizeBody(JSON.parse(JSON.stringify(r.body))).privateShape, r.body.privateShape, "shape storage round trip");
  assert.ok(Math.abs(r.shapeMetrics.headRatio - r.body.privateShape.headRatio) < 0.03, "measured head/body proportion");
  const bounds = new T.Box3().setFromObject(r.scene);
  assert.ok(Math.abs(bounds.max.y - bounds.min.y - profile.height / 100) < 0.001, "requested height");
  for (const mesh of r.meshes) {
    const g = mesh.geometry;
    assert.equal(g.attributes.position.normalized, false, "decoded skin positions");
    assert.ok(Array.from(g.attributes.position.array).every(Number.isFinite));
    assert.ok(Array.from(g.attributes.normal.array).every(Number.isFinite));
    if (g.morphAttributes.position) {
      assert.equal(g.morphAttributes.position.length, 14, "original expression shapes retained");
      assert.equal(mesh.morphTargetInfluences.length, 14);
    }
  }
  assert.equal(Object.keys(r.bones).length, 65);
  for (const id of Object.keys(EXERCISES))
    for (let i = 0; i < 16; i++) {
      const p = sampleMotion(id, i / 16, r.metrics);
      p.jointPose = sampleJointPose(id, i / 16);
      r.apply(p);
      cases++;
      assert.ok(
        r.diagnostics.maxContactError < 0.005,
        JSON.stringify(profile) + " " + id + " anchored contact " + r.diagnostics.maxContactError,
      );
      maxContact = Math.max(maxContact, r.diagnostics.maxContactError);
      for (const bone of Object.values(r.bones))
        assert.ok(
          bone.matrixWorld.elements.every(Number.isFinite),
          id + " finite skeleton",
        );
      for (const [key, c] of Object.entries(r.chains)) {
        const actual = r.diagnostics.chains[key];
        if (!actual) continue;
        assert.ok(Math.abs(actual.boneLengths[0] - c.l1) < 0.00001);
        assert.ok(Math.abs(actual.boneLengths[1] - c.l2) < 0.00001);
      }
      if (id === "squat") {
        assert.ok(r.world("hand_l").x > 0);
        assert.ok(r.world("hand_r").x < 0);
      }
      if (["squat", "pushup"].includes(id))
        for (const mesh of r.meshes) {
          mesh.skeleton.update();
          mesh.computeBoundingBox();
          const b = new T.Box3().setFromObject(mesh);
          minGround = Math.min(minGround, b.min.y);
          assert.ok(b.min.y > -0.005, id + " skin penetrates floor");
        }
    }
  r.scene.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [].concat(o.material || [])) m.dispose();
  });
  console.log("Verified profile", profile.height, profile.privateShape.preset || "extreme");
}
console.log(
  JSON.stringify({
    cases,
    maxContactMM: maxContact * 1000,
    minGroundMM: minGround * 1000,
    passed: true,
  }),
);
