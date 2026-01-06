export interface AIProvider {
  analyze(text: string): Promise<{
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    risks: string[];
    summary: string;
  }>;
}
