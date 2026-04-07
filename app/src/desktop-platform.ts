import type {
  DesktopBuildProvenance,
  DesktopDependencyPosture,
  DesktopSupportContract,
  DesktopToolchainReport,
} from "./types.js";

export const DESKTOP_SUPPORT_CONTRACT: DesktopSupportContract = "macos_only";
export const DESKTOP_UNSUPPORTED_REASON = "Desktop shell is supported only on macOS in this phase.";
export const DESKTOP_MISSING_PROJECT_REASON = "Desktop project files are missing from the source checkout.";

const DESKTOP_UNSUPPORTED_PLATFORM_NOTE =
  "Linux GTK3/WebKit transitive dependencies from the Tauri/Wry stack are treated as unsupported-platform noise for this macOS-only desktop shell.";

const ALLOWED_UNSUPPORTED_RUST_PACKAGES = new Set([
  "atk",
  "atk-sys",
  "cairo-rs",
  "cairo-sys-rs",
  "gdk",
  "gdk-pixbuf",
  "gdk-pixbuf-sys",
  "gdk-sys",
  "gdkwayland-sys",
  "gdkx11",
  "gdkx11-sys",
  "gio",
  "gio-sys",
  "glib",
  "glib-sys",
  "gobject-sys",
  "gtk",
  "gtk-sys",
  "gtk3-macros",
  "javascriptcore-rs",
  "javascriptcore-rs-sys",
  "libappindicator",
  "libappindicator-sys",
  "pango",
  "pango-sys",
  "soup3",
  "soup3-sys",
  "webkit2gtk",
  "webkit2gtk-sys",
]);

interface DesktopToolchainInputs {
  platformSupported: boolean;
  projectPresent: boolean;
  npmAvailable: boolean;
  cargoAvailable: boolean;
  rustcAvailable: boolean;
  xcodeSelectAvailable: boolean;
}

export interface DesktopPlatformVerificationResult {
  ok: boolean;
  errors: string[];
  info: string[];
}

export function buildDesktopDependencyPosture(projectPresent: boolean): DesktopDependencyPosture {
  if (!projectPresent) {
    return {
      status: "project_missing",
      summary: DESKTOP_MISSING_PROJECT_REASON,
      unsupported_platform_notes: [DESKTOP_UNSUPPORTED_PLATFORM_NOTE],
    };
  }

  return {
    status: "supported_path_clear",
    summary: "Supported macOS desktop path is clear. Unsupported Linux GTK3/WebKit findings stay outside the shipped contract.",
    unsupported_platform_notes: [DESKTOP_UNSUPPORTED_PLATFORM_NOTE],
  };
}

export function buildDesktopToolchainReport(inputs: DesktopToolchainInputs): DesktopToolchainReport {
  const ready =
    inputs.platformSupported &&
    inputs.projectPresent &&
    inputs.npmAvailable &&
    inputs.cargoAvailable &&
    inputs.rustcAvailable &&
    inputs.xcodeSelectAvailable;
  const unsupportedReason = !inputs.platformSupported
    ? DESKTOP_UNSUPPORTED_REASON
    : !inputs.projectPresent
      ? DESKTOP_MISSING_PROJECT_REASON
      : null;
  const summary = !inputs.platformSupported
    ? DESKTOP_UNSUPPORTED_REASON
    : !inputs.projectPresent
      ? DESKTOP_MISSING_PROJECT_REASON
      : ready
        ? "macOS desktop toolchain is ready."
        : "Desktop toolchain is incomplete. Check npm, cargo, rustc, and xcode-select.";

  return {
    support_contract: DESKTOP_SUPPORT_CONTRACT,
    platform_supported: inputs.platformSupported,
    npm_available: inputs.npmAvailable,
    cargo_available: inputs.cargoAvailable,
    rustc_available: inputs.rustcAvailable,
    xcode_select_available: inputs.xcodeSelectAvailable,
    unsupported_reason: unsupportedReason,
    dependency_posture: buildDesktopDependencyPosture(inputs.projectPresent),
    ready,
    summary,
  };
}

