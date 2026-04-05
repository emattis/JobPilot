import type { DiscoveredJobInput } from "./yc";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

interface LeverPosting {
  id: string;
  text: string; // job title
  categories: {
    location?: string;
    team?: string;
    commitment?: string;
    allLocations?: string[];
  };
  descriptionPlain?: string;
  workplaceType?: "remote" | "onsite" | "hybrid";
  hostedUrl?: string;
}

function companyToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function discoverLeverJobs(
  companyName: string,
  targetRoles: string[]
): Promise<DiscoveredJobInput[]> {
  const slug = companyToSlug(companyName);
  const apiUrl = `https://api.lever.co/v0/postings/${slug}?mode=json`;

  try {
    const res = await fetch(apiUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return [];

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return [];

    const data = (await res.json()) as LeverPosting[];
    if (!Array.isArray(data)) return [];

    const rolePatterns = targetRoles.map((r) => new RegExp(r, "i"));

    return data
      .filter((p) => {
        if (rolePatterns.length === 0) return true;
        return rolePatterns.some((re) => re.test(p.text));
      })
      .map((p) => {
        const location = p.categories?.location ?? null;
        const remote =
          p.workplaceType === "remote"
            ? true
            : p.workplaceType === "onsite"
            ? false
            : location
            ? /remote/i.test(location)
            : null;

        const url =
          p.hostedUrl || `https://jobs.lever.co/${slug}/${p.id}`;

        return {
          url,
          title: p.text,
          company: companyName,
          location: location,
          remote,
          source: "lever",
          snippet: (p.descriptionPlain ?? "").slice(0, 400),
        };
      });
  } catch {
    return [];
  }
}
