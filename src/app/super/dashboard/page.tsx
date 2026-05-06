'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Loader2, RefreshCw, Building2, TrendingUp, Clock, AlertTriangle,
  CheckCircle2, Ban, ExternalLink,
} from 'lucide-react'
import { PLAN_CONFIG, type PlanKey } from '@/lib/plan-config'

type DashboardData = {
  tenants: {
    total: number
    active: number
    suspended: number
    by_plan: { free: number; basic: number; pro: number }
    new_this_month: number
  }
  payments: {
    pending: number
    verified_this_month: number
    revenue_bob_month: number
    revenue_usdt_month: number
  }
  expiring_soon: {
    id: string; slug: string; name: string; plan: string; plan_expires_at: string
  }[]
}

function MetricCard({
  label, value, sub, color = 'blue', icon: Icon,
}: {
  label: string; value: string | number; sub?: string
  color?: 'blue' | 'green' | 'purple' | 'amber' | 'red' | 'gray'
  icon: React.ElementType
}) {
  const colors = {
    blue:   'bg-blue-50 text-blue-600',
    green:  'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    amber:  'bg-amber-50 text-amber-600',
    red:    'bg-red-50 text-red-600',
    gray:   'bg-gray-100 text-gray-500',
  }
  return (
    <div className="bg-white border rounded-xl p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

const PLAN_COLORS: Record<string, string> = {
  free:  'bg-gray-100 text-gray-600',
  basic: 'bg-blue-100 text-blue-700',
  pro:   'bg-purple-100 text-purple-700',
}

export default function SuperDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  // Quick action: change plan / extend
  const [actionTenant, setActionTenant] = useState<DashboardData['expiring_soon'][0] | null>(null)
  const [actionType, setActionType] = useState<'plan' | 'extend' | 'suspend'>('extend')
  const [newPlan, setNewPlan] = useState('basic')
  const [months, setMonths] = useState('1')
  const [acting, setActing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/super/dashboard')
    if (res.ok) setData(await res.json())
    else toast.error('Error al cargar métricas')
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleAction() {
    if (!actionTenant) return
    setActing(true)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: Record<string, any> = {}
    if (actionType === 'plan') body.plan = newPlan
    if (actionType === 'extend') body.months_to_add = Number(months)
    if (actionType === 'suspend') body.status = 'suspended'

    const res = await fetch(`/api/super/tenants/${actionTenant.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) {
      toast.error(json.error ?? 'Error')
    } else {
      toast.success('Cambio aplicado')
      setActionTenant(null)
      load()
    }
    setActing(false)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Cargando dashboard...</span>
      </div>
    )
  }

  if (!data) return <p className="p-8 text-sm text-red-500">Error al cargar.</p>

  const { tenants, payments, expiring_soon } = data
  const monthName = new Date().toLocaleString('es-BO', { month: 'long' })

  return (
    <div className="p-8 max-w-5xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">Vista general de la plataforma</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load} className="text-gray-400">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Organizaciones activas"
          value={tenants.active}
          sub={`${tenants.total} en total`}
          color="blue"
          icon={Building2}
        />
        <MetricCard
          label="Nuevas este mes"
          value={tenants.new_this_month}
          sub={monthName}
          color="green"
          icon={TrendingUp}
        />
        <MetricCard
          label="Pagos pendientes"
          value={payments.pending}
          sub="requieren revisión"
          color={payments.pending > 0 ? 'amber' : 'gray'}
          icon={Clock}
        />
        <MetricCard
          label={`Ingresos ${monthName}`}
          value={payments.revenue_bob_month > 0 ? `Bs. ${payments.revenue_bob_month}` : `USDT ${payments.revenue_usdt_month}`}
          sub={`${payments.verified_this_month} pago${payments.verified_this_month !== 1 ? 's' : ''} verificado${payments.verified_this_month !== 1 ? 's' : ''}`}
          color="purple"
          icon={CheckCircle2}
        />
      </div>

      {/* Plans breakdown */}
      <div className="bg-white border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Distribución por plan</h2>
        <div className="flex items-end gap-6">
          {(['free', 'basic', 'pro'] as PlanKey[]).map((plan) => {
            const count = tenants.by_plan[plan] ?? 0
            const pct = tenants.total > 0 ? Math.round((count / tenants.total) * 100) : 0
            return (
              <div key={plan} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-2xl font-bold text-gray-900">{count}</span>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${plan === 'pro' ? 'bg-purple-500' : plan === 'basic' ? 'bg-blue-500' : 'bg-gray-300'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_COLORS[plan]}`}>
                  {PLAN_CONFIG[plan].name}
                </span>
              </div>
            )
          })}
        </div>
        {tenants.suspended > 0 && (
          <p className="text-xs text-amber-600 mt-4 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {tenants.suspended} organización{tenants.suspended !== 1 ? 'es' : ''} suspendida{tenants.suspended !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Expiring soon */}
      {expiring_soon.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-amber-800">
              Planes que vencen en los próximos 15 días ({expiring_soon.length})
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Organización</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Plan</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Vence</th>
                <th className="px-5 py-3 w-48" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {expiring_soon.map((t) => {
                const daysLeft = Math.ceil(
                  (new Date(t.plan_expires_at).getTime() - Date.now()) / 86400000
                )
                return (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{t.name}</p>
                      <p className="text-xs text-gray-400">/t/{t.slug}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_COLORS[t.plan]}`}>
                        {PLAN_CONFIG[t.plan as PlanKey]?.name ?? t.plan}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-medium ${daysLeft <= 5 ? 'text-red-600' : 'text-amber-600'}`}>
                        {daysLeft === 0 ? 'Hoy' : daysLeft === 1 ? 'Mañana' : `En ${daysLeft} días`}
                      </span>
                      <p className="text-xs text-gray-400">
                        {new Date(t.plan_expires_at).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' })}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <a
                          href={`/t/${t.slug}/admin`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 hover:text-gray-600"
                          title="Abrir panel"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-3 text-xs"
                          onClick={() => { setActionTenant(t); setActionType('extend'); setMonths('1') }}
                        >
                          Extender
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-3 text-xs text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => { setActionTenant(t); setActionType('suspend') }}
                        >
                          <Ban className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pending payments shortcut */}
      {payments.pending > 0 && (
        <div className="bg-white border rounded-xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                {payments.pending} pago{payments.pending !== 1 ? 's' : ''} pendiente{payments.pending !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-gray-400">Comprobantes esperando verificación</p>
            </div>
          </div>
          <a href="/super/payments">
            <Button size="sm" className="gap-2">
              Revisar pagos
            </Button>
          </a>
        </div>
      )}

      {/* Quick action dialog */}
      <Dialog open={!!actionTenant} onOpenChange={(o) => { if (!o) setActionTenant(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Acción rápida — {actionTenant?.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Acción</p>
              <Select value={actionType} onValueChange={(v) => { if (v) setActionType(v as typeof actionType) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="extend">Extender plan actual</SelectItem>
                  <SelectItem value="plan">Cambiar plan</SelectItem>
                  <SelectItem value="suspend">Suspender organización</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {actionType === 'extend' && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Meses a agregar</p>
                <Select value={months} onValueChange={(v) => { if (v) setMonths(v) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['1','2','3','6','12'].map((m) => (
                      <SelectItem key={m} value={m}>{m} {Number(m) === 1 ? 'mes' : 'meses'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {actionType === 'plan' && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Nuevo plan</p>
                <Select value={newPlan} onValueChange={(v) => { if (v) setNewPlan(v) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['free','basic','pro'] as PlanKey[]).map((p) => (
                      <SelectItem key={p} value={p}>{PLAN_CONFIG[p].name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {actionType === 'suspend' && (
              <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-sm text-red-700">
                Esto bloqueará el acceso al panel de <strong>{actionTenant?.name}</strong>. Podés reactivarlo en cualquier momento desde Organizaciones.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActionTenant(null)}>Cancelar</Button>
            <Button
              onClick={handleAction}
              disabled={acting}
              variant={actionType === 'suspend' ? 'destructive' : 'default'}
              className="gap-2"
            >
              {acting && <Loader2 className="w-4 h-4 animate-spin" />}
              {actionType === 'extend' ? 'Extender' : actionType === 'plan' ? 'Cambiar plan' : 'Suspender'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
