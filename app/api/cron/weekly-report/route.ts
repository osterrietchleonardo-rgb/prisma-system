import { NextResponse } from "next/server"
import { assertCron } from "@/lib/admin-vakdor/cron-auth"
import { renderReport } from "@/lib/reports/weekly/email"
import { buildReport } from "@/lib/reports/weekly/report"
import { fetchAgencias, fetchResendEmails } from "@/lib/reports/weekly/sources"
import { previousWeek } from "@/lib/reports/weekly/window"

export const dynamic = "force-dynamic"
export const maxDuration = 60

interface Resultado {
  agencia: string
  enviado: boolean
  motivo?: string
}

export async function GET(req: Request) {
  const denied = assertCron(req)
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const dry = searchParams.get("dry") === "1"
  const soloAgencia = searchParams.get("agency")

  const w = previousWeek()
  let agencias = await fetchAgencias()
  if (soloAgencia) agencias = agencias.filter((a) => a.id === soloAgencia)

  // Resend es una sola cuenta para todas: se lee una vez y se reparte por destinatario.
  const emails = await fetchResendEmails(w)

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM ?? "PRISMA <no-reply@vakbot.vakdor.com>"
  const resultados: Resultado[] = []
  const previews: { agencia: string; subject: string; html: string }[] = []

  for (const agencia of agencias) {
    try {
      const informe = await buildReport(agencia, w, emails)
      const { subject, html } = renderReport(informe)

      if (dry) {
        previews.push({ agencia: agencia.name, subject, html })
        resultados.push({ agencia: agencia.name, enviado: false, motivo: "dry run" })
        continue
      }
      if (!agencia.ownerEmail) {
        resultados.push({ agencia: agencia.name, enviado: false, motivo: "la inmobiliaria no tiene director fundador con email" })
        continue
      }
      if (!apiKey) {
        resultados.push({ agencia: agencia.name, enviado: false, motivo: "falta RESEND_API_KEY" })
        continue
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [agencia.ownerEmail], subject, html }),
      })
      resultados.push(
        res.ok
          ? { agencia: agencia.name, enviado: true }
          : { agencia: agencia.name, enviado: false, motivo: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` },
      )
    } catch (e) {
      // Una inmobiliaria rota no puede impedir que las demás reciban el suyo.
      resultados.push({ agencia: agencia.name, enviado: false, motivo: String(e).slice(0, 300) })
    }
  }

  // En dry run se devuelve el HTML de la primera para poder mirarlo en el navegador.
  if (dry && previews.length === 1) {
    return new NextResponse(previews[0].html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  }

  const alguno = resultados.some((r) => r.enviado)
  return NextResponse.json(
    { ok: dry || alguno, semana: w.label, resendOk: emails !== null, resultados, previews: dry ? previews : undefined },
    { status: dry || alguno || !resultados.length ? 200 : 500 },
  )
}
