import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const sourceRoot = join(process.cwd(), "src");
const misplaced = [];

async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await inspect(path);
      continue;
    }
    if (
      /\.test\.[cm]?[jt]sx?$/.test(entry.name) &&
      !path.split(sep).includes("__tests__")
    ) {
      misplaced.push(relative(process.cwd(), path));
    }
  }
}

await inspect(sourceRoot);

if (misplaced.length > 0) {
  throw new Error(
    `Test files must live in an adjacent __tests__ directory:\n${misplaced.join("\n")}`,
  );
}
