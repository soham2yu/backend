import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Load environment variables FIRST
dotenv.config();

// ---------------- CONFIG ----------------
const AI_MODE = process.env.AI_MODE || "mock";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent";

console.log("AI MODE:", AI_MODE);

if (AI_MODE === "gemini" && !GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY missing while AI_MODE=gemini");
}

// ---------------- APP SETUP ----------------
const app = express();
app.use(cors());
app.use(express.json());

// ---------------- UTILS ----------------
function normalizeRiskLevel(level) {
  if (!level) return "Low";
  const v = level.toLowerCase();
  if (v === "high") return "High";
  if (v === "medium") return "Medium";
  return "Low";
}

// ---------------- HEALTH CHECK ----------------
app.get("/health", (_req, res) => {
  res.json({ status: "ok", aiMode: AI_MODE });
});

// ---------------- GEMINI CALL ----------------
async function callGemini(prompt) {
  const res = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text;
}

// ---------------- MOCK ANALYSIS (DEMO SAFE) ----------------
function mockAnalysis() {
  return {
    riskLevel: "High",
    risks: [
      "The agreement allows termination without prior notice.",
      "User data may be shared with third parties without clear limitations.",
    ],
    warning:
      "This agreement strongly favors the company and poses significant risk to the user.",
  };
}

// ---------------- ANALYZE ROUTE ----------------
app.post("/analyze", async (req, res) => {
  const { text, environment } = req.body;

  if (!text || typeof text !== "string" || text.length < 50) {
    return res.status(400).json({
      error: "Text must be a string with at least 50 characters",
    });
  }

  // DEMO MODE: Always return mock
  if (AI_MODE === "mock") {
    return res.json(mockAnalysis());
  }

  const prompt = `
Respond ONLY with valid JSON. No markdown.

Analyze the agreement.
Identify risky clauses.
Explain risks clearly.
Classify overall risk.

Return JSON:
{
  "risk_level": "LOW | MEDIUM | HIGH",
  "risky_clauses": [{ "clause": "", "reason": "" }],
  "summary": ""
}

Context: ${environment || "general user"}
Agreement:
"""${text}"""
`;

  try {
    const raw = await callGemini(prompt);

    const cleaned = raw
      .replace(/```json|```/g, "")
      .replace(/^[^{]*({[\\s\\S]*})[^}]*$/, "$1");

    const parsed = JSON.parse(cleaned);

    return res.json({
      riskLevel: normalizeRiskLevel(parsed.risk_level),
      risks: parsed.risky_clauses.map((c) => c.reason),
      warning: parsed.summary,
    });
  } catch (err) {
    console.error("AI ERROR, FALLING BACK TO MOCK:", err.message);
    return res.json(mockAnalysis());
  }
});

// ---------------- SERVER ----------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
