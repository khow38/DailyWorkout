import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const privateBuild = process.argv.includes("--private");
const privateFiles = privateBuild
  ? Object.fromEntries(
      await Promise.all(
        Object.entries({
          body: "GF_BaseFull.glb",
          head: "GF_Head_001.glb",
          hair: "GF_Hair_204.glb",
          iris: "iris-masks.webp",
          brow: "eyebrow.webp",
        }).map(async ([key, file]) => [
          key,
          (
            await readFile(path.join(root, "assets/private/aion2", file))
          ).toString("base64"),
        ]),
      ),
    )
  : null;
const character = await readFile(path.join(root, "assets/character.glb"));
const femaleCharacter = await readFile(
  path.join(root, "assets/character-female.glb"),
);
const motionData = JSON.parse(
  await readFile(path.join(root, "assets/motion-clips.json"), "utf8"),
);
const jointNames = new Set(motionData.joints.map((j) => j.name));
if (
  motionData.schema !== 1 ||
  jointNames.size !== 65 ||
  motionData.joints.length !== 65
)
  throw Error("Motion library must contain 65 unique joints");
const quaternion = (q) =>
  Array.isArray(q) &&
  q.length === 4 &&
  q.every(Number.isFinite) &&
  Math.abs(Math.hypot(...q) - 1) < 0.00002;
for (const joint of motionData.joints)
  if (
    !quaternion(joint.bindRotation) ||
    (joint.parent !== null && !jointNames.has(joint.parent))
  )
    throw Error("Invalid joint definition: " + joint.name);
for (const [id, clip] of Object.entries(motionData.clips)) {
  if (
    !Number.isFinite(clip.duration) ||
    clip.duration <= 0 ||
    clip.frames.length < 2 ||
    clip.frames[0].phase !== 0 ||
    clip.frames.at(-1).phase !== 1
  )
    throw Error("Invalid motion timing: " + id);
  clip.frames.forEach((frame, i) => {
    if (
      !Number.isFinite(frame.phase) ||
      (i && frame.phase <= clip.frames[i - 1].phase) ||
      frame.rotations.length !== 65 ||
      !frame.rotations.every(quaternion) ||
      frame.clavicleOffsets.length !== 2 ||
      !frame.clavicleOffsets.every(
        (v) => v.length === 3 && v.every(Number.isFinite),
      )
    )
      throw Error(`Incomplete joint inputs: ${id}, frame ${i}`);
  });
}
const license = await readFile(
  path.join(root, "assets/THREE-LICENSE.txt"),
  "utf8",
);
const meshoptLicense = await readFile(
  path.join(root, "assets/MESHOPT-LICENSE.txt"),
  "utf8",
);
const result = await build({
  entryPoints: [path.join(root, "src/avatar.js")],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "FormAvatar",
  minify: true,
  supported: { "template-literal": false },
  target: ["chrome100", "safari15"],
  legalComments: "inline",
  define: {
    __PRIVATE_CHARACTER__: JSON.stringify(privateFiles),
    __CHARACTER_BASE64__: JSON.stringify(character.toString("base64")),
    __FEMALE_CHARACTER_BASE64__: JSON.stringify(
      femaleCharacter.toString("base64"),
    ),
  },
});
const start = "<!-- FORM_AVATAR_START -->",
  end = "<!-- FORM_AVATAR_END -->";
let html = await readFile(path.join(root, "index.html"), "utf8");
const script = `${start}\n<script>/*! ${license}\n${meshoptLicense}\n${privateBuild ? "Private local character experiment: Aion 2 assets belong to NCSOFT; not a redistributable build." : "Character: Quaternius Universal Base Characters, CC0 1.0."} */\n${result.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script>\n${end}`;
if (html.includes(start))
  html =
    html.slice(0, html.indexOf(start)) +
    script +
    html.slice(html.indexOf(end) + end.length);
else html = html.replace("    <script>", () => script + "\n    <script>");
await writeFile(
  path.join(root, privateBuild ? "index.private.html" : "index.html"),
  html.replaceAll("\r\n", "\n"),
);
console.log(
  `Built offline avatar: ${(Buffer.byteLength(script) / 1024 / 1024).toFixed(2)} MB; complete app ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB`,
);
