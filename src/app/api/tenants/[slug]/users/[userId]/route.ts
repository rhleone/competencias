import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ slug: string; userId: string }> }

// ── PATCH /api/tenants/[slug]/users/[userId] ──────────────────
// Change role of a tenant member
export async function PATCH(req: NextRequest, { params }: Params) {
  const { slug, userId } = await params
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: authData } = await supabase.auth.getUser()
  if (!authData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const newRole: string = body.role === 'tenant_admin' ? 'tenant_admin' : 'operator'

  const { data: tenant } = await db.from('tenants').select('id').eq('slug', slug).single()
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const { data: self } = await db
    .from('tenant_users').select('role').eq('tenant_id', tenant.id).eq('user_id', authData.user.id).single()

  const isSuperAdmin = (await db.from('profiles').select('is_superadmin').eq('id', authData.user.id).single()).data?.is_superadmin ?? false

  if (self?.role !== 'tenant_admin' && !isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (userId === authData.user.id) {
    return NextResponse.json({ error: 'No podés cambiar tu propio rol' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (createAdminClient() as any)
    .from('tenant_users')
    .update({ role: newRole })
    .eq('tenant_id', tenant.id)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

// ── DELETE /api/tenants/[slug]/users/[userId] ─────────────────
// Remove a member from the tenant (does NOT delete their auth account)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { slug, userId } = await params
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: authData } = await supabase.auth.getUser()
  if (!authData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: tenant } = await db.from('tenants').select('id').eq('slug', slug).single()
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const { data: self } = await db
    .from('tenant_users').select('role').eq('tenant_id', tenant.id).eq('user_id', authData.user.id).single()

  const isSuperAdmin = (await db.from('profiles').select('is_superadmin').eq('id', authData.user.id).single()).data?.is_superadmin ?? false

  if (self?.role !== 'tenant_admin' && !isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (userId === authData.user.id) {
    return NextResponse.json({ error: 'No podés eliminarte a vos mismo' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (createAdminClient() as any)
    .from('tenant_users')
    .delete()
    .eq('tenant_id', tenant.id)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
