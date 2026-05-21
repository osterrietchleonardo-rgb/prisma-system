'use server'

import { createClient } from '@/lib/supabase/server'

// Generador de prefijo para evitar colisiones en Meta (Business Account único)
function generateAgencyPrefix(agency_id: string): string {
  // Tomamos los primeros 6 caracteres limpiando guiones
  return `ag${agency_id.replace(/-/g, '').substring(0, 6)}`
}

export async function injectCoreTemplates(agency_id: string, business_id: string, token: string): Promise<void> {
  const supabase = createClient()
  const prefix = generateAgencyPrefix(agency_id)

  const coreTemplates = [
    // 1. Seguimiento Inactividad F1 (24h)
    {
      template_name: `${prefix}_seg_f1_seguimiento`,
      category: 'MARKETING',
      language: 'es_AR',
      body: "Hola {{1}}, vimos que quedó pendiente tu consulta sobre la propiedad. {{2}}",
      body_examples: ["Juan", "¿Pudiste hablar con tu pareja sobre el depto de Villa Crespo? Si querés retomamos desde ahí."],
      buttons: []
    },
    // 2. Seguimiento Inactividad F2 (Día 3)
    {
      template_name: `${prefix}_seg_f2_valor`,
      category: 'MARKETING',
      language: 'es_AR',
      body: "Hola {{1}}, hay novedades relacionadas con lo que estabas buscando. {{2}}",
      body_examples: ["Juan", "Bajó el precio del depto de Villa Crespo que viste, quedó en 172k. Sé que tu techo era 180k, ¿lo coordinamos?"],
      buttons: []
    },
    // 3. Seguimiento Breakup F3 (Día 7)
    {
      template_name: `${prefix}_seg_f3_breakup`,
      category: 'MARKETING',
      language: 'es_AR',
      body: "Hola {{1}}. Como no tuvimos más novedades tuyas, vamos a pausar los recordatorios por ahora. De todas formas, quedamos a total disposición si en el futuro necesitas retomar la búsqueda. ¡Que tengas un excelente día!",
      body_examples: ["Juan"],
      buttons: [] // Sin botones, es cierre.
    },
    // 4. Recordatorio de Visita (24h)
    {
      template_name: `${prefix}_visita_recordatorio_24h`,
      category: 'UTILITY',
      language: 'es_AR',
      body: "Hola {{1}}, te recordamos que mañana a las {{2}} hs tenemos agendada una visita en la propiedad ubicada en {{3}}. Por favor confirmá tu asistencia.",
      body_examples: ["Juan", "15:00", "Av. Libertador 1234"],
      buttons: [
        { type: "QUICK_REPLY", text: "Confirmar visita" },
        { type: "QUICK_REPLY", text: "Necesito reprogramar" }
      ]
    },
    // 5. Recordatorio de Visita (3h)
    {
      template_name: `${prefix}_visita_recordatorio_3h`,
      category: 'UTILITY',
      language: 'es_AR',
      body: "Hola {{1}}, aún no confirmaste la visita de hoy a las {{2}} hs en {{3}}. Por favor, avisanos si vas a poder asistir para coordinar con el asesor.",
      body_examples: ["Juan", "15:00", "Av. Libertador 1234"],
      buttons: [
        { type: "QUICK_REPLY", text: "Sí, asisto" },
        { type: "QUICK_REPLY", text: "No podré ir" }
      ]
    },
    // 6. Recordatorio de Visita (1h Ultimátum)
    {
      template_name: `${prefix}_visita_recordatorio_1h`,
      category: 'UTILITY',
      language: 'es_AR',
      body: "Hola {{1}}, último aviso. La visita es hoy a las {{2}} hs. Si no tenemos tu confirmación el asesor no se presentará en el lugar.",
      body_examples: ["Juan", "15:00"],
      buttons: [
        { type: "QUICK_REPLY", text: "Estoy yendo!" },
        { type: "QUICK_REPLY", text: "Cancelar" }
      ]
    },
    // 7. Post Visita No-Show
    {
      template_name: `${prefix}_visita_post_noshow`,
      category: 'MARKETING',
      language: 'es_AR',
      body: "Hola {{1}}. El asesor nos indica que no pudiste asistir a la visita pactada. Entendemos que surgen imprevistos. ¿Te gustaría que la reprogramemos para otro día?",
      body_examples: ["Juan"],
      buttons: [
        { type: "QUICK_REPLY", text: "Reprogramar" },
        { type: "QUICK_REPLY", text: "No por ahora" }
      ]
    },
    // 8. Reactivación a Demanda (Snoozed)
    {
      template_name: `${prefix}_reactivacion_snoozed`,
      category: 'MARKETING',
      language: 'es_AR',
      body: "Hola {{1}}. Ha pasado un tiempo desde tu última consulta y queríamos contarte que {{2}}. Si te interesa volver a ver oportunidades, estamos a disposición.",
      body_examples: ["Juan", "hay nuevas propiedades con baja de precio que podrían interesarte"],
      buttons: [
        { type: "QUICK_REPLY", text: "Me interesa verlas" }
      ]
    }
  ]

  for (const tpl of coreTemplates) {
    const components: Record<string, unknown>[] = []
    
    // Body Component
    components.push({
      type: 'BODY',
      text: tpl.body,
      example: { body_text: [tpl.body_examples] } // Meta requiere array of arrays para los ejemplos del body
    })

    // Buttons Component
    if (tpl.buttons && tpl.buttons.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: tpl.buttons
      })
    }

    try {
      const res = await fetch(`https://graph.facebook.com/v19.0/${business_id}/message_templates`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: tpl.template_name,
          category: tpl.category,
          language: tpl.language,
          components,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        console.error(`Error inyectando template ${tpl.template_name}:`, result.error?.message)
        continue // Seguimos con el resto aunque uno falle
      }

      // Guardar en base local en estado PENDING
      await supabase.from('wa_templates').insert({
        agency_id,
        template_name: tpl.template_name,
        category: tpl.category,
        language: tpl.language,
        components,
        status: 'PENDING',
        meta_template_id: result.id,
      })

    } catch (err) {
      console.error(`Excepción inyectando template ${tpl.template_name}:`, err)
    }
  }
}
