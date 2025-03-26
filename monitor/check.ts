import { api } from "encore.dev/api";
import { Subscription, Topic } from "encore.dev/pubsub";
import { Site, SiteAddedTopic } from "../site/site";
import { ping } from "./ping";
import { site } from "~encore/clients";
import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { sendEmail } from "../utils/email";
import logger from "../utils/loggers";

const prisma = new PrismaClient();
const cronJobs = new Map<string, cron.ScheduledTask>();

export function scheduleSiteCheck(site: Site) {
  const cronExpression = getCronExpression(site.interval);

  const job = cron.schedule(cronExpression, async () => {
    console.log(`Running check for site: ${site.url}`);
    logger.info(`Running check for site: ${site.url}`);
    try {
      await check({ siteID: site.id });
    } catch (error) {
      console.error(`Error checking site ${site.url}:`, error);
      logger.error(`Error checking site ${site.url}:`, error);
    }
  });

  cronJobs.set(site.id, job);
}

export function stopSiteCheck(siteId: string) {
  const job = cronJobs.get(siteId);
  if (job) {
    job.stop();
    cronJobs.delete(siteId);
  }
}

export async function initializeCronJobs() {
  const sites = await prisma.site.findMany();
  sites.forEach(scheduleSiteCheck);
}

initializeCronJobs().catch((err) => {
  console.error("Failed to initialize cron jobs:", err);
});

export const check = api(
  { expose: true, method: "POST", path: "/check/:siteID" },
  async (p: { siteID: string }): Promise<{ up: boolean }> => {
    const site = await prisma.site.findUnique({ where: { id: p.siteID } });
    if (!site) throw new Error("Site not found");
    return doCheck(site);
  }
);

export const checkAll = api(
  { expose: true, method: "POST", path: "/check-all" },
  async (): Promise<void> => {
    const sites = await site.list();
    await Promise.all(sites.sites.map(doCheck));
  }
);

function getCronExpression(interval: number): string {
  if (interval < 1) {
    throw new Error("Interval must be at least 1 minute");
  }
  return `*/${interval} * * * *`;
}

async function doCheck(site: Site): Promise<{
  up: boolean;
  error?: string;
  details?: string;
  average_response?: number;
  max_response?: number;
  min_response?: number;
}> {
  let up = false;
  let error: string | undefined;
  let details: string | undefined;
  let average_response: number | undefined;
  let max_response: number | undefined;
  let min_response: number | undefined;
  try {
    const pingResponse = await ping({ url: site.url });
    up = pingResponse.up;
    error = pingResponse.error;
    details = pingResponse.details;
    average_response = pingResponse.averageResponseTimeMs;
    max_response = pingResponse.maxResponseTimeMs;
    min_response = pingResponse.minResponseTimeMs;
  } catch (err) {
    up = false;
    error = err instanceof Error ? err.message : String(err);
    details = err instanceof Error ? err.message : String(err);
  }

  const existingSite = await prisma.site.findUnique({
    where: { id: site.id },
  });
  if (!existingSite) {
    console.error(`Site not found: ${site.id}`);
    logger.error(`Site not found: ${site.id}`);
    return { up: false, error: "Site not found", details: "Site not found" };
  }

  const wasUp = await getPreviousMeasurement(site.id);

  if (up !== wasUp) {
    await TransitionTopic.publish({ site, up });

    if (!up) {
      try {
        const incident = await prisma.incident.create({
          data: {
            siteId: site.id,
            startTime: new Date(),
            resolved: false,
            error: error,
            details: details,
            up: up,
          },
        });
        await sendEmailNotification(site, incident.id, "DOWN", error, details);
      } catch (err) {
        console.error(`Failed to create incident for site ${site.url}:`, err);
        logger.error(`Failed to create incident for site ${site.url}:`, err);
      }
    } else {
      const latestIncident = await prisma.incident.findFirst({
        where: { siteId: site.id, resolved: false },
        orderBy: { startTime: "desc" },
      });

      if (latestIncident) {
        await prisma.incident.update({
          where: { id: latestIncident.id },
          data: { resolved: true, endTime: new Date(), up: true },
        });
        await sendEmailNotification(site, latestIncident.id, "UP");
      }
    }
  }

  try {
    await prisma.check.create({
      data: {
        siteId: site.id,
        up,
        checkedAt: new Date(),
        error: error,
        details: details,
        average_response: average_response,
        max_response: max_response,
        min_response: min_response,
      },
    });
  } catch (err) {
    console.error(`Failed to create check for site ${site.url}:`, err);
    logger.error(`Failed to create check for site ${site.url}:`, err);
  }

  return { up, error, details, average_response, max_response, min_response };
}

async function sendEmailNotification(
  site: Site,
  incidentId: string,
  type: "DOWN" | "UP",
  error?: string,
  details?: string
) {
  const lastNotification = await prisma.notification.findFirst({
    where: { siteId: site.id, type },
    orderBy: { sentAt: "desc" },
  });

  const throttleDuration = 30 * 60 * 1000;
  if (
    !lastNotification ||
    Date.now() - lastNotification.sentAt.getTime() > throttleDuration
  ) {
    const subject = type === "DOWN" ? "Site is down" : "Site is back up";
    const text = `Your site ${site.url} is ${type === "DOWN" ? "down" : "up"} ${
      error ? `Root Cause: ${error}` : ""
    } ${details ? `${details}` : ""}.`;

    await sendEmail(site.email, subject, text);

    await prisma.notification.create({
      data: {
        siteId: site.id,
        incidentId,
        type,
        sentAt: new Date(),
      },
    });
  }
}
interface TestEmail {
  url: string;
  email: string;
  type: "DOWN" | "UP";
  error?: string;
  details?: string;
}
interface TestEmailResponse {
  message: string;
}
export const testNotification = api(
  { method: "POST", path: "/test-notification" },
  async (test: TestEmail): Promise<TestEmailResponse> => {
    const subject = test.type === "DOWN" ? "Site is down" : "Site is back up";
    const text = `Your site ${test.url} is ${
      test.type === "DOWN" ? "down" : "up"
    } ${test.error ? `Root Cause: ${test.error}` : "Test Only."} ${
      test.details ? `${test.details}` : "Test Only"
    }.`;
    try {
      await sendEmail(test.email, subject, text);
      return { message: "Test Notification Sent Successfully" };
    } catch (error) {
      return { message: `Failed to send test notification: ${error}` };
    }
  }
);

async function getPreviousMeasurement(siteID: string): Promise<boolean> {
  const lastCheck = await prisma.check.findFirst({
    where: { siteId: siteID },
    orderBy: { checkedAt: "desc" },
  });

  return lastCheck?.up ?? true;
}

export interface TransitionEvent {
  site: Site;
  up: boolean;
}

export const TransitionTopic = new Topic<TransitionEvent>("uptime-transition", {
  deliveryGuarantee: "at-least-once",
});

const _ = new Subscription(SiteAddedTopic, "check-site", {
  handler: doCheck,
});
