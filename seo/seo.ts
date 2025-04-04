import { api } from "encore.dev/api";
import axios from "axios";
import * as cheerio from "cheerio";
import { performance } from "perf_hooks";

interface AnalyzeSEORequest {
  url: string;
  keywords?: string[];
  followRedirects?: boolean;
  depth?: number;
}

interface AnalyzeSEOResponse {
  url: string;
  finalUrl?: string;
  title: {
    text: string;
    length: number;
    optimal: boolean;
  };
  serpPreview?: {
    title: string;
    url: string;
    description: string;
    favicon?: string;
  };
  description: {
    text: string;
    length: number;
    optimal: boolean;
  };
  headings: {
    h1: { count: number; texts: string[] };
    h2: { count: number; texts: string[] };
    h3: { count: number; texts: string[] };
  };
  images: {
    withAlt: number;
    withoutAlt: number;
    total: number;
  };
  links: {
    total: number;
    internal: number;
    external: number;
    broken: number;
    ratio: number;
  };
  keywords: {
    density: { [keyword: string]: number };
    prominent: string[];
  };
  mobile: {
    friendly: boolean;
    viewport: boolean;
    tapTargets: boolean;
  };
  performance: {
    loadTime: number;
    pageSize: number;
    requests: number;
  };
  structure: {
    canonical: string | null;
    lang: string | null;
    schemaMarkup: boolean;
  };
  seoScore: number;
  warnings: string[];
  suggestions: string[];
  error?: string;
}

const linkCache = new Map<string, boolean>();

async function checkLink(
  url: string,
  baseUrl: string
): Promise<{ broken: boolean; status?: number }> {
  try {
    const resolvedUrl = new URL(url, baseUrl).href;
    if (linkCache.has(resolvedUrl)) {
      return { broken: linkCache.get(resolvedUrl) as boolean };
    }
    if (resolvedUrl.startsWith("mailto:") || resolvedUrl.startsWith("tel:")) {
      linkCache.set(resolvedUrl, false);
      return { broken: false };
    }

    const response = await axios.head(resolvedUrl, {
      maxRedirects: 5,
      timeout: 5000,
      validateStatus: () => true,
    });

    const isBroken = response.status >= 400;
    linkCache.set(resolvedUrl, isBroken);

    return {
      broken: isBroken,
      status: response.status,
    };
  } catch (error) {
    linkCache.set(url, true);
    return { broken: true };
  }
}

function calculateKeywordDensity(
  text: string,
  keywords: string[]
): { density: { [keyword: string]: number }; prominent: string[] } {
  const cleanText = text
    .replace(/<[^>]*>/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();

  const words = cleanText.split(/\s+/).filter((word) => word.length > 2);
  const wordCount = words.length;
  const density: { [keyword: string]: number } = {};
  const wordFrequency: { [word: string]: number } = {};
  words.forEach((word) => {
    wordFrequency[word] = (wordFrequency[word] || 0) + 1;
  });
  keywords.forEach((keyword) => {
    const lowerKeyword = keyword.toLowerCase();
    const regex = new RegExp(`\\b${lowerKeyword}\\b`, "gi");
    const matches = cleanText.match(regex);
    density[keyword] = matches ? (matches.length / wordCount) * 100 : 0;
  });
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "are",
    "was",
    "were",
  ]);
  const prominent = Object.entries(wordFrequency)
    .filter(([word]) => !stopWords.has(word))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  return { density, prominent };
}

