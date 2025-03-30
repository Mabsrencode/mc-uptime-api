import { api } from "encore.dev/api";
import axios from "axios";
import * as cheerio from "cheerio";
import { performance, PerformanceObserver, PerformanceEntry } from "perf_hooks";

interface AnalyzePerformanceRequest {
  url: string;
}

interface AnalyzePerformanceResponse {
  url: string;
  loadTime: number;
  timeToFirstByte: number;
  pageSize: number;
  numberOfRequests: number;
  domContentLoadedTime: number;
  fullyLoadedTime: number;
  performanceScore: number;
  message: string;
  error?: string;
  details?: string;
}

const observer = new PerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    console.log(
      `Performance Entry: ${entry.name} - ${entry.duration.toFixed(2)}ms`
    );
  });
});
observer.observe({ entryTypes: ["measure", "http"] });

async function getPerformanceMetrics(
  url: string
): Promise<AnalyzePerformanceResponse> {
  const startTime = performance.now();
  if (!url.startsWith("http:") && !url.startsWith("https:")) {
    url = "https://" + url;
  }

  try {
    performance.mark("ttfbStart");
    const { data: html, headers, request } = await axios.get(url);
    performance.mark("ttfbEnd");
    performance.measure("TTFB", "ttfbStart", "ttfbEnd");
    const ttfbMeasure = performance.getEntriesByName("TTFB")[0];
    const timeToFirstByte = ttfbMeasure.duration;

    const $ = cheerio.load(html);
    const loadTime = performance.now() - startTime;
    const pageSize = Buffer.byteLength(html, "utf8");
    const numberOfRequests = $('img, script, link[rel="stylesheet"]').length;
    const domContentLoadedTime = loadTime * 0.7;
    const fullyLoadedTime = loadTime;
    const performanceScore = calculatePerformanceScore(
      loadTime,
      timeToFirstByte,
      pageSize,
      numberOfRequests,
      domContentLoadedTime,
      fullyLoadedTime
    );

    return {
      url,
      loadTime,
      timeToFirstByte,
      pageSize,
      numberOfRequests,
      domContentLoadedTime,
      fullyLoadedTime,
      performanceScore,
      message: "Performance analysis completed successfully",
    };
  } catch (error) {
    return {
      url,
      loadTime: 0,
      timeToFirstByte: 0,
      pageSize: 0,
      numberOfRequests: 0,
      domContentLoadedTime: 0,
      fullyLoadedTime: 0,
      performanceScore: 0,
      message: "Failed to analyze performance",
      error: "Error occurred",
      details: (error as any).message,
    };
  }
}

function calculatePerformanceScore(
  loadTime: number,
  timeToFirstByte: number,
  pageSize: number,
  numberOfRequests: number,
  domContentLoadedTime: number,
  fullyLoadedTime: number
): number {
  let score = 100;

  if (loadTime > 3000) score -= 10;
  else if (loadTime > 2000) score -= 5;

  if (timeToFirstByte > 500) score -= 10;
  else if (timeToFirstByte > 300) score -= 5;

  if (pageSize > 1024 * 1024) score -= 10;
  else if (pageSize > 512 * 1024) score -= 5;

  if (numberOfRequests > 50) score -= 10;
  else if (numberOfRequests > 30) score -= 5;

  if (domContentLoadedTime > 3000) score -= 10;
  else if (domContentLoadedTime > 2000) score -= 5;

  if (fullyLoadedTime > 5000) score -= 10;
  else if (fullyLoadedTime > 3000) score -= 5;

  return Math.max(0, Math.round(score));
}

export const analyzePerformance = api<
  AnalyzePerformanceRequest,
  AnalyzePerformanceResponse
>(
  {
    method: "POST",
    path: "/analyze-performance",
    expose: true,
  },
  async (params) => {
    const { url } = params;
    return await getPerformanceMetrics(url);
  }
);
