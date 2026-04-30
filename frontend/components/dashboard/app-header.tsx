import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";

type HeaderBadge = {
  icon: LucideIcon;
  label: string;
};

type AppHeaderProps = {
};

export function AppHeader() {
  return (
    <header className="rounded-xl border bg-card text-card-foreground p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <div className="max-w-3xl space-y-2">
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Static Energy Estimation
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
              LLVM machine-level analysis pass that estimates per-function energy cost
              by combining per-instruction energy models with loop and block frequency analysis.
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
