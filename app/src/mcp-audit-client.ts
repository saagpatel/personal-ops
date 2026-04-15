import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface McpServerPosture {
	server_name: string;
	risk_score: number;
	risk_level: string;
	risk_flags: string[];
	filesystem_write: boolean;
	network_access: boolean;
	process_execution: boolean;
}

export interface McpSecurityPosture {
	scan_timestamp: string;
	total_servers: number;
	high_risk_count: number;
	critical_count: number;
	average_risk_score: number;
	servers: McpServerPosture[];
	/** Top concern for briefing */
	briefing_line: string;
}

function parseBool(value: unknown): boolean {
	return value === true;
}

function parseString(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

function parseNumber(value: unknown, fallback = 0): number {
	return typeof value === "number" && isFinite(value) ? value : fallback;
}

function parseStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((v): v is string => typeof v === "string");
}

function parseServer(raw: unknown): McpServerPosture {
	if (typeof raw !== "object" || raw === null) {
		throw new Error("Invalid server entry in mcp-audit output");
	}
	const s = raw as Record<string, unknown>;
	const permissions =
		typeof s["permission_surface"] === "object" &&
		s["permission_surface"] !== null
			? (s["permission_surface"] as Record<string, unknown>)
			: {};

	return {
		server_name: parseString(s["server_name"], "(unknown)"),
		risk_score: parseNumber(s["risk_score"], 0),
		risk_level: parseString(s["risk_level"], "low"),
		risk_flags: parseStringArray(s["risk_flags"]),
		filesystem_write: parseBool(permissions["filesystem_write"]),
		network_access: parseBool(permissions["network_access"]),
		process_execution: parseBool(permissions["process_execution"]),
	};
}

function buildBriefingLine(
	critical: number,
	highRisk: number,
	total: number,
	avg: number,
): string {
	if (critical > 0) {
		return `CRITICAL: ${critical} MCP server${critical === 1 ? "" : "s"} at critical risk`;
	}
	if (highRisk > 0) {
		return `${highRisk} high-risk MCP server${highRisk === 1 ? "" : "s"} detected`;
	}
	return `${total} server${total === 1 ? "" : "s"} scanned · avg risk: ${avg.toFixed(1)}/10`;
}

export class McpAuditClient {
	private readonly projectPath: string;

	constructor(projectPath = path.join(os.homedir(), "Projects/MCPAudit")) {
		this.projectPath = projectPath;
	}

	isAvailable(): boolean {
		return (
			fs.existsSync(this.projectPath) &&
			fs.existsSync(path.join(this.projectPath, "pyproject.toml"))
		);
	}

	scan(timeoutMs?: number): McpSecurityPosture {
		if (!this.isAvailable()) {
			throw new Error(`mcp-audit project not found at ${this.projectPath}`);
		}

		const outputPath = `/tmp/personal-ops-mcp-audit-${Date.now()}.json`;
		const pythonSnippet = [
			"from mcp_audit.cli import main; import sys;",
			`sys.argv=['mcp-audit','scan','--json','${outputPath}','--skip-connect','--timeout','5'];`,
			"main()",
		].join(" ");

		const result = spawnSync("uv", ["run", "python", "-c", pythonSnippet], {
			cwd: this.projectPath,
			timeout: timeoutMs ?? 15_000,
			encoding: "utf-8",
		});

		if (result.status !== 0) {
			const stderr =
				typeof result.stderr === "string"
					? result.stderr.trim()
					: "(no stderr)";
			throw new Error(
				`mcp-audit scan failed (exit ${result.status ?? "null"}): ${stderr}`,
			);
		}

		if (!fs.existsSync(outputPath)) {
			throw new Error(
				`mcp-audit completed but output file was not written: ${outputPath}`,
			);
		}

		let rawJson: string;
		try {
			rawJson = fs.readFileSync(outputPath, "utf-8");
		} finally {
			try {
				fs.unlinkSync(outputPath);
			} catch {
				// best-effort cleanup — temp file may already be gone
			}
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(rawJson);
		} catch (err) {
			throw new Error(`Failed to parse mcp-audit JSON output: ${String(err)}`);
		}

		if (typeof parsed !== "object" || parsed === null) {
			throw new Error("mcp-audit output is not a JSON object");
		}

		const root = parsed as Record<string, unknown>;
		const metadata =
			typeof root["metadata"] === "object" && root["metadata"] !== null
				? (root["metadata"] as Record<string, unknown>)
				: {};
		const summary =
			typeof root["summary"] === "object" && root["summary"] !== null
				? (root["summary"] as Record<string, unknown>)
				: {};

		const rawServers = Array.isArray(root["servers"]) ? root["servers"] : [];
		const servers: McpServerPosture[] = rawServers.map((s, i) => {
			try {
				return parseServer(s);
			} catch (err) {
				throw new Error(`mcp-audit server[${i}] parse error: ${String(err)}`);
			}
		});

		const highRiskCount = servers.filter((s) => s.risk_score >= 7).length;
		const criticalCount = servers.filter((s) => s.risk_score >= 9).length;
		const averageRiskScore = parseNumber(summary["average_risk_score"], 0);
		const totalServers = parseNumber(
			summary["total_servers"] ?? metadata["server_count"],
			servers.length,
		);
		const scanTimestamp = parseString(
			metadata["scan_timestamp"],
			new Date().toISOString(),
		);

		return {
			scan_timestamp: scanTimestamp,
			total_servers: totalServers,
			high_risk_count: highRiskCount,
			critical_count: criticalCount,
			average_risk_score: averageRiskScore,
			servers,
			briefing_line: buildBriefingLine(
				criticalCount,
				highRiskCount,
				totalServers,
				averageRiskScore,
			),
		};
	}
}
