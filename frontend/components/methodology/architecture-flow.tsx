import { Code2, Cpu, FileJson, LayoutDashboard, ArrowRight } from "lucide-react"

const architectureNodes = [
  {
    step: "01",
    title: "Source Input",
    description: "C++ Code",
    icon: Code2,
  },
  {
    step: "02",
    title: "LLVM Pass",
    description: "MIR + Freq",
    icon: Cpu,
  },
  {
    step: "03",
    title: "Backend API",
    description: "Normalization",
    icon: FileJson,
  },
  {
    step: "04",
    title: "Dashboard UI",
    description: "Next.js Render",
    icon: LayoutDashboard,
  }
]

export function ArchitectureFlow() {
  return (
    <section className="flex-none border-t border-border/40 bg-muted/5 p-6 md:p-10 lg:p-12 pb-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-8 text-2xl font-semibold tracking-tight text-foreground flex items-center gap-3">
          <div className="h-6 w-2 rounded-full bg-chart-4" />
          System Architecture
        </h2>

        <div className="flex flex-col items-center justify-between gap-2 md:flex-row md:gap-4 lg:gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300 fill-mode-both">
          {architectureNodes.map((node, index) => (
            <div key={index} className="flex flex-col items-center md:flex-row md:gap-4 lg:gap-6 w-full">
              <div className="group relative w-full flex-1 overflow-hidden rounded-xl border border-border/40 bg-card shadow-sm transition-all hover:border-border hover:shadow-md">
                <div className="flex items-center justify-between border-b border-border/40 bg-muted/20 px-3 py-2">
                  <span className="font-mono text-xs font-medium text-muted-foreground">NODE {node.step}</span>
                  <node.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="p-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    {node.title}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {node.description}
                  </p>
                </div>
              </div>
              
              {index < architectureNodes.length - 1 && (
                <div className="py-2 md:py-0 text-muted-foreground/30 animate-pulse">
                  <ArrowRight className="h-5 w-5 rotate-90 md:rotate-0" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
