import { Metadata } from 'next'
import { Header } from '@/components/global/header'
import { headerConfig } from '@/lib/config/header'
import { Footer } from '@/components/revamp/footer'

export const metadata: Metadata = {
  title: 'LLVM Energy Analyzer',
  description:
    'An out-of-tree LLVM MachineFunctionPass that estimates relative per-function energy cost from machine instructions, exposed through a FastAPI backend and a Next.js dashboard for function-, block-, and source-level hotspot analysis.',
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark bg-black text-white" data-theme="dark">
      <Header config={headerConfig} />
      {children}
      <Footer />
    </div>
  )
}
