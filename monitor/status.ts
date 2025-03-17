import { api } from "encore.dev/api";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface SiteStatus {
  id: string;
  up: boolean;
  checkedAt: string;
  incidentId: string;
  error: string | null;
  details: string | null;
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
        id: true,
        details: true,
        error: true,
      },
    });

    const results: SiteStatus[] = latestChecks.map((row) => ({
      id: row.siteId,
      up: row.up,
      incidentId: row.id,
      checkedAt: row.checkedAt.toISOString(),
      error: row.error,
      details: row.details,
    }));

    return { sites: results };
  }
);
