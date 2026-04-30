import { Terminal } from "lucide-react"

export function MethodologyHero() {
  return (
    <section className="flex-none border-b border-border/40 bg-muted/10 p-6 md:p-10 lg:p-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Terminal className="h-4 w-4" />
          <span>System Architecture</span>
          <span className="text-border/50">•</span>
          <span className="text-primary">v1.0.0</span>
        </div>
        
        <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-5xl">
          Energy Model Methodology
        </h1>
        
        <p className="max-w-[700px] text-base leading-relaxed text-muted-foreground md:text-lg">
          Moving the analyzer from a single-pass heuristic into a comprehensive scoped static analysis pipeline. This approach attributes energy per instruction and surfaces source-line hotspots directly in the editor.
        </p>
      </div>
    </section>
  )
}
