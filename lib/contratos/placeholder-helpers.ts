import type { CampoFormulario, TipoContrato } from '@/types/contratos'

// ============================================================
// LOCACIÓN HABITACIONAL — Campos del formulario
// ============================================================
const camposLocacionHabitacional: CampoFormulario[] = [
  // LOCADOR
  { id: 'loc_h_1', nombre: 'LOCADOR_NOMBRE_COMPLETO', label: 'Nombre completo del locador', tipo: 'text', requerido: true, grupo: 'LOCADOR', orden: 1 },
  { id: 'loc_h_2', nombre: 'LOCADOR_DNI_CUIT', label: 'DNI/CUIT del locador', tipo: 'dni', requerido: true, grupo: 'LOCADOR', orden: 2 },
  { id: 'loc_h_3', nombre: 'LOCADOR_DOMICILIO', label: 'Domicilio real del locador', tipo: 'text', requerido: true, grupo: 'LOCADOR', orden: 3 },
  { id: 'loc_h_4', nombre: 'LOCADOR_ESTADO_CIVIL', label: 'Estado civil', tipo: 'select', opciones: ['Soltero/a', 'Casado/a', 'Divorciado/a', 'Viudo/a', 'Unión convivencial'], requerido: true, grupo: 'LOCADOR', orden: 4 },
  { id: 'loc_h_5', nombre: 'LOCADOR_TELEFONO', label: 'Teléfono del locador', tipo: 'phone', requerido: false, grupo: 'LOCADOR', orden: 5 },
  { id: 'loc_h_6', nombre: 'LOCADOR_EMAIL', label: 'Email del locador', tipo: 'email', requerido: false, grupo: 'LOCADOR', orden: 6 },
  // LOCATARIO
  { id: 'loc_h_7', nombre: 'LOCATARIO_NOMBRE_COMPLETO', label: 'Nombre completo del locatario', tipo: 'text', requerido: true, grupo: 'LOCATARIO', orden: 1 },
  { id: 'loc_h_8', nombre: 'LOCATARIO_DNI_CUIT', label: 'DNI/CUIT del locatario', tipo: 'dni', requerido: true, grupo: 'LOCATARIO', orden: 2 },
  { id: 'loc_h_9', nombre: 'LOCATARIO_DOMICILIO', label: 'Domicilio real del locatario', tipo: 'text', requerido: true, grupo: 'LOCATARIO', orden: 3 },
  { id: 'loc_h_10', nombre: 'LOCATARIO_ESTADO_CIVIL', label: 'Estado civil', tipo: 'select', opciones: ['Soltero/a', 'Casado/a', 'Divorciado/a', 'Viudo/a', 'Unión convivencial'], requerido: true, grupo: 'LOCATARIO', orden: 4 },
  { id: 'loc_h_11', nombre: 'LOCATARIO_TELEFONO', label: 'Teléfono del locatario', tipo: 'phone', requerido: false, grupo: 'LOCATARIO', orden: 5 },
  { id: 'loc_h_12', nombre: 'LOCATARIO_EMAIL', label: 'Email del locatario', tipo: 'email', requerido: false, grupo: 'LOCATARIO', orden: 6 },
  // GARANTE
  { id: 'loc_h_13', nombre: 'GARANTE_NOMBRE_COMPLETO', label: 'Nombre completo del garante', tipo: 'text', requerido: false, grupo: 'GARANTE', orden: 1 },
  { id: 'loc_h_14', nombre: 'GARANTE_DNI_CUIT', label: 'DNI/CUIT del garante', tipo: 'dni', requerido: false, grupo: 'GARANTE', orden: 2 },
  { id: 'loc_h_15', nombre: 'GARANTE_DOMICILIO', label: 'Domicilio real del garante', tipo: 'text', requerido: false, grupo: 'GARANTE', orden: 3 },
  { id: 'loc_h_16', nombre: 'GARANTE_TIPO_GARANTIA', label: 'Tipo de garantía', tipo: 'select', opciones: ['Garantía personal', 'SGR', 'Seguro de caución', 'Propiedad en garantía'], requerido: false, grupo: 'GARANTE', orden: 4 },
  // INMUEBLE
  { id: 'loc_h_17', nombre: 'INMUEBLE_DIRECCION', label: 'Dirección completa del inmueble', tipo: 'text', requerido: true, grupo: 'INMUEBLE', orden: 1 },
  { id: 'loc_h_18', nombre: 'INMUEBLE_PARTIDO_LOCALIDAD', label: 'Partido / Localidad', tipo: 'text', requerido: true, grupo: 'INMUEBLE', orden: 2 },
  { id: 'loc_h_19', nombre: 'INMUEBLE_PROVINCIA', label: 'Provincia', tipo: 'text', requerido: true, grupo: 'INMUEBLE', orden: 3 },
  { id: 'loc_h_20', nombre: 'INMUEBLE_TIPO', label: 'Tipo de inmueble', tipo: 'select', opciones: ['Casa', 'Departamento', 'PH', 'Local'], requerido: true, grupo: 'INMUEBLE', orden: 4 },
  { id: 'loc_h_21', nombre: 'INMUEBLE_SUPERFICIE_M2', label: 'Superficie (m²)', tipo: 'number', requerido: true, grupo: 'INMUEBLE', orden: 5 },
  { id: 'loc_h_22', nombre: 'INMUEBLE_PISO_UNIDAD', label: 'Piso / Unidad', tipo: 'text', requerido: false, grupo: 'INMUEBLE', orden: 6 },
  { id: 'loc_h_23', nombre: 'INMUEBLE_MATRICULA', label: 'Matrícula registral', tipo: 'text', requerido: false, grupo: 'INMUEBLE', orden: 7 },
  // CONTRATO
  { id: 'loc_h_24', nombre: 'CONTRATO_FECHA_INICIO', label: 'Fecha de inicio', tipo: 'date', requerido: true, grupo: 'CONTRATO', orden: 1 },
  { id: 'loc_h_25', nombre: 'CONTRATO_PLAZO', label: 'Plazo del contrato', tipo: 'select', opciones: ['2 años', '3 años', '4 años', '5 años'], requerido: true, grupo: 'CONTRATO', orden: 2, validacion: { mensaje_error: 'El plazo mínimo es de 2 años según DNU 70/2023' } },
  { id: 'loc_h_26', nombre: 'CONTRATO_MONTO_PRIMER_MES', label: 'Monto primer mes ($ARS)', tipo: 'currency', requerido: true, grupo: 'CONTRATO', orden: 3 },
  { id: 'loc_h_27', nombre: 'CONTRATO_INDICE_ACTUALIZACION', label: 'Índice de actualización', tipo: 'select', opciones: ['ICL BCRA', 'Libre (DNU 70/2023)', 'IPC', 'Otro'], requerido: true, grupo: 'CONTRATO', orden: 4 },
  { id: 'loc_h_28', nombre: 'CONTRATO_PERIODICIDAD_AJUSTE', label: 'Periodicidad del ajuste', tipo: 'select', opciones: ['Mensual', 'Trimestral', 'Semestral', 'Anual'], requerido: true, grupo: 'CONTRATO', orden: 5 },
  { id: 'loc_h_29', nombre: 'CONTRATO_FORMA_PAGO', label: 'Forma de pago', tipo: 'select', opciones: ['Transferencia bancaria', 'Efectivo', 'Cheque'], requerido: true, grupo: 'CONTRATO', orden: 6 },
  { id: 'loc_h_30', nombre: 'CONTRATO_CBU_ALIAS', label: 'CBU / Alias del locador', tipo: 'text', requerido: false, grupo: 'CONTRATO', orden: 7 },
  // DEPÓSITO
  { id: 'loc_h_31', nombre: 'DEPOSITO_MONTO', label: 'Monto del depósito', tipo: 'currency', requerido: true, grupo: 'DEPÓSITO', orden: 1 },
  { id: 'loc_h_32', nombre: 'DEPOSITO_DEVOLUCION', label: 'Forma de devolución', tipo: 'select', opciones: ['Al finalizar el contrato', 'Ajustado por ICL al finalizar', 'Según cláusula especial'], requerido: true, grupo: 'DEPÓSITO', orden: 2 },
  // EXPENSAS
  { id: 'loc_h_33', nombre: 'EXPENSAS_A_CARGO', label: 'Expensas a cargo de', tipo: 'select', opciones: ['Locatario', 'Locador', 'Ambos'], requerido: true, grupo: 'EXPENSAS Y SERVICIOS', orden: 1 },
  { id: 'loc_h_34', nombre: 'EXPENSAS_PORCENTUAL', label: 'Porcentaje a cargo del locatario (%)', tipo: 'number', requerido: false, grupo: 'EXPENSAS Y SERVICIOS', orden: 2 },
  // SERVICIOS
  { id: 'loc_h_35', nombre: 'SERVICIO_ELECTRICIDAD', label: 'Electricidad a cargo de', tipo: 'select', opciones: ['Locatario', 'Locador'], requerido: true, grupo: 'EXPENSAS Y SERVICIOS', orden: 3 },
  { id: 'loc_h_36', nombre: 'SERVICIO_GAS', label: 'Gas a cargo de', tipo: 'select', opciones: ['Locatario', 'Locador'], requerido: true, grupo: 'EXPENSAS Y SERVICIOS', orden: 4 },
  { id: 'loc_h_37', nombre: 'SERVICIO_AGUA', label: 'Agua a cargo de', tipo: 'select', opciones: ['Locatario', 'Locador'], requerido: true, grupo: 'EXPENSAS Y SERVICIOS', orden: 5 },
  // INMOBILIARIA
  { id: 'loc_h_38', nombre: 'INMOBILIARIA_NOMBRE', label: 'Nombre de la inmobiliaria', tipo: 'text', requerido: false, grupo: 'PROFESIONALES', orden: 1 },
  { id: 'loc_h_39', nombre: 'INMOBILIARIA_MATRICULA', label: 'Matrícula profesional', tipo: 'text', requerido: false, grupo: 'PROFESIONALES', orden: 2 },
  { id: 'loc_h_40', nombre: 'INMOBILIARIA_COMISION', label: 'Comisión (%)', tipo: 'number', requerido: false, grupo: 'PROFESIONALES', orden: 3 },
  // ESCRIBANÍA
  { id: 'loc_h_41', nombre: 'ESCRIBANO_NOMBRE', label: 'Nombre del escribano', tipo: 'text', requerido: false, grupo: 'PROFESIONALES', orden: 4 },
  { id: 'loc_h_42', nombre: 'ESCRIBANO_REGISTRO', label: 'Registro N°', tipo: 'text', requerido: false, grupo: 'PROFESIONALES', orden: 5 },
  { id: 'loc_h_43', nombre: 'ESCRIBANO_DIRECCION', label: 'Dirección de la escribanía', tipo: 'text', requerido: false, grupo: 'PROFESIONALES', orden: 6 },
  // CLÁUSULAS ESPECIALES
  { id: 'loc_h_44', nombre: 'CLAUSULAS_ESPECIALES', label: 'Cláusulas especiales', tipo: 'textarea', requerido: false, grupo: 'CLÁUSULAS ESPECIALES', orden: 1, placeholder: 'Ingrese aquí cualquier cláusula especial adicional...' },
]

