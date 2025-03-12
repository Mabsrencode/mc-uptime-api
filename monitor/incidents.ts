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
  error?: string | null;
  details?: string | null;
}

export const incident = api<IncidentParams, IncidentResponse>(
  { expose: true, path: "/report/:id", method: "GET", auth: true },
  async ({ id }) => {
    const data = await prisma.check.findUnique({
      where: { id: id },
    });

    if (!data) {
      throw APIError.notFound("Incident not found");
    }

    const result: IncidentResponse = {
      id: data.id,
      up: data.up,
      checkedAt: data.checkedAt.toISOString(),
      error: data.error,
      details: data.details,
    };

    return result;
  }
);
