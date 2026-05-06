import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import type { Database, EditionStatus } from '@/types/database'
import DisciplinesTab from '@/components/admin/DisciplinesTab'
import TeamsTab from '@/components/admin/TeamsTab'
import GroupsTab from '@/components/admin/GroupsTab'
import PhasesTab from '@/components/admin/PhasesTab'
import ScheduleTab from '@/components/admin/ScheduleTab'
import BracketTab from '@/components/admin/BracketTab'

type Edition = Database['public']['Tables']['editions']['Row']

function statusBadge(status: EditionStatus) {
  if (status === 'draft') return <Badge variant="secondary">Borrador</Badge>
  if (status === 'active') return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Activo</Badge>
  return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Finalizado</Badge>
}

export default async function EditionDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const supabase = await createClient()

  const { data } = await supabase.from('editions').select('*').eq('id', id).single()
  const edition = data as Edition | null
  if (!edition) redirect(`/t/${slug}/admin`)

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href={`/t/${slug}/admin`} className="text-sm text-gray-500 hover:text-gray-700">
          ← Volver al panel
        </Link>
      </div>

      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold">{edition.name}</h1>
          {statusBadge(edition.status)}
        </div>
        <Link
          href={`/t/${slug}/admin/editions/${id}/edit`}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition"
        >
          Editar edición
        </Link>
      </div>

      <Tabs defaultValue="disciplines">
        <TabsList className="mb-6">
          <TabsTrigger value="disciplines">Disciplinas</TabsTrigger>
          <TabsTrigger value="teams">Equipos</TabsTrigger>
          <TabsTrigger value="groups">Grupos</TabsTrigger>
          <TabsTrigger value="phases">Fases</TabsTrigger>
          <TabsTrigger value="schedule">Calendario</TabsTrigger>
          <TabsTrigger value="bracket">Bracket</TabsTrigger>
        </TabsList>
        <TabsContent value="disciplines"><DisciplinesTab editionId={id} /></TabsContent>
        <TabsContent value="teams"><TeamsTab editionId={id} /></TabsContent>
        <TabsContent value="groups"><GroupsTab editionId={id} /></TabsContent>
        <TabsContent value="phases"><PhasesTab editionId={id} /></TabsContent>
        <TabsContent value="schedule"><ScheduleTab editionId={id} startDate={edition.start_date} endDate={edition.end_date} /></TabsContent>
        <TabsContent value="bracket"><BracketTab editionId={id} /></TabsContent>
      </Tabs>
    </div>
  )
}
