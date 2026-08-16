'use client'

import { useActionState } from 'react'
import type { ReactNode } from 'react'
import { useToast } from '@/components/ui/shared/toast-provider'

type ActionFormProps = {
  action: (formData: FormData) => Promise<unknown>
  successTitle?: string
  successDescription?: string
  errorTitle?: string
  children: ReactNode
  className?: string
}

function isNextRedirect(error: unknown) {
  if (!(error instanceof Error)) return false
  return (
    (error as { digest?: string }).digest?.startsWith('NEXT_REDIRECT') === true ||
    error.message.includes('NEXT_REDIRECT')
  )
}

/**
 * Drop-in replacement for `<form action={serverAction}>` that reports the
 * outcome with a toast instead of silently revalidating.
 */
export default function ActionForm({
  action,
  successTitle = 'Done',
  successDescription,
  errorTitle = 'Something went wrong',
  children,
  className,
}: ActionFormProps) {
  const { toast } = useToast()

  const [, formAction] = useActionState<
    { ok: boolean; message?: string } | null,
    FormData
  >(async (_prev, formData) => {
    try {
      await action(formData)
      toast({
        variant: 'success',
        title: successTitle,
        description: successDescription,
      })
      return { ok: true }
    } catch (error) {
      // Never swallow Next.js redirects — navigation must still happen.
      if (isNextRedirect(error)) throw error
      toast({
        variant: 'error',
        title: errorTitle,
        description: error instanceof Error ? error.message : 'Unknown error',
      })
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }, null)

  return (
    <form action={formAction} className={className}>
      {children}
    </form>
  )
}
