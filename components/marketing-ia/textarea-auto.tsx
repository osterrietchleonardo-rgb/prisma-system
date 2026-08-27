"use client"

import { useEffect, useRef } from "react"
import { Textarea } from "@/components/ui/textarea"

/**
 * Textarea que crece con lo que tiene adentro.
 *
 * Los de alto fijo se veían bien en escritorio y en el celular dejaban el texto por una ranura:
 * una oferta generada necesita ~718 px de alto y la caja daba 168, así que el asesor tenía que
 * scrollear dentro del recuadro para leer su propio texto. Medido en iPhone 13.
 */
export function TextareaAuto({
  value,
  className,
  minAlto = 110,
  ...props
}: React.ComponentProps<typeof Textarea> & { minAlto?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Se baja a 0 primero: si no, el scrollHeight nunca puede achicarse al borrar texto.
    el.style.height = "0px"
    el.style.height = `${Math.max(el.scrollHeight, minAlto)}px`
  }, [value, minAlto])

  return (
    <Textarea
      ref={ref}
      value={value}
      // overflow-hidden porque el alto ya acompaña al contenido: la barra interna sobra.
      className={`resize-none overflow-hidden ${className ?? ""}`}
      style={{ minHeight: minAlto }}
      {...props}
    />
  )
}
