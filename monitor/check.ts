import { api } from "encore.dev/api";
import { Subscription, Topic } from "encore.dev/pubsub";
import { Site, SiteAddedTopic } from "../site/site";
import { ping } from "./ping";
import { site } from "~encore/clients";
import { CronJob } from "encore.dev/cron";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const check = api(
  { expose: true, method: "POST", path: "/check/:siteID" },
  async (p: { siteID: string }): Promise<{ up: boolean }> => {
    const s = await site.get({ id: p.siteID });
    return doCheck(s);
  }
);

export const checkAll = api(
  { expose: true, method: "POST", path: "/check-all" },
  async (): Promise<void> => {
    const sites = await site.list();
    await Promise.all(sites.sites.map(doCheck));
  }
);

const cronJob = new CronJob("check-all", {
  title: "Check all sites",
  every: "1h",
  endpoint: checkAll,
});

async function doCheck(site: Site): Promise<{ up: boolean }> {
  const { up } = await ping({ url: site.url });

  const wasUp = await getPreviousMeasurement(site.id);
  if (up !== wasUp) {
    await TransitionTopic.publish({ site, up });
  }

  await prisma.check.create({
    data: {
      siteId: site.id,
      up,
      checkedAt: new Date(),
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
