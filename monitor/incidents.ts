import { api, APIError } from "encore.dev/api";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface IncidentParams {
  id: string;
  siteId: string;
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
  { expose: true, path: "/report/:id/:siteId", method: "GET", auth: true },
  async ({ id, siteId }) => {
    const incident = await prisma.check.findUnique({
      where: { id: id },
      // include: { site: true },
    });
    if (!incident) {
      throw APIError.notFound("Incident not found");
    }
    const incidentData = {
      id: incident.id,
      up: incident.up,
      checkedAt: incident.checkedAt.toISOString(),
      error: incident.error,
      details: incident.details,
    };
    const site = await prisma.site.findUnique({
      where: { id: siteId },
    });
    if (!site) {
      throw APIError.notFound("Site not found");
    }
    const siteData = {
      siteId: site.id,
      url: site.url,
      monitorType: site.monitorType,
      interval: site.interval,
      email: site.email,
    };
    const data = { ...incidentData, ...siteData };
    if (!data) {
      throw APIError.notFound("Incident not found");
    }

    return data;
  }
);
