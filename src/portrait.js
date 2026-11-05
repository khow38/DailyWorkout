import * as T from "three";
import hairMeshes from "../assets/hair-meshes.json";

export const FACE_SHAPES = [
  {
    id: "balanced",
    name: "균형형",
    detail: "정돈된 이목구비",
    jaw: 1,
    cheek: 1,
    chin: 0,
    eye: 0,
  },
  {
    id: "soft",
    name: "소프트형",
    detail: "부드러운 볼과 눈매",
    jaw: 1.03,
    cheek: 1.045,
    chin: 0.002,
    eye: 0.001,
  },
  {
    id: "defined",
    name: "선명형",
    detail: "또렷한 턱선과 콧대",
    jaw: 1.1,
    cheek: 0.98,
    chin: -0.002,
    eye: -0.0005,
  },
  {
    id: "heart",
    name: "하트형",
    detail: "넓은 상안부 · 섬세한 턱",
    jaw: 0.89,
    cheek: 1.04,
    chin: 0.001,
    eye: 0.001,
  },
];
const gaussian = (v, c, w) => Math.exp(-Math.pow((v - c) / w, 2));
export function canonicalPoint(p, model) {
  p = p.clone();
  if (model === "female") {
    p.x *= 0.977707;
    p.y += 0.042527;
    p.z += 0.005305;
  }
  return p;
}
export function sourcePoint(p, model) {
  p = p.clone();
  if (model === "female") {
    p.x /= 0.977707;
    p.y -= 0.042527;
    p.z -= 0.005305;
  }
  return p;
}

// Clip the old head at a real mesh boundary. Intersections interpolate all
// vertex attributes, merging skin influences instead of interpolating IDs.
export function trimHeadGeometry(mesh, model) {
  const g = mesh.geometry,
    attrs = g.attributes,
    boundary = [],
    output = {};
  for (const key of Object.keys(attrs)) output[key] = [];
  const cut = model === "female" ? 1.57 - 0.042527 : 1.57;
  const read = (i) =>
    Object.fromEntries(
      Object.entries(attrs).map(([k, a]) => [
        k,
        Array.from(a.array.slice(i * a.itemSize, (i + 1) * a.itemSize)),
      ]),
    );
  const blend = (a, b, t) => {
    const v = {};
    for (const key of Object.keys(attrs))
      v[key] = a[key].map((x, j) => T.MathUtils.lerp(x, b[key][j], t));
    const weights = new Map();
    for (const [point, weight] of [
      [a, 1 - t],
      [b, t],
    ])
      for (let k = 0; k < 4; k++)
        weights.set(
          point.skinIndex[k],
          (weights.get(point.skinIndex[k]) || 0) + point.skinWeight[k] * weight,
        );
    const sorted = [...weights].sort((a, b) => b[1] - a[1]).slice(0, 4);
    while (sorted.length < 4) sorted.push([0, 0]);
    const sum = sorted.reduce((s, x) => s + x[1], 0);
    v.skinIndex = sorted.map((x) => x[0]);
    v.skinWeight = sorted.map((x) => x[1] / sum);
    boundary.push(canonicalPoint(new T.Vector3(...v.sourcePosition), model));
    return v;
  };
  const count = g.index?.count ?? attrs.position.count;
  for (let i = 0; i < count; i += 3) {
    const polygon = [0, 1, 2].map((j) =>
        read(g.index ? g.index.getX(i + j) : i + j),
      ),
      clipped = [];
    for (let j = 0; j < 3; j++) {
      const a = polygon[j],
        b = polygon[(j + 1) % 3],
        inside = a.sourcePosition[1] <= cut,
        next = b.sourcePosition[1] <= cut;
      if (inside) clipped.push(a);
      if (inside !== next)
        clipped.push(
          blend(
            a,
            b,
            (cut - a.sourcePosition[1]) /
              (b.sourcePosition[1] - a.sourcePosition[1]),
          ),
        );
    }
    for (let j = 1; j < clipped.length - 1; j++)
      for (const v of [clipped[0], clipped[j], clipped[j + 1]])
        for (const key of Object.keys(attrs)) output[key].push(...v[key]);
  }
  const next = new T.BufferGeometry();
  for (const [key, values] of Object.entries(output))
    next.setAttribute(
      key,
      new T.BufferAttribute(
        key === "skinIndex"
          ? new Uint16Array(values)
          : new Float32Array(values),
        attrs[key].itemSize,
      ),
    );
  mesh.geometry = next;
  g.dispose();
  return boundary;
}

