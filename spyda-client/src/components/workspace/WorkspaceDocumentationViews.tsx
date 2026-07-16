import {
  BookOpen,
  CheckCircle2,
  Coins,
  Globe2,
  Layers3,
  LockKeyhole,
  Network,
  ShieldCheck,
} from 'lucide-react'

const architectureLayers = [
  {
    icon: Layers3,
    label: 'Experience layer',
    title: 'Web2 product infrastructure',
    copy: 'Authentication, projects, design analysis, generation, QA, payments, subscriptions, brand assets, and collaboration remain fast and familiar.',
  },
  {
    icon: Network,
    label: 'Coordination layer',
    title: 'Wallet and asset ledger',
    copy: 'Spyda Wallet presents platform credits, fiat value, and token balances through one interface while keeping their accounting rules separate.',
  },
  {
    icon: Globe2,
    label: 'Settlement layer',
    title: 'Progressive Web3 infrastructure',
    copy: 'Token utility, verifiable ownership, and external settlement are introduced only after security, compliance, and network decisions are complete.',
  },
]

const roadmap = [
  { phase: 'Phase 01', status: 'Live foundation', title: 'Web2 creative operating system', copy: 'Design intelligence, controlled reconstruction, QA, Spyda Credits, fiat checkout, projects, and brand workflows.' },
  { phase: 'Phase 02', status: 'Infrastructure', title: 'Unified wallet ledger', copy: 'Auditable credit activity, USD funding and settlement controls, identity-aware transfers, limits, and operational risk systems.' },
  { phase: 'Phase 03', status: 'Future activation', title: 'Spyda Token utility', copy: 'Token balances, eligible rewards and utility, on-chain proofs, and controlled withdrawal after readiness reviews.' },
  { phase: 'Phase 04', status: 'Progressive expansion', title: 'Open design economy', copy: 'Optional creator ownership, marketplace settlement, ecosystem participation, and governance where it adds real product value.' },
]

