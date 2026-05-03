"use client"

import { Button } from "@/components/ui/button"
import { Download, Loader2 } from "lucide-react"
import { useState } from "react"
import html2canvas from "html2canvas"
import jsPDF from "jspdf"

interface DashboardHeaderActionsProps {
  data: any
}

export function DashboardHeaderActions({ data }: DashboardHeaderActionsProps) {
  const [isExporting, setIsExporting] = useState(false)

  const handleExportPDF = async () => {
    const element = document.getElementById("dashboard-content")
    if (!element) return

    try {
      setIsExporting(true)

      // Hide elements that shouldn't be in the PDF (like buttons and filters)
      const actions = element.querySelector(".flex.items-center.gap-4.ml-auto") as HTMLElement
      const exportBtn = element.querySelector("button.flex.border-accent") as HTMLElement
      
      if (exportBtn) exportBtn.style.display = "none"

      const canvas = await html2canvas(element, {
        scale: 2, // Higher resolution
        useCORS: true,
        backgroundColor: "#030712", // Match your dark theme background
        logging: false,
        onclone: (clonedDoc) => {
          // You can modify the cloned document here if needed
          const clonedElement = clonedDoc.getElementById("dashboard-content")
          if (clonedElement) {
             // Ensure it has a solid background for the capture
             clonedElement.style.background = "#030712"
          }
        }
      })

      if (exportBtn) exportBtn.style.display = "flex"

      const imgData = canvas.toDataURL("image/png")
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [canvas.width, canvas.height]
      })

      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height)
      pdf.save(`prisma_dashboard_${new Date().toISOString().split('T')[0]}.pdf`)

    } catch (error) {
      console.error("Export failed:", error)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button 
        variant="outline" 
        size="sm" 
        onClick={handleExportPDF}
        disabled={isExporting}
        className="flex border-accent/20 bg-accent/5 transition-all hover:bg-accent/10"
      >
        {isExporting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Download className="mr-2 h-4 w-4" />
        )}
        {isExporting ? "Generando..." : "Exportar PDF"}
      </Button>
    </div>
  )
}
