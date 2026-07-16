import { useEffect, useState, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Coins,
  Cpu,
  Gauge,
  Gift,
  Globe2,
  Layers3,
  LockKeyhole,
  Network,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Wallet,
  Zap,
} from 'lucide-react'

const chapters = [
  { id: 'vision', number: '01', label: 'The vision' },
  { id: 'reward-loop', number: '02', label: 'Proof of use' },
  { id: 'billion-mission', number: '03', label: 'The billion mission' },
  { id: 'token-design', number: '04', label: 'Token design' },
  { id: 'architecture', number: '05', label: 'Infrastructure' },
  { id: 'roadmap', number: '06', label: 'Roadmap' },
  { id: 'trust', number: '07', label: 'Trust and risk' },
]

const launchMilestones = [
  { value: '1M', label: 'First signal' },
  { value: '10M', label: 'Growing network' },
  { value: '100M', label: 'Creator economy' },
  { value: '500M', label: 'Launch readiness' },
  { value: '1B', label: 'Community trigger' },
]

const roadmap = [
  {
    phase: 'Live',
    title: 'Useful before tokenization',
    copy: 'Spyda solves the design problem first: reference analysis, focused edits, reconstruction, QA, projects, wallet funding, and BYOK workflows.',
  },
  {
    phase: 'Ledger',
    title: 'Verifiable proof of use',
    copy: 'Eligible credit consumption is recorded in an auditable reward ledger. Each user can see the activity that produces their pre-launch SPYDA balance.',
  },
  {
    phase: 'Scale',
    title: 'One billion earned together',
    copy: 'The community works toward 1 billion cumulative, user-earned SPYDA allocations while security, utility, legal, and network infrastructure mature.',
  },
  {
    phase: 'Launch',
    title: 'The Spyda economy goes on-chain',
    copy: 'After the community trigger and readiness gates are satisfied, eligible recorded balances become claimable under the published launch terms.',
  },
]

const utilityItems = [
  ['Create', 'Use SPYDA for eligible design intelligence, generation, QA, and premium creative tools.'],
  ['Participate', 'Unlock ecosystem access, creator programs, challenges, and contribution rewards.'],
  ['Exchange', 'Support future marketplace settlement between creators, brands, and design-service providers.'],
  ['Govern', 'Participate in bounded product and ecosystem decisions when decentralized governance is useful.'],
]

function SpydaTokenIcon({ className = '' }: { className?: string }) {
  return <img src="/assets/spyda-credit.png" alt="" aria-hidden="true" className={`shrink-0 object-contain ${className}`} />
}

function WhitepaperChapter({
  id,
  number,
  eyebrow,
  title,
  children,
}: {
  id: string
  number: string
  eyebrow: string
  title: string
  children: ReactNode
}) {
  return (
    <section id={id} data-whitepaper-chapter className="scroll-mt-28 border-t border-white/[0.08] py-12 sm:py-16">
      <div className="grid gap-8 lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-12">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Mission {number}</p>
          <p className="mt-2 text-sm text-muted-foreground">{eyebrow}</p>
        </div>
        <div className="min-w-0">
          <h2 className="max-w-3xl font-heading text-2xl font-semibold leading-tight sm:text-4xl">{title}</h2>
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </section>
  )
}

