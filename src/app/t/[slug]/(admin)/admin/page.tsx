import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import type { Database, EditionStatus } from '@/types/database'
import { APP_NAME } from '@/lib/app-config'

type Edition = Database['public']['Tables']['editions']['Row']

function statusBadge(status: EditionStatus) {
  if (status === 'active') return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">En curso</Badge>
  if (status === 'draft') return <Badge variant="secondary">Borrador</Badge>
  return <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100">Finalizado</Badge>
}

export default async function AdminDashboard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()
  if (!authData?.user) redirect('/auth/login')

  const { data: editionsData } = await supabase
    .from('editions')
    .select('*')
    .order('year', { ascending: false })
  const editions = (editionsData ?? []) as Edition[]

  const active = editions.find((e) => e.status === 'active')
  let stats = { disciplines: 0, teams: 0, matchesTotal: 0, matchesPlayed: 0 }
  if (active) {
    const [disc, teams, matchesAll, matchesPlayed] = await Promise.all([
      supabase.from('disciplines').select('id', { count: 'exact', head: true }).eq('edition_id', active.id),
      supabase.from('team_disciplines').select('id', { count: 'exact', head: true })
        .in('discipline_id',
          (await supabase.from('disciplines').select('id').eq('edition_id', active.id)).data?.map((d: { id: string }) => d.id) ?? []
        ),
      supabase.from('matches').select('id', { count: 'exact', head: true }).eq('edition_id', active.id),
      supabase.from('matches').select('id', { count: 'exact', head: true }).eq('edition_id', active.id).eq('status', 'finished'),
    ])
    stats = {
      disciplines: disc.count ?? 0,
      teams: teams.count ?? 0,
      matchesTotal: matchesAll.count ?? 0,
      matchesPlayed: matchesPlayed.count ?? 0,
    }
  }

  return (
    <main className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Panel de Administración</h1>
        <p className="text-gray-500 mt-1">{APP_NAME}</p>
      </div>

      {active ? (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Edición activa</h2>
            <span className="text-sm font-medium text-gray-700">{active.name}</span>
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">En curso</Badge>
            <Link href={`/t/${slug}/admin/editions/${active.id}`} className="ml-auto text-sm text-blue-600 hover:underline">
              Gestionar →
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Disciplinas" value={stats.disciplines} />
            <StatCard label="Inscripciones" value={stats.teams} />
            <StatCard label="Partidos jugados" value={stats.matchesPlayed} />
            <StatCard label="Total de partidos" value={stats.matchesTotal} />
          </div>
          {stats.matchesTotal > 0 && (
            <>
              <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${Math.round((stats.matchesPlayed / stats.matchesTotal) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                {Math.round((stats.matchesPlayed / stats.matchesTotal) * 100)}% completado
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          No hay ninguna edición activa. Activá una edición para ver estadísticas.
        </div>
      )}

      <div className="bg-white rounded-lg border">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Ediciones del Campeonato</h2>
          <Link
            href={`/t/${slug}/admin/editions/new`}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            + Nueva Edición
          </Link>
        </div>
        <div className="p-6">
          {!editions.length ? (
            <p className="text-gray-500">No hay ediciones creadas aún.</p>
          ) : (
            <div className="space-y-2">
              {editions.map((edition) => (
                <div key={edition.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition">
                  <div className="flex items-center gap-3">
                    {statusBadge(edition.status)}
                    <div>
                      <p className="font-medium text-sm">{edition.name}</p>
                      <p className="text-xs text-gray-400">
                        {edition.year} · {new Date(edition.start_date + 'T00:00:00').toLocaleDateString('es-BO', { day: 'numeric', month: 'short' })} — {new Date(edition.end_date + 'T00:00:00').toLocaleDateString('es-BO', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link href={`/t/${slug}/resultados?edition=${edition.id}`} target="_blank" className="text-xs text-gray-400 hover:text-gray-700 transition">
                      Resultados ↗
                    </Link>
                    <Link href={`/t/${slug}/admin/editions/${edition.id}`} className="text-blue-600 hover:underline text-sm font-medium">
                      Gestionar →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
