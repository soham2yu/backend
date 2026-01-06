import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { OpenAIClient, AzureKeyCredential } from "@azure/openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAIClient(
  process.env.AZURE_OPENAI_ENDPOINT,
  new AzureKeyCredential(process.env.AZURE_OPENAI_KEY)
);

app.post("/analyze", async (req, res) => {
  const { text, context } = req.body;

  if (!text) {
    return res.status(400).json({ error: "No agreement text provided" });
  }

  try {
    const prompt = `
You are a decision-safety assistant.

Task:
Analyze the agreement text below.
Flag risky clauses.
Explain risks in simple language.
Classify overall risk as LOW, MEDIUM, or HIGH.

Context:
User environment = ${context}

Rules:
- Do not give legal advice
- Do not invent facts
- Be cautious and conservative

Agreement:
"""${text}"""

Return JSON in this format:
{
  "risk_level": "",
  "risky_clauses": [
    {
      "clause": "",
      "reason": ""
    }
  ],
  "summary": ""
}
`;

    const response = await client.getChatCompletions(
      process.env.AZURE_OPENAI_DEPLOYMENT,
      [
        { role: "system", content: "You are a careful assistant." },
        { role: "user", content: prompt }
      ]
    );

    const result = response.choices[0].message.content;

    res.json({ result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "AI analysis failed" });
  }
});

app.listen(3001, () => {
  console.log("Backend running on port 3001");
});
