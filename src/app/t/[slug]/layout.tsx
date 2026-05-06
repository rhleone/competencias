import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { TenantProvider } from '@/lib/tenant-context'
import { APP_NAME } from '@/lib/app-config'

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, slug, name, plan, status, suspended_reason')
    .eq('slug', slug)
    .single()

  if (!tenant) notFound()

  if (tenant.status === 'suspended') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-red-200 p-8 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-red-600 text-2xl font-bold">!</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Cuenta suspendida</h1>
          <p className="text-gray-500 text-sm mb-4">
            El acceso a <strong>{tenant.name}</strong> ha sido suspendido temporalmente.
          </p>
          {tenant.suspended_reason && (
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3 mb-4">
              Motivo: {tenant.suspended_reason}
            </p>
          )}
          <p className="text-xs text-gray-400">
            Para resolver esto, contactá al administrador de {APP_NAME}.
          </p>
        </div>
      </div>
    )
  }

  if (tenant.status === 'cancelled') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Cuenta cancelada</h1>
          <p className="text-gray-500 text-sm">Esta cuenta ha sido cancelada y ya no está disponible.</p>
        </div>
      </div>
    )
  }

  return (
    <TenantProvider tenant={{ id: tenant.id, slug: tenant.slug, name: tenant.name, plan: tenant.plan, status: tenant.status }}>
      {children}
    </TenantProvider>
  )
}
