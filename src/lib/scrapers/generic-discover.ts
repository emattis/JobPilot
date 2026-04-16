import * as cheerio from "cheerio";
import { getGeminiClient } from "@/lib/ai/client";
import { parseAiArray } from "@/lib/ai/parse-json";
import type { DiscoveredJobInput } from "./yc";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/**
 * Scrape a generic career page (Workday, BambooHR, custom sites, etc.)
 * using AI to extract job listings from the page content.
 */
export async function discoverGenericJobs(
  careerUrl: string,
  companyName: string,
  targetRoles: string[]
): Promise<DiscoveredJobInput[]> {
  try {
    // Fetch the career page
    const res = await fetch(careerUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.log(`[generic-discover] ${companyName}: HTTP ${res.status}`);
      return [];
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Strip non-content elements
    $("script, style, nav, footer, header, svg, img, iframe").remove();
    const pageText = $.text().replace(/\s+/g, " ").trim();

    if (pageText.length < 100) {
      console.log(`[generic-discover] ${companyName}: page too short (${pageText.length} chars)`);
      return [];
    }

    // Trim to keep token count manageable
    const trimmed = pageText.slice(0, 15000);

    const client = getGeminiClient();
    const model = client.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: { temperature: 0, maxOutputTokens: 4096 },
    });

    const rolesHint = targetRoles.length > 0
      ? `Focus on roles matching these keywords: ${targetRoles.join(", ")}.`
      : "Extract all job listings you can find.";

    const prompt = `Extract job listings from this career page for ${companyName}. ${rolesHint}

Return a JSON array of job objects. Each object should have:
{ "title": string, "location": string or null, "remote": boolean or null, "url": string or null }

Rules:
- Only include actual job openings, not categories or headers
- If you can construct the full job URL from the page context, include it. Otherwise set url to null.
- The base URL of this page is: ${careerUrl}
- If no jobs are found, return an empty array []
- Return only valid JSON array, no markdown

Page content:
${trimmed}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const listings = parseAiArray<{
      title: string;
      location: string | null;
      remote: boolean | null;
      url: string | null;
    }>(text);

    console.log(`[generic-discover] ${companyName}: AI found ${listings.length} listings`);

    // Filter by target roles if specified
    const roleRegex = targetRoles.length > 0
      ? new RegExp(targetRoles.map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i")
      : null;

    return listings
      .filter((job) => {
        if (!job.title) return false;
        if (roleRegex && !roleRegex.test(job.title)) return false;
        return true;
      })
      .map((job) => ({
        url: job.url ?? `${careerUrl}#${encodeURIComponent(job.title)}`,
        title: job.title,
        company: companyName,
        location: job.location,
        remote: job.remote,
        source: "custom",
        snippet: `${job.title} at ${companyName}${job.location ? ` — ${job.location}` : ""}`,
      }));
  } catch (err) {
    console.error(`[generic-discover] ${companyName}: failed:`, err instanceof Error ? err.message : err);
    return [];
  }
}
