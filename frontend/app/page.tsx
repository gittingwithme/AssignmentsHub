import LandingStage from '@/components/landing/landing-stage'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return <LandingStage authenticated={!!user} />
}
