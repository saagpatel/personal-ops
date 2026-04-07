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
      review_package_inbox_count: 1,
      review_package_meetings_count: 1,
      review_package_planning_count: 0,
      review_package_outbound_count: 0,
      open_tuning_proposal_count: 1,
      review_notification_cooldown_minutes: {
        inbox: 30,
        meetings: 10,
        planning: 30,
        outbound: 30,
      },
      notification_cooldown_minutes: 30,
    },
    new Date("2026-04-06T10:00:00.000Z"),
  );

  assert.deepEqual(
    first.notifications.map((notification) => notification.kind),
    ["review_package_inbox", "review_package_meetings", "review_tuning_proposal"],
  );

  const cooled = computeDesktopNotificationUpdate(
    first.state,
    {
      readiness: "ready",
      review_package_inbox_count: 2,
      review_package_meetings_count: 2,
      review_package_planning_count: 0,
      review_package_outbound_count: 0,
      open_tuning_proposal_count: 2,
      review_notification_cooldown_minutes: {
        inbox: 30,
        meetings: 10,
        planning: 30,
        outbound: 30,
      },
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
      review_package_inbox_count: 3,
      review_package_meetings_count: 3,
      review_package_planning_count: 0,
      review_package_outbound_count: 0,
      open_tuning_proposal_count: 2,
      review_notification_cooldown_minutes: {
        inbox: 30,
        meetings: 10,
        planning: 30,
        outbound: 30,
      },
      notification_cooldown_minutes: 30,
    },
    new Date("2026-04-06T10:31:00.000Z"),
  );

  assert.deepEqual(
    afterCooldown.notifications.map((notification) => notification.kind),
    ["readiness_degraded", "review_package_inbox", "review_package_meetings"],
  );
});