const rings = [
  [1.57, 0.043, 0.025, -0.067],
  [1.59, 0.041, 0.027, -0.067],
  [1.61, 0.042, 0.035, -0.07],
  [1.625, 0.043, 0.066, -0.075],
  [1.642, 0.055, 0.079, -0.082],
  [1.66, 0.064, 0.081, -0.089],
  [1.68, 0.068, 0.081, -0.094],
  [1.707, 0.069, 0.076, -0.098],
  [1.735, 0.068, 0.078, -0.101],
  [1.765, 0.063, 0.07, -0.098],
  [1.792, 0.045, 0.047, -0.083],
  [1.808, 0.02, 0.011, -0.05],
  [1.813, 0.001, -0.018, -0.02],
];
function profile(y) {
  let i = rings.findIndex((r) => r[0] >= y);
  i = Math.max(1, i);
  const a = rings[i - 1],
    b = rings[i],
    t = T.MathUtils.clamp((y - a[0]) / (b[0] - a[0]), 0, 1),
    before = rings[Math.max(0, i - 2)],
    after = rings[Math.min(rings.length - 1, i + 1)];
  return a.slice(1).map((v, k) => {
    const m0 =
        ((b[k + 1] - before[k + 1]) / (b[0] - before[0])) * (b[0] - a[0]),
      m1 = ((after[k + 1] - a[k + 1]) / (after[0] - a[0])) * (b[0] - a[0]);
    return (
      (2 * t * t * t - 3 * t * t + 1) * v +
      (t * t * t - 2 * t * t + t) * m0 +
      (-2 * t * t * t + 3 * t * t) * b[k + 1] +
      (t * t * t - t * t) * m1
    );
  });
}

