import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, ChevronDown, Bot, Search, Zap, BarChart3, Globe, Sparkles, TrendingUp, DollarSign } from 'lucide-react'

// ── Accordion ─────────────────────────────────────────────

function Accordion({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-[#E8E4DF] rounded-2xl overflow-hidden bg-white">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-5 text-left"
      >
        <span className="text-[15px] font-semibold text-[#1a1a1a] pr-8">{question}</span>
        <div className="w-8 h-8 rounded-full bg-[#F5F0EB] flex items-center justify-center shrink-0">
          <ChevronDown className={`w-4 h-4 text-[#1a1a1a] transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <>
          <div className="h-px bg-[#E8E4DF] mx-6" />
          <p className="px-6 py-5 text-[15px] text-[#4a4a4a] leading-relaxed">{answer}</p>
        </>
      )}
    </div>
  )
}

// ── Pricing card ───────────────────────────────────────────

function PricingCard({
  name, price, desc, features, cta, highlighted = false
}: {
  name: string
  price: string
  desc: string
  features: string[]
  cta: string
  highlighted?: boolean
}) {
  return (
    <div className={`rounded-2xl p-8 flex flex-col ${
      highlighted
        ? 'bg-[#1a1a1a] text-white'
        : 'bg-white border border-[#E8E4DF] text-[#1a1a1a]'
    }`}>
      <div className="mb-6">
        <p className={`text-xs font-semibold uppercase tracking-widest mb-2 ${highlighted ? 'text-[#a0a0a0]' : 'text-[#888]'}`}>{name}</p>
        <p className="text-4xl font-bold mb-1">{price}</p>
        <p className={`text-sm ${highlighted ? 'text-[#a0a0a0]' : 'text-[#888]'}`}>{desc}</p>
      </div>
      <ul className="space-y-3 flex-1 mb-8">
        {features.map(f => (
          <li key={f} className="flex items-start gap-3">
            <Check className={`w-4 h-4 mt-0.5 shrink-0 ${highlighted ? 'text-white' : 'text-[#1a1a1a]'}`} />
            <span className={`text-sm ${highlighted ? 'text-[#d0d0d0]' : 'text-[#4a4a4a]'}`}>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/app/dashboard"
        className={`w-full py-3 rounded-xl text-sm font-semibold text-center transition-colors ${
          highlighted
            ? 'bg-white text-[#1a1a1a] hover:bg-[#f0f0f0]'
            : 'bg-[#1a1a1a] text-white hover:bg-[#333]'
        }`}
      >
        {cta}
      </Link>
    </div>
  )
}

// ── Comparison row ─────────────────────────────────────────

function CompRow({ feature, tracque, profound, heyamos, peec }: {
  feature: string
  tracque: boolean | string
  profound: boolean | string
  heyamos: boolean | string
  peec: boolean | string
}) {
  function Cell({ val }: { val: boolean | string }) {
    if (val === true) return <Check className="w-4 h-4 text-[#1a1a1a] mx-auto" />
    if (val === false) return <span className="text-[#ccc] text-lg mx-auto block text-center">—</span>
    return <span className="text-xs text-[#4a4a4a] text-center block">{val}</span>
  }
  return (
    <tr className="border-b border-[#E8E4DF]">
      <td className="py-3.5 pr-6 text-sm text-[#1a1a1a]">{feature}</td>
      <td className="py-3.5 text-center"><Cell val={tracque} /></td>
      <td className="py-3.5 text-center"><Cell val={profound} /></td>
      <td className="py-3.5 text-center"><Cell val={heyamos} /></td>
      <td className="py-3.5 text-center"><Cell val={peec} /></td>
    </tr>
  )
}

// ── Main ───────────────────────────────────────────────────

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#FAF9F7] text-[#1a1a1a]" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#1a1a1a] flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight">Tracque</span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          {['Features', 'Pricing', 'Compare', 'FAQ'].map(item => (
            <a key={item} href={`#${item.toLowerCase()}`} className="text-sm text-[#4a4a4a] hover:text-[#1a1a1a] transition-colors">
              {item}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Link to="/app/dashboard" className="text-sm text-[#4a4a4a] hover:text-[#1a1a1a]">Log in</Link>
          <Link to="/app/dashboard" className="text-sm bg-[#1a1a1a] text-white px-4 py-2 rounded-xl font-medium hover:bg-[#333] transition-colors">
            Start free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-8 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-[#E8E4DF] rounded-full text-xs text-[#4a4a4a] mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          AI visibility + SEO + revenue attribution in one platform
        </div>
        <h1 className="text-5xl md:text-6xl font-bold leading-[1.1] tracking-tight mb-6">
          Track your brand across<br />
          <span className="text-[#888]">every AI engine.</span><br />
          Measure what it's worth.
        </h1>
        <p className="text-lg text-[#4a4a4a] max-w-2xl mx-auto mb-10 leading-relaxed">
          Tracque shows you if ChatGPT, Perplexity, Gemini, and Claude mention your brand —
          then traces every AI mention through to clicks, trials, and revenue.
          The only tool that closes the loop.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            to="/app/dashboard"
            className="flex items-center gap-2 bg-[#1a1a1a] text-white px-6 py-3.5 rounded-xl font-semibold hover:bg-[#333] transition-colors"
          >
            Start for free <ArrowRight className="w-4 h-4" />
          </Link>
          <a href="#compare" className="px-6 py-3.5 rounded-xl border border-[#E8E4DF] text-sm font-medium text-[#4a4a4a] hover:border-[#1a1a1a] hover:text-[#1a1a1a] transition-colors bg-white">
            See how we compare
          </a>
        </div>
        <p className="text-xs text-[#888] mt-4">Free plan available · No credit card required</p>
      </section>

      {/* Stats bar */}
      <section className="border-y border-[#E8E4DF] bg-white py-8">
        <div className="max-w-4xl mx-auto px-8 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { val: '5', label: 'AI models tracked' },
            { val: '40–60%', label: 'Monthly citation drift' },
            { val: '$19/mo', label: 'Starting price' },
            { val: '100%', label: 'Attribution coverage' },
          ].map(({ val, label }) => (
            <div key={label}>
              <p className="text-3xl font-bold">{val}</p>
              <p className="text-xs text-[#888] mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-8 py-20">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#888] mb-3">How it works</p>
        <h2 className="text-3xl font-bold mb-12">From AI mention to revenue — fully tracked.</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              step: '01',
              icon: Bot,
              title: 'Track',
              desc: 'Tracque queries ChatGPT, Perplexity, Gemini, Claude, and Grok daily with your keywords. See exactly where you appear, at what position, and with what sentiment vs competitors.',
            },
            {
              step: '02',
              icon: Zap,
              title: 'Act',
              desc: 'Get specific, ranked recommendations with ready-to-use templates. Not "improve your content" — exact actions like which Reddit thread to answer, which G2 reviews to get, which page to rewrite.',
            },
            {
              step: '03',
              icon: DollarSign,
              title: 'Measure',
              desc: 'Every AI mention traced to a session, every session to a conversion, every conversion to revenue. See which AI engine drives the highest-value customers — not just the most traffic.',
            },
          ].map(({ step, icon: Icon, title, desc }) => (
            <div key={step} className="bg-white border border-[#E8E4DF] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-9 h-9 rounded-xl bg-[#FAF9F7] flex items-center justify-center">
                  <Icon className="w-4 h-4 text-[#1a1a1a]" />
                </div>
                <span className="text-xs font-bold text-[#ccc]">{step}</span>
              </div>
              <p className="font-bold text-lg mb-2">{title}</p>
              <p className="text-sm text-[#4a4a4a] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-white border-y border-[#E8E4DF] py-20">
        <div className="max-w-4xl mx-auto px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#888] mb-3">Features</p>
          <h2 className="text-3xl font-bold mb-12">Everything in one platform.</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { icon: Bot, title: 'AI Visibility', desc: 'Track brand mentions across ChatGPT, Perplexity, Gemini, Claude, and Grok. See mention rate, sentiment, position, and citation sources. Updated daily.' },
              { icon: Search, title: 'SEO Rankings', desc: 'Google position tracking alongside AI visibility. See the full picture — where you rank in traditional search and how it affects AI citations.' },
              { icon: Sparkles, title: 'Prompt Discovery', desc: 'Find what people actually ask AI about your category. Sourced from Google People Also Ask, autocomplete, Perplexity related questions, Reddit, and Google Trends.' },
              { icon: Zap, title: 'Recommendations', desc: 'Claude analyzes your data and outputs specific actions with ready-to-use templates. Each recommendation tied to exact data points, ranked by impact.' },
              { icon: Globe, title: 'Site Audit', desc: 'Crawl your site and auto-generate a complete GA4 event schema + GTM container. Set up AI bot tracking in 5 minutes, not 5 days.' },
              { icon: BarChart3, title: 'Attribution', desc: 'Trace AI mentions → clicks → conversions → revenue. See which AI engine drives the highest LTV customers. Connect GA4 and Stripe for the full picture.' },
              { icon: TrendingUp, title: 'Confidence Scores', desc: 'Every metric backed by multiple scan runs. Not a single snapshot — statistical confidence from 3–5 runs per keyword, per model, per day.' },
              { icon: DollarSign, title: 'UTM Tracking', desc: 'Auto-capture utm_source=perplexity, utm_source=chatgpt and AI referrer headers. See AI traffic alongside paid and organic in one view.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-4 p-5 rounded-2xl border border-[#E8E4DF]">
                <div className="w-8 h-8 rounded-lg bg-[#FAF9F7] flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-[#1a1a1a]" />
                </div>
                <div>
                  <p className="font-semibold mb-1">{title}</p>
                  <p className="text-sm text-[#4a4a4a] leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The loop */}
      <section className="max-w-4xl mx-auto px-8 py-20">
        <div className="bg-[#1a1a1a] rounded-2xl p-10 text-white text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#666] mb-4">The full loop</p>
          <h2 className="text-3xl font-bold mb-8">From AI question to closed deal.</h2>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {[
              'Buyer asks ChatGPT',
              'You get mentioned',
              'They click through',
              'UTM captured',
              'They convert',
              'Revenue tracked',
            ].map((step, i, arr) => (
              <div key={step} className="flex items-center gap-3">
                <div className="px-4 py-2 bg-white/10 rounded-xl text-sm font-medium">{step}</div>
                {i < arr.length - 1 && <ArrowRight className="w-4 h-4 text-[#444]" />}
              </div>
            ))}
          </div>
          <p className="text-sm text-[#888] mt-8">No other tool tracks this end-to-end. Profound stops at mentions. HeyAmos stops at actions. Tracque tracks the money.</p>
        </div>
      </section>

      {/* Comparison */}
      <section id="compare" className="bg-white border-y border-[#E8E4DF] py-20">
        <div className="max-w-4xl mx-auto px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#888] mb-3">Compare</p>
          <h2 className="text-3xl font-bold mb-10">More features. A fraction of the price.</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E8E4DF]">
                  <th className="py-3 pr-6 text-left text-sm font-semibold">Feature</th>
                  {[
                    { name: 'Tracque', price: '$19/mo', highlight: true },
                    { name: 'Profound', price: '$399/mo', highlight: false },
                    { name: 'HeyAmos', price: '$99/mo', highlight: false },
                    { name: 'Peec', price: '$150/mo', highlight: false },
                  ].map(({ name, price, highlight }) => (
                    <th key={name} className="py-3 text-center">
                      <p className={`text-sm font-bold ${highlight ? 'text-[#1a1a1a]' : 'text-[#888]'}`}>{name}</p>
                      <p className={`text-xs mt-0.5 ${highlight ? 'text-[#1a1a1a]' : 'text-[#aaa]'}`}>{price}</p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <CompRow feature="AI visibility tracking"     tracque={true}        profound={true}    heyamos={true}     peec={true} />
                <CompRow feature="SEO rank tracking"          tracque={true}        profound={false}   heyamos={false}    peec={false} />
                <CompRow feature="Unlimited prompts"          tracque={true}        profound={true}    heyamos={false}    peec={false} />
                <CompRow feature="All 5 AI models"            tracque={true}        profound={true}    heyamos={'Pro only'} peec={'Starter: 1'} />
                <CompRow feature="Confidence scoring"         tracque={true}        profound={false}   heyamos={false}    peec={false} />
                <CompRow feature="Revenue attribution"        tracque={true}        profound={false}   heyamos={false}    peec={false} />
                <CompRow feature="UTM tracking"               tracque={true}        profound={false}   heyamos={false}    peec={false} />
                <CompRow feature="GA4 integration"            tracque={true}        profound={false}   heyamos={false}    peec={false} />
                <CompRow feature="Prompt discovery"           tracque={true}        profound={true}    heyamos={false}    peec={false} />
                <CompRow feature="Deep recommendations"       tracque={true}        profound={'Basic'} heyamos={'5/week'} peec={'Basic'} />
                <CompRow feature="Site audit + GA4 setup"     tracque={true}        profound={false}   heyamos={false}    peec={false} />
                <CompRow feature="AI bot traffic tracking"    tracque={true}        profound={true}    heyamos={false}    peec={false} />
                <CompRow feature="Free tier"                  tracque={true}        profound={false}   heyamos={false}    peec={false} />
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-4xl mx-auto px-8 py-20">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#888] mb-3">Pricing</p>
        <h2 className="text-3xl font-bold mb-3">Simple, transparent pricing.</h2>
        <p className="text-[#4a4a4a] mb-10">Profound charges $399/mo for monitoring alone. Tracque gives you monitoring, SEO, attribution, and recommendations — starting free.</p>
        <div className="grid md:grid-cols-3 gap-5">
          <PricingCard
            name="Starter"
            price="Free"
            desc="Forever free, no card needed"
            features={[
              '1 brand',
              '10 keywords',
              '3 AI models',
              'Daily scans',
              'Basic recommendations',
            ]}
            cta="Start free"
          />
          <PricingCard
            name="Pro"
            price="$19/mo"
            desc="Everything you need to grow"
            features={[
              '5 brands',
              'Unlimited keywords',
              'All 5 AI models',
              'SEO rank tracking',
              'Revenue attribution',
              'GA4 + UTM tracking',
              'Deep recommendations',
              'Site audit',
            ]}
            cta="Start Pro"
            highlighted
          />
          <PricingCard
            name="Agency"
            price="$49/mo"
            desc="For agencies and larger teams"
            features={[
              'Unlimited brands',
              'Unlimited keywords',
              'All 5 AI models',
              'White-label reports',
              'Client workspaces',
              'API access',
              'Priority support',
            ]}
            cta="Start Agency"
          />
        </div>
        <p className="text-center text-xs text-[#888] mt-6">All plans include a 14-day trial of Pro features · Cancel anytime</p>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-white border-y border-[#E8E4DF] py-20">
        <div className="max-w-2xl mx-auto px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#888] mb-3">FAQ</p>
          <h2 className="text-3xl font-bold mb-8">Common questions.</h2>
          <div className="space-y-3">
            <Accordion
              question="How does Tracque track AI visibility?"
              answer="Tracque queries the AI model APIs (ChatGPT, Perplexity, Gemini, Claude, Grok) with your keywords daily, runs each query multiple times to build statistical confidence, parses responses for brand mentions, sentiment, position, and cited sources — then stores everything historically so you can see trends over time."
            />
            <Accordion
              question="How is this different from Profound or HeyAmos?"
              answer="Those tools stop at visibility scores. Tracque closes the full loop — from AI mention to UTM capture to GA4 conversion to revenue. We're also the only tool that combines AI visibility with traditional SEO ranking data. And we start at $19/mo vs $399/mo for Profound."
            />
            <Accordion
              question="What is GEO / AEO?"
              answer="GEO (Generative Engine Optimization) is the practice of making your brand more likely to be cited and recommended by AI engines like ChatGPT and Perplexity. AEO (Answer Engine Optimization) focuses specifically on getting your content chosen as the direct answer. Both are increasingly important as AI handles more of the buyer research journey."
            />
            <Accordion
              question="How does revenue attribution work?"
              answer="When someone clicks from an AI engine to your site, they arrive with a referrer (perplexity.ai, chat.openai.com) or UTM parameters. Tracque captures these via GA4 integration and a lightweight tracking snippet, then connects them to your conversion events and Stripe revenue data — so you can see exactly which AI engine drove which customers."
            />
            <Accordion
              question="Is it accurate? AI responses vary every time."
              answer="Yes — this is exactly why we run 3–5 queries per keyword per model per day and report confidence scores rather than single snapshots. A 'mention rate' of 80% means your brand appeared in 4 out of 5 runs. We show you the confidence interval, not fake precision."
            />
            <Accordion
              question="Do I need technical knowledge to set it up?"
              answer="No. Add your brand, add keywords, and click Run Scan. The Site Audit generates your GA4 setup automatically — you just import a JSON file into Google Tag Manager. Most customers are seeing real data within 30 minutes of signing up."
            />
            <Accordion
              question="What about the Perplexity / ChatGPT API vs the real interface?"
              answer="Good question. We use web-grounded API calls where available (Perplexity's online model, Gemini with Search grounding, ChatGPT with web search tool) which closely match what users see in the real interfaces. We're transparent about this — our data is directional intelligence, not a census of every ChatGPT conversation."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-8 py-20 text-center">
        <h2 className="text-4xl font-bold mb-4">Start tracking what actually matters.</h2>
        <p className="text-[#4a4a4a] mb-8 max-w-xl mx-auto">
          AI search is where your next customer starts their research. Know if you're there — and prove it drove revenue.
        </p>
        <Link
          to="/app/dashboard"
          className="inline-flex items-center gap-2 bg-[#1a1a1a] text-white px-8 py-4 rounded-xl font-semibold hover:bg-[#333] transition-colors text-base"
        >
          Start free today <ArrowRight className="w-4 h-4" />
        </Link>
        <p className="text-xs text-[#888] mt-4">Free plan · No credit card · Set up in 5 minutes</p>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#E8E4DF] py-8">
        <div className="max-w-4xl mx-auto px-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[#1a1a1a] flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-bold">Tracque</span>
          </div>
          <p className="text-xs text-[#888]">© 2026 Tracque. AI visibility + SEO + attribution.</p>
          <div className="flex gap-4">
            {['Privacy', 'Terms'].map(l => (
              <a key={l} href="#" className="text-xs text-[#888] hover:text-[#1a1a1a]">{l}</a>
            ))}
          </div>
        </div>
      </footer>

    </div>
  )
}
