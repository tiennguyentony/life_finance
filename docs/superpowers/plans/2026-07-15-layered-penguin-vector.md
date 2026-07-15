# Layered Penguin Vector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished, transparent, Inkscape-ready penguin cutout as a master SVG plus automatically aligned SVG files for its major movable parts.

**Architecture:** The hand-authored master SVG is the source of truth. Named and marker-delimited top-level part groups make the artwork understandable in Inkscape, while a small dependency-free Node script extracts those groups into coordinate-compatible part files. A separate dependency-free verifier enforces the asset contract without coupling verification to generation.

**Tech Stack:** SVG 1.1-compatible XML, Inkscape named layers, ECMAScript modules on Node.js, existing Git repository tooling.

## Global Constraints

- Use a transparent 1600 by 1000 SVG canvas.
- Use standard SVG geometry, gradients, clipping paths, and named groups compatible with current Inkscape releases.
- Do not use linked external images, fonts, or proprietary effects.
- Preserve the supplied reference's recognizable proportions, pose, warm expression, and map-reading concept.
- Keep major pieces independently selectable and give each a stable descriptive ID.
- Complete overlapped geometry enough to tolerate modest repositioning.
- Keep separate part files on the master canvas and coordinates so imports align automatically.

---

## File Structure

- `assets/penguin-cutout/penguin-master.svg`: complete assembled source artwork and Inkscape layer hierarchy.
- `assets/penguin-cutout/parts/*.svg`: generated, aligned movable-part files.
- `assets/penguin-cutout/README.md`: editing, stacking, and Blender import guide.
- `scripts/extract-penguin-parts.mjs`: deterministic extractor for marker-delimited master groups.
- `scripts/verify-penguin-assets.mjs`: structural and portability checks for the master and generated files.

### Task 1: Establish the SVG asset contract

**Files:**
- Create: `scripts/verify-penguin-assets.mjs`

**Interfaces:**
- Consumes: an optional `--master-only` command-line flag and files under `assets/penguin-cutout/`.
- Produces: exit code 0 plus `Penguin SVG verification passed.` when every requested check succeeds; otherwise a thrown error naming the failed requirement.

- [ ] **Step 1: Write the verifier before the asset exists**

Create a dependency-free verifier with this contract:

```js
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "assets", "penguin-cutout");
const masterPath = join(root, "penguin-master.svg");
const masterOnly = process.argv.includes("--master-only");
const parts = ["body", "face", "left-eye", "right-eye", "left-cheek", "right-cheek", "beak", "left-wing", "right-wing", "left-foot", "right-foot", "map", "bookmark"];
const requireMatch = (text, pattern, message) => {
  if (!pattern.test(text)) throw new Error(message);
};

if (!existsSync(masterPath)) throw new Error("Missing penguin-master.svg");
const master = readFileSync(masterPath, "utf8");
requireMatch(master, /viewBox="0 0 1600 1000"/, "Master viewBox must be 0 0 1600 1000");
requireMatch(master, /<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, "Master must declare the SVG namespace");
if (/<image\b|<text\b|(?:xlink:)?href="https?:\/\//i.test(master)) throw new Error("Master contains an external image, text, or URL");

for (const part of parts) {
  requireMatch(master, new RegExp(`id="part-${part}"`), `Missing master group part-${part}`);
  requireMatch(master, new RegExp(`<!-- part:${part} -->[\\s\\S]*<!-- /part:${part} -->`), `Missing extraction markers for ${part}`);
  if (!masterOnly) {
    const partPath = join(root, "parts", `${part}.svg`);
    if (!existsSync(partPath)) throw new Error(`Missing generated part ${part}.svg`);
    const partSvg = readFileSync(partPath, "utf8");
    requireMatch(partSvg, /viewBox="0 0 1600 1000"/, `${part}.svg has the wrong viewBox`);
    requireMatch(partSvg, new RegExp(`id="part-${part}"`), `${part}.svg has the wrong group`);
  }
}

console.log("Penguin SVG verification passed.");
```

- [ ] **Step 2: Run the verifier to prove the asset is absent**

Run: `node scripts/verify-penguin-assets.mjs --master-only`

Expected: non-zero exit with `Error: Missing penguin-master.svg`.

- [ ] **Step 3: Commit the independent verification contract**

Run:

```text
git add scripts/verify-penguin-assets.mjs
git commit -m "Add penguin SVG asset verifier"
```

### Task 2: Draw the assembled master SVG

**Files:**
- Create: `assets/penguin-cutout/penguin-master.svg`

**Interfaces:**
- Consumes: the 1600 by 1000 canvas and group/marker contract from Task 1.
- Produces: a self-contained assembled illustration with the top-level IDs listed by the verifier.

- [ ] **Step 1: Add shared vector resources**

Create the SVG root with `viewBox="0 0 1600 1000"`, `width="1600"`, `height="1000"`, `role="img"`, and a descriptive `<title>`. In `<defs>`, define charcoal, cream, orange, paper, blush, and highlight gradients plus soft shadow filters. Keep every paint server local and referenced with `url(#...)`.

- [ ] **Step 2: Draw the complete rear and body geometry**

Add the marker-delimited groups `part-body`, `part-left-foot`, and `part-right-foot`. Build the body from rounded paths and ellipses, include the completed lower torso behind the map, and use three-toe orange foot shapes with subtle vector highlights.

- [ ] **Step 3: Draw the face and expression geometry**

Add `part-face`, `part-left-eye`, `part-right-eye`, `part-left-cheek`, `part-right-cheek`, and `part-beak`. Use two joined cream face lobes flowing into the belly, glossy black eyes with white vector highlights, coral cheeks, and separate upper/lower orange beak paths.

