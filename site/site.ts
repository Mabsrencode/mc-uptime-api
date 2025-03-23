import { api, APIError } from "encore.dev/api";
import { PrismaClient } from "@prisma/client";
import { Topic } from "encore.dev/pubsub";
import { scheduleSiteCheck, stopSiteCheck } from "../monitor/check";

const prisma = new PrismaClient();

export interface Site {
  id: string;
  url: string;
  email: string;
  interval: number;
  monitorType: string;
  userId: string;
}

export interface UserSites {
  data: Site[];
}

export const SiteAddedTopic = new Topic<Site>("site.added", {
  deliveryGuarantee: "at-least-once",
});

export interface AddParams {
  url: string;
  userID: string;
  email: string;
  interval: number;
  monitorType: string;
  mobile_number?: string;
}

export const add = api(
  { expose: true, method: "POST", path: "/site", auth: true },
  async ({
    url,
    userID,
    email,
    interval,
    monitorType,
  }: AddParams): Promise<Site> => {
    if (!url || !email || !interval || !monitorType) {
      throw APIError.invalidArgument("All fields are required");
    }
    if (!userID) throw APIError.unauthenticated("User not authenticated");

    if (interval < 1) {
      throw APIError.invalidArgument("Interval must be at least 1 minute");
    }
    const existingWebsite = await prisma.site.findFirst({
      where: { url },
    });
    if (existingWebsite) {
      throw APIError.alreadyExists("URL already exists");
    }
    const site = await prisma.site.create({
      data: {
        url,
        userId: userID,
        email,
        monitorType,
        interval,
      },
    });

    await SiteAddedTopic.publish(site);
    scheduleSiteCheck(site);

    return site;
  }
);

export const get = api(
  { expose: true, method: "GET", path: "/site/:id", auth: false },
  async ({ id }: { id: string }): Promise<Site> => {
    const site = await prisma.site.findUnique({
      where: { id },
    });

    if (!site) {
      throw APIError.notFound("Site not found");
    }
    return site;
  }
);

export const getAllSiteByUser = api(
  { expose: true, method: "GET", path: "/user-sites/:id", auth: true },
  async ({
    id,
    search,
    type,
    status,
  }: {
    id: string;
    search?: string | null;
    type?: string | null;
    status?: "up" | "down" | null;
  }): Promise<UserSites> => {
    const latestChecks = await prisma.check.groupBy({
      by: ["siteId"],
      _max: {
        checkedAt: true,
      },
    });

    const siteIdsWithLatestChecks = latestChecks.map((check) => check.siteId);
    const sites = await prisma.site.findMany({
      where: {
        userId: id,
        ...(search ? { url: { contains: search, mode: "insensitive" } } : {}),
        ...(type ? { monitorType: type } : {}),
        ...(status
          ? {
              checks: {
                some: {
                  siteId: { in: siteIdsWithLatestChecks },
                  up: status === "up" ? true : false,
                  checkedAt: {
                    in: latestChecks
                      .map((check) => check._max.checkedAt)
                      .filter((date): date is Date => date !== null),
                  },
                },
              },
            }
          : {}),
      },
      include: {
        checks: {
          select: { up: true },
          orderBy: { checkedAt: "desc" },
          take: 1,
        },
        incident: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
            resolved: true,
            error: true,
            details: true,
            up: true,
          },
        },
      },
    });

    return { data: sites };
  }
);

export const del = api(
  { expose: true, method: "DELETE", path: "/site/:id" },
  async ({ id }: { id: string }): Promise<void> => {
    const site = await prisma.site.findUnique({ where: { id } });
    if (!site) {
      throw APIError.notFound("Site not found");
    }

    stopSiteCheck(id);
    await prisma.site.delete({ where: { id } });
  }
);

export const bulkDelete = api(
  {
    expose: true,
    method: "DELETE",
    path: "/site/bulk-delete",
  },
  async ({ ids }: { ids: string | string[] }): Promise<void> => {
    if (!ids) {
      throw APIError.invalidArgument("ids must be provided");
    }

    const idsArray = Array.isArray(ids) ? ids : ids.split(",");

    const sites = await prisma.site.findMany({
      where: { id: { in: idsArray } },
    });
    if (sites.length !== idsArray.length) {
      throw APIError.notFound("One or more sites not found");
    }

    for (const id of idsArray) {
      stopSiteCheck(id);
      await prisma.site.delete({ where: { id } });
    }
  }
);

export interface ListResponse {
  sites: Site[];
}

export const list = api(
  { expose: true, method: "GET", path: "/site" },
  async (): Promise<ListResponse> => {
    const sites = await prisma.site.findMany();
    return { sites };
  }
);

export const update = api(
  { expose: true, method: "PUT", path: "/site/:id" },
  async ({
    id,
    interval,
    url,
    monitorType,
  }: {
    id: string;
    interval: number;
    url: string;
    monitorType: string;
  }): Promise<Site> => {
    const site = await prisma.site.findUnique({ where: { id } });
    if (!site) {
      throw APIError.notFound("Site not found");
    }

    const updatedSite = await prisma.site.update({
      where: { id },
      data: { interval, url, monitorType },
    });

    stopSiteCheck(id);
    scheduleSiteCheck(updatedSite);

    return updatedSite;
  }
);
