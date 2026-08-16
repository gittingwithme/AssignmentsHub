import PublicPageShell from '@/components/ui/shared/public-page-shell'
import { siteConfig } from '@/lib/site-config'

export default function ContactPage() {
  return (
    <PublicPageShell
      eyebrow="Contact"
      title="Need help before submitting a request?"
      description="Use the contact details below for pre-sales, billing guidance, or platform questions."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="premium-card p-6">
          <h2 className="text-lg font-semibold text-white">General contact</h2>
          <p className="mt-3 text-sm leading-7 text-zinc-400">
            Email: <span className="text-white">{siteConfig.contactEmail}</span>
          </p>
          <p className="mt-2 text-sm leading-7 text-zinc-400">
            Billing questions, request support, and general platform enquiries can be handled here.
          </p>
        </div>

        <div className="premium-card p-6">
          <h2 className="text-lg font-semibold text-white">Before you contact us</h2>
          <ul className="mt-3 space-y-2 text-sm leading-7 text-zinc-400">
            <li>• Prepare your course subject and request title.</li>
            <li>• Make sure your uploaded images are readable and at least 480px wide.</li>
            <li>• Check your invoice or subscription reference if your question is payment-related.</li>
          </ul>
        </div>
      </div>
    </PublicPageShell>
  )
}
