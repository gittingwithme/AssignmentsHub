import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardShell from '@/components/ui/shared/dashboard-shell'
import DashboardSidebar, {
  customerSidebarItems,
} from '@/components/ui/shared/dashboard-sidebar'
import ActionForm from '@/components/ui/shared/action-form'
import Reveal from '@/components/ui/shared/reveal'
import { unenrollMfa, listMfaFactors } from '@/app/mfa-actions'
import MfaEnrollment from '@/components/dashboard/mfa-enrollment'
import { BackupCodesManager, ActiveSessionsView } from '@/components/dashboard/mfa-enrollment'
import {
  ShieldIcon,
  Trash2Icon,
  CheckCircleIcon,
  AlertTriangleIcon,
} from 'lucide-react'

function prettifyLabel(value: string | null | undefined) {
  if (!value) return 'N/A'
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export default async function SecurityPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('full_name, email')
    .eq('id', user.id)
    .single()

  const displayName = profile?.full_name || 'User'
  const email = profile?.email || user.email || ''

  // Check if user has MFA enabled
  const { data: factors } = await supabase
    .from('auth.mfa_factors')
    .select('id, factor_type, status, created_at, friendly_name')
    .eq('user_id', user.id)
    .eq('factor_type', 'totp')

  const verifiedFactor = factors?.find((f) => f.status === 'verified')
  const hasMfa = !!verifiedFactor

  return (
    <DashboardShell
      workspaceLabel="Customer Workspace"
      activeItem="Security"
      roleLabel="Customer"
      sidebar={
        <DashboardSidebar
          title="AssignmentsHub"
          subtitle="Customer Dashboard"
          roleLabel="Customer"
          items={customerSidebarItems}
        />
      }
    >
      <div className="space-y-6">
        <Reveal className="premium-card p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Security</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                Security Settings
              </h1>
              <p className="mt-2 text-sm text-zinc-400">
                Manage your two-factor authentication and account security.
              </p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--brand-500)', color: '#fff' }}>
              <ShieldIcon size={20} aria-hidden />
            </div>
          </div>
        </Reveal>

        {/* ── Two-Factor Authentication ── */}
        <Reveal delay={0.05} className="premium-card p-6 md:p-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-semibold text-white">Two-Factor Authentication (2FA)</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Add an extra layer of security to your account using an authenticator app.
              </p>
            </div>
            <span className={`status-chip ${hasMfa ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
              {hasMfa ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          {hasMfa ? (
            <MfaEnabledView factor={verifiedFactor!} />
          ) : (
            <MfaDisabledView />
          )}
        </Reveal>

        {/* ── Backup Codes ── */}
        {hasMfa && (
          <Reveal delay={0.1} className="premium-card p-6 md:p-8">
            <div>
              <h2 className="text-xl font-semibold text-white">Backup Codes</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Store these codes in a safe place. Each code can be used once if you lose access to your authenticator app.
              </p>
            </div>
            <div className="mt-5">
              <BackupCodesManager />
            </div>
          </Reveal>
        )}

        {/* ── Active Sessions ── */}
        <Reveal delay={0.15} className="premium-card p-6 md:p-8">
          <h2 className="text-xl font-semibold text-white">Active Sessions</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Review and manage your active login sessions.
          </p>
          <ActiveSessionsView />
        </Reveal>
      </div>
    </DashboardShell>
  )
}

function MfaEnabledView({ factor }: { factor: { id: string; friendly_name: string; created_at: string } }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'rgba(200,27,28,0.2)', color: 'var(--brand-400)' }}>
            <CheckCircleIcon size={20} aria-hidden />
          </div>
          <div>
            <p className="font-medium text-white">2FA is enabled</p>
            <p className="text-sm text-zinc-400">
              Authenticator: {factor.friendly_name} • Added {new Date(factor.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      <ActionForm
        action={async (formData) => {
          const factorId = String(formData.get('factorId') || '')
          await unenrollMfa(factorId)
        }}
        successTitle="2FA disabled"
        successDescription="Two-factor authentication has been removed from your account."
        className="mt-4"
      >
        <input type="hidden" name="factorId" value={factor.id} />
        <button type="submit" className="premium-button-secondary w-full md:w-auto">
          <Trash2Icon size={14} className="mr-2" aria-hidden />
          Disable 2FA
        </button>
      </ActionForm>

      <p className="mt-3 text-xs text-zinc-500">
        Disabling 2FA will remove the extra layer of security from your account. You will only need your password to sign in.
      </p>
    </div>
  )
}

function MfaDisabledView() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'rgba(245,158,11,0.2)', color: 'var(--warn-400)' }}>
            <AlertTriangleIcon size={20} aria-hidden />
          </div>
          <div>
            <p className="font-medium text-white">2FA is not enabled</p>
            <p className="text-sm text-zinc-400">
              Your account is only protected by your password. Enable 2FA to add an extra layer of security.
            </p>
          </div>
        </div>
      </div>

      <MfaEnrollment />
    </div>
  )
}