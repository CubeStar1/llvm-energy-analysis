'use client'

import { cn } from '@/lib/utils'
import { motion, useMotionTemplate, useMotionValue } from 'framer-motion'
import {
  Database,
  FileSearch,
  FolderSync,
  Sparkles,
  Layers,
  Zap,
  BookOpen,
  WifiOff,
} from 'lucide-react'
import React, { MouseEvent } from 'react'
import { BackgroundGrid } from './background-grid'
import { Gutter } from './gutter'

interface FeatureCard {
  title: string
  description: string
  icon: React.ReactNode
}

const features: FeatureCard[] = [
  {
    title: 'Instruction Cost Buckets',
    description: 'Classifies Machine IR into ALU, compare, branch, load, store, FP/vector, and call buckets.',
    icon: <Database className="h-6 w-6" />,
  },
  {
    title: 'Per-Target Energy Models',
    description: 'Swappable JSON cost tables for x86-64 and AArch64 — bring your own model.',
    icon: <Layers className="h-6 w-6" />,
  },
  {
    title: 'Source-Annotated Hotspots',
    description: 'Machine-level energy costs mapped back to the exact source line that produced them.',
    icon: <FileSearch className="h-6 w-6" />,
  },
  {
    title: 'Loop-Depth Weighting',
    description: 'Static loop depth weighting (1x / 10x / 100x) to surface genuinely hot functions.',
    icon: <Sparkles className="h-6 w-6" />,
  },
  {
    title: 'Function & Block Breakdown',
    description: 'Drill from whole-program summaries down to per-block and per-function detail.',
    icon: <FolderSync className="h-6 w-6" />,
  },
  {
    title: 'Optimization Remarks',
    description: "Parses LLVM's optimization-remarks YAML alongside energy results for full context.",
    icon: <Zap className="h-6 w-6" />,
  },
  {
    title: 'Standalone HTML Reports',
    description: 'Generate a shareable, self-contained HTML report from any analysis run.',
    icon: <BookOpen className="h-6 w-6" />,
  },
  {
    title: 'Local-First Dashboard',
    description: 'Runs entirely on your machine — clang++, llc, and the pass, no cloud dependency.',
    icon: <WifiOff className="h-6 w-6" />,
  },
]

function SpotlightCard({ feature, index }: { feature: FeatureCard; index: number }) {
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  function handleMouseMove({ currentTarget, clientX, clientY }: MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect()
    mouseX.set(clientX - left)
    mouseY.set(clientY - top)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="group relative backdrop-blur-xl bg-white/5 overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      <motion.div
        className="pointer-events-none absolute -inset-px opacity-0 transition duration-300 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              650px circle at ${mouseX}px ${mouseY}px,
              rgba(255,255,255,0.1),
              transparent 80%
            )
          `,
        }}
      />
      <div className="relative flex h-full flex-col p-8">
        <div className="mb-6 inline-flex w-fit rounded-none bg-white/5 p-3 ring-1 ring-white/10 text-neutral-200">
          {feature.icon}
        </div>
        <h3 className="mb-3 text-xl font-semibold text-white">{feature.title}</h3>
        <p className="text-neutral-400 leading-relaxed">{feature.description}</p>
      </div>
    </motion.div>
  )
}

export function FeatureCards() {
  return (
    <section className="relative z-[1] bg-transparent py-24   md:py-32">
      <BackgroundGrid zIndex={0} />

      <Gutter>
        <motion.div
          className="mb-16 max-w-2xl"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-white md:text-4xl lg:text-5xl">
            Powerful features
          </h2>
          <p className="text-lg text-neutral-400">
            Everything you need to estimate and reason about a function&apos;s static energy cost.
          </p>
        </motion.div>

        <div className="border border-white/10">
          {/* Mobile: single column with horizontal dividers */}
          <div className="grid grid-cols-1 divide-y divide-white/10 md:hidden">
            {features.map((feature, index) => (
              <SpotlightCard key={index} feature={feature} index={index} />
            ))}
          </div>
          {/* Tablet/Desktop: 2-4 columns with vertical dividers */}
          <div className="hidden md:block">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 md:divide-x divide-white/10">
              {features.slice(0, 4).map((feature, index) => (
                <SpotlightCard key={index} feature={feature} index={index} />
              ))}
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 md:divide-x divide-white/10 border-t border-white/10">
              {features.slice(4, 8).map((feature, index) => (
                <SpotlightCard key={index + 4} feature={feature} index={index + 4} />
              ))}
            </div>
          </div>
        </div>
      </Gutter>
    </section>
  )
}
