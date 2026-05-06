import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLAN_CONFIG } from '@/lib/plan-config'

type Params = { params: Promise<{ slug: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { slug } = await params
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: authData } = await supabase.auth.getUser()
  if (!authData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: tenant } = await db
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single()
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const { data: self } = await db
    .from('tenant_users')
    .select('role')
    .eq('tenant_id', tenant.id)
    .eq('user_id', authData.user.id)
    .single()

  if (self?.role !== 'tenant_admin') {
    return NextResponse.json({ error: 'Solo administradores pueden enviar pagos' }, { status: 403 })
  }

  const body = await req.json()
  const plan_requested: string = body.plan_requested
  const method: string = body.method
  const currency: string = body.currency === 'USDT' ? 'USDT' : 'BOB'
  const comprobante_url: string | null = body.comprobante_url ?? null
  const notes: string | null = body.notes ?? null

  if (!['basic', 'pro'].includes(plan_requested)) {
    return NextResponse.json({ error: 'Plan inválido' }, { status: 400 })
  }
  if (!['tigo_money', 'takenos', 'bank_transfer'].includes(method)) {
    return NextResponse.json({ error: 'Método de pago inválido' }, { status: 400 })
  }

  const planCfg = PLAN_CONFIG[plan_requested as 'basic' | 'pro']
  const amount = currency === 'USDT' ? planCfg.price_usdt : planCfg.price_bob

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (createAdminClient() as any).from('payments').insert({
    tenant_id: tenant.id,
    plan_requested,
    amount,
    currency,
    method,
    comprobante_url,
    notes,
    submitted_by: authData.user.id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, message: 'Comprobante enviado. Verificación en proceso.' })
}
