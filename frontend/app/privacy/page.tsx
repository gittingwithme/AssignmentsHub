import LegalShell from '@/components/ui/shared/legal-shell'

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <p>
        AssignmentsHub stores account, order, file, and messaging data to deliver customer support,
        request tracking, and payment approval workflows.
      </p>
      <p>
        Uploaded materials and payment-related references may be processed for operational,
        billing, fraud-prevention, and support purposes.
      </p>
      <p>
        Anti-abuse signals such as email, IP, device, and submission behavior may be used to
        protect the platform from trial abuse and fraudulent activity.
      </p>
      <p>
        Full privacy content can be expanded further during the production legal review.
      </p>
    </LegalShell>
  )
}
