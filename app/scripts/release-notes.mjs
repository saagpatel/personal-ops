import { getPaths, parseArgs, readChangelogSection } from "./release-common.mjs";

const { version } = parseArgs(process.argv.slice(2));
const paths = getPaths();
const section = readChangelogSection(paths.changelogPath, version);

process.stdout.write(`${section}\n`);