export function attachPortrait(rig, gradientMap) {
  const a = rig.body.appearance,
    female = rig.body.model === "female",
    shape = FACE_SHAPES.find((f) => f.id === a.faceShape) || FACE_SHAPES[0];
  const group = new T.Group();
  group.name = "CharacterAppearance";
  rig.bones.Head.add(group);
  const skinColor = new T.Color(rig.body.skin),
    skin = new T.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      emissive: skinColor.clone().multiplyScalar(0.12),
    });
  const lipColor = new T.Color(a.lipColor),
    hairColor = new T.Color(a.hairColor);
  const hairMaterial = new T.MeshStandardMaterial({
    color: hairColor,
    roughness: 0.64,
    metalness: 0,
    side: T.DoubleSide,
  });
  const eyeY = 1.704 + shape.eye,
    eyeX = 0.0305 + a.eyeSpacing * 0.0035;
  const eyeWidth = 0.0165 * a.eyeSize,
    upper = (female ? 0.0074 : 0.006) * a.eyeSize * a.eyeOpenness,
    lower = 0.0035 * a.eyeSize * a.eyeOpenness;
  const eyeTilt = 0.0012 + a.eyeTilt * 0.0022;
  function transform(p) {
    p = p.clone();
    const head = T.MathUtils.smoothstep(p.y, 1.59, 1.64);
    p.x *= 1 + (a.faceWidth - 1) * head;
    p.y = 1.704 + (p.y - 1.704) * (1 + (a.faceLength - 1) * head);
    return p;
  }
  function widthAt(y) {
    const p = profile(y),
      jaw = gaussian(y, 1.625, 0.026),
      cheek = gaussian(y, 1.672, 0.025);
    return (
      p[0] *
      (female ? 0.96 : 1.04) *
      (1 +
        (shape.jaw * a.jaw - 1) * jaw +
        (shape.cheek - 1 + a.cheeks * 0.055) * cheek)
    );
  }
  function surface(x, y, front = true) {
    const p = profile(y),
      w = widthAt(y),
      cos = Math.sqrt(Math.max(0, 1 - (x / w) ** 2));
    let z = (p[1] + p[2]) / 2 + (((front ? 1 : -1) * (p[1] - p[2])) / 2) * cos;
    if (front) {
      z +=
        0.005 * gaussian(Math.abs(x), 0.037, 0.02) * gaussian(y, 1.669, 0.022);
      const bridge = (female ? 0.007 : 0.009) + a.noseBridge * 0.004;
      z +=
        bridge *
        gaussian(x, 0, 0.0065 * a.noseWidth) *
        gaussian(y, 1.69, 0.02 * a.noseLength);
      z +=
        (female ? 0.01 : 0.013) *
        gaussian(x, 0, 0.009 * a.noseWidth) *
        gaussian(y, 1.678, 0.006);
      z +=
        0.004 *
        gaussian(Math.abs(x), 0.01 * a.noseWidth, 0.004) *
        gaussian(y, 1.675, 0.0045);
      z -=
        0.0015 * gaussian(Math.abs(x), eyeX, 0.019) * gaussian(y, eyeY, 0.009);
      z += 0.0018 * gaussian(x, 0, 0.024) * gaussian(y, 1.658, 0.008);
      z +=
        0.002 *
        (1 - a.softness) *
        gaussian(x, 0, 0.025) *
        gaussian(y, 1.621, 0.013);
    }
    return z;
  }
  const boundary = (rig.neckBoundary || [])
    .map((p) => ({ angle: Math.atan2(p.x, p.z + 0.025), p }))
    .sort((a, b) => a.angle - b.angle);
  function neck(phi) {
    if (!boundary.length) return null;
    let angle = phi > Math.PI ? phi - Math.PI * 2 : phi;
    let i = boundary.findIndex((v) => v.angle >= angle);
    if (i < 0) i = 0;
    const b = boundary[i],
      c = boundary[(i + boundary.length - 1) % boundary.length];
    let lo = c.angle,
      hi = b.angle;
    if (hi < lo) hi += Math.PI * 2;
    if (angle < lo) angle += Math.PI * 2;
    return c.p.clone().lerp(b.p, hi - lo < 1e-8 ? 0 : (angle - lo) / (hi - lo));
  }
  function point(y, phi) {
    const x = widthAt(y) * Math.sin(phi),
      front = Math.cos(phi) >= 0,
      p = new T.Vector3(x, y, surface(x, y, front));
    p.y +=
      shape.chin * gaussian(y, 1.627, 0.017) -
      a.chin * 0.007 * gaussian(y, 1.627, 0.019);
    if (y < 1.624) {
      const seam = neck(phi);
      if (seam) {
        const blend = 1 - T.MathUtils.smoothstep(y, 1.57, 1.624);
        p.x = T.MathUtils.lerp(p.x, seam.x, blend);
        p.z = T.MathUtils.lerp(p.z, seam.z, blend);
      }
    }
    p.y -= 0.002 * (1 - T.MathUtils.smoothstep(y, 1.57, 1.58));
    return p;
  }
  function skinTint(p) {
    const c = skinColor.clone();
    if (p.z > 0) {
      const blush =
        (female ? 0.16 : 0.09) *
        gaussian(Math.abs(p.x), 0.04, 0.017) *
        gaussian(p.y, 1.682, 0.016);
      c.lerp(new T.Color("#c56b70"), blush);
      const shade =
        0.08 *
        gaussian(Math.abs(p.x), eyeX, 0.02) *
        gaussian(p.y, eyeY + 0.008, 0.007);
      c.lerp(new T.Color("#b17b72"), shade);
    }
    return c;
  }
  function localGeometry(geometry) {
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const p = rig
        .mapHeadPoint(transform(new T.Vector3().fromBufferAttribute(pos, i)))
        .sub(rig.rest.Head.world)
        .applyQuaternion(rig.rest.Head.worldQ.clone().invert());
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    geometry.computeVertexNormals();
    return geometry;
  }
  function add(geometry, material, name) {
    localGeometry(geometry);
    const mesh = new T.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  }
  function paint(geometry) {
    const p = geometry.attributes.position,
      colors = [];
    for (let i = 0; i < p.count; i++)
      colors.push(
        ...skinTint(new T.Vector3().fromBufferAttribute(p, i)).toArray(),
      );
    geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    return geometry;
  }
  function pathMesh(points, radius, material, name) {
    const curve = new T.CatmullRomCurve3(
      points.map((p) => new T.Vector3(...p)),
    );
    return add(
      new T.TubeGeometry(
        curve,
        Math.max(18, points.length * 3),
        radius,
        8,
        false,
      ),
      material,
      name,
    );
  }
  function ellipsoid(center, size, material, name) {
    const g = new T.SphereGeometry(1, 28, 18);
    g.scale(...size);
    g.translate(...center);
    if (material === skin) paint(g);
    return add(g, material, name);
  }

  const vertices = [],
    indices = [],
    colors = [],
    rowCount = 126,
    cols = 160;
  function inEye(p) {
    if (p.z < 0.035) return false;
    const u = (Math.abs(p.x) - eyeX) / eyeWidth;
    if (Math.abs(u) >= 1) return false;
    const arch = Math.pow(Math.max(0, 1 - u * u), 0.65),
      center = eyeY + u * eyeTilt;
    return p.y > center - lower * arch && p.y < center + upper * arch;
  }
  for (let i = 0; i <= rowCount; i++)
    for (let j = 0; j <= cols; j++) {
      const p = point(
        T.MathUtils.lerp(1.57, 1.813, i / rowCount),
        (j / cols) * Math.PI * 2,
      );
      vertices.push(...p.toArray());
      colors.push(...skinTint(p).toArray());
    }
  for (let i = 0; i < rowCount; i++)
    for (let j = 0; j < cols; j++) {
      const k = i * (cols + 1) + j;
      for (const tri of [
        [k, k + 1, k + cols + 1],
        [k + 1, k + cols + 2, k + cols + 1],
      ]) {
        const center = new T.Vector3();
        for (const n of tri)
          center.add(new T.Vector3().fromArray(vertices, n * 3));
        center.divideScalar(3);
        if (!inEye(center)) indices.push(...tri);
      }
    }
  const headGeo = new T.BufferGeometry();
  headGeo.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
  headGeo.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  headGeo.setIndex(indices);
  const skeleton = rig.meshes[0].skeleton,
    headIndex = skeleton.bones.findIndex((b) => b.name === "Head"),
    neckIndex = skeleton.bones.findIndex((b) => b.name === "neck_01"),
    skinIndices = [],
    skinWeights = [];
  const pos = headGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const p = new T.Vector3().fromBufferAttribute(pos, i),
      weight = T.MathUtils.smoothstep(p.y, 1.57, 1.625),
      world = rig.mapHeadPoint(transform(p));
    pos.setXYZ(i, ...world.toArray());
    skinIndices.push(headIndex, neckIndex, 0, 0);
    skinWeights.push(weight, 1 - weight, 0, 0);
  }
  headGeo.setAttribute(
    "skinIndex",
    new T.Uint16BufferAttribute(skinIndices, 4),
  );
  headGeo.setAttribute(
    "skinWeight",
    new T.Float32BufferAttribute(skinWeights, 4),
  );
  headGeo.computeVertexNormals();
  const normals = headGeo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const canonicalY = vertices[i * 3 + 1];
    if (canonicalY > 1.59 || !rig.neckSamples.length) continue;
    const world = new T.Vector3().fromBufferAttribute(pos, i),
      nearest = rig.neckSamples.reduce(
        (best, s) =>
          s.position.distanceToSquared(world) <
          best.position.distanceToSquared(world)
            ? s
            : best,
        rig.neckSamples[0],
      );
    const t = T.MathUtils.smoothstep(canonicalY, 1.57, 1.59),
      normal = nearest.normal
        .clone()
        .lerp(new T.Vector3().fromBufferAttribute(normals, i), t)
        .normalize();
    normals.setXYZ(i, ...normal.toArray());
    const weights = new Map([
      [headIndex, skinWeights[i * 4] * t],
      [neckIndex, skinWeights[i * 4 + 1] * t],
    ]);
    nearest.joints.forEach((name, j) => {
      const index = skeleton.bones.findIndex((b) => b.name === name);
      weights.set(
        index,
        (weights.get(index) || 0) + nearest.weights[j] * (1 - t),
      );
    });
    const values = [...weights].sort((a, b) => b[1] - a[1]).slice(0, 4);
    while (values.length < 4) values.push([0, 0]);
    const total = values.reduce((n, p) => n + p[1], 0);
    values.forEach(([joint, weight], j) => {
      headGeo.attributes.skinIndex.array[i * 4 + j] = joint;
      headGeo.attributes.skinWeight.array[i * 4 + j] = weight / total;
    });
  }

  const headMesh = new T.SkinnedMesh(headGeo, skin);
  headMesh.name = "SculptedHead";
  headMesh.bind(skeleton, new T.Matrix4());
  headMesh.castShadow = true;
  headMesh.frustumCulled = false;
  rig.scene.add(headMesh);
  rig.portraitMesh = headMesh;

  const dark = new T.MeshStandardMaterial({
      color: hairColor.clone().multiplyScalar(0.5),
      roughness: 0.72,
    }),
    mouthLine = new T.MeshStandardMaterial({
      color: lipColor.clone().multiplyScalar(0.66),
      roughness: 0.9,
    });
  for (const side of [-1, 1]) {
    const positions = [],
      uv = [],
      ix = [],
      steps = 60,
      rows = 16;
    for (let i = 0; i <= steps; i++) {
      const u = (i / steps) * 2 - 1,
        arch = Math.pow(Math.max(0, 1 - u * u), 0.65),
        x = side * (eyeX + u * eyeWidth),
        cy = eyeY + u * eyeTilt;
      for (let j = 0; j <= rows; j++) {
        const y = cy + T.MathUtils.lerp(-lower * arch, upper * arch, j / rows);
        positions.push(
          x,
          y,
          surface(x, y) +
            0.0008 +
            0.0014 * (1 - u * u) * Math.sin((Math.PI * j) / rows),
        );
        uv.push(
          (x - side * eyeX) / (eyeWidth * 2) + 0.5,
          (y - eyeY) / 0.024 + 0.5,
        );
        if (i < steps && j < rows) {
          const k = i * (rows + 1) + j;
          ix.push(k, k + rows + 1, k + 1, k + 1, k + rows + 1, k + rows + 2);
        }
      }
    }
    const eyeGeo = new T.BufferGeometry();
    eyeGeo.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    eyeGeo.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    eyeGeo.setIndex(ix);
    const texture = eyeTexture(
      a.eyeColor,
      eyeWidth * 2,
      0.024,
      female ? 0.007 : 0.0065,
    );
    add(
      eyeGeo,
      new T.MeshStandardMaterial({
        map: texture,
        roughness: 0.25,
        side: T.DoubleSide,
      }),
      "EyeSurface",
    );
    const top = [],
      bottom = [],
      brow = [];
    for (let i = 0; i <= 32; i++) {
      const u = (i / 32) * 2 - 1,
        arch = Math.pow(Math.max(0, 1 - u * u), 0.65),
        x = side * (eyeX + u * eyeWidth),
        cy = eyeY + u * eyeTilt;
      top.push([x, cy + upper * arch, surface(x, cy + upper * arch) + 0.001]);
      bottom.push([
        x,
        cy - lower * arch,
        surface(x, cy - lower * arch) + 0.0008,
      ]);
      const by =
        eyeY +
        0.0145 +
        a.browLift * 0.004 +
        u * 0.0015 +
        0.0025 * Math.sin(((u + 1) * Math.PI) / 2);
      brow.push([
        side * (eyeX + u * 0.02),
        by,
        surface(side * (eyeX + u * 0.02), by) + 0.001,
      ]);
    }
    pathMesh(top, female ? 0.0008 : 0.00055, dark, "UpperLid");
    pathMesh(
      bottom,
      0.00032,
      new T.MeshStandardMaterial({
        color: skinColor.clone().lerp(lipColor, 0.22),
        roughness: 0.8,
      }),
      "LowerLid",
    );
    // Flat tapered brow ribbon follows the forehead instead of floating tubes.
    const bp = [],
      bi = [];
    for (let i = 0; i < brow.length; i++) {
      const p = brow[i],
        t = i / (brow.length - 1),
        thick =
          (female ? 0.0016 : 0.0022) *
          a.browThickness *
          Math.pow(Math.sin(Math.PI * (t * 0.88 + 0.08)), 0.6);
      bp.push(p[0], p[1] - thick, p[2], p[0], p[1] + thick, p[2]);
      if (i < brow.length - 1) {
        const k = i * 2;
        bi.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const bg = new T.BufferGeometry();
    bg.setAttribute("position", new T.Float32BufferAttribute(bp, 3));
    bg.setIndex(bi);
    add(
      bg,
      new T.MeshStandardMaterial({
        color: hairColor,
        roughness: 0.9,
        side: T.DoubleSide,
      }),
      "SculptedBrow",
    );
    ellipsoid([side * 0.068, 1.68, -0.015], [0.01, 0.023, 0.012], skin, "Ear");
    ellipsoid(
      [side * 0.073, 1.68, -0.005],
      [0.003, 0.013, 0.004],
      new T.MeshStandardMaterial({
        color: skinColor.clone().lerp(lipColor, 0.18),
        roughness: 0.8,
      }),
      "EarConcha",
    );
    if (a.earrings !== "none")
      ellipsoid(
        [side * 0.07, 1.662, -0.003],
        [0.0025, 0.0025, 0.0025],
        new T.MeshStandardMaterial({
          color: a.earrings === "gold" ? "#dfbf78" : "#dce3ed",
          metalness: 0.8,
          roughness: 0.22,
        }),
        "EarStud",
      );
  }
  const lipWidth = (female ? 0.0205 : 0.022) * a.mouthWidth,
    mouthY = 1.657,
    lipPoints = [];
  for (const top of [true, false]) {
    const p = [],
      ix = [],
      n = 64,
      m = 8;
    for (let i = 0; i <= n; i++) {
      const u = (i / n) * 2 - 1,
        x = u * lipWidth,
        shape = Math.max(0, 1 - u * u),
        line = mouthY + 0.0007 * (u * u);
      lipPoints.push([x, line, surface(x, line) + 0.002]);
      const thickness =
        (top ? 0.0025 + 0.0013 * gaussian(Math.abs(u), 0.32, 0.2) : 0.0038) *
        shape *
        a.lipFullness;
      for (let j = 0; j <= m; j++) {
        const t = j / m,
          y = line + (top ? 1 : -1) * thickness * t,
          z = surface(x, y) + 0.001 + 0.0018 * Math.sin(Math.PI * t) * shape;
        p.push(x, y, z);
        if (i < n && j < m) {
          const k = i * (m + 1) + j;
          ix.push(k, k + 1, k + m + 1, k + 1, k + m + 2, k + m + 1);
        }
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(p, 3));
    g.setIndex(ix);
    add(
      g,
      new T.MeshStandardMaterial({
        color: lipColor.clone().lerp(skinColor, top ? 0.25 : 0.12),
        roughness: 0.5,
        side: T.DoubleSide,
      }),
      top ? "UpperLip" : "LowerLip",
    );
  }
  pathMesh(lipPoints.slice(0, 65), 0.00016, mouthLine, "MouthSeam");
  for (const side of [-1, 1])
    ellipsoid(
      [
        side * 0.0075 * a.noseWidth,
        1.674,
        surface(side * 0.0075 * a.noseWidth, 1.674) + 0.0003,
      ],
      [0.0016, 0.00065, 0.0005],
      new T.MeshStandardMaterial({
        color: skinColor.clone().multiplyScalar(0.76),
        roughness: 1,
      }),
      "Nostril",
    );

  if (a.hair !== "none") {
    const name =
        a.hair === "crop"
          ? "Hair_Buzzed"
          : a.hair === "bun"
            ? "Hair_Buns"
            : ["bob", "long", "curtain"].includes(a.hair)
              ? "Hair_Long"
              : "Hair_SimpleParted",
      data = hairMeshes[name],
      positions = data.positions.slice();
    for (let i = 0; i < positions.length; i += 3) {
      let x = positions[i],
        y = positions[i + 1],
        z = positions[i + 2];
      if (a.hair === "bob" && y < 1.695) y = 1.695 + (y - 1.695) * 0.5;
      if (a.hair === "curtain" && y < 1.705) y = 1.705 + (y - 1.705) * 0.28;
      const volume = a.hairVolume;
      positions[i] = x * volume * 0.98;
      positions[i + 1] = 1.71 + (y - 1.71) * volume;
      positions[i + 2] = -0.015 + (z + 0.015) * volume;
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    g.setIndex(data.indices);
    add(g, hairMaterial, "StyledHair");
  }
  return group;
}

function eyeTexture(color, width, height, radius) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#eee6df";
  ctx.fillRect(0, 0, 512, 256);
  const x = 256,
    y = 128,
    rx = (radius / width) * 512,
    ry = (radius / height) * 256;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const gradient = ctx.createRadialGradient(0, 0, rx * 0.15, 0, 0, rx);
  gradient.addColorStop(0, "#30282b");
  gradient.addColorStop(0.42, color);
  gradient.addColorStop(0.82, color);
  gradient.addColorStop(1, "#29272d");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 110; i++) {
    const angle = (i / 110) * Math.PI * 2;
    ctx.strokeStyle = i % 2 ? "#ffffff22" : "#17131933";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * rx * 0.4, Math.sin(angle) * rx * 0.4);
    ctx.lineTo(Math.cos(angle) * rx * 0.88, Math.sin(angle) * rx * 0.88);
    ctx.stroke();
  }
  ctx.fillStyle = "#16151d";
  ctx.beginPath();
  ctx.arc(0, 0, rx * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff9f1";
  ctx.beginPath();
  ctx.ellipse(
    -rx * 0.25,
    -rx * 0.36,
    rx * 0.19,
    rx * 0.15,
    -0.3,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.fillStyle = "#ffffff99";
  ctx.beginPath();
  ctx.arc(rx * 0.3, rx * 0.35, rx * 0.075, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
