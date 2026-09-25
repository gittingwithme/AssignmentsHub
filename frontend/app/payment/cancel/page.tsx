import Link from 'next/link'
import PublicPageShell from '@/components/ui/shared/public-page-shell'

export default async function PaymentCancelPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string; plan_id?: string }>
}) {
  const { order_id, plan_id } = await searchParams

  const backHref = order_id
    ? `/dashboard/orders/${order_id}`
    : plan_id
      ? '/dashboard/subscription'
      : '/dashboard'

  return (
    <PublicPageShell
      eyebrow="Payment"
      title="Payment cancelled"
      description="No charges have been made. You can try again whenever you are ready."
    >
      <div className="premium-card p-6 md:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-500/10">
            <svg
              className="h-8 w-8 text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>

          <h2 className="mt-5 text-2xl font-semibold text-white">Payment cancelled</h2>

          <p className="mt-3 max-w-md text-sm leading-7 text-zinc-400">
            You were not charged. If you changed your mind, you can return and choose a payment
            method at any time. You can also use bank transfer if you prefer.
          </p>

          <Link href={backHref} className="premium-button mt-6">
            Go back
          </Link>
        </div>
      </div>
    </PublicPageShell>
  )
}
