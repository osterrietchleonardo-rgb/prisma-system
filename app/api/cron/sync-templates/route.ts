import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Los 8 sufijos de plantillas que Prisma inyecta automáticamente
const CORE_TEMPLATE_SUFFIXES = [
  'seg_f1_seguimiento',
  'seg_f2_valor',
  'seg_f3_breakup',
  'visita_recordatorio_24h',
  'visita_recordatorio_3h',
  'visita_recordatorio_1h',
  'visita_post_noshow',
  'reactivacion_snoozed',
]

function getAgencyPrefix(agency_id: string): string {
  return `ag${agency_id.replace(/-/g, '').substring(0, 6)}`
}

export async function GET(req: Request) {
  // Verificar autorización (Vercel Cron o llamada manual con secret)
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Obtener todas las instancias que están "pending"
  const { data: instances, error } = await supabase
    .from('whatsapp_instances')
    .select('id, agency_id, token, business_id')
    .eq('templates_status', 'pending')

  if (error || !instances || instances.length === 0) {
    return NextResponse.json({ success: true, message: 'No hay instancias pendientes.' })
  }

  const results: Record<string, string> = {}

  for (const instance of instances) {
    try {
      const prefix = getAgencyPrefix(instance.agency_id)

      // Los 8 nombres exactos que debería tener esta agencia en Meta
      const expectedNames = CORE_TEMPLATE_SUFFIXES.map(s => `${prefix}_${s}`)

      // 2. Traer plantillas desde Meta Graph API
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${instance.business_id}/message_templates?fields=name,status,rejected_reason,id&limit=100`,
        { headers: { 'Authorization': `Bearer ${instance.token}` } }
      )

      if (!res.ok) {
        results[instance.id] = 'meta_api_error'
        continue
      }

      const result = await res.json()
      const allMetaTemplates: Array<{ name: string; status: string; rejected_reason?: string; id: string }> = result.data || []

      // 3. Filtrar SOLO nuestras 8 plantillas por nombre exacto
      const ourTemplates = allMetaTemplates.filter(t => expectedNames.includes(t.name))

      if (ourTemplates.length === 0) {
        results[instance.id] = 'templates_not_found_in_meta'
        continue
      }

      // 4. Upsert solo nuestras plantillas a la base local
      const upsertData = ourTemplates.map(t => ({
        agency_id: instance.agency_id,
        template_name: t.name,
        status: t.status,
        rejection_reason: t.rejected_reason || null,
        meta_template_id: t.id,
      }))

      await supabase
        .from('wa_templates')
        .upsert(upsertData, { onConflict: 'meta_template_id' })

      // 5. Verificar: ¿están las 8 exactas aprobadas en Meta? (sin depender de la BD local)
      const approvedNames = ourTemplates
        .filter(t => t.status === 'APPROVED')
        .map(t => t.name)

      const allCoreApproved = expectedNames.every(name => approvedNames.includes(name))

      if (allCoreApproved) {
        await supabase
          .from('whatsapp_instances')
          .update({
            templates_status: 'approved',
            flows_active: true
          })
          .eq('id', instance.id)

        results[instance.id] = 'activated'
        console.log(`[CronSync] Instancia ${instance.id} (prefijo: ${prefix}) → flows_active = true ✓`)
      } else {
        // Log para saber exactamente cuáles faltan
        const pendingNames = expectedNames.filter(name => !approvedNames.includes(name))
        results[instance.id] = `pending: ${pendingNames.join(', ')}`
        console.log(`[CronSync] Instancia ${instance.id} — esperando aprobación de: ${pendingNames.join(', ')}`)
      }

    } catch (e) {
      console.error(`[CronSync] Error procesando instancia ${instance.id}:`, e)
      results[instance.id] = 'exception'
    }
  }

  return NextResponse.json({ success: true, results })
}
