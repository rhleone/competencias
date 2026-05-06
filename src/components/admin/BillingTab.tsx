'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useTenant } from '@/lib/tenant-context'
import { createClient } from '@/lib/supabase/client'
import { PLAN_CONFIG, PLAN_FEATURES, type PlanKey } from '@/lib/plan-config'
import { CheckCircle2, Clock, XCircle, Loader2, RefreshCw, Upload, ExternalLink, CreditCard } from 'lucide-react'

type Payment = {
  id: string
  plan_requested: string
  amount: number
  currency: string
  method: string
  status: 'pending' | 'verified' | 'rejected'
  months_granted: number
  review_notes: string | null
  created_at: string
  reviewed_at: string | null
}

type BillingData = {
  plan: string
  plan_expires_at: string | null
  member_count: number
  member_limit: number
  payments: Payment[]
  instructions: {
    tigo_money_phone: string
    tigo_money_name: string
    takenos_wallet: string
  }
}

const METHOD_LABELS: Record<string, string> = {
  tigo_money: 'Tigo Money',
  takenos: 'Takenos',
  bank_transfer: 'Transferencia bancaria',
}

const STATUS_CONFIG = {
  pending:  { label: 'Pendiente',  icon: Clock,        className: 'bg-amber-50 text-amber-700 border-amber-200' },
  verified: { label: 'Verificado', icon: CheckCircle2, className: 'bg-green-50 text-green-700 border-green-200' },
  rejected: { label: 'Rechazado',  icon: XCircle,      className: 'bg-red-50 text-red-600 border-red-200' },
}

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = {
    free:  'bg-gray-100 text-gray-600',
    basic: 'bg-blue-100 text-blue-700',
    pro:   'bg-purple-100 text-purple-700',
  }
  const cfg = PLAN_CONFIG[plan as PlanKey]
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors[plan] ?? colors.free}`}>
      {cfg?.name ?? plan}
    </span>
  )
}

export default function BillingTab() {
  const { id: tenantId, slug } = useTenant()
  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)

  // Upgrade dialog
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<'basic' | 'pro'>('basic')
  const [method, setMethod] = useState<'tigo_money' | 'takenos'>('tigo_money')
  const [currency, setCurrency] = useState<'BOB' | 'USDT'>('BOB')
  const [file, setFile] = useState<File | null>(null)
  const [notes, setNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/tenants/${slug}/billing`)
    if (res.ok) setData(await res.json())
    else toast.error('Error al cargar información de plan')
    setLoading(false)
  }, [slug])

  useEffect(() => { load() }, [load])

  function openUpgrade(plan: 'basic' | 'pro') {
    setSelectedPlan(plan)
    setMethod('tigo_money')
    setCurrency('BOB')
    setFile(null)
    setNotes('')
    setUpgradeOpen(true)
  }

  async function handleSubmit() {
    if (!file) { toast.error('Adjuntá el comprobante de pago'); return }

    setUploading(true)
    const supabase = createClient()
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${tenantId}/${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('payment-proofs')
      .upload(path, file, { upsert: false })

    if (uploadError) {
      toast.error('Error al subir el comprobante: ' + uploadError.message)
      setUploading(false)
      return
    }

    // Signed URL valid for 10 years
    const { data: signedData } = await supabase.storage
      .from('payment-proofs')
      .createSignedUrl(path, 315360000)

    setUploading(false)
    setSubmitting(true)

    const res = await fetch(`/api/tenants/${slug}/billing/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan_requested: selectedPlan,
        method,
        currency,
        comprobante_url: signedData?.signedUrl ?? null,
        notes: notes.trim() || null,
      }),
    })

    const json = await res.json()
    if (!res.ok) {
      toast.error(json.error ?? 'Error al enviar')
    } else {
      toast.success(json.message)
      setUpgradeOpen(false)
      load()
    }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Cargando información de plan...</span>
      </div>
    )
  }

  if (!data) return <p className="text-sm text-red-500 py-4">Error al cargar plan.</p>

  const planCfg = PLAN_CONFIG[data.plan as PlanKey] ?? PLAN_CONFIG.free
  const isExpired = data.plan_expires_at && new Date(data.plan_expires_at) < new Date()
  const expiresInDays = data.plan_expires_at
    ? Math.ceil((new Date(data.plan_expires_at).getTime() - Date.now()) / 86400000)
    : null
  const selectedPlanCfg = PLAN_CONFIG[selectedPlan]
  const price = currency === 'USDT' ? selectedPlanCfg.price_usdt : selectedPlanCfg.price_bob
  const currencyLabel = currency === 'BOB' ? 'Bs.' : 'USDT'

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Plan y facturación</h2>
          <p className="text-sm text-gray-500 mt-0.5">Gestioná tu suscripción y pagos</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load} className="text-gray-400">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Current plan card */}
      <div className="border rounded-xl p-5 bg-gradient-to-br from-blue-50 to-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Plan actual</p>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-gray-900">{planCfg.name}</span>
              {data.plan !== 'free' && <PlanBadge plan={data.plan} />}
            </div>
            <p className="text-sm text-gray-500">
              {data.member_count} de{' '}
              {data.member_limit === Infinity ? '∞' : data.member_limit} usuarios
            </p>
          </div>
          {data.plan !== 'free' && (
            <div className="text-right text-sm">
              {isExpired ? (
                <span className="text-red-600 font-medium">Plan vencido</span>
              ) : expiresInDays !== null && expiresInDays <= 15 ? (
                <span className="text-amber-600 font-medium">Vence en {expiresInDays} días</span>
              ) : data.plan_expires_at ? (
                <span className="text-gray-400">
                  Vence el {new Date(data.plan_expires_at).toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              ) : null}
            </div>
          )}
        </div>

        {isExpired && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
            Tu plan venció. Realizá un nuevo pago para continuar con las funciones premium.
          </div>
        )}
        {!isExpired && expiresInDays !== null && expiresInDays <= 15 && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700">
            Tu plan vence pronto. Renovalo para no perder el acceso.
          </div>
        )}
      </div>

      {/* Plan comparison */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Planes disponibles</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(['free', 'basic', 'pro'] as PlanKey[]).map((plan) => {
            const cfg = PLAN_CONFIG[plan]
            const features = PLAN_FEATURES[plan] ?? []
            const isCurrent = data.plan === plan && !isExpired
            const isUpgrade = plan !== 'free' && (data.plan === 'free' || isExpired || (plan === 'pro' && data.plan === 'basic'))

            return (
              <div
                key={plan}
                className={`border rounded-xl p-4 flex flex-col gap-3 ${
                  isCurrent ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900">{cfg.name}</span>
                    {isCurrent && <span className="text-xs text-blue-600 font-medium">Actual</span>}
                  </div>
                  <p className="text-lg font-bold mt-1">
                    {cfg.price_bob === 0 ? (
                      <span className="text-gray-900">Gratis</span>
                    ) : (
                      <span className="text-gray-900">Bs. {cfg.price_bob}<span className="text-sm font-normal text-gray-400">/mes</span></span>
                    )}
                  </p>
                  {cfg.price_usdt > 0 && (
                    <p className="text-xs text-gray-400">o USDT {cfg.price_usdt}/mes</p>
                  )}
                </div>
                <ul className="space-y-1 flex-1">
                  {features.map((f: string) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-gray-600">
                      <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                {isUpgrade ? (
                  <Button size="sm" onClick={() => openUpgrade(plan as 'basic' | 'pro')} className="w-full">
                    Actualizar a {cfg.name}
                  </Button>
                ) : isCurrent ? (
                  <Button size="sm" variant="outline" disabled className="w-full">Plan actual</Button>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      {/* Payment history */}
      {data.payments.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Historial de pagos</h3>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Plan</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Monto</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600 hidden sm:table-cell">Método</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Estado</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600 hidden md:table-cell">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.payments.map((p) => {
                  const sc = STATUS_CONFIG[p.status]
                  const Icon = sc.icon
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <PlanBadge plan={p.plan_requested} />
                        {p.status === 'verified' && (
                          <span className="ml-2 text-xs text-gray-400">{p.months_granted} mes{p.months_granted !== 1 ? 'es' : ''}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {p.currency === 'BOB' ? `Bs. ${p.amount}` : `USDT ${p.amount}`}
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{METHOD_LABELS[p.method] ?? p.method}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className={`gap-1 ${sc.className}`}>
                          <Icon className="w-3 h-3" />
                          {sc.label}
                        </Badge>
                        {p.status === 'rejected' && p.review_notes && (
                          <p className="text-xs text-red-500 mt-0.5">{p.review_notes}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">
                        {new Date(p.created_at).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upgrade dialog */}
      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              Actualizar a {selectedPlanCfg.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-1">
            {/* Price */}
            <div className="bg-blue-50 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="font-semibold text-blue-900">{selectedPlanCfg.name}</p>
                <p className="text-xs text-blue-600">{PLAN_FEATURES[selectedPlan]?.[0]} · {PLAN_FEATURES[selectedPlan]?.[1]}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-blue-900">{currencyLabel} {price}</p>
                <p className="text-xs text-blue-500">por mes</p>
              </div>
            </div>

            {/* Currency toggle */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Moneda</p>
              <div className="flex gap-2">
                {(['BOB', 'USDT'] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCurrency(c)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                      currency === c
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {c === 'BOB' ? 'Bolivianos (Bs.)' : 'USDT (Takenos)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment method */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Método de pago</p>
              <div className="flex gap-2">
                {(['tigo_money', 'takenos'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                      method === m
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {METHOD_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment instructions */}
            <div className="bg-gray-50 border rounded-lg p-3 text-sm space-y-1">
              <p className="font-medium text-gray-700">Instrucciones de pago</p>
              {method === 'tigo_money' && (
                <>
                  <p className="text-gray-600">
                    Realizá una transferencia por <strong>{currencyLabel} {price}</strong> a:
                  </p>
                  <p className="font-mono text-gray-800">
                    {data.instructions.tigo_money_phone || '—'} · {data.instructions.tigo_money_name || '—'}
                  </p>
                  <p className="text-xs text-gray-500">Tigo Money / Tigo Bolivia</p>
                </>
              )}
              {method === 'takenos' && (
                <>
                  <p className="text-gray-600">
                    Enviá <strong>USDT {selectedPlanCfg.price_usdt}</strong> (TRC20 o red Takenos) a:
                  </p>
                  <p className="font-mono text-xs break-all text-gray-800">
                    {data.instructions.takenos_wallet || '—'}
                  </p>
                  <a
                    href="https://takenos.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    Abrir Takenos <ExternalLink className="w-3 h-3" />
                  </a>
                </>
              )}
            </div>

            {/* Comprobante upload */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Comprobante de pago *</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className={`w-full border-2 border-dashed rounded-lg py-4 flex flex-col items-center gap-2 text-sm transition ${
                  file ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-200 hover:border-blue-300 text-gray-400'
                }`}
              >
                <Upload className="w-5 h-5" />
                {file ? file.name : 'Subir captura o PDF del pago'}
                <span className="text-xs opacity-60">JPG, PNG, PDF — máx. 5 MB</span>
              </button>
            </div>

            {/* Notes */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Notas adicionales (opcional)</p>
              <Textarea
                placeholder="Ej: número de referencia, observaciones..."
                value={notes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                rows={2}
                className="text-sm resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUpgradeOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={uploading || submitting || !file}
              className="gap-2"
            >
              {(uploading || submitting) && <Loader2 className="w-4 h-4 animate-spin" />}
              {uploading ? 'Subiendo...' : submitting ? 'Enviando...' : 'Enviar comprobante'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
