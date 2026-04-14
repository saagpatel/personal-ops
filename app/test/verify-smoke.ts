import { runSmokeVerification } from "./verify-harness.js";

void runSmokeVerification()
  .then(() => {
    process.stdout.write("Smoke verification passed.\n");
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
