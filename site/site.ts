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
  // mobile_number?: string | null;
  monitorType: string;
}

export interface UserSites {
  data: Site[];
}

export const SiteAddedTopic = new Topic<Site>("site.added", {
  deliveryGuarantee: "at-least-once",
});

export interface AddParams {
  url: string;
}

export const add = api(
  { expose: true, method: "POST", path: "/site", auth: true },
  async ({
    url,
    userID,
    email,
    interval,
    monitorType,
  }: AddParams & {
    userID: string;
    email: string;
    interval: number;
    monitorType: string;
    mobile_number?: string;
  }): Promise<Site> => {
    const existingWebsite = await prisma.site.findFirst({
      where: { url: url },
    });
    if (existingWebsite) {
      throw APIError.alreadyExists("URL already exists");
    }
    if (!userID) throw APIError.unauthenticated("User not authenticated");

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

    if (!site) throw new Error("site not found");
    return site;
  }
);

export const getAllSiteByUser = api(
  { expose: true, method: "GET", path: "/user-sites/:id", auth: true },
  async ({ id }: { id: string }): Promise<UserSites> => {
    const site = await prisma.site.findMany({
      where: { userId: id },
    });
    if (!site) throw new Error("site not found");
    return { data: site };
  }
);

export const del = api(
  { expose: true, method: "DELETE", path: "/site/:id" },
  async ({ id }: { id: string }): Promise<void> => {
    stopSiteCheck(id);

    await prisma.site.delete({
      where: { id },
    });
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
  async ({ id, interval }: { id: string; interval: number }): Promise<Site> => {
    const site = await prisma.site.update({
      where: { id },
      data: { interval },
    });
    stopSiteCheck(id);
    scheduleSiteCheck(site);

    return site;
  }
);
