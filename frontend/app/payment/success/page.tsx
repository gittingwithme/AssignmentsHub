import Link from 'next/link'
import PublicPageShell from '@/components/ui/shared/public-page-shell'

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; order_id?: string; plan_id?: string }>
}) {
  const { order_id, plan_id } = await searchParams

  const isSubscription = !!plan_id
  const backHref = order_id
    ? `/dashboard/orders/${order_id}`
    : isSubscription
      ? '/dashboard/subscription'
      : '/dashboard'

  return (
    <PublicPageShell
      eyebrow="Payment"
      title="Payment successful"
      description="Your payment has been processed. You will receive an email confirmation shortly."
    >
      <div className="premium-card p-6 md:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <svg
              className="h-8 w-8 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h2 className="mt-5 text-2xl font-semibold text-white">Thank you!</h2>

          {isSubscription ? (
            <p className="mt-3 max-w-md text-sm leading-7 text-zinc-400">
              Your subscription has been activated. You can start submitting requests right away
              from your dashboard.
            </p>
          ) : (
            <p className="mt-3 max-w-md text-sm leading-7 text-zinc-400">
              Your payment was confirmed and your request is now in progress. The team will begin
              working on it shortly.
            </p>
          )}

          <Link href={backHref} className="premium-button-primary mt-6">
            {isSubscription ? 'Go to subscription' : order_id ? 'View your request' : 'Go to dashboard'}
          </Link>
        </div>
      </div>
    </PublicPageShell>
  )
}
