import { Link } from "react-router-dom"
import { 
  ArrowRight, 
  Sparkles, 
  Layers, 
  Zap, 
  Target, 
  Palette,
  Image,
  MousePointerClick,
  Wand2,
  Star,
  ChevronRight,
  Play
} from "lucide-react"

/* ── tiny reusable pieces ── */

function GlowOrb({ className }: { className: string }) {
  return <div className={`absolute rounded-full blur-[120px] pointer-events-none ${className}`} />
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-bold tracking-[0.14em] uppercase text-primary mb-6">
      {children}
    </span>
  )
}

function FeatureCard({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 backdrop-blur-sm transition-all duration-500 hover:border-primary/30 hover:bg-primary/[0.03]">
      {/* shimmer on hover */}
      <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
      <div className="relative z-10">
        <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20 transition-colors group-hover:bg-primary/15">
          <Icon className="h-5 w-5 text-primary" strokeWidth={1.5} />
        </div>
        <h3 className="font-heading text-lg font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
      </div>
    </div>
  )
}

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="font-heading text-4xl font-bold text-gradient-green">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  )
}

function PricingCard({ name, price, period, desc, features, cta, href, featured }: {
  name: string; price: string; period?: string; desc: string;
  features: string[]; cta: string; href: string; featured?: boolean;
}) {
  return (
    <div className={`relative flex flex-col rounded-2xl p-8 transition-all duration-300 hover:-translate-y-1 ${
      featured
        ? "border-2 border-primary bg-primary/[0.04] shadow-[0_0_80px_rgba(157,250,176,0.08)]"
        : "border border-white/[0.06] bg-white/[0.02]"
    }`}>
      {featured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#22c55e] to-[#16a34a] px-4 py-1 text-[11px] font-bold tracking-wider uppercase text-primary-foreground shadow-lg">
          Most Popular
        </div>
      )}
      <h3 className="font-heading text-xl font-semibold">{name}</h3>
      <div className="my-5">
        <span className="font-heading text-5xl font-bold">{price}</span>
        {period && <span className="text-lg text-muted-foreground ml-1">{period}</span>}
      </div>
      <p className="text-sm text-muted-foreground mb-8">{desc}</p>
      <ul className="mb-8 flex-1 space-y-3">
        {features.map((f, i) => (
          <li key={i} className="flex items-center text-sm text-muted-foreground">
            <ChevronRight className="mr-2 h-4 w-4 text-primary shrink-0" />
            {f}
          </li>
        ))}
      </ul>
      <Link
        to={href}
        className={`inline-flex w-full h-12 items-center justify-center rounded-lg text-sm font-semibold transition-all duration-300 ${
          featured
            ? "bg-gradient-to-r from-[#22c55e] to-[#16a34a] text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:brightness-110"
            : "border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
        }`}
      >
        {cta}
      </Link>
    </div>
  )
}

/* ── Main Landing Page ── */