export function WhitepaperView() {
  const [activeChapter, setActiveChapter] = useState(0)
  const [creditSpend, setCreditSpend] = useState('1000')
  const normalizedCredits = Math.max(0, Math.min(1_000_000_000, Number(creditSpend) || 0))
  const earnedSpyda = normalizedCredits / 1000
  const readingProgress = ((activeChapter + 1) / chapters.length) * 100

  useEffect(() => {
    const sections = chapters
      .map(chapter => document.getElementById(chapter.id))
      .filter((section): section is HTMLElement => Boolean(section))
    if (!sections.length || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (!visible) return
      const index = chapters.findIndex(chapter => chapter.id === visible.target.id)
      if (index >= 0) setActiveChapter(index)
    }, { rootMargin: '-20% 0px -55% 0px', threshold: [0.1, 0.35, 0.6] })

    sections.forEach(section => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  const goToChapter = (index: number) => {
    setActiveChapter(index)
    document.getElementById(chapters[index].id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <article className="min-h-full bg-[#080a0a] text-foreground">
      <div className="sticky top-0 z-20 border-b border-white/[0.08] bg-[#080a0a]/95 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1240px] items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="hidden items-center gap-2 text-xs font-semibold sm:flex"><BookOpen className="h-4 w-4 text-primary" /> Whitepaper journey</div>
          <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-w-max items-center gap-1">
              {chapters.map((chapter, index) => (
                <button key={chapter.id} type="button" onClick={() => goToChapter(index)} className={`h-8 rounded-md px-3 text-[10px] font-semibold uppercase transition-colors ${activeChapter === index ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-white/[0.05] hover:text-foreground'}`}>
                  {chapter.number} {chapter.label}
                </button>
              ))}
            </div>
          </div>
          <span className="shrink-0 text-[10px] font-semibold text-primary">{Math.round(readingProgress)}%</span>
        </div>
        <div className="h-0.5 bg-white/[0.05]"><div className="h-full bg-[linear-gradient(90deg,#9dfab0,#88a8ff,#ff8f5c)] transition-[width] duration-500" style={{ width: `${readingProgress}%` }} /></div>
      </div>

      <div className="mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8">
        <header className="relative overflow-hidden py-14 sm:py-20 lg:py-24">
          <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,#9dfab0,transparent)] opacity-70" />
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.12fr)_minmax(330px,.72fr)]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-md border border-primary/20 bg-primary/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary"><Sparkles className="h-3.5 w-3.5" /> Spyda Economy Whitepaper / Version 2.0</div>
              <h1 className="mt-7 max-w-4xl font-heading text-4xl font-semibold leading-[1.03] sm:text-6xl lg:text-[70px]">Design should build your future, not only drain your budget.</h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">Spyda helps people create premium design work faster, then turns eligible product usage into participation in the economy they are helping to build.</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => goToChapter(1)} className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5">Explore the reward loop <ArrowDown className="h-4 w-4" /></button>
                <div className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.025] px-4 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" /> Utility first. Community earned.</div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(145deg,#121718_0%,#162d29_48%,#315f74_100%)] p-6 shadow-[0_32px_90px_rgba(0,0,0,.36)] sm:p-7">
              <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">Community launch protocol</p><p className="mt-2 text-sm text-white/80">The billion-SPYDA mission</p></div><div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/20"><SpydaTokenIcon className="h-7 w-7" /></div></div>
              <div className="my-9"><p className="font-heading text-5xl font-semibold text-white sm:text-6xl">1B</p><p className="mt-2 text-sm font-medium text-[#9dfab0]">user-earned SPYDA target</p></div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-y border-white/10 py-5 text-center"><div><p className="font-heading text-2xl font-semibold text-white">1,000</p><p className="mt-1 text-[10px] uppercase text-white/50">credits spent</p></div><ArrowRight className="h-5 w-5 text-[#9dfab0]" /><div><p className="font-heading text-2xl font-semibold text-white">1</p><p className="mt-1 text-[10px] uppercase text-white/50">SPYDA accrued</p></div></div>
              <p className="mt-5 text-xs leading-5 text-white/55">The live community total will appear when the audited reward ledger is activated. Spyda will not display invented progress.</p>
            </div>
          </div>
        </header>

        <WhitepaperChapter id="vision" number="01" eyebrow="The vision" title="People already pay to create. Spyda lets that activity count for something more.">
          <div className="grid gap-7 lg:grid-cols-[1fr_280px]">
            <div className="space-y-5 text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
              <p>Good design is expensive in more ways than one. People pay designers, buy subscriptions, purchase assets, spend model credits, and lose hours rebuilding layouts that already work. The result may be beautiful, but the value usually moves in only one direction: away from the person doing the work.</p>
              <p>Spyda changes that relationship. The product begins with a practical promise: upload a visual reference, identify its design atoms, make focused changes, and produce a premium child design without starting over. The network vision adds a second promise: eligible usage can become a visible record of participation.</p>
              <p>Every person who uses Spyda helps improve demand, strengthen the creative network, and move the ecosystem closer to launch. The goal is not to attach a token to an empty idea. The goal is to build a useful creative product first, then let the people who create its momentum share in the economy around it.</p>
            </div>
            <div className="grid gap-2">
              {[['Less waste', 'Keep the structure that already works.'], ['Better output', 'Make smaller, controlled design changes.'], ['Shared upside', 'Turn eligible usage into accrued participation.']].map(([title, copy], index) => (
                <div key={title} className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 transition-colors hover:border-primary/25 hover:bg-primary/[0.035]"><span className="text-[10px] font-semibold text-primary">0{index + 1}</span><h3 className="mt-2 text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{copy}</p></div>
              ))}
            </div>
          </div>
        </WhitepaperChapter>

        <WhitepaperChapter id="reward-loop" number="02" eyebrow="Proof of use" title="Spend credits on real creative work. Accrue SPYDA as proof that you helped build the network.">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <div className="grid gap-px overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.08] sm:grid-cols-4">
                {[
                  [Wallet, 'Fund', 'Add Spyda Credits'],
                  [Sparkles, 'Create', 'Use eligible tools'],
                  [Gauge, 'Record', 'Verify consumed credits'],
                  [Gift, 'Accrue', 'Earn SPYDA allocation'],
                ].map(([Icon, title, copy], index) => {
                  const StepIcon = Icon as typeof Wallet
                  return <div key={String(title)} className="relative bg-[#0b0d0d] p-5"><StepIcon className="h-5 w-5 text-primary" /><p className="mt-5 text-[10px] font-semibold uppercase text-muted-foreground">Step {index + 1}</p><p className="mt-1 text-sm font-semibold">{String(title)}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{String(copy)}</p></div>
                })}
              </div>
              <div className="mt-6 rounded-lg border border-primary/20 bg-primary/[0.045] p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary"><CheckCircle2 className="h-4 w-4" /> Reward rule</div>
                <p className="mt-3 font-heading text-2xl font-semibold sm:text-3xl">1,000 eligible credits spent = 1 SPYDA accrued</p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">Funding a wallet alone does not create a reward. Credits must be consumed by eligible Spyda product actions. Refunded, reversed, promotional, fraudulent, or administratively granted credits may be excluded under the published reward policy.</p>
              </div>
            </div>

            <div className="rounded-lg border border-white/[0.1] bg-white/[0.025] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">Reward simulator</p><h3 className="mt-2 font-heading text-lg font-semibold">See what your usage builds</h3></div><Coins className="h-6 w-6 text-primary" /></div>
              <label className="mt-6 block text-xs font-medium text-muted-foreground" htmlFor="whitepaper-credit-spend">Eligible credits spent</label>
              <div className="mt-2 flex h-12 items-center rounded-lg border border-white/[0.1] bg-black/20 px-3 focus-within:border-primary/50"><SpydaTokenIcon className="h-5 w-5" /><input id="whitepaper-credit-spend" type="number" min="0" max="1000000000" step="100" value={creditSpend} onChange={event => setCreditSpend(event.target.value)} className="min-w-0 flex-1 bg-transparent px-3 font-heading text-lg font-semibold outline-none" /><span className="text-xs text-muted-foreground">credits</span></div>
              <div className="my-4 flex justify-center"><ArrowDown className="h-4 w-4 animate-bounce text-primary" /></div>
              <div className="rounded-lg border border-primary/20 bg-primary/[0.055] p-5 text-center"><p className="text-[10px] font-semibold uppercase text-muted-foreground">Pre-launch allocation</p><div className="mt-3 flex items-center justify-center gap-2"><SpydaTokenIcon className="h-8 w-8" /><p className="font-heading text-4xl font-semibold">{earnedSpyda.toLocaleString(undefined, { maximumFractionDigits: 3 })}</p></div><p className="mt-2 text-xs font-semibold text-primary">SPYDA accrued</p></div>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">At current rates, one managed 20-credit generation accrues 0.02 SPYDA. One 5-credit BYOK generation accrues 0.005 SPYDA.</p>
            </div>
          </div>
        </WhitepaperChapter>

        <WhitepaperChapter id="billion-mission" number="03" eyebrow="The community trigger" title="The token launches when users have collectively earned one billion SPYDA and readiness gates are complete.">
          <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">The one-billion target is a proof-of-demand milestone. It means the launch is powered by people who used the product, completed creative work, and earned their allocation through activity. It is not a fabricated countdown and it is not permission to launch before the system is secure.</p>
          <div className="mt-8 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="relative flex min-w-[720px] items-start justify-between">
              <div className="absolute left-7 right-7 top-6 h-1 bg-[linear-gradient(90deg,#9dfab0,#75a7ff,#ff8f5c)]" />
              {launchMilestones.map((milestone, index) => (
                <div key={milestone.value} className="relative z-[1] w-28 text-center"><div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 bg-[#080a0a] font-heading text-sm font-semibold ${index === launchMilestones.length - 1 ? 'border-[#ff8f5c] text-[#ffb08d] shadow-[0_0_28px_rgba(255,143,92,.25)]' : 'border-primary text-primary'}`}>{milestone.value}</div><p className="mt-3 text-xs font-semibold">{milestone.label}</p></div>
              ))}
            </div>
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5"><Users className="h-5 w-5 text-primary" /><h3 className="mt-4 text-sm font-semibold">User-earned threshold</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">The 1 billion target refers to cumulative eligible SPYDA accrued to user accounts before launch.</p></div>
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5"><ShieldCheck className="h-5 w-5 text-primary" /><h3 className="mt-4 text-sm font-semibold">Readiness gates</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">Security audits, legal review, network selection, claim controls, and utility must be ready before activation.</p></div>
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5"><Gift className="h-5 w-5 text-primary" /><h3 className="mt-4 text-sm font-semibold">Balance recognition</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">The intended launch design recognizes each eligible recorded SPYDA balance on a one-for-one token allocation basis, subject to final published terms.</p></div>
          </div>
        </WhitepaperChapter>

        <WhitepaperChapter id="token-design" number="04" eyebrow="Token design" title="SPYDA is designed as the creative network's unit of participation, not a promise of free money.">
          <div className="grid gap-8 lg:grid-cols-[1fr_310px]">
            <div>
              <div className="grid gap-3 sm:grid-cols-2">
                {utilityItems.map(([title, copy], index) => (
                  <div key={title} className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5 transition-transform hover:-translate-y-0.5"><div className="flex items-center justify-between"><SpydaTokenIcon className="h-6 w-6" /><span className="text-[10px] font-semibold text-muted-foreground">UTILITY 0{index + 1}</span></div><h3 className="mt-5 font-heading text-base font-semibold">{title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{copy}</p></div>
                ))}
              </div>
              <div className="mt-6 space-y-3 text-sm leading-7 text-muted-foreground">
                <p><strong className="text-foreground">Pre-launch status:</strong> Accrued SPYDA is an off-chain, non-transferable reward record until the token-generation and claim process is officially activated.</p>
                <p><strong className="text-foreground">Launch supply:</strong> The 1 billion community threshold is not, by itself, a statement of final maximum supply. Any ecosystem, treasury, liquidity, contributor, or investor allocation must be disclosed with vesting before launch.</p>
                <p><strong className="text-foreground">The Spyda dollar:</strong> This describes SPYDA's intended role as a useful unit inside the creative economy. It does not mean SPYDA is a fiat-backed stablecoin or guaranteed to equal one US dollar.</p>
              </div>
            </div>
            <div className="space-y-3">
              {[['Name', 'Spyda Token'], ['Working symbol', 'SPYDA'], ['Earn rate', '1 per 1,000 credits'], ['Launch trigger', '1B user-earned'], ['Pre-launch transfer', 'Disabled'], ['Token withdrawal', 'Locked']].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 border-b border-white/[0.08] px-1 py-3"><span className="text-xs text-muted-foreground">{label}</span><span className="text-right text-sm font-semibold">{value}</span></div>)}
            </div>
          </div>
        </WhitepaperChapter>

        <WhitepaperChapter id="architecture" number="05" eyebrow="Infrastructure" title="Web2 makes Spyda easy to use. Web3 makes ownership and settlement portable when the network is ready.">
          <div className="grid gap-px overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.08] lg:grid-cols-3">
            {[
              [Layers3, 'Product layer', 'Web2 experience', 'Accounts, projects, references, design atoms, AI orchestration, QA, subscriptions, credit funding, and collaboration remain fast and familiar.'],
              [Cpu, 'Proof layer', 'Usage and reward ledger', 'Eligible credit consumption, reversals, accrual events, balances, and claim eligibility are recorded with auditable event references.'],
              [Globe2, 'Settlement layer', 'Progressive Web3', 'Smart contracts, token claims, external wallets, marketplace settlement, and portable participation activate after readiness gates pass.'],
            ].map(([Icon, label, title, copy]) => {
              const LayerIcon = Icon as typeof Layers3
              return <div key={String(title)} className="bg-[#0b0d0d] p-6"><LayerIcon className="h-6 w-6 text-primary" /><p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{String(label)}</p><h3 className="mt-2 font-heading text-lg font-semibold">{String(title)}</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">{String(copy)}</p></div>
            })}
          </div>
          <div className="mt-5 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/[0.045] p-5"><Network className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="text-sm font-semibold">One interface, separate ledgers</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Spyda Credits, fiat balances, and SPYDA allocations appear in one wallet but remain separate assets with different accounting, transfer, withdrawal, and compliance rules.</p></div></div>
        </WhitepaperChapter>

        <WhitepaperChapter id="roadmap" number="06" eyebrow="Roadmap" title="The product earns the right to become a network.">
          <div className="divide-y divide-white/[0.08] border-y border-white/[0.08]">
            {roadmap.map((item, index) => (
              <div key={item.phase} className="group grid gap-4 py-6 sm:grid-cols-[80px_220px_1fr] sm:items-start"><div className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/30 bg-primary/[0.06] text-xs font-semibold text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">{index + 1}</div><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">{item.phase}</p><h3 className="mt-2 text-sm font-semibold">{item.title}</h3></div><p className="text-sm leading-6 text-muted-foreground">{item.copy}</p></div>
            ))}
          </div>
          <div className="mt-7 flex items-center gap-3 text-sm font-semibold text-primary"><Rocket className="h-5 w-5" /> Launch follows usage, readiness, and trust. It does not follow hype.</div>
        </WhitepaperChapter>

        <WhitepaperChapter id="trust" number="07" eyebrow="Trust and risk" title="A credible reward economy says what is exciting, what is uncertain, and what must still be earned.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              [LockKeyhole, 'No guaranteed value', 'SPYDA accrual is not cash, a refund, interest, investment profit, or a promise that a token will have a particular market price.'],
              [ShieldCheck, 'Security before claims', 'Contracts, reward proofs, claim systems, custody choices, and incident response require independent review before activation.'],
              [Globe2, 'Jurisdiction matters', 'Eligibility, token access, transfers, and withdrawals may differ by country and remain subject to applicable law.'],
              [Target, 'Anti-abuse controls', 'Sybil activity, payment reversals, automated farming, fraud, and manipulated usage may be excluded from rewards.'],
              [Users, 'Transparent changes', 'Material changes to the earn rule, launch threshold, allocation, vesting, or claim process should be published before taking effect.'],
              [Zap, 'Product utility first', 'The strongest foundation for the network is a product people choose because it produces better creative work.'],
            ].map(([Icon, title, copy]) => {
              const TrustIcon = Icon as typeof ShieldCheck
              return <div key={String(title)} className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5"><TrustIcon className="h-5 w-5 text-primary" /><h3 className="mt-4 text-sm font-semibold">{String(title)}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{String(copy)}</p></div>
            })}
          </div>
          <div className="mt-8 rounded-lg border border-[#ff8f5c]/25 bg-[#ff8f5c]/[0.045] p-5 sm:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#ffad88]">Important disclosure</p>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">This whitepaper describes the intended product and network design. It is not an offer to sell securities, financial advice, a promise of token launch, or a guarantee of value. The final earn policy, token supply, network, claim ratio, eligibility, vesting, utility, and launch terms require technical, economic, security, and legal review and may change before activation.</p>
          </div>
        </WhitepaperChapter>

        <footer className="border-t border-white/[0.08] py-14 text-center sm:py-20">
          <SpydaTokenIcon className="mx-auto h-14 w-14" />
          <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Build with Spyda. Build Spyda.</p>
          <h2 className="mx-auto mt-4 max-w-3xl font-heading text-3xl font-semibold leading-tight sm:text-5xl">A billion tokens earned through a billion moments of creative progress.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-muted-foreground">Better design is the product. Shared participation is the reward. A creator-powered economy is the destination.</p>
          <button type="button" onClick={() => goToChapter(0)} className="mt-8 inline-flex h-10 items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.025] px-4 text-sm font-semibold hover:bg-white/[0.06]">Read from the beginning <ArrowDown className="h-4 w-4 rotate-180" /></button>
        </footer>
      </div>
    </article>
  )
}
