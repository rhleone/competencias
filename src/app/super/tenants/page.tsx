'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, RefreshCw, Plus, ExternalLink, Users, Ban, CheckCircle2 } from 'lucide-react'
import { PLAN_CONFIG, type PlanKey } from '@/lib/plan-config'

type Tenant = {
  id: string
  slug: string
  name: string
  plan: string
  status: string
  plan_expires_at: string | null
  created_at: string
  member_count: number
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  suspended: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
}

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-gray-100 text-gray-600',
  basic: 'bg-blue-100 text-blue-700',
  pro: 'bg-purple-100 text-purple-700',
}

export default function SuperTenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminMode, setAdminMode] = useState<'invite' | 'password'>('invite')
  const [creating, setCreating] = useState(false)

  async function handleToggleStatus(t: Tenant) {
    const newStatus = t.status === 'active' ? 'suspended' : 'active'
    const label = newStatus === 'suspended' ? 'suspender' : 'reactivar'
    if (!confirm(`¿Confirmas ${label} a ${t.name}?`)) return
    const res = await fetch(`/api/super/tenants/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    const json = await res.json()
    if (!res.ok) toast.error(json.error ?? 'Error')
    else { toast.success(`${t.name} ${newStatus === 'active' ? 'reactivado' : 'suspendido'}`); load() }
  }

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/super/tenants')
    if (res.ok) {
      const json = await res.json()
      setTenants(json.tenants)
    } else {
      toast.error('Error al cargar organizaciones')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-generate slug from name
  function handleNameChange(val: string) {
    setName(val)
    if (!slug || slug === toSlug(name)) {
      setSlug(toSlug(val))
    }
  }

  function toSlug(val: string) {
    return val.toLowerCase().trim()
      .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e')
      .replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u')
      .replace(/ñ/g, 'n')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  function openCreate() {
    setName(''); setSlug(''); setAdminEmail(''); setAdminPassword(''); setAdminMode('invite')
    setCreateOpen(true)
  }

  async function handleCreate() {
    if (!name.trim() || !slug.trim() || !adminEmail.trim()) {
      toast.error('Completá todos los campos requeridos')
      return
    }
    if (adminMode === 'password' && !adminPassword.trim()) {
      toast.error('Ingresá una contraseña para el administrador')
      return
    }
    setCreating(true)
    const res = await fetch('/api/super/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        slug: slug.trim(),
        admin_email: adminEmail.trim(),
        admin_password: adminMode === 'password' ? adminPassword.trim() : undefined,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      toast.error(json.error ?? 'Error al crear')
    } else {
      toast.success(json.message)
      setCreateOpen(false)
      load()
    }
    setCreating(false)
  }

  const filtered = tenants.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Organizaciones</h1>
          <p className="text-sm text-gray-400 mt-0.5">{tenants.length} organización{tenants.length !== 1 ? 'es' : ''} registrada{tenants.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={load} className="text-gray-400">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={openCreate} size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            Nueva organización
          </Button>
        </div>
      </div>

      {/* Search */}
      <Input
        placeholder="Buscar por nombre o slug..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 max-w-sm"
      />

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Cargando...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{search ? 'Sin resultados' : 'No hay organizaciones registradas'}</p>
          {!search && (
            <Button onClick={openCreate} variant="outline" size="sm" className="mt-4 gap-2">
              <Plus className="w-4 h-4" /> Crear la primera organización
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Organización</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Plan</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Estado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Usuarios</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Vencimiento</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Creado</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((t) => {
                const planCfg = PLAN_CONFIG[t.plan as PlanKey]
                const isExpired = t.plan_expires_at && new Date(t.plan_expires_at) < new Date()
                return (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{t.name}</p>
                      <p className="text-xs text-gray-400">/t/{t.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_COLORS[t.plan] ?? PLAN_COLORS.free}`}>
                        {planCfg?.name ?? t.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <Badge variant="secondary" className={STATUS_COLORS[t.status] ?? ''}>
                        {t.status === 'active' ? 'Activo' : t.status === 'suspended' ? 'Suspendido' : 'Cancelado'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-600">
                      {t.member_count}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs">
                      {t.plan === 'free' ? (
                        <span className="text-gray-400">—</span>
                      ) : t.plan_expires_at ? (
                        <span className={isExpired ? 'text-red-500 font-medium' : 'text-gray-500'}>
                          {isExpired ? 'Vencido · ' : ''}
                          {new Date(t.plan_expires_at).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      ) : (
                        <span className="text-gray-400">Sin vencimiento</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-gray-400">
                      {new Date(t.created_at).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <a
                          href={`/t/${t.slug}/admin`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-700"
                          title="Abrir panel del tenant"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => handleToggleStatus(t)}
                          title={t.status === 'active' ? 'Suspender' : 'Reactivar'}
                          className={`transition ${t.status === 'active' ? 'text-gray-300 hover:text-red-500' : 'text-green-500 hover:text-green-700'}`}
                        >
                          {t.status === 'active'
                            ? <Ban className="w-4 h-4" />
                            : <CheckCircle2 className="w-4 h-4" />
                          }
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" />
              Nueva organización
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label>Nombre de la organización *</Label>
              <Input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Ej: Colegio Belgranianos"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>Slug (URL) *</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400 shrink-0">/t/</span>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  placeholder="colegio-belgranianos"
                />
              </div>
              <p className="text-xs text-gray-400">Solo letras minúsculas, números y guiones</p>
            </div>

            <div className="space-y-2">
              <Label>Email del administrador *</Label>
              <Input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@colegio.edu"
              />
            </div>

            <div className="space-y-2">
              <Label>Crear cuenta del administrador</Label>
              <Select value={adminMode} onValueChange={(v) => { if (v) setAdminMode(v as 'invite' | 'password') }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invite">Enviar invitación por email</SelectItem>
                  <SelectItem value="password">Crear con contraseña ahora</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {adminMode === 'password' && (
              <div className="space-y-2">
                <Label>Contraseña inicial</Label>
                <Input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
            )}

            {adminMode === 'invite' && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
                El administrador recibirá un email para activar su cuenta. Si ya tiene cuenta, se lo agrega directamente.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating} className="gap-2">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {creating ? 'Creando...' : 'Crear organización'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
