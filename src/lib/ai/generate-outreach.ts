import { getGeminiClient, MODEL } from "./client";

interface OutreachInput {
  contactName: string;
  contactRole: string | null;
  contactCompany: string | null;
  outreachType: string;
  relationship: string;
  jobTitle: string;
  jobCompany: string;
  jobDescription: string | null;
  candidateName: string;
  candidateSummary: string | null;
  resumeText: string | null;
}

const SYSTEM_PROMPT = `You write ultra-concise networking messages for job outreach.

Structure (3-5 sentences MAXIMUM):
1. One sentence of warm context — how you know each other or why you're reaching out
2. One sentence naming the specific role and highlighting 2-3 ways you meet the core requirements (pull from the resume)
3. One sentence with the ask — a quick coffee chat, referral, or application review depending on the outreach type
4. (Optional) A brief close — one short sentence at most

Adapt tone to the outreach type:
- Warm Intro / Alumni: Casual, reference shared connection
- Cold Outreach / Employee: Slightly more formal but still human, reference something specific about the company or role
- Hiring Manager: Direct and confident, lead with your strongest relevant qualification
- Recruiter: Professional, mention the specific role and your top 2 qualifications

Keep the message under 100 words. Busy people don't read long messages. Be direct and respectful of their time.
Tone: warm but confident — not needy, not arrogant. Natural contractions, no corporate buzzwords, no sycophancy.

Return ONLY the message text. No subject lines, no labels, no JSON, no markdown.`;

export async function generateOutreachMessage(input: OutreachInput): Promise<string> {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  });

  const contactDesc = [input.contactRole, input.contactCompany].filter(Boolean).join(" at ");
  const typeLabel = input.outreachType.replace(/_/g, " ").toLowerCase();

  const askMap: Record<string, string> = {
    WARM_INTRO: `a quick chat about the role or an intro to someone on the team`,
    COLD_OUTREACH: `a brief coffee chat about what it's like working there`,
    ALUMNI: `a quick call to get their perspective on the team and culture`,
    HIRING_MANAGER: `whether they'd be open to a brief conversation about the role`,
    RECRUITER: `next steps or whether they'd like to schedule a call`,
    EMPLOYEE: `a quick chat about their experience on the team`,
  };
  const ask = askMap[input.outreachType] ?? "a quick chat about the role";

  const resumeContext = input.resumeText
    ? `\n\nCandidate's resume (pull 2-3 specific qualifications that match the job requirements):\n${input.resumeText.slice(0, 3000)}`
    : "";

  const jobContext = input.jobDescription
    ? `\n\nJob description (use specifics to tailor the message):\n${input.jobDescription.slice(0, 2000)}`
    : "";

  const prompt = `Write a ${typeLabel} outreach message from ${input.candidateName} to ${input.contactName}${contactDesc ? ` (${contactDesc})` : ""}.

Outreach type: ${typeLabel}
Connection context: ${input.relationship}
Target role: ${input.jobTitle} at ${input.jobCompany}
${input.candidateSummary ? `\nAbout ${input.candidateName}:\n${input.candidateSummary.slice(0, 500)}` : ""}${resumeContext}${jobContext}

Write 3-5 sentences, under 100 words. The ask should be: ${ask}.
Highlight 2-3 specific ways ${input.candidateName} meets the core requirements from their resume.`;

  const result = await model.generateContentStream(prompt);
  let text = "";
  for await (const chunk of result.stream) {
    text += chunk.text();
  }
  return text.trim();
}
