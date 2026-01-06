import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function analyzeWithGemini(text: string, context?: string) {
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });

  const prompt = `
You are a decision-safety assistant.

Analyze the agreement text.
Flag risky clauses.
Explain risks in simple language.
Classify overall risk as LOW, MEDIUM, or HIGH.

Context: ${context ?? "general user"}

Return ONLY valid JSON in this format:
{
  "risk_level": "LOW|MEDIUM|HIGH",
  "risky_clauses": [
    { "clause": "", "reason": "" }
  ],
  "summary": ""
}

Agreement:
"""${text}"""
`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().replace(/```json|```/g, "").trim();

  return JSON.parse(raw);
}
