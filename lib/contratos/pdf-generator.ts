import jsPDF from 'jspdf'

interface PDFGeneratorOptions {
  title: string
  body: string
  agencyName?: string
  agencyMatricula?: string
  signatures?: {
    rol: string
    nombre: string
    dni: string
    imagenBase64: string | null
  }[]
  fecha?: string
}

/**
 * Generates a professional legal PDF for Argentine real estate contracts.
 * Uses jsPDF with custom text layout for reliable server-compatible generation.
 */
export function generateContratoPDF(options: PDFGeneratorOptions): jsPDF {
  const {
    title,
    body,
    agencyName = 'PRISMA System',
    agencyMatricula,
    signatures = [],
    fecha = new Date().toLocaleDateString('es-AR'),
  } = options

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginLeft = 25
  const marginRight = 25
  const marginTop = 30
  const marginBottom = 35
  const contentWidth = pageWidth - marginLeft - marginRight
  let currentY = marginTop

  // Track page count for footer
  let pageCount = 1

  function addHeader() {
    // Agency name
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(agencyName, marginLeft, 15)
    
    if (agencyMatricula) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text(`Mat. ${agencyMatricula}`, marginLeft, 20)
    }

    // Decorative line
    doc.setDrawColor(184, 115, 51) // Copper #b87333
    doc.setLineWidth(0.5)
    doc.line(marginLeft, 23, pageWidth - marginRight, 23)
  }

  function addFooter() {
    const footerY = pageHeight - 15
    doc.setDrawColor(184, 115, 51)
    doc.setLineWidth(0.3)
    doc.line(marginLeft, footerY - 5, pageWidth - marginRight, footerY - 5)

    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)
    doc.text(`Documento generado por PRISMA System · ${fecha}`, marginLeft, footerY)
    doc.text(`Página ${pageCount}`, pageWidth - marginRight, footerY, { align: 'right' })
    doc.setTextColor(0, 0, 0)
  }

  function checkPageBreak(neededHeight: number) {
    if (currentY + neededHeight > pageHeight - marginBottom) {
      addFooter()
      doc.addPage()
      pageCount++
      currentY = marginTop
      addHeader()
    }
  }

  // ---- First page header ----
  addHeader()
  currentY = marginTop + 5

  // ---- Title ----
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  const titleLines = doc.splitTextToSize(title.toUpperCase(), contentWidth)
  checkPageBreak(titleLines.length * 7 + 10)
  doc.text(titleLines, pageWidth / 2, currentY, { align: 'center' })
  currentY += titleLines.length * 7 + 8

  // Decorative line under title
  doc.setDrawColor(184, 115, 51)
  doc.setLineWidth(0.3)
  doc.line(marginLeft + 30, currentY - 4, pageWidth - marginRight - 30, currentY - 4)
  currentY += 4

  // ---- Body ----
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const lineHeight = 5

  // Split body into paragraphs
  const paragraphs = body.split('\n')

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === '') {
      currentY += lineHeight
      checkPageBreak(lineHeight)
      continue
    }

    // Check if it's a clause header (starts with CLÁUSULA, ARTÍCULO, etc.)
    const isHeader = /^(CLÁUSULA|ARTÍCULO|PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|SÉPTIMA|OCTAVA|NOVENA|DÉCIMA|TÍTULO)/i.test(paragraph.trim())

    if (isHeader) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      currentY += 3
    } else {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
    }

    const lines = doc.splitTextToSize(paragraph.trim(), contentWidth)
    
    for (const line of lines) {
      checkPageBreak(lineHeight)
      doc.text(line, marginLeft, currentY)
      currentY += lineHeight
    }

    if (isHeader) {
      currentY += 2
    }
  }

  // ---- Signatures ----
  if (signatures.length > 0) {
    currentY += 15
    checkPageBreak(60)

    doc.setDrawColor(184, 115, 51)
    doc.setLineWidth(0.3)
    doc.line(marginLeft, currentY - 5, pageWidth - marginRight, currentY - 5)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('FIRMAS', pageWidth / 2, currentY, { align: 'center' })
    currentY += 10

    const sigWidth = contentWidth / Math.min(signatures.length, 3)

    for (let i = 0; i < signatures.length; i++) {
      const sig = signatures[i]
      const col = i % 3
      const xPos = marginLeft + col * sigWidth + sigWidth / 2

      if (col === 0 && i > 0) {
        currentY += 50
        checkPageBreak(50)
      }

      // Signature image
      if (sig.imagenBase64) {
        try {
          const imgData = sig.imagenBase64.startsWith('data:')
            ? sig.imagenBase64
            : `data:image/png;base64,${sig.imagenBase64}`
          doc.addImage(imgData, 'PNG', xPos - 25, currentY, 50, 25)
        } catch {
          // If image fails, draw placeholder line
          doc.line(xPos - 25, currentY + 25, xPos + 25, currentY + 25)
        }
      } else {
        doc.line(xPos - 25, currentY + 25, xPos + 25, currentY + 25)
      }

      // Name and DNI below signature
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(sig.nombre, xPos, currentY + 32, { align: 'center' })
      doc.text(`DNI: ${sig.dni}`, xPos, currentY + 37, { align: 'center' })

      // Role label
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text(sig.rol.toUpperCase(), xPos, currentY + 42, { align: 'center' })
    }
  }

  // ---- Final footer ----
  addFooter()

  return doc
}

/**
 * Generates a filename for the contract PDF.
 */
export function generatePDFFilename(
  tipo: string,
  apellido: string,
  fecha?: Date
): string {
  const d = fecha || new Date()
  const dateStr = d.toISOString().split('T')[0]
  const apellidoClean = apellido
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñ]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return `contrato_${tipo}_${apellidoClean}_${dateStr}.pdf`
}
