import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=missing_code`)
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  )

  const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !session) {
    return NextResponse.redirect(`${origin}/auth/login?error=callback_failed`)
  }

  const user = session.user
  const meta = user.user_metadata ?? {}

  // Ensure profile exists (upsert in case trigger didn't fire)
  const admin = createAdminClient()
  await admin.from('profiles').upsert({
    id: user.id,
    email: user.email ?? '',
    full_name: meta.full_name ?? null,
    role: 'operator',
    is_superadmin: false,
  }, { onConflict: 'id', ignoreDuplicates: true })

  // If invited to a tenant, wire up tenant_users
  const pendingTenantId: string | undefined = meta.pending_tenant_id
  const pendingRole: string = meta.pending_role ?? 'operator'
  const pendingSlug: string | undefined = meta.pending_tenant_slug

  if (pendingTenantId && pendingSlug) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('tenant_users').upsert({
      tenant_id: pendingTenantId,
      user_id: user.id,
      role: pendingRole,
    }, { onConflict: 'tenant_id,user_id', ignoreDuplicates: true })

    const dest = pendingRole === 'tenant_admin'
      ? `${origin}/t/${pendingSlug}/admin`
      : `${origin}/t/${pendingSlug}/operator`
    return NextResponse.redirect(dest)
  }

  // No tenant pending — look up existing tenant membership
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tu } = await (admin as any)
    .from('tenant_users')
    .select('role, tenant:tenant_id(slug)')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (tu?.tenant?.slug) {
    const dest = tu.role === 'tenant_admin'
      ? `${origin}/t/${tu.tenant.slug}/admin`
      : `${origin}/t/${tu.tenant.slug}/operator`
    return NextResponse.redirect(dest)
  }

  return NextResponse.redirect(`${origin}/auth/login?error=no_tenant`)
}
