import PublicPageShell from '@/components/ui/shared/public-page-shell'

const oneTimeTiers = [
  { name: 'Small', price: '€15', details: 'Up to 3 images' },
  { name: 'Standard', price: '€25', details: 'Up to 6 images' },
  { name: 'Large / Custom', price: '€40+', details: 'Manual quote' },
]

export default function OneTimeWorkPage() {
  return (
    <PublicPageShell
      eyebrow="One-Time Work"
      title="A one-time option for customers who do not need a plan"
      description="One-time work is available, but subscriptions remain the recommended route for ongoing support, smoother workflow, and better overall value."
    >
      <div className="grid gap-5 md:grid-cols-3">
        {oneTimeTiers.map((tier) => (
          <div key={tier.name} className="premium-card premium-card-hover p-6">
            <p className="text-sm text-zinc-400">{tier.name}</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">{tier.price}</h2>
            <p className="mt-4 text-sm leading-7 text-zinc-400">{tier.details}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 premium-card p-6">
        <h3 className="text-lg font-semibold text-white">How one-time requests work</h3>
        <ul className="mt-4 space-y-2 text-sm leading-7 text-zinc-400">
          <li>• Upload your assignment images.</li>
          <li>• Select your support type and desired output format.</li>
          <li>• Receive an automatic estimate or admin-reviewed quote.</li>
          <li>• Pay by manual bank transfer.</li>
          <li>• Wait for payment approval before output unlocks.</li>
        </ul>
      </div>
    </PublicPageShell>
  )
}
