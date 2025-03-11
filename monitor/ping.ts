import { api } from "encore.dev/api";

export interface PingParams {
  url: string;
}

export interface PingResponse {
  up: boolean;
  error?: string;
  details?: string;
}

export const ping = api<PingParams, PingResponse>(
  { expose: true, path: "/ping/:url", method: "GET" },
  async ({ url }) => {
    if (!url.startsWith("http:") && !url.startsWith("https:")) {
      url = "https://" + url;
    }

    try {
      const controller = new AbortController();

      const resp = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });

      const up = resp.status >= 200 && resp.status < 300;
      if (!up) {
        return {
          up,
          error: `HTTP Status: ${resp.status} ${resp.statusText}`,
          details: `Response headers: ${JSON.stringify(
            Object.fromEntries(resp.headers.entries())
          )}`,
        };
      }
      return { up };
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
        error: "Fetch failed",
        details: errorDetails,
      };
    }
  }
);
