export type TipoContrato =
  | 'locacion_habitacional'
  | 'locacion_comercial'
  | 'boleto_compraventa'
  | 'reserva_venta'

export type EstadoContrato = 'borrador' | 'pendiente_firma' | 'firmado' | 'anulado'

export type FirmanteRol = 'locador' | 'locatario' | 'garante' | 'vendedor' | 'comprador'

export interface CampoFormulario {
  id: string
  nombre: string
  label: string
  tipo: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'currency' | 'dni' | 'email' | 'phone'
  opciones?: string[]
  requerido: boolean
  grupo: string
  orden: number
  placeholder?: string
  validacion?: {
    min?: number
    max?: number
    pattern?: string
    mensaje_error?: string
  }
}

export interface ContractTemplate {
  id: string
  agency_id: string | null
  nombre: string
  tipo: TipoContrato
  template_body: string
  campos_schema: CampoFormulario[]
  version: number
  is_active: boolean
  is_system_default: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Contrato {
  id: string
  agency_id: string
  template_id: string | null
  tipo: TipoContrato
  nombre_referencia: string | null
  estado: EstadoContrato
  form_data: Record<string, string | number>
  pdf_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ContractSignature {
  id: string
  contrato_id: string
  firmante_rol: FirmanteRol
  firmante_nombre: string
  firmante_dni: string | null
  firma_imagen_base64: string | null
  firmado_at: string | null
  ip_address: string | null
}

export interface ContratoWizardState {
  tipo: TipoContrato | null
  template: ContractTemplate | null
  paso_actual: number
  pasos_total: number
  form_data: Record<string, string | number>
  firmas: Partial<Record<FirmanteRol, ContractSignature>>
  pdf_preview_url: string | null
  contrato_guardado_id: string | null
}

export interface ConvertTemplateResponse {
  template_body: string
  placeholders_detectados: string[]
  tipo_contrato_detectado: TipoContrato | 'otro'
  advertencias: string[]
}

export const TIPO_CONTRATO_LABELS: Record<TipoContrato, string> = {
  locacion_habitacional: 'Locación Habitacional',
  locacion_comercial: 'Locación Comercial',
  boleto_compraventa: 'Boleto de Compraventa',
  reserva_venta: 'Reserva de Venta',
}

export const TIPO_CONTRATO_DESCRIPTIONS: Record<TipoContrato, string> = {
  locacion_habitacional: 'Contrato de alquiler residencial bajo Ley 27.551 y DNU 70/2023. Plazo mínimo 2 años.',
  locacion_comercial: 'Contrato de alquiler comercial con plazo mínimo 3 años según CCyC art. 1198.',
  boleto_compraventa: 'Compromiso de compraventa inmobiliaria con condiciones de pago y escrituración.',
  reserva_venta: 'Documento de reserva de inmueble con seña y condiciones de oferta.',
}

export const FIRMANTES_POR_TIPO: Record<TipoContrato, { rol: FirmanteRol; label: string; obligatorio: boolean }[]> = {
  locacion_habitacional: [
    { rol: 'locador', label: 'Locador', obligatorio: true },
    { rol: 'locatario', label: 'Locatario', obligatorio: true },
    { rol: 'garante', label: 'Garante', obligatorio: false },
  ],
  locacion_comercial: [
    { rol: 'locador', label: 'Locador', obligatorio: true },
    { rol: 'locatario', label: 'Locatario', obligatorio: true },
    { rol: 'garante', label: 'Garante', obligatorio: false },
  ],
  boleto_compraventa: [
    { rol: 'vendedor', label: 'Vendedor', obligatorio: true },
    { rol: 'comprador', label: 'Comprador', obligatorio: true },
  ],
  reserva_venta: [
    { rol: 'vendedor', label: 'Propietario', obligatorio: true },
    { rol: 'comprador', label: 'Oferente', obligatorio: true },
  ],
}
