import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

function isTestSource(root: string, path: string): boolean {
  const segments = relative(root, path).split(/[\\/]/);
  return segments.includes("__tests__") || /(?:^|\.)test\.[^.]+$/.test(segments.at(-1) ?? "");
}

export function balanceLabSourceFilesV1(root: string): readonly string[] {
  const sourceRoots = [
    join(root, "src", "core"),
    join(root, "src", "data"),
    join(root, "src", "lab"),
    join(root, "scripts", "balance-lab-cli.ts"),
    join(root, "scripts", "balance-lab-code-version.ts"),
    join(root, "scripts", "run-balance-lab.mjs"),
    join(root, "scripts", "typescript-loader.mjs"),
  ];
  const files: string[] = [];
  const visit = (path: string): void => {
    if (statSync(path).isDirectory()) {
      for (const entry of readdirSync(path).toSorted()) visit(join(path, entry));
    } else if (!isTestSource(root, path)) {
      files.push(path);
    }
  };
  for (const path of sourceRoots) visit(path);
  return files.toSorted();
}

export function balanceLabSourceHashV1(root: string): string {
  const hash = createHash("sha256");
  for (const file of balanceLabSourceFilesV1(root)) {
    hash.update(relative(root, file).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function balanceLabCodeVersionV1(root: string): Readonly<{
  commit: string;
  dirty: boolean;
  sourceHash: string;
}> {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim().length > 0;
  return Object.freeze({
    commit,
    dirty,
    sourceHash: balanceLabSourceHashV1(root),
  });
}
