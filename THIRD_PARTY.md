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
