import {
  Sujeto,
  Comparable,
  ResultadoTasacion,
  ResultadoComparable,
  FactorAjusteValor,
  Amenidades,
  EstadoConservacion,
} from "./types";

// 1. Cálculo de Superficie Equivalente
export function calcularSuperficieEquivalente(
  m2_cubiertos: number,
  m2_semicubiertos: number,
  m2_descubiertos: number
): number {
  return m2_cubiertos + m2_semicubiertos * 0.5 + m2_descubiertos * 0.2;
}

// 2. Factores Constantes
const COEFICIENTES_ESTADO: Record<EstadoConservacion, number> = {
  muy_bueno: 1.0,
  bueno: 0.9,
  regular: 0.75,
  malo: 0.6,
  muy_malo: 0.4,
};

const VALORES_AMENIDADES: Record<keyof Amenidades, number> = {
  cochera_cubierta: 8,
  cochera_descubierta: 4,
  baulera: 1.5,
  pileta: 4,
  gimnasio: 2,
  sum: 1.5,
  seguridad_24hs: 2,
  jardin_privado: 3,
  terraza_privada: 3,
};

// 3. Cálculos de Diferenciales de Factor
export function diferencialSuperficie(supEqSujeto: number, supEqComparable: number): number {
  if (supEqSujeto === 0) return 0;
  // Por cada 10% de diferencial, aplicamos 1% de ajuste inverso.
  // Ejemplo: Comparable = 110m2, Sujeto = 100m2. Diff = +10%. Ajuste = -1%.
  const diffPorcentualReal = (supEqComparable - supEqSujeto) / supEqSujeto;
  return -(diffPorcentualReal * 10);
}

export function diferencialAntiguedadEstado(sujeto: Sujeto, comparable: Comparable): number {
  const coefSujeto = COEFICIENTES_ESTADO[sujeto.estado_conservacion];
  const coefComp = COEFICIENTES_ESTADO[comparable.estado_conservacion];
  
  // Estado
  const ajusteEstado = (coefSujeto / coefComp - 1) * 100;
  
  // Antigüedad (0.5% por cada año de diferencia)
  // ej: Sujeto = 10 años, Comp = 2 años -> diff = -8 años -> sujeto es más viejo -> ajuste = -4%
  const diffAnios = comparable.antiguedad_anios - sujeto.antiguedad_anios;
  const ajusteAntiguedad = diffAnios * 0.5;

  return ajusteEstado + ajusteAntiguedad;
}

export function diferencialAmenidades(amenidadesSujeto: Amenidades, amenidadesComparable: Amenidades): number {
  let ajustePorcentual = 0;
  const keys = Object.keys(VALORES_AMENIDADES) as (keyof Amenidades)[];
  keys.forEach((key) => {
    const valor = VALORES_AMENIDADES[key];
    const tieneSujeto = amenidadesSujeto[key] ? 1 : 0;
    const tieneComparable = amenidadesComparable[key] ? 1 : 0;
    ajustePorcentual += (tieneSujeto - tieneComparable) * valor;
  });
  return ajustePorcentual;
}

// 4. Homogeneizar Comparables individualmente
export function homogeneizarComparable(
  sujeto: Sujeto,
  comparable: Comparable,
  configuracionGlobal: { 
    meses_transcurridos: number; 
    variacion_mensual: number; // Porcentaje ej: 0.5% mensual
    descuento_oferta: number; // Porcentaje negativo ej: -8%
  },
  sobrescriturasManuales: Partial<FactorAjusteValor> // permitimos sobrescribir celdas dinámicamente
): ResultadoComparable {
  const supEqSujeto = calcularSuperficieEquivalente(
    sujeto.m2_cubiertos,
    sujeto.m2_semicubiertos,
    sujeto.m2_descubiertos
  );
  
  const supEqComp = calcularSuperficieEquivalente(
    comparable.m2_cubiertos,
    comparable.m2_semicubiertos,
    comparable.m2_descubiertos
  );

  const precioBaseM2 = supEqComp > 0 ? comparable.precio / supEqComp : 0;

  // Calculamos factores base
  const factSup = sobrescriturasManuales.superficie ?? diferencialSuperficie(supEqSujeto, supEqComp);
  const factAntEst = sobrescriturasManuales.antiguedad_estado ?? diferencialAntiguedadEstado(sujeto, comparable);
  const factAmenidades = sobrescriturasManuales.amenidades ?? diferencialAmenidades(sujeto.amenidades, comparable.amenidades);
  
  // Piso y Vista por default requiere input manual (arranca en 0 si no lo setean)
  const factPisoVista = sobrescriturasManuales.piso_vista ?? 0;

  // Factor Temporal: (1 + var_mensual/100)^meses - 1
  let factTemporal = 0;
  if (configuracionGlobal.meses_transcurridos > 0 && configuracionGlobal.variacion_mensual !== 0) {
    const varMensualReal = configuracionGlobal.variacion_mensual / 100;
    factTemporal = (Math.pow(1 + varMensualReal, configuracionGlobal.meses_transcurridos) - 1) * 100;
  }
  factTemporal = sobrescriturasManuales.temporal ?? factTemporal;

  // Factor Oferta vs Cierre
  let factOfertaCierre = 0;
  if (comparable.tipo_precio === 'oferta') {
    factOfertaCierre = configuracionGlobal.descuento_oferta;
  }
  factOfertaCierre = sobrescriturasManuales.oferta_cierre ?? factOfertaCierre;

  // Manual extra factor
  const factManualExtra = sobrescriturasManuales.manual ?? 0;

  const totalPorcentaje = 
    factSup + 
    factAntEst + 
    factAmenidades + 
    factPisoVista + 
    factTemporal + 
    factOfertaCierre + 
    factManualExtra;

  const precioM2Ajustado = precioBaseM2 * (1 + totalPorcentaje / 100);

  return {
    comparable_id: comparable.id,
    superficie_equivalente: supEqComp,
    precio_base_m2: precioBaseM2,
    factores_aplicados: {
      superficie: factSup,
      antiguedad_estado: factAntEst,
      piso_vista: factPisoVista,
      amenidades: factAmenidades,
      temporal: factTemporal,
      oferta_cierre: factOfertaCierre,
      manual: factManualExtra,
      nota_manual: sobrescriturasManuales.nota_manual,
      total_porcentaje: totalPorcentaje
    },
    precio_m2_ajustado: precioM2Ajustado,
    es_outlier: false, // Se evaluará a nivel global luego
    excluido: false // Podría recibir status de exclusión
  };
}

