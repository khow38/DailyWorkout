import * as T from "three";
import { attachPortrait, FACE_SHAPES } from "./portrait.js";
export { FACE_SHAPES };

export const APPEARANCE_DEFAULT = Object.freeze({
  preset: "onyx",
  faceShape: "defined",
  hair: "sidepart",
  hairColor: "#26232e",
  eyeColor: "#574333",
  lipColor: "#b97879",
  topColor: "#90bcb4",
  bottomColor: "#263343",
  shoeColor: "#e7e8e7",
  outfit: "tee",
  earrings: "none",
  softness: 0.65,
  faceLength: 0.96,
  faceWidth: 1,
  eyeOpenness: 0.9,
  lipFullness: 1,
  browThickness: 0.85,
  noseLength: 0.96,
  jaw: 0.94,
  chin: 0,
  cheeks: 0,
  eyeSize: 1.02,
  eyeSpacing: 0,
  eyeTilt: 0.18,
  noseBridge: 0.25,
  noseWidth: 0.95,
  mouthWidth: 1,
  browLift: 0,
  hairVolume: 1,
});
export const APPEARANCE_LIMITS = {
  faceLength: [0.88, 1.1],
  faceWidth: [0.9, 1.1],
  eyeOpenness: [0.72, 1.22],
  lipFullness: [0.75, 1.35],
  browThickness: [0.5, 1.2],
  noseLength: [0.82, 1.15],
  softness: [0, 1],
  jaw: [0.74, 1.12],
  chin: [-1, 1],
  cheeks: [-1, 1],
  eyeSize: [0.88, 1.2],
  eyeSpacing: [-1, 1],
  eyeTilt: [-1, 1],
  noseBridge: [-1, 1],
  noseWidth: [0.78, 1.18],
  mouthWidth: [0.85, 1.15],
  browLift: [-1, 1],
  hairVolume: [0.85, 1.16],
};
export const HAIRSTYLES = [
  ["sidepart", "사이드 파트"],
  ["curtain", "센터 파트"],
  ["crop", "숏 크롭"],
  ["bob", "레이어드 보브"],
  ["long", "롱 레이어"],
  ["bun", "트윈 번"],
  ["none", "헤어 없음"],
];
export const STYLE_PRESETS = [
  {
    id: "onyx",
    name: "ONYX",
    caption: "선명한 윤곽 · 사이드 파트",
    accent: "#a4babc",
    values: {
      hair: "sidepart",
      faceShape: "defined",
      softness: 0.65,
      jaw: 0.94,
      eyeSize: 1.02,
      eyeTilt: 0.18,
      noseBridge: 0.25,
      hairColor: "#26232e",
      topColor: "#90bcb4",
    },
  },
  {
    id: "lumi",
    name: "LUMI",
    caption: "부드러운 볼 · 롱 레이어",
    accent: "#dab8c5",
    values: {
      hair: "long",
      faceShape: "soft",
      softness: 0.95,
      jaw: 0.91,
      chin: 0.16,
      cheeks: 0.25,
      eyeSize: 1.05,
      eyeOpenness: 0.9,
      faceLength: 0.98,
      eyeTilt: 0.1,
      noseBridge: -0.2,
      noseWidth: 0.84,
      browLift: 0.22,
      hairColor: "#46313b",
      eyeColor: "#75535b",
      lipColor: "#bc7684",
      topColor: "#b2a5ce",
      bottomColor: "#383345",
      earrings: "silver",
    },
  },
  {
    id: "sion",
    name: "SION",
    caption: "차분한 인상 · 센터 파트",
    accent: "#a8b5d1",
    values: {
      hair: "curtain",
      faceShape: "balanced",
      softness: 0.6,
      jaw: 0.92,
      chin: 0.25,
      eyeSize: 1.08,
      eyeSpacing: 0.12,
      noseBridge: 0.1,
      hairColor: "#343945",
      eyeColor: "#636c7a",
      topColor: "#a2b9d5",
      bottomColor: "#2c3446",
    },
  },
  {
    id: "aeri",
    name: "AERI",
    caption: "또렷한 눈매 · 트윈 번",
    accent: "#c5c29e",
    values: {
      hair: "bun",
      faceShape: "heart",
      softness: 0.82,
      jaw: 0.94,
      chin: 0.1,
      cheeks: 0.2,
      eyeSize: 1.12,
      eyeTilt: 0.45,
      browLift: 0.15,
      noseWidth: 0.86,
      hairColor: "#392c2a",
      eyeColor: "#5d4932",
      lipColor: "#b36d72",
      topColor: "#cac5ab",
      bottomColor: "#394138",
      earrings: "gold",
    },
  },
];
export function normalizeAppearance(input = {}, model = "male") {
  if (!input || typeof input !== "object") input = {};
  const a = {
    ...APPEARANCE_DEFAULT,
    ...(model === "female"
      ? STYLE_PRESETS.find((p) => p.id === "lumi").values
      : {}),
    preset: model === "female" ? "lumi" : "onyx",
  };
  for (const [key, [lo, hi]] of Object.entries(APPEARANCE_LIMITS))
    if (Number.isFinite(input[key]))
      a[key] = T.MathUtils.clamp(input[key], lo, hi);
  for (const key of [
    "hairColor",
    "eyeColor",
    "lipColor",
    "topColor",
    "bottomColor",
    "shoeColor",
  ])
    if (/^#[0-9a-f]{6}$/i.test(input[key] || ""))
      a[key] = input[key].toLowerCase();
  if (FACE_SHAPES.some((f) => f.id === input.faceShape))
    a.faceShape = input.faceShape;
  if (HAIRSTYLES.some(([id]) => id === input.hair)) a.hair = input.hair;
  if (["tee", "tank", "longsleeve"].includes(input.outfit))
    a.outfit = input.outfit;
  if (["none", "silver", "gold"].includes(input.earrings))
    a.earrings = input.earrings;
  if (
    STYLE_PRESETS.some((p) => p.id === input.preset) ||
    input.preset === "custom"
  )
    a.preset = input.preset;
  return a;
}
export function appearancePreset(id) {
  const preset = STYLE_PRESETS.find((p) => p.id === id);
  if (!preset) throw Error("Unknown style preset");
  return normalizeAppearance({
    ...APPEARANCE_DEFAULT,
    ...preset.values,
    preset: id,
  });
}
const gauss = (value, center, width) =>
  Math.exp(-Math.pow((value - center) / width, 2));

export function appearanceColor(point, meshName, body) {
  const a = body.appearance;
  const skin = new T.Color(body.skin),
    hair = new T.Color(a.hairColor);
  if (meshName === "Eyes") return new T.Color("#eee9df");
  if (meshName === "Eyebrows") return hair.multiplyScalar(0.75);
  let color = skin.clone();
  if (point.z > 0.045 && point.y > 1.6) {
    const blush =
      gauss(Math.abs(point.x), 0.042, 0.021) *
      gauss(point.y, 1.672, 0.016) *
      (0.1 + 0.11 * a.softness);
    color.lerp(new T.Color("#c27f7d"), blush);
    const lips =
      gauss(point.y, 1.631, 0.005) *
      gauss(point.x, 0, 0.025) *
      T.MathUtils.smoothstep(point.z, 0.07, 0.088);
    color.lerp(new T.Color(a.lipColor), lips * (0.65 + 0.3 * a.softness));
  }
  return color;
}

export function dressMaterial(material, body) {
  const appearance = body.appearance;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.formTop = { value: new T.Color(appearance.topColor) };
    shader.uniforms.formBottom = { value: new T.Color(appearance.bottomColor) };
    shader.uniforms.formShoe = { value: new T.Color(appearance.shoeColor) };
    shader.uniforms.formSleeve = {
      value:
        appearance.outfit === "longsleeve"
          ? 0.4
          : appearance.outfit === "tee"
            ? 0.18
            : 0.115,
    };
    shader.vertexShader =
      "attribute vec3 sourcePosition; varying vec3 vFormSource;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvFormSource = sourcePosition;",
    );
    shader.fragmentShader =
      "#define FORM_HEIGHT " +
      (body.model === "female" ? "1.76664" : "1.81008") +
      "\n" +
      "varying vec3 vFormSource; uniform vec3 formTop; uniform vec3 formBottom; uniform vec3 formShoe; uniform float formSleeve;\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float fy=vFormSource.y/FORM_HEIGHT; float fx=abs(vFormSource.x)/FORM_HEIGHT;
      vec3 canonical=vFormSource*(1.81008/FORM_HEIGHT);
      float neckline=1.495+.065*pow(abs(canonical.x)/.074,2.0);
      bool collar=abs(canonical.x)<.074 && canonical.y>neckline;
      if(fy<.058){diffuseColor.rgb=formShoe;}
      else if(fy>.39 && fy<.555){diffuseColor.rgb=formBottom;if(abs(fx-.055)<.004)diffuseColor.rgb=mix(formBottom,formTop,.4);if(fy>.54)diffuseColor.rgb*=.7;}
      else if(fy>=.555 && fy<.89 && fx<formSleeve && !collar){diffuseColor.rgb=formTop;if(vFormSource.z>.04 && abs(vFormSource.x)>.13 && fy<.78)diffuseColor.rgb*=.76;if(fy<.57)diffuseColor.rgb*=.7;}
    `,
    );
  };
  material.customProgramCacheKey = () =>
    `form-clothing-v2-${body.model}-${appearance.outfit}`;
}

// Accessories are real geometry in head-bone space and follow every exercise.
export function attachAppearance(rig, gradientMap) {
  return attachPortrait(rig, gradientMap);
}

// The source GLB duplicates vertices at material/normal seams. Average coincident
// normals without merging vertices, preserving skin weights and facial topology.
export function smoothSurfaceNormals(geometry) {
  geometry.computeVertexNormals();
  const p = geometry.attributes.position,
    n = geometry.attributes.normal,
    groups = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)]
      .map((v) => Math.round(v * 100000))
      .join(",");
    let group = groups.get(key);
    if (!group) {
      group = { indices: [], normal: new T.Vector3() };
      groups.set(key, group);
    }
    group.indices.push(i);
    group.normal.add(new T.Vector3(n.getX(i), n.getY(i), n.getZ(i)));
  }
  for (const group of groups.values()) {
    group.normal.normalize();
    for (const i of group.indices)
      n.setXYZ(i, group.normal.x, group.normal.y, group.normal.z);
  }
  n.needsUpdate = true;
}
