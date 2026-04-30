export type AnalyzeRequest = {
  code: string;
  filename: string;
  std: string;
  compilerFlags: string[];
};

export type Summary = {
  totalRawEnergy: number;
  totalWeightedEnergy: number;
  hottestFunction: string | null;
  hottestLine: number | null;
};

export type FunctionSummary = {
  name: string;
  weightedEnergy: number;
  rawEnergy: number;
  blockCount: number;
  instructionCount: number;
  mappedInstructionCount: number;
  fallbackInstructionCount: number;
};

export type SourceAnnotation = {
  file: string;
  line: number;
  column: number;
  rawEnergy: number;
  weightedEnergy: number;
  instructionCount: number;
  topOpcodes: string[];
};

export type Remark = {
  kind: string;
  pass: string;
  function: string;
  message: string;
  file: string | null;
  line: number | null;
  column: number | null;
  metadata: Record<string, unknown>;
};

export type AnalyzeResponse = {
  runId: string;
  llvmIr: string;
  summary: Summary;
  functions: FunctionSummary[];
  sourceAnnotations: SourceAnnotation[];
  remarks: Remark[];
};
