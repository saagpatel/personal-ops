import { runSmokeVerification } from "./verify-harness.js";

void runSmokeVerification()
  .then(() => {
    process.stdout.write("Phase 3 smoke verification passed.\n");
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
