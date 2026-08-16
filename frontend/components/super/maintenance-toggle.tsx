'use client'

import { useState, useTransition } from 'react'
import { updateMaintenanceSettings } from '@/app/super-actions'
import { useToast } from '@/components/ui/shared/toast-provider'

type Props = {
  currentEnabled: boolean
  currentTitle: string
  currentDescription: string
}

export default function MaintenanceToggle({
  currentEnabled,
  currentTitle,
  currentDescription,
}: Props) {
  const [open, setOpen] = useState(false)
  const [enabled, setEnabled] = useState(currentEnabled)
  const [title, setTitle] = useState(currentTitle)
  const [description, setDescription] = useState(currentDescription)
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  function handleSubmit() {
    const fd = new FormData()
    if (enabled) fd.set('maintenance_enabled', 'on')
    fd.set('maintenance_title', title)
    fd.set('maintenance_description', description)

    startTransition(async () => {
      try {
        await updateMaintenanceSettings(fd)
        toast({
          variant: 'success',
          title: 'Maintenance settings saved',
          description: enabled
            ? 'Customers and admins will now see the maintenance page.'
            : 'The site is back online for everyone.',
        })
        setOpen(false)
      } catch (error) {
        toast({
          variant: 'error',
          title: 'Failed to save maintenance settings',
          description: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Maintenance mode</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Lock out customers and admins with a custom message.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            currentEnabled
              ? 'rounded-full bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-300 transition hover:bg-amber-500/30'
              : 'premium-button'
          }
        >
          {currentEnabled ? '● Active — Configure' : 'Enable'}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-[24px] border border-white/10 bg-[#111214] p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">Maintenance settings</h3>
            <p className="mt-1 text-sm text-zinc-400">
              This message will be shown to all admins and customers while maintenance is active.
            </p>

            <div className="mt-5 space-y-4">
              <label className="flex items-center gap-3 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-white/5"
                />
                Enable maintenance mode
              </label>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="premium-input"
                  placeholder="Under Maintenance"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Message for users</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="premium-textarea"
                  placeholder="We're upgrading AssignmentsHub. Check back soon."
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending}
                className="premium-button-primary flex-1"
              >
                {isPending ? 'Saving…' : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="premium-button flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
