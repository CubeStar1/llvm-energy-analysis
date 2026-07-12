import type { Metadata } from "next";
import { MethodologyHero } from "@/components/methodology/methodology-hero";
import { PipelineFlow } from "@/components/methodology/pipeline-flow";
import { PassInternals } from "@/components/methodology/pass-internals";
import { Walkthrough } from "@/components/methodology/walkthrough";
import { EnergyModelSection } from "@/components/methodology/energy-model-section";
import { FrequencySection } from "@/components/methodology/frequency-section";
import { OutputSection } from "@/components/methodology/output-section";
import { LimitationsSection } from "@/components/methodology/limitations-section";
import { SectionHeading } from "@/components/methodology/section-heading";

export const metadata: Metadata = {
  title: "Methodology · LLVM Static Energy Estimation",
  description:
    "How a custom LLVM MachineFunctionPass turns C/C++ source into a static energy estimate: clang, llc, Machine IR, instruction classification, and frequency weighting.",
};

export default function MethodologyPage() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background">
      <MethodologyHero />

      <div className="mx-auto w-full max-w-6xl space-y-20 px-6 py-14 md:px-10 md:py-16">
        <section id="pipeline" className="scroll-mt-8">
          <SectionHeading
            index="01"
            eyebrow="The pipeline"
            title="From C++ to machine instructions to energy"
            description="Three toolchain invocations and one custom LLVM pass. Click any node — or use Next stage — to walk the data flow: clang lowers source to LLVM IR, llc selects real machine instructions, and the energy pass reads them without ever running the program."
          />
          <PipelineFlow />
        </section>

        <section id="inside-the-pass" className="scroll-mt-8">
          <SectionHeading
            index="02"
            eyebrow="Inside the pass"
            title="What runOnMachineFunction actually does"
            description="The complete algorithm of EnergyAnalysisPass, step by step: which LLVM analyses it pulls in, how it walks blocks and instructions, what gets skipped, what gets priced, and where every number is accumulated. Click a node in the flowchart or a step on the right."
          />
          <PassInternals />
        </section>

        <section id="walkthrough" className="scroll-mt-8">
          <SectionHeading
            index="03"
            eyebrow="Worked example"
            title="Follow one hot line through the pipeline"
            description="The loop-hotspot testcase, compiled at -O0. Watch line 4 get lowered to machine instructions, priced, weighted by the loop, and painted back onto the source. Numbers follow the real model arithmetic."
          />
          <Walkthrough />
        </section>

        <section id="energy-model" className="scroll-mt-8">
          <SectionHeading
            index="04"
            eyebrow="Energy model"
            title="Pricing an instruction"
            description="Every machine instruction lands in one of seven buckets. Exact opcode aliases give precision; LLVM's instruction predicates catch the rest — so the pass stays small and the numbers stay in versioned JSON."
          />
          <EnergyModelSection />
        </section>

        <section id="weighting" className="scroll-mt-8">
          <SectionHeading
            index="05"
            eyebrow="Frequency weighting"
            title="Why loops dominate the estimate"
            description="Static MIR holds one copy of a loop body, so raw cost alone would rank a million-iteration loop next to straight-line code. This is the full story of the frequency weight — the most important number in the whole analysis."
          />
          <FrequencySection />
        </section>
      </div>
    </div>
  );
}
