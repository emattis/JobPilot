import * as cheerio from "cheerio";
import type { ScrapedJob } from "@/types/analysis";
import { getGeminiClient } from "@/lib/ai/client";
import { parseAiObject } from "@/lib/ai/parse-json";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 12000;

// Common tech skills to auto-detect in job descriptions
const SKILL_PATTERNS = [
  "TypeScript", "JavaScript", "Python", "Go", "Rust", "Java", "C\\+\\+", "C#",
  "Ruby", "PHP", "Swift", "Kotlin", "Scala", "Elixir", "Haskell",
  "React", "Next\\.js", "Vue", "Angular", "Svelte", "React Native",
  "Node\\.js", "Express", "FastAPI", "Django", "Rails", "Spring",
  "PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis", "Elasticsearch",
  "AWS", "GCP", "Azure", "Docker", "Kubernetes", "Terraform", "Pulumi",
  "GraphQL", "REST", "gRPC", "WebSockets", "tRPC",
  "Git", "CI/CD", "GitHub Actions", "Jenkins",
  "Linux", "Bash", "Shell",
  "Machine Learning", "Deep Learning", "LLMs", "PyTorch", "TensorFlow",
  "Figma", "Sketch", "Product Management", "Agile", "Scrum",
];

function extractSkills(text: string): string[] {
  return SKILL_PATTERNS.filter((skill) =>
    new RegExp(`\\b${skill}\\b`, "i").test(text)
  );
}

function extractSalary(text: string): { min: number | null; max: number | null } {
  // Match patterns like $120k, $120,000, $120K-$160K
  const range = text.match(
    /\$(\d{1,3}(?:,\d{3})?(?:\.\d+)?)\s*[kK]?\s*[-–to]+\s*\$(\d{1,3}(?:,\d{3})?(?:\.\d+)?)\s*[kK]?/
  );
  if (range) {
    const parse = (s: string, hasK: boolean) => {
      const n = parseFloat(s.replace(/,/g, ""));
      return hasK || n < 1000 ? Math.round(n * 1000) : Math.round(n);
    };
    const hasK = /[kK]/.test(range[0]);
    return { min: parse(range[1], hasK), max: parse(range[2], hasK) };
  }
  return { min: null, max: null };
}

function detectRemote(text: string): boolean | null {
  const lower = text.toLowerCase();
  if (/\bremote\b/.test(lower)) return true;
  if (/\bon-?site\b|\bin-?office\b|\bin person\b/.test(lower)) return false;
  return null;
}

function detectExperienceLevel(text: string): string | null {
  const lower = text.toLowerCase();
  if (/\b(staff|principal|distinguished)\b/.test(lower)) return "staff";
  if (/\b(lead|tech lead|engineering lead)\b/.test(lower)) return "lead";
  if (/\b(senior|sr\.)\b/.test(lower)) return "senior";
  if (/\b(mid-?level|mid level|intermediate)\b/.test(lower)) return "mid";
  if (/\b(junior|jr\.?|entry.?level|associate)\b/.test(lower)) return "junior";
  return null;
}

function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style").remove();
  return $.text().replace(/\s+/g, " ").trim();
}

// ── Greenhouse ────────────────────────────────────────────────────────────────
async function scrapeGreenhouse(url: string): Promise<ScrapedJob> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  const title =
    $("h1.app-title").text().trim() ||
    $('h1[class*="title"]').first().text().trim() ||
    $("h1").first().text().trim();

  const company =
    $(".company-name").text().trim() ||
    $('[class*="company"]').first().text().trim() ||
    new URL(url).pathname.split("/")[1];

  const location = $(".location").text().trim() || null;

  const descHtml =
    $("#content").html() ||
    $(".section--body").html() ||
    $('[class*="description"]').first().html() ||
    "";

  const description = htmlToText(descHtml);
  const salary = extractSalary(description);

  return {
    title,
    company,
    location,
    description,
    requirements: null,
    niceToHaves: null,
    skills: extractSkills(description),
    experienceLevel: detectExperienceLevel(title + " " + description),
    salaryMin: salary.min,
    salaryMax: salary.max,
    remote: detectRemote(location + " " + description),
    postedAt: null,
    source: "greenhouse",
  };
}

