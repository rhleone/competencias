import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { EditionStatus } from '@/types/database'
import { APP_NAME } from '@/lib/app-config'
import { CheckCircle2, Trophy, Users, Calendar, BarChart3, Zap, Shield } from 'lucide-react'

type EditionCard = {
  id: string
  name: string
  year: number
  status: EditionStatus
  start_date: string
  end_date: string
  image_url: string | null
  tenant: { name: string; slug: string } | null
}

const STATUS_LABEL: Record<EditionStatus, string> = {
  active: 'En Curso',
  finished: 'Finalizado',
  draft: 'Muy pronto',
}

const STATUS_CLASS: Record<EditionStatus, string> = {
  active: 'bg-blue-600',
  finished: 'bg-gray-500',
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

const features = [
  { icon: Trophy,    title: 'Gestión de ediciones',      desc: 'Creá y administrá múltiples ediciones del campeonato con facilidad.' },
  { icon: Users,     title: 'Equipos y disciplinas',     desc: 'Organizá equipos por disciplina, género y categoría en un solo lugar.' },
  { icon: Calendar,  title: 'Scheduling automático',     desc: 'El motor de programación asigna partidos respetando cupos y restricciones.' },
  { icon: BarChart3, title: 'Resultados en tiempo real', desc: 'Operadores cargan scores en vivo; el público ve las tablas actualizadas al instante.' },
  { icon: Zap,       title: 'Vista pública',             desc: 'Cada organización tiene su propia página de resultados para compartir.' },
  { icon: Shield,    title: 'Multi-organización',        desc: 'Cada institución gestiona sus datos de forma aislada y segura.' },
]

const plans = [
  { name: 'Gratuito', price: 'Gratis', users: '2 usuarios', highlight: false, badge: null },
  { name: 'Básico',   price: 'Bs 120/mes', users: '10 usuarios', highlight: true,  badge: 'Más popular' },
  { name: 'Pro',      price: 'Bs 280/mes', users: 'Sin límite',  highlight: false, badge: null },
]

export default async function HomePage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any

  let editions: EditionCard[] = []
  try {
    const { data } = await supabase
      .from('editions')
      .select('id, name, year, status, start_date, end_date, image_url, tenant:tenant_id(name, slug)')
      .in('status', ['active', 'finished'])
      .order('year', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(6)
    editions = (data as EditionCard[]) ?? []
  } catch { /* no editions available */ }

  return (
    <main className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #0f2a44, #1b4b7a)', color: 'white' }}>

      {/* Hero */}
      <header className="text-center px-5 pt-16 pb-10">
        <p className="text-blue-300 text-sm font-semibold uppercase tracking-widest mb-3">Plataforma deportiva</p>
        <h1 className="text-5xl font-black mb-4 leading-tight">{APP_NAME}</h1>
        <p className="text-blue-200 text-lg max-w-xl mx-auto mb-8">
          Gestioná torneos y competencias deportivas para colegios, clubes y ligas. Simple, rápido y sin papel.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/register"
            className="inline-block bg-white text-blue-900 font-bold px-8 py-3 rounded-xl hover:bg-blue-50 transition text-base shadow-lg"
          >
            Empezar gratis →
          </Link>
          <Link
            href="/auth/login"
            className="inline-block border border-white/30 text-white font-medium px-8 py-3 rounded-xl hover:bg-white/10 transition text-base"
          >
            Iniciar sesión
          </Link>
        </div>
        <p className="text-blue-300 text-xs mt-4">Sin tarjeta de crédito · Plan gratuito disponible</p>
      </header>

      {/* Features grid */}
      <section className="max-w-5xl w-full mx-auto px-5 py-12">
        <h2 className="text-center text-2xl font-bold mb-8">Todo lo que necesitás para organizar tu campeonato</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-white/10 backdrop-blur rounded-xl p-5 border border-white/10">
              <div className="w-9 h-9 bg-blue-500/30 rounded-lg flex items-center justify-center mb-3">
                <Icon className="w-5 h-5 text-blue-200" />
              </div>
              <p className="font-semibold text-sm mb-1">{title}</p>
              <p className="text-blue-200 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Plans */}
      <section className="max-w-3xl w-full mx-auto px-5 py-10">
        <h2 className="text-center text-2xl font-bold mb-2">Planes simples y transparentes</h2>
        <p className="text-center text-blue-300 text-sm mb-8">Comenzá gratis y escalá cuando lo necesites.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`rounded-xl p-5 border ${p.highlight ? 'bg-white text-gray-900 border-white shadow-xl scale-105' : 'bg-white/10 border-white/20 text-white'}`}
            >
              {p.badge && (
                <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-medium mb-2 inline-block">
                  {p.badge}
                </span>
              )}
              <p className="font-bold text-lg">{p.name}</p>
              <p className={`text-2xl font-black mt-1 mb-3 ${p.highlight ? 'text-blue-700' : 'text-white'}`}>{p.price}</p>
              <div className={`flex items-center gap-2 text-sm ${p.highlight ? 'text-gray-600' : 'text-blue-200'}`}>
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                {p.users}
              </div>
              <Link
                href="/register"
                className={`mt-4 block text-center text-sm font-semibold py-2 rounded-lg transition ${p.highlight ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-white/20 text-white hover:bg-white/30'}`}
              >
                Empezar
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA banner */}
      <section className="max-w-3xl w-full mx-auto px-5 py-6 mb-6">
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-8 text-center shadow-xl">
          <h2 className="text-2xl font-black mb-2">¿Tu organización no está registrada?</h2>
          <p className="text-blue-100 mb-6 text-sm max-w-md mx-auto">
            Registrá tu colegio, club o liga en minutos y empezá a gestionar tus campeonatos hoy mismo. Gratis.
          </p>
          <Link
            href="/register"
            className="inline-block bg-white text-blue-700 font-bold px-8 py-3 rounded-xl hover:bg-blue-50 transition shadow-md"
          >
            Registrá tu organización →
          </Link>
        </div>
      </section>

      {/* Active championships */}
      {editions.length > 0 && (
        <section className="max-w-6xl w-full mx-auto px-5 pb-10">
          <h2 className="text-xl font-bold mb-5 text-center">Campeonatos en curso</h2>
          <div
            className="grid gap-5"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
          >
            {editions.map((edition) => (
              <Link
                key={edition.id}
                href={edition.tenant?.slug ? `/t/${edition.tenant.slug}/resultados?edition=${edition.id}` : '#'}
                className="block"
              >
                <div className="bg-white text-gray-800 rounded-2xl overflow-hidden shadow-lg transition-transform duration-300 hover:-translate-y-1 cursor-pointer">
                  <div className="w-full h-36 bg-gray-200 overflow-hidden">
                    {edition.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={edition.image_url} alt={edition.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-100 to-blue-200">
                        <span className="text-4xl">🏆</span>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    {edition.tenant?.name && (
                      <p className="text-xs text-gray-400 mb-1">{edition.tenant.name}</p>
                    )}
                    <p className="font-bold text-sm mb-1 leading-tight">{edition.name}</p>
                    <p className="text-xs text-gray-500 mb-2">{cardDateLabel(edition)}</p>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold text-white ${STATUS_CLASS[edition.status]}`}>
                      {STATUS_LABEL[edition.status]}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="text-center py-6 text-sm text-blue-300 opacity-80 border-t border-white/10 mt-auto">
        <p>Sistema de gestión de torneos deportivos</p>
        <p className="mt-2">
          <Link href="/auth/login" className="text-blue-400 hover:text-white transition text-xs">
            Acceso staff →
          </Link>
        </p>
      </footer>

    </main>
  )
}