export function summarizeDesktopReinstall(
  installed: boolean,
  projectPresent: boolean,
  currentSourceCommit: string | null,
  buildProvenance: DesktopBuildProvenance,
): { reinstallRecommended: boolean; reinstallReason: string | null } {
  if (!installed) {
    return { reinstallRecommended: false, reinstallReason: null };
  }

  if (!projectPresent) {
    return {
      reinstallRecommended: true,
      reinstallReason: "Desktop app is installed, but this checkout is missing the desktop project files.",
    };
  }

  if (!buildProvenance.built_at || !buildProvenance.source_commit) {
    return {
      reinstallRecommended: true,
      reinstallReason: "Desktop app is installed, but build provenance is missing. Reinstall it from this checkout.",
    };
  }

  if (currentSourceCommit && buildProvenance.source_commit !== currentSourceCommit) {
    return {
      reinstallRecommended: true,
      reinstallReason: `Desktop app was built from ${shortCommit(buildProvenance.source_commit)} but this checkout is ${shortCommit(currentSourceCommit)}.`,
    };
  }

  return { reinstallRecommended: false, reinstallReason: null };
}

export function evaluateDesktopPlatformVerification(npmAudit: any, cargoAudit: any): DesktopPlatformVerificationResult {
  const errors: string[] = [];
  const info: string[] = [];
  const npmVulnerabilityTotal = Number(npmAudit?.metadata?.vulnerabilities?.total ?? 0);

  if (npmVulnerabilityTotal > 0) {
    errors.push(`Desktop npm audit reported ${npmVulnerabilityTotal} actionable vulnerability${npmVulnerabilityTotal === 1 ? "" : "ies"}.`);
  } else {
    info.push("Desktop npm audit is clean.");
  }

  const cargoVulnerabilities = Array.isArray(cargoAudit?.vulnerabilities?.list) ? cargoAudit.vulnerabilities.list : [];
  if (cargoVulnerabilities.length > 0) {
    errors.push(
      `Desktop cargo audit reported actionable Rust vulnerabilities: ${cargoVulnerabilities
        .map((entry: any) => `${entry.package?.name ?? "unknown"} (${entry.advisory?.id ?? "unknown"})`)
        .join(", ")}.`,
    );
  } else {
    info.push("Desktop cargo audit reported no actionable Rust vulnerabilities.");
  }

  const unsoundWarnings = Array.isArray(cargoAudit?.warnings?.unsound) ? cargoAudit.warnings.unsound : [];
  const allowedUnsoundWarnings = unsoundWarnings.filter((entry: any) => ALLOWED_UNSUPPORTED_RUST_PACKAGES.has(entry.package?.name ?? ""));
  const actionableUnsoundWarnings = unsoundWarnings.filter((entry: any) => !ALLOWED_UNSUPPORTED_RUST_PACKAGES.has(entry.package?.name ?? ""));

  if (allowedUnsoundWarnings.length > 0) {
    info.push(
      `Allowed unsupported-platform Rust findings: ${allowedUnsoundWarnings
        .map((entry: any) => `${entry.package?.name ?? "unknown"} (${entry.advisory?.id ?? "unknown"})`)
        .join(", ")}.`,
    );
  }

  if (actionableUnsoundWarnings.length > 0) {
    errors.push(
      `Desktop cargo audit reported supported-path unsound findings: ${actionableUnsoundWarnings
        .map((entry: any) => `${entry.package?.name ?? "unknown"} (${entry.advisory?.id ?? "unknown"})`)
        .join(", ")}.`,
    );
  }

  const unmaintainedWarnings = Array.isArray(cargoAudit?.warnings?.unmaintained) ? cargoAudit.warnings.unmaintained : [];
  const unsupportedPlatformWarnings = unmaintainedWarnings.filter((entry: any) =>
    ALLOWED_UNSUPPORTED_RUST_PACKAGES.has(entry.package?.name ?? ""),
  );
  if (unsupportedPlatformWarnings.length > 0) {
    info.push(
      `Unsupported-platform GTK3/WebKit warnings remain informational: ${unsupportedPlatformWarnings
        .map((entry: any) => `${entry.package?.name ?? "unknown"} (${entry.advisory?.id ?? "unknown"})`)
        .join(", ")}.`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    info,
  };
}

export function shortCommit(value: string | null): string {
  return value ? value.slice(0, 8) : "unknown";
}
