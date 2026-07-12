"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Cpu, FlaskConical, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATS = [
  { value: "3", label: "toolchain stages" },
  { value: "7", label: "cost buckets" },
  { value: "3", label: "scopes: fn · block · line" },
  { value: "0", label: "program executions" },
];

export function MethodologyHero() {
  return (
    <section className="relative overflow-hidden border-b border-border/40">
      {/* Subtle backdrop: dot grid + a primary glow behind the title. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: "color-mix(in oklch, var(--primary) 14%, transparent)" }}
      />

      <div className="relative mx-auto max-w-6xl px-6 py-12 md:px-10 md:py-16">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="flex items-center gap-2"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
            <FlaskConical className="size-3" />
            Methodology
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <Cpu className="size-3" />
            LLVM 18 · MachineFunctionPass
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
          className="mt-6 max-w-3xl text-3xl font-bold leading-[1.15] tracking-tight text-foreground md:text-5xl"
        >
          How source code becomes an{" "}
          <span className="text-primary">energy heatmap</span> — without ever
          running it
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
          className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg"
        >
          A custom LLVM machine pass walks the instructions your CPU{" "}
          <em>would</em> execute, prices each one from an explicit cost model,
          weights it by how often its basic block runs, and projects the result
          back onto your source. This page walks the whole pipeline, stage by
          stage, with a real program.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
          className="mt-7 flex flex-wrap items-center gap-3"
        >
          <Button asChild className="gap-2">
            <Link href="/analyze">
              <Zap className="size-4" />
              Open the Analyzer
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <a href="#pipeline">
              Explore the pipeline
              <ArrowRight className="size-4" />
            </a>
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4, ease: "easeOut" }}
          className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4"
        >
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-border/50 bg-card/60 px-4 py-3"
            >
              <p className="font-mono text-2xl font-semibold tracking-tight text-foreground">
                {stat.value}
              </p>
              <p className="mt-0.5 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                {stat.label}
              </p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
