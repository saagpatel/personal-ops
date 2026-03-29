import {
  assertSemVer,
  compareSemVer,
  ensureCleanWorktree,
  getPaths,
  parseArgs,
  readChangelogSection,
  readJson,
  writeJson,
} from "./release-common.mjs";

const { version, dryRun } = parseArgs(process.argv.slice(2));
const paths = getPaths();

assertSemVer(version);
ensureCleanWorktree(paths.repoRoot);

const packageJson = readJson(paths.packageJsonPath);
const packageLock = readJson(paths.packageLockPath);
const currentVersion = String(packageJson.version ?? "");

if (currentVersion.length === 0) {
  throw new Error("app/package.json is missing a version field.");
}
if (compareSemVer(version, currentVersion) <= 0) {
  throw new Error(`Target version ${version} must be newer than current version ${currentVersion}.`);
}
readChangelogSection(paths.changelogPath, version);

const summary = [
  `Current version: ${currentVersion}`,
  `Target version: ${version}`,
  `Changelog entry: found`,
];

if (dryRun) {
  process.stdout.write(`${summary.join("\n")}\n`);
  process.stdout.write("Dry run: no files were changed.\n");
  process.exit(0);
}

packageJson.version = version;
packageLock.version = version;
if (packageLock.packages && packageLock.packages[""]) {
  packageLock.packages[""].version = version;
}

writeJson(paths.packageJsonPath, packageJson);
writeJson(paths.packageLockPath, packageLock);

process.stdout.write(`${summary.join("\n")}\n`);
process.stdout.write(`Updated app/package.json and app/package-lock.json to ${version}.\n`);
