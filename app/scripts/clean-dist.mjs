import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const distDir = path.join(appDir, "dist");

fs.rmSync(distDir, { recursive: true, force: true });
