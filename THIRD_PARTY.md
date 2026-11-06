# Third-party assets

## Male base character

- Creator: **Quaternius**, Universal Base Characters / Superhero Male (standard free pack).
- Original pack: https://quaternius.com/packs/universalbasecharacters.html
- License: CC0 1.0 Universal, preserved in `assets/QUATERNIUS-LICENSE.txt`.
- Downloaded GLB: https://raw.githubusercontent.com/programasweights/avatar/main/public/assets/character.glb
- Conversion provenance: https://github.com/programasweights/avatar/blob/main/ASSETS.md
- Original GLB SHA-256: `d6f3b64cab629f6ddca9ba063811aeffd3663a8a4e49ade47cd9505dc2bbd70f`.
- FORM changes: vertex colors, soft skin shading and body outlines, proportional bind-shape deformation, replacement procedural head/eyes/lips, matched neck boundary normals and skin weights, adapted CC0 hairstyles, accessories and clothing shader, authored movement trajectories, baked complete-joint rotation clips and constrained IK. No source code from the distribution repository was used. No Aion or other commercial-game character assets are included.

The file contains a weighted human mesh and 65 bones, including articulated hands. It is embedded into the HTML at build time. No model download occurs when the app runs.

## Female base character

- Creator: **Quaternius**, Universal Base Characters / Superhero Female (standard free pack).
- Author's pack and CC0 statement: https://quaternius.com/packs/universalbasecharacters.html
- Source glTF, geometry buffer and `License_Standard.txt` obtained from the unmodified pack mirror:
  https://github.com/NafisRayan/Animate-Rigged-Humanoid-No-Blender/tree/main/Universal%20Base%20Characters%5BStandard%5D/Universal%20Base%20Characters%5BStandard%5D
- Files: `Base Characters/Godot - UE/Superhero_Female_FullBody.gltf` and `.bin`.
- No code or bundled animations from that repository are used.
- Converted with the repository-owned `scripts/import-character.mjs`: preserves the distinct female mesh, 65-joint skeleton, weights and bind matrices; strips external image/material dependencies for the app's custom materials.
- `assets/character-female.glb` SHA-256: `597cfad0168ea2a802df9d9a2fe9c4e14323a3c3f7966860d346c9a1f0ef6454`.
- Runtime changes: proportional body deformation, a new procedural head, model-calibrated eyes/hair/clothing, complete-joint bind-axis retargeting and constrained contact IK. Both model files are embedded in the standalone HTML.

## Hairstyles and portrait geometry

- Creator: **Quaternius**, the same Universal Base Characters standard pack, CC0 1.0.
- Original files: `Hair_SimpleParted`, `Hair_Buzzed`, `Hair_Long`, `Hair_Buns` (`.gltf` and `.bin`).
- Source mirror: https://github.com/NafisRayan/Animate-Rigged-Humanoid-No-Blender/tree/main/Universal%20Base%20Characters%5BStandard%5D/Universal%20Base%20Characters%5BStandard%5D/Hairstyles/Origin%20at%200/glTF%20%28Godot%29
- Converted by `scripts/import-hair.mjs` to `assets/hair-meshes.json`. Only positions and triangle indices are retained; node transforms and female-to-shared coordinates are baked. Runtime changes adapt length, volume, face proportions and colors.
- The replacement face surface, eye openings/lids, iris texture, lips, brows and ears are original procedural code in `src/portrait.js`. They are not copied from a commercial game.
- `assets/portrait-thumbnails.json` contains screenshots generated from the actual app renderer by `scripts/bake-portraits.cjs`; all eight portraits are embedded into the standalone HTML.

## Renderer

- Three.js **0.187.0**, including GLTFLoader and SkeletonUtils.
- https://github.com/mrdoob/three.js
- MIT license: `assets/THREE-LICENSE.txt`, also embedded in the distributed HTML.

esbuild and Playwright are development tools, pinned in `package-lock.json`. Neither is required to open the app.

## Independent female face study (not the workout avatar)

- Base mesh and morph data: MakeHuman/MPFB hm08. Official source: https://github.com/makehumancommunity/mpfb2 at commit `6ff1eb358f6c1959ced77e79e6dd2406d9a71f49`.
- Core asset license: CC0 1.0. The source repository's `LICENSE.ASSETS.md` is preserved as `assets/MAKEHUMAN-LICENSE.txt`. Official explanation: https://static.makehumancommunity.org/about/license.html.
- Fitted eye/eyebrow/eyelash/source-hair geometry and textures: official **makehuman_system_assets_cc0** pack, https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html. Download: https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip. Pack credits include Data Collection AB, Joel Palmius and Jonas Hauquier.
- Used components: `eyes/high-poly`, `eyes/materials/brown_eye.png`, `eyebrows/eyebrow009`, `eyelashes/eyelashes02`, `skins/young_asian_female/young_lightskinned_female_diffuse3.png`. `hair/long01` is in the editable anatomical source; it is replaced by authored scalp/locks/strands in the final bust.
- Original work: face morph recipe, cropping/training top, seeded center-part hair paths and surfaces, PBR setup, independent viewer/build path. `assets/face-study-manifest.json` records the recipe, input asset-bundle hashes, MPFB revision, final GLB hash and geometry counts.
- Outputs: `assets/face-study-source.blend`, `assets/face-study.blend`, `assets/face-study.glb`, `face-study.html`. Textures are packed/embedded. The HTML also bundles Three.js and its MIT notice.
- MPFB GPL authoring code and Blender/bpy are external development tools; their source/runtime is not included in the viewer. CC0 asset status is independent of those tool licenses.
- Like or Die's official trailer at https://www.youtube.com/watch?v=TmggKJVUe70&t=87s was a visual reference. No game geometry, game textures, trailer pixels or paid marketplace assets are included. This is not an NC asset or an officially affiliated character.


## Optional private Aion 2 experiment

Game models/textures belong to NCSOFT. They are not CC0 and are not included in the ordinary build or tracked asset directory. Publicly downloadable fan-site files do not establish redistribution rights. The user requested local personal testing; no assets were published or pushed.

Selected source pages (retrieved 2026-11-05):
- Head `GF_Head_001`: https://aion2.gg/database/models/gf-head-001-163489493798403
- Hair `GF_Hair_204`: https://aion2.gg/database/models/gf-hair-204-69220991122394
- Body/clothes `GF_BaseFull`: https://aion2.gg/database/models/gf-basefull-125538129193475
- Iris and eyebrow masks: the head page's downloadable material JSON, `Eye.Textures.IrisMasks` and `Face.Textures.EyeBrow_NMPH`.

Original GLBs and material metadata remain under ignored `assets/private/aion2/`; its manifest records SHA-256 and public provenance. The optional build contains local WebGL material adaptation and the app's own exercise motions, not game animations. Game hair/cloth physics and the complete Unreal shaders are not included.

Meshoptimizer 1.1 decoder ships through Three.js 0.187.0's `examples/jsm/libs/meshopt_decoder.module.js`. MIT, copyright 2016–2026 Arseny Kapoulkine. License: `assets/MESHOPT-LICENSE.txt`, embedded in HTML. Upstream: https://github.com/zeux/meshoptimizer/tree/v1.1.
