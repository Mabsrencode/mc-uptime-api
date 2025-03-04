import { api, APIError, Gateway } from "encore.dev/api";
import { PrismaClient } from "@prisma/client";
import { Topic } from "encore.dev/pubsub";

const prisma = new PrismaClient();

export interface Site {
  id: string;
  url: string;
}

export const SiteAddedTopic = new Topic<Site>("site.added", {
  deliveryGuarantee: "at-least-once",
});

export interface AddParams {
  url: string;
}

export const add = api(
  { expose: true, method: "POST", path: "/site", auth: true },
  async ({ url, userID }: AddParams & { userID: string }): Promise<Site> => {
    if (!userID) throw APIError.unauthenticated("User not authenticated");
    const existingWebsite = await prisma.site.findMany({
      where: { url: url },
    });
    if (existingWebsite) {
      throw APIError.alreadyExists("URL already exists");
    }

    const site = await prisma.site.create({
      data: {
        url,
        userId: userID,
      },
    });

    await SiteAddedTopic.publish(site);
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

export const del = api(
  { expose: true, method: "DELETE", path: "/site/:id" },
  async ({ id }: { id: string }): Promise<void> => {
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
