import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: authData } = await supabase.auth.getUser()
  if (!authData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isSuperAdmin = (
    await db.from('profiles').select('is_superadmin').eq('id', authData.user.id).single()
  ).data?.is_superadmin ?? false

  if (!isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adb = createAdminClient() as any

  const { data: payments, error } = await adb
    .from('payments')
    .select(`
      id, plan_requested, amount, currency, method, status,
      months_granted, comprobante_url, notes, review_notes,
      created_at, reviewed_at,
      tenant:tenant_id(id, slug, name, plan),
      submitter:submitted_by(id)
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch submitter profiles separately
  const submitterIds: string[] = [...new Set(
    (payments ?? [])
      .map((p: { submitter: { id: string } | null }) => p.submitter?.id)
      .filter(Boolean) as string[]
  )]

  const { data: profiles } = submitterIds.length
    ? await adb.from('profiles').select('id, full_name, email').in('id', submitterIds)
    : { data: [] }

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; full_name: string | null; email: string }) => [p.id, p])
  )

  return NextResponse.json({
    payments: (payments ?? []).map((p: {
      id: string; plan_requested: string; amount: number; currency: string
      method: string; status: string; months_granted: number
      comprobante_url: string | null; notes: string | null; review_notes: string | null
      created_at: string; reviewed_at: string | null
      tenant: { id: string; slug: string; name: string; plan: string } | null
      submitter: { id: string } | null
    }) => ({
      ...p,
      submitter_profile: p.submitter?.id ? profileMap.get(p.submitter.id) ?? null : null,
    })),
  })
}
