'use client'

import { createContext, useContext } from 'react'

export type TenantInfo = {
  id: string
  slug: string
  name: string
  plan: string
  status: string
}

const TenantContext = createContext<TenantInfo | null>(null)

export function TenantProvider({
  tenant,
  children,
}: {
  tenant: TenantInfo
  children: React.ReactNode
}) {
  return <TenantContext.Provider value={tenant}>{children}</TenantContext.Provider>
}

export function useTenant(): TenantInfo {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant must be used within TenantProvider')
  return ctx
}
