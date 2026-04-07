import assert from "node:assert/strict";
import test from "node:test";
import {
  computeDesktopNotificationUpdate,
  initialDesktopNotificationState,
} from "../src/desktop-notification-policy.js";

test("desktop notifications use exact assistant-led signals and respect cooldowns", () => {
  const initial = initialDesktopNotificationState();
  const first = computeDesktopNotificationUpdate(
    initial,
    {
      readiness: "ready",
      review_ready_inbox_count: 1,
      apply_ready_planning_count: 1,
      outbound_approval_ready_count: 1,
      outbound_send_ready_count: 0,
      notification_cooldown_minutes: 30,
    },
    new Date("2026-04-06T10:00:00.000Z"),
  );

  assert.deepEqual(
    first.notifications.map((notification) => notification.kind),
    ["review_ready_inbox", "apply_ready_planning", "outbound_ready"],
  );

  const cooled = computeDesktopNotificationUpdate(
    first.state,
    {
      readiness: "ready",
      review_ready_inbox_count: 2,
      apply_ready_planning_count: 2,
      outbound_approval_ready_count: 2,
      outbound_send_ready_count: 1,
      notification_cooldown_minutes: 30,
    },
    new Date("2026-04-06T10:05:00.000Z"),
  );

  assert.equal(cooled.notifications.length, 0);

  const afterCooldown = computeDesktopNotificationUpdate(
    cooled.state,
    {
      readiness: "degraded",
      repair_hint: "Run personal-ops doctor.",
      review_ready_inbox_count: 3,
      apply_ready_planning_count: 2,
      outbound_approval_ready_count: 2,
      outbound_send_ready_count: 1,
      notification_cooldown_minutes: 30,
    },
    new Date("2026-04-06T10:31:00.000Z"),
  );

  assert.deepEqual(
    afterCooldown.notifications.map((notification) => notification.kind),
    ["readiness_degraded", "review_ready_inbox"],
  );
});
