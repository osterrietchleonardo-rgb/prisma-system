"use server"

import { createClient } from "@/lib/supabase/server"

export async function globalSearch(query: string) {
  if (!query || query.length < 2) return []

  const supabase = await createClient()
  
  // Search in properties
  const { data: properties } = await supabase
    .from('properties')
    .select('id, title, address, property_type')
    .or(`title.ilike.%${query}%,address.ilike.%${query}%`)
    .limit(5)

  // Search in leads
  const { data: leads } = await supabase
    .from('leads')
    .select('id, full_name, email')
    .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
    .limit(5)

  const results = [
    ...(properties || []).map(p => ({
      id: p.id,
      title: p.title || p.address,
      type: 'propiedad',
      link: `/director/propiedades/${p.id}`,
      subtitle: p.property_type
    })),
    ...(leads || []).map(l => ({
      id: l.id,
      title: l.full_name,
      type: 'lead',
      link: `/director/leads/${l.id}`,
      subtitle: l.email
    }))
  ]

  return results
}
