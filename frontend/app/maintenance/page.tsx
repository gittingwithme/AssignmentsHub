import Link from 'next/link'
import { getPlatformSettings } from '@/lib/platform-settings'
import SiteHeader from '@/components/ui/shared/site-header'

export default async function MaintenancePage() {
  const settings = await getPlatformSettings()

  return (
    <div className="relative min-h-screen">
      <SiteHeader />

      <section className="page-wrap flex min-h-[70vh] items-center py-16">
        <div className="mx-auto w-full max-w-2xl text-center">
          <div className="premium-pill mx-auto mb-6 w-fit">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            Platform maintenance
          </div>

          <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
            {settings.maintenance_title}
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base leading-8 text-zinc-400">
            {settings.maintenance_description}
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/" className="premium-button min-w-[160px]">
              Return home
            </Link>
            <Link href="/contact" className="premium-button min-w-[160px]">
              Contact support
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