// ============================================================
// LOCACIÓN COMERCIAL — Campos adicionales
// ============================================================
const camposLocacionComercial: CampoFormulario[] = [
  // All of locación habitacional + additional fields
  ...camposLocacionHabitacional.map(c => ({ ...c, id: c.id.replace('loc_h_', 'loc_c_') })),
  // Override plazo
  { id: 'loc_c_25_override', nombre: 'CONTRATO_PLAZO', label: 'Plazo del contrato', tipo: 'select', opciones: ['3 años', '4 años', '5 años', '10 años'], requerido: true, grupo: 'CONTRATO', orden: 2, validacion: { mensaje_error: 'El plazo mínimo es de 3 años según CCyC art. 1198' } },
  // Commercial-specific
  { id: 'loc_c_50', nombre: 'DESTINO_RUBRO', label: 'Rubro / Actividad comercial', tipo: 'text', requerido: true, grupo: 'DESTINO COMERCIAL', orden: 1 },
  { id: 'loc_c_51', nombre: 'DESTINO_HABILITACION', label: 'Habilitación municipal requerida', tipo: 'select', opciones: ['Sí', 'No'], requerido: true, grupo: 'DESTINO COMERCIAL', orden: 2 },
  { id: 'loc_c_52', nombre: 'MEJORAS_A_CARGO', label: 'Mejoras a cargo de', tipo: 'select', opciones: ['Locatario', 'Locador', 'A acordar'], requerido: false, grupo: 'DESTINO COMERCIAL', orden: 3 },
  { id: 'loc_c_53', nombre: 'MEJORAS_AUTORIZACION', label: 'Requiere autorización escrita', tipo: 'select', opciones: ['Sí', 'No'], requerido: false, grupo: 'DESTINO COMERCIAL', orden: 4 },
  { id: 'loc_c_54', nombre: 'SUBARRENDAMIENTO', label: 'Subarrendamiento permitido', tipo: 'select', opciones: ['Sí, con consentimiento escrito', 'No'], requerido: true, grupo: 'DESTINO COMERCIAL', orden: 5 },
  { id: 'loc_c_55', nombre: 'RESCISION_PENALIDAD', label: 'Penalidad por rescisión anticipada (meses)', tipo: 'number', requerido: false, grupo: 'DESTINO COMERCIAL', orden: 6 },
]

