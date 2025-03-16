import { api, APIError } from "encore.dev/api";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface IncidentLogsParams {
  siteId: string;
}

interface IncidentLogsData {
  id: string;
  siteId: string;
  startTime: string;
  endTime: string | null;
  resolved: boolean;
  error?: string | null;
  details?: string | null;
}

interface IncidentLogsResponse {
  data: IncidentLogsData[];
}
export const incidentLog = api<IncidentLogsParams, IncidentLogsResponse>(
  {
    expose: true,
    path: "/report-log/:siteId",
    method: "GET",
    auth: false,
  },

  async ({ siteId }) => {
    const incidents = await prisma.incident.findMany({
      where: { siteId: siteId },
      include: { site: true },
    });
    console.log(incidents);
    if (!incidents) {
      throw APIError.notFound("Incident not found");
    }

    const data = incidents.map((incident) => ({
      id: incident.id,
      siteId: incident.siteId,
      startTime: incident.startTime.toISOString(),
      endTime: incident.endTime ? incident.endTime.toISOString() : null,
      resolved: incident.resolved,
      error: incident.error,
      details: incident.details,
    }));

    return { data: data };
  }
);

interface Incident {
  id: string;
  siteId: string;
  startTime: string;
  endTime: string | null;
  resolved: boolean;
  error?: string;
  details?: string;
  site: {
    id: string;
    url: string;
  };
}

interface GetIncidentsByUserParams {
  userId: string;
}

interface GetIncidentsByUserResponse {
  incidents: Incident[];
}

export const getIncidentsByUser = api<
  GetIncidentsByUserParams,
  GetIncidentsByUserResponse
>(
  { expose: true, method: "GET", path: "/incidents/:userId", auth: true },
  async ({ userId }) => {
    try {
      const incidents = await prisma.incident.findMany({
        where: {
          site: {
            userId: userId,
          },
        },
        include: {
          site: {
            select: {
              id: true,
              url: true,
            },
          },
        },
        orderBy: {
          startTime: "desc",
        },
      });

      if (!incidents || incidents.length === 0) {
        throw APIError.notFound("No incidents found for this user");
      }

      const formattedIncidents: Incident[] = incidents.map((incident) => ({
        id: incident.id,
        siteId: incident.siteId,
        startTime: incident.startTime.toISOString(),
        endTime: incident.endTime ? incident.endTime.toISOString() : null,
        resolved: incident.resolved,
        error: incident.error || undefined,
        details: incident.details || undefined,
        site: {
          id: incident.site.id,
          url: incident.site.url,
        },
      }));

      return { incidents: formattedIncidents };
    } catch (err) {
      throw APIError.internal("Failed to fetch incidents", err as Error);
    }
  }
);
