import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function assertSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).from('profiles').select('is_superadmin').eq('id', user.id).single()
  return data?.is_superadmin ? user : null
}

// GET /api/super/tenants — list all tenants with member count
export async function GET(_req: NextRequest) {
  const user = await assertSuperAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adb = createAdminClient() as any

  const { data: tenants, error } = await adb
    .from('tenants')
    .select('id, slug, name, plan, status, plan_expires_at, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Member counts per tenant
  const { data: counts } = await adb
    .from('tenant_users')
    .select('tenant_id')

  const countMap: Record<string, number> = {}
  for (const row of counts ?? []) {
    countMap[row.tenant_id] = (countMap[row.tenant_id] ?? 0) + 1
  }

  return NextResponse.json({
    tenants: (tenants ?? []).map((t: {
      id: string; slug: string; name: string; plan: string
      status: string; plan_expires_at: string | null; created_at: string
    }) => ({
      ...t,
      member_count: countMap[t.id] ?? 0,
    })),
  })
}

// POST /api/super/tenants — create a new tenant + admin user
export async function POST(req: NextRequest) {
  const actor = await assertSuperAdmin()
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const name: string = (body.name ?? '').trim()
  const slug: string = (body.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
  const admin_email: string = (body.admin_email ?? '').trim().toLowerCase()
  const admin_password: string | undefined = body.admin_password

  if (!name || !slug || !admin_email) {
    return NextResponse.json({ error: 'Nombre, slug y email son requeridos' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adb = createAdminClient() as any
  const admin = createAdminClient()

  // Check slug uniqueness
  const { data: existing } = await adb.from('tenants').select('id').eq('slug', slug).maybeSingle()
  if (existing) return NextResponse.json({ error: `El slug "${slug}" ya está en uso` }, { status: 409 })

  // Create tenant
  const { data: tenant, error: tenantError } = await adb
    .from('tenants')
    .insert({ name, slug, plan: 'free', status: 'active' })
    .select('id')
    .single()

  if (tenantError) return NextResponse.json({ error: tenantError.message }, { status: 500 })

  // Create or find admin user
  let adminUserId: string

  const { data: listData } = await admin.auth.admin.listUsers()
  const existingUser = listData?.users.find((u) => u.email === admin_email)

  if (existingUser) {
    adminUserId = existingUser.id
    // Ensure profile exists
    await adb.from('profiles').upsert({
      id: adminUserId,
      email: admin_email,
      full_name: existingUser.user_metadata?.full_name ?? null,
      role: 'operator',
      is_superadmin: false,
    }, { onConflict: 'id', ignoreDuplicates: true })
  } else if (admin_password) {
    // Create with password
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: admin_email,
      password: admin_password,
      email_confirm: true,
    })
    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 })
    adminUserId = created.user.id
    await adb.from('profiles').insert({
      id: adminUserId,
      email: admin_email,
      full_name: null,
      role: 'operator',
      is_superadmin: false,
    })
  } else {
    // Send invite email
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(admin_email, {
      data: { pending_tenant_id: tenant.id, pending_tenant_slug: slug, pending_role: 'tenant_admin' },
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/auth/callback`,
    })
    if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      message: `Tenant "${name}" creado. Invitación enviada a ${admin_email}.`,
      slug,
      admin_invited: true,
    })
  }

  // Add admin to tenant
  const { error: tuError } = await adb.from('tenant_users').insert({
    tenant_id: tenant.id,
    user_id: adminUserId,
    role: 'tenant_admin',
    invited_by: actor.id,
  })

  if (tuError) return NextResponse.json({ error: tuError.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    message: `Tenant "${name}" creado con admin ${admin_email}.`,
    slug,
    admin_invited: false,
  })
}
