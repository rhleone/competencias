// Re-exports the resultados page within the tenant route context.
// The original page component reads edition data; here we re-use it
// and inject the tenant slug via TenantProvider (already set by parent layout).
export { default } from '@/app/(public)/resultados/page'
