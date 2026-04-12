import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDesktopToolchainReport,
  DESKTOP_SUPPORT_CONTRACT,
  evaluateDesktopPlatformVerification,
  summarizeDesktopReinstall,
} from "../src/desktop-platform.js";

test("assistant-led phase 13 desktop toolchain report makes the macOS-only contract explicit", () => {
  const report = buildDesktopToolchainReport({
    platformSupported: false,
    projectPresent: true,
    npmAvailable: true,
    cargoAvailable: true,
    rustcAvailable: true,
    xcodeSelectAvailable: true,
  });

  assert.equal(report.support_contract, DESKTOP_SUPPORT_CONTRACT);
  assert.equal(report.platform_supported, false);
  assert.match(report.summary, /macos/i);
  assert.match(report.unsupported_reason ?? "", /macos/i);
  assert.match(report.dependency_posture.summary, /supported macos desktop path|unsupported linux gtk3\/webkit/i);
});

test("assistant-led phase 13 desktop reinstall guidance flags stale installed builds", () => {
  const result = summarizeDesktopReinstall(true, true, "current-commit", {
    built_at: "2026-04-07T00:00:00.000Z",
    source_commit: "old-commit",
    vite_version: "7.3.2",
    tauri_cli_version: "2.10.1",
    tauri_runtime_version: "2.10.3",
  });

  assert.equal(result.reinstallRecommended, true);
  assert.match(result.reinstallReason ?? "", /built from old-comm/i);
});

test("assistant-led phase 13 desktop reinstall guidance distinguishes missing provenance from missing app", () => {
  const missingApp = summarizeDesktopReinstall(false, true, "current", {
    built_at: null,
    source_commit: null,
    vite_version: null,
    tauri_cli_version: null,
    tauri_runtime_version: null,
  });
  const missingProvenance = summarizeDesktopReinstall(true, true, "current", {
    built_at: null,
    source_commit: null,
    vite_version: null,
    tauri_cli_version: null,
    tauri_runtime_version: null,
  });

  assert.equal(missingApp.reinstallRecommended, false);
  assert.equal(missingProvenance.reinstallRecommended, true);
  assert.match(missingProvenance.reinstallReason ?? "", /build provenance is missing/i);
});

test("assistant-led phase 13 desktop platform verification allows unsupported GTK3 noise but blocks supported-path findings", () => {
  const allowed = evaluateDesktopPlatformVerification(
    { metadata: { vulnerabilities: { total: 0 } } },
    {
      vulnerabilities: { list: [] },
      warnings: {
        unsound: [
          {
            package: { name: "glib" },
            advisory: { id: "RUSTSEC-2024-0429" },
          },
          {
            package: { name: "rand", version: "0.8.5" },
            advisory: { id: "RUSTSEC-2026-0097" },
          },
        ],
        unmaintained: [
          {
            package: { name: "gtk" },
            advisory: { id: "RUSTSEC-2024-0410" },
          },
        ],
      },
    },
  );
  const blocked = evaluateDesktopPlatformVerification(
    { metadata: { vulnerabilities: { total: 1 } } },
    {
      vulnerabilities: { list: [] },
      warnings: {
        unsound: [
          {
            package: { name: "some-supported-crate" },
            advisory: { id: "RUSTSEC-2099-0001" },
          },
        ],
      },
    },
  );

  assert.equal(allowed.ok, true);
  assert.match(allowed.info.join("\n"), /glib/i);
  assert.match(allowed.info.join("\n"), /rand/i);
  assert.equal(blocked.ok, false);
  assert.match(blocked.errors.join("\n"), /npm audit/i);
  assert.match(blocked.errors.join("\n"), /some-supported-crate/i);
});
