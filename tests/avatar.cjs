const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { build } = require("esbuild");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "form-avatar-"));
let browser;
async function main() {
  const bundle = path.join(temp, "rig.mjs");
  await build({
    stdin: {
      contents: `export * from './src/kinematics.js';export * from './src/motions.js';export * from './src/joint-poses.js';export {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';export {clone} from 'three/addons/utils/SkeletonUtils.js';export * as T from 'three';`,
      resolveDir: root,
    },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: bundle,
  });
  const {
    HumanoidRig,
    normalizeBody,
    sampleMotion,
    sampleJointPose,
    retargetJointPose,
    T,
    JOINTS,
    MOTION_CLIPS,
    EXERCISES,
    GLTFLoader,
    clone,
  } = await import(pathToFileURL(bundle));
  const bytes = fs.readFileSync(path.join(root, "assets/character.glb"));
  const original = (
    await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    )
  ).scene;
  const femaleBytes = fs.readFileSync(
    path.join(root, "assets/character-female.glb"),
  );
  const femaleOriginal = (
    await new GLTFLoader().parseAsync(
      femaleBytes.buffer.slice(
        femaleBytes.byteOffset,
        femaleBytes.byteOffset + femaleBytes.byteLength,
      ),
      "",
    )
  ).scene;
  const models = { male: original, female: femaleOriginal };
  const originalInverses = [];
  original.traverse((o) => {
    if (o.isSkinnedMesh)
      originalInverses.push(o.skeleton.boneInverses.map((m) => m.toArray()));
  });
  const bodies = [
    {},
    {
      height: 140,
      weight: 40,
      shoulders: 0.85,
      waist: 0.8,
      hips: 0.85,
      legs: 0.94,
    },
    {
      height: 210,
      weight: 160,
      shoulders: 1.18,
      waist: 1.25,
      hips: 1.2,
      legs: 1.06,
    },
    {
      height: 160,
      weight: 120,
      shoulders: 1.18,
      waist: 1.25,
      hips: 0.85,
      legs: 1.06,
    },
    {
      height: 200,
      weight: 55,
      shoulders: 0.85,
      waist: 0.8,
      hips: 1.2,
      legs: 0.94,
    },
  ];
  let count = 0,
    maxError = 0,
    maxKneeError = 0;
  assert.equal(JOINTS.length, 65);
  assert.deepEqual(
    Object.keys(MOTION_CLIPS).sort(),
    Object.keys(EXERCISES).sort(),
  );
  for (const [id, clip] of Object.entries(MOTION_CLIPS)) {
    assert.equal(clip.frames.length, 17, `${id}: complete keyframes`);
    for (const frame of clip.frames) {
      assert.equal(frame.rotations.length, 65);
      for (const q of frame.rotations)
        assert.ok(
          q.length === 4 &&
            q.every(Number.isFinite) &&
            Math.abs(Math.hypot(...q) - 1) < 0.00001,
        );
    }
    assert.deepEqual(
      clip.frames[0].rotations,
      clip.frames.at(-1).rotations,
      `${id}: seamless loop`,
    );
  }
  for (const model of ["male", "female"])
    for (const body of bodies) {
      const rig = new HumanoidRig(clone(models[model]), {
        ...body,
        model,
        chest: body.weight > 100 ? 1.14 : 0.88,
      });
      assert.equal(Object.keys(rig.bones).length, 65);
      for (const spec of JOINTS)
        assert.equal(
          rig.bones[spec.name].parent.isBone
            ? rig.bones[spec.name].parent.name
            : null,
          spec.parent,
        );
      const neutral = retargetJointPose(
        {
          rotations: Object.fromEntries(
            JOINTS.map((j) => [j.name, j.bindRotation]),
          ),
          clavicleOffsets: { l: [0, 0, 0], r: [0, 0, 0] },
        },
        rig.rest,
      );
      for (const spec of JOINTS)
        assert.ok(
          new T.Quaternion()
            .fromArray(neutral.rotations[spec.name])
            .angleTo(rig.rest[spec.name].quaternion.clone().normalize()) <
            0.00001,
          model + ": bind pose remains neutral",
        );

      for (const id of Object.keys(EXERCISES))
        for (let i = 0; i < 16; i++) {
          const phase = (i + 0.37) / 16;
          const pose = {
              ...sampleMotion(id, phase, rig.metrics),
              jointPose: sampleJointPose(id, phase),
            },
            d = rig.apply(pose);
          assert.ok(d.root.every(Number.isFinite), `${id}: finite root`);
          for (const [key, c] of Object.entries(d.chains)) {
            assert.ok(
              c.flex >= 0.999 &&
                c.flex <= (key.startsWith("arm") ? 150.001 : 155.001),
              `${id}: hinge limits`,
            );
            assert.ok(
              c.distalAngle >= 0 &&
                c.distalAngle <= (key.startsWith("arm") ? 95.001 : 145.001),
              `${id}: distal limits`,
            );
            assert.ok(c.actual.every(Number.isFinite), `${id}: finite joints`);
            assert.ok(
              Math.abs(c.boneLengths[0] - rig.chains[key].l1) < 0.00001 &&
                Math.abs(c.boneLengths[1] - rig.chains[key].l2) < 0.00001,
              `${id}: constant bone length`,
            );
            if (c.anchor) {
              maxError = Math.max(maxError, c.error);
              assert.ok(c.error < 0.005, `${id}: contact error ${c.error}`);
            }
            if (c.jointContactError !== null) {
              maxKneeError = Math.max(maxKneeError, c.jointContactError);
              assert.ok(
                c.jointContactError < 0.005,
                `${id}: kneeling contact ${c.jointContactError}`,
              );
            }
          }
          count++;
        }
    }
  const current = [];
  original.traverse((o) => {
    if (o.isSkinnedMesh)
      current.push(o.skeleton.boneInverses.map((m) => m.toArray()));
  });
  assert.deepEqual(
    current,
    originalInverses,
    "Shape previews cannot mutate the cached model",
  );
  const again = new HumanoidRig(clone(original), {}),
    same = new HumanoidRig(clone(original), {});
  assert.deepEqual(again.metrics, same.metrics);
  assert.equal(normalizeBody({ height: 1, weight: 999 }).height, 140);
  assert.equal(normalizeBody(null).height, 175);
  console.log(
    `PASS ${count} articulated poses across two base meshes × ${bodies.length} body profiles; 65 bones; max fixed-contact error ${(maxError * 1000).toFixed(2)} mm; max kneeling-contact error ${(maxKneeError * 1000).toFixed(2)} mm; stable bind pose`,
  );
  const executablePath =
    process.env.BROWSER_PATH ||
    [
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    ].find(fs.existsSync);
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    }),
    errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (r) => requests.push(r.url()));
  await page.goto(pathToFileURL(path.join(root, "index.html")).href);
  assert.deepEqual(
    await page.evaluate(() => Object.keys(E).sort()),
    Object.keys(EXERCISES).sort(),
  );
  await page.evaluate(() => {
    S.profile = defaultProfile();
    S.plan = generate(S.profile);
    start(0);
  });
  await page.waitForSelector("[data-ready=true]");
  await page.click("[data-action=body]");
  await page.waitForSelector("#dialog [data-ready=true]");
  const maleThumb = await page
    .locator("[data-preset-portrait=lumi]")
    .getAttribute("src");
  assert.ok(maleThumb.startsWith("data:image/jpeg;base64,"));
  const beforeLook = await page.evaluate(() => ({
    metrics: avatarController.rig.metrics,
    head: Array.from(
      avatarController.rig.portraitMesh.geometry.attributes.position.array,
    ).reduce((sum, v, i) => sum + v * ((i % 17) + 1), 0),
  }));
  await page.locator("[data-look-preset=lumi]").click();
  await page.waitForTimeout(220);
  await page.waitForSelector("#dialog [data-ready=true]");
  const afterLook = await page.evaluate(() => ({
    metrics: avatarController.rig.metrics,
    head: Array.from(
      avatarController.rig.portraitMesh.geometry.attributes.position.array,
    ).reduce((sum, v, i) => sum + v * ((i % 17) + 1), 0),
    headChildren: avatarController.rig.bones.Head.getObjectByName(
      "CharacterAppearance",
    ).children.length,
  }));
  assert.deepEqual(
    afterLook.metrics,
    beforeLook.metrics,
    "Appearance must preserve the skeleton dimensions",
  );
  assert.notEqual(
    afterLook.head,
    beforeLook.head,
    "Face presets deform the actual mesh",
  );
  assert.ok(
    afterLook.headChildren > 10,
    "Real hair and eye geometry is attached to the head",
  );
  await page.locator("[data-model=female]").click();
  await page.waitForTimeout(220);
  await page.waitForSelector("#dialog [data-ready=true]");
  assert.equal(
    await page.evaluate(() => avatarController.rig.body.model),
    "female",
  );
  assert.ok(
    await page.evaluate(() =>
      avatarController.rig.meshes.some((m) => m.name === "Superhero_Female"),
    ),
  );
  assert.notEqual(
    await page.locator("[data-preset-portrait=lumi]").getAttribute("src"),
    maleThumb,
    "Base selection switches the actual portrait thumbnails",
  );
  assert.ok(
    await page
      .locator("[data-preset-portrait]")
      .evaluateAll((images) =>
        images.every((img) => img.complete && img.naturalWidth > 0),
      ),
  );
  await page.getByRole("tab", { name: "얼굴", exact: true }).click();
  const sculptedShapes = [];
  const femaleMetrics = await page.evaluate(() => avatarController.rig.metrics);
  for (const faceShape of ["balanced", "soft", "defined", "heart"]) {
    await page.locator(`[data-face-shape=${faceShape}]`).click();
    await page.waitForFunction(
      (shape) => avatarController?.rig?.body.appearance.faceShape === shape,
      faceShape,
    );
    await page.waitForSelector("#dialog [data-ready=true]");
    assert.equal(
      await page
        .locator(`[data-face-shape=${faceShape}]`)
        .getAttribute("aria-pressed"),
      "true",
    );
    sculptedShapes.push(
      await page.evaluate(() =>
        Array.from(
          avatarController.rig.portraitMesh.geometry.attributes.position.array,
        ).reduce((sum, v, i) => sum + v * ((i % 17) + 1), 0),
      ),
    );
    assert.deepEqual(
      await page.evaluate(() => avatarController.rig.metrics),
      femaleMetrics,
    );
  }
  assert.equal(
    new Set(sculptedShapes).size,
    4,
    "Each base shape changes the actual head surface",
  );
  await page.locator("[data-look=jaw]").fill("0.81");
  await page.locator("[data-look=eyeSpacing]").fill("0.35");
  await page.locator("[data-look=faceLength]").fill("0.92");
  await page.locator("[data-look=lipFullness]").fill("1.16");
  await page.getByRole("tab", { name: "헤어", exact: true }).click();
  for (const hair of [
    "crop",
    "curtain",
    "bob",
    "long",
    "bun",
    "none",
    "sidepart",
  ]) {
    await page.locator(`[data-hair=${hair}]`).click();
    await page.waitForTimeout(180);
    await page.waitForSelector("#dialog [data-ready=true]");
    assert.equal(
      await page.evaluate(() => avatarController.rig.body.appearance.hair),
      hair,
    );
  }
  await page.locator("[data-look=hairColor]").fill("#253b47");
  await page.getByRole("tab", { name: "스타일", exact: true }).click();
  await page.locator("[data-look=topColor]").fill("#a4b4e0");
  await page.locator("[data-look=outfit]").selectOption("longsleeve");
  await page.getByRole("tab", { name: "체형", exact: true }).click();
  await page.locator("[data-body=height]").fill("188");
  await page.locator("[data-body=weight]").fill("94");
  await page.locator("[data-body=waist]").fill("1.18");
  await page.locator("[data-body=hips]").fill("1.12");
  await page.locator("[data-body=chest]").fill("1.08");
  await page.waitForTimeout(250);
  await page.waitForSelector("#dialog [data-ready=true]");
  const shape = await page.evaluate(() => avatarController.rig.metrics);
  assert.equal(shape.height, 1.88);
  await page.click("[data-action=save-body]");
  await page.waitForSelector("#app [data-ready=true]");
  assert.equal(await page.evaluate(() => S.profile.body.height), 188);
  assert.equal(await page.evaluate(() => S.profile.body.model), "female");
  assert.equal(
    await page.evaluate(() => S.profile.body.appearance.faceShape),
    "heart",
  );
  assert.equal(await page.evaluate(() => S.profile.body.appearance.jaw), 0.81);
  assert.equal(
    await page.evaluate(() => S.profile.body.appearance.hairColor),
    "#253b47",
  );
  await page.reload();
  await page.evaluate(() => navigate("active"));
  await page.waitForSelector("[data-ready=true]");
  assert.equal(
    await page.evaluate(() => avatarController.rig.body.waist),
    1.18,
  );
  assert.equal(
    await page.evaluate(() => avatarController.rig.body.appearance.topColor),
    "#a4b4e0",
  );
  assert.equal(
    await page.evaluate(() => avatarController.rig.body.model),
    "female",
  );
  assert.equal(
    await page.evaluate(() => avatarController.rig.body.chest),
    1.08,
  );
  assert.equal(
    await page.evaluate(() => avatarController.rig.body.appearance.faceLength),
    0.92,
  );
  assert.equal(
    await page.evaluate(() => avatarController.rig.body.appearance.faceShape),
    "heart",
  );
  await page.locator("[data-avatar-scrub]").fill("500");
  await page.locator(".joint-panel summary").click();
  await page.waitForFunction(() =>
    document
      .querySelector("[data-joint-input=lowerarm_l]")
      .textContent.includes("°"),
  );
  assert.equal(await page.locator("[data-joint-input]").count(), 65);
  assert.ok(
    (
      await page.locator("[data-joint-input=lowerarm_l]").textContent()
    ).includes("°"),
  );
  await page.locator(".joint-panel summary").click();
  await page.locator("[data-avatar-scrub]").fill("500");
  const fixed = await page.evaluate(() => avatarController.diagnostics.root);
  await page.waitForTimeout(130);
  assert.deepEqual(
    await page.evaluate(() => avatarController.diagnostics.root),
    fixed,
    "scrubbing pauses",
  );
  await page.click("[data-avatar-action=joints]");
  assert.equal(
    await page
      .locator("[data-avatar-action=joints]")
      .getAttribute("aria-pressed"),
    "true",
  );
  for (const camera of ["front", "side", "angle"])
    await page.click(`[data-avatar-action=${camera}]`);
  await page.locator("[data-avatar-speed]").selectOption("0.25");
  await page.click("[data-avatar-action=play]");
  assert.equal(
    await page
      .locator("[data-avatar-action=play]")
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.setViewportSize({ width: 320, height: 760 });
  await page.waitForTimeout(80);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "320px workout fits",
  );
  await page.click("[data-action=body]");
  await page.waitForSelector("#dialog [data-ready=true]");
  await page.locator("[data-model=male]").click();
  await page.locator("[data-look-preset=aeri]").click();
  await page.waitForTimeout(180);
  await page.waitForSelector("#dialog [data-ready=true]");
  assert.ok(
    await page.evaluate(
      () =>
        document.querySelector("#dialog").scrollWidth <=
        document.querySelector("#dialog").clientWidth,
    ),
    "320px body dialog fits",
  );
  await page.click("[data-action=close]");
  await page.waitForSelector("#app [data-ready=true]");
  assert.equal(
    await page.evaluate(() => S.profile.body.appearance.hairColor),
    "#253b47",
    "Cancel discards appearance changes",
  );
  assert.equal(
    await page.evaluate(() => S.profile.body.model),
    "female",
    "Cancel restores base selection",
  );
  for (const model of ["male", "female"])
    for (const id of Object.keys(EXERCISES)) {
      await page.evaluate(
        ({ id, model }) => {
          avatarController?.dispose();
          document.querySelector("#app").innerHTML = FormAvatar.markup(id);
          avatarController = FormAvatar.mount(
            document.querySelector("[data-avatar]"),
            { height: 188, weight: 94, model },
          );
        },
        { id, model },
      );
      await page.waitForSelector("[data-ready=true]");
      await page.evaluate(() => avatarController.setPhase(0.35));
      const portrait = await page.evaluate(() => {
        const rig = avatarController.rig,
          mesh = rig.portraitMesh;
        const { position, skinWeight, skinIndex } = mesh.geometry.attributes;
        let maxWeightError = 0,
          finite = true,
          maxHeadDistance = 0;
        const head = rig.world("Head"),
          p = head.clone();
        for (let i = 0; i < position.count; i++) {
          let sum = 0;
          for (let j = 0; j < 4; j++) {
            sum += skinWeight.array[i * 4 + j];
            finite &&= skinIndex.array[i * 4 + j] < mesh.skeleton.bones.length;
          }
          maxWeightError = Math.max(maxWeightError, Math.abs(sum - 1));
          if (i % 137 === 0) {
            mesh.getVertexPosition(i, p).applyMatrix4(mesh.matrixWorld);
            finite &&= p.toArray().every(Number.isFinite);
            maxHeadDistance = Math.max(maxHeadDistance, p.distanceTo(head));
          }
        }
        let seamGap = 0;
        if (
          ["pushup", "squat"].includes(
            document.querySelector("[data-avatar]").dataset.avatar,
          )
        ) {
          const bodyPoints = [];
          const cut = rig.body.model === "female" ? 1.57 - 0.042527 : 1.57;
          for (const bodyMesh of rig.meshes) {
            const source = bodyMesh.geometry.attributes.sourcePosition;
            for (let i = 0; i < source.count; i++)
              if (Math.abs(source.getY(i) - cut) < 0.000001) {
                bodyPoints.push(
                  bodyMesh
                    .getVertexPosition(i, head.clone())
                    .applyMatrix4(bodyMesh.matrixWorld),
                );
              }
          }
          for (let i = 0; i < 161; i += 4) {
            mesh.getVertexPosition(i, p).applyMatrix4(mesh.matrixWorld);
            seamGap = Math.max(
              seamGap,
              Math.min(...bodyPoints.map((b) => b.distanceTo(p))),
            );
          }
        }
        return { finite, maxWeightError, maxHeadDistance, seamGap };
      });
      assert.ok(
        portrait.finite && portrait.maxWeightError < 0.00001,
        `${model}/${id}: valid portrait skinning`,
      );
      assert.ok(
        portrait.maxHeadDistance < 0.4,
        `${model}/${id}: face stays attached to the head`,
      );
      assert.ok(
        portrait.seamGap < 0.018,
        `${model}/${id}: neck boundary stays joined (${portrait.seamGap})`,
      );
    }
  assert.deepEqual(errors, []);
  assert.equal(requests.filter((u) => /^https?:/.test(u)).length, 0);
  const reduced = await browser.newPage({ reducedMotion: "reduce" });
  await reduced.goto(pathToFileURL(path.join(root, "index.html")).href);
  await reduced.evaluate(() => {
    S.profile = defaultProfile();
    S.plan = generate(S.profile);
    start(0);
  });
  await reduced.waitForSelector("[data-ready=true]");
  assert.equal(
    await reduced
      .locator("[data-avatar-action=play]")
      .getAttribute("aria-pressed"),
    "false",
  );
  await reduced.close();
  const fallback = await browser.newPage();
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return /webgl/.test(type) ? null : original.call(this, type, ...args);
    };
  });
  await fallback.goto(pathToFileURL(path.join(root, "index.html")).href);
  await fallback.evaluate(() => {
    S.profile = defaultProfile();
    S.plan = generate(S.profile);
    start(0);
  });
  await fallback.waitForSelector("[data-error=true]");
  assert.ok(await fallback.locator(".avatar-fallback").isVisible());
  assert.ok(await fallback.locator("[data-action=log]").first().isVisible());
  await fallback.close();
  console.log(
    "PASS all 43 exercises render for both male/female meshes; character presets/face/hair/outfits/save/cancel/reload; playback/scrub/camera/paused joint inspector; 320px layouts; reduced motion; WebGL fallback; zero network requests",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    if (
      path.dirname(path.resolve(temp)) !== path.resolve(os.tmpdir()) ||
      !path.basename(temp).startsWith("form-avatar-")
    )
      throw Error("Unexpected temporary directory");
    fs.rmSync(temp, { recursive: true, force: true });
  });
