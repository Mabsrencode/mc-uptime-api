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

interface GetIncidentsByUserParams {
  userId: string;
  search?: string | null;
  type?: string | null;
  status?: "up" | "down" | null;
}
interface NotificationsData {
  sentAt: string;
  type: string;
}
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
  notifications: NotificationsData[] | null;
}

interface GetIncidentsByUserResponse {
  data: Incident[];
}

export const getAllIncidentsByUser = api<
  GetIncidentsByUserParams,
  GetIncidentsByUserResponse
>(
  { expose: true, method: "GET", path: "/incidents/:userId", auth: false },
  async ({
    userId,
    search,
    type,
    status,
  }: {
    userId: string;
    search?: string | null;
    type?: string | null;
    status?: "up" | "down" | null;
  }) => {
    const latestChecks = await prisma.check.groupBy({
      by: ["siteId"],
      _max: {
        checkedAt: true,
      },
    });

    const siteIdsWithLatestChecks = latestChecks.map((check) => check.siteId);
    const incidents = await prisma.incident.findMany({
      where: {
        site: {
          userId: userId,
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
        notification: {
          select: {
            sentAt: true,
            type: true,
          },
        },
      },
      orderBy: {
        endTime: "desc",
      },
    });
    if (!incidents || incidents.length === 0) {
      return { data: [] };
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
      notifications: incident.notification.map((notification) => ({
        sentAt: notification.sentAt.toISOString(),
        type: notification.type,
      })),
    }));

    return { data: formattedIncidents };
  }
);
