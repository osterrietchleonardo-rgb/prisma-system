import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from "@google/generative-ai"
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role to bypass RLS
const geminiApiKey = process.env.GEMINI_API_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)
const genAI = new GoogleGenerativeAI(geminiApiKey)

async function generateEmbedding(text: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiApiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text: text.substring(0, 10000) }] },
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: 768
    })
  });
  if (!response.ok) throw new Error(`Embedding failed: ${response.status}`);
  const data = await response.json();
  return data.embedding.values;
}

async function main() {
  console.log("Fetching properties...")
  const { data: properties, error } = await supabase
    .from('properties')
    .select('id, title, description, property_type, address, city')
    .is('embedding', null)

  if (error) {
    console.error("Error fetching properties:", error)
    return
  }

  console.log(`Found ${properties?.length} properties to process.`)

  for (const prop of properties || []) {
    try {
      const textToEmbed = `${prop.title} ${prop.property_type} ${prop.address} ${prop.city} ${prop.description || ""}`;
      console.log(`Generating embedding for: ${prop.title}...`)
      const embedding = await generateEmbedding(textToEmbed)
      
      const { error: updateError } = await supabase
        .from('properties')
        .update({ embedding })
        .eq('id', prop.id)

      if (updateError) console.error(`Error updating property ${prop.id}:`, updateError)
      else console.log(`Updated ${prop.id}`)
    } catch (e) {
      console.error(`Failed to process ${prop.id}:`, e)
    }
  }

  console.log("Done!")
}

main()
