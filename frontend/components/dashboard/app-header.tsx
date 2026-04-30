import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";

type HeaderBadge = {
  icon: LucideIcon;
  label: string;
};

type AppHeaderProps = {
  apiBaseUrl: string;
  badges: HeaderBadge[];
};

export function AppHeader({ apiBaseUrl, badges }: AppHeaderProps) {
  return (
    <header className="panel-sheen rounded-[1.6rem] border border-border/80 bg-card/90 p-5 shadow-xs">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {badges.map(({ icon: Icon, label }) => (
              <Badge
                key={label}
                variant="outline"
                className="gap-1.5 border-primary/15 bg-primary/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-primary"
              >
                <Icon className="size-3.5" />
                {label}
              </Badge>
            ))}
          </div>
          <div className="max-w-3xl space-y-2">
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">
              LLVM Energy Analyzer
            </p>
            <h1 className="font-heading text-3xl leading-none tracking-[-0.04em] text-foreground md:text-5xl">
              Compiler feedback, treated like lab instrumentation.
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              Write C++, inspect LLVM IR, and map energy-oriented remarks back to source lines
              without dragging compiler complexity into the frontend.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-background/80 px-4 py-3 shadow-xs">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            Active API target
          </p>
          <p className="mt-1 font-mono text-sm text-foreground">{apiBaseUrl}</p>
        </div>
      </div>
    </header>
  );
}
