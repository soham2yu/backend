import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ---------- Gemini setup ----------
if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is missing in .env");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "models/gemini-1.0-pro" });




// ---------- Helper: AI analysis ----------
async function analyzeWithGemini(text, context) {
const prompt = `
Respond ONLY with valid JSON. No explanations. No markdown.

You are a decision-safety assistant.

Task:
Analyze the agreement text below.
Flag risky clauses.
Explain risks in simple language.
Classify overall risk as LOW, MEDIUM, or HIGH.

Context:
User environment = ${context || "general user"}

Rules:
- Do not give legal advice
- Do not invent facts
- Be cautious and conservative

Return JSON in this exact format:
{
  "risk_level": "LOW|MEDIUM|HIGH",
  "risky_clauses": [
    {
      "clause": "",
      "reason": ""
    }
  ],
  "summary": ""
}

Agreement:
"""${text}"""
`;


  const result = await model.generateContent(prompt);
let raw = result.response.text();

raw = raw
  .replace(/```json|```/g, "")
  .replace(/^[^{]*({[\s\S]*})[^}]*$/, "$1")
  .trim();

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (e) {
  console.error("RAW GEMINI OUTPUT:\n", raw);
  throw new Error("Gemini returned invalid JSON");
}

return parsed;


}

// ---------- Route ----------
app.post("/analyze", async (req, res) => {
  const { text, context } = req.body;

  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "No agreement text provided" });
  }

  try {
    const parsed = await analyzeWithGemini(text, context);

    // Map to frontend-safe structure
    const mapped = {
      riskLevel: parsed.risk_level.toLowerCase(),
      clauses: parsed.risky_clauses.map((c) => ({
        text: c.clause,
        explanation: c.reason,
        severity: parsed.risk_level.toLowerCase()
      })),
      summary: parsed.summary
    };

    res.json(mapped);
  } catch (error) {
    console.error("AI error:", error);
    res.status(500).json({ error: "AI analysis failed" });
  }
});

// ---------- Server ----------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
