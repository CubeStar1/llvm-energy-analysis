import type { AnalyzeRequest, AnalyzeResponse } from "@/lib/types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_ANALYZER_API_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

export async function analyzeCode(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
  const response = await fetch(`${API_BASE_URL}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let detail = "The analyzer request failed.";

    try {
      const errorPayload = (await response.json()) as { detail?: string };
      if (errorPayload.detail) {
        detail = errorPayload.detail;
      }
    } catch {
      detail = response.statusText || detail;
    }

    throw new Error(detail);
  }

  return (await response.json()) as AnalyzeResponse;
}
