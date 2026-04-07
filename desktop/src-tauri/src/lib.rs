use serde::{Deserialize, Serialize};
use std::{env, fs, path::PathBuf};

#[derive(Debug, Deserialize)]
struct ConfigFile {
    service: Option<ServiceSection>,
    autopilot: Option<AutopilotSection>,
}

#[derive(Debug, Deserialize)]
struct ServiceSection {
    host: Option<String>,
    port: Option<u16>,
}

#[derive(Debug, Deserialize)]
struct AutopilotSection {
    notification_cooldown_minutes: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ConsoleSession {
    launch_url: String,
}

#[derive(Debug, Deserialize)]
struct ConsoleSessionResponse {
    console_session: ConsoleSession,
}

#[derive(Debug, Serialize)]
struct DesktopSnapshot {
    readiness: String,
    now_next_summary: String,
    awaiting_review_count: usize,
    approval_pending_count: usize,
    autopilot_ready: bool,
    autopilot_summary: String,
    autopilot_stale_profile_count: usize,
    autopilot_last_success_at: Option<String>,
    review_ready_inbox_count: usize,
    apply_ready_planning_count: usize,
    outbound_approval_ready_count: usize,
    outbound_send_ready_count: usize,
    notification_cooldown_minutes: u64,
    daemon_available: bool,
    repair_hint: String,
}

#[derive(Debug, Deserialize)]
struct StatusEnvelope {
    status: StatusPayload,
}

#[derive(Debug, Deserialize)]
struct StatusPayload {
    state: String,
    approval_queue: ApprovalQueue,
}

#[derive(Debug, Deserialize)]
struct AutopilotEnvelope {
    autopilot: AutopilotPayload,
}

#[derive(Debug, Deserialize)]
struct AutopilotPayload {
    readiness: String,
    top_item_summary: Option<String>,
    last_success_at: Option<String>,
    profiles: Vec<AutopilotProfilePayload>,
}

#[derive(Debug, Deserialize)]
struct AutopilotProfilePayload {
    state: String,
}

#[derive(Debug, Deserialize)]
struct ApprovalQueue {
    pending_count: usize,
}

#[derive(Debug, Deserialize)]
struct AssistantQueueEnvelope {
    assistant_queue: AssistantQueuePayload,
}

#[derive(Debug, Deserialize)]
struct AssistantQueuePayload {
    actions: Vec<AssistantAction>,
}

#[derive(Debug, Deserialize)]
struct AssistantAction {
    state: String,
}

#[derive(Debug, Deserialize)]
struct InboxAutopilotEnvelope {
    inbox_autopilot: InboxAutopilotPayload,
}

#[derive(Debug, Deserialize)]
struct InboxAutopilotPayload {
    groups: Vec<InboxAutopilotGroup>,
}

#[derive(Debug, Deserialize)]
struct InboxAutopilotGroup {
    state: String,
}

#[derive(Debug, Deserialize)]
struct PlanningAutopilotEnvelope {
    planning_autopilot: PlanningAutopilotPayload,
}

#[derive(Debug, Deserialize)]
struct PlanningAutopilotPayload {
    bundles: Vec<PlanningAutopilotBundle>,
}

#[derive(Debug, Deserialize)]
struct PlanningAutopilotBundle {
    apply_ready: bool,
}

#[derive(Debug, Deserialize)]
struct OutboundAutopilotEnvelope {
    outbound_autopilot: OutboundAutopilotPayload,
}

#[derive(Debug, Deserialize)]
struct OutboundAutopilotPayload {
    groups: Vec<OutboundAutopilotGroup>,
}

#[derive(Debug, Deserialize)]
struct OutboundAutopilotGroup {
    state: String,
}

#[derive(Debug, Deserialize)]
struct WorkflowEnvelope {
    workflow: WorkflowPayload,
}

#[derive(Debug, Deserialize)]
struct WorkflowPayload {
    summary: String,
}

fn home_dir() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "Home directory is unavailable.".to_string())
}

fn config_file_path() -> Result<PathBuf, String> {
    if let Ok(value) = env::var("PERSONAL_OPS_CONFIG_DIR") {
        return Ok(PathBuf::from(value).join("config.toml"));
    }
    Ok(home_dir()?.join(".config").join("personal-ops").join("config.toml"))
}

fn api_token_file_path() -> Result<PathBuf, String> {
    if let Ok(value) = env::var("PERSONAL_OPS_STATE_DIR") {
        return Ok(PathBuf::from(value).join("local-api-token"));
    }
    Ok(home_dir()?
        .join("Library")
        .join("Application Support")
        .join("personal-ops")
        .join("local-api-token"))
}

fn load_config_file() -> Result<ConfigFile, String> {
    let config_path = config_file_path()?;
    let raw = fs::read_to_string(&config_path)
        .map_err(|error| format!("Could not read {}: {}", config_path.display(), error))?;
    toml::from_str(&raw).map_err(|error| format!("Could not parse {}: {}", config_path.display(), error))
}

fn service_base_url() -> Result<String, String> {
    let parsed = load_config_file()?;
    let host = parsed
        .service
        .as_ref()
        .and_then(|service| service.host.clone())
        .unwrap_or_else(|| "127.0.0.1".to_string());
    let port = parsed
        .service
        .as_ref()
        .and_then(|service| service.port)
        .unwrap_or(4312);
    Ok(format!("http://{}:{}", host, port))
}

