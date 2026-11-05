import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Matrix4, Vector3, Quaternion } from "three";

const source = process.argv[2];
if (!source)
  throw Error(
    "Usage: node scripts/import-hair.mjs <folder containing the four original glTF/bin pairs>",
  );
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = {};
for (const name of [
  "Hair_SimpleParted",
  "Hair_Buzzed",
  "Hair_Long",
  "Hair_Buns",
]) {
  const document = JSON.parse(
    await readFile(path.join(source, name + ".gltf"), "utf8"),
  );
  const buffers = await Promise.all(
    document.buffers.map((buffer) => readFile(path.join(source, buffer.uri))),
  );
  function accessor(index) {
    const a = document.accessors[index],
      view = document.bufferViews[a.bufferView];
    const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const bytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
    if (!size || !bytes || a.sparse || a.normalized)
      throw Error("Unsupported hair accessor");
    const buffer = buffers[view.buffer];
    const data = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    const output = [],
      method = {
        5121: "getUint8",
        5123: "getUint16",
        5125: "getUint32",
        5126: "getFloat32",
      }[a.componentType];
    for (let i = 0; i < a.count; i++)
      for (let k = 0; k < size; k++)
        output.push(
          data[method](
            (view.byteOffset || 0) +
              (a.byteOffset || 0) +
              i * (view.byteStride || size * bytes) +
              k * bytes,
            true,
          ),
        );
    return output;
  }
  const node = document.nodes.find((n) => n.mesh !== undefined);
  const primitive = document.meshes[node.mesh].primitives[0];
  const transform = node.matrix
    ? new Matrix4().fromArray(node.matrix)
    : new Matrix4().compose(
        new Vector3(...(node.translation || [0, 0, 0])),
        new Quaternion(...(node.rotation || [0, 0, 0, 1])),
        new Vector3(...(node.scale || [1, 1, 1])),
      );
  const positions = accessor(primitive.attributes.POSITION),
    indices = accessor(primitive.indices);
  for (let i = 0; i < positions.length; i += 3) {
    const p = new Vector3().fromArray(positions, i).applyMatrix4(transform);
    if (["Hair_Long", "Hair_Buns"].includes(name)) {
      p.x *= 0.977707;
      p.y += 0.042527;
      p.z += 0.005305;
    }
    p.toArray().forEach((v, k) => (positions[i + k] = Number(v.toFixed(6))));
  }
  if (
    positions.some((v) => !Number.isFinite(v)) ||
    indices.some((i) => i < 0 || i >= positions.length / 3)
  )
    throw Error("Invalid hair geometry: " + name);
  result[name] = { positions, indices };
}
await writeFile(
  path.join(root, "assets/hair-meshes.json"),
  JSON.stringify(result) + "\n",
);
console.log(
  "Imported four CC0 hairstyles into the shared character coordinate system.",
);