function analyzeMobileFriendliness(
  html: string,
  url: string
): { friendly: boolean; viewport: boolean; tapTargets: boolean } {
  const $ = cheerio.load(html);
  const viewportMeta = $('meta[name="viewport"]').attr("content");
  const hasViewport =
    !!viewportMeta &&
    (viewportMeta.includes("width=device-width") ||
      viewportMeta.includes("initial-scale=1"));
  const responsiveStyles = $("style, link[rel='stylesheet']").text();
  const hasMediaQueries = /@media\s+.*screen\s+.*/.test(responsiveStyles);
  let tapTargetIssues = 0;
  $("a, button, [onclick]").each((_, el) => {
    const $el = $(el);
    const fontSize = parseInt($el.css("font-size") || "16") || 16;
    const padding = parseInt($el.css("padding") ?? "0") || 0;
    const height = parseInt($el.css("height") || "0") || fontSize + padding * 2;
    const width =
      parseInt($el.css("width") || "0") || $el.text().length * (fontSize * 0.6);

    if (height < 48 || width < 48) {
      tapTargetIssues++;
    }
  });

  return {
    friendly: hasViewport && hasMediaQueries && tapTargetIssues < 3,
    viewport: hasViewport,
    tapTargets: tapTargetIssues < 3,
  };
}

