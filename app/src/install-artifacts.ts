import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getLaunchAgentPlistPath } from "./launchagent.js";
import type { InstallManifest, Paths, WrapperProvenance } from "./types.js";

export interface InstallArtifactPaths {
  cliWrapperPath: string;
  daemonWrapperPath: string;
  codexMcpWrapperPath: string;
  claudeMcpWrapperPath: string;
  launchAgentPlistPath: string;
  distCliPath: string;
  distDaemonPath: string;
  distMcpPath: string;
}

export type WrapperKey = "cli" | "daemon" | "codex_mcp" | "claude_mcp";

export interface WrapperHealthSummary {
  key: WrapperKey;
  label: string;
  wrapperPath: string;
  expectedTarget: string;
  nodeExecutable: string | null;
  targetFile: string | null;
  severity: "pass" | "warn" | "fail";
  exists: boolean;
  nodeExecutableExists: boolean;
  targetExists: boolean;
  provenancePresent: boolean;
  current: boolean;
  issues: string[];
  reason: string;
}

const WRAPPER_LABELS: Record<WrapperKey, string> = {
  cli: "CLI wrapper",
  daemon: "Daemon wrapper",
  codex_mcp: "Codex MCP wrapper",
  claude_mcp: "Claude MCP wrapper",
};

export function getInstallArtifactPaths(paths: Paths): InstallArtifactPaths {
  const home = process.env.HOME ?? os.homedir();
  return {
    cliWrapperPath: path.join(home, ".local", "bin", "personal-ops"),
    daemonWrapperPath: path.join(home, ".local", "bin", "personal-opsd"),
    codexMcpWrapperPath: path.join(home, ".codex", "bin", "personal-ops-mcp"),
    claudeMcpWrapperPath: path.join(home, ".claude", "bin", "personal-ops-mcp"),
    launchAgentPlistPath: getLaunchAgentPlistPath(),
    distCliPath: path.join(paths.appDir, "dist", "src", "cli.js"),
    distDaemonPath: path.join(paths.appDir, "dist", "src", "daemon.js"),
    distMcpPath: path.join(paths.appDir, "dist", "src", "mcp-server.js"),
  };
}

export function parseWrapper(wrapperPath: string): { nodeExecutable: string | null; targetFile: string | null } {
  if (!fs.existsSync(wrapperPath)) {
    return { nodeExecutable: null, targetFile: null };
  }
  const raw = fs.readFileSync(wrapperPath, "utf8");
  const match = raw.match(/exec\s+"([^"]+)"\s+"([^"]+)"\s+"\$@"/);
  return {
    nodeExecutable: match?.[1] ?? null,
    targetFile: match?.[2] ?? null,
  };
}