// ============================================================
// BOLETO DE COMPRAVENTA
// ============================================================
const camposBoletoCompraventa: CampoFormulario[] = [
  // VENDEDOR
  { id: 'bcv_1', nombre: 'VENDEDOR_NOMBRE_COMPLETO', label: 'Nombre completo del vendedor', tipo: 'text', requerido: true, grupo: 'VENDEDOR', orden: 1 },
  { id: 'bcv_2', nombre: 'VENDEDOR_DNI_CUIT', label: 'DNI/CUIT del vendedor', tipo: 'dni', requerido: true, grupo: 'VENDEDOR', orden: 2 },
  { id: 'bcv_3', nombre: 'VENDEDOR_DOMICILIO', label: 'Domicilio real del vendedor', tipo: 'text', requerido: true, grupo: 'VENDEDOR', orden: 3 },
  { id: 'bcv_4', nombre: 'VENDEDOR_ESTADO_CIVIL', label: 'Estado civil', tipo: 'select', opciones: ['Soltero/a', 'Casado/a', 'Divorciado/a', 'Viudo/a', 'Unión convivencial'], requerido: true, grupo: 'VENDEDOR', orden: 4 },
  { id: 'bcv_5', nombre: 'VENDEDOR_CONYUGE_NOMBRE', label: 'Nombre del cónyuge (si corresponde art. 470 CCyC)', tipo: 'text', requerido: false, grupo: 'VENDEDOR', orden: 5 },
  { id: 'bcv_6', nombre: 'VENDEDOR_CONYUGE_DNI', label: 'DNI del cónyuge', tipo: 'dni', requerido: false, grupo: 'VENDEDOR', orden: 6 },
  // COMPRADOR
  { id: 'bcv_7', nombre: 'COMPRADOR_NOMBRE_COMPLETO', label: 'Nombre completo del comprador', tipo: 'text', requerido: true, grupo: 'COMPRADOR', orden: 1 },
  { id: 'bcv_8', nombre: 'COMPRADOR_DNI_CUIT', label: 'DNI/CUIT del comprador', tipo: 'dni', requerido: true, grupo: 'COMPRADOR', orden: 2 },
  { id: 'bcv_9', nombre: 'COMPRADOR_DOMICILIO', label: 'Domicilio real del comprador', tipo: 'text', requerido: true, grupo: 'COMPRADOR', orden: 3 },
  { id: 'bcv_10', nombre: 'COMPRADOR_ESTADO_CIVIL', label: 'Estado civil', tipo: 'select', opciones: ['Soltero/a', 'Casado/a', 'Divorciado/a', 'Viudo/a', 'Unión convivencial'], requerido: true, grupo: 'COMPRADOR', orden: 4 },
  // INMUEBLE
  { id: 'bcv_11', nombre: 'INMUEBLE_DIRECCION', label: 'Dirección del inmueble', tipo: 'text', requerido: true, grupo: 'INMUEBLE', orden: 1 },
  { id: 'bcv_12', nombre: 'INMUEBLE_PARTIDO', label: 'Partido', tipo: 'text', requerido: true, grupo: 'INMUEBLE', orden: 2 },
  { id: 'bcv_13', nombre: 'INMUEBLE_PROVINCIA', label: 'Provincia', tipo: 'text', requerido: true, grupo: 'INMUEBLE', orden: 3 },
  { id: 'bcv_14', nombre: 'INMUEBLE_TIPO', label: 'Tipo de inmueble', tipo: 'select', opciones: ['Casa', 'Departamento', 'PH', 'Local', 'Terreno', 'Oficina'], requerido: true, grupo: 'INMUEBLE', orden: 4 },
  { id: 'bcv_15', nombre: 'INMUEBLE_SUPERFICIE_M2', label: 'Superficie (m²)', tipo: 'number', requerido: true, grupo: 'INMUEBLE', orden: 5 },
  { id: 'bcv_16', nombre: 'INMUEBLE_MATRICULA_RPI', label: 'Matrícula RPI', tipo: 'text', requerido: true, grupo: 'INMUEBLE', orden: 6 },
  { id: 'bcv_17', nombre: 'INMUEBLE_TITULO_FOLIO', label: 'N° de Folio / Inscripción', tipo: 'text', requerido: false, grupo: 'INMUEBLE', orden: 7 },
  { id: 'bcv_18', nombre: 'INMUEBLE_DESIGNACION', label: 'Designación (UF / Piso / Letra)', tipo: 'text', requerido: false, grupo: 'INMUEBLE', orden: 8 },
  // PRECIO
  { id: 'bcv_19', nombre: 'PRECIO_TOTAL', label: 'Precio total', tipo: 'currency', requerido: true, grupo: 'PRECIO', orden: 1 },
  { id: 'bcv_20', nombre: 'PRECIO_MONEDA', label: 'Moneda', tipo: 'select', opciones: ['ARS', 'USD billete'], requerido: true, grupo: 'PRECIO', orden: 2 },
  { id: 'bcv_21', nombre: 'PRECIO_SENA_MONTO', label: 'Seña abonada en este acto', tipo: 'currency', requerido: true, grupo: 'PRECIO', orden: 3 },
  { id: 'bcv_22', nombre: 'PRECIO_CUOTAS_NUMERO', label: 'Cantidad de cuotas intermedias', tipo: 'number', requerido: false, grupo: 'PRECIO', orden: 4 },
  { id: 'bcv_23', nombre: 'PRECIO_CUOTAS_DETALLE', label: 'Detalle cuotas (montos y fechas)', tipo: 'textarea', requerido: false, grupo: 'PRECIO', orden: 5 },
  { id: 'bcv_24', nombre: 'PRECIO_SALDO_ESCRITURACION', label: 'Saldo a escrituración', tipo: 'currency', requerido: true, grupo: 'PRECIO', orden: 6 },
  // POSESIÓN Y ESCRITURACIÓN
  { id: 'bcv_25', nombre: 'POSESION_FECHA', label: 'Fecha de entrega de posesión', tipo: 'date', requerido: true, grupo: 'ESCRITURACIÓN', orden: 1 },
  { id: 'bcv_26', nombre: 'POSESION_ESTADO', label: 'Estado del inmueble en posesión', tipo: 'text', requerido: false, grupo: 'ESCRITURACIÓN', orden: 2, placeholder: 'Ej: Libre de ocupantes, en buen estado...' },
  { id: 'bcv_27', nombre: 'ESCRITURACION_PLAZO_DIAS', label: 'Plazo para escrituración (días)', tipo: 'number', requerido: true, grupo: 'ESCRITURACIÓN', orden: 3 },
  { id: 'bcv_28', nombre: 'ESCRIBANO_NOMBRE', label: 'Nombre del escribano designado', tipo: 'text', requerido: false, grupo: 'ESCRITURACIÓN', orden: 4 },
  { id: 'bcv_29', nombre: 'ESCRIBANO_REGISTRO', label: 'Registro N°', tipo: 'text', requerido: false, grupo: 'ESCRITURACIÓN', orden: 5 },
  { id: 'bcv_30', nombre: 'ESCRIBANO_DIRECCION', label: 'Dirección de la escribanía', tipo: 'text', requerido: false, grupo: 'ESCRITURACIÓN', orden: 6 },
  // GASTOS E IMPUESTOS
  { id: 'bcv_31', nombre: 'GASTOS_HONORARIOS', label: 'Honorarios y sellos a cargo de', tipo: 'select', opciones: ['Vendedor', 'Comprador', 'Mitades'], requerido: true, grupo: 'GASTOS E IMPUESTOS', orden: 1 },
  { id: 'bcv_32', nombre: 'ITI_A_CARGO', label: 'ITI a cargo de', tipo: 'select', opciones: ['Vendedor', 'No aplica'], requerido: true, grupo: 'GASTOS E IMPUESTOS', orden: 2 },
  // CLÁUSULA PENAL
  { id: 'bcv_33', nombre: 'CLAUSULA_PENAL_MONTO', label: 'Monto por día de incumplimiento', tipo: 'currency', requerido: false, grupo: 'CLÁUSULA PENAL', orden: 1 },
  { id: 'bcv_34', nombre: 'CLAUSULA_PENAL_OPCION', label: 'Opción ante incumplimiento', tipo: 'select', opciones: ['Resolución del contrato', 'Cumplimiento compulsivo', 'Ambas opciones'], requerido: false, grupo: 'CLÁUSULA PENAL', orden: 2 },
  // INMOBILIARIA
  { id: 'bcv_35', nombre: 'INMOBILIARIA_NOMBRE', label: 'Nombre de la inmobiliaria', tipo: 'text', requerido: false, grupo: 'PROFESIONALES', orden: 1 },
  { id: 'bcv_36', nombre: 'INMOBILIARIA_MATRICULA', label: 'Matrícula profesional', tipo: 'text', requerido: false, grupo: 'PROFESIONALES', orden: 2 },
  { id: 'bcv_37', nombre: 'INMOBILIARIA_COMISION', label: 'Comisión (%)', tipo: 'number', requerido: false, grupo: 'PROFESIONALES', orden: 3 },
  { id: 'bcv_38', nombre: 'INMOBILIARIA_COMISION_PAGA', label: 'Comisión la paga', tipo: 'select', opciones: ['Vendedor', 'Comprador', 'Ambos'], requerido: false, grupo: 'PROFESIONALES', orden: 4 },
  // JURISDICCIÓN
  { id: 'bcv_39', nombre: 'JURISDICCION', label: 'Tribunales de (ciudad)', tipo: 'text', requerido: true, grupo: 'JURISDICCIÓN', orden: 1 },
  // CLÁUSULAS ESPECIALES
  { id: 'bcv_40', nombre: 'CLAUSULAS_ESPECIALES', label: 'Cláusulas especiales', tipo: 'textarea', requerido: false, grupo: 'CLÁUSULAS ESPECIALES', orden: 1, placeholder: 'Ingrese aquí cualquier cláusula especial adicional...' },
]

