import { api, APIError } from "encore.dev/api";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface IncidentParams {
  id: string;
}

interface IncidentResponse {
  id: string;
  up: boolean;
  checkedAt: string;
  error: string | null;
  details: string | null;
  siteId: string;
  url: string;
  monitorType: string;
  interval: number;
  email: string;
}

export const incident = api<IncidentParams, IncidentResponse>(
  { expose: true, path: "/report/:id", method: "GET", auth: false },
  async ({ id }) => {
    const incident = await prisma.check.findUnique({
      where: { id: id },
      include: { site: true },
    });
    if (!incident) {
      throw APIError.notFound("Incident not found");
    }

    const data = {
      id: incident.id,
      up: incident.up,
      checkedAt: incident.checkedAt.toISOString(),
      error: incident.error,
      details: incident.details,
      siteId: incident.site.id,
      url: incident.site.url,
      monitorType: incident.site.monitorType,
      interval: incident.site.interval,
      email: incident.site.email,
    };
    if (!data) {
      throw APIError.notFound("Incident not found");
    }

    return data;
  }
);

interface IncidentLogsParams {
  siteId: string;
}

interface IncidentLogsData {
  id: string;
  siteId: string;
  startTime: string;
  endTime: string | null;
  resolved: boolean;
}

interface IncidentLogsResponse {
  data: IncidentLogsData[];
}
export const incidentLogs = api<IncidentLogsParams, IncidentLogsResponse>(
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
    }));

    return { data: data };
  }
);
