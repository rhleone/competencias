import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/super/payments/[id]
// body: { action: 'approve' | 'reject', months?: 1|3|6|12, review_notes?: string }
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: authData } = await supabase.auth.getUser()
  if (!authData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isSuperAdmin = (
    await db.from('profiles').select('is_superadmin').eq('id', authData.user.id).single()
  ).data?.is_superadmin ?? false

  if (!isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const action: string = body.action
  const months: number = [1, 3, 6, 12].includes(body.months) ? body.months : 1
  const review_notes: string | null = body.review_notes ?? null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adb = createAdminClient() as any

  const { data: payment } = await adb
    .from('payments')
    .select('id, tenant_id, plan_requested, status')
    .eq('id', id)
    .single()

  if (!payment) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
  if (payment.status !== 'pending') {
    return NextResponse.json({ error: 'Este pago ya fue procesado' }, { status: 409 })
  }

  if (action === 'approve') {
    // Calculate new plan_expires_at: extend from now (or from current expiry if still valid)
    const { data: tenant } = await adb
      .from('tenants')
      .select('plan_expires_at')
      .eq('id', payment.tenant_id)
      .single()

    const base = tenant?.plan_expires_at && new Date(tenant.plan_expires_at) > new Date()
      ? new Date(tenant.plan_expires_at)
      : new Date()

    base.setDate(base.getDate() + months * 30)

    const { error: tenantError } = await adb
      .from('tenants')
      .update({ plan: payment.plan_requested, plan_expires_at: base.toISOString() })
      .eq('id', payment.tenant_id)

    if (tenantError) return NextResponse.json({ error: tenantError.message }, { status: 500 })

    const { error: payError } = await adb
      .from('payments')
      .update({
        status: 'verified',
        months_granted: months,
        reviewed_by: authData.user.id,
        reviewed_at: new Date().toISOString(),
        review_notes,
      })
      .eq('id', id)

    if (payError) return NextResponse.json({ error: payError.message }, { status: 500 })

    return NextResponse.json({ ok: true, message: `Plan actualizado a ${payment.plan_requested} por ${months} mes(es)` })
  }

  if (action === 'reject') {
    const { error } = await adb
      .from('payments')
      .update({
        status: 'rejected',
        reviewed_by: authData.user.id,
        reviewed_at: new Date().toISOString(),
        review_notes,
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
}
