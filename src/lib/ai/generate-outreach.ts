import { getGeminiClient, MODEL } from "./client";

interface OutreachInput {
  contactName: string;
  contactRole: string | null;
  contactCompany: string | null;
  relationship: string;
  jobTitle: string;
  jobCompany: string;
  jobDescription: string | null;
  candidateName: string;
  candidateSummary: string | null;
}

const SYSTEM_PROMPT = `You write ultra-concise networking messages for job referral requests.

Structure (3-5 sentences MAXIMUM):
1. One sentence of warm context — how you know each other, something specific
2. One sentence on what you're currently exploring
3. One sentence naming the specific role and why it excites you
4. One sentence with the ask — a quick chat or an intro to someone on the team
5. (Optional) A brief close — one short sentence at most

Keep the message under 100 words. Busy people don't read long messages. Be direct and respectful of their time.

Tone: casual-professional, natural contractions, no corporate buzzwords, no sycophancy.

Return ONLY the message text. No subject lines, no labels, no JSON, no markdown.`;

export async function generateOutreachMessage(input: OutreachInput): Promise<string> {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  });

  const contactDesc = [input.contactRole, input.contactCompany].filter(Boolean).join(" at ");

  const jobContext = input.jobDescription
    ? `\n\nJob description (use specifics from this to make the message authentic):\n${input.jobDescription.slice(0, 2000)}`
    : "";

  const prompt = `Write a networking outreach message from ${input.candidateName} to ${input.contactName}${contactDesc ? ` (${contactDesc})` : ""}.

Relationship: ${input.relationship}
Target role: ${input.jobTitle} at ${input.jobCompany}
${input.candidateSummary ? `\nAbout ${input.candidateName}:\n${input.candidateSummary.slice(0, 500)}` : ""}${jobContext}

Write 3-5 sentences, under 100 words. Ask ${input.contactName} for a quick chat about the role or an intro to someone on the team.`;

  const result = await model.generateContentStream(prompt);
  let text = "";
  for await (const chunk of result.stream) {
    text += chunk.text();
  }
  return text.trim();
}
