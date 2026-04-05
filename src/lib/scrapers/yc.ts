import * as cheerio from "cheerio";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export interface DiscoveredJobInput {
  url: string;
  title: string;
  company: string;
  location: string | null;
  remote: boolean | null;
  source: string;
  snippet: string; // short description for AI scoring
}

// Recursively search Next.js page data for arrays that look like job listings.
// Bounded to prevent runaway traversal on large payloads.
function findJobArrays(
  obj: unknown,
  depth = 0
): Array<Record<string, unknown>> {
  if (depth > 6 || !obj || typeof obj !== "object") return [];

  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === "object" && obj[0] !== null) {
      const sample = obj[0] as Record<string, unknown>;
      const hasTitle = "title" in sample;
      const hasCompany =
        "company" in sample ||
        "companyName" in sample ||
        "startup" in sample ||
        "organization" in sample;
      if (hasTitle && hasCompany) {
        return obj as Array<Record<string, unknown>>;
      }
    }
    return obj.flatMap((item) => findJobArrays(item, depth + 1));
  }

  return Object.values(obj as Record<string, unknown>).flatMap((v) =>
    findJobArrays(v, depth + 1)
  );
}

function coerceJob(item: Record<string, unknown>): DiscoveredJobInput | null {
  const title = (item.title as string) || "";
  if (!title) return null;

  // Company can be nested or a string
  const companyObj =
    (item.company as Record<string, unknown>) ||
    (item.startup as Record<string, unknown>) ||
    (item.organization as Record<string, unknown>) ||
    null;
  const company =
    (companyObj?.name as string) ||
    (companyObj?.slug as string) ||
    (item.companyName as string) ||
    "";
  if (!company) return null;

  const id = item.id as string | number | undefined;
  const rawUrl = (item.url as string) || (id ? `https://www.workatastartup.com/jobs/${id}` : "");
  if (!rawUrl) return null;
  const url = rawUrl.startsWith("http") ? rawUrl : `https://www.workatastartup.com${rawUrl}`;

  const rawLocation =
    (item.location as string) ||
    (companyObj?.location as string) ||
    null;
  const remote =
    typeof item.remote === "boolean"
      ? item.remote
      : rawLocation && /remote/i.test(rawLocation)
      ? true
      : null;

  const snippet =
    ((item.description as string) || (item.descriptionPlain as string) || "").slice(0, 400);

  return {
    url,
    title,
    company,
    location: rawLocation,
    remote,
    source: "yc",
    snippet,
  };
}

export async function scrapeYCJobs(
  targetRoles: string[],
  preferRemote: boolean
): Promise<DiscoveredJobInput[]> {
  const results: DiscoveredJobInput[] = [];
  const seen = new Set<string>();

  const queries = targetRoles.slice(0, 3);
  if (queries.length === 0) queries.push("software engineer");

  for (const role of queries) {
    try {
      const params = new URLSearchParams({ query: role });
      if (preferRemote) params.set("remote", "true");

      const res = await fetch(`https://www.workatastartup.com/jobs?${params}`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;

      const html = await res.text();

      // ── Strategy 1: __NEXT_DATA__ JSON ─────────────────────────────────────
      const ndMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (ndMatch) {
        try {
          const pageData = JSON.parse(ndMatch[1]) as Record<string, unknown>;
          const jobArrays = findJobArrays((pageData as Record<string, unknown>).props);
          for (const item of jobArrays) {
            const job = coerceJob(item);
            if (job && !seen.has(job.url)) {
              seen.add(job.url);
              results.push(job);
            }
          }
          if (results.length > 0) {
            await new Promise((r) => setTimeout(r, 800));
            continue;
          }
        } catch {
          // Fall through to HTML
        }
      }

      // ── Strategy 2: HTML card scraping ─────────────────────────────────────
      const $ = cheerio.load(html);

      $("a[href*='/jobs/']").each((_, el) => {
        const href = $(el).attr("href") ?? "";
        if (!href.match(/\/jobs\/[a-zA-Z0-9-]+/)) return;
        const url = href.startsWith("http")
          ? href
          : `https://www.workatastartup.com${href}`;
        if (seen.has(url)) return;

        const text = $(el).text().replace(/\s+/g, " ").trim();
        const title =
          $(el).find('[class*="title"], [class*="role"], h2, h3, h4').first().text().trim() ||
          text.split("\n")[0].trim();
        const company =
          $(el)
            .find('[class*="company"], [class*="startup"], [class*="name"]')
            .first()
            .text()
            .trim() || "YC Company";
        const location =
          $(el)
            .find('[class*="location"], [class*="city"], [class*="remote"]')
            .first()
            .text()
            .trim() || null;

        if (!title) return;
        seen.add(url);
        results.push({
          url,
          title,
          company,
          location: location || null,
          remote: location ? /remote/i.test(location) : null,
          source: "yc",
          snippet: "",
        });
      });

      await new Promise((r) => setTimeout(r, 1000));
    } catch {
      // Continue on per-query failure
    }
  }

  return results;
}
