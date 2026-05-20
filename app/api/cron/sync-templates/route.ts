import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // Verificar autorización (Vercel Cron)
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

  for (const instance of instances) {
    try {
      // 2. Traer plantillas directamente desde Meta Graph API
      const res = await fetch(`https://graph.facebook.com/v19.0/${instance.business_id}/message_templates?fields=name,status,components,rejected_reason,id`, {
        headers: {
          'Authorization': `Bearer ${instance.token}`
        }
      })
      
      if (!res.ok) continue
      
      const result = await res.json()
      const templates = result.data || []
      
      if (templates.length === 0) continue

      // 3. Upsert a la base de datos local
      const upsertData = templates.map((t: any) => ({
        agency_id: instance.agency_id,
        template_name: t.name,
        status: t.status,
        components: t.components,
        rejection_reason: t.rejected_reason || null,
        meta_template_id: t.id,
      }))
      
      await supabase
        .from('wa_templates')
        .upsert(upsertData, { onConflict: 'meta_template_id' })

      // 4. Verificar si ya se aprobaron todas las de esta agencia
      // Extraemos solo las plantillas guardadas localmente para esta agencia
      const { data: localTemplates } = await supabase
        .from('wa_templates')
        .select('status')
        .eq('agency_id', instance.agency_id)

      if (localTemplates && localTemplates.length > 0) {
        // Se asume que si tiene plantillas y TODAS dicen APPROVED, ya podemos activarlo.
        const allApproved = localTemplates.every(t => t.status === 'APPROVED')
        
        if (allApproved) {
          await supabase
            .from('whatsapp_instances')
            .update({ 
              templates_status: 'approved', 
              flows_active: true 
            })
            .eq('id', instance.id)
            
          console.log(`Instancia ${instance.id} activada exitosamente (flows_active = true)`)
        }
      }

    } catch (e) {
      console.error(`Error procesando instancia ${instance.id}:`, e)
    }
  }

  return NextResponse.json({ success: true })
}
