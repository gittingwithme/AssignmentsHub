import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import DashboardShell from '@/components/ui/shared/dashboard-shell'
import DashboardSidebar, {
  customerSidebarItems,
} from '@/components/ui/shared/dashboard-sidebar'
import NewOrderForm from '@/components/dashboard/new-order-form'

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const serverError = typeof params?.error === 'string' ? params.error : null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: activeSubscriptions }, { data: recentUsage }, { count: activeOrderCount }] =
    await Promise.all([
      supabase
        .from('subscriptions')
        .select('*, plans(*)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('updated_at', { ascending: false }),
      supabase
        .from('upload_usage_logs')
        .select('*')
        .eq('user_id', user.id)
        // eslint-disable-next-line react-hooks/purity
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('status_key', [
          'review_pending',
          'awaiting_payment',
          'payment_submitted',
          'in_progress',
          'revision_requested',
        ]),
    ])

  const activeSubscription = activeSubscriptions?.[0] ?? null
  const activePlan = activeSubscription?.plans ?? null
  const uploadsInLast24h = recentUsage?.length ?? 0
  const uploadsRemaining24h =
    activePlan?.rolling_24h_upload_limit != null
      ? Math.max(activePlan.rolling_24h_upload_limit - uploadsInLast24h, 0)
      : null

  return (
    <DashboardShell
      workspaceLabel="Customer Workspace"
      activeItem="New Request"
      roleLabel="Customer"
      currentUserId={user.id}
      role="customer"
      header={
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">New Request</p>
            <h1 className="mt-1.5 text-[26px] font-semibold leading-8 tracking-[-0.022em]" style={{ color: 'var(--ink)' }}>
              Submit a support request
            </h1>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-5" style={{ color: 'var(--ink-muted)' }}>
              Choose your request mode and submit your image-based support request.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/dashboard" className="mp-btn mp-btn-secondary mp-btn-md">
              Back to dashboard
            </Link>
          </div>
        </div>
      }
      sidebar={
        <DashboardSidebar
          title="AssignmentsHub"
          subtitle="Customer Dashboard"
          roleLabel="Customer"
          items={customerSidebarItems}
        />
      }
    >
      <NewOrderForm
        initialError={serverError}
        hasActiveSubscription={!!activeSubscription}
        activePlanName={activePlan?.name || null}
        uploadsRemaining24h={uploadsRemaining24h}
        remainingCredits={activeSubscription?.remaining_credits ?? null}
        referenceImageLimit={activePlan?.reference_image_limit ?? null}
        maxActiveOrders={activePlan?.max_active_orders ?? null}
        currentActiveOrders={activeOrderCount ?? 0}
      />
    </DashboardShell>
  )
}
