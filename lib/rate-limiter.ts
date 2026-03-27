/**
 * Rate Limiter Global para PRISMA IA
 * Implementación en memoria con interface para Redis (producción futura)
 */

type RateLimitInfo = {
  count: number;
  resetAt: number;
};

const cache = new Map<string, RateLimitInfo>();

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
  keyPrefix: string;
}

/**
 * Verifica si una solicitud supera el límite de tasa.
 * @returns {Promise<{
 *   success: boolean,
 *   limit: number,
 *   remaining: number,
 *   resetAt: number,
 *   errorMessage?: string
 * }>}
 */
export async function rateLimit(key: string, config: RateLimitConfig) {
  const fullKey = `${config.keyPrefix}:${key}`;
  const now = Date.now();
  const info = cache.get(fullKey);

  if (!info || now > info.resetAt) {
    const newInfo = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    cache.set(fullKey, newInfo);
    return {
      success: true,
      limit: config.limit,
      remaining: config.limit - 1,
      resetAt: newInfo.resetAt,
    };
  }

  if (info.count >= config.limit) {
    const minutesLeft = Math.ceil((info.resetAt - now) / 60000);
    return {
      success: false,
      limit: config.limit,
      remaining: 0,
      resetAt: info.resetAt,
      errorMessage: `Límite de solicitudes alcanzado. Intentá en ${minutesLeft} minutos.`,
    };
  }

  info.count += 1;
  cache.set(fullKey, info);

  return {
    success: true,
    limit: config.limit,
    remaining: config.limit - info.count,
    resetAt: info.resetAt,
  };
}

// Configuración de límites predefinidos
export const LIMITS = {
  AI: { 
    limit: 30, 
    windowMs: 60 * 60 * 1000, // 30 req/hora
    keyPrefix: 'rl:ai' 
  },
  TOKKO_SYNC: { 
    limit: 1, 
    windowMs: 5 * 60 * 1000, // 1 req/5min
    keyPrefix: 'rl:tokko' 
  },
  VALUATION: { 
    limit: 20, 
    windowMs: 60 * 60 * 1000, // 20 req/hora
    keyPrefix: 'rl:valuation' 
  },
  DOCUMENTS: { 
    limit: 10, 
    windowMs: 60 * 60 * 1000, // 10 req/hora
    keyPrefix: 'rl:docs' 
  },
  AUTH: { 
    limit: 5, 
    windowMs: 15 * 60 * 1000, // 5 req/15min
    keyPrefix: 'rl:auth' 
  },
};
