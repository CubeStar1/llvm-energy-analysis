"use client";

import { motion } from "framer-motion";

type SectionHeadingProps = {
  index: string;
  eyebrow: string;
  title: string;
  description?: string;
};

export function SectionHeading({ index, eyebrow, title, description }: SectionHeadingProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="mb-8 space-y-3"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-7 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 font-mono text-[11px] font-semibold text-primary">
          {index}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {eyebrow}
        </span>
      </div>
      <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
        {title}
      </h2>
      {description && (
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground md:text-base">
          {description}
        </p>
      )}
    </motion.div>
  );
}