export default function Landing() {
  const samples = [
    "spyda-sample-01.jpeg", "spyda-sample-02.jpeg", "spyda-sample-03.jpeg",
    "spyda-sample-04.jpeg", "spyda-sample-05.jpeg", "spyda-sample-06.jpeg",
    "spyda-sample-07.jpeg", "spyda-sample-08.jpeg", "spyda-sample-09.jpeg",
    "spyda-sample-10.jpeg", "spyda-sample-11.jpeg", "spyda-sample-12.jpeg",
  ]

  return (
    <div className="min-h-screen bg-background text-foreground font-sans overflow-x-hidden">

      {/* ─── HEADER ─── */}
      <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[min(1120px,calc(100%-2rem))]">
        <div className="flex items-center justify-between rounded-full border border-white/[0.08] bg-[#050506]/70 px-4 py-2.5 shadow-[0_20px_70px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/assets/spyda-logo-drive.webp" alt="Spyda" className="w-8 h-8 object-contain" />
            <span className="font-heading text-lg font-bold tracking-tight">Spyda</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#how" className="text-[13px] font-medium text-muted-foreground hover:text-primary transition-colors">How It Works</a>
            <a href="#features" className="text-[13px] font-medium text-muted-foreground hover:text-primary transition-colors">Features</a>
            <a href="#samples" className="text-[13px] font-medium text-muted-foreground hover:text-primary transition-colors">Samples</a>
            <a href="#pricing" className="text-[13px] font-medium text-muted-foreground hover:text-primary transition-colors">Pricing</a>
          </nav>
          <Link
            to="/workspace"
            className="inline-flex h-9 items-center gap-2 rounded-full bg-gradient-to-r from-[#22c55e] to-[#16a34a] px-5 text-[13px] font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30 hover:brightness-110"
          >
            Open Spyda <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      <main>

        {/* ─── HERO ─── */}
        <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
          {/* Background effects */}
          <div className="absolute inset-0 grid-pattern opacity-40" />
          <GlowOrb className="w-[800px] h-[800px] bg-primary/[0.12] top-[-20%] left-[10%]" />
          <GlowOrb className="w-[600px] h-[600px] bg-[#f43f7f]/[0.08] top-[10%] right-[-5%]" />
          <GlowOrb className="w-[500px] h-[500px] bg-[#8bd3ff]/[0.06] bottom-[-10%] left-[40%]" />

          {/* Content */}
          <div className="relative z-10 mx-auto max-w-5xl px-4 text-center pt-20">
            <h1 className="font-heading text-5xl sm:text-7xl md:text-[5.5rem] font-bold leading-[0.95] tracking-tight">
              <span className="text-gradient animate-gradient bg-[length:200%_200%]">Generate Premium</span>
              <br />
              <span className="text-foreground">Quality Designs</span>
            </h1>

            <p className="mx-auto mt-8 max-w-[600px] text-lg text-muted-foreground leading-relaxed">
              Upload a reference. Spyda dissects its DNA — layout, typography, colors, structure — then regenerates it as a completely new, premium design.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/workspace"
                className="group inline-flex h-14 items-center gap-3 rounded-full bg-gradient-to-r from-[#22c55e] to-[#16a34a] px-8 text-sm font-bold text-primary-foreground shadow-[0_18px_44px_rgba(157,250,176,0.22)] transition-all hover:shadow-[0_22px_54px_rgba(157,250,176,0.32)] hover:-translate-y-0.5"
              >
                Start Designing <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a
                href="#how"
                className="inline-flex h-14 items-center gap-3 rounded-full border border-white/[0.1] bg-white/[0.03] px-8 text-sm font-semibold backdrop-blur-sm transition-all hover:bg-white/[0.06] hover:-translate-y-0.5"
              >
                <Play className="h-4 w-4 text-primary" /> See How It Works
              </a>
            </div>

            {/* Stats */}
            <div className="mt-20 grid grid-cols-3 gap-8 max-w-lg mx-auto">
              <StatBlock value="10x" label="Faster Output" />
              <StatBlock value="∞" label="Variations" />
              <StatBlock value="4K" label="HD Exports" />
            </div>
          </div>

          {/* Hero Collage */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-6xl px-4 pointer-events-none hidden lg:block">
            <div className="relative h-[200px]">
              <img src="/assets/spyda-sample-03.jpeg" alt="" className="absolute left-[10%] bottom-0 w-[180px] rounded-2xl border border-white/10 shadow-2xl animate-float opacity-80" />
              <img src="/assets/spyda-sample-08.jpeg" alt="" className="absolute left-[30%] bottom-4 w-[160px] rounded-2xl border border-white/10 shadow-2xl animate-float-delayed opacity-60" />
              <img src="/assets/spyda-sample-04.jpeg" alt="" className="absolute right-[30%] bottom-2 w-[160px] rounded-2xl border border-white/10 shadow-2xl animate-float opacity-70" />
              <img src="/assets/spyda-sample-11.jpeg" alt="" className="absolute right-[10%] bottom-0 w-[180px] rounded-2xl border border-white/10 shadow-2xl animate-float-delayed opacity-80" />
            </div>
          </div>
        </section>

        {/* ─── TRUSTED BY ─── */}
        <section className="border-y border-white/[0.04] py-14 px-4">
          <div className="mx-auto max-w-5xl text-center">
            <p className="text-xs font-bold tracking-[0.2em] uppercase text-muted-foreground/50 mb-8">Trusted By Design Teams Worldwide</p>
            <div className="flex flex-wrap justify-center items-center gap-10 md:gap-16 opacity-40 hover:opacity-60 transition-opacity duration-700">
              <span className="font-heading text-xl font-bold flex items-center gap-2"><Zap className="w-5 h-5 text-primary" /> FlashCorp</span>
              <span className="font-heading text-xl font-bold flex items-center gap-2"><Target className="w-5 h-5 text-[#8bd3ff]" /> Precision</span>
              <span className="font-heading text-xl font-bold flex items-center gap-2"><Palette className="w-5 h-5 text-[#f43f7f]" /> ChromaLab</span>
              <span className="font-heading text-xl font-bold flex items-center gap-2"><Star className="w-5 h-5 text-[#ffcf4d]" /> VertexUI</span>
              <span className="font-heading text-xl font-bold flex items-center gap-2"><Layers className="w-5 h-5 text-primary" /> LayerStack</span>
            </div>
          </div>
        </section>

        {/* ─── HOW IT WORKS ─── */}
        <section id="how" className="relative py-32 px-4 overflow-hidden">
          <GlowOrb className="w-[600px] h-[600px] bg-primary/[0.06] top-[20%] right-[-10%]" />
          <div className="relative z-10 mx-auto max-w-6xl">
            <div className="text-center mb-20">
              <SectionLabel>How It Works</SectionLabel>
              <h2 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight">
                One reference. <span className="text-gradient-green">Infinite directions.</span>
              </h2>
              <p className="mt-5 text-muted-foreground max-w-[550px] mx-auto text-lg">
                Spyda reads the structure of any design and transforms it into a fully customizable creative system.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  step: "01",
                  icon: Image,
                  title: "Upload Reference",
                  desc: "Drop any flyer, poster, or ad. Spyda's AI instantly scans and maps every visual component — hero text, imagery, CTAs, brand marks."
                },
                {
                  step: "02",
                  icon: MousePointerClick,
                  title: "Dissect & Edit",
                  desc: "Every detected element becomes a draggable, editable node on your canvas. Replace copy, swap images, adjust colors — total creative control."
                },
                {
                  step: "03",
                  icon: Wand2,
                  title: "Generate & Export",
                  desc: "Spyda compiles your edits into a precision prompt and renders a brand-new, print-ready 4K design via GPT-Image 2."
                }
              ].map((item) => (
                <div key={item.step} className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 backdrop-blur-sm transition-all duration-500 hover:border-primary/20">
                  <div className="absolute top-6 right-6 font-heading text-6xl font-bold text-white/[0.03] group-hover:text-primary/[0.08] transition-colors">{item.step}</div>
                  <div className="relative z-10">
                    <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
                      <item.icon className="h-6 w-6 text-primary" strokeWidth={1.5} />
                    </div>
                    <h3 className="font-heading text-xl font-semibold mb-3">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── FEATURES ─── */}
        <section id="features" className="relative py-32 px-4">
          <GlowOrb className="w-[700px] h-[700px] bg-[#8bd3ff]/[0.05] bottom-[0%] left-[-10%]" />
          <div className="relative z-10 mx-auto max-w-6xl">
            <div className="text-center mb-20">
              <SectionLabel>Features</SectionLabel>
              <h2 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight">
                Built for <span className="text-gradient-green">scale</span> and <span className="text-gradient-green">consistency.</span>
              </h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <FeatureCard icon={Layers} title="Reference Breakdown" desc="Spyda dissects flyers into hero text, product imagery, offer blocks, CTAs, and brand constants automatically." />
              <FeatureCard icon={MousePointerClick} title="Drag-and-Drop Canvas" desc="Every detected component becomes an interactive, movable node giving you full creative control." />
              <FeatureCard icon={Wand2} title="AI Generation" desc="One-click rendering via GPT-Image 2 with precision prompts built from your edits." />
              <FeatureCard icon={Palette} title="Brand Constants" desc="Lock your HEX codes, fonts, and logo placement so every generation stays perfectly on-brand." />
              <FeatureCard icon={Zap} title="Instant Variations" desc="Generate 10 different design directions from a single reference in seconds." />
              <FeatureCard icon={Image} title="4K HD Exports" desc="Download print-ready, high-resolution images with no watermarks on paid plans." />
            </div>
          </div>
        </section>

        {/* ─── SAMPLES MARQUEE ─── */}
        <section id="samples" className="py-32 px-4 overflow-hidden">
          <div className="text-center mb-16">
            <SectionLabel>Samples</SectionLabel>
            <h2 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight">
              Flyers, campaigns, promos — <span className="text-gradient-green">all premium.</span>
            </h2>
          </div>

          {/* Row 1 */}
          <div className="relative w-full overflow-hidden mb-6">
            <div className="flex gap-6 animate-marquee w-max">
              {[...samples.slice(0, 6), ...samples.slice(0, 6)].map((src, i) => (
                <img key={i} src={`/assets/${src}`} alt="" className="w-[280px] aspect-[4/5] object-cover rounded-2xl border border-white/[0.08] shadow-xl" />
              ))}
            </div>
          </div>
          {/* Row 2 — reversed */}
          <div className="relative w-full overflow-hidden">
            <div className="flex gap-6 animate-marquee direction-reverse w-max" style={{ animationDirection: 'reverse' }}>
              {[...samples.slice(6), ...samples.slice(6)].map((src, i) => (
                <img key={i} src={`/assets/${src}`} alt="" className="w-[280px] aspect-[4/5] object-cover rounded-2xl border border-white/[0.08] shadow-xl" />
              ))}
            </div>
          </div>
        </section>

        {/* ─── PRICING ─── */}
        <section id="pricing" className="relative py-32 px-4">
          <GlowOrb className="w-[800px] h-[800px] bg-primary/[0.06] top-[10%] left-[50%] -translate-x-1/2" />
          <div className="relative z-10 mx-auto max-w-6xl">
            <div className="text-center mb-20">
              <SectionLabel>Pricing</SectionLabel>
              <h2 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight">
                Design intelligence, <span className="text-gradient-green">fairly priced.</span>
              </h2>
              <p className="mt-5 text-muted-foreground max-w-[500px] mx-auto text-lg">
                Start small. Scale as your creative production grows.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              <PricingCard
                name="Top-Up"
                price="Flexible"
                desc="Pay-as-you-go credits."
                features={["$5 = 500 Credits", "$10 = 1,000 Credits", "12 Credits / Generation", "No monthly commitment"]}
                cta="Open Wallet"
                href="/workspace"
              />
              <PricingCard
                name="Subscription"
                price="$10"
                period="/mo"
                desc="Discounted bulk credits."
                features={["Starter: 1,000 Credits", "Pro ($25): 2,800 Credits", "Agency ($50): 6,000 Credits", "Bonus Credits Included"]}
                cta="Get Started"
                href="/workspace"
                featured
              />
              <PricingCard
                name="Bring Your Key"
                price="3"
                period="Credits / Gen"
                desc="Use your own OpenAI API key."
                features={["Pay OpenAI directly", "Zero generation markup", "Nominal 3-credit platform fee", "Maximum cost control"]}
                cta="Connect Key"
                href="/workspace"
              />
            </div>
          </div>
        </section>

        {/* ─── CTA BANNER ─── */}
        <section className="py-24 px-4">
          <div className="mx-auto max-w-4xl rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-transparent to-[#8bd3ff]/[0.04] p-16 text-center relative overflow-hidden">
            <GlowOrb className="w-[400px] h-[400px] bg-primary/[0.15] top-[-30%] left-[20%]" />
            <div className="relative z-10">
              <h2 className="font-heading text-4xl font-bold tracking-tight mb-4">
                Ready to spin the web?
              </h2>
              <p className="text-muted-foreground text-lg mb-8 max-w-md mx-auto">
                Join designers who are generating premium creatives 10x faster with Spyda.
              </p>
              <Link
                to="/workspace"
                className="group inline-flex h-14 items-center gap-3 rounded-full bg-gradient-to-r from-[#22c55e] to-[#16a34a] px-10 text-sm font-bold text-primary-foreground shadow-[0_18px_44px_rgba(157,250,176,0.22)] transition-all hover:shadow-[0_22px_54px_rgba(157,250,176,0.32)] hover:-translate-y-0.5"
              >
                Open Spyda <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-white/[0.04] py-12 px-4">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src="/assets/spyda-logo-drive.webp" alt="Spyda" className="w-6 h-6 object-contain opacity-50" />
            <span className="font-heading font-bold text-muted-foreground">Spyda</span>
            <span className="text-sm text-muted-foreground/50">© 2026</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground/50">
            <span>Reference-led design intelligence</span>
            <span className="hidden md:inline">·</span>
            <div className="hidden md:flex items-center gap-2">
              <span>Built by</span>
              <img src="/assets/vigency-logo-footer.png" alt="Vigency" className="h-5 opacity-50" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
