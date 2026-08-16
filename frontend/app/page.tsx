import Link from 'next/link'
import { Cormorant_Garamond } from 'next/font/google'
import {
  FileText,
  CheckSquare,
  MessageSquare,
  Lightbulb,
  BookOpen,
  Award,
  ArrowRight,
  ShieldCheck,
  Lock,
  Upload,
} from 'lucide-react'
import SiteHeader from '@/components/ui/shared/site-header'
import HeroVisual from '@/components/ui/shared/hero-visual-lazy'
import Reveal from '@/components/ui/shared/reveal'
import { siteConfig } from '@/lib/site-config'
import { createClient } from '@/lib/supabase/server'

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

const supportTypes = [
  { name: 'Assignment review', icon: FileText, blurb: 'Detailed, structured feedback on your draft.' },
  { name: 'Rubric review', icon: CheckSquare, blurb: 'Align your work against grading criteria.' },
  { name: 'Feedback and suggestions', icon: MessageSquare, blurb: 'Actionable notes to refine your thinking.' },
  { name: 'Concept explanation', icon: Lightbulb, blurb: 'Clarity on the ideas behind your topic.' },
  { name: 'Citation guidance', icon: BookOpen, blurb: 'Confident, correct referencing support.' },
  { name: 'Submission-readiness review', icon: Award, blurb: 'A final check before you submit.' },
]

const planCards = [
  {
    name: 'Basic Weekly',
    price: '€24',
    period: '/week',
    details: '2 uploads / 24h · 1 active order · 1 revision',
  },
  {
    name: 'Standard Monthly',
    price: '€119',
    period: '/month',
    details: '3 uploads / 24h · 2 active orders · 2 revisions',
    featured: true,
  },
  {
    name: 'Premium Monthly',
    price: '€199',
    period: '/month',
    details: '5 uploads / 24h · 3 active orders · priority handling',
  },
]

