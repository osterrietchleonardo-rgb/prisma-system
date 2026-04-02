"use client"

import { useRef, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Eraser, Check } from "lucide-react"

interface FirmaCanvasProps {
  onConfirm: (imageBase64: string) => void
  width?: number
  height?: number
}

export function FirmaCanvas({ onConfirm, width = 400, height = 150 }: FirmaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)

  const getPos = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    if ("touches" in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      }
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }, [])

  const startDraw = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!ctx) return
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    setIsDrawing(true)
    setHasDrawn(true)
  }, [getPos])

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (!isDrawing) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!ctx) return
    const pos = getPos(e)
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.strokeStyle = "#1a1a2e"
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }, [isDrawing, getPos])

  const endDraw = useCallback(() => {
    setIsDrawing(false)
  }, [])

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!ctx || !canvas) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
  }, [])

  const handleConfirm = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const base64 = canvas.toDataURL("image/png")
    onConfirm(base64)
  }, [onConfirm])

  return (
    <div className="space-y-3">
      <div className="border-2 border-dashed border-accent/30 rounded-xl overflow-hidden bg-white cursor-crosshair">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full touch-none"
          style={{ height: `${height}px` }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleClear}>
          <Eraser className="w-3 h-3 mr-1" /> Limpiar
        </Button>
        <Button
          size="sm"
          className="bg-accent hover:bg-accent/90 text-accent-foreground"
          onClick={handleConfirm}
          disabled={!hasDrawn}
        >
          <Check className="w-3 h-3 mr-1" /> Confirmar firma
        </Button>
      </div>
    </div>
  )
}
