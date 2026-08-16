import { redirect } from 'next/navigation'

export default function SubscriptionTypoRedirectPage() {
  redirect('/dashboard/subscription')
}
