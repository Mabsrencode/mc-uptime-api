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

async function doCheck(site: Site): Promise<{ up: boolean }> {
  const { up, error } = await ping({ url: site.url });
  console.log(up);
  const wasUp = await getPreviousMeasurement(site.id);
  if (up !== wasUp) {
    await TransitionTopic.publish({ site, up });
    const subject = up ? "Site is back up" : "Site is down";
    const text = `Your site ${site.url} is ${up ? "up" : "down"}. ${
      error ? `Reason: ${error}` : ""
    }`;
    await sendEmail(site.email, subject, text);
  }

  await prisma.check.create({
    data: {
      siteId: site.id,
      up,
      checkedAt: new Date(),
      error: !up ? error : null,
    },
  });

  return { up };
}

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