const trustPoints = [
  { icon: ShieldCheck, label: 'Academic-integrity first', detail: 'Review and guidance — never ghostwriting.' },
  { icon: Lock, label: 'Manual payment approval', detail: 'Bank-transfer billing, reviewed by hand.' },
  { icon: Upload, label: 'Image-first submissions', detail: 'Clear, auditable request workflow.' },
]

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="flex min-h-screen flex-col w-full">
      <SiteHeader />

      {/* ── Hero ── */}
      <section className="page-wrap pt-10 pb-16 md:pt-16 md:pb-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <Reveal onMount className="max-w-3xl">
            <div 
              className="mp-badge mb-6 inline-flex border-[rgba(16,185,129,0.30)] bg-[var(--brand-900)] text-[var(--brand-300)]"
            >
              <span className="mr-2 relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--brand-400)] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--brand-400)]" />
              </span>
              Legitimate academic support workspace
            </div>

            <h1
              className={`${cormorant.className} text-[var(--ink)] text-5xl leading-[0.92] md:text-7xl xl:text-[6.5rem]`}
            >
              Clearer
              <br />
              <span style={{ 
                background: 'linear-gradient(90deg, var(--brand-300) 0%, #a7f3d0 100%)', 
                WebkitBackgroundClip: 'text', 
                WebkitTextFillColor: 'transparent' 
              }}>
                academic
              </span>
              <br />
              support.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-8 text-[var(--ink-muted)] md:text-lg">
              {siteConfig.defaultSeoDescription}
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              {user ? (
                <Link href="/dashboard" className="mp-btn mp-btn-primary min-w-[180px]">
                  Go to Dashboard
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              ) : (
                <Link href="/sign-up" className="mp-btn mp-btn-primary min-w-[180px]">
                  Get started
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              )}
              <Link href="/plans" className="mp-btn mp-btn-secondary min-w-[180px]">
                View plans
              </Link>
            </div>
          </Reveal>

          <Reveal onMount delay={0.1}>
            <HeroVisual />
          </Reveal>
        </div>
      </section>

      {/* ── Trust strip ── */}
      <section className="page-wrap pb-12 md:pb-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {trustPoints.map((item) => (
            <div key={item.label} className="mp-card flex items-center gap-4 p-5">
              <div 
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{
                  border: '1px solid rgba(16,185,129,0.30)',
                  backgroundColor: 'var(--brand-900)',
                  color: 'var(--brand-300)',
                }}
              >
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--ink)]">{item.label}</p>
                <p className="mt-0.5 text-xs text-[var(--ink-faint)]">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Support categories ── */}
      <section className="page-wrap py-12 md:py-16">
        <Reveal className="mb-10 max-w-2xl">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-[var(--ink-faint)]">
            What we support
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">
            Support categories
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--ink-muted)] md:text-base">
            Structured review, feedback, and guidance — delivered through a secure customer workflow.
          </p>
        </Reveal>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {supportTypes.map((item, index) => {
            return (
              <Reveal key={item.name} delay={index * 0.05}>
                <div className="mp-card group flex h-full flex-col gap-4 p-5 transition-colors hover:border-[var(--hairline-strong)]">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors border border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--ink-muted)] group-hover:border-[rgba(16,185,129,0.30)] group-hover:bg-[var(--brand-900)] group-hover:text-[var(--brand-300)]"
                  >
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--ink)]">
                      {item.name}
                    </p>
                    <p className="mt-1.5 text-xs leading-6 text-[var(--ink-faint)]">{item.blurb}</p>
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="page-wrap py-12 md:py-16">
        <Reveal className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-[var(--ink-faint)]">
              Pricing
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">
              Subscription-first pricing
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--ink-muted)] md:text-base">
              Long-term plans are recommended. One-time work remains available for single requests.
            </p>
          </div>
          <div className="mp-badge font-medium">Manual bank transfer only</div>
        </Reveal>

        <div className="grid gap-6 lg:grid-cols-3">
          {planCards.map((plan, index) => {
            const isFeatured = plan.featured
            const cardClass = isFeatured ? 'mp-card border-[rgba(16,185,129,0.25)]' : 'mp-card'

            return (
              <Reveal key={plan.name} delay={index * 0.08} className="h-full">
                <div className={`${cardClass} flex h-full flex-col p-8`}>
                  <div className="flex items-start justify-between">
                    <p className="text-sm font-medium text-[var(--ink-muted)]">{plan.name}</p>
                    {isFeatured && <div className="mp-badge mp-badge-brand">Recommended</div>}
                  </div>

                  <div className="mt-6 flex items-baseline gap-1">
                    <h3 className="text-4xl font-bold text-[var(--ink)]">
                      {plan.price}
                    </h3>
                    <span className="text-sm text-[var(--ink-faint)]">{plan.period}</span>
                  </div>

                  <p className="mt-6 text-sm leading-relaxed text-[var(--ink-muted)]">{plan.details}</p>

                  <div className="mt-auto pt-8">
                    <Link
                      href="/plans"
                      className={`w-full flex justify-center mp-btn ${isFeatured ? 'mp-btn-primary' : 'mp-btn-secondary'}`}
                    >
                      View details
                    </Link>
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>
      </section>

      {/* ── CTA band ── */}
      <section className="page-wrap py-12 pb-20 md:py-16 md:pb-28 flex-1">
        <Reveal>
          <div className="mp-card relative overflow-hidden p-8 md:p-14 border-[var(--hairline-strong)] bg-[var(--surface-sunken)]">
            <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full" style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)' }} />
            <div className="pointer-events-none absolute -left-20 -bottom-20 h-72 w-72 rounded-full" style={{ background: 'radial-gradient(circle, rgba(52,211,153,0.06) 0%, transparent 70%)' }} />

            <div className="relative z-10 max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">Built for trust and clarity</h2>
              <p className="mt-4 text-base leading-relaxed text-[var(--ink-muted)]">
                Manual payment approval, image-first submissions, and admin-ready workflows — without
                ghostwriting or guaranteed grades.
              </p>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <Link href="/how-it-works" className="mp-btn mp-btn-secondary">
                  How it works
                </Link>
                <Link href="/academic-integrity" className="mp-btn mp-btn-secondary">
                  Academic integrity
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  )
}
