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

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const in15Days = new Date(now.getTime() + 15 * 86400000).toISOString()

  const [
    { data: tenants },
    { data: payments },
    { data: expiringSoon },
  ] = await Promise.all([
    adb.from('tenants').select('id, plan, status, created_at'),
    adb.from('payments').select('status, amount, currency, created_at'),
    adb.from('tenants')
      .select('id, slug, name, plan, plan_expires_at')
      .neq('plan', 'free')
      .gt('plan_expires_at', now.toISOString())
      .lte('plan_expires_at', in15Days)
      .eq('status', 'active')
      .order('plan_expires_at'),
  ])

  // Tenant metrics
  const allTenants: { plan: string; status: string; created_at: string }[] = tenants ?? []
  const byPlan: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  let newThisMonth = 0

  for (const t of allTenants) {
    byPlan[t.plan] = (byPlan[t.plan] ?? 0) + 1
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1
    if (t.created_at >= startOfMonth) newThisMonth++
  }

  // Payment metrics
  const allPayments: { status: string; amount: number; currency: string; created_at: string }[] = payments ?? []
  let pendingCount = 0
  let verifiedThisMonth = 0
  let revenueBobMonth = 0
  let revenueUsdtMonth = 0

  for (const p of allPayments) {
    if (p.status === 'pending') pendingCount++
    if (p.status === 'verified' && p.created_at >= startOfMonth) {
      verifiedThisMonth++
      if (p.currency === 'BOB') revenueBobMonth += p.amount
      else revenueUsdtMonth += p.amount
    }
  }

  return NextResponse.json({
    tenants: {
      total: allTenants.length,
      active: byStatus['active'] ?? 0,
      suspended: byStatus['suspended'] ?? 0,
      by_plan: { free: byPlan['free'] ?? 0, basic: byPlan['basic'] ?? 0, pro: byPlan['pro'] ?? 0 },
      new_this_month: newThisMonth,
    },
    payments: {
      pending: pendingCount,
      verified_this_month: verifiedThisMonth,
      revenue_bob_month: revenueBobMonth,
      revenue_usdt_month: revenueUsdtMonth,
    },
    expiring_soon: expiringSoon ?? [],
  })
}
