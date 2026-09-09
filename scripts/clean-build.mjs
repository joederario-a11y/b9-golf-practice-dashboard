import { readFileSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
if (realpathSync(process.cwd()) !== root || JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).name !== "golfiq-performance-analytics") {
  throw new Error("Build cleanup must run from this repository's root.");
}
const target = path.resolve(root, "dist");
if (path.dirname(target) !== root) throw new Error("Invalid build output path.");
rmSync(target, { recursive: true, force: true });
