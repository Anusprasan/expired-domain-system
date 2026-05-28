import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const packageDirArg = process.argv[2] ?? ".";
const packageDir = path.resolve(process.cwd(), packageDirArg);
const distDir = path.join(packageDir, "dist");

const entriesToCopy = [
  "package.json",
  "package-lock.json",
  ".env.example",
  "src",
  "scripts",
  "data",
];

rmSync(distDir, { force: true, recursive: true });
mkdirSync(distDir, { recursive: true });

for (const entry of entriesToCopy) {
  const sourcePath = path.join(packageDir, entry);
  if (!existsSync(sourcePath)) {
    continue;
  }

  const targetPath = path.join(distDir, entry);
  cpSync(sourcePath, targetPath, { recursive: true });
}

console.log(`Created dist folder at ${distDir}`);
