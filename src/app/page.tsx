import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { EditionStatus } from '@/types/database'
import { APP_NAME } from '@/lib/app-config'

type EditionCard = {
  id: string
  name: string
  year: number
  status: EditionStatus
  start_date: string
  end_date: string
  image_url: string | null
}

const STATUS_LABEL: Record<EditionStatus, string> = {
  active: 'En Curso',
  finished: 'Finalizado',
  draft: 'Muy pronto',
}

const STATUS_CLASS: Record<EditionStatus, string> = {
  active: 'bg-blue-600',
  finished: 'bg-red-500',
  draft: 'bg-orange-400',
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function cardDateLabel(edition: EditionCard) {
  if (edition.status === 'active') return `Inicio: ${fmtDate(edition.start_date)}`
  if (edition.status === 'finished') return `Finalizado: ${fmtDate(edition.end_date)}`
  return 'Próximamente'
}

export default async function HomePage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any

  let editions: EditionCard[] = []
  try {
    const { data } = await supabase
      .from('editions')
      .select('id, name, year, status, start_date, end_date, image_url')
      .order('year', { ascending: false })
      .order('created_at', { ascending: false })
    editions = (data as EditionCard[]) ?? []
  } catch { /* no editions available */ }

  return (
    <main className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #0f2a44, #1b4b7a)', color: 'white' }}>

      {/* Header */}
      <header className="text-center px-5 py-10">
        <h1 className="text-4xl font-black mb-2">{APP_NAME}</h1>
        <p className="text-blue-200 text-base">Competiciones deportivas</p>
      </header>

      {/* Cards grid */}
      <div className="flex-1 max-w-6xl w-full mx-auto px-5 pb-10 grid gap-6"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {editions.length === 0 ? (
          <p className="text-blue-300 col-span-full text-center py-16">
            No hay competencias disponibles por el momento.
          </p>
        ) : (
          editions.map((edition) => (
            <Link
              key={edition.id}
              href={edition.status !== 'draft' ? `/resultados?edition=${edition.id}` : '#'}
              className="block"
            >
              <div className="bg-white text-gray-800 rounded-2xl overflow-hidden shadow-2xl transition-transform duration-300 hover:-translate-y-2 cursor-pointer">
                {/* Cover image */}
                <div className="w-full h-44 bg-gray-200 overflow-hidden">
                  {edition.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={edition.image_url}
                      alt={edition.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-100 to-blue-200">
                      <span className="text-5xl">🏆</span>
                    </div>
                  )}
                </div>

                {/* Card body */}
                <div className="p-5">
                  <p className="text-lg font-bold mb-2 leading-tight">{edition.name}</p>
                  <p className="text-sm text-gray-500 mb-3">{cardDateLabel(edition)}</p>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold text-white ${STATUS_CLASS[edition.status]}`}>
                    {STATUS_LABEL[edition.status]}
                  </span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Footer */}
      <footer className="text-center py-5 text-sm text-blue-300 opacity-80 border-t border-white/10">
        <p>Sistema de gestión de torneos deportivos</p>
        <p className="mt-3">
          <Link href="/auth/login" className="text-blue-400 hover:text-white transition text-xs">
            Acceso staff →
          </Link>
        </p>
      </footer>

    </main>
  )
}
