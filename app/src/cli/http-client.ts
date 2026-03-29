import http from "node:http";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { getLaunchAgentLabel } from "../launchagent.js";
import type { Config } from "../types.js";

function formatConnectivityError(config: Config, error: Error & { code?: string }): Error {
  const host = `${config.serviceHost}:${config.servicePort}`;
  const launchAgentLabel = getLaunchAgentLabel();
  const code = error.code ?? "UNKNOWN";
  return new Error(
    [
      `Could not reach the local personal-ops daemon at ${host}.`,
      "Next steps:",
      "  personal-ops install check",
      "  personal-ops doctor",
      `  launchctl kickstart -k gui/$(id -u)/${launchAgentLabel}`,
      "  personal-opsd",
      `Details: ${code} ${error.message}`,
    ].join("\n"),
  );
}

function formatHttpStatusError(statusCode: number, message: string): Error {
  if (statusCode === 401 || statusCode === 403) {
    return new Error(
      [
        "The daemon is reachable, but the local API token was rejected.",
        "Next steps:",
        "  personal-ops install check",
        "  personal-ops doctor",
        `Details: ${message}`,
      ].join("\n"),
    );
  }
  return new Error(message);
}

export function formatGoogleLoginError(phase: "start" | "complete", error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const lines =
    phase === "start"
      ? [
          "Could not start the Google login flow.",
          "Next steps:",
          "  personal-ops install check",
          "  Confirm the OAuth client JSON is present and configured",
          "  personal-ops doctor",
          `Details: ${message}`,
        ]
      : [
          "Google login finished in the browser, but personal-ops could not save the grant.",
          "Next steps:",
          "  Confirm the signed-in Google account matches config.toml",
          "  personal-ops auth gmail login",
          "  personal-ops auth google login",
          "  personal-ops doctor --deep",
          `Details: ${message}`,
        ];
  return new Error(lines.join("\n"));
}

export function createRequestJson(config: Config) {
  return function requestJson<T>(method: string, path: string, body?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : undefined;
      const request = http.request(
        {
          host: config.serviceHost,
          port: config.servicePort,
          method,
          path,
          agent: false,
          headers: {
            Authorization: `Bearer ${config.apiToken}`,
            "Content-Type": "application/json",
            Connection: "close",
            "x-personal-ops-client": "operator-cli",
            "x-personal-ops-requested-by": process.env.USER ?? "operator",
            ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          response.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            const parsed = raw ? JSON.parse(raw) : {};
            response.socket?.destroy();
            if ((response.statusCode ?? 500) >= 400) {
              reject(
                formatHttpStatusError(
                  response.statusCode ?? 500,
                  parsed.error ?? `Request failed with status ${response.statusCode}`,
                ),
              );
              return;
            }
            resolve(parsed);
          });
        },
      );
      request.on("error", (error) => {
        const requestError = error as Error & { code?: string };
        if (["ECONNREFUSED", "EHOSTUNREACH", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET"].includes(requestError.code ?? "")) {
          reject(formatConnectivityError(config, requestError));
          return;
        }
        reject(requestError);
      });
      if (payload) {
        request.write(payload);
      }
      request.end();
    });
  };
}

export async function runGoogleLogin(
  requestJson: <T>(method: string, path: string, body?: unknown) => Promise<T>,
  authBasePath: "/v1/auth/google" | "/v1/auth/gmail" = "/v1/auth/google",
) {
  const callbackServer = http.createServer();
  callbackServer.listen(0, "127.0.0.1");
  await once(callbackServer, "listening");
  const address = callbackServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not allocate a loopback port for Google login.");
  }
  let start;
  try {
    start = await requestJson<{ auth_url: string; state: string }>("POST", `${authBasePath}/start`, {
      callback_port: address.port,
    });
  } catch (error) {
    callbackServer.close();
    throw formatGoogleLoginError("start", error);
  }

  const callbackPromise = new Promise<{ state: string; code: string }>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for the Google OAuth callback.")), 300000);
    callbackServer.on("request", (request, response) => {
      const url = new URL(request.url ?? "/", `http://127.0.0.1:${address.port}`);
      if (url.pathname !== "/oauth2/callback") {
        response.statusCode = 404;
        response.end("Not found");
        return;
      }
      clearTimeout(timeout);
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      response.end("Google authorization received. You can return to the terminal.");
      if (!state || !code) {
        reject(new Error("Google callback did not include both state and code."));
        return;
      }
      resolve({ state, code });
    });
  });

  execFileSync("open", [start.auth_url]);
  const callback = await callbackPromise;
  callbackServer.close();
  let completed;
  try {
    completed = await requestJson<{ email: string }>("POST", `${authBasePath}/callback/complete`, callback);
  } catch (error) {
    throw formatGoogleLoginError("complete", error);
  }
  process.stdout.write(`Connected Google account: ${completed.email}\n`);
  process.stdout.write("Next step: run `personal-ops status` or `personal-ops doctor` to confirm the mailbox looks healthy.\n");
}
