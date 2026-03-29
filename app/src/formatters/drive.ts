import type { DriveDocRecord, DriveFileRecord, DriveSheetRecord, DriveStatusReport } from "../types.js";
import { line } from "./shared.js";

function pushSection(lines: string[], title: string, rows: string[]) {
  lines.push(title);
  lines.push(...rows);
  lines.push("");
}

function maybe(value: string | null | undefined, fallback = "not recorded"): string {
  return value?.trim() ? value : fallback;
}

export function formatDriveStatus(report: DriveStatusReport): string {
  const lines: string[] = [];
  lines.push("Personal Ops Drive Status");
  lines.push(line("Enabled", report.enabled ? "yes" : "no"));
  lines.push(line("Authenticated", report.authenticated ? "yes" : "no"));
  lines.push(line("Sync status", report.sync_status));
  lines.push(line("Last synced", report.last_synced_at ?? "never"));
  lines.push("");

  pushSection(lines, "Scope", [
    line("Included folders", String(report.included_folder_count)),
    line("Included files", String(report.included_file_count)),
  ]);

  pushSection(lines, "Indexed", [
    line("Files", String(report.indexed_file_count)),
    line("Docs", String(report.indexed_doc_count)),
    line("Sheets", String(report.indexed_sheet_count)),
    line("Top item", maybe(report.top_item_summary, "nothing notable")),
  ]);

  return lines.join("\n").trimEnd();
}

export function formatDriveFiles(files: DriveFileRecord[]): string {
  const lines: string[] = [];
  lines.push("Personal Ops Drive Files");
  lines.push(line("Count", String(files.length)));
  lines.push("");
  if (files.length === 0) {
    lines.push("No in-scope Drive files are indexed yet.");
    return lines.join("\n");
  }
  for (const file of files) {
    lines.push(`- ${file.name}`);
    lines.push(`  id: ${file.file_id}`);
    lines.push(`  type: ${file.mime_type}`);
    lines.push(`  source: ${file.scope_source}`);
    lines.push(`  updated: ${file.drive_modified_time ?? file.updated_at}`);
    if (file.web_view_link) {
      lines.push(`  open: ${file.web_view_link}`);
    }
  }
  return lines.join("\n");
}

export function formatDriveDoc(doc: DriveDocRecord): string {
  const lines: string[] = [];
  lines.push(`Personal Ops Drive Doc: ${doc.title}`);
  lines.push(line("File ID", doc.file_id));
  lines.push(line("Type", doc.mime_type));
  lines.push(line("Updated", doc.updated_at));
  lines.push(line("Open", doc.web_view_link ?? "not recorded"));
  lines.push("");
  pushSection(lines, "Snippet", [doc.snippet ? doc.snippet : "No snippet extracted."]);
  pushSection(lines, "Text", [doc.text_content || "No text extracted."]);
  return lines.join("\n").trimEnd();
}

export function formatDriveSheet(sheet: DriveSheetRecord): string {
  const lines: string[] = [];
  lines.push(`Personal Ops Drive Sheet: ${sheet.title}`);
  lines.push(line("File ID", sheet.file_id));
  lines.push(line("Type", sheet.mime_type));
  lines.push(line("Updated", sheet.updated_at));
  lines.push(line("Open", sheet.web_view_link ?? "not recorded"));
  lines.push("");
  pushSection(lines, "Tabs", [
    sheet.tab_names.length > 0 ? sheet.tab_names.join(", ") : "No sheet tabs were indexed.",
  ]);
  pushSection(lines, "Header Preview", [
    sheet.header_preview.length > 0 ? sheet.header_preview.join(" | ") : "No header preview was extracted.",
  ]);
  pushSection(lines, "Cell Preview", [
    sheet.cell_preview.length > 0
      ? sheet.cell_preview.map((row) => row.join(" | ")).join("\n")
      : "No cell preview was extracted.",
  ]);
  pushSection(lines, "Snippet", [sheet.snippet ? sheet.snippet : "No snippet extracted."]);
  return lines.join("\n").trimEnd();
}