fn notification_cooldown_minutes() -> Result<u64, String> {
    let parsed = load_config_file()?;
    Ok(parsed
        .autopilot
        .as_ref()
        .and_then(|autopilot| autopilot.notification_cooldown_minutes)
        .unwrap_or(30))
}

fn operator_token() -> Result<String, String> {
    let token_path = api_token_file_path()?;
    let token = fs::read_to_string(&token_path)
        .map_err(|error| format!("Could not read {}: {}", token_path.display(), error))?;
    let trimmed = token.trim().to_string();
    if trimmed.is_empty() {
        return Err("Local API token is blank. Run `personal-ops install all`.".to_string());
    }
    Ok(trimmed)
}

async fn get_json<T: for<'de> Deserialize<'de>>(path: &str) -> Result<T, String> {
    let base_url = service_base_url()?;
    let token = operator_token()?;
    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}{}", base_url, path))
        .header("authorization", format!("Bearer {}", token))
        .header("accept", "application/json")
        .header("x-personal-ops-client", "desktop-shell")
        .header("x-personal-ops-origin", "desktop-shell")
        .header("x-personal-ops-requested-by", "desktop")
        .send()
        .await
        .map_err(|error| format!("Desktop shell could not reach the daemon: {}", error))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(if body.trim().is_empty() {
            format!("Desktop daemon request failed with {}.", status)
        } else {
            body
        });
    }

    response
        .json::<T>()
        .await
        .map_err(|error| format!("Desktop shell could not decode daemon response: {}", error))
}

#[tauri::command]
async fn create_console_session() -> Result<ConsoleSession, String> {
    let base_url = service_base_url()?;
    let token = operator_token()?;
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/v1/console/session", base_url))
        .header("authorization", format!("Bearer {}", token))
        .header("accept", "application/json")
        .header("content-type", "application/json")
        .header("x-personal-ops-client", "desktop-shell")
        .header("x-personal-ops-origin", "desktop-shell")
        .header("x-personal-ops-requested-by", "desktop")
        .send()
        .await
        .map_err(|error| format!("Desktop shell could not request a console session: {}", error))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(if body.trim().is_empty() {
            format!("Console session request failed with {}.", status)
        } else {
            body
        });
    }

    let payload = response
        .json::<ConsoleSessionResponse>()
        .await
        .map_err(|error| format!("Desktop shell could not decode the console session: {}", error))?;
    Ok(payload.console_session)
}

#[tauri::command]
async fn get_desktop_snapshot() -> Result<DesktopSnapshot, String> {
    let status = get_json::<StatusEnvelope>("/v1/status").await?;
    let autopilot = get_json::<AutopilotEnvelope>("/v1/autopilot/status").await?;
    let now_next = get_json::<WorkflowEnvelope>("/v1/workflows/now-next").await?;
    let assistant = get_json::<AssistantQueueEnvelope>("/v1/assistant/actions").await?;
    let inbox = get_json::<InboxAutopilotEnvelope>("/v1/inbox/autopilot").await?;
    let planning = get_json::<PlanningAutopilotEnvelope>("/v1/planning/autopilot").await?;
    let outbound = get_json::<OutboundAutopilotEnvelope>("/v1/outbound/autopilot").await?;
    let cooldown = notification_cooldown_minutes()?;

    let awaiting_review_count = assistant
        .assistant_queue
        .actions
        .iter()
        .filter(|action| action.state == "awaiting_review")
        .count();
    let review_ready_inbox_count = inbox
        .inbox_autopilot
        .groups
        .iter()
        .filter(|group| group.state == "awaiting_review")
        .count();
    let apply_ready_planning_count = planning
        .planning_autopilot
        .bundles
        .iter()
        .filter(|bundle| bundle.apply_ready)
        .count();
    let outbound_approval_ready_count = outbound
        .outbound_autopilot
        .groups
        .iter()
        .filter(|group| group.state == "approval_ready")
        .count();
    let outbound_send_ready_count = outbound
        .outbound_autopilot
        .groups
        .iter()
        .filter(|group| group.state == "send_ready")
        .count();

    let readiness = status.status.state.clone();
    let autopilot_stale_profile_count = autopilot
        .autopilot
        .profiles
        .iter()
        .filter(|profile| profile.state == "stale" || profile.state == "idle")
        .count();
    let repair_hint = if readiness == "ready" {
        "".to_string()
    } else {
        "Run `personal-ops install check` and `personal-ops doctor` if the local daemon needs repair."
            .to_string()
    };

    Ok(DesktopSnapshot {
        readiness,
        now_next_summary: now_next.workflow.summary,
        awaiting_review_count,
        approval_pending_count: status.status.approval_queue.pending_count,
        autopilot_ready: autopilot.autopilot.readiness == "ready",
        autopilot_summary: autopilot
            .autopilot
            .top_item_summary
            .unwrap_or_else(|| "Autopilot is warming the workspace.".to_string()),
        autopilot_stale_profile_count,
        autopilot_last_success_at: autopilot.autopilot.last_success_at,
        review_ready_inbox_count,
        apply_ready_planning_count,
        outbound_approval_ready_count,
        outbound_send_ready_count,
        notification_cooldown_minutes: cooldown,
        daemon_available: true,
        repair_hint,
    })
}

#[tauri::command]
fn desktop_quit(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            create_console_session,
            get_desktop_snapshot,
            desktop_quit
        ])
        .run(tauri::generate_context!())
        .expect("error while running personal-ops desktop");
}
