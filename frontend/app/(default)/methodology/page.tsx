import { MethodologyHero } from "@/components/methodology/methodology-hero"
import { MethodologySteps } from "@/components/methodology/methodology-steps"
import { ArchitectureFlow } from "@/components/methodology/architecture-flow"

export default function MethodologyPage() {
  return (
    <div className="flex flex-col h-full overflow-y-auto min-h-0 bg-background">
      <MethodologyHero />
      <MethodologySteps />
      <ArchitectureFlow />
    </div>
  )
}
