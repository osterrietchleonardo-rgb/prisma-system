import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    APP_URL: !!process.env.APP_URL,
    EVOLUTION_API_URL: !!process.env.EVOLUTION_API_URL,
    N8N_WEBHOOK_URL: !!process.env.N8N_WEBHOOK_URL,
    SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: !!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    OLD_APP_URL: !!process.env.NEXT_PUBLIC_APP_URL,
    OLD_EVOLUTION_URL: !!process.env.NEXT_PUBLIC_EVOLUTION_API_URL,
    NODE_ENV: process.env.NODE_ENV,
  })
}
