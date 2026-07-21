// Flatten the app's stylesheet import tree into a single self-contained file.
//
// Why this exists: the converter copies cfg.cssEntry verbatim to
// _ds_bundle.css at the bundle root, but does NOT follow its relative
// @imports. src/app/globals.css starts with five `@import "./styles/*.css"`
// lines, so the copy arrives with dangling references and validate fails with
// [CSS_IMPORT_MISSING]. The converter's copyTokens() can't help — it only
// copies from an installed npm package, and these stylesheets live in app
// source.
//
// Inlining in place preserves cascade order, which matters here: globals.css
// imports foundation.css and then redefines several of the same custom
// properties (--muted, --line, --shadow, --radius) in its own :root block.
// Order is what makes the paper/lime/ink palette win.
//
// Remote @import url(...) lines are left alone; those resolve at runtime.
//
// Run this before package-build.mjs — see .design-sync/NOTES.md.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";

const ENTRY = "src/app/globals.css";
const OUT = ".design-sync/.cache/ds-styles.css";

const seen = new Set();

function inline(file) {
  const abs = resolve(file);
  if (seen.has(abs)) {
    return `/* design-sync: skipped duplicate @import of ${relative(".", abs)} */\n`;
  }
  seen.add(abs);

  const css = readFileSync(abs, "utf8");
  const dir = dirname(abs);

  // Only local @imports are inlined; `@import url(...)` is left for the browser.
  return css.replace(
    /^[ \t]*@import\s+["']([^"']+)["']\s*;[ \t]*$/gm,
    (match, spec) => {
      if (/^(https?:)?\/\//.test(spec) || spec.startsWith("url(")) return match;
      const banner = `/* design-sync: inlined from ${spec} */\n`;
      return banner + inline(resolve(dir, spec));
    },
  );
}

const out = inline(ENTRY);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out);
console.error(`flatten-css: ${seen.size} file(s) → ${OUT} (${(out.length / 1024).toFixed(1)} KB)`);
