import { createClient } from '@/lib/supabase/server'

export type PlatformSettings = {
  maintenance_enabled: boolean
  maintenance_title: string
  maintenance_description: string
}

const DEFAULT_SETTINGS: PlatformSettings = {
  maintenance_enabled: false,
  maintenance_title: 'Under Maintenance',
  maintenance_description:
    'AssignmentsHub is temporarily unavailable while we perform upgrades. Please check back soon.',
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('platform_settings')
      .select('maintenance_enabled, maintenance_title, maintenance_description')
      .eq('id', 'global')
      .maybeSingle()

    if (error || !data) return DEFAULT_SETTINGS

    return {
      maintenance_enabled: !!data.maintenance_enabled,
      maintenance_title: data.maintenance_title || DEFAULT_SETTINGS.maintenance_title,
      maintenance_description:
        data.maintenance_description || DEFAULT_SETTINGS.maintenance_description,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}
