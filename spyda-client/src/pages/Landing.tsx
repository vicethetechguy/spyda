import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  ChevronDown,
  GitCompareArrows,
  Layers3,
  Library,
  MousePointer2,
  Palette,
  Play,
  RefreshCw,
  ScanSearch,
  SlidersHorizontal,
  Sparkles,
  Upload,
  WandSparkles,
} from 'lucide-react'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
      <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_12px_rgba(157,250,176,0.8)]" />
      {children}
    </div>
  )
}

function FeatureCard({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <article className="group rounded-lg border border-white/[0.07] bg-white/[0.02] p-6 transition-colors duration-300 hover:border-primary/30 hover:bg-primary/[0.025]">
      <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/[0.07]">
        <Icon className="h-[18px] w-[18px] text-primary" strokeWidth={1.7} />
      </div>
      <h3 className="font-heading text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{desc}</p>
    </article>
  )
}

function PricingCard({ name, price, detail, desc, features, featured }: {
  name: string
  price: string
  detail: string
  desc: string
  features: string[]
  featured?: boolean
}) {
  return (
    <article className={`relative flex flex-col rounded-lg border p-6 ${featured ? 'border-primary/45 bg-primary/[0.04]' : 'border-white/[0.07] bg-white/[0.02]'}`}>
      {featured && <span className="absolute right-4 top-4 rounded bg-primary/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-primary">Popular</span>}
      <h3 className="font-heading text-lg font-semibold">{name}</h3>
      <p className="mt-4 font-heading text-3xl font-semibold">{price}</p>
      <p className="mt-1 text-xs text-primary">{detail}</p>
      <p className="mt-4 min-h-12 text-sm leading-6 text-muted-foreground">{desc}</p>
      <ul className="mt-5 flex-1 space-y-3 border-t border-white/[0.07] pt-5">
        {features.map(feature => (
          <li key={feature} className="flex items-start gap-2.5 text-xs leading-5 text-muted-foreground">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.4} />
            {feature}
          </li>
        ))}
      </ul>
      <Link to="/auth" className={`mt-6 inline-flex h-11 items-center justify-center rounded-lg text-sm font-semibold transition-colors ${featured ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.07]'}`}>
        Choose {name}
      </Link>
    </article>
  )
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div className="border-b border-white/[0.07]">
      <button type="button" onClick={() => setIsOpen(previous => !previous)} aria-expanded={isOpen} className="flex w-full items-center justify-between gap-5 py-5 text-left">
        <span className="font-heading text-base font-medium text-foreground">{question}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180 text-primary' : ''}`} />
      </button>
      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="min-h-0 overflow-hidden"><p className="max-w-2xl pb-5 text-sm leading-6 text-muted-foreground">{answer}</p></div>
      </div>
    </div>
  )
}