export function resolveCurrentSourceCommit(appDir: string): string | null {
  if (process.env.PERSONAL_OPS_SOURCE_COMMIT) {
    return process.env.PERSONAL_OPS_SOURCE_COMMIT;
  }
  const result = spawnSync("git", ["-C", appDir, "rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) {
    return null;
  }
  return (result.stdout ?? "").trim() || null;
}

function expectedTargetForKey(artifacts: InstallArtifactPaths, key: WrapperKey): string {
  if (key === "cli") {
    return artifacts.distCliPath;
  }
  if (key === "daemon") {
    return artifacts.distDaemonPath;
  }
  return artifacts.distMcpPath;
}

function wrapperPathForKey(artifacts: InstallArtifactPaths, key: WrapperKey): string {
  if (key === "cli") {
    return artifacts.cliWrapperPath;
  }
  if (key === "daemon") {
    return artifacts.daemonWrapperPath;
  }
  return key === "codex_mcp" ? artifacts.codexMcpWrapperPath : artifacts.claudeMcpWrapperPath;
}

function provenanceTargetForKey(provenance: WrapperProvenance | undefined, key: WrapperKey): string | null {
  if (!provenance) {
    return null;
  }
  if (key === "cli") {
    return provenance.cli_target;
  }
  if (key === "daemon") {
    return provenance.daemon_target;
  }
  return key === "codex_mcp" ? provenance.codex_mcp_target : provenance.claude_mcp_target;
}

function summarizeWrapperIssues(label: string, issues: string[], expectedTarget: string, currentSourceCommit: string | null): string {
  const issue = issues[0];
  if (issue === "missing_wrapper") {
    return `${label} is missing.`;
  }
  if (issue === "missing_node_executable") {
    return `${label} points to a Node executable that no longer exists.`;
  }
  if (issue === "missing_target") {
    return `${label} points to a CLI target that is missing from this checkout.`;
  }
  if (issue === "provenance_missing") {
    return `${label} is present, but wrapper provenance is missing from the install manifest.`;
  }
  if (issue === "source_commit_stale") {
    return `${label} was generated from an older checkout than ${currentSourceCommit?.slice(0, 8) ?? "this repo"}.`;
  }
  if (issue === "wrapper_target_stale") {
    return `${label} points at ${expectedTarget} from a different install layout.`;
  }
  if (issue === "provenance_mismatch") {
    return `${label} no longer matches the install manifest provenance.`;
  }
  return `${label} is healthy.`;
}

export function buildWrapperProvenance(
  paths: Paths,
  nodeExecutable: string,
  artifacts = getInstallArtifactPaths(paths),
): WrapperProvenance {
  return {
    generated_at: new Date().toISOString(),
    source_commit: resolveCurrentSourceCommit(paths.appDir),
    node_executable: nodeExecutable,
    cli_target: artifacts.distCliPath,
    daemon_target: artifacts.distDaemonPath,
    codex_mcp_target: artifacts.distMcpPath,
    claude_mcp_target: artifacts.distMcpPath,
  };
}

export function evaluateWrapperHealth(
  paths: Paths,
  manifest: InstallManifest | null,
  artifacts = getInstallArtifactPaths(paths),
): WrapperHealthSummary[] {
  const provenance = manifest?.wrapper_provenance;
  const currentSourceCommit = resolveCurrentSourceCommit(paths.appDir);

  return (["cli", "daemon", "codex_mcp", "claude_mcp"] as WrapperKey[]).map((key) => {
    const label = WRAPPER_LABELS[key];
    const wrapperPath = wrapperPathForKey(artifacts, key);
    const expectedTarget = expectedTargetForKey(artifacts, key);
    const parsed = parseWrapper(wrapperPath);
    const exists = fs.existsSync(wrapperPath);
    const nodeExecutableExists = Boolean(parsed.nodeExecutable && fs.existsSync(parsed.nodeExecutable));
    const targetExists = Boolean(parsed.targetFile && fs.existsSync(parsed.targetFile));
    const provenanceTarget = provenanceTargetForKey(provenance, key);
    const provenancePresent = Boolean(
      provenance &&
        provenance.generated_at &&
        provenance.node_executable &&
        provenanceTarget,
    );
    const issues: string[] = [];

    if (!exists) {
      issues.push("missing_wrapper");
    } else {
      if (!parsed.nodeExecutable || !nodeExecutableExists) {
        issues.push("missing_node_executable");
      }
      if (!parsed.targetFile || !targetExists) {
        issues.push("missing_target");
      } else if (parsed.targetFile !== expectedTarget) {
        issues.push("wrapper_target_stale");
      }
    }

    if (!provenancePresent) {
      issues.push("provenance_missing");
    } else {
      if (currentSourceCommit && provenance?.source_commit && provenance.source_commit !== currentSourceCommit) {
        issues.push("source_commit_stale");
      }
      if (parsed.nodeExecutable && provenance?.node_executable && parsed.nodeExecutable !== provenance.node_executable) {
        issues.push("provenance_mismatch");
      }
      if (parsed.targetFile && provenanceTarget && parsed.targetFile !== provenanceTarget) {
        issues.push("provenance_mismatch");
      }
      if (provenanceTarget && provenanceTarget !== expectedTarget) {
        issues.push("provenance_mismatch");
      }
    }

    const dedupedIssues = [...new Set(issues)];
    const severity =
      dedupedIssues.length === 0
        ? "pass"
        : key === "cli" && dedupedIssues.some((issue) =>
              issue === "missing_wrapper" || issue === "missing_node_executable" || issue === "missing_target"
            )
          ? "fail"
          : "warn";

    return {
      key,
      label,
      wrapperPath,
      expectedTarget,
      nodeExecutable: parsed.nodeExecutable,
      targetFile: parsed.targetFile,
      severity,
      exists,
      nodeExecutableExists,
      targetExists,
      provenancePresent,
      current: dedupedIssues.length === 0,
      issues: dedupedIssues,
      reason: summarizeWrapperIssues(label, dedupedIssues, expectedTarget, currentSourceCommit),
    };
  });
}
