"use client";

import { Play, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ModeToggle } from "@/components/global/theme-switcher";

type DashboardToolbarProps = {
  std: string;
  compilerFlags: string;
  isBusy: boolean;
  onStdChange: (value: string) => void;
  onCompilerFlagsChange: (value: string) => void;
  onRunAnalysis: () => void;
};

export function DashboardToolbar({
  std,
  compilerFlags,
  isBusy,
  onStdChange,
  onCompilerFlagsChange,
  onRunAnalysis,
}: DashboardToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border bg-card p-3 shadow-sm shrink-0">
      <div className="flex items-center gap-3 w-full sm:w-auto">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-6" />
        
        <label className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground whitespace-nowrap">
            Std
          </span>
          <Input 
            value={std} 
            onChange={(e) => onStdChange(e.target.value)} 
            className="w-24 h-8 text-sm"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground whitespace-nowrap">
            Flags
          </span>
          <Input 
            value={compilerFlags} 
            onChange={(e) => onCompilerFlagsChange(e.target.value)}
            className="w-40 h-8 text-sm"
          />
        </label>
      </div>
      
      <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
        <ModeToggle />
        <Button
          onClick={onRunAnalysis}
          disabled={isBusy}
          size="sm"
          className="w-full sm:w-auto gap-2"
        >
          {isBusy ? <RefreshCcw className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          Run Analysis
        </Button>
      </div>
    </div>
  );
}
