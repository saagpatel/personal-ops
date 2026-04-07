import { invoke } from "@tauri-apps/api/core";
import { defaultWindowIcon } from "@tauri-apps/api/app";
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { TrayIcon } from "@tauri-apps/api/tray";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import {
  computeDesktopNotificationUpdate,
  initialDesktopNotificationState,
} from "../../app/src/desktop-notification-policy.ts";

const state = {
  tray: null,
  menuItems: null,
  lastSnapshot: null,
  notificationState: initialDesktopNotificationState(),
};

const frame = document.querySelector("#console-frame");
const blockedState = document.querySelector("#blocked-state");
const blockedCopy = document.querySelector("#blocked-copy");
const summary = document.querySelector("#summary");
const readiness = document.querySelector("#readiness");
const nowNext = document.querySelector("#now-next");
const awaitingReview = document.querySelector("#awaiting-review");
const pendingApprovals = document.querySelector("#pending-approvals");
const repairHint = document.querySelector("#repair-hint");
const refreshSessionButton = document.querySelector("#refresh-session");
const focusConsoleButton = document.querySelector("#focus-console");

if (
  !frame ||
  !blockedState ||
  !blockedCopy ||
  !summary ||
  !readiness ||
  !nowNext ||
  !awaitingReview ||
  !pendingApprovals ||
  !repairHint ||
  !refreshSessionButton ||
  !focusConsoleButton
) {
  throw new Error("Desktop shell did not render correctly.");
}

function setBlockedState(blocked, message) {
  blockedState.classList.toggle("blocked-state--hidden", !blocked);
  blockedCopy.textContent =
    message ??
    "Run personal-ops install check and personal-ops doctor if the daemon is not ready yet.";
}

function updateStatus(snapshot) {
  state.lastSnapshot = snapshot;
  readiness.textContent = snapshot.readiness;
  nowNext.textContent = snapshot.now_next_summary || "Nothing urgent right now.";
  awaitingReview.textContent = String(snapshot.awaiting_review_count ?? 0);
  pendingApprovals.textContent = String(snapshot.approval_pending_count ?? 0);
  summary.textContent = snapshot.daemon_available
    ? snapshot.autopilot_summary || "The native shell is connected to the local operator workspace."
    : "The daemon is unavailable right now, so the shell is waiting on local repair.";
  repairHint.textContent = snapshot.repair_hint || "";
  setBlockedState(!snapshot.daemon_available, snapshot.repair_hint);
  updateTrayText(snapshot);
  maybeSendNotifications(snapshot);
}

async function ensureNotificationPermission() {
  let permissionGranted = await isPermissionGranted();
  if (!permissionGranted) {
    const permission = await requestPermission();
    permissionGranted = permission === "granted";
  }
  return permissionGranted;
}

async function maybeSendNotifications(snapshot) {
  const update = computeDesktopNotificationUpdate(state.notificationState, snapshot);
  const granted = await ensureNotificationPermission();
  if (!granted) {
    state.notificationState = update.state;
    return;
  }

  for (const notification of update.notifications) {
    await sendNotification({
      title: notification.title,
      body: notification.body,
    });
  }

  state.notificationState = update.state;
}

async function createTrayMenuItems() {
  const readinessItem = await MenuItem.new({
    id: "readiness",
    text: "Readiness: loading…",
    enabled: false,
  });
  const nowNextItem = await MenuItem.new({
    id: "now-next",
    text: "Now next: checking…",
    enabled: false,
  });
  const openItem = await MenuItem.new({
    id: "open",
    text: "Open / Focus Window",
    action: () => focusWindow(),
  });
  const refreshItem = await MenuItem.new({
    id: "refresh-session",
    text: "Refresh Session",
    action: () => refreshSession(),
  });
  const quitItem = await MenuItem.new({
    id: "quit",
    text: "Quit Personal Ops",
    action: () => invoke("desktop_quit"),
  });
  return { readinessItem, nowNextItem, openItem, refreshItem, quitItem };
}

async function ensureTray() {
  if (state.tray) {
    return;
  }
  state.menuItems = await createTrayMenuItems();
  const menu = await Menu.new({
    items: [
      state.menuItems.readinessItem,
      state.menuItems.nowNextItem,
      await PredefinedMenuItem.new({ item: "Separator" }),
      state.menuItems.openItem,
      state.menuItems.refreshItem,
      await PredefinedMenuItem.new({ item: "Separator" }),
      state.menuItems.quitItem,
    ],
  });
  state.tray = await TrayIcon.new({
    icon: await defaultWindowIcon(),
    menu,
    menuOnLeftClick: true,
    tooltip: "Personal Ops",
    action: (event) => {
      if (event.type === "Click" && event.button === "Left" && event.buttonState === "Up") {
        focusWindow();
      }
    },
  });
}

async function updateTrayText(snapshot) {
  await ensureTray();
  if (!state.menuItems) {
    return;
  }
  await state.menuItems.readinessItem.setText(`Readiness: ${snapshot.readiness}`);
  const compactNowNext =
    ((snapshot.autopilot_stale_profile_count ?? 0) > 0
      ? `Autopilot stale: ${snapshot.autopilot_stale_profile_count}`
      : snapshot.now_next_summary || "Nothing urgent right now.")
      .replace(/\s+/g, " ")
      .slice(0, 72);
  await state.menuItems.nowNextItem.setText(`Now next: ${compactNowNext}`);
  if (state.tray) {
    await state.tray.setTooltip(
      snapshot.daemon_available
        ? `Personal Ops • ${snapshot.readiness}`
        : "Personal Ops • daemon unavailable",
    );
  }
}

async function focusWindow() {
  const window = getCurrentWebviewWindow();
  await window.unminimize();
  await window.show();
  await window.setFocus();
}

async function refreshSession() {
  try {
    setBlockedState(false);
    summary.textContent = "Refreshing the local console session…";
    const session = await invoke("create_console_session");
    frame.src = session.launch_url;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setBlockedState(true, message);
    summary.textContent = "Desktop shell could not mint a fresh console session yet.";
  }
}

async function pollSnapshot() {
  try {
    const snapshot = await invoke("get_desktop_snapshot");
    updateStatus(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateStatus({
      readiness: "degraded",
      now_next_summary: "Repair the local daemon before continuing.",
      awaiting_review_count: 0,
      approval_pending_count: 0,
      autopilot_ready: false,
      autopilot_summary: "Autopilot is unavailable until the daemon is healthy.",
      autopilot_stale_profile_count: 0,
      autopilot_last_success_at: null,
      review_ready_inbox_count: 0,
      apply_ready_planning_count: 0,
      outbound_approval_ready_count: 0,
      outbound_send_ready_count: 0,
      notification_cooldown_minutes: 30,
      daemon_available: false,
      repair_hint: message,
    });
  }
}

window.addEventListener("message", (event) => {
  if (event.data?.type === "personal-ops-console-locked") {
    refreshSession();
  }
});

refreshSessionButton.addEventListener("click", () => {
  refreshSession();
});

focusConsoleButton.addEventListener("click", () => {
  focusWindow();
});

await ensureTray();
await pollSnapshot();
await refreshSession();
setInterval(() => {
  pollSnapshot();
}, 30_000);
