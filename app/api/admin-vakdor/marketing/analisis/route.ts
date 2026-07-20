import { NextResponse } from "next/server"

export async function POST() {
  return NextResponse.json(
    { error: "El análisis de IA se genera de manera automatizada únicamente por el cron matutino de las 07:00 AM." },
    { status: 403 }
  )
}
