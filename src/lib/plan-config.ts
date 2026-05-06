export const PLAN_CONFIG = {
  free: {
    name: 'Gratuito',
    members: 2,
    price_bob: 0,
    price_usdt: 0,
    features: ['2 usuarios', '1 edición activa', 'Funciones básicas'],
  },
  basic: {
    name: 'Básico',
    members: 10,
    price_bob: 120,
    price_usdt: 17,
    features: ['10 usuarios', 'Ediciones ilimitadas', 'Sorteo de grupos', 'Soporte por email'],
  },
  pro: {
    name: 'Pro',
    members: Infinity,
    price_bob: 280,
    price_usdt: 40,
    features: ['Usuarios ilimitados', 'Todo lo de Básico', 'Soporte prioritario', 'Nuevas funciones primero'],
  },
} as const

export type PlanKey = keyof typeof PLAN_CONFIG

export const PLAN_FEATURES: Record<string, string[]> = {
  free:  ['2 usuarios', '1 edición activa', 'Funciones básicas'],
  basic: ['10 usuarios', 'Ediciones ilimitadas', 'Sorteo de grupos', 'Soporte por email'],
  pro:   ['Usuarios ilimitados', 'Todo lo de Básico', 'Soporte prioritario', 'Nuevas funciones primero'],
}

export const MEMBER_LIMITS: Record<string, number> = {
  free: 2,
  basic: 10,
  pro: Infinity,
}
