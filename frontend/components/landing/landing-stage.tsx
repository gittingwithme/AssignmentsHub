'use client'

import Link from 'next/link'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  FileText,
  CheckSquare,
  MessageSquare,
  Lightbulb,
  BookOpen,
  Award,
  ShieldCheck,
  Lock,
  Upload,
} from 'lucide-react'
import Reveal from '@/components/ui/shared/reveal'

/* Exact atmosphere plate — three synced instances (bg, lift pass, menu). */
const VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_132544_b6ef0174-ed95-45ad-9a2f-ccb8acfbdce8.mp4'

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

const stats = [
  { num: '300+', lab: 'Students helped' },
  { num: '99%', lab: 'Satisfaction' },
  { num: '24h', lab: 'Avg. turnaround' },
]

const navItems = [
  { href: '/services', label: 'Services' },
  { href: '/plans', label: 'Plans' },
  { href: '/faq', label: 'FAQ' },
  { href: '/terms', label: 'Terms' },
  { href: '/contact', label: 'Contact' },
]

const EXPO = 'cubic-bezier(.16,1,.3,1)'
const QUINT = 'cubic-bezier(.22,1,.36,1)'
const QUART = 'cubic-bezier(.25,1,.5,1)'
const TYPE = 'cubic-bezier(.22,.85,.24,1)'

function Chevron() {
  return (
    <svg viewBox="0 0 11 6" width="11.6" height="7.2" aria-hidden>
      <path d="M1 1L5.5 5L10 1" stroke="currentColor" strokeWidth="1.7" fill="none" />
    </svg>
  )
}

function Arrow() {
  return (
    <svg className="btn-arrow" viewBox="0 0 22 18" aria-hidden>
      <g stroke="#fff" strokeWidth="2" fill="none">
        <path d="M0 9H20.1" />
        <path d="M12.1 1L20.1 9L12.1 17" />
      </g>
    </svg>
  )
}

function LogoMark() {
  const arm = (
    <>
      <path d="M23 0V19.5" />
      <path d="M14 10.2L23 19.2L32 10.2" />
    </>
  )
  return (
    <svg className="logo-mark" viewBox="0 0 46 46" aria-hidden>
      <g stroke="#fff" strokeWidth="3" fill="none">
        <g transform="rotate(0 23 23)">{arm}</g>
        <g transform="rotate(90 23 23)">{arm}</g>
        <g transform="rotate(180 23 23)">{arm}</g>
        <g transform="rotate(270 23 23)">{arm}</g>
      </g>
    </svg>
  )
}

