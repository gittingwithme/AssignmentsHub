import Link from 'next/link'
import PublicPageShell from '@/components/ui/shared/public-page-shell'

const weeklyPlans = [
  {
    name: 'Basic Weekly',
    price: '€24/week',
    points: ['2 uploads per rolling 24h', '1 active order', 'Limited quota', '1 revision'],
  },
  {
    name: 'Standard Weekly',
    price: '€39/week',
    points: ['3 uploads per rolling 24h', '2 active orders', 'Larger quota', '2 revisions'],
    featured: true,
  },
  {
    name: 'Premium Weekly',
    price: '€59/week',
    points: ['5 uploads per rolling 24h', '3 active orders', 'Higher quota', 'Priority handling'],
  },
]

const monthlyPlans = [
  {
    name: 'Basic Monthly',
    price: '€69/month',
    points: ['2 uploads per rolling 24h', '1 active order', 'Moderate quota', '1 revision'],
  },
  {
    name: 'Standard Monthly',
    price: '€119/month',
    points: ['3 uploads per rolling 24h', '2 active orders', 'Larger quota', '2 revisions'],
    featured: true,
  },
  {
    name: 'Premium Monthly',
    price: '€199/month',
    points: ['5 uploads per rolling 24h', '3 active orders', 'High quota', 'Priority handling'],
  },
]

function PlanCard({
  name,
  price,
  points,
  featured,
}: {
  name: string
  price: string
  points: string[]
  featured?: boolean
}) {
  return (
    <div className={`premium-card p-5 ${featured ? 'border-white/20 bg-white/[0.06]' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-zinc-400">{name}</p>
          <h3 className="mt-3 text-3xl font-semibold text-white">{price}</h3>
        </div>
        {featured ? <div className="status-chip">Recommended</div> : null}
      </div>

      <ul className="mt-5 space-y-2 text-sm leading-7 text-zinc-400">
        {points.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>

      <Link href="/dashboard/subscription" className="premium-button mt-6 w-full">
        Choose plan
      </Link>
    </div>
  )
}

export default function PlansPage() {
  return (
    <PublicPageShell
      eyebrow="Plans"
      title="Subscription plans designed for ongoing support"
      description="AssignmentsHub recommends subscriptions over one-time work because they provide better continuity, clearer limits, and stronger long-term value."
    >
      <div className="premium-card p-6 md:p-8">
        <h2 className="text-2xl font-semibold text-white">Weekly plans</h2>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {weeklyPlans.map((plan) => (
            <PlanCard key={plan.name} {...plan} />
          ))}
        </div>
      </div>

      <div className="mt-8 premium-card p-6 md:p-8">
        <h2 className="text-2xl font-semibold text-white">Monthly plans</h2>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {monthlyPlans.map((plan) => (
            <PlanCard key={plan.name} {...plan} />
          ))}
        </div>
      </div>

      <div className="mt-8 premium-card p-6">
        <h3 className="text-lg font-semibold text-white">Important billing note</h3>
        <p className="mt-3 text-sm leading-7 text-zinc-400">
          Plan activation happens after manual bank-transfer approval. If you are not signed in,
          choosing a plan will first require you to log in or create an account.
        </p>
      </div>
    </PublicPageShell>
  )
}