export function WhitepaperView() {
  return (
    <article className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <header className="border-b border-white/[0.08] pb-10">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary"><BookOpen className="h-4 w-4" /> Spyda documentation</div>
        <h1 className="mt-5 max-w-3xl font-heading text-3xl font-semibold leading-tight sm:text-5xl">Spyda Web2 + Web3 Whitepaper</h1>
        <p className="mt-5 max-w-3xl text-base leading-8 text-muted-foreground">A staged architecture for turning visual references into controlled design outcomes, coordinating platform value through Spyda Wallet, and introducing Web3 utility without compromising a fast, accessible Web2 product.</p>
        <div className="mt-7 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border border-white/[0.08] bg-white/[0.025] px-3 py-2">Version 1.0</span>
          <span className="rounded-md border border-white/[0.08] bg-white/[0.025] px-3 py-2">July 2026</span>
          <span className="rounded-md border border-primary/20 bg-primary/[0.05] px-3 py-2 text-primary">Living product document</span>
        </div>
      </header>

      <section className="grid gap-8 border-b border-white/[0.08] py-10 lg:grid-cols-[220px_1fr]">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">01 / Thesis</p><h2 className="mt-2 font-heading text-xl font-semibold">Why Spyda exists</h2></div>
        <div className="space-y-5 text-sm leading-7 text-muted-foreground">
          <p>Creative work frequently begins with a reference that already has the right hierarchy, composition, and visual energy. Existing tools either force people to rebuild that design manually or ask a generative model to reinterpret too much at once. Spyda converts the reference into design atoms, lets the user approve a small set of changes, and evaluates the child design against both the parent structure and the user's intent.</p>
          <p>The long-term platform needs two kinds of infrastructure. Web2 keeps creation immediate: accounts, files, payments, AI orchestration, collaboration, and support. Web3 can later add portable ownership, transparent settlement, programmable utility, and ecosystem participation. Spyda uses each where it is strongest instead of forcing every user interaction on-chain.</p>
        </div>
      </section>

      <section className="border-b border-white/[0.08] py-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">02 / System architecture</p>
        <h2 className="mt-2 font-heading text-2xl font-semibold">One product, three coordinated layers</h2>
        <div className="mt-7 grid gap-3 lg:grid-cols-3">
          {architectureLayers.map(({ icon: Icon, label, title, copy }) => (
            <div key={title} className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5">
              <Icon className="h-5 w-5 text-primary" />
              <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
              <h3 className="mt-2 font-heading text-base font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-8 border-b border-white/[0.08] py-10 lg:grid-cols-[220px_1fr]">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">03 / Wallet model</p><h2 className="mt-2 font-heading text-xl font-semibold">Three assets, three purposes</h2></div>
        <div className="overflow-hidden rounded-lg border border-white/[0.08]">
          {[
            ['Spyda Credits', 'Platform utility', 'Pays for managed generation, BYOK generation, and future metered creative services.', 'Live'],
            ['USD balance', 'Fiat settlement', 'Supports wallet funding, payments, transfers, and eligible withdrawals through compliant Web2 rails.', 'Phased rollout'],
            ['Spyda Token', 'Web3 utility', 'Designed for future ecosystem utility, ownership, rewards, and external settlement.', 'Withdrawal locked'],
          ].map(([asset, role, purpose, state], index) => (
            <div key={asset} className={`grid gap-3 bg-white/[0.015] p-5 sm:grid-cols-[150px_140px_1fr_auto] sm:items-center ${index ? 'border-t border-white/[0.08]' : ''}`}>
              <p className="text-sm font-semibold">{asset}</p>
              <p className="text-xs text-primary">{role}</p>
              <p className="text-xs leading-5 text-muted-foreground">{purpose}</p>
              <span className="w-fit rounded-md border border-white/[0.08] bg-background/60 px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">{state}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-8 border-b border-white/[0.08] py-10 lg:grid-cols-[220px_1fr]">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">04 / Token principles</p><h2 className="mt-2 font-heading text-xl font-semibold">Utility before liquidity</h2></div>
        <div>
          <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.04] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-300"><LockKeyhole className="h-4 w-4" /> Token withdrawal remains locked</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">The wallet may display a Spyda Token balance before external withdrawal is enabled. Unlocking requires completed smart-contract audits, custody and network decisions, abuse controls, legal review, and a published activation notice.</p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {['Access to eligible ecosystem utilities', 'Creator and contributor reward programs', 'Optional marketplace settlement', 'Portable proof of participation', 'Future governance with bounded scope', 'No promise of financial return'].map(item => (
              <div key={item} className="flex items-start gap-2 rounded-lg border border-white/[0.07] bg-white/[0.015] p-4 text-sm text-muted-foreground"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {item}</div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-8 border-b border-white/[0.08] py-10 lg:grid-cols-[220px_1fr]">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">05 / Economics</p><h2 className="mt-2 font-heading text-xl font-semibold">Credits remain predictable</h2></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5"><Coins className="h-5 w-5 text-primary" /><p className="mt-4 text-sm font-semibold">Managed generation</p><p className="mt-1 font-heading text-3xl font-semibold">20 credits</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Spyda supplies the model infrastructure and the complete editing workflow.</p></div>
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5"><Network className="h-5 w-5 text-primary" /><p className="mt-4 text-sm font-semibold">Bring Your API Key</p><p className="mt-1 font-heading text-3xl font-semibold">5 credits</p><p className="mt-2 text-xs leading-5 text-muted-foreground">The user supplies model billing while Spyda provides orchestration, controls, QA, and project infrastructure.</p></div>
        </div>
      </section>

      <section className="border-b border-white/[0.08] py-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">06 / Security and trust</p>
        <h2 className="mt-2 font-heading text-2xl font-semibold">Progressive capability, explicit safeguards</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Identity', 'Authenticated accounts, session controls, MFA, and risk-aware transfer limits.'],
            ['Payments', 'Protected fiat checkout, reconciled wallet entries, and auditable billing references.'],
            ['Keys', 'User-supplied provider keys are used only for requested AI operations and never placed in project recipes.'],
            ['Web3', 'Audited contracts, deliberate network activation, withdrawal controls, and incident response.'],
          ].map(([title, copy]) => <div key={title} className="rounded-lg border border-white/[0.08] bg-white/[0.015] p-4"><ShieldCheck className="h-4 w-4 text-primary" /><h3 className="mt-3 text-sm font-semibold">{title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{copy}</p></div>)}
        </div>
      </section>

      <section className="py-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">07 / Roadmap</p>
        <h2 className="mt-2 font-heading text-2xl font-semibold">A staged path to the design economy</h2>
        <div className="mt-7 divide-y divide-white/[0.08] border-y border-white/[0.08]">
          {roadmap.map(item => (
            <div key={item.phase} className="grid gap-3 py-5 sm:grid-cols-[100px_150px_1fr] sm:items-start">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">{item.phase}</p>
              <p className="text-xs font-semibold text-muted-foreground">{item.status}</p>
              <div><h3 className="text-sm font-semibold">{item.title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.copy}</p></div>
            </div>
          ))}
        </div>
        <p className="mt-7 text-xs leading-6 text-muted-foreground">This whitepaper describes product direction, not an offer of securities, investment advice, or a guarantee that every future capability will launch. Network, token, custody, and jurisdiction decisions remain subject to technical, commercial, and legal review.</p>
      </section>
    </article>
  )
}
