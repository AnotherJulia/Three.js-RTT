// npm workspaces doesn't reliably symlink the workspace root's own package into a
// nested example when the root itself (not a subfolder) is the published package. This
// makes that link explicit and idempotent so a plain `npm install` always wires up
// examples/* against the local library source, on any machine.
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const examplesDir = join(repoRoot, "examples");

if (existsSync(examplesDir)) {
  for (const name of readdirSync(examplesDir)) {
    const exampleDir = join(examplesDir, name);
    const nodeModulesDir = join(exampleDir, "node_modules");
    const linkPath = join(nodeModulesDir, "three-rtt");

    mkdirSync(nodeModulesDir, { recursive: true });
    if (existsSync(linkPath)) rmSync(linkPath, { recursive: true, force: true });
    symlinkSync(relative(nodeModulesDir, repoRoot), linkPath, "dir");
    console.log(`[link-examples] examples/${name}/node_modules/three-rtt -> repo root`);
  }
}
