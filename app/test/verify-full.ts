import { runFullVerification } from "./verify-harness.js";

void runFullVerification()
  .then(() => {
    process.stdout.write("Phase 3 full verification passed.\n");
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
