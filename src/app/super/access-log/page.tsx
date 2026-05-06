'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw, ExternalLink, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

type LogEntry = {
  id: string
  accessed_at: string
  superadmin: { id: string; full_name: string | null; email: string }
  tenant: { id: string; slug: string; name: string }
}

export default function AccessLogPage() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/super/access-log')
    if (res.ok) {
      const json = await res.json()
      setEntries(json.entries)
    } else {
      toast.error('Error al cargar el log')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Group entries by date for readability
  const grouped: { date: string; items: LogEntry[] }[] = []
  for (const entry of entries) {
    const date = new Date(entry.accessed_at).toLocaleDateString('es-BO', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    const last = grouped[grouped.length - 1]
    if (last?.date === date) {
      last.items.push(entry)
    } else {
      grouped.push({ date, items: [entry] })
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Log de accesos</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Accesos cross-tenant de superadmins · últimas 200 entradas
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={load} className="text-gray-400">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Cargando...</span>
        </div>
      ) : entries.length === 0 ? (
        <div className="py-16 text-center text-gray-300">
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm text-gray-400">Sin accesos registrados todavía</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ date, items }) => (
            <div key={date}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 capitalize">
                {date}
              </p>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <tbody className="divide-y">
                    {items.map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 w-28 text-xs text-gray-400 tabular-nums shrink-0">
                          {new Date(entry.accessed_at).toLocaleTimeString('es-BO', {
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 text-xs">
                            {entry.superadmin.full_name ?? entry.superadmin.email}
                          </p>
                          {entry.superadmin.full_name && (
                            <p className="text-xs text-gray-400">{entry.superadmin.email}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">→</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 text-xs">{entry.tenant.name}</p>
                          <p className="text-xs text-gray-400">/t/{entry.tenant.slug}</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <a
                            href={`/t/${entry.tenant.slug}/admin`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-600"
                            title="Abrir panel"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
