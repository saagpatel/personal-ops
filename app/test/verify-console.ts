import { runConsoleVerification } from "./verify-harness.js";

void runConsoleVerification()
  .then(() => {
    process.stdout.write("Console verification passed.\n");
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
