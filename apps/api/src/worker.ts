import "dotenv/config";
import { DateTime } from "luxon";
import { db, atomic, audit } from "./infra/database";
import { PrismaDashboardRepository } from "./finance/service";
import { goalProgress } from "@settleup/domain";
export interface NotificationProvider {
  send(token: string, message: string): Promise<void>;
}
export class ExpoNotificationProvider implements NotificationProvider {
  async send(token: string, message: string) {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to: token,
        title: "A little budget check-in",
        body: message,
        sound: "default",
      }),
      signal: AbortSignal.timeout(10000),
    });
    const result = (await response.json()) as { data?: { status: string } };
    if (!response.ok || result.data?.status !== "ok")
      throw new Error("Push delivery rejected.");
  }
}
export async function cleanup(now = new Date()) {
  await atomic(async (tx) => {
    await tx.paymentLink.deleteMany({ where: { expiresAt: { lte: now } } });
    await tx.smsImportRecord.deleteMany({ where: { expiresAt: { lte: now } } });
    await tx.otpChallenge.deleteMany({
      where: { expiresAt: { lt: new Date(+now - 86400000) } },
    });
    await tx.deviceSession.deleteMany({
      where: { expiresAt: { lt: new Date(+now - 30 * 86400000) } },
    });
    const expired = await tx.sharedAnalyticsLink.findMany({
      where: { expiresAt: { lte: now }, revokedAt: null },
      take: 100,
    });
    for (const link of expired) {
      await tx.sharedAnalyticsLink.update({
        where: { id: link.id },
        data: { revokedAt: now },
      });
      await audit(tx, link.ownerId, link.id, "SHARED_LINK_EXPIRED");
    }
    await tx.sharedLinkAccessEvent.deleteMany({
      where: { createdAt: { lt: new Date(+now - 90 * 86400000) } },
    });
    await tx.auditEvent.deleteMany({
      where: {
        action: "ACCOUNT_DELETED",
        createdAt: { lt: new Date(+now - 365 * 86400000) },
      },
    });
  });
}
export async function processGoals() {
  const users = await db.user.findMany({
    where: { deletedAt: null, notifications: { goals: true } },
    select: { id: true },
    take: 1000,
  });
  for (const user of users) {
    const data = await new PrismaDashboardRepository().get(user.id);
    for (const goal of data.goals) {
      const progress = goalProgress(
        goal.amountMinor,
        goal.spentMinor,
        goal.start,
        goal.end,
      );
      for (const threshold of goal.thresholds.filter(
        (t) => t <= progress.percentage,
      )) {
        const key = `${goal.id}:${goal.start}:${threshold}`;
        await db.notificationJob.upsert({
          where: { key },
          create: {
            userId: user.id,
            key,
            message: `${goal.name}: ${threshold}% of your budget has been used.`,
          },
          update: {},
        });
      }
    }
  }
  // Roll recurring goals forward in the user's zone; custom/one-off periods stay immutable.
  const expired = await db.goal.findMany({
    where: {
      end: { lte: new Date() },
      period: { in: ["DAY", "WEEK", "MONTH", "YEAR"] },
    },
    include: { owner: { include: { profile: true } } },
    take: 1000,
  });
  for (const goal of expired) {
    const units = {
      DAY: { days: 1 },
      WEEK: { weeks: 1 },
      MONTH: { months: 1 },
      YEAR: { years: 1 },
    }[goal.period as "DAY"];
    let start = DateTime.fromJSDate(goal.end, {
      zone: goal.owner.profile?.timezone ?? "Asia/Kolkata",
    });
    let end = start.plus(units);
    while (end.toMillis() <= Date.now()) {
      start = end;
      end = start.plus(units);
    }
    await db.goal.updateMany({
      where: { id: goal.id, end: goal.end },
      data: {
        start: start.toJSDate(),
        end: end.toJSDate(),
        notifiedThresholds: [],
      },
    });
  }
}
export async function deliverNotifications(provider: NotificationProvider) {
  const jobs = await db.notificationJob.findMany({
    where: { deliveredAt: null, attempts: { lt: 5 } },
    take: 100,
  });
  for (const job of jobs) {
    const pref = await db.notificationPreference.findUnique({
      where: { userId: job.userId },
    });
    if (!pref?.goals || !pref.pushToken) continue;
    await db.notificationJob.update({
      where: { id: job.id },
      data: { attempts: { increment: 1 } },
    });
    try {
      await provider.send(pref.pushToken, job.message);
      await db.notificationJob.update({
        where: { id: job.id },
        data: { deliveredAt: new Date() },
      });
    } catch {
      /* Retry on next pass; never log push tokens or notification content. */
    }
  }
}
if (process.env.NODE_ENV !== "test") {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await cleanup();
      await processGoals();
      await deliverNotifications(new ExpoNotificationProvider());
    } catch (e) {
      console.error(
        JSON.stringify({
          event: "worker_failed",
          errorType: e instanceof Error ? e.name : "unknown",
        }),
      );
    } finally {
      running = false;
    }
  };
  await tick();
  const timer = setInterval(tick, 60000);
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, async () => {
      clearInterval(timer);
      await db.$disconnect();
      process.exit(0);
    });
}
