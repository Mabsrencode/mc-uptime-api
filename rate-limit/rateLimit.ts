import { APIError } from "encore.dev/api";

const requestCounts = new Map<
  string,
  { count: number; lastRequestTime: number }
>();

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;

export default function rateLimitMiddleware(req: { ip?: string }) {
  const ip = req.ip || "unknown";
  const now = Date.now();

  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, { count: 1, lastRequestTime: now });
    console.log("request counts: ", requestCounts);
  } else {
    const record = requestCounts.get(ip)!;
    if (now - record.lastRequestTime > RATE_LIMIT_WINDOW_MS) {
      requestCounts.set(ip, { count: 1, lastRequestTime: now });
    } else {
      record.count += 1;
      record.lastRequestTime = now;
    }
    if (record.count > RATE_LIMIT_MAX_REQUESTS) {
      throw APIError.resourceExhausted(
        "Too many requests. Please try again later."
      );
    }
  }
}
