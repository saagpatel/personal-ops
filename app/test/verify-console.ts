import { runConsoleVerification } from "./verify-harness.js";

void runConsoleVerification()
  .then(() => {
    process.stdout.write("Phase 8 console verification passed.\n");
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
