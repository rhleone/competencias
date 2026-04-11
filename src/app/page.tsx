import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

type EditionInfo = { name: string; year: number; status: string; start_date: string; end_date: string }

export default async function HomePage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any

  // Try to find the active (or most recent) edition for display
  let edition: EditionInfo | null = null
  try {
    const { data: active } = await supabase
      .from('editions')
      .select('name, year, status, start_date, end_date')
      .eq('status', 'active')
      .maybeSingle()
    if (active) {
      edition = active as EditionInfo
    } else {
      const { data: latest } = await supabase
        .from('editions')
        .select('name, year, status, start_date, end_date')
        .order('year', { ascending: false })
        .limit(1)
        .maybeSingle()
      edition = latest as EditionInfo | null
    }
  } catch { /* no edition available */ }

  function fmtDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })
  }

  const statusLabel: Record<string, string> = {
    active: 'En curso',
    draft: 'Próximamente',
    finished: 'Finalizado',
  }
  const statusColor: Record<string, string> = {
    active: 'bg-green-400/20 text-green-200 border-green-400/30',
    draft: 'bg-yellow-400/20 text-yellow-200 border-yellow-400/30',
    finished: 'bg-gray-400/20 text-gray-300 border-gray-400/30',
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-700 flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center text-white px-6 py-16">
        {/* Logo placeholder */}
        <div className="w-20 h-20 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mb-8 shadow-xl">
          <span className="text-4xl font-black text-white">B</span>
        </div>

        <h1 className="text-5xl md:text-6xl font-black mb-3 text-center tracking-tight">
          Juegos Belgranianos
        </h1>
        <p className="text-xl text-blue-200 mb-8 text-center">
          Campeonato Escolar Oficial
        </p>

        {/* Edition info card */}
        {edition && (
          <div className="bg-white/10 border border-white/20 rounded-2xl px-6 py-4 mb-10 text-center backdrop-blur-sm">
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusColor[edition.status] ?? statusColor.draft}`}>
                {statusLabel[edition.status] ?? edition.status}
              </span>
            </div>
            <p className="text-lg font-bold text-white">{edition.name}</p>
            <p className="text-sm text-blue-200 mt-0.5">
              {fmtDate(edition.start_date)} — {fmtDate(edition.end_date)}
            </p>
          </div>
        )}

        {/* CTAs públicos */}
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
          <Link
            href="/resultados"
            className="flex-1 bg-white text-blue-900 px-6 py-3.5 rounded-xl font-bold text-center hover:bg-blue-50 transition shadow-lg"
          >
            Resultados en vivo
          </Link>
          <Link
            href="/fixture"
            className="flex-1 bg-white/10 border border-white/30 text-white px-6 py-3.5 rounded-xl font-semibold text-center hover:bg-white/20 transition"
          >
            Ver fixture
          </Link>
        </div>

        {/* Acceso operadores/admin */}
        <div className="mt-8 w-full max-w-sm">
          <div className="border-t border-white/10 pt-6 flex flex-col items-center gap-2">
            <p className="text-xs text-blue-400 uppercase tracking-widest font-medium">Acceso staff</p>
            <Link
              href="/auth/login"
              className="w-full bg-white/10 border border-white/20 text-white px-6 py-3 rounded-xl font-semibold text-center hover:bg-white/20 transition text-sm"
            >
              Ingresar como operador / admin →
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom strip */}
      <div className="border-t border-white/10 py-4 px-6 text-center">
        <p className="text-xs text-blue-400">
          Resultados en tiempo real · Posiciones · Fixture completo · Bracket eliminatorio
        </p>
      </div>
    </main>
  )
}
