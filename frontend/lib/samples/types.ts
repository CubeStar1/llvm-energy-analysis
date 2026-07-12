export type SampleTier = "Basic" | "Intermediate" | "Advanced";

export interface SampleProgram {
  id: string;
  label: string;
  description: string;
  tier: SampleTier;
  complexity: number;
  code: string;
}
