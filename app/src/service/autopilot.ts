import { createHash } from "node:crypto";
import {
  AutopilotProfile,
  AutopilotProfileState,
  AutopilotProfileStateRecord,
  AutopilotStatusReport,
  AutopilotTrigger,
} from "../types.js";
import { maybeAutoPrepareMeetingPackets } from "./meeting-prep.js";
import { maybeAutoPreparePlanningBundles } from "./planning-autopilot.js";

const PROFILE_ORDER: AutopilotProfile[] = ["day_start", "inbox", "meetings", "planning", "outbound"];

function enabledProfiles(service: any): AutopilotProfile[] {
  const configured = Array.isArray(service.config.autopilotProfiles) ? service.config.autopilotProfiles : PROFILE_ORDER;
  return PROFILE_ORDER.filter((profile, index) => configured.includes(profile) && PROFILE_ORDER.indexOf(profile) === index);
}

function hashFingerprint(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input ?? null)).digest("hex");
}

function minutesToMs(minutes: number): number {
  return Math.max(1, minutes) * 60_000;
}

function isoAt(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function stableJitterMs(service: any, profile: AutopilotProfile, baseMs: number): number {
  const seed = `${service.paths.machineIdentityFile}:${profile}`;
  const digest = createHash("sha256").update(seed).digest();
  const ratio = (digest.at(0) ?? 0) / 255;
  return Math.round(baseMs * 0.2 * ratio);
}

function profileFreshnessMs(service: any, profile: AutopilotProfile): number {
  if (profile === "meetings") {
    const nextEvent = service.listUpcomingCalendarEvents(1, 1)[0];
    if (nextEvent) {
      const hoursUntil = (Date.parse(nextEvent.start_at) - Date.now()) / 3_600_000;
      return hoursUntil > 0 && hoursUntil <= 2 ? minutesToMs(5) : minutesToMs(15);
    }
    return minutesToMs(15);
  }
  if (profile === "planning") {
    return minutesToMs(15);
  }
  return minutesToMs(10);
}

function firstRepairStepFromWorklist(worklist: any): string | null {
  const actionable = worklist.items.find((item: any) => typeof item.suggested_command === "string" && item.suggested_command.trim().length > 0);
  return actionable?.suggested_command ?? (worklist.state === "ready" ? null : "personal-ops doctor");
}

function isStale(record: AutopilotProfileStateRecord | null): boolean {
  if (!record?.stale_at) {
    return true;
  }
  return Date.parse(record.stale_at) <= Date.now();
}

function stateForRecord(
  service: any,
  profile: AutopilotProfile,
  record: AutopilotProfileStateRecord | null,
): AutopilotProfileState {
  if (!service.config.autopilotEnabled || service.config.autopilotMode === "off") {
    return "idle";
  }
  if (!record) {
    return "idle";
  }
  if (record.state === "running" || record.state === "blocked" || record.state === "failed") {
    return record.state;
  }
  return isStale(record) ? "stale" : "fresh";
}

function shouldWarm(report: AutopilotStatusReport): boolean {
  return report.enabled && report.mode === "continuous" && report.profiles.some((profile) => profile.state === "stale" || profile.state === "idle");
}

async function buildReadiness(service: any, options: { httpReachable: boolean }): Promise<{ readiness: any; topItemSummary: string | null; firstRepairStep: string | null }> {
  const worklist = await service.getWorklistReport(options);
  return {
    readiness: worklist.state,
    topItemSummary: worklist.items[0]?.summary ?? null,
    firstRepairStep: firstRepairStepFromWorklist(worklist),
  };
}

async function buildProfileFingerprint(service: any, profile: AutopilotProfile): Promise<{ fingerprint: string; summary: string | null }> {
  if (profile === "day_start") {
    const nowNext = await service.getNowNextWorkflowReport({ httpReachable: true });
    const prepDay = await service.getPrepDayWorkflowReport({ httpReachable: true });
    const queue = await service.getAssistantActionQueueReport({ httpReachable: true });
    const input = {
      now_next: nowNext.actions.slice(0, 3).map((action: any) => action.command),
      prep_day: prepDay.actions.slice(0, 3).map((action: any) => action.command),
      assistant: queue.actions.slice(0, 5).map((action: any) => [action.action_id, action.state]),
    };
    return {
      fingerprint: hashFingerprint(input),
      summary: nowNext.actions[0]?.summary ?? prepDay.actions[0]?.summary ?? queue.top_item_summary ?? null,
    };
  }
  if (profile === "inbox") {
    const report = await service.getInboxAutopilotReport({ httpReachable: true });
    return {
      fingerprint: hashFingerprint(
        report.groups.map((group: any) => ({
          id: group.group_id,
          state: group.state,
          drafts: group.draft_artifact_ids,
          threads: group.threads.map((thread: any) => thread.thread_id),
        })),
      ),
      summary: report.top_item_summary ?? report.summary,
    };
  }
  if (profile === "meetings") {
    const report = await service.getPrepMeetingsWorkflowReport({ httpReachable: true, scope: "next_24h" });
    return {
      fingerprint: hashFingerprint({
        actions: report.actions.map((action: any) => [action.target_id, action.command]),
        sections: report.sections.map((section: any) => [section.title, section.items.length]),
      }),
      summary: report.actions[0]?.summary ?? report.summary,
    };
  }
  if (profile === "planning") {
    const report = await service.getPlanningAutopilotReport({ httpReachable: true });
    return {
      fingerprint: hashFingerprint(
        report.bundles.map((bundle: any) => ({
          id: bundle.bundle_id,
          state: bundle.state,
          apply_ready: bundle.apply_ready,
          recommendation_ids: bundle.recommendation_ids,
        })),
      ),
      summary: report.top_item_summary ?? report.summary,
    };
  }
  const report = await service.getOutboundAutopilotReport({ httpReachable: true });
  return {
    fingerprint: hashFingerprint(
      report.groups.map((group: any) => ({
        id: group.group_id,
        state: group.state,
        approvals: group.approval_ids,
        drafts: group.draft_artifact_ids,
      })),
    ),
    summary: report.top_item_summary ?? report.summary,
  };
}

async function runDayStartProfile(service: any): Promise<string | null> {
  const [status, queue, nowNext, prepDay] = await Promise.all([
    service.getStatusReport({ httpReachable: true }),
    service.getAssistantActionQueueReport({ httpReachable: true }),
    service.getNowNextWorkflowReport({ httpReachable: true }),
    service.getPrepDayWorkflowReport({ httpReachable: true }),
  ]);
  return nowNext.actions[0]?.summary ?? prepDay.actions[0]?.summary ?? queue.top_item_summary ?? status.worklist_summary.top_item_summary ?? null;
}

async function runInboxProfile(service: any, runId: string, trigger: AutopilotTrigger): Promise<string | null> {
  const identity = service.systemPlanningIdentity(`autopilot:${trigger}:inbox`);
  const report = await service.getInboxAutopilotReport({ httpReachable: true });
  const targets = report.groups.filter((group: any) => group.state === "proposed" || group.state === "failed").slice(0, 2);
  for (const group of targets) {
    await service.prepareInboxAutopilotGroup(identity, group.group_id, {
      autopilotMetadata: {
        autopilot_run_id: runId,
        autopilot_profile: "inbox",
        autopilot_trigger: trigger,
        autopilot_prepared_at: new Date().toISOString(),
      },
    });
  }
  const refreshed = await service.getInboxAutopilotReport({ httpReachable: true });
  return refreshed.top_item_summary ?? refreshed.summary;
}

async function runMeetingsProfile(service: any, runId: string, trigger: AutopilotTrigger): Promise<string | null> {
  await maybeAutoPrepareMeetingPackets(service, {
    httpReachable: true,
    autopilotMetadata: {
      autopilot_run_id: runId,
      autopilot_profile: "meetings",
      autopilot_trigger: trigger,
      autopilot_prepared_at: new Date().toISOString(),
    },
  });
  const refreshed = await service.getPrepMeetingsWorkflowReport({ httpReachable: true, scope: "next_24h" });
  return refreshed.actions[0]?.summary ?? refreshed.summary;
}

async function runPlanningProfile(service: any, runId: string, trigger: AutopilotTrigger): Promise<string | null> {
  await maybeAutoPreparePlanningBundles(service, {
    httpReachable: true,
    autopilotMetadata: {
      autopilot_run_id: runId,
      autopilot_profile: "planning",
      autopilot_trigger: trigger,
      autopilot_prepared_at: new Date().toISOString(),
    },
  });
  const refreshed = await service.getPlanningAutopilotReport({ httpReachable: true });
  return refreshed.top_item_summary ?? refreshed.summary;
}

async function runOutboundProfile(service: any): Promise<string | null> {
  const report = await service.getOutboundAutopilotReport({ httpReachable: true });
  return report.top_item_summary ?? report.summary;
}

async function maybeRunProfile(
  service: any,
  profile: AutopilotProfile,
  request: { trigger: AutopilotTrigger; requestedProfile: AutopilotProfile | null; manual: boolean },
  runId: string,
  readiness: any,
): Promise<{ state: AutopilotProfileState; summary: string | null }> {
  const existing = service.db.getAutopilotProfileState(profile);
  const { fingerprint, summary: fingerprintSummary } = await buildProfileFingerprint(service, profile);
  const changed = existing?.fingerprint !== fingerprint;
  const freshnessMs = profileFreshnessMs(service, profile);
  const backoffMs = minutesToMs(service.config.autopilotFailureBackoffMinutes) + stableJitterMs(service, profile, minutesToMs(service.config.autopilotFailureBackoffMinutes));
  const now = new Date().toISOString();

  if (!request.manual && existing?.next_eligible_run_at && Date.parse(existing.next_eligible_run_at) > Date.now()) {
    return {
      state: stateForRecord(service, profile, existing),
      summary: existing?.last_summary ?? fingerprintSummary,
    };
  }

  if (profile !== "day_start" && readiness !== "ready") {
    const blockedSummary = "Autopilot skipped this surface until the workspace is healthy.";
    service.db.upsertAutopilotProfileState(profile, {
      state: "blocked",
      fingerprint,
      stale_at: isoAt(freshnessMs),
      next_eligible_run_at: isoAt(backoffMs),
      last_summary: blockedSummary,
      last_trigger: request.trigger,
      last_run_at: now,
      last_failure_at: now,
      last_run_outcome: "blocked",
      consecutive_failures: (existing?.consecutive_failures ?? 0) + 1,
      changed_since_last_run: changed,
      last_run_id: runId,
    });
    return { state: "blocked", summary: blockedSummary };
  }

  const currentlyStale = isStale(existing);
  const shouldRun = request.manual || changed || currentlyStale || !existing?.prepared_at;
  if (!shouldRun) {
    service.db.upsertAutopilotProfileState(profile, {
      state: "fresh",
      fingerprint,
      stale_at: existing?.stale_at ?? isoAt(freshnessMs),
      last_summary: existing?.last_summary ?? fingerprintSummary,
      last_trigger: request.trigger,
      changed_since_last_run: false,
      last_run_id: runId,
    });
    return { state: "fresh", summary: existing?.last_summary ?? fingerprintSummary };
  }

  service.db.upsertAutopilotProfileState(profile, {
    state: "running",
    fingerprint,
    last_summary: existing?.last_summary ?? fingerprintSummary,
    last_trigger: request.trigger,
    last_run_at: now,
    changed_since_last_run: changed,
    last_run_id: runId,
  });

  if (service.config.autopilotMode === "observe" && profile !== "day_start") {
    const observeSummary = "Observe mode captured freshness but skipped automatic preparation.";
    service.db.upsertAutopilotProfileState(profile, {
      state: "stale",
      fingerprint,
      prepared_at: existing?.prepared_at ?? null,
      stale_at: isoAt(freshnessMs),
      next_eligible_run_at: isoAt(freshnessMs),
      last_summary: observeSummary,
      last_trigger: request.trigger,
      last_run_at: now,
      last_success_at: existing?.last_success_at ?? null,
      consecutive_failures: existing?.consecutive_failures ?? 0,
      changed_since_last_run: changed,
      last_run_id: runId,
    });
    return { state: "stale", summary: observeSummary };
  }

  try {
    const profileSummary =
      profile === "day_start"
        ? await runDayStartProfile(service)
        : profile === "inbox"
          ? await runInboxProfile(service, runId, request.trigger)
          : profile === "meetings"
            ? await runMeetingsProfile(service, runId, request.trigger)
            : profile === "planning"
              ? await runPlanningProfile(service, runId, request.trigger)
              : await runOutboundProfile(service);
    const preparedAt = new Date().toISOString();
    service.db.upsertAutopilotProfileState(profile, {
      state: "fresh",
      fingerprint,
      prepared_at: preparedAt,
      stale_at: new Date(Date.parse(preparedAt) + freshnessMs).toISOString(),
      next_eligible_run_at: preparedAt,
      last_summary: profileSummary ?? fingerprintSummary,
      last_trigger: request.trigger,
      last_run_at: now,
      last_success_at: preparedAt,
      consecutive_failures: 0,
      last_run_outcome: "success",
      changed_since_last_run: changed,
      last_run_id: runId,
    });
    return { state: "fresh", summary: profileSummary ?? fingerprintSummary };
  } catch (error) {
    const failedAt = new Date().toISOString();
    const failureSummary = error instanceof Error ? error.message : String(error);
    service.db.upsertAutopilotProfileState(profile, {
      state: "failed",
      fingerprint,
      stale_at: isoAt(freshnessMs),
      next_eligible_run_at: new Date(Date.parse(failedAt) + backoffMs).toISOString(),
      last_summary: failureSummary,
      last_trigger: request.trigger,
      last_run_at: now,
      last_failure_at: failedAt,
      last_run_outcome: "failed",
      consecutive_failures: (existing?.consecutive_failures ?? 0) + 1,
      changed_since_last_run: changed,
      last_run_id: runId,
    });
    return { state: "failed", summary: failureSummary };
  }
}

export async function buildAutopilotStatusReport(
  service: any,
  options: { httpReachable: boolean; triggerWarm?: AutopilotTrigger | null } = { httpReachable: true },
): Promise<AutopilotStatusReport> {
  const latestRun = service.db.getLatestAutopilotRun();
  const stored = new Map<AutopilotProfile, AutopilotProfileStateRecord>(
    service.db.listAutopilotProfileStates().map((record: AutopilotProfileStateRecord) => [record.profile, record]),
  );
  const readiness = await buildReadiness(service, { httpReachable: options.httpReachable });
  const profiles = enabledProfiles(service).map((profile) => {
    const record = stored.get(profile) ?? null;
    return {
      profile,
      state: stateForRecord(service, profile, record),
      prepared_at: record?.prepared_at,
      stale_at: record?.stale_at,
      next_eligible_run_at: record?.next_eligible_run_at,
      consecutive_failures: record?.consecutive_failures ?? 0,
      changed_since_last_run: record?.changed_since_last_run ?? false,
      summary: record?.last_summary ?? null,
    };
  });
  const report: AutopilotStatusReport = {
    enabled: service.config.autopilotEnabled,
    mode: service.config.autopilotMode,
    readiness: readiness.readiness,
    running: Boolean(service.isAutopilotRunning()) || latestRun?.outcome === "running",
    last_run_at: latestRun?.started_at ?? null,
    last_success_at:
      service.db
        .listAutopilotRuns(10)
        .find((run: any) => run.outcome === "success")?.completed_at ?? null,
    last_failure_at:
      service.db
        .listAutopilotRuns(10)
        .find((run: any) => run.outcome === "failed" || run.outcome === "blocked")?.completed_at ?? null,
    last_trigger: latestRun?.trigger ?? null,
    top_item_summary: readiness.topItemSummary,
    first_repair_step: readiness.firstRepairStep,
    profiles,
  };
  if (options.triggerWarm && shouldWarm(report)) {
    service.scheduleAutopilotRun(options.triggerWarm, { httpReachable: options.httpReachable });
  }
  return report;
}

export async function runAutopilotCoordinator(
  service: any,
  request: { trigger: AutopilotTrigger; requestedProfile: AutopilotProfile | null; httpReachable: boolean; manual: boolean },
): Promise<AutopilotStatusReport> {
  if (!service.config.autopilotEnabled || service.config.autopilotMode === "off") {
    return buildAutopilotStatusReport(service, { httpReachable: request.httpReachable });
  }
  const run = service.db.createAutopilotRun(request.trigger, request.requestedProfile);
  const readiness = await buildReadiness(service, { httpReachable: request.httpReachable });
  const profiles = (request.requestedProfile ? [request.requestedProfile] : enabledProfiles(service)).filter((profile, index, all) => all.indexOf(profile) === index);
  const results: Array<{ profile: AutopilotProfile; state: AutopilotProfileState; summary: string | null }> = [];

  for (const profile of profiles) {
    const result = await maybeRunProfile(service, profile, request, run.run_id, readiness.readiness);
    results.push({ profile, ...result });
  }

  await service.refreshReviewReadModel("autopilot");

  const failed = results.filter((result) => result.state === "failed").length;
  const blocked = results.filter((result) => result.state === "blocked").length;
  const outcome = failed > 0 ? "failed" : blocked === results.length && results.length > 0 ? "blocked" : "success";
  const summary =
    failed > 0
      ? `Autopilot refreshed ${results.length} profile${results.length === 1 ? "" : "s"} with ${failed} failure${failed === 1 ? "" : "s"}.`
      : blocked > 0
        ? `Autopilot refreshed ${results.length} profile${results.length === 1 ? "" : "s"} with ${blocked} blocked surface${blocked === 1 ? "" : "s"}.`
        : `Autopilot refreshed ${results.length} profile${results.length === 1 ? "" : "s"}.`;
  service.db.completeAutopilotRun(run.run_id, {
    outcome,
    summary,
    error_message: failed > 0 ? results.filter((result) => result.state === "failed").map((result) => result.summary).filter(Boolean).join(" | ") : null,
  });
  service.db.recordAuditEvent({
    client_id: "personal-ops-system",
    action: "autopilot_run",
    target_type: request.requestedProfile ? "autopilot_profile" : "autopilot",
    target_id: request.requestedProfile ?? run.run_id,
    outcome,
    metadata: {
      run_id: run.run_id,
      trigger: request.trigger,
      requested_profile: request.requestedProfile ?? null,
      summary,
      profiles: results,
    },
  });
  return buildAutopilotStatusReport(service, { httpReachable: request.httpReachable });
}
