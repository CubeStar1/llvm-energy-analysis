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

export type BlockInstruction = {
  opcode: string;
  bucket: string;
  cost: number;
  line: number;
};

export type CfgBlock = {
  id: number;
  name: string;
  rawEnergy: number;
  weightedEnergy: number;
  frequencyWeight: number;
  loopDepth: number;
  isLoopHeader: boolean;
  isEntry: boolean;
  instructionCount: number;
  mappedInstructionCount: number;
  fallbackInstructionCount: number;
  line: number;
  endLine: number;
  topOpcodes: string[];
  instructions: BlockInstruction[];
  instructionsTruncated: boolean;
};

export type CfgEdge = {
  source: number;
  target: number;
  isBackEdge: boolean;
};

export type CfgFunction = {
  function: string;
  weightedEnergy: number;
  blocks: CfgBlock[];
  edges: CfgEdge[];
};

export type AstNode = {
  id: string;
  kind: string;
  label: string;
  detail: string;
  line: number;
  column: number;
  endLine: number;
  selfEnergy: number;
  subtreeEnergy: number;
  truncated: boolean;
  children: AstNode[];
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
  cfg: CfgFunction[];
  ast: AstNode | null;
};
