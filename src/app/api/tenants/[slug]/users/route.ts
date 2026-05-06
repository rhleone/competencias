import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const PLAN_MEMBER_LIMITS: Record<string, number> = {
  free: 2,
  basic: 10,
  pro: Infinity,
}

type Params = { params: Promise<{ slug: string }> }

// ── GET /api/tenants/[slug]/users ──────────────────────────────
// Returns all members of the tenant with profile info
export async function GET(_req: NextRequest, { params }: Params) {
  const { slug } = await params
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: authData } = await supabase.auth.getUser()
  if (!authData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Resolve tenant
  const { data: tenant } = await db.from('tenants').select('id, plan').eq('slug', slug).single()
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  // Must be a member to read the list
  const { data: self } = await db
    .from('tenant_users')
    .select('role')
    .eq('tenant_id', tenant.id)
    .eq('user_id', authData.user.id)
    .single()

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adb = admin as any

  const isSuperAdmin = (
    await db.from('profiles').select('is_superadmin').eq('id', authData.user.id).single()
  ).data?.is_superadmin ?? false

  if (!self && !isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch tenant_users + join profiles (service role bypasses RLS)
  const { data: members } = await adb
    .from('tenant_users')
    .select('id, user_id, role, created_at, profile:user_id(full_name, email)')
    .eq('tenant_id', tenant.id)
    .order('created_at')

  const limit = PLAN_MEMBER_LIMITS[tenant.plan] ?? 2

  return NextResponse.json({
    members: (members ?? []).map((m: {
      id: string; user_id: string; role: string; created_at: string
      profile: { full_name: string | null; email: string } | null
    }) => ({
      id: m.id,
      user_id: m.user_id,
      role: m.role,
      joined_at: m.created_at,
      full_name: m.profile?.full_name ?? null,
      email: m.profile?.email ?? '—',
    })),
    plan: tenant.plan,
    member_limit: limit,
    current_user_id: authData.user.id,
    current_role: self?.role ?? (isSuperAdmin ? 'superadmin' : null),
  })
}

// ── POST /api/tenants/[slug]/users ─────────────────────────────
// Invite a user by email or add existing user to tenant
export async function POST(req: NextRequest, { params }: Params) {
  const { slug } = await params
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: authData } = await supabase.auth.getUser()
  if (!authData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const email: string = (body.email ?? '').trim().toLowerCase()
  const role: string = body.role === 'tenant_admin' ? 'tenant_admin' : 'operator'

  if (!email) return NextResponse.json({ error: 'Email requerido' }, { status: 400 })

  // Resolve tenant
  const { data: tenant } = await db
    .from('tenants')
    .select('id, plan, name, slug')
    .eq('slug', slug)
    .single()
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  // Only tenant_admin or superadmin can invite
  const { data: self } = await db
    .from('tenant_users')
    .select('role')
    .eq('tenant_id', tenant.id)
    .eq('user_id', authData.user.id)
    .single()

  const isSuperAdmin = (
    await db.from('profiles').select('is_superadmin').eq('id', authData.user.id).single()
  ).data?.is_superadmin ?? false

  if (self?.role !== 'tenant_admin' && !isSuperAdmin) {
    return NextResponse.json({ error: 'Solo administradores pueden invitar usuarios' }, { status: 403 })
  }

  // Check plan limits
  const limit = PLAN_MEMBER_LIMITS[tenant.plan] ?? 2
  const { count } = await db
    .from('tenant_users')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)

  if ((count ?? 0) >= limit) {
    return NextResponse.json({
      error: `Límite del plan alcanzado (${limit} miembros). Actualizá tu plan para agregar más.`,
    }, { status: 403 })
  }

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adb = admin as any

  // Check if user exists by email in profiles
  const { data: existingProfile } = await adb
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (existingProfile?.id) {
    // User exists — check if already in this tenant
    const { data: existing } = await adb
      .from('tenant_users')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('user_id', existingProfile.id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'Este usuario ya es miembro de la organización' }, { status: 409 })
    }

    // Add directly
    const { error } = await adb.from('tenant_users').insert({
      tenant_id: tenant.id,
      user_id: existingProfile.id,
      role,
      invited_by: authData.user.id,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ status: 'added', message: 'Usuario agregado a la organización' })
  }

  // User doesn't exist — send invite with metadata
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      pending_tenant_id: tenant.id,
      pending_tenant_slug: tenant.slug,
      pending_role: role,
    },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/auth/callback`,
  })

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 })
  }

  return NextResponse.json({
    status: 'invited',
    message: `Invitación enviada a ${email}. El usuario recibirá un correo para completar el registro.`,
  })
}
