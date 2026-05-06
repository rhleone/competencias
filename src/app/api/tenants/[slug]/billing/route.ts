import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MEMBER_LIMITS } from '@/lib/plan-config'

type Params = { params: Promise<{ slug: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { slug } = await params
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: authData } = await supabase.auth.getUser()
  if (!authData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: tenant } = await db
    .from('tenants')
    .select('id, plan, plan_expires_at')
    .eq('slug', slug)
    .single()
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const { data: self } = await db
    .from('tenant_users')
    .select('role')
    .eq('tenant_id', tenant.id)
    .eq('user_id', authData.user.id)
    .single()

  const isSuperAdmin = (
    await db.from('profiles').select('is_superadmin').eq('id', authData.user.id).single()
  ).data?.is_superadmin ?? false

  if (!self && !isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adb = createAdminClient() as any

  const { count: memberCount } = await adb
    .from('tenant_users')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)

  const { data: payments } = await adb
    .from('payments')
    .select('id, plan_requested, amount, currency, method, status, months_granted, review_notes, created_at, reviewed_at')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({
    plan: tenant.plan,
    plan_expires_at: tenant.plan_expires_at,
    member_count: memberCount ?? 0,
    member_limit: MEMBER_LIMITS[tenant.plan] ?? 2,
    payments: payments ?? [],
    instructions: {
      tigo_money_phone: process.env.TIGO_MONEY_PHONE ?? '',
      tigo_money_name: process.env.TIGO_MONEY_NAME ?? '',
      takenos_wallet: process.env.TAKENOS_WALLET ?? '',
    },
  })
}
