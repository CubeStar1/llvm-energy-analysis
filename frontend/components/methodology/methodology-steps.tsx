import { Database, Layers, GitCommitVertical, ArrowLeftRight, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

const steps = [
  {
    id: "01",
    title: "Explicit Energy Model",
    description: "Costs are kept outside the pass in a versioned JSON artifact. Aliases are used for known opcodes and fallback buckets ensure partial coverage.",
    icon: Database,
  },
  {
    id: "02",
    title: "Scope-Based Aggregation",
    description: "Raw energy is computed per-instruction. Weighted energy is multiplied by block frequency. Data is aggregated at instruction, source-line, basic-block, and function scopes.",
    icon: Layers,
  },
  {
    id: "03",
    title: "Source Attribution",
    description: "Debug locations on machine instructions propagate costs back to source lines, allowing structured scope records to decouple backend evolution from LLVM internals.",
    icon: GitCommitVertical,
  },
  {
    id: "04",
    title: "Backend Normalization",
    description: "Structured energy records from the LLVM pass are parsed and converted into stable API objects for the UI: functions, sourceAnnotations, remarks, and summaries.",
    icon: ArrowLeftRight,
  },
  {
    id: "05",
    title: "Validation Strategy",
    description: "Starts with qualitative validation of loop, branch, and memory behaviors, and progresses toward quantitative calibration against hardware or RAPL traces.",
    icon: CheckCircle2,
  },
]

export function MethodologySteps() {
  return (
    <section className="flex-none px-6 py-12 md:px-10 lg:px-12">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-8 text-2xl font-semibold tracking-tight text-foreground flex items-center gap-3">
          <div className="h-6 w-2 rounded-full bg-primary" />
          Execution Pipeline
        </h2>

        <div className="relative border-l border-border/40 ml-4 pl-8 md:ml-6 md:pl-10 space-y-10">
          {steps.map((step, index) => (
            <div 
              key={step.id} 
              className="relative group animate-in fade-in slide-in-from-left-4 duration-500 fill-mode-both"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="absolute -left-[41px] md:-left-[49px] flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background shadow-sm transition-colors group-hover:border-primary group-hover:text-primary">
                <span className="font-mono text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors">{step.id}</span>
              </div>
              
              <div className="rounded-xl border border-border/40 bg-card p-5 shadow-sm transition-all hover:border-border hover:shadow-md">
                <div className="flex items-start gap-4">
                  <div className="mt-1 rounded-md bg-primary/10 p-2 text-primary">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-lg font-medium text-foreground">
                      {step.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
