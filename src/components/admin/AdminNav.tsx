'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/admin', label: 'Panel', exact: true },
  { href: '/resultados', label: 'Ver resultados ↗', exact: false, external: true },
]

export default function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="flex-1 p-4 space-y-1">
      {navItems.map(({ href, label, exact, external }) => {
        const isActive = exact ? pathname === href : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            target={external ? '_blank' : undefined}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition ${
              isActive && !external
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
