/**
 * Crea un usuario superadmin en Supabase.
 * Uso:
 *   node --env-file=.env.local scripts/create-superadmin.mjs <email> <password>
 *
 * Requiere: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('❌  Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY')
  console.error('   Ejecutá: node --env-file=.env.local scripts/create-superadmin.mjs <email> <password>')
  process.exit(1)
}

const [, , email, password] = process.argv

if (!email || !password) {
  console.error('❌  Uso: node --env-file=.env.local scripts/create-superadmin.mjs <email> <password>')
  process.exit(1)
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

console.log(`Creando superadmin: ${email}...`)

// 1. Intentar crear el usuario en auth.users
const { data: createData, error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
})

let userId

if (createError) {
  if (createError.message.includes('already been registered') || createError.message.includes('already exists')) {
    // El usuario ya existe — obtener su ID
    const { data: listData, error: listError } = await admin.auth.admin.listUsers()
    if (listError) { console.error('❌  Error al listar usuarios:', listError.message); process.exit(1) }
    const existing = listData.users.find((u) => u.email === email)
    if (!existing) { console.error('❌  No se pudo encontrar el usuario existente'); process.exit(1) }
    userId = existing.id
    console.log(`   Usuario ya existía (${userId}), actualizando perfil...`)
  } else {
    console.error('❌  Error al crear usuario:', createError.message)
    process.exit(1)
  }
} else {
  userId = createData.user.id
  console.log(`   Usuario creado: ${userId}`)
}

// 2. Upsert profile con is_superadmin = true
const { error: profileError } = await admin.from('profiles').upsert({
  id: userId,
  email,
  full_name: 'Superadmin',
  role: 'operator',
  is_superadmin: true,
}, { onConflict: 'id' })

if (profileError) {
  console.error('❌  Error al actualizar perfil:', profileError.message)
  process.exit(1)
}

console.log(`✅  Superadmin listo: ${email}`)
console.log(`   Iniciá sesión en /auth/login y serás redirigido a /super`)
