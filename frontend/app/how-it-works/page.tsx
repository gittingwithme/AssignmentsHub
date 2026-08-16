import PublicPageShell from '@/components/ui/shared/public-page-shell'

const steps = [
  'Create your account and choose a weekly plan, monthly plan, or one-time work.',
  'Submit a request with a required Course Subject, support type, deadline, and image upload.',
  'If your request fits a standard one-time tier, an estimate may be generated automatically. Otherwise, admin review determines the quote.',
  'Make your bank transfer and submit it for payment approval.',
  'Once approved, support work continues and final outputs unlock according to status and billing conditions.',
]

export default function HowItWorksPage() {
  return (
    <PublicPageShell
      eyebrow="How it works"
      title="A clear workflow from submission to approved output"
      description="AssignmentsHub is designed to make request handling, payment approval, and output delivery feel structured and transparent."
    >
      <div className="space-y-4">
        {steps.map((step, index) => (
          <div key={step} className="premium-card p-5 md:p-6">
            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-semibold text-white">
                {index + 1}
              </div>
              <p className="text-sm leading-7 text-zinc-400">{step}</p>
            </div>
          </div>
        ))}
      </div>
    </PublicPageShell>
  )
}
