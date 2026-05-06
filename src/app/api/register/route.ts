import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const orgName: string = (body.org_name ?? '').trim()
  const slug: string = (body.slug ?? '').trim().toLowerCase()
  const email: string = (body.email ?? '').trim().toLowerCase()
  const password: string = body.password ?? ''

  if (!orgName || !slug || !email || !password) {
    return NextResponse.json({ error: 'Todos los campos son requeridos' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: 'El slug solo puede tener letras minúsculas, números y guiones' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adb = createAdminClient() as any
  const admin = createAdminClient()

  // Check slug uniqueness
  const { data: existing } = await adb.from('tenants').select('id').eq('slug', slug).maybeSingle()
  if (existing) {
    return NextResponse.json({ error: `El identificador "${slug}" ya está en uso. Elegí otro.` }, { status: 409 })
  }

  // Create or find user
  let userId: string

  const { data: listData } = await admin.auth.admin.listUsers()
  const existingUser = listData?.users.find((u) => u.email === email)

  if (existingUser) {
    // User exists — check they're not already in a tenant
    const { data: tu } = await adb
      .from('tenant_users').select('id').eq('user_id', existingUser.id).maybeSingle()
    if (tu) {
      return NextResponse.json({
        error: 'Este email ya tiene una organización registrada. Iniciá sesión.',
      }, { status: 409 })
    }
    userId = existingUser.id
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 })
    userId = created.user.id

    await adb.from('profiles').insert({
      id: userId,
      email,
      full_name: null,
      role: 'operator',
      is_superadmin: false,
    })
  }

  // Create tenant
  const { data: tenant, error: tenantErr } = await adb
    .from('tenants')
    .insert({ name: orgName, slug, plan: 'free', status: 'active' })
    .select('id')
    .single()

  if (tenantErr) return NextResponse.json({ error: tenantErr.message }, { status: 500 })

  // Link user as tenant_admin
  const { error: tuErr } = await adb.from('tenant_users').insert({
    tenant_id: tenant.id,
    user_id: userId,
    role: 'tenant_admin',
  })

  if (tuErr) return NextResponse.json({ error: tuErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, slug })
}