export default function LandingStage({ authenticated }: { authenticated: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const v1 = useRef<HTMLVideoElement>(null)
  const v2 = useRef<HTMLVideoElement>(null)
  const v3 = useRef<HTMLVideoElement>(null)

  const [open, setOpen] = useState(false)
  const [acc, setAcc] = useState<string | null>(null)
  const [scrolled, setScrolled] = useState(false)

  const ctaHref = authenticated ? '/dashboard' : '/sign-up'
  const ctaLabel = authenticated ? 'Go to dashboard' : 'Get started'

  /* ── Entrance arming. 'intro' is baked into the server HTML (no flash);
     disarm immediately when motion is reduced or WAAPI is unavailable. ── */
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const hasWAAPI = typeof document.documentElement.animate === 'function'
    if (!reduced && hasWAAPI) return
    document.documentElement.classList.remove('intro')
  }, [])

  /* ── One-shot WAAPI entrance ──
     Plays exactly once per real mount. The cleanup deliberately does NOT strip
     the 'intro' class: dev StrictMode runs mount → cleanup → mount, and removing
     it during the fake unmount revealed the finished page before the second
     mount re-ran the choreography over it — a visible flash. With the class
     intact the entrance simply restarts from its CSS-hidden state. */
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (typeof document.documentElement.animate !== 'function') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const phone = window.matchMedia('(max-width: 599px)').matches
    const m = phone ? 0.86 : 1
    const anims: Animation[] = []
    const timers: number[] = []
    let started = false
    let finished = false

    const finish = () => {
      if (finished) return
      finished = true
      timers.forEach((id) => window.clearTimeout(id))
      // Remove the hidden state BEFORE cancelling, so animations resolve back
      // to the visible base styles — no snap-back to opacity 0 at the end.
      document.documentElement.classList.remove('intro')
      anims.forEach((a) => a.cancel())
    }

    const t = (
      delay: number,
      dur: number,
      ease: string,
      keyframes: Keyframe[],
      target: Element | null,
      stagger = 0,
      index = 0,
    ) => {
      if (!target) return
      anims.push(
        target.animate(keyframes, {
          delay: (delay + index * stagger) * 1000 * m,
          duration: dur * 1000 * m,
          easing: ease,
          // Hold the end state until finish() strips 'intro' — otherwise the
          // element reverts to its hidden CSS state for a frame at the end.
          fill: 'forwards',
        }),
      )
    }

    const run = () => {
      const logo = root.querySelector<HTMLElement>('.landing-header .logo')
      const navLinks = Array.from(root.querySelectorAll<HTMLElement>('.landing-header .lnav a'))
      const burger = root.querySelector<HTMLElement>('.burger')
      const btnTop = root.querySelector<HTMLElement>('.btn-top')
      const lines = Array.from(root.querySelectorAll<HTMLElement>('.hero h1 .ln > span'))
      const sub = root.querySelector<HTMLElement>('.hero-sub')
      const btnCta = root.querySelector<HTMLElement>('.btn-cta')
      const rules = Array.from(root.querySelectorAll<HTMLElement>('.hero-stats .rule'))
      const nums = Array.from(root.querySelectorAll<HTMLElement>('.stat .num'))
      const labs = Array.from(root.querySelectorAll<HTMLElement>('.stat .lab'))

      const wipe = [
        { clipPath: 'inset(0 100% 0 0)' },
        { clipPath: 'inset(0 0% 0 0)' },
      ] as Keyframe[]

      t(0.0, 0.7, EXPO, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'scale(1)' }], logo)
      navLinks.forEach((el, i) => {
        t(0.12, 0.62, QUINT, [{ opacity: 0, transform: 'translateY(7px)' }, { opacity: 1, transform: 'translateY(0)' }], el, 0.055, i)
      })
      t(0.18, 0.55, QUART, [{ opacity: 0 }, { opacity: 1 }], burger)
      t(0.28, 0.66, EXPO, wipe, btnTop)
      lines.forEach((el, i) => {
        t(0.34, 0.98, TYPE, [{ transform: 'translateY(120%)' }, { transform: 'translateY(0%)' }], el, 0.09, i)
      })
      t(0.74, 0.72, QUINT, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'translateY(0)' }], sub)
      t(0.9, 0.7, EXPO, wipe, btnCta)
      rules.forEach((el, i) => {
        t(0.98, 0.6, QUART, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], el, 0.07, i)
      })
      nums.forEach((el, i) => {
        t(1.04, 0.66, QUINT, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], el, 0.085, i)
      })
      labs.forEach((el, i) => {
        t(1.1, 0.62, QUINT, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], el, 0.085, i)
      })

      const last = 1.1 + 0.62 + 0.085 * Math.max(1, labs.length - 1) + 0.05
      timers.push(window.setTimeout(finish, last * 1000 * m))
    }

    const guard = () => {
      if (started) return
      started = true
      run()
    }
    const fontsReady = Promise.race([
      document.fonts?.ready ?? Promise.resolve(),
      new Promise((r) => window.setTimeout(r, 1000)),
    ])
    fontsReady.then(() => window.requestAnimationFrame(guard))
    timers.push(window.setTimeout(guard, 4000))

    return () => {
      started = true
      finished = true
      timers.forEach((id) => window.clearTimeout(id))
      anims.forEach((a) => a.cancel())
    }
  }, [])

  /* ── Video sync: slaves track the master; reduced motion pauses all ── */
  useEffect(() => {
    const master = v1.current
    if (!master) return
    const slaves = [v2.current, v3.current].filter(Boolean) as HTMLVideoElement[]
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      master.pause()
      slaves.forEach((v) => v.pause())
      return
    }
    const onTick = () => {
      for (const v of slaves) {
        if (Math.abs(v.currentTime - master.currentTime) > 0.12) {
          v.currentTime = master.currentTime
        }
      }
    }
    master.addEventListener('timeupdate', onTick)
    return () => master.removeEventListener('timeupdate', onTick)
  }, [])

  /* ── Menu: body lock, Escape, resize to desktop ── */
  useEffect(() => {
    if (open) document.body.classList.add('nav-open')
    else document.body.classList.remove('nav-open')
    return () => document.body.classList.remove('nav-open')
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onResize = () => {
      if (window.innerWidth > 1023) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  /* ── Header scrim after scrolling into the body content ── */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const closeMenu = () => setOpen(false)
  const toggleAcc = (id: string) => setAcc((prev) => (prev === id ? null : id))

  return (
    <div className="landing-page" ref={rootRef}>
      {/* ── Fixed video stage ── */}
      <div className="landing-stage" aria-hidden>
        <div className="bg">
          <video ref={v1} src={VIDEO_URL} autoPlay muted loop playsInline preload="auto" />
        </div>
        <div className="bg2">
          <video ref={v2} src={VIDEO_URL} autoPlay muted loop playsInline preload="auto" />
        </div>
        <div className="scrim" />
        <div className="svgdefs">
          <svg xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <defs>
              <filter id="grade" colorInterpolationFilters="sRGB">
                <feComponentTransfer>
                  <feFuncR type="table" tableValues="0.0018 0.0105 0.0154 0.0228 0.0307 0.0404 0.0485 0.0585 0.0719 0.0923 0.1205 0.1466 0.1657 0.1866 0.2197 0.2405 0.2485 0.2921 0.3362 0.3465 0.3472 0.3781 0.3781 0.4078 0.4199 0.4391 0.4604 0.4763 0.4798 0.5197 0.5473 0.5720 0.5995 0.6048 0.6232 0.6322 0.6483 0.6734 0.7201 0.7201 0.7410 0.7707 0.7707 0.7790 0.8084 0.8084 0.8390 0.8595 0.8707 0.8870 0.8993 0.9085 0.9132 0.9132 0.9162 0.9162 0.9162 0.9162 0.9162 0.9162 0.9162 0.9162 0.9162 0.9238 0.9300" />
                  <feFuncG type="table" tableValues="0.0023 0.0106 0.0159 0.0250 0.0333 0.0445 0.0535 0.0620 0.0707 0.0827 0.0936 0.1063 0.1214 0.1402 0.1678 0.1727 0.2029 0.2176 0.2461 0.2757 0.2814 0.3050 0.3415 0.3692 0.3826 0.3884 0.4617 0.4617 0.4617 0.4643 0.4643 0.4808 0.5706 0.6005 0.6005 0.6390 0.6390 0.6390 0.6390 0.6390 0.6390 0.6390 0.6390 0.6390 0.6524 0.6664 0.6805 0.6945 0.7086 0.7227 0.7367 0.7508 0.7648 0.7789 0.7929 0.8070 0.8211 0.8351 0.8492 0.8632 0.8773 0.8913 0.9054 0.9195 0.9300" />
                  <feFuncB type="table" tableValues="0.0021 0.0110 0.0187 0.0311 0.0377 0.0466 0.0584 0.0706 0.0791 0.0924 0.1039 0.1145 0.1316 0.1464 0.1614 0.1719 0.1887 0.2014 0.2247 0.2458 0.2954 0.2954 0.3089 0.3938 0.3938 0.3988 0.3988 0.4581 0.4581 0.4762 0.4762 0.4763 0.5374 0.5560 0.5813 0.5813 0.5813 0.5813 0.5835 0.5969 0.6104 0.6238 0.6373 0.6507 0.6642 0.6777 0.6911 0.7046 0.7181 0.7315 0.7449 0.7584 0.7719 0.7853 0.7988 0.8123 0.8257 0.8391 0.8526 0.8661 0.8795 0.8930 0.9065 0.9199 0.9300" />
                </feComponentTransfer>
              </filter>
              <filter id="grade2" colorInterpolationFilters="sRGB">
                <feComponentTransfer>
                  <feFuncR type="table" tableValues="0.0016 0.0092 0.0136 0.0201 0.0270 0.0356 0.0427 0.0515 0.0633 0.0812 0.1060 0.1290 0.1458 0.1642 0.1933 0.2116 0.2187 0.2570 0.2959 0.3049 0.3055 0.3327 0.3327 0.3589 0.3695 0.3864 0.4052 0.4191 0.4222 0.4573 0.4816 0.5034 0.5276 0.5322 0.5484 0.5563 0.5705 0.5926 0.6337 0.6337 0.6521 0.6782 0.6782 0.6855 0.7114 0.7114 0.7383 0.7564 0.7662 0.7806 0.7914 0.7995 0.8036 0.8036 0.8063 0.8063 0.8063 0.8063 0.8063 0.8063 0.8063 0.8063 0.8063 0.8129 0.8184" />
                  <feFuncG type="table" tableValues="0.0015 0.0069 0.0103 0.0163 0.0216 0.0289 0.0348 0.0403 0.0460 0.0538 0.0608 0.0691 0.0789 0.0911 0.1091 0.1123 0.1319 0.1414 0.1600 0.1792 0.1829 0.1983 0.2220 0.2400 0.2487 0.2525 0.3001 0.3001 0.3001 0.3018 0.3018 0.3125 0.3709 0.3903 0.3903 0.4153 0.4153 0.4153 0.4153 0.4153 0.4153 0.4153 0.4153 0.4153 0.4241 0.4332 0.4423 0.4514 0.4606 0.4698 0.4789 0.4880 0.4971 0.5063 0.5154 0.5246 0.5337 0.5428 0.5520 0.5611 0.5702 0.5793 0.5885 0.5977 0.6045" />
                  <feFuncB type="table" tableValues="0.0013 0.0066 0.0112 0.0187 0.0226 0.0280 0.0350 0.0424 0.0475 0.0554 0.0623 0.0687 0.0790 0.0878 0.0968 0.1031 0.1132 0.1208 0.1348 0.1475 0.1772 0.1772 0.1853 0.2363 0.2363 0.2393 0.2393 0.2749 0.2749 0.2857 0.2857 0.2858 0.3224 0.3336 0.3488 0.3488 0.3488 0.3488 0.3501 0.3581 0.3662 0.3743 0.3824 0.3904 0.3985 0.4066 0.4147 0.4228 0.4309 0.4389 0.4469 0.4550 0.4631 0.4712 0.4793 0.4874 0.4954 0.5035 0.5116 0.5197 0.5277 0.5358 0.5439 0.5519 0.5580" />
                </feComponentTransfer>
              </filter>
            </defs>
          </svg>
        </div>
      </div>

      {/* ── Fixed header ── */}
      <header className={`landing-header${scrolled ? ' scrolled' : ''}`}>
        <Link href="/" className="logo" aria-label="AssignmentsHub — home">
          <LogoMark />
          <span className="wordmark">ASSIGNMENTSHUB</span>
        </Link>

        <nav className="lnav" aria-label="Primary">
          <Link href="/">Home</Link>
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hdr-right">
          <Link href={ctaHref} className="btn btn-top">
            <span className="btn-label">{ctaLabel}</span>
            <Arrow />
          </Link>
          <button
            type="button"
            className="burger"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="bars" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          </button>
        </div>
      </header>

      {/* ── Scroll body ── */}
      <main className="landing-main">
        <section className="hero">
          <div className="hero-head">
            <h1>
              <span className="ln">
                <span>Clearer academic</span>
              </span>
              <span className="ln">
                <span>support.</span>
              </span>
            </h1>
            <p className="hero-sub">
              Review, feedback, and guidance — engineered to keep your work
              clear, controlled, and submission-ready.
            </p>
            <div className="hero-cta">
              <Link href={ctaHref} className="btn btn-cta">
                <span className="btn-label">{ctaLabel}</span>
                <Arrow />
              </Link>
              <Link href="/plans" className="btn btn-ghost">
                <span className="btn-label">View plans</span>
              </Link>
            </div>
          </div>

          <div className="hero-stats">
            {stats.map((s, i) => (
              <div key={s.lab} style={{ display: 'contents' }}>
                <div className="stat">
                  <p className="num">{s.num}</p>
                  <p className="lab">{s.lab}</p>
                </div>
                {i < stats.length - 1 && <span className="rule" aria-hidden />}
              </div>
            ))}
          </div>
        </section>

        {/* ── Trust strip ── */}
        <div className="landing-body">
          <section className="ls-section" aria-label="Why AssignmentsHub">
            <Reveal>
              <div className="ls-trust">
                {trustPoints.map((item) => (
                  <div key={item.label}>
                    <span className="t-ico">
                      <item.icon aria-hidden />
                    </span>
                    <h3>{item.label}</h3>
                    <p>{item.detail}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </section>

          {/* ── Support categories ── */}
          <section className="ls-section" aria-label="Support categories">
            <Reveal>
              <p className="eyebrow">What we support</p>
              <h2>Support categories</h2>
              <p className="lead">
                Structured review, feedback, and guidance — delivered through a secure customer workflow.
              </p>
            </Reveal>
            <div className="ls-grid">
              {supportTypes.map((item, index) => (
                <Reveal key={item.name} delay={index * 0.05}>
                  <div>
                    <span className="g-ico">
                      <item.icon aria-hidden />
                    </span>
                    <span className="g-arrow" aria-hidden>
                      <svg viewBox="0 0 18 12" fill="none">
                        <path d="M0 6H16.4M10.6 1L16.4 6L10.6 11" stroke="currentColor" strokeWidth="1.6" />
                      </svg>
                    </span>
                    <h3>{item.name}</h3>
                    <p>{item.blurb}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>

          {/* ── Pricing ── */}
          <section className="ls-section" aria-label="Pricing">
            <Reveal>
              <p className="eyebrow">Pricing</p>
              <h2>Subscription-first pricing</h2>
              <p className="lead">
                Long-term plans are recommended. One-time work remains available for single requests.
                Manual bank transfer only.
              </p>
            </Reveal>
            <div className="ls-plans">
              {planCards.map((plan, index) => (
                <Reveal key={plan.name} delay={index * 0.08} className="h-full">
                  <div className={`ls-plan${plan.featured ? ' featured' : ''}`}>
                    <p className="p-name">{plan.name}</p>
                    <p className="p-price">
                      {plan.price}
                      <span>{plan.period}</span>
                    </p>
                    <p className="p-details">{plan.details}</p>
                    <div className="p-cta">
                      <Link href="/plans" className="btn">
                        <span className="btn-label">View details</span>
                        <Arrow />
                      </Link>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>

          {/* ── CTA band ── */}
          <section className="ls-section" aria-label="Built for trust and clarity" style={{ paddingBottom: 'clamp(80px, 10vw, 120px)' }}>
            <Reveal>
              <div className="ls-band">
                <p className="eyebrow">Why AssignmentsHub</p>
                <h2>Built for trust and clarity</h2>
                <p className="lead">
                  Manual payment approval, image-first submissions, and admin-ready workflows — without
                  ghostwriting or guaranteed grades.
                </p>
                <div className="hero-cta" style={{ marginTop: 0 }}>
                  <Link href="/how-it-works" className="btn btn-ghost">
                    <span className="btn-label">How it works</span>
                  </Link>
                  <Link href="/academic-integrity" className="btn btn-ghost">
                    <span className="btn-label">Academic integrity</span>
                  </Link>
                </div>
              </div>
            </Reveal>
          </section>
        </div>
      </main>

      {/* ── Mobile menu overlay ── */}
      <div id="menu" className="menu" role="dialog" aria-modal="true" aria-label="Menu" aria-hidden={!open}>
        <div className="menu-tex" aria-hidden>
          <video ref={v3} src={VIDEO_URL} autoPlay muted loop playsInline preload="auto" />
        </div>
        <div className="menu-rule" aria-hidden />
        <nav className="menu-inner" aria-label="Mobile navigation">
          <p className="menu-eyebrow">Menu</p>
          <ul className="menu-rows">
            <li className="mrow">
              <Link href="/" onClick={closeMenu}>
                Home
              </Link>
            </li>
            {navItems.map((item) => (
              <li className="mrow" key={item.href}>
                <Link href={item.href} onClick={closeMenu}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="menu-foot">
            <Link href={ctaHref} onClick={closeMenu} className="btn btn-menu">
              <span className="btn-label">{ctaLabel}</span>
              <Arrow />
            </Link>
            <p className="menu-note">300+ students&nbsp;/&nbsp;99% satisfaction</p>
          </div>
        </nav>
      </div>
    </div>
  )
}
