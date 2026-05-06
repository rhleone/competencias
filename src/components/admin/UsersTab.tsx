'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useTenant } from '@/lib/tenant-context'
import { UserPlus, Loader2, ShieldCheck, Wrench, MoreHorizontal, Trash2, RefreshCw } from 'lucide-react'

type Member = {
  id: string
  user_id: string
  role: 'tenant_admin' | 'operator'
  joined_at: string
  full_name: string | null
  email: string
}

type UsersData = {
  members: Member[]
  plan: string
  member_limit: number
  current_user_id: string
  current_role: string | null
}

const ROLE_LABELS: Record<string, string> = {
  tenant_admin: 'Administrador',
  operator: 'Operador',
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  basic: 'Básico',
  pro: 'Pro',
}

function initials(name: string | null, email: string) {
  if (name) return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  return email.slice(0, 2).toUpperCase()
}

function Avatar({ name, email }: { name: string | null; email: string }) {
  return (
    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
      {initials(name, email)}
    </div>
  )
}

export default function UsersTab() {
  const { slug } = useTenant()
  const [data, setData] = useState<UsersData | null>(null)
  const [loading, setLoading] = useState(true)

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'tenant_admin' | 'operator'>('operator')
  const [inviting, setInviting] = useState(false)

  // Role change / remove
  const [actionUserId, setActionUserId] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [changingRole, setChangingRole] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/tenants/${slug}/users`)
    if (res.ok) setData(await res.json())
    else toast.error('Error al cargar usuarios')
    setLoading(false)
  }, [slug])

  useEffect(() => { load() }, [load])

  async function handleInvite() {
    if (!inviteEmail.trim()) { toast.error('Ingresá un email'); return }
    setInviting(true)
    const res = await fetch(`/api/tenants/${slug}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    })
    const json = await res.json()
    if (!res.ok) {
      toast.error(json.error ?? 'Error al invitar')
    } else {
      toast.success(json.message)
      setInviteOpen(false)
      setInviteEmail('')
      setInviteRole('operator')
      load()
    }
    setInviting(false)
  }

  async function handleRoleChange(userId: string, newRole: 'tenant_admin' | 'operator') {
    setChangingRole(userId)
    const res = await fetch(`/api/tenants/${slug}/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    })
    if (res.ok) {
      toast.success('Rol actualizado')
      load()
    } else {
      const j = await res.json()
      toast.error(j.error ?? 'Error al cambiar rol')
    }
    setChangingRole(null)
    setActionUserId(null)
  }

  async function handleRemove(userId: string, name: string | null, email: string) {
    const label = name ?? email
    if (!confirm(`¿Confirmas que querés quitar a ${label} de esta organización?`)) return
    setRemoving(userId)
    const res = await fetch(`/api/tenants/${slug}/users/${userId}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success(`${label} fue eliminado de la organización`)
      load()
    } else {
      const j = await res.json()
      toast.error(j.error ?? 'Error al eliminar')
    }
    setRemoving(null)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Cargando usuarios...</span>
      </div>
    )
  }

  if (!data) return <p className="text-sm text-red-500 py-4">Error al cargar usuarios.</p>

  const { members, plan, member_limit, current_user_id } = data
  const atLimit = member_limit !== Infinity && members.length >= member_limit
  const canManage = data.current_role === 'tenant_admin' || data.current_role === 'superadmin'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Usuarios</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {members.length} de {member_limit === Infinity ? '∞' : member_limit} miembros ·{' '}
            <span className="font-medium">{PLAN_LABELS[plan] ?? plan}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={load} className="text-gray-400">
            <RefreshCw className="w-4 h-4" />
          </Button>
          {canManage && (
            <Button
              onClick={() => setInviteOpen(true)}
              disabled={atLimit}
              className="gap-2"
              size="sm"
            >
              <UserPlus className="w-4 h-4" />
              Invitar usuario
            </Button>
          )}
        </div>
      </div>

      {/* Plan limit warning */}
      {atLimit && canManage && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          Alcanzaste el límite de <strong>{member_limit} miembros</strong> del plan {PLAN_LABELS[plan]}.
          Actualizá tu plan para agregar más usuarios.
        </div>
      )}

      {/* Members table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Usuario</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Rol</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Miembro desde</th>
              {canManage && <th className="px-4 py-3 w-10" />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {members.map((m) => {
              const isSelf = m.user_id === current_user_id
              return (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={m.full_name} email={m.email} />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {m.full_name ?? <span className="text-gray-400 italic">Sin nombre</span>}
                          {isSelf && <span className="ml-2 text-xs text-blue-600 font-normal">(tú)</span>}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="secondary"
                      className={m.role === 'tenant_admin'
                        ? 'bg-blue-50 text-blue-700 border-blue-200 gap-1'
                        : 'bg-gray-50 text-gray-600 gap-1'
                      }
                    >
                      {m.role === 'tenant_admin'
                        ? <ShieldCheck className="w-3 h-3" />
                        : <Wrench className="w-3 h-3" />
                      }
                      {ROLE_LABELS[m.role] ?? m.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs hidden sm:table-cell">
                    {new Date(m.joined_at).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      {!isSelf && (
                        <div className="relative">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-8 h-8 p-0"
                            onClick={() => setActionUserId(actionUserId === m.user_id ? null : m.user_id)}
                          >
                            {changingRole === m.user_id || removing === m.user_id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <MoreHorizontal className="w-4 h-4" />
                            }
                          </Button>

                          {actionUserId === m.user_id && (
                            <div className="absolute right-0 top-9 z-10 bg-white border rounded-lg shadow-lg py-1 min-w-[180px]">
                              <button
                                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                                onClick={() => handleRoleChange(m.user_id, m.role === 'tenant_admin' ? 'operator' : 'tenant_admin')}
                              >
                                <ShieldCheck className="w-4 h-4 text-blue-500" />
                                {m.role === 'tenant_admin' ? 'Cambiar a Operador' : 'Cambiar a Administrador'}
                              </button>
                              <div className="border-t my-1" />
                              <button
                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                onClick={() => { setActionUserId(null); handleRemove(m.user_id, m.full_name, m.email) }}
                              >
                                <Trash2 className="w-4 h-4" />
                                Quitar de la organización
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Close dropdown on outside click */}
      {actionUserId && (
        <div className="fixed inset-0 z-9" onClick={() => setActionUserId(null)} />
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-600" />
              Invitar usuario
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="usuario@email.com"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'tenant_admin' | 'operator')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operator">
                    <div className="flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-gray-500" />
                      <div>
                        <p className="font-medium">Operador</p>
                        <p className="text-xs text-gray-400">Carga resultados de partidos</p>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="tenant_admin">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-blue-600" />
                      <div>
                        <p className="font-medium">Administrador</p>
                        <p className="text-xs text-gray-400">Acceso total al panel</p>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
              Si el usuario ya tiene una cuenta, será agregado inmediatamente.
              Si no tiene cuenta, recibirá un correo de invitación para registrarse.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancelar</Button>
            <Button onClick={handleInvite} disabled={inviting} className="gap-2">
              {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {inviting ? 'Enviando...' : 'Invitar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
