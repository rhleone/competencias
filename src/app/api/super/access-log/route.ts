import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (createAdminClient() as any)
    .from('profiles').select('is_superadmin').eq('id', user.id).single()
  if (!profile?.is_superadmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adb = createAdminClient() as any

  const { data: rows, error } = await adb
    .from('superadmin_access_log')
    .select('id, superadmin_id, tenant_id, accessed_at')
    .order('accessed_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with profiles and tenant names
  const superadminIds: string[] = [...new Set<string>((rows ?? []).map((r: { superadmin_id: string }) => r.superadmin_id))]
  const tenantIds: string[] = [...new Set<string>((rows ?? []).map((r: { tenant_id: string }) => r.tenant_id))]

  const [{ data: profiles }, { data: tenants }] = await Promise.all([
    superadminIds.length
      ? adb.from('profiles').select('id, full_name, email').in('id', superadminIds)
      : { data: [] },
    tenantIds.length
      ? adb.from('tenants').select('id, slug, name').in('id', tenantIds)
      : { data: [] },
  ])

  const profileMap = new Map((profiles ?? []).map((p: { id: string; full_name: string | null; email: string }) => [p.id, p]))
  const tenantMap = new Map((tenants ?? []).map((t: { id: string; slug: string; name: string }) => [t.id, t]))

  return NextResponse.json({
    entries: (rows ?? []).map((r: { id: string; superadmin_id: string; tenant_id: string; accessed_at: string }) => ({
      id: r.id,
      accessed_at: r.accessed_at,
      superadmin: profileMap.get(r.superadmin_id) ?? { id: r.superadmin_id, full_name: null, email: '—' },
      tenant: tenantMap.get(r.tenant_id) ?? { id: r.tenant_id, slug: '—', name: '—' },
    })),
  })
}