// ── Lever ─────────────────────────────────────────────────────────────────────
async function scrapeLever(url: string): Promise<ScrapedJob> {
  // jobs.lever.co/{company}/{id} → api.lever.co/v0/postings/{company}/{id}
  const match = url.match(/jobs\.lever\.co\/([^/]+)\/([^/?#]+)/);

  if (match) {
    const apiUrl = `https://api.lever.co/v0/postings/${match[1]}/${match[2]}`;
    try {
      const res = await fetch(apiUrl, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (res.ok && (res.headers.get("content-type") ?? "").includes("application/json")) {
        const data = await res.json() as {
          text?: string;
          categories?: { location?: string; team?: string; allLocations?: string[] };
          descriptionPlain?: string;
          descriptionBody?: string;
          description?: string;
          lists?: Array<{ text: string; content: string }>;
          additional?: string;
          additionalPlain?: string;
          workplaceType?: string; // "remote" | "onsite" | "hybrid"
        };

        // Prefer plain-text fields; fall back to stripping HTML from body
        const descParts = [
          data.descriptionPlain ?? (data.descriptionBody ? htmlToText(data.descriptionBody) : "") ?? "",
          ...(data.lists ?? []).map((l) => l.text + ": " + htmlToText(l.content)),
          data.additionalPlain ?? data.additional ?? "",
        ].filter(Boolean);
        const description = descParts.join("\n\n");

        const requirementsList = data.lists?.find((l) =>
          /requirement|qualification/i.test(l.text)
        );
        const niceToHavesList = data.lists?.find((l) =>
          /nice.to.have|bonus|preferred/i.test(l.text)
        );

        const salary = extractSalary(description);
        const isRemote = data.workplaceType === "remote"
          ? true
          : data.workplaceType === "onsite"
          ? false
          : detectRemote((data.categories?.location ?? "") + " " + description);

        return {
          title: data.text ?? "",
          company: match[1],
          location: data.categories?.location ?? null,
          description,
          requirements: requirementsList ? htmlToText(requirementsList.content) : null,
          niceToHaves: niceToHavesList ? htmlToText(niceToHavesList.content) : null,
          skills: extractSkills(description),
          experienceLevel: detectExperienceLevel((data.text ?? "") + " " + description),
          salaryMin: salary.min,
          salaryMax: salary.max,
          remote: isRemote,
          postedAt: null,
          source: "lever",
        };
      }
    } catch {
      // API unavailable — fall through to HTML scrape
    }
  }

  // Fall back to HTML scraping
  return scrapeGeneric(url, "lever");
}

// ── Ashby ─────────────────────────────────────────────────────────────────────
async function scrapeAshby(url: string): Promise<ScrapedJob> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $("h1").first().text().trim();
  const location =
    $('[class*="location"]').first().text().trim() ||
    $('[data-testid*="location"]').text().trim() ||
    null;

  const descHtml =
    $('[class*="job-posting"]').html() ||
    $('[class*="description"]').first().html() ||
    $("main").html() ||
    "";

  const description = htmlToText(descHtml);
  const company = url.includes("ashbyhq.com")
    ? url.split("/")[3]
    : new URL(url).hostname.split(".")[0];

  const salary = extractSalary(description);

  return {
    title,
    company,
    location,
    description,
    requirements: null,
    niceToHaves: null,
    skills: extractSkills(description),
    experienceLevel: detectExperienceLevel(title + " " + description),
    salaryMin: salary.min,
    salaryMax: salary.max,
    remote: detectRemote((location ?? "") + " " + description),
    postedAt: null,
    source: "ashby",
  };
}

// ── AI extraction fallback ───────────────────────────────────────────────────

interface AiExtractedJob {
  title: string | null;
  company: string | null;
  location: string | null;
  remote: boolean | null;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string | null;
  requirements: string | null;
  niceToHaves: string | null;
  skills: string[] | null;
  experienceLevel: string | null;
}

async function extractWithAi(pageText: string, url: string, source: string): Promise<ScrapedJob> {
  // Trim to keep token count low
  const trimmed = pageText.slice(0, 10000);

  const client = getGeminiClient();
  const model = client.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: { temperature: 0, maxOutputTokens: 4096 },
  });

  const prompt = `Extract the following fields from this job posting page. Return JSON with: { "title": string, "company": string, "location": string, "remote": boolean, "salaryMin": number, "salaryMax": number, "description": string, "requirements": string, "niceToHaves": string, "skills": string[], "experienceLevel": string }. If a field is not found, set it to null. Return only valid JSON, no markdown.

URL: ${url}

Page content:
${trimmed}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const parsed = parseAiObject<AiExtractedJob>(text);

  return {
    title: parsed.title ?? "",
    company: parsed.company ?? new URL(url).hostname.replace("www.", "").split(".")[0],
    location: parsed.location,
    description: parsed.description ?? trimmed.slice(0, 4000),
    requirements: parsed.requirements,
    niceToHaves: parsed.niceToHaves,
    skills: parsed.skills ?? [],
    experienceLevel: parsed.experienceLevel,
    salaryMin: parsed.salaryMin,
    salaryMax: parsed.salaryMax,
    remote: parsed.remote,
    postedAt: null,
    source,
    aiExtracted: true,
  };
}

// ── Generic / Fallback ────────────────────────────────────────────────────────
async function scrapeGeneric(url: string, source = "manual"): Promise<ScrapedJob> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  // Try JSON-LD structured data first
  const jsonLdScript = $('script[type="application/ld+json"]')
    .toArray()
    .map((el) => {
      try {
        return JSON.parse($(el).html() ?? "");
      } catch {
        return null;
      }
    })
    .find((d) => d?.["@type"] === "JobPosting");

  if (jsonLdScript) {
    const d = jsonLdScript;
    const description = htmlToText(d.description ?? "");
    const salary = extractSalary(description);
    const minVal = d.baseSalary?.value?.minValue ?? d.baseSalary?.value ?? null;
    const maxVal = d.baseSalary?.value?.maxValue ?? null;

    return {
      title: d.title ?? "",
      company: d.hiringOrganization?.name ?? "",
      location: d.jobLocation?.address?.addressLocality ?? null,
      description,
      requirements: null,
      niceToHaves: null,
      skills: extractSkills(description),
      experienceLevel: detectExperienceLevel(d.title + " " + description),
      salaryMin: minVal ? Math.round(Number(minVal)) : salary.min,
      salaryMax: maxVal ? Math.round(Number(maxVal)) : salary.max,
      remote: d.jobLocationType === "TELECOMMUTE" || detectRemote(description),
      postedAt: d.datePosted ? new Date(d.datePosted) : null,
      source,
    };
  }

  // Heuristic HTML extraction
  $("script, style, nav, footer, header").remove();
  const pageText = $.text().replace(/\s+/g, " ").trim();

  const title =
    $('h1[class*="title"], h1[class*="job"], [class*="job-title"]').first().text().trim() ||
    $("h1").first().text().trim();

  const company =
    $('[class*="company"], [class*="employer"], [itemprop="name"]').first().text().trim() ||
    $("title").text().split(/[-|at]/i)[1]?.trim() ||
    new URL(url).hostname.replace("www.", "").split(".")[0];

  // If heuristic extraction got a weak result (no title or very short description),
  // fall back to AI extraction
  const contentEl =
    $('[class*="description"], [class*="content"], [id*="description"], main, article').first();
  const description = htmlToText(contentEl.html() ?? $("body").html() ?? "");

  if (!title || description.length < 100) {
    try {
      return await extractWithAi(pageText, url, source);
    } catch (err) {
      console.error("[scraper] AI extraction failed, using heuristic:", err);
    }
  }

  const location =
    $('[class*="location"], [itemprop="addressLocality"]').first().text().trim() ||
    null;

  const salary = extractSalary(description);

  return {
    title,
    company,
    location,
    description: description.slice(0, 8000),
    requirements: null,
    niceToHaves: null,
    skills: extractSkills(description),
    experienceLevel: detectExperienceLevel(title + " " + description),
    salaryMin: salary.min,
    salaryMax: salary.max,
    remote: detectRemote((location ?? "") + " " + description),
    postedAt: null,
    source,
  };
}

// ── Public entrypoint ─────────────────────────────────────────────────────────
export async function scrapeJobPosting(url: string): Promise<ScrapedJob> {
  const normalised = url.trim();

  if (normalised.includes("boards.greenhouse.io") || normalised.includes("greenhouse.io/jobs")) {
    return scrapeGreenhouse(normalised);
  }
  if (normalised.includes("jobs.lever.co")) {
    return scrapeLever(normalised);
  }
  if (normalised.includes("ashbyhq.com")) {
    return scrapeAshby(normalised);
  }

  return scrapeGeneric(
    normalised,
    normalised.includes("linkedin.com")
      ? "linkedin"
      : normalised.includes("indeed.com")
      ? "indeed"
      : normalised.includes("myworkday.com") || normalised.includes("workday.com")
      ? "workday"
      : "manual"
  );
}

export function buildJobFromManual(opts: {
  title: string;
  company: string;
  location?: string;
  description: string;
}): ScrapedJob {
  const description = opts.description;
  const salary = extractSalary(description);
  return {
    title: opts.title,
    company: opts.company,
    location: opts.location ?? null,
    description,
    requirements: null,
    niceToHaves: null,
    skills: extractSkills(description),
    experienceLevel: detectExperienceLevel(opts.title + " " + description),
    salaryMin: salary.min,
    salaryMax: salary.max,
    remote: detectRemote(description),
    postedAt: null,
    source: "manual",
  };
}
