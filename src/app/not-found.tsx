import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex flex-col items-center justify-center text-white p-8">
      <p className="text-8xl font-black mb-4 opacity-30">404</p>
      <h1 className="text-2xl font-bold mb-2">Página no encontrada</h1>
      <p className="text-blue-200 mb-8 text-center">
        La página que buscás no existe o fue movida.
      </p>
      <Link
        href="/"
        className="bg-white text-blue-900 px-6 py-3 rounded-lg font-semibold hover:bg-blue-50 transition"
      >
        Volver al inicio
      </Link>
    </main>
  )
}