// ============================================================
// RESERVA DE VENTA
// ============================================================
const camposReservaVenta: CampoFormulario[] = [
  // OFERENTE
  { id: 'rv_1', nombre: 'OFERENTE_NOMBRE', label: 'Nombre del oferente (comprador)', tipo: 'text', requerido: true, grupo: 'OFERENTE', orden: 1 },
  { id: 'rv_2', nombre: 'OFERENTE_DNI_CUIT', label: 'DNI/CUIT', tipo: 'dni', requerido: true, grupo: 'OFERENTE', orden: 2 },
  { id: 'rv_3', nombre: 'OFERENTE_DOMICILIO', label: 'Domicilio', tipo: 'text', requerido: true, grupo: 'OFERENTE', orden: 3 },
  { id: 'rv_4', nombre: 'OFERENTE_TELEFONO', label: 'Teléfono', tipo: 'phone', requerido: false, grupo: 'OFERENTE', orden: 4 },
  { id: 'rv_5', nombre: 'OFERENTE_EMAIL', label: 'Email', tipo: 'email', requerido: false, grupo: 'OFERENTE', orden: 5 },
  // PROPIETARIO
  { id: 'rv_6', nombre: 'PROPIETARIO_NOMBRE', label: 'Nombre del propietario', tipo: 'text', requerido: true, grupo: 'PROPIETARIO', orden: 1 },
  { id: 'rv_7', nombre: 'PROPIETARIO_DNI_CUIT', label: 'DNI/CUIT', tipo: 'dni', requerido: true, grupo: 'PROPIETARIO', orden: 2 },
  { id: 'rv_8', nombre: 'PROPIETARIO_DOMICILIO', label: 'Domicilio', tipo: 'text', requerido: true, grupo: 'PROPIETARIO', orden: 3 },
  // INMUEBLE
  { id: 'rv_9', nombre: 'INMUEBLE_DIRECCION', label: 'Dirección del inmueble', tipo: 'text', requerido: true, grupo: 'INMUEBLE', orden: 1 },
  { id: 'rv_10', nombre: 'INMUEBLE_PARTIDO', label: 'Partido', tipo: 'text', requerido: true, grupo: 'INMUEBLE', orden: 2 },
  { id: 'rv_11', nombre: 'INMUEBLE_PROVINCIA', label: 'Provincia', tipo: 'text', requerido: true, grupo: 'INMUEBLE', orden: 3 },
  { id: 'rv_12', nombre: 'INMUEBLE_TIPO', label: 'Tipo de inmueble', tipo: 'select', opciones: ['Casa', 'Departamento', 'PH', 'Local', 'Terreno', 'Oficina'], requerido: true, grupo: 'INMUEBLE', orden: 4 },
  // PRECIO Y SEÑA
  { id: 'rv_13', nombre: 'PRECIO_OFERTA', label: 'Precio de oferta', tipo: 'currency', requerido: true, grupo: 'PRECIO Y SEÑA', orden: 1 },
  { id: 'rv_14', nombre: 'PRECIO_MONEDA', label: 'Moneda', tipo: 'select', opciones: ['ARS', 'USD billete'], requerido: true, grupo: 'PRECIO Y SEÑA', orden: 2 },
  { id: 'rv_15', nombre: 'SENA_MONTO', label: 'Seña entregada', tipo: 'currency', requerido: true, grupo: 'PRECIO Y SEÑA', orden: 3 },
  { id: 'rv_16', nombre: 'SENA_FORMA_PAGO', label: 'Forma de pago de la seña', tipo: 'select', opciones: ['Efectivo', 'Transferencia bancaria', 'Cheque'], requerido: true, grupo: 'PRECIO Y SEÑA', orden: 4 },
  // CONDICIONES
  { id: 'rv_17', nombre: 'CONDICIONES_PLAZO_ACEPTACION', label: 'Plazo de aceptación (días)', tipo: 'number', requerido: true, grupo: 'CONDICIONES', orden: 1 },
  { id: 'rv_18', nombre: 'CONDICIONES_PAGO_RESTANTE', label: 'Forma de pago del restante', tipo: 'textarea', requerido: true, grupo: 'CONDICIONES', orden: 2 },
  { id: 'rv_19', nombre: 'VENCIMIENTO_RESERVA', label: 'Fecha de vencimiento de la reserva', tipo: 'date', requerido: true, grupo: 'CONDICIONES', orden: 3 },
  // PROFESIONAL
  { id: 'rv_20', nombre: 'PROFESIONAL_NOMBRE', label: 'Nombre del profesional interviniente', tipo: 'text', requerido: false, grupo: 'PROFESIONAL', orden: 1 },
  { id: 'rv_21', nombre: 'PROFESIONAL_MATRICULA', label: 'Matrícula', tipo: 'text', requerido: false, grupo: 'PROFESIONAL', orden: 2 },
  { id: 'rv_22', nombre: 'PROFESIONAL_COMISION', label: 'Comisión (%)', tipo: 'number', requerido: false, grupo: 'PROFESIONAL', orden: 3 },
  // PENALIDAD
  { id: 'rv_23', nombre: 'PENALIDAD_PORCENTAJE', label: 'Penalidad si desiste (%)', tipo: 'number', requerido: false, grupo: 'PENALIDAD', orden: 1 },
]

// ============================================================
// EXPORT
// ============================================================
export const CAMPOS_POR_TIPO: Record<TipoContrato, CampoFormulario[]> = {
  locacion_habitacional: camposLocacionHabitacional,
  locacion_comercial: camposLocacionComercial,
  boleto_compraventa: camposBoletoCompraventa,
  reserva_venta: camposReservaVenta,
}

/**
 * Returns groups in order from a list of campos.
 */
export function getGruposOrdenados(campos: CampoFormulario[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const c of campos) {
    if (!seen.has(c.grupo)) {
      seen.add(c.grupo)
      result.push(c.grupo)
    }
  }
  return result
}

/**
 * Returns campos filtered by grupo.
 */
export function getCamposPorGrupo(campos: CampoFormulario[], grupo: string): CampoFormulario[] {
  return campos.filter(c => c.grupo === grupo).sort((a, b) => a.orden - b.orden)
}
/**
 * Returns the default field schema for a given contract type.
 */
export function getCamposSchemaForTipo(tipo: TipoContrato): CampoFormulario[] {
  return CAMPOS_POR_TIPO[tipo] || []
}
