import { api } from "encore.dev/api";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface SiteStatus {
  id: string;
  up: boolean;
  checkedAt: string;
}

interface StatusResponse {
  sites: SiteStatus[];
}

export const status = api(
  { expose: true, path: "/status", method: "GET", auth: true },
  async (): Promise<StatusResponse> => {
    const latestChecks = await prisma.check.findMany({
      distinct: ["siteId"],
      orderBy: [{ siteId: "asc" }, { checkedAt: "desc" }],
      select: {
        siteId: true,
        up: true,
        checkedAt: true,
      },
    });

    const results: SiteStatus[] = latestChecks.map((row) => ({
      id: row.siteId,
      up: row.up,
      checkedAt: row.checkedAt.toISOString(),
    }));

    return { sites: results };
  }
);
