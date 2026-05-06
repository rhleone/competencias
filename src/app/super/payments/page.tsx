'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { CheckCircle2, Clock, XCircle, Loader2, RefreshCw, ExternalLink } from 'lucide-react'
import { PLAN_CONFIG, type PlanKey } from '@/lib/plan-config'

type Payment = {
  id: string
  plan_requested: string
  amount: number
  currency: string
  method: string
  status: 'pending' | 'verified' | 'rejected'
  months_granted: number
  comprobante_url: string | null
  notes: string | null
  review_notes: string | null
  created_at: string
  reviewed_at: string | null
  tenant: { id: string; slug: string; name: string; plan: string } | null
  submitter_profile: { full_name: string | null; email: string } | null
}

const METHOD_LABELS: Record<string, string> = {
  tigo_money: 'Tigo Money',
  takenos: 'Takenos',
  bank_transfer: 'Banco',
}

const STATUS_CONFIG = {
  pending:  { label: 'Pendiente',  icon: Clock,        className: 'bg-amber-50 text-amber-700 border-amber-200' },
  verified: { label: 'Verificado', icon: CheckCircle2, className: 'bg-green-50 text-green-700 border-green-200' },
  rejected: { label: 'Rechazado',  icon: XCircle,      className: 'bg-red-50 text-red-600 border-red-200' },
}

export default function SuperPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'verified' | 'rejected'>('pending')

  // Approve dialog
  const [approveTarget, setApproveTarget] = useState<Payment | null>(null)
  const [months, setMonths] = useState('1')
  const [approveNotes, setApproveNotes] = useState('')
  const [approving, setApproving] = useState(false)

  // Reject dialog
  const [rejectTarget, setRejectTarget] = useState<Payment | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [rejecting, setRejecting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/super/payments')
    if (res.ok) {
      const json = await res.json()
      setPayments(json.payments)
    } else {
      toast.error('Error al cargar pagos')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleApprove() {
    if (!approveTarget) return
    setApproving(true)
    const res = await fetch(`/api/super/payments/${approveTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', months: Number(months), review_notes: approveNotes.trim() || null }),
    })
    const json = await res.json()
    if (!res.ok) {
      toast.error(json.error ?? 'Error al aprobar')
    } else {
      toast.success(json.message)
      setApproveTarget(null)
      setApproveNotes('')
      setMonths('1')
      load()
    }
    setApproving(false)
  }

  async function handleReject() {
    if (!rejectTarget) return
    if (!rejectNotes.trim()) { toast.error('Ingresá el motivo del rechazo'); return }
    setRejecting(true)
    const res = await fetch(`/api/super/payments/${rejectTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', review_notes: rejectNotes.trim() }),
    })
    const json = await res.json()
    if (!res.ok) {
      toast.error(json.error ?? 'Error al rechazar')
    } else {
      toast.success('Pago rechazado')
      setRejectTarget(null)
      setRejectNotes('')
      load()
    }
    setRejecting(false)
  }

  const filtered = filter === 'all' ? payments : payments.filter((p) => p.status === filter)
  const pendingCount = payments.filter((p) => p.status === 'pending').length

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pagos y suscripciones</h1>
          {pendingCount > 0 && (
            <p className="text-sm text-amber-600 mt-0.5 font-medium">{pendingCount} pago{pendingCount !== 1 ? 's' : ''} pendiente{pendingCount !== 1 ? 's' : ''}</p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={load} className="text-gray-400">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 border-b">
        {(['pending', 'all', 'verified', 'rejected'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              filter === f ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {f === 'all' ? 'Todos' : f === 'pending' ? 'Pendientes' : f === 'verified' ? 'Verificados' : 'Rechazados'}
            {f === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 bg-amber-100 text-amber-700 text-xs px-1.5 rounded-full">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Cargando...</span>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">Sin pagos en esta categoría</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Organización</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Plan</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Monto</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Método</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Fecha</th>
                <th className="px-4 py-3 w-36" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((p) => {
                const sc = STATUS_CONFIG[p.status]
                const Icon = sc.icon
                const planCfg = PLAN_CONFIG[p.plan_requested as PlanKey]
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{p.tenant?.name ?? '—'}</p>
                      <p className="text-xs text-gray-400">{p.submitter_profile?.email ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{planCfg?.name ?? p.plan_requested}</span>
                      {p.status === 'verified' && (
                        <span className="ml-1 text-xs text-gray-400">{p.months_granted}m</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {p.currency === 'BOB' ? `Bs. ${p.amount}` : `USDT ${p.amount}`}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{METHOD_LABELS[p.method] ?? p.method}</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className={`gap-1 ${sc.className}`}>
                        <Icon className="w-3 h-3" />
                        {sc.label}
                      </Badge>
                      {p.review_notes && (
                        <p className="text-xs text-gray-400 mt-0.5 max-w-[160px] truncate" title={p.review_notes}>{p.review_notes}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell">
                      {new Date(p.created_at).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        {p.comprobante_url && (
                          <a
                            href={p.comprobante_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800"
                            title="Ver comprobante"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                        {p.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 border-green-200 hover:bg-green-50 h-7 px-2 text-xs"
                              onClick={() => { setApproveTarget(p); setMonths('1'); setApproveNotes('') }}
                            >
                              Aprobar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 border-red-200 hover:bg-red-50 h-7 px-2 text-xs"
                              onClick={() => { setRejectTarget(p); setRejectNotes('') }}
                            >
                              Rechazar
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Approve dialog */}
      <Dialog open={!!approveTarget} onOpenChange={(o) => { if (!o) setApproveTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="w-5 h-5" />
              Aprobar pago
            </DialogTitle>
          </DialogHeader>
          {approveTarget && (
            <div className="space-y-4 py-1">
              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                <p><span className="text-gray-500">Organización:</span> <strong>{approveTarget.tenant?.name}</strong></p>
                <p><span className="text-gray-500">Plan:</span> {PLAN_CONFIG[approveTarget.plan_requested as PlanKey]?.name}</p>
                <p><span className="text-gray-500">Monto:</span> {approveTarget.currency === 'BOB' ? `Bs. ${approveTarget.amount}` : `USDT ${approveTarget.amount}`}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Meses a otorgar</p>
                <Select value={months} onValueChange={(v) => { if (v) setMonths(v) }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 mes</SelectItem>
                    <SelectItem value="3">3 meses</SelectItem>
                    <SelectItem value="6">6 meses</SelectItem>
                    <SelectItem value="12">12 meses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Notas (opcional)</p>
                <Textarea
                  value={approveNotes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setApproveNotes(e.target.value)}
                  placeholder="Notas internas..."
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>Cancelar</Button>
            <Button onClick={handleApprove} disabled={approving} className="bg-green-600 hover:bg-green-700 gap-2">
              {approving && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirmar aprobación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) setRejectTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="w-5 h-5" />
              Rechazar pago
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-gray-500">El tenant será notificado del rechazo.</p>
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Motivo del rechazo *</p>
              <Textarea
                value={rejectNotes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRejectNotes(e.target.value)}
                placeholder="Ej: comprobante ilegible, monto incorrecto..."
                rows={3}
                className="text-sm resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancelar</Button>
            <Button onClick={handleReject} disabled={rejecting} variant="destructive" className="gap-2">
              {rejecting && <Loader2 className="w-4 h-4 animate-spin" />}
              Rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
