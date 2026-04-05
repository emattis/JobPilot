import { getGeminiClient, MODEL } from "./client";

interface OutreachInput {
  contactName: string;
  contactRole: string | null;
  contactCompany: string | null;
  relationship: string;
  jobTitle: string;
  jobCompany: string;
  candidateName: string;
  candidateSummary: string | null;
}

const SYSTEM_PROMPT = `You are a career coach who writes warm, natural outreach messages for job referral requests.
Write messages that are:
- Concise (3-4 short paragraphs, under 200 words)
- Personal — reference the specific relationship and shared context
- Specific about the target role and company
- Clear in the ask (referral or introduction, not just "thoughts")
- Not overly formal or sycophantic
- Closing with a low-pressure way to respond

Return ONLY the message text. No subject lines, no labels, no JSON.`;

export async function generateOutreachMessage(input: OutreachInput): Promise<string> {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
  });

  const contactDesc = [input.contactRole, input.contactCompany].filter(Boolean).join(" at ");
  const prompt = `Write a warm outreach message from ${input.candidateName} to ${input.contactName}${contactDesc ? ` (${contactDesc})` : ""}.

Relationship: ${input.relationship}
Target role: ${input.jobTitle} at ${input.jobCompany}
${input.candidateSummary ? `Candidate background: ${input.candidateSummary.slice(0, 300)}` : ""}

The goal is to ask ${input.contactName} for a referral or internal introduction for the ${input.jobTitle} position at ${input.jobCompany}.`;

  const result = await model.generateContentStream(prompt);
  let text = "";
  for await (const chunk of result.stream) {
    text += chunk.text();
  }
  return text.trim();
}
