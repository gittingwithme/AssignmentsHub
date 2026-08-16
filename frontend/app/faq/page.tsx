import PublicPageShell from '@/components/ui/shared/public-page-shell'

const faqs = [
  {
    q: 'What kind of support does AssignmentsHub provide?',
    a: 'AssignmentsHub provides legitimate academic support such as assignment review, rubric review, feedback, concept explanation, citation guidance, and submission-readiness review.',
  },
  {
    q: 'Do you offer ghostwriting?',
    a: 'No. The platform is not for ghostwriting or doing assignments for students as original submission work.',
  },
  {
    q: 'How are payments handled?',
    a: 'Payments are handled through manual bank transfer. After payment is submitted, it must be approved before related access or output unlocks.',
  },
  {
    q: 'Why are subscriptions recommended?',
    a: 'Subscriptions create a smoother long-term workflow and are designed to provide better value than repeated one-time requests.',
  },
  {
    q: 'What can I upload?',
    a: 'Customers upload images only. Minimum image width must be at least 480px for readability.',
  },
  {
    q: 'Can I request one-time work without a subscription?',
    a: 'Yes. One-time work is available, although plans are the recommended route.',
  },
]

export default function FAQPage() {
  return (
    <PublicPageShell
      eyebrow="FAQ"
      title="Common questions"
      description="Clear answers about support scope, plans, manual payment approval, uploads, and workflow expectations."
    >
      <div className="space-y-4">
        {faqs.map((item) => (
          <div key={item.q} className="premium-card p-5 md:p-6">
            <h2 className="text-lg font-semibold text-white">{item.q}</h2>
            <p className="mt-3 text-sm leading-7 text-zinc-400">{item.a}</p>
          </div>
        ))}
      </div>
    </PublicPageShell>
  )
}
