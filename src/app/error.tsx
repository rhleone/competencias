'use client'

import { useEffect } from 'react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex flex-col items-center justify-center text-white p-8">
      <p className="text-6xl mb-4 opacity-40">⚠</p>
      <h1 className="text-2xl font-bold mb-2">Algo salió mal</h1>
      <p className="text-blue-200 mb-8 text-center max-w-sm">
        Ocurrió un error inesperado. Podés intentar recargar la página.
      </p>
      <div className="flex gap-4">
        <button
          onClick={reset}
          className="bg-white text-blue-900 px-6 py-3 rounded-lg font-semibold hover:bg-blue-50 transition"
        >
          Reintentar
        </button>
        <a href="/" className="border border-white text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/10 transition">
          Volver al inicio
        </a>
      </div>
    </main>
  )
}
