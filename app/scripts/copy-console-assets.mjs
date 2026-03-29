import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const sourceDir = path.join(appDir, "static", "console");
const targetDir = path.join(appDir, "dist", "console");

fs.mkdirSync(targetDir, { recursive: true });

for (const fileName of ["index.html", "styles.css"]) {
  fs.copyFileSync(path.join(sourceDir, fileName), path.join(targetDir, fileName));
}
