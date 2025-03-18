import { api, APIError } from "encore.dev/api";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface IncidentLogsParams {
  incidentId: string;
}

interface IncidentLogsData {
  id: string;
  siteId: string;
  startTime: string;
  endTime: string | null;
  resolved: boolean;
  error?: string | null;
  details?: string | null;
  url: string;
  email: string;
  monitorType: string;
  interval: number;
  up: boolean;
}

interface IncidentLogsResponse {
  data: IncidentLogsData[];
}
export const getIncident = api<
  { incidentId: string },
  { data: { incident: IncidentLogsData; relatedIncidents: IncidentLogsData[] } }
>(
  {
    expose: true,
    path: "/incident/:incidentId",
    method: "GET",
    auth: true,
  },

  async ({ incidentId }) => {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: { site: true },
    });

    if (!incident) {
      throw APIError.notFound("Incident not found");
    }
    const relatedIncidents = await prisma.incident.findMany({
      where: { siteId: incident.siteId, NOT: { id: incidentId } },
      include: { site: true },
      orderBy: { startTime: "desc" },
    });
    const formattedData = {
      incident: {
        id: incident.id,
        siteId: incident.siteId,
        startTime: incident.startTime.toISOString(),
        endTime: incident.endTime ? incident.endTime.toISOString() : null,
        resolved: incident.resolved,
        error: incident.error,
        details: incident.details,
        url: incident.site.url,
        email: incident.site.email,
        monitorType: incident.site.monitorType,
        interval: incident.site.interval,
        up: incident.up,
      },
      relatedIncidents: relatedIncidents.map((inc) => ({
        id: inc.id,
        siteId: inc.siteId,
        startTime: inc.startTime.toISOString(),
        endTime: inc.endTime ? inc.endTime.toISOString() : null,
        resolved: inc.resolved,
        error: inc.error,
        details: inc.details,
        url: inc.site.url,
        email: inc.site.email,
        monitorType: inc.site.monitorType,
        interval: inc.site.interval,
        up: inc.up,
      })),
    };

    return { data: formattedData };
  }
);

interface Incident {
  id: string;
  siteId: string;
  startTime: string;
  endTime: string | null;
  resolved: boolean;
  error?: string | null;
  details?: string | null;
  url: string;
  email: string;
  monitorType: string;
  interval: number;
  up: boolean;
}

interface GetIncidentsByUserParams {
  userId: string;
}

interface GetIncidentsByUserResponse {
  data: Incident[];
}

export const getAllIncidentsByUser = api<
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
              email: true,
              monitorType: true,
              interval: true,
            },
          },
        },
        orderBy: {
          endTime: "desc",
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
        error: incident.error,
        details: incident.details,
        url: incident.site.url,
        email: incident.site.email,
        monitorType: incident.site.monitorType,
        interval: incident.site.interval,
        up: incident.up,
      }));

      return { data: formattedIncidents };
    } catch (err) {
      throw APIError.internal("Failed to fetch incidents", err as Error);
    }
  }
);
