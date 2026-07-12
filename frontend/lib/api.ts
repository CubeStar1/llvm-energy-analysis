import type { AnalyzeRequest, AnalyzeResponse, EnergyModel } from "@/lib/types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_ANALYZER_API_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

/** The cost table the LLVM pass is actually running with. */
export async function fetchEnergyModel(): Promise<EnergyModel> {
  const response = await fetch(`${API_BASE_URL}/model`);

  if (!response.ok) {
    throw new Error("Could not load the energy model.");
  }

  return (await response.json()) as EnergyModel;
}

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
