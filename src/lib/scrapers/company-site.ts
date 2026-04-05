import * as cheerio from "cheerio";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header").remove();
  return $.text().replace(/\s+/g, " ").trim();
}

// Try common About page paths if a bare domain is given
const ABOUT_PATHS = ["/about", "/about-us", "/company", "/our-story", "/who-we-are"];

async function fetchUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

export async function scrapeCompanySite(url: string): Promise<string | null> {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    const base = `${parsed.protocol}//${parsed.host}`;

    // If a specific path was given, try it directly
    if (parsed.pathname !== "/" && parsed.pathname !== "") {
      const html = await fetchUrl(parsed.href);
      if (html) {
        const text = htmlToText(html);
        if (text.length > 200) return text.slice(0, 4000);
      }
    }

    // Try common about paths
    for (const path of ABOUT_PATHS) {
      const html = await fetchUrl(base + path);
      if (!html) continue;

      const $ = cheerio.load(html);
      $("script, style, nav, footer, header, [class*='menu'], [class*='nav']").remove();

      // Look for the most content-rich block
      const main =
        $("main").html() ||
        $("article").first().html() ||
        $('[class*="about"], [class*="mission"], [class*="story"]').first().html() ||
        $("body").html();

      const text = htmlToText(main ?? "");
      if (text.length > 200) return text.slice(0, 4000);
    }

    // Fall back to homepage
    const homeHtml = await fetchUrl(base);
    if (homeHtml) {
      const text = htmlToText(homeHtml);
      if (text.length > 100) return text.slice(0, 2000);
    }

    return null;
  } catch {
    return null;
  }
}