function calculateSEOScore(
  title: { length: number; optimal: boolean },
  description: { length: number; optimal: boolean },
  headings: { h1: { count: number } },
  images: { withoutAlt: number; total: number },
  links: { internal: number; external: number; broken: number; ratio: number },
  keywords: { density: { [keyword: string]: number } },
  mobile: { friendly: boolean; viewport: boolean; tapTargets: boolean },
  performance: { loadTime: number },
  structure: {
    canonical: string | null;
    lang: string | null;
    schemaMarkup: boolean;
  }
): { score: number; warnings: string[]; suggestions: string[] } {
  let score = 100;
  const warnings: string[] = [];
  const suggestions: string[] = [];
  if (title.length === 0) {
    score -= 15;
    warnings.push("Missing title tag");
  } else if (!title.optimal) {
    score -= 5;
    warnings.push(
      title.length < 30
        ? "Title is too short (aim for 30-60 characters)"
        : "Title is too long (aim for 30-60 characters)"
    );
  }

  if (description.length === 0) {
    score -= 10;
    warnings.push("Missing meta description");
  } else if (!description.optimal) {
    score -= 5;
    warnings.push(
      description.length < 70
        ? "Description is too short (aim for 70-160 characters)"
        : "Description is too long (aim for 70-160 characters)"
    );
  }

  if (headings.h1.count === 0) {
    score -= 10;
    warnings.push("Missing H1 tag");
  } else if (headings.h1.count > 1) {
    score -= 5;
    warnings.push("Multiple H1 tags detected (recommend only one)");
  }

  if (images.total > 0 && images.withoutAlt > 0) {
    score -= Math.min(images.withoutAlt * 2, 10);
    warnings.push(`${images.withoutAlt} image(s) missing alt text`);
  }

  if (links.broken > 0) {
    score -= Math.min(links.broken * 3, 15);
    warnings.push(`${links.broken} broken link(s) found`);
  }
  if (links.internal < 5) {
    score -= 5;
    suggestions.push("Add more internal links to improve site structure");
  }
  if (links.ratio < 1) {
    score -= 5;
    warnings.push("More external than internal links (balance recommended)");
  }

  const keywordEntries = Object.entries(keywords.density);
  if (keywordEntries.length > 0) {
    keywordEntries.forEach(([keyword, density]) => {
      if (density < 0.5) {
        score -= 2;
        suggestions.push(`Consider increasing usage of keyword "${keyword}"`);
      } else if (density > 2.5) {
        score -= 2;
        warnings.push(`Potential keyword stuffing for "${keyword}"`);
      }
    });
  } else {
    suggestions.push("Consider adding relevant keywords to your content");
  }

  if (!mobile.friendly) {
    score -= 15;
    if (!mobile.viewport) warnings.push("Missing responsive viewport meta tag");
    if (!mobile.tapTargets)
      warnings.push("Some tap targets may be too small for mobile");
  }

  if (performance.loadTime > 3000) {
    score -= 10;
    warnings.push("Page load time is slow (above 3 seconds)");
    suggestions.push(
      "Optimize images, enable compression, and leverage browser caching"
    );
  } else if (performance.loadTime > 2000) {
    score -= 5;
    suggestions.push("Page could load faster (aim for under 2 seconds)");
  }

  if (!structure.canonical) {
    score -= 5;
    suggestions.push(
      "Consider adding a canonical URL to avoid duplicate content issues"
    );
  }
  if (!structure.lang) {
    score -= 2;
    suggestions.push("Add language attribute to HTML tag");
  }
  if (!structure.schemaMarkup) {
    score -= 3;
    suggestions.push("Consider adding schema markup for rich snippets");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return { score, warnings, suggestions };
}

export const analyzeSeo = api<AnalyzeSEORequest, AnalyzeSEOResponse>(
  {
    method: "POST",
    path: "/analyze-seo",
    expose: true,
  },
  async (params) => {
    const { url, keywords = [], followRedirects = true, depth = 1 } = params;

    const startTime = performance.now();
    const warnings: string[] = [];
    const suggestions: string[] = [];
    const processedUrl =
      url.startsWith("http:") || url.startsWith("https:")
        ? url
        : `https://${url}`;

    try {
      const response = await axios.get(processedUrl, {
        maxRedirects: followRedirects ? 5 : 0,
        timeout: 10000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36",
        },
      });

      const finalUrl = response.request.res.responseUrl || processedUrl;
      const html = response.data;
      const $ = cheerio.load(html);
      const favicon =
        $('link[rel="icon"], link[rel="shortcut icon"]').attr("href") ||
        $('meta[itemprop="image"]').attr("content") ||
        new URL("/favicon.ico", finalUrl).href;

      const contentType = response.headers["content-type"] || "";
      const pageSize =
        parseInt(response.headers["content-length"]) || Buffer.byteLength(html);
      if (!contentType.includes("text/html")) {
        return {
          url: processedUrl,
          finalUrl,
          title: { text: "", length: 0, optimal: false },
          description: { text: "", length: 0, optimal: false },
          headings: {
            h1: { count: 0, texts: [] },
            h2: { count: 0, texts: [] },
            h3: { count: 0, texts: [] },
          },
          images: { withAlt: 0, withoutAlt: 0, total: 0 },
          links: { total: 0, internal: 0, external: 0, broken: 0, ratio: 0 },
          keywords: { density: {}, prominent: [] },
          mobile: { friendly: false, viewport: false, tapTargets: false },
          performance: { loadTime: 0, pageSize, requests: 0 },
          structure: { canonical: null, lang: null, schemaMarkup: false },
          seoScore: 0,
          warnings: ["URL does not return HTML content"],
          suggestions: [],
          error: "Invalid content type",
        };
      }
      const titleText = $("title").text().trim();
      const titleLength = titleText.length;
      const titleOptimal = titleLength >= 30 && titleLength <= 60;

      const descriptionText =
        $('meta[name="description"]').attr("content")?.trim() || "";
      const descriptionLength = descriptionText.length;
      const descriptionOptimal =
        descriptionLength >= 70 && descriptionLength <= 160;
      const h1Texts = $("h1")
        .map((_, el) => $(el).text().trim())
        .get();
      const h2Texts = $("h2")
        .map((_, el) => $(el).text().trim())
        .get();
      const h3Texts = $("h3")
        .map((_, el) => $(el).text().trim())
        .get();
      const imagesWithAlt = $('img[alt][alt!=""]').length;
      const imagesWithoutAlt = $('img:not([alt]), img[alt=""]').length;
      const totalImages = imagesWithAlt + imagesWithoutAlt;
      const allLinks = $("a")
        .map((_, el) => $(el).attr("href"))
        .get()
        .filter(Boolean);
      const internalLinks = allLinks.filter(
        (link) =>
          link.startsWith("/") ||
          new URL(link, finalUrl).hostname === new URL(finalUrl).hostname
      );
      const externalLinks = allLinks.length - internalLinks.length;
      const linksToCheck = depth > 1 ? allLinks : allLinks.slice(0, 20);
      const brokenLinksResults = await Promise.all(
        linksToCheck.map((link) => checkLink(link, finalUrl))
      );

      const brokenLinks = brokenLinksResults.filter((res) => res.broken).length;
      const bodyText = $("body").text();
      const keywordAnalysis = calculateKeywordDensity(bodyText, keywords);
      const mobileAnalysis = analyzeMobileFriendliness(html, finalUrl);
      const canonicalUrl = $('link[rel="canonical"]').attr("href") || null;
      const htmlLang = $("html").attr("lang") || null;
      const hasSchemaMarkup =
        $('script[type="application/ld+json"]').length > 0;
      const loadTime = performance.now() - startTime;
      const requestCount = [
        ...$(
          'script[src], link[rel="stylesheet"][href], img[src], iframe[src]'
        ),
      ].length;
      const serpPreview = {
        title: titleText || "Untitled Page",
        url: finalUrl,
        description:
          descriptionText ||
          (bodyText.length > 0
            ? bodyText.substring(0, 160).replace(/\s+/g, " ").trim() + "..."
            : "No description available"),
        favicon: favicon.startsWith("http")
          ? favicon
          : new URL(favicon, finalUrl).href,
      };
      const {
        score,
        warnings: scoreWarnings,
        suggestions: scoreSuggestions,
      } = calculateSEOScore(
        { length: titleLength, optimal: titleOptimal },
        { length: descriptionLength, optimal: descriptionOptimal },
        { h1: { count: h1Texts.length } },
        { withoutAlt: imagesWithoutAlt, total: totalImages },
        {
          internal: internalLinks.length,
          external: externalLinks,
          broken: brokenLinks,
          ratio: internalLinks.length / Math.max(1, externalLinks),
        },
        { density: keywordAnalysis.density },
        mobileAnalysis,
        { loadTime },
        {
          canonical: canonicalUrl,
          lang: htmlLang,
          schemaMarkup: hasSchemaMarkup,
        }
      );

      warnings.push(...scoreWarnings);
      suggestions.push(...scoreSuggestions);

      return {
        serpPreview,
        url: processedUrl,
        finalUrl: finalUrl !== processedUrl ? finalUrl : undefined,
        title: {
          text: titleText,
          length: titleLength,
          optimal: titleOptimal,
        },
        description: {
          text: descriptionText,
          length: descriptionLength,
          optimal: descriptionOptimal,
        },
        headings: {
          h1: { count: h1Texts.length, texts: h1Texts },
          h2: { count: h2Texts.length, texts: h2Texts },
          h3: { count: h3Texts.length, texts: h3Texts },
        },
        images: {
          withAlt: imagesWithAlt,
          withoutAlt: imagesWithoutAlt,
          total: totalImages,
        },
        links: {
          total: allLinks.length,
          internal: internalLinks.length,
          external: externalLinks,
          broken: brokenLinks,
          ratio: internalLinks.length / Math.max(1, externalLinks),
        },
        keywords: {
          density: keywordAnalysis.density,
          prominent: keywordAnalysis.prominent,
        },
        mobile: mobileAnalysis,
        performance: {
          loadTime,
          pageSize,
          requests: requestCount,
        },
        structure: {
          canonical: canonicalUrl,
          lang: htmlLang,
          schemaMarkup: hasSchemaMarkup,
        },
        seoScore: score,
        warnings: [...new Set(warnings)],
        suggestions: [...new Set(suggestions)],
      };
    } catch (error: any) {
      return {
        serpPreview: {
          title: "Error loading page",
          url: processedUrl,
          description: "Could not generate preview due to error loading page",
        },
        url: processedUrl,
        title: { text: "", length: 0, optimal: false },
        description: { text: "", length: 0, optimal: false },
        headings: {
          h1: { count: 0, texts: [] },
          h2: { count: 0, texts: [] },
          h3: { count: 0, texts: [] },
        },
        images: { withAlt: 0, withoutAlt: 0, total: 0 },
        links: { total: 0, internal: 0, external: 0, broken: 0, ratio: 0 },
        keywords: { density: {}, prominent: [] },
        mobile: { friendly: false, viewport: false, tapTargets: false },
        performance: { loadTime: 0, pageSize: 0, requests: 0 },
        structure: { canonical: null, lang: null, schemaMarkup: false },
        seoScore: 0,
        warnings: ["Failed to fetch URL"],
        suggestions: [],
        message: error.message,
      };
    }
  }
);
