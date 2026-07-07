import { Link } from 'react-router-dom'
import {
  ArrowRight, Home, Trees, Workflow, Landmark, Search, Send,
  ShieldCheck, MapPin, TrendingUp, Check,
} from 'lucide-react'

function Nav() {
  return (
    <header className="sticky top-0 z-20 backdrop-blur bg-background/80 border-b border-border">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Home className="w-[18px] h-[18px] text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="font-semibold text-[15px] tracking-tight">Tracque</span>
        </div>
        <Link to="/app/properties" className="text-sm font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90">
          Open app
        </Link>
      </div>
    </header>
  )
}

function StrategyCard({ icon: Icon, title, body }: { icon: typeof Home; title: string; body: string }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-6 lift">
      <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-brand" strokeWidth={2} />
      </div>
      <h3 className="font-semibold text-foreground mb-1.5">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  )
}

function Step({ n, icon: Icon, title, body }: { n: string; icon: typeof Home; title: string; body: string }) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0">
        <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center num text-sm font-semibold">{n}</div>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-4 h-4 text-brand" strokeWidth={2} />
          <h3 className="font-semibold text-foreground">{title}</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
      </div>
    </div>
  )
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full border border-border bg-card mb-6">
          <MapPin className="w-3.5 h-3.5 text-brand" /> Built for Nashville · works anywhere
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight max-w-3xl mx-auto leading-[1.1]">
          Find creative-finance real estate deals before anyone else.
        </h1>
        <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Tracque scans listings and county records to surface motivated sellers — free-and-clear owners, pre-foreclosures, out-of-state landowners — scores them for seller financing, subject-to, and land wholesaling, then automates the outreach. You work the close.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <Link to="/app/properties" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90">
            Open the Deal Finder <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/app/land" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-border font-medium hover:border-primary/50">
            Land &amp; Wholesale
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Runs on realistic demo data instantly · connect RentCast + county records to go live</p>
      </section>

      {/* Strategies */}
      <section className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StrategyCard icon={Landmark} title="Seller financing" body="Score free-and-clear, long-tenure owners who can carry the note — the cleanest creative-finance lane, with deal math grounded in real market terms." />
          <StrategyCard icon={Home} title="Subject-to" body="Surface low-rate, 2020–21 vintage mortgages worth taking over, with motivation signals and due-on-sale reality baked in." />
          <StrategyCard icon={Trees} title="Land wholesaling" body="Rank tax-delinquent, out-of-state landowners for principal wholesaling — with Tennessee SB 909 disclosures generated per deal." />
          <StrategyCard icon={Workflow} title="Automated pipeline" body="Recurring scans surface new leads, skip-trace and draft outreach automatically, and drop them into a pipeline you close by hand." />
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold tracking-tight mb-2">The funnel, automated</h2>
        <p className="text-muted-foreground mb-10">Everything up to the handshake runs on its own. The close stays human — because it has to.</p>
        <div className="space-y-8">
          <Step n="1" icon={Search} title="Source" body="Pull active listings (RentCast) and every residential parcel in the county (free public records). No Zillow scraping — real, licensable data." />
          <Step n="2" icon={TrendingUp} title="Score" body="Rank each property by strategy fit — free-and-clear, equity, tenure, absentee, pre-foreclosure, tax delinquency — with the deal math and comps attached." />
          <Step n="3" icon={Send} title="Reach" body="Auto skip-trace and draft owner-directed outreach, sent on a schedule with CAN-SPAM compliance and a dry-run safety net." />
          <Step n="4" icon={ShieldCheck} title="Close" body="Work the pipeline stages, generate the required disclosures, and structure the deal with your attorney. The part software shouldn't touch." />
        </div>
      </section>

      {/* Honesty band */}
      <section className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8">
          <h3 className="font-semibold text-foreground mb-3">Built straight.</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              'Real data sources (RentCast + county records + optional lien data) — no terms-of-service violations.',
              'Outreach compliance is in the code: physical address, unsubscribe, suppression list, dry-run by default.',
              'Principal-only guardrails for wholesaling — no unlicensed brokering.',
              'Surfaces opportunities and drafts paperwork; it does not give legal advice. Structure deals with a real-estate attorney.',
            ].map((t, i) => (
              <li key={i} className="flex gap-2"><Check className="w-4 h-4 text-brand shrink-0 mt-0.5" />{t}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight">Start finding deals now.</h2>
        <p className="mt-3 text-muted-foreground">The demo runs instantly. Connect your data when you're ready to go live.</p>
        <Link to="/app/properties" className="mt-7 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90">
          Open Tracque <ArrowRight className="w-4 h-4" />
        </Link>
      </section>

      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between text-sm text-muted-foreground">
          <span>Tracque · Deal intelligence</span>
          <span className="text-xs">Not legal or financial advice.</span>
        </div>
      </footer>
    </div>
  )
}
