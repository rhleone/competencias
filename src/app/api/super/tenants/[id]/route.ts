import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLAN_CONFIG } from '@/lib/plan-config'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/super/tenants/[id]
// body: { plan?, status?, months_to_add? }
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (createAdminClient() as any)
    .from('profiles').select('is_superadmin').eq('id', user.id).single()
  if (!profile?.is_superadmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adb = createAdminClient() as any

  const { data: tenant } = await adb
    .from('tenants').select('id, plan, status, plan_expires_at').eq('id', id).single()
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {}

  if (body.status && ['active', 'suspended', 'cancelled'].includes(body.status)) {
    updates.status = body.status
    if (body.status === 'suspended') updates.suspended_at = new Date().toISOString()
  }

  if (body.plan && body.plan in PLAN_CONFIG) {
    updates.plan = body.plan
    if (body.plan === 'free') {
      updates.plan_expires_at = null
    } else if (!tenant.plan_expires_at || new Date(tenant.plan_expires_at) < new Date()) {
      // Start fresh 30-day period
      const exp = new Date()
      exp.setDate(exp.getDate() + 30)
      updates.plan_expires_at = exp.toISOString()
    }
  }

  if (body.months_to_add && Number.isInteger(body.months_to_add) && body.months_to_add > 0) {
    const base = tenant.plan_expires_at && new Date(tenant.plan_expires_at) > new Date()
      ? new Date(tenant.plan_expires_at)
      : new Date()
    base.setDate(base.getDate() + body.months_to_add * 30)
    updates.plan_expires_at = base.toISOString()
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Sin cambios para aplicar' }, { status: 400 })
  }

  const { error } = await adb.from('tenants').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
