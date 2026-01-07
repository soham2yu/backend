import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Load env vars
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

// ---------------- APP ----------------
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

// ---------------- RULE-BASED ENGINE ----------------
function ruleBasedAnalysis(text, environment) {
  const t = text.toLowerCase();
  const risks = [];

  if (t.includes("terminate without notice") || t.includes("termination without notice")) {
    risks.push("The agreement allows termination without prior notice.");
  }

  if (t.includes("third party") && t.includes("data")) {
    risks.push("User data may be shared with third parties without clear limitations.");
  }

  if (t.match(/immediately|within \d+ days|as soon as possible/)) {
    risks.push("Urgency language may pressure the user into agreement.");
  }

  let riskLevel = "Low";
  if (risks.length >= 2) riskLevel = "High";
  else if (risks.length === 1) riskLevel = "Medium";

  // Environment amplification
  if (environment === "Overwhelmed" && riskLevel === "Medium") {
    riskLevel = "High";
  }

  const warning =
    riskLevel === "High"
      ? "Do NOT sign or agree without legal consultation. The detected risks are significant."
      : riskLevel === "Medium"
      ? "Proceed with caution. Clarify the highlighted terms before agreeing."
      : "No major risks detected, but always read carefully before signing.";

  return { riskLevel, risks, warning };
}

// ---------------- HEALTH ----------------
app.get("/health", (_req, res) => {
  res.json({ status: "ok", aiMode: AI_MODE });
});

// ---------------- GEMINI ----------------
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
    throw new Error(await res.text());
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text;
}

// ---------------- ANALYZE ----------------
app.post("/analyze", async (req, res) => {
  const { text, environment } = req.body;

  if (!text || typeof text !== "string" || text.length < 50) {
    return res.status(400).json({
      error: "Text must be at least 50 characters",
    });
  }

  // Always run rule engine
  const ruleResult = ruleBasedAnalysis(text, environment);

  // MOCK MODE → rule engine only (deterministic)
  if (AI_MODE === "mock") {
    return res.json(ruleResult);
  }

  // GEMINI MODE → enrich but never override rules
  try {
    const prompt = `
Respond ONLY with valid JSON.

Analyze the agreement.
Identify subtle risks or manipulative language.

Return JSON:
{
  "additional_risks": [],
  "summary": ""
}

Agreement:
"""${text}"""
`;

    const raw = await callGemini(prompt);
    const cleaned = raw.replace(/```json|```/g, "");
    const parsed = JSON.parse(cleaned);

    return res.json({
      riskLevel: ruleResult.riskLevel,
      risks: [...ruleResult.risks, ...(parsed.additional_risks || [])],
      warning: parsed.summary || ruleResult.warning,
    });
  } catch (err) {
    console.error("AI FAILED, USING RULE ENGINE:", err.message);
    return res.json(ruleResult);
  }
});

// ---------------- SERVER ----------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
