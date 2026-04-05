import * as cheerio from "cheerio";
import type { DiscoveredJobInput } from "./yc";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location: { name: string };
  content?: string; // HTML description
  updated_at: string;
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
}

function companyToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function detectRemote(text: string): boolean | null {
  if (/\bremote\b/i.test(text)) return true;
  if (/\bon-?site\b|\bin-?office\b/i.test(text)) return false;
  return null;
}

function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  return $.text().replace(/\s+/g, " ").trim();
}

export async function discoverGreenhouseJobs(
  companyName: string,
  targetRoles: string[]
): Promise<DiscoveredJobInput[]> {
  const slug = companyToSlug(companyName);
  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;

  console.log(`[greenhouse] Fetching ${companyName} (${slug}): ${apiUrl}`);

  try {
    const res = await fetch(apiUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });

    console.log(`[greenhouse] ${companyName}: HTTP ${res.status}`);
    if (!res.ok) return [];

    const data = (await res.json()) as GreenhouseResponse;
    if (!Array.isArray(data.jobs)) {
      console.log(`[greenhouse] ${companyName}: unexpected response shape`);
      return [];
    }

    console.log(`[greenhouse] ${companyName}: ${data.jobs.length} total jobs`);

    const rolePatterns = targetRoles.map((r) => new RegExp(r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));

    const filtered = data.jobs.filter((job) => {
      if (rolePatterns.length === 0) return true;
      return rolePatterns.some((re) => re.test(job.title));
    });

    console.log(`[greenhouse] ${companyName}: ${filtered.length} jobs after role filter (roles: ${targetRoles.slice(0, 3).join(", ")}…)`);

    return filtered.map((job) => {
      const locationName = job.location?.name ?? null;
      const snippet = job.content ? htmlToText(job.content).slice(0, 400) : "";
      return {
        url: job.absolute_url,
        title: job.title,
        company: companyName,
        location: locationName,
        remote: detectRemote((locationName ?? "") + " " + snippet),
        source: "greenhouse",
        snippet,
      };
    });
  } catch (err) {
    console.error(`[greenhouse] ${companyName}: error —`, err instanceof Error ? err.message : err);
    return [];
  }
}
