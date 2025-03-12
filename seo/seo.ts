import { api } from "encore.dev/api";
import axios from "axios";
import * as cheerio from "cheerio";

interface AnalyzeSEORequest {
  url: string;
}

interface AnalyzeSEOResponse {
  url: string;
  title: string;
  description: string;
  h1: string;
  imagesWithoutAlt: number;
  totalLinks: number;
  internalLinks: number;
  externalLinks: number;
  brokenLinks: number;
  keywordDensity: { [keyword: string]: number };
  isMobileFriendly: boolean;
  loadTime: number;
  seoScore: number;
  message: string;
  error?: string;
  details?: string;
}

async function isLinkBroken(url: string): Promise<boolean> {
  try {
    const response = await axios.head(url);
    return response.status >= 400;
  } catch (error) {
    return true;
  }
}

function calculateKeywordDensity(
  text: string,
  keywords: string[]
): { [keyword: string]: number } {
  const wordCount = text.split(/\s+/).length;
  const density: { [keyword: string]: number } = {};

  keywords.forEach((keyword) => {
    const regex = new RegExp(keyword, "gi");
    const matches = text.match(regex);
    density[keyword] = matches ? (matches.length / wordCount) * 100 : 0;
  });

  return density;
}

function isMobileFriendly(html: string): boolean {
  const $ = cheerio.load(html);
  const viewportMeta = $('meta[name="viewport"]').attr("content");
  const mediaQueries = $("style, link[rel='stylesheet']").text();

  return !!viewportMeta && /@media\s+.*screen\s+.*/.test(mediaQueries);
}

function calculateSEOScore(
  title: string,
  description: string,
  h1: string,
  imagesWithoutAlt: number,
  internalLinks: number,
  externalLinks: number,
  brokenLinks: number,
  keywordDensity: { [keyword: string]: number },
  isMobileFriendly: boolean,
  loadTime: number
): number {
  let score = 100;

  if (!title) score -= 10;
  else if (title.length < 30 || title.length > 60) score -= 5;
  if (!description) score -= 10;
  else if (description.length < 70 || description.length > 160) score -= 5;

  if (!h1) score -= 5;
  else if (h1.length > 70) score -= 2;
  if (imagesWithoutAlt > 0) score -= imagesWithoutAlt * 1;
  if (internalLinks < 5) score -= 5;
  else if (internalLinks > 50) score -= 2;

  if (externalLinks > internalLinks) score -= 5;

  if (brokenLinks > 0) score -= brokenLinks * 2;

  const targetKeywords = Object.keys(keywordDensity);
  if (targetKeywords.length === 0) score -= 10;
  else {
    targetKeywords.forEach((keyword) => {
      if (keywordDensity[keyword] < 0.5 || keywordDensity[keyword] > 2.5) {
        score -= 2;
      }
    });
  }

  if (!isMobileFriendly) score -= 15;

  if (loadTime > 3000) score -= 10;
  else if (loadTime > 2000) score -= 5;

  return Math.max(0, Math.round(score));
}

export const analyzeSeo = api<AnalyzeSEORequest, AnalyzeSEOResponse>(
  {
    method: "GET",
    path: "/analyze-seo/:url",
    expose: true,
  },
  async ({ url }) => {
    const startTime = performance.now();
    if (!url.startsWith("http:") && !url.startsWith("https:")) {
      url = "https://" + url;
    }
    try {
      const { data: html } = await axios.get(url);
      const $ = cheerio.load(html);
      const title = $("title").text();
      const description = $('meta[name="description"]').attr("content") || "";
      const h1 = $("h1").first().text() || "";
      const imagesWithoutAlt = $("img:not([alt])").length;
      const totalLinks = $("a").length;
      const internalLinks = $('a[href^="/"], a[href^="' + url + '"]').length;
      const externalLinks = totalLinks - internalLinks;
      const links = $("a")
        .map((_, element) => $(element).attr("href"))
        .get();
      const brokenLinks = (
        await Promise.all(links.map((link) => isLinkBroken(link)))
      ).filter((isBroken) => isBroken).length;
      const bodyText = $("body").text();
      const keywords = ["SEO", "website", "analysis"];
      const keywordDensity = calculateKeywordDensity(bodyText, keywords);
      const isMobileFriendlyResult = isMobileFriendly(html);
      const loadTime = performance.now() - startTime;
      const seoScore = calculateSEOScore(
        title,
        description,
        h1,
        imagesWithoutAlt,
        internalLinks,
        externalLinks,
        brokenLinks,
        keywordDensity,
        isMobileFriendlyResult,
        loadTime
      );

      return {
        url,
        title,
        description,
        h1,
        imagesWithoutAlt,
        totalLinks,
        internalLinks,
        externalLinks,
        brokenLinks,
        keywordDensity,
        isMobileFriendly: isMobileFriendlyResult,
        loadTime,
        seoScore,
        message: "SEO analysis completed successfully",
      };
    } catch (error) {
      //! throw api error
      return {
        url,
        title: "",
        description: "",
        h1: "",
        imagesWithoutAlt: 0,
        totalLinks: 0,
        internalLinks: 0,
        externalLinks: 0,
        brokenLinks: 0,
        keywordDensity: {},
        isMobileFriendly: false,
        loadTime: 0,
        seoScore: 0,
        message: "Failed to analyze SEO",
        error: "Error occurred",
        details: (error as any).message,
      };
    }
  }
);
