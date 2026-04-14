import { runRecoveryVerification } from "./verify-harness.js";

void runRecoveryVerification()
  .then(() => {
    process.stdout.write("Recovery verification passed.\n");
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
