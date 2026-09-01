import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const workspace = process.cwd();
const installDir = mkdtempSync(path.join(tmpdir(), "skilldrift-package-smoke-"));
let tarball;

try {
  const packed = JSON.parse(execFileSync(npm, ["pack", "--json"], { encoding: "utf8" }));
  assertSinglePackage(packed);
  tarball = path.resolve(workspace, packed[0].filename);

  execFileSync(npm, ["install", "--ignore-scripts", tarball], {
    cwd: installDir,
    stdio: "inherit",
  });
  execFileSync(process.execPath, ["--input-type=module", "--eval", 'import("skilldrift")'], {
    cwd: installDir,
    stdio: "inherit",
  });

  const executable = path.join(
    installDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "skilldrift.cmd" : "skilldrift",
  );
  execFileSync(executable, ["--version"], { cwd: installDir, stdio: "inherit" });
  execFileSync(executable, ["--help"], { cwd: installDir, stdio: "inherit" });
} finally {
  if (tarball) {
    rmSync(tarball, { force: true });
  }
  rmSync(installDir, { force: true, recursive: true });
}

function assertSinglePackage(packed) {
  if (!Array.isArray(packed) || packed.length !== 1 || typeof packed[0]?.filename !== "string") {
    throw new Error("npm pack must produce exactly one named tarball");
  }
}
