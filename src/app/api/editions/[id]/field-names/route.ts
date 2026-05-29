import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data, error } = await db
      .from('field_names')
      .select('id, discipline_id, field_number, name')
      .eq('edition_id', id)
      .order('discipline_id')
      .order('field_number')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ fieldNames: data ?? [] })
  } catch (err) {
    console.error('GET /field-names error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

interface FieldNameItem {
  disciplineId: string
  fieldNumber: number
  name: string
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { items, tenantId } = body as { items: FieldNameItem[]; tenantId: string }

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Delete all existing field names for this edition and re-insert
    const { error: deleteError } = await db
      .from('field_names')
      .delete()
      .eq('edition_id', id)

    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

    if (items.length === 0) {
      return NextResponse.json({ success: true, saved: 0 })
    }

    const rows = items
      .filter((item) => item.name?.trim().length > 0)
      .map((item) => ({
        edition_id: id,
        discipline_id: item.disciplineId,
        tenant_id: tenantId ?? null,
        field_number: item.fieldNumber,
        name: item.name.trim(),
      }))

    if (rows.length > 0) {
      const { error: insertError } = await db.from('field_names').insert(rows)
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, saved: rows.length })
  } catch (err) {
    console.error('PUT /field-names error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