- [ ] **Step 4: Draw the movable map and bookmark**

Add `part-map` and `part-bookmark`. Construct a four-panel folded paper map with cream-to-tan gradients, fold lines, green land shapes, a blue route and pin, and a small orange bookmark. Complete the map silhouette behind both wings.

- [ ] **Step 5: Draw the independently movable wings**

Add `part-left-wing` and `part-right-wing` above the map. Give each wing a rounded charcoal silhouette, a small highlight, and enough hidden root geometry to remain visually sound after modest rotation or translation.

- [ ] **Step 6: Run master-only structural verification**

Run: `node scripts/verify-penguin-assets.mjs --master-only`

Expected: `Penguin SVG verification passed.`

- [ ] **Step 7: Commit the assembled source artwork**

Run:

```text
git add assets/penguin-cutout/penguin-master.svg
git commit -m "Create layered penguin master SVG"
```

### Task 3: Generate aligned movable-part files

**Files:**
- Create: `scripts/extract-penguin-parts.mjs`
- Create: `assets/penguin-cutout/parts/body.svg`
- Create: `assets/penguin-cutout/parts/face.svg`
- Create: `assets/penguin-cutout/parts/left-eye.svg`
- Create: `assets/penguin-cutout/parts/right-eye.svg`
- Create: `assets/penguin-cutout/parts/left-cheek.svg`
- Create: `assets/penguin-cutout/parts/right-cheek.svg`
- Create: `assets/penguin-cutout/parts/beak.svg`
- Create: `assets/penguin-cutout/parts/left-wing.svg`
- Create: `assets/penguin-cutout/parts/right-wing.svg`
- Create: `assets/penguin-cutout/parts/left-foot.svg`
- Create: `assets/penguin-cutout/parts/right-foot.svg`
- Create: `assets/penguin-cutout/parts/map.svg`
- Create: `assets/penguin-cutout/parts/bookmark.svg`

**Interfaces:**
- Consumes: marker-delimited groups and the `<defs>` block from `penguin-master.svg`.
- Produces: one standalone 1600 by 1000 SVG per movable part.

- [ ] **Step 1: Write the deterministic extraction script**

Create the extractor with the following complete behavior:

```js
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(process.cwd(), "assets", "penguin-cutout");
const partsRoot = join(root, "parts");
const master = readFileSync(join(root, "penguin-master.svg"), "utf8");
const names = ["body", "face", "left-eye", "right-eye", "left-cheek", "right-cheek", "beak", "left-wing", "right-wing", "left-foot", "right-foot", "map", "bookmark"];
const defs = master.match(/<defs>[\\s\\S]*?<\/defs>/)?.[0];

if (!defs) throw new Error("Master SVG has no definitions block");
mkdirSync(partsRoot, { recursive: true });

for (const name of names) {
  const pattern = new RegExp(`<!-- part:${name} -->([\\s\\S]*?)<!-- /part:${name} -->`);
  const group = master.match(pattern)?.[1]?.trim();
  if (!group) throw new Error(`Master SVG has no extractable ${name} group`);

  const svg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000" role="img">',
    `  <title>Penguin cutout: ${name}</title>`,
    defs,
    group,
    '</svg>',
    '',
  ].join('\\n');

  const output = join(partsRoot, `${name}.svg`);
  writeFileSync(output, svg, "utf8");
  console.log(`Wrote ${relative(process.cwd(), output).replaceAll('\\\\', '/')}`);
}
```

- [ ] **Step 2: Generate the part files**

Run: `node scripts/extract-penguin-parts.mjs`

Expected: thirteen lines in the form `Wrote assets/penguin-cutout/parts/<name>.svg`.

- [ ] **Step 3: Verify master and part alignment contracts**

Run: `node scripts/verify-penguin-assets.mjs`

Expected: `Penguin SVG verification passed.`

- [ ] **Step 4: Commit the extractor and generated assets**

Run:

```text
git add scripts/extract-penguin-parts.mjs assets/penguin-cutout/parts
git commit -m "Add aligned penguin cutout parts"
```

### Task 4: Document, render, and inspect the finished cutout

**Files:**
- Create: `assets/penguin-cutout/README.md`

**Interfaces:**
- Consumes: the verified master and generated part files.
- Produces: end-user editing instructions and final visual/structural verification evidence.

- [ ] **Step 1: Write the editing guide**

Document how to open `penguin-master.svg` in Inkscape, use the Layers and Objects panel to select `part-*` groups, ungroup nested map elements, recolor gradient stops, and save a working copy. Document that the separate files share one view box and align on import. For Blender, instruct the user to import each needed SVG through File > Import > Scalable Vector Graphics and adjust curve extrusion only if a raised-paper look is wanted.

- [ ] **Step 2: Render the master SVG for visual inspection**

Open `penguin-master.svg` in an SVG-capable renderer at the native 1600 by 1000 view. Confirm a transparent background, a centered charcoal penguin, symmetrical cream face patches, readable friendly expression, orange feet and beak, two wings gripping a four-panel map, and no clipping or broken paint servers.

- [ ] **Step 3: Inspect representative isolated parts**

Render `body.svg`, `right-wing.svg`, and `map.svg` on the same viewport. Confirm each part appears at the exact assembled coordinates and contains no unrelated visible geometry.

- [ ] **Step 4: Run final checks**

Run:

```text
node scripts/extract-penguin-parts.mjs
node scripts/verify-penguin-assets.mjs
git diff --check
```

Expected: all part files are rewritten deterministically, verification prints `Penguin SVG verification passed.`, and `git diff --check` prints no errors.

- [ ] **Step 5: Commit documentation and any visual corrections**

Run:

```text
git add assets/penguin-cutout scripts
git commit -m "Finish editable penguin cutout asset"
```
