import PublicPageShell from '@/components/ui/shared/public-page-shell'

const services = [
  {
    title: 'Assignment Review',
    copy: 'Structured feedback on assignment quality, requirements, organisation, and improvement opportunities.',
  },
  {
    title: 'Rubric Review',
    copy: 'Focused checks against marking criteria, helping students understand where their draft meets or misses expectations.',
  },
  {
    title: 'Feedback and Suggestions',
    copy: 'Clear, actionable comments on what can be improved before submission.',
  },
  {
    title: 'Concept Explanation',
    copy: 'Support that helps students understand difficult concepts related to their coursework.',
  },
  {
    title: 'Citation Guidance',
    copy: 'Help with citation consistency, reference structure, and source presentation guidance.',
  },
  {
    title: 'Submission-Readiness Review',
    copy: 'A final review layer to help the student prepare their material for submission with stronger clarity and confidence.',
  },
]

export default function ServicesPage() {
  return (
    <PublicPageShell
      eyebrow="Services"
      title="Support types available on AssignmentsHub"
      description="AssignmentsHub is built for legitimate academic support workflows — not ghostwriting. Support is organised around review, explanation, guidance, and submission-readiness."
    >
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {services.map((service) => (
          <div key={service.title} className="premium-card premium-card-hover p-5">
            <h2 className="text-lg font-semibold text-white">{service.title}</h2>
            <p className="mt-3 text-sm leading-7 text-zinc-400">{service.copy}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 premium-card p-6">
        <h3 className="text-lg font-semibold text-white">What this platform does not offer</h3>
        <ul className="mt-4 space-y-2 text-sm leading-7 text-zinc-400">
          <li>• No ghostwriting for students to submit as their own original work.</li>
          <li>• No exam taking or impersonation.</li>
          <li>• No guaranteed grades.</li>
        </ul>
      </div>
    </PublicPageShell>
  )
}
