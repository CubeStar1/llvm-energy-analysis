import { basicLoop } from "./basic-loop";
import { nestedLoops } from "./nested-loops";
import { recursiveFibonacci } from "./recursive-fibonacci";
import { matrixMultiply } from "./matrix-multiply";
import { quicksort } from "./quicksort";
import { multiStagePipeline } from "./multi-stage-pipeline";

export type { SampleProgram, SampleTier } from "./types";

export const SAMPLE_PROGRAMS = [
  basicLoop,
  nestedLoops,
  recursiveFibonacci,
  matrixMultiply,
  quicksort,
  multiStagePipeline,
].sort((a, b) => a.complexity - b.complexity);
