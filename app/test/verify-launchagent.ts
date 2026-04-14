import { runLaunchAgentVerification } from "./verify-harness.js";

void runLaunchAgentVerification()
  .then(() => {
    process.stdout.write("LaunchAgent verification passed.\n");
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
