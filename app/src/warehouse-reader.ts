import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const WAREHOUSE_DB_PATH = path.join(
	os.homedir(),
	"Projects/GithubRepoAuditor/output/portfolio-warehouse.db",
);

const EXPECTED_SCHEMA_VERSION = 17;

export interface WarehouseHotspot {
	repo_name: string;
	category: string;
	severity: number;
	title: string;
	summary: string;
	recommended_action: string;
}

export interface WarehouseLensScore {
	repo_name: string;
	lens: string;
	score: number;
	orientation: string;
	summary: string;
}

/**
 * Read-only client for the GithubRepoAuditor portfolio-warehouse.db SQLite database.
 * Opens a fresh connection per query. Never throws — errors are written to stderr only.
 */
export class WarehouseReader {
	private readonly dbPath: string;

	constructor(dbPath: string = WAREHOUSE_DB_PATH) {
		this.dbPath = dbPath;
	}

	isAvailable(): boolean {
		try {
			return fs.existsSync(this.dbPath);
		} catch (err) {
			console.error("[WarehouseReader] isAvailable check failed:", err);
			return false;
		}
	}

	/**
	 * Read schema version from warehouse_meta. Returns null if unavailable.
	 * Logs a warning if version doesn't match the expected value.
	 */
	getSchemaVersion(): number | null {
		if (!this.isAvailable()) return null;
		const db = new DatabaseSync(this.dbPath, { open: true });
		try {
			const row = db
				.prepare(
					"SELECT value FROM warehouse_meta WHERE key = 'schema_version'",
				)
				.get() as { value: string } | undefined;
			if (row == null) return null;
			const version = parseInt(row.value, 10);
			if (isNaN(version)) return null;
			if (version !== EXPECTED_SCHEMA_VERSION) {
				console.error(
					`[WarehouseReader] Unexpected schema version ${version} (expected ${EXPECTED_SCHEMA_VERSION}) — degrading gracefully`,
				);
			}
			return version;
		} catch (err) {
			console.error("[WarehouseReader] getSchemaVersion failed:", err);
			return null;
		} finally {
			db.close();
		}
	}

	/**
	 * Return the latest run_id from audit_runs, or null if unavailable.
	 */
	private getLatestRunId(db: DatabaseSync): string | null {
		try {
			const row = db
				.prepare("SELECT id FROM audit_runs ORDER BY generated_at DESC LIMIT 1")
				.get() as { id: string } | undefined;
			return row?.id ?? null;
		} catch (err) {
			console.error("[WarehouseReader] getLatestRunId failed:", err);
			return null;
		}
	}

	/**
	 * Return the top N hotspots for the latest audit run, sorted by severity DESC.
	 * Returns empty array if the DB is unavailable or the query fails.
	 */
	getHotspots(limit = 2): WarehouseHotspot[] {
		if (!this.isAvailable()) return [];
		const db = new DatabaseSync(this.dbPath, { open: true });
		try {
			const runId = this.getLatestRunId(db);
			if (runId == null) return [];
			const rows = db
				.prepare(
					`SELECT r.name AS repo_name,
					        h.category,
					        h.severity,
					        h.title,
					        h.summary,
					        h.recommended_action
					 FROM hotspots h
					 JOIN repos r ON r.id = h.repo_id
					 WHERE h.run_id = ?
					 ORDER BY h.severity DESC
					 LIMIT ?`,
				)
				.all(runId, limit) as Array<{
				repo_name: string;
				category: string;
				severity: number;
				title: string;
				summary: string;
				recommended_action: string;
			}>;
			return rows.map((row) => ({
				repo_name: row.repo_name,
				category: row.category,
				severity: row.severity,
				title: row.title,
				summary: row.summary,
				recommended_action: row.recommended_action,
			}));
		} catch (err) {
			console.error("[WarehouseReader] getHotspots failed:", err);
			return [];
		} finally {
			db.close();
		}
	}

	/**
	 * Return the N worst-scoring repos for the given lens (lower score = worse).
	 * Returns empty array if the DB is unavailable or the query fails.
	 */
	getWorstLensScores(
		lens = "maintenance_risk",
		limit = 3,
	): WarehouseLensScore[] {
		if (!this.isAvailable()) return [];
		const db = new DatabaseSync(this.dbPath, { open: true });
		try {
			const runId = this.getLatestRunId(db);
			if (runId == null) return [];
			const rows = db
				.prepare(
					`SELECT r.name AS repo_name,
					        ls.lens,
					        ls.score,
					        ls.orientation,
					        ls.summary
					 FROM lens_scores ls
					 JOIN repos r ON r.id = ls.repo_id
					 WHERE ls.run_id = ? AND ls.lens = ?
					 ORDER BY ls.score ASC
					 LIMIT ?`,
				)
				.all(runId, lens, limit) as Array<{
				repo_name: string;
				lens: string;
				score: number;
				orientation: string;
				summary: string;
			}>;
			return rows.map((row) => ({
				repo_name: row.repo_name,
				lens: row.lens,
				score: row.score,
				orientation: row.orientation,
				summary: row.summary,
			}));
		} catch (err) {
			console.error("[WarehouseReader] getWorstLensScores failed:", err);
			return [];
		} finally {
			db.close();
		}
	}
}
