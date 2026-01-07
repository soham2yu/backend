import express from "express";
import cors from "cors";
import dotenv from "dotenv";


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent";

async function callGemini(prompt) {
  const res = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text;
}

function mockAnalysis(text) {
  return {
    riskLevel: "high",
    clauses: [
      {
        text: "Termination without notice",
        explanation:
          "The company can end the agreement anytime without warning.",
        severity: "high"
      },
      {
        text: "Data sharing with third parties",
        explanation:
          "Your personal data may be shared with others without clear limits.",
        severity: "high"
      }
    ],
    summary:
      "This agreement gives the company strong control and weak protection to the user."
  };
}

app.post("/analyze", async (req, res) => {
  const { text, context } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Text is required" });
  }

  const prompt = `
Respond ONLY with valid JSON.

Analyze the agreement.
Flag risky clauses.
Explain risks simply.
Classify overall risk.

Return JSON:
{
  "risk_level": "LOW|MEDIUM|HIGH",
  "risky_clauses": [{ "clause": "", "reason": "" }],
  "summary": ""
}

Context: ${context || "general user"}
Agreement:
"""${text}"""
`;

  try {
    const raw = await callGemini(prompt);

    const cleaned = raw
      .replace(/```json|```/g, "")
      .replace(/^[^{]*({[\s\S]*})[^}]*$/, "$1");

    const parsed = JSON.parse(cleaned);

    return res.json({
      riskLevel: parsed.risk_level.toLowerCase(),
      clauses: parsed.risky_clauses.map((c) => ({
        text: c.clause,
        explanation: c.reason,
        severity: parsed.risk_level.toLowerCase()
      })),
      summary: parsed.summary
    });
  } catch (err) {
    console.error("GEMINI FAILED, USING MOCK:", err.message);
    return res.json(mockAnalysis(text));
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>
  console.log(`Backend running on http://localhost:${PORT}`)
);
