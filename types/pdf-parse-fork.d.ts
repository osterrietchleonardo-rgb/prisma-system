declare module "pdf-parse-fork" {
  interface PDFData {
    text: string
    numpages: number
    numrender: number
    info: any
    metadata: any
    version: string
  }
  function pdfParse(
    data: Buffer | Uint8Array | ArrayBuffer,
    options?: Record<string, unknown>
  ): Promise<PDFData>
  export default pdfParse
}
