import { api } from "encore.dev/api";

export interface PingParams {
  url: string;
  count?: number;
}

export interface PingResponse {
  up: boolean;
  error?: string;
  details?: string;
  averageResponseTimeMs?: number;
  minResponseTimeMs?: number;
  maxResponseTimeMs?: number;
}

export const ping = api<PingParams, PingResponse>(
  { expose: true, path: "/ping/:url", method: "GET" },
  async ({ url, count = 5 }) => {
    if (!url.startsWith("http:") && !url.startsWith("https:")) {
      url = "https://" + url;
    }

    const responseTimes: number[] = [];
    let up = true;
    const controller = new AbortController();
    const resp = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    try {
      for (let i = 0; i < count; i++) {
        const controller = new AbortController();
        const startTime = Date.now();

        const resp = await fetch(url, {
          method: "GET",
          signal: controller.signal,
        });

        const responseTimeMs = Date.now() - startTime;
        responseTimes.push(responseTimeMs);

        if (resp.status < 200 || resp.status >= 300) {
          up = false;
          break;
        }
      }

      const averageResponseTimeMs =
        responseTimes.reduce((sum, time) => sum + time, 0) /
        responseTimes.length;
      const minResponseTimeMs = Math.min(...responseTimes);
      const maxResponseTimeMs = Math.max(...responseTimes);
      if (!up) {
        return {
          up,
          error: `HTTP Status: ${resp.status} ${resp.statusText}`,
          details: `Response headers: ${JSON.stringify(
            Object.fromEntries(resp.headers.entries())
          )}`,
          averageResponseTimeMs: undefined,
          minResponseTimeMs: undefined,
          maxResponseTimeMs: undefined,
        };
      }

      return {
        up,
        averageResponseTimeMs,
        minResponseTimeMs,
        maxResponseTimeMs,
      };
    } catch (err) {
      let errorDetails = "Unknown error";
      if (err instanceof Error) {
        if (err.name === "AbortError") {
          errorDetails =
            "Request timed out: The server did not respond within 5 seconds.";
        } else if (err instanceof TypeError) {
          errorDetails = `Network error: ${err.message}`;
        } else {
          errorDetails = `Unexpected error: ${err.message}`;
        }
      }
      return {
        up: false,
        error: `HTTP Status: ${resp.status} ${resp.statusText}`,
        details: `Response headers: ${JSON.stringify(
          Object.fromEntries(resp.headers.entries())
        )}`,
        averageResponseTimeMs: undefined,
        minResponseTimeMs: undefined,
        maxResponseTimeMs: undefined,
      };
    }
  }
);
