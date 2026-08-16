import AuthShell from '@/components/ui/shared/auth-shell'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AuthShell>{children}</AuthShell>
}