// 5. Motor Global de Tasación (Cálculo Final)
export function calcularResultadoTasacion(
  sujeto: Sujeto,
  comparables: Comparable[],
  configuracionGlobal: { 
    meses_transcurridos_por_comp: Record<string, number>; // meses desde opr_fecha
    variacion_mensual: number;
    descuento_oferta: number;
    margen_negociacion: number; // Ej: 5%
  },
  sobrescriturasManualesPorComp: Record<string, Partial<FactorAjusteValor>>,
  excluidos: string[]
): ResultadoTasacion {
  // Calculamos individualmente para cada Comparable
  let resultadosComps = comparables.map(c => {
    return homogeneizarComparable(
      sujeto, 
      c, 
      {
        meses_transcurridos: configuracionGlobal.meses_transcurridos_por_comp[c.id] || 0,
        variacion_mensual: configuracionGlobal.variacion_mensual,
        descuento_oferta: configuracionGlobal.descuento_oferta
      },
      sobrescriturasManualesPorComp[c.id] || {}
    );
  });

  // Marcamos excluidos
  resultadosComps = resultadosComps.map(rc => ({
    ...rc,
    excluido: excluidos.includes(rc.comparable_id)
  }));

  const activos = resultadosComps.filter(rc => !rc.excluido);

  // Stats sin filtros de outliers iniciales
  const preciosActivos = activos.map(a => a.precio_m2_ajustado);
  const meanAjustado = preciosActivos.length > 0 ? preciosActivos.reduce((a, b) => a + b, 0) / preciosActivos.length : 0;

  // Buscamos outliers (±20% de la media)
  resultadosComps = resultadosComps.map(rc => {
    const diffConMedia = Math.abs(rc.precio_m2_ajustado - meanAjustado) / meanAjustado;
    return {
      ...rc,
      es_outlier: diffConMedia > 0.20 && !rc.excluido // solo marcamos outliers de los no excluidos
    };
  });

  // Calculamos la ponderación final solo con los activos (incluyendo outliers que NO esten manualmente excluidos)
  let sumPonderada = 0;
  let sumPesos = 0;
  let minPrecio = Infinity;
  let maxPrecio = -Infinity;

  activos.forEach(rc => {
    const originalComparable = comparables.find(c => c.id === rc.comparable_id);
    const peso = originalComparable ? originalComparable.peso : 3;

    sumPonderada += rc.precio_m2_ajustado * peso;
    sumPesos += peso;
    
    if (rc.precio_m2_ajustado < minPrecio) minPrecio = rc.precio_m2_ajustado;
    if (rc.precio_m2_ajustado > maxPrecio) maxPrecio = rc.precio_m2_ajustado;
  });

  const mediaPonderadaM2 = sumPesos > 0 ? sumPonderada / sumPesos : 0;
  
  if (minPrecio === Infinity) minPrecio = 0;
  if (maxPrecio === -Infinity) maxPrecio = 0;

  const supEqSujeto = calcularSuperficieEquivalente(
    sujeto.m2_cubiertos,
    sujeto.m2_semicubiertos,
    sujeto.m2_descubiertos
  );

  return {
    superficie_equivalente_sujeto: supEqSujeto,
    precio_minimo_m2: minPrecio,
    precio_medio_m2: meanAjustado,
    precio_maximo_m2: maxPrecio,
    precio_medio_m2_ponderado: mediaPonderadaM2,
    
    valor_minimo: minPrecio * supEqSujeto,
    valor_medio: mediaPonderadaM2 * supEqSujeto,
    valor_maximo: maxPrecio * supEqSujeto,
    valor_sugerido_publicacion: mediaPonderadaM2 * supEqSujeto * (1 + configuracionGlobal.margen_negociacion / 100),
    
    resultados_comparables: resultadosComps
  };
}