const samples = [
  'spyda-sample-01.jpeg', 'spyda-sample-02.jpeg', 'spyda-sample-03.jpeg',
  'spyda-sample-04.jpeg', 'spyda-sample-05.jpeg', 'spyda-sample-06.jpeg',
  'spyda-sample-07.jpeg', 'spyda-sample-08.jpeg', 'spyda-sample-09.jpeg',
  'spyda-sample-10.jpeg', 'spyda-sample-11.jpeg', 'spyda-sample-12.jpeg',
]

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background font-sans text-foreground">
      <header className="fixed left-1/2 top-3 z-50 w-[min(1120px,calc(100%-1.25rem))] -translate-x-1/2">
        <div className="flex h-14 items-center justify-between rounded-lg border border-white/[0.09] bg-[#050506]/85 px-3 shadow-[0_18px_60px_rgba(0,0,0,0.38)] backdrop-blur-2xl sm:px-4">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Spyda home">
            <img src="/assets/spyda-logo-drive.webp" alt="" className="h-8 w-8 object-contain" />
            <span className="font-heading text-lg font-semibold">Spyda</span>
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            <a href="#problem" className="text-xs font-normal text-muted-foreground transition-colors hover:text-foreground">Why Spyda</a>
            <a href="#how" className="text-xs font-normal text-muted-foreground transition-colors hover:text-foreground">How it works</a>
            <a href="#features" className="text-xs font-normal text-muted-foreground transition-colors hover:text-foreground">What you control</a>
            <a href="#pricing" className="text-xs font-normal text-muted-foreground transition-colors hover:text-foreground">Pricing</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="hidden h-9 items-center px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex">Sign in</Link>
            <Link to="/auth" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:px-4">
              Try Spyda <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative border-b border-white/[0.06] px-4 pb-14 pt-28 sm:pt-32">
          <div className="absolute inset-0 grid-pattern opacity-30" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          <div className="relative mx-auto max-w-6xl">
            <div className="mx-auto max-w-5xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Reference-led design editing
              </div>
              <h1 className="font-heading text-[2.65rem] font-semibold leading-[1.03] sm:text-6xl lg:text-[4.25rem]">
                Keep the design you like.
                <br />
                <span className="animate-gradient bg-[length:200%_200%] text-gradient">Change only what you need.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Upload a flyer you already trust. Spyda finds its text, images, logos, colors, and layout so you can replace the parts that need to change without rebuilding everything from zero.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link to="/auth" className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-[0_14px_40px_rgba(157,250,176,0.18)] transition-all hover:-translate-y-0.5 hover:bg-primary/90 sm:w-auto">
                  Start with your flyer <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <a href="#how" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.025] px-6 text-sm font-medium transition-colors hover:bg-white/[0.06] sm:w-auto">
                  <Play className="h-4 w-4 text-primary" /> See the workflow
                </a>
              </div>
              <div className="mt-7 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> No blank canvas</span>
                <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> Focused 1-3 change rounds</span>
                <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> Original stays untouched</span>
              </div>
            </div>

            <div className="relative mx-auto mt-10 max-w-5xl overflow-hidden rounded-lg border border-white/[0.09] bg-[#08090a] shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
              <div className="flex h-9 items-center justify-between border-b border-white/[0.07] px-3 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Spyda design workspace</div>
                <span>Reference to child design</span>
              </div>
              <video autoPlay muted loop playsInline preload="metadata" className="aspect-[16/7] w-full object-cover object-top" aria-label="Spyda workspace workflow preview">
                <source src="/assets/spyda-workflow-demo.webm" type="video/webm" />
              </video>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#08090a] to-transparent" />
              <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg border border-white/[0.1] bg-black/75 px-3 py-2 text-[10px] text-white backdrop-blur-md">
                <ScanSearch className="h-3.5 w-3.5 text-primary" /> Source, atoms, and child version in one view
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden border-b border-white/[0.06] py-6">
          <p className="mb-5 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">Made for the design work already on your desk</p>
          <div className="partners-marquee text-muted-foreground/70">
            {[0, 1].map(loop => (
              <div key={loop} className="partners-marquee__track">
                {['Social media flyers', 'Campaign posters', 'Product launches', 'Event promotions', 'App announcements', 'Client revisions'].map((label, index) => (
                  <span key={`${label}-${loop}`} className="flex items-center gap-4 whitespace-nowrap font-heading text-sm font-medium"><span className={`h-1.5 w-1.5 rounded-full ${index % 3 === 0 ? 'bg-primary' : index % 3 === 1 ? 'bg-[#8bd3ff]' : 'bg-[#f43f7f]'}`} />{label}</span>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section id="problem" className="border-b border-white/[0.06] px-4 py-24 sm:py-28">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <div className="mb-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> The real design problem</div>
              <h2 className="max-w-xl font-heading text-3xl font-semibold leading-tight sm:text-5xl">You do not need another blank canvas.</h2>
              <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">You already found the structure, hierarchy, and visual direction you want. The slow part is rebuilding it just to change a headline, product photo, logo, offer, or brand color.</p>
            </div>
            <div className="divide-y divide-white/[0.08] border-y border-white/[0.08]">
              {[
                ['Rebuilding takes too long', 'A small client revision can turn into hours of recreating spacing, type, and visual balance.'],
                ['One large AI prompt changes too much', 'When every instruction is sent at once, the layout drifts and important details get lost.'],
                ['Good references lose their structure', 'Most generators treat your reference as inspiration instead of a layout that should remain recognizable.'],
              ].map(([title, copy], index) => (
                <div key={title} className="grid gap-3 py-6 sm:grid-cols-[44px_1fr]">
                  <span className="font-heading text-sm text-primary">0{index + 1}</span>
                  <div><h3 className="font-heading text-base font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="relative px-4 py-24 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <SectionLabel>How Spyda works</SectionLabel>
              <h2 className="font-heading text-3xl font-semibold sm:text-5xl">A clearer way to revise a design.</h2>
              <p className="mt-5 text-base leading-7 text-muted-foreground">Spyda turns one difficult redesign into a series of small, controlled decisions.</p>
            </div>
            <div className="mt-14 grid gap-px overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.08] md:grid-cols-4">
              {[
                { icon: Upload, step: '01', title: 'Upload the reference', copy: 'Start with the flyer, poster, or social design whose structure you want to keep.' },
                { icon: ScanSearch, step: '02', title: 'Review the design atoms', copy: 'Spyda identifies the visible text, images, logos, offers, colors, fonts, and layout roles.' },
                { icon: SlidersHorizontal, step: '03', title: 'Choose up to 3 changes', copy: 'Replace a few exact items per round so the model can stay focused on the parent design.' },
                { icon: RefreshCw, step: '04', title: 'Continue from the new version', copy: 'The child design becomes your next working source, while the original remains available for comparison.' },
              ].map(item => (
                <article key={item.step} className="min-h-64 bg-background p-6">
                  <div className="flex items-center justify-between"><item.icon className="h-5 w-5 text-primary" /><span className="font-heading text-xs text-muted-foreground">{item.step}</span></div>
                  <h3 className="mt-10 font-heading text-lg font-semibold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="border-y border-white/[0.06] bg-white/[0.012] px-4 py-24 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <SectionLabel>What you control</SectionLabel>
              <h2 className="font-heading text-3xl font-semibold sm:text-5xl">Enough control to stay faithful. Enough AI to move faster.</h2>
              <p className="mt-5 text-base leading-7 text-muted-foreground">Spyda keeps the reference visible and gives each important part of the design its own place to edit.</p>
            </div>
            <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureCard icon={Layers3} title="Design atoms" desc="Text, images, logos, calls to action, and other visible parts are separated into focused controls." />
              <FeatureCard icon={MousePointer2} title="Exact replacement choices" desc="Keep an atom unchanged, customize it, upload a replacement, or remove it from the next version." />
              <FeatureCard icon={Palette} title="Brand constants" desc="Set heading and body fonts, HEX colors, and visual direction for every generation round." />
              <FeatureCard icon={GitCompareArrows} title="Source and child comparison" desc="See the original beside the latest result so layout drift and unwanted changes are easier to catch." />
              <FeatureCard icon={WandSparkles} title="Essentials for special requests" desc="Add instructions or a supporting image when the detected atoms do not cover the change you need." />
              <FeatureCard icon={Library} title="A reusable workspace" desc="Return to project history, templates, brand assets, generated designs, and active revisions." />
            </div>
          </div>
        </section>

        <section id="samples" className="overflow-hidden py-24 sm:py-28">
          <div className="mb-12 px-4 text-center">
            <SectionLabel>Bring your reference</SectionLabel>
            <h2 className="font-heading text-3xl font-semibold sm:text-5xl">Your next design can start from work this detailed.</h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground">Use a strong visual reference, then replace the message and brand ingredients that need to become yours.</p>
          </div>
          <div className="relative overflow-hidden">
            <div className="flex w-max gap-4 animate-marquee">
              {[...samples, ...samples].map((source, index) => (
                <img key={`${source}-${index}`} src={`/assets/${source}`} alt="Flyer reference example" className="aspect-[4/5] w-[220px] rounded-lg border border-white/[0.08] object-cover shadow-[0_18px_45px_rgba(0,0,0,0.3)] sm:w-[260px]" loading="lazy" />
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="border-y border-white/[0.06] bg-white/[0.012] px-4 py-24 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <SectionLabel>Pricing</SectionLabel>
              <h2 className="font-heading text-3xl font-semibold sm:text-5xl">Pay for the design work you need.</h2>
              <p className="mt-5 text-base leading-7 text-muted-foreground">Top up for occasional revisions or activate 30 days of access for a larger design workload.</p>
            </div>
            <div className="mx-auto mt-14 grid max-w-5xl gap-4 md:grid-cols-3">
              <PricingCard name="Top-Up" price="From $5" detail="Flexible Spyda credits" desc="A simple option for occasional flyer analysis and generation." features={['Credits stay in your account', 'No recurring payment', 'Use them when a revision arrives', 'Available from your Spyda wallet']} />
              <PricingCard name="Creator" price="NGN 12,000" detail="30 days of access" desc="For creators handling regular campaigns, promotions, and client revisions." features={['1,200 credits per access period', 'Unlimited saved projects', 'Brand asset library', 'Premium design analysis']} featured />
              <PricingCard name="Studio" price="NGN 30,000" detail="30 days of access" desc="For teams and high-volume creative work that needs more room to move." features={['3,500 credits per access period', 'Everything in Creator', 'Faster processing queue', 'Advanced brand controls']} />
            </div>
            <p className="mt-5 text-center text-xs text-muted-foreground">Paid access does not renew automatically. Payments are handled securely through Paystack.</p>
          </div>
        </section>

        <section id="faq" className="px-4 py-24 sm:py-28">
          <div className="mx-auto max-w-3xl">
            <div className="text-center">
              <SectionLabel>Questions</SectionLabel>
              <h2 className="font-heading text-3xl font-semibold sm:text-4xl">Know what to expect before you upload.</h2>
            </div>
            <div className="mt-12">
              <FAQItem question="What does Spyda actually do?" answer="Spyda helps you revise an existing visual direction. It analyzes a flyer or similar design, lists the parts it can see, lets you choose focused replacements, and generates the next version while using the current design as its reference." />
              <FAQItem question="Does Spyda turn my upload into a layered Photoshop file?" answer="No. Spyda does not recover the original hidden layers from a flat image. It creates design atoms for the visible parts, then uses your selected changes and the reference image to produce a revised child version." />
              <FAQItem question="Why can I make only three focused changes per round?" answer="Smaller rounds give the image model fewer instructions to balance at once. This helps it preserve more of the parent layout, and your latest child version becomes the source for the next round." />
              <FAQItem question="Can I replace logos and product images?" answer="Yes. Upload a replacement on the matching design atom or through Essentials. Spyda also supports exact placement controls for detected image regions before the AI generation step." />
              <FAQItem question="Can I keep my brand fonts and colors?" answer="Yes. Brand Constants lets you set heading and body fonts, HEX colors, and the visual style that should guide the revised design." />
              <FAQItem question="Do I need to be a professional designer?" answer="No. Spyda is built for anyone who can point to a design they like and clearly choose what should stay, what should change, and what should be removed." />
            </div>
          </div>
        </section>

        <section className="px-4 pb-24">
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-lg border border-primary/25 bg-primary/[0.045] px-6 py-14 text-center sm:px-12 sm:py-16">
            <div className="absolute inset-0 grid-pattern opacity-20" />
            <div className="relative">
              <h2 className="font-heading text-3xl font-semibold sm:text-5xl">Stop rebuilding good designs from zero.</h2>
              <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground">Bring the reference. Choose the exact changes. Let Spyda help you create the next version without losing the direction that made the original work.</p>
              <Link to="/auth" className="group mt-8 inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-all hover:-translate-y-0.5 hover:bg-primary/90">
                Try Spyda with your flyer <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.07] px-4 py-9">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5"><img src="/assets/spyda-logo-drive.webp" alt="" className="h-7 w-7 object-contain opacity-70" /><span className="font-heading text-sm font-semibold">Spyda</span><span className="text-xs text-muted-foreground">&copy; 2026</span></div>
          <p className="text-xs text-muted-foreground">Reference-led design revision, made simpler.</p>
          <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.025] px-3 py-2 text-[10px] text-muted-foreground">
            <span>Built by</span><img src="/assets/vigency-logo-footer.png" alt="Vigency" className="h-4 w-auto opacity-70" />
          </div>
        </div>
      </footer>
    </div>
  )
}
