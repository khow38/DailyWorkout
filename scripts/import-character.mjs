import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Preserve the source mesh and weighted skeleton, replacing external textures
// with the app's own configurable skin/clothing materials.
const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw Error(
    "Usage: node scripts/import-character.mjs source.gltf output.glb",
  );
const data = JSON.parse(await readFile(input, "utf8"));
if (data.buffers.length !== 1) throw Error("Expected a single geometry buffer");
const binary = await readFile(
  path.resolve(path.dirname(input), data.buffers[0].uri),
);
data.buffers = [{ byteLength: binary.length }];
delete data.images;
delete data.textures;
delete data.samplers;
delete data.extensionsUsed;
delete data.extensionsRequired;
data.materials = [
  {
    name: "FORM configurable surface",
    pbrMetallicRoughness: {
      baseColorFactor: [1, 1, 1, 1],
      metallicFactor: 0,
      roughnessFactor: 1,
    },
  },
];
for (const mesh of data.meshes)
  for (const primitive of mesh.primitives) primitive.material = 0;
const json = Buffer.from(JSON.stringify(data));
const jsonSize = Math.ceil(json.length / 4) * 4,
  binSize = Math.ceil(binary.length / 4) * 4;
const result = Buffer.alloc(28 + jsonSize + binSize);
result.writeUInt32LE(0x46546c67, 0);
result.writeUInt32LE(2, 4);
result.writeUInt32LE(result.length, 8);
result.writeUInt32LE(jsonSize, 12);
result.writeUInt32LE(0x4e4f534a, 16);
result.fill(0x20, 20, 20 + jsonSize);
json.copy(result, 20);
result.writeUInt32LE(binSize, 20 + jsonSize);
result.writeUInt32LE(0x004e4942, 24 + jsonSize);
binary.copy(result, 28 + jsonSize);
await writeFile(output, result);
console.log("Imported", output, result.length, "bytes");
