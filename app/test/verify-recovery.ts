import { runRecoveryVerification } from "./verify-harness.js";

void runRecoveryVerification()
  .then(() => {
    process.stdout.write("Phase 3 recovery verification passed.\n");
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
