import { ScrollArea } from "@/components/ui/scroll-area";

type LlvmIrPanelProps = {
  llvmIr: string;
};

export function LlvmIrPanel({ llvmIr }: LlvmIrPanelProps) {
  return (
    <ScrollArea className="h-[36rem] rounded-[1.4rem] border border-border/70 bg-background/85">
      <pre className="min-w-full p-4 font-mono text-sm leading-6 text-foreground whitespace-pre-wrap">
        {llvmIr || "; Run analysis to inspect LLVM IR."}
      </pre>
    </ScrollArea>
  );
}
