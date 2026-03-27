# SKILL: security-produccion-b2c
# Versión: 1.0.0 | Creado: 2026-03-20
# Fuente: OWASP Top 10 2025 · GitHub cursor-security-rules (364★) · Secure Code Warrior · Cloud Security Alliance · investigación 2026
# Scope: Seguridad en desarrollo de software para producción B2C — multi-tenant, full-stack

---

## OBJETIVO

Aplicar seguridad de nivel producción en todo sistema B2C desde el día 1. No como capa adicional — como propiedad estructural del código. Cubre OWASP Top 10 2025, patrones de AI-assisted coding seguro, multi-tenant, autenticación, APIs, datos sensibles, supply chain y monitoreo.

---

## PRINCIPIO RECTOR

> **Seguridad no es una feature. Es una propiedad que emerge de cómo se construye.**
> Cada endpoint, cada función, cada dependencia, cada variable de entorno es una superficie de ataque potencial. Tratar todo como hostil por defecto.

**Regla base:** `deny-by-default`. Todo acceso denegado hasta ser explícitamente autorizado. Nunca al revés.

---

## PARTE 1 — OWASP TOP 10 2025 (obligatorio cubrir todos)

### A01 — Broken Access Control ⚠️ #1 más crítico
Broken Access Control se mantiene en el puesto #1. El 3.73% de las aplicaciones probadas tenían al menos una de las 40 CWEs en esta categoría. Broken Access Control es el problema más común porque la autorización es difícil de implementar correctamente en cada punto de acceso.

**Patrones a prevenir:**
- IDOR (Insecure Direct Object Reference): usuario cambia `?id=123` → accede a datos de otro usuario
- Acceso a rutas `/admin` sin verificación de rol
- Frontend que oculta botones en vez de proteger el endpoint
- APIs que no verifican ownership en cada request

**Implementación obligatoria:**
```typescript
// ❌ MAL — confiar en el frontend
if (user.isAdmin) showDeleteButton()  // el backend igual debe verificar

// ✅ BIEN — verificar en cada endpoint del servidor
async function deleteResource(userId: string, resourceId: string) {
  const resource = await db.findById(resourceId)
  if (resource.ownerId !== userId) throw new ForbiddenError()
  // proceder solo si el usuario es el dueño
}

// ✅ BIEN con Supabase RLS — nunca confiar solo en el cliente
// En Supabase: definir políticas RLS que aplican en la DB, no en el código
CREATE POLICY "users_own_data" ON profiles
  FOR ALL USING (auth.uid() = user_id);
```

---

### A02 — Security Misconfiguration ⚠️ Subió a #2
Security Misconfiguration subió abruptamente del puesto 5 al 2, reflejando su creciente prevalencia. El mensaje de OWASP es claro: nuestras herramientas se están volviendo demasiado complejas para configurar de forma segura.

**Checklist obligatorio antes de cada deploy:**
```
□ Variables de entorno: NUNCA valores por defecto en producción
□ Headers de seguridad HTTP activos (CSP, HSTS, X-Frame-Options)
□ Debug mode: DESACTIVADO en producción
□ Stack traces: no exponer al cliente
□ CORS: lista blanca explícita, no "*"
□ Puertos innecesarios: cerrados
□ Servicios no usados: deshabilitados
□ Supabase: RLS habilitado en TODAS las tablas, sin excepción
```

**Headers HTTP obligatorios:**
```typescript
// Next.js — next.config.js
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
  }
]
```

---

### A03 — Software Supply Chain Failures ⚠️ NUEVO en 2025
OWASP 2025 señala que los ataques de supply chain raramente comienzan en producción. Comienzan en la workstation del desarrollador. Un solo paquete malicioso puede moverse a través de sistemas CI, contenedores y entornos cloud en horas, a menudo sin disparar scanners tradicionales.

**Reglas obligatorias:**
```
□ Nunca instalar paquetes sin revisar: npm audit antes de cada install
□ Paquetes no actualizados en +12 meses: flag para revisar
□ Lockfiles (package-lock.json / yarn.lock) siempre en el repo
□ Dependabot o Renovate activo en cada repositorio
□ Verificar integridad con checksums antes de builds críticos
□ Evitar paquetes con < 100 stars y sin mantenimiento activo en NPM/PyPI
```

```bash
# Auditoría en cada PR
npm audit --audit-level=moderate
# o
pip-audit --requirement requirements.txt
```

---

### A04 — Cryptographic Failures
Fallo al cifrar datos sensibles en tránsito o en reposo.

**Reglas:**
```
□ HTTPS obligatorio — sin excepciones, ni en desarrollo si hay datos reales
□ Contraseñas: NUNCA texto plano. Usar bcrypt (cost factor ≥ 12) o argon2id
□ Tokens JWT: firmar con RS256 o ES256, nunca con "none" o HS256 débil
□ Datos sensibles en DB: cifrar campos PII (email, teléfono, DNI)
□ Secretos: NUNCA en código fuente. Siempre en .env + gestor de secretos
□ TLS 1.2 mínimo, TLS 1.3 preferido
```

```typescript
// ✅ Hash seguro de contraseñas con bcrypt
import bcrypt from 'bcryptjs'
const SALT_ROUNDS = 12
const hash = await bcrypt.hash(plainPassword, SALT_ROUNDS)
const valid = await bcrypt.compare(plainPassword, hash)
```

---

### A05 — Injection (SQL, NoSQL, Command, LDAP)
La regla fundamental: siempre usar queries parametrizadas — nunca concatenación de strings para queries de base de datos.

```typescript
// ❌ VULNERABLE — SQL injection directa
const query = `SELECT * FROM users WHERE email = '${email}'`

// ✅ SEGURO — query parametrizada
const { data } = await supabase
  .from('users')
  .select('*')
  .eq('email', email)  // Supabase parameteriza automáticamente

// ✅ SEGURO — con pg directo
const result = await pool.query(
  'SELECT * FROM users WHERE email = $1',
  [email]
)

// ❌ VULNERABLE — Command injection
exec(`convert ${userInput} output.pdf`)

// ✅ SEGURO — sanitizar y usar array
execFile('convert', [sanitizedInput, 'output.pdf'])
```

---

### A06 — Vulnerable & Outdated Components
```
□ Audit semanal de dependencias (npm audit / pip-audit / cargo audit)
□ GitHub Dependabot activado con auto-merge para patches menores
□ Node.js: mantener en LTS activo, no usar versiones EOL
□ Imágenes Docker: usar base images oficiales, tag fijo (no :latest)
□ SBOM (Software Bill of Materials) generado en cada release
```

---

### A07 — Authentication Failures
Las vulnerabilidades de autenticación incluyen: uso de contraseñas en texto plano o con hash débil, ausencia de MFA, reutilización del session ID después del login, no invalidar sesiones en logout, y exposición del session ID en la URL.

**Implementación con Supabase Auth:**
```typescript
// ✅ Sesión segura con Supabase
import { createClient } from '@supabase/supabase-js'

// Rate limiting en login — obligatorio para prevenir brute force
import rateLimit from 'express-rate-limit'
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutos
  max: 5,                      // máx 5 intentos
  message: 'Demasiados intentos. Esperar 15 minutos.'
})

// Invalidar sesión en logout — CRÍTICO
const { error } = await supabase.auth.signOut()

// Verificar JWT en cada request protegido
const { data: { user }, error } = await supabase.auth.getUser(token)
if (!user || error) return res.status(401).json({ error: 'No autorizado' })
```

**Reglas de autenticación:**
```
□ MFA disponible para usuarios (obligatorio para admins)
□ Rate limiting en login: máx 5 intentos / 15 minutos
□ Bloqueo temporal tras N intentos fallidos
□ Tokens de sesión: HttpOnly, Secure, SameSite=Strict
□ Logout: invalidar token en servidor (no solo en cliente)
□ Contraseñas: mínimo 8 caracteres, validar con HaveIBeenPwned API
□ Password reset: tokens de un solo uso con expiración ≤ 1 hora
```

---

### A08 — Software & Data Integrity Failures
```
□ Verificar firma de JWTs — nunca aceptar algoritmo "none"
□ CI/CD: proteger pipelines con secrets de GitHub Actions
□ Despliegues: verificar checksums de artifacts antes de deploy
□ No procesar deserialización de datos no confiables
□ Validar integridad de webhooks (firma HMAC)
```

```typescript
// ✅ Verificar webhook de Stripe (ejemplo patrón)
import crypto from 'crypto'
function verifyWebhook(payload: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}
```

---

### A09 — Security Logging & Monitoring Failures
```
□ Log de TODOS los eventos de autenticación (login, logout, fallido)
□ Log de cambios en datos sensibles (quién, cuándo, qué cambió)
□ Log de accesos denegados (posibles intentos de intrusión)
□ Alertas automáticas para patrones anómalos
□ NUNCA loguear: contraseñas, tokens, datos de tarjetas, secretos
□ Retención de logs: mínimo 90 días en producción
```

```typescript
// ✅ Estructura de log segura
const securityLog = {
  timestamp: new Date().toISOString(),
  event: 'LOGIN_FAILED',
  userId: user?.id ?? 'anonymous',
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  // ❌ NUNCA: password, token, secretKey
}
```

---

### A10 — Mishandling of Exceptional Conditions ⚠️ NUEVO en 2025
OWASP 2025 agrega Mishandling of Exceptional Conditions. La mitigación requiere lógica "fail closed", error handlers globales y validación estricta de inputs.

```typescript
// ❌ MAL — exponer detalles del error al cliente
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.stack })  // NUNCA
})

// ✅ BIEN — fail closed, log interno, mensaje genérico al cliente
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error({ err, path: req.path, method: req.method })  // log completo interno
  res.status(500).json({ error: 'Error interno del servidor' })  // mensaje genérico
})

// ✅ Validación estricta de inputs con Zod
import { z } from 'zod'
const UserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100).trim(),
  age: z.number().int().min(18).max(120)
})
// Si falla → error 400 con detalle, nunca 500
```

---

## PARTE 2 — SEGURIDAD MULTI-TENANT (crítico para B2C)

Todos los sistemas multi-tenant exponen el riesgo de data leakage entre tenants. Es el error más costoso en B2C.

### Row Level Security (RLS) en Supabase — obligatorio en TODAS las tablas

```sql
-- Habilitar RLS en toda tabla nueva (NUNCA omitir)
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Política base: usuarios solo ven sus propios datos
CREATE POLICY "tenant_isolation" ON properties
  FOR ALL
  USING (organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

-- Política para admins de la organización
CREATE POLICY "org_admin_access" ON properties
  FOR ALL
  USING (
    organization_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Verificar que RLS está activo (correr en cada deploy)
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;
-- Si devuelve filas: ALERTA — tabla sin protección
```

### Aislamiento a nivel aplicación
```typescript
// ✅ Siempre filtrar por tenant en queries
async function getProperties(userId: string) {
  const { organizationId } = await getUserOrg(userId)
  
  return supabase
    .from('properties')
    .select('*')
    .eq('organization_id', organizationId)  // filtro explícito + RLS como doble capa
}

// ❌ NUNCA asumir que el userId en el request es el correcto
// Siempre obtenerlo del token verificado del servidor
```

---

## PARTE 3 — GESTIÓN DE SECRETOS Y VARIABLES DE ENTORNO

Los Cursor Security Rules de GitHub enfatizan: controlar operaciones sensibles y prevenir exposición accidental de secretos como el riesgo más inmediato en desarrollo AI-asistido.

```
REGLAS DE ORO:
□ .env NUNCA en el repositorio (verificar .gitignore antes de cada commit)
□ .env.example SÍ en el repo (con keys pero sin valores)
□ Secretos en producción: usar gestores (Vercel Env, GitHub Secrets, Doppler)
□ Rotación de API keys: cada 90 días o ante cualquier sospecha
□ Principio de mínimo privilegio: cada servicio con solo los permisos que necesita
□ Service Role Key de Supabase: NUNCA en frontend, solo en servidor
```

```bash
# .gitignore mínimo obligatorio por proyecto
.env
.env.local
.env.production
.env*.local
*.key
*.pem
*.p12
secrets/
.secrets
```

```typescript
// ✅ Validar que todas las variables requeridas existen al iniciar
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_URL'
]

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Variable de entorno requerida faltante: ${envVar}`)
  }
}
```

---

## PARTE 4 — VALIDACIÓN Y SANITIZACIÓN DE INPUTS

Todo input del usuario es hostil hasta demostrar lo contrario.

```typescript
import { z } from 'zod'
import DOMPurify from 'isomorphic-dompurify'

// ✅ Esquema de validación estricto para cada endpoint
const ContactSchema = z.object({
  name: z.string().min(1).max(100).trim()
    .refine(s => !/[<>\"'`]/.test(s), 'Caracteres no permitidos'),
  email: z.string().email().max(255).toLowerCase(),
  phone: z.string().regex(/^[\d\s\+\-\(\)]{7,20}$/).optional(),
  message: z.string().min(1).max(2000).trim()
})

// ✅ Sanitizar HTML si se acepta contenido enriquecido
const cleanHTML = DOMPurify.sanitize(userInput, {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong'],
  ALLOWED_ATTR: []
})

// ✅ Validar en el handler de la API
export async function POST(req: Request) {
  const body = await req.json()
  const result = ContactSchema.safeParse(body)
  
  if (!result.success) {
    return Response.json(
      { error: 'Datos inválidos', details: result.error.flatten() },
      { status: 400 }
    )
  }
  // proceder con result.data (tipo seguro y sanitizado)
}
```

---

## PARTE 5 — SEGURIDAD DE APIs

```typescript
// ✅ Rate limiting por IP y por usuario
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'),  // 10 requests / 10 seg
})

export async function middleware(request: NextRequest) {
  const ip = request.ip ?? '127.0.0.1'
  const { success } = await ratelimit.limit(ip)
  if (!success) return new Response('Too Many Requests', { status: 429 })
}

// ✅ CORS estricto
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') ?? [],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}

// ✅ Nunca exponer IDs internos — usar UUIDs
// ❌ MAL: /api/users/1, /api/users/2 (enumerable)
// ✅ BIEN: /api/users/uuid-aleatorio-largo
```

---

## PARTE 6 — PATH TRAVERSAL Y SSRF

```typescript
// ✅ Prevenir path traversal en uploads y file access
import path from 'path'

function securePath(userInput: string, basePath: string): string {
  const resolved = path.resolve(basePath, userInput)
  if (!resolved.startsWith(basePath)) {
    throw new Error('Path traversal detectado')
  }
  return resolved
}

// ✅ Prevenir SSRF en requests salientes
const ALLOWED_DOMAINS = ['api.example.com', 'cdn.example.com']

function validateExternalUrl(url: string): boolean {
  const parsed = new URL(url)
  if (!['https:'].includes(parsed.protocol)) return false
  if (!ALLOWED_DOMAINS.includes(parsed.hostname)) return false
  // Bloquear IPs privadas (169.254.x.x, 10.x.x.x, etc.)
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.)/.test(parsed.hostname)) return false
  return true
}
```

---

## PARTE 7 — SEGURIDAD EN UPLOADS DE ARCHIVOS

```typescript
// ✅ Validar tipo MIME real (no solo extensión)
import fileType from 'file-type'

const MAX_FILE_SIZE = 5 * 1024 * 1024  // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

async function validateUpload(buffer: Buffer, filename: string) {
  // Verificar tamaño
  if (buffer.length > MAX_FILE_SIZE) throw new Error('Archivo demasiado grande')

  // Verificar MIME real (no confiar en la extensión del archivo)
  const detected = await fileType.fromBuffer(buffer)
  if (!detected || !ALLOWED_MIME_TYPES.includes(detected.mime)) {
    throw new Error('Tipo de archivo no permitido')
  }

  // Sanitizar nombre del archivo
  const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_').substring(0, 100)
  return safeName
}

// ✅ En Supabase Storage: nunca hacer público el bucket por defecto
// Usar URLs firmadas con expiración para acceso a archivos privados
const { data } = await supabase.storage
  .from('private-docs')
  .createSignedUrl(filePath, 3600)  // válida 1 hora
```

---

## PARTE 8 — CHECKLIST PRE-DEPLOY A PRODUCCIÓN

Ejecutar obligatoriamente antes de cada deploy a producción:

```
CÓDIGO
□ npm audit (sin vulnerabilidades críticas o altas sin resolver)
□ No hay console.log con datos sensibles en el código
□ No hay API keys hardcodeadas (grep -r "sk_" "pk_live_" src/)
□ Zod/validación en TODOS los endpoints que reciben datos externos
□ Error handlers globales configurados (no exponen stack traces)

AUTENTICACIÓN & AUTORIZACIÓN
□ RLS activo en todas las tablas de Supabase
□ Verificar tabla sin RLS: SELECT tablename FROM pg_tables WHERE rowsecurity = false
□ Rate limiting activo en rutas de auth y APIs críticas
□ Tokens de sesión: HttpOnly + Secure + SameSite configurados
□ Service Role Key: solo usada en server-side, nunca en cliente

INFRAESTRUCTURA
□ Variables de entorno cargadas desde el gestor (Vercel / GitHub Secrets)
□ .env no está en el repositorio (git log --all -- .env)
□ HTTPS forzado (redirect HTTP → HTTPS)
□ Headers de seguridad HTTP configurados (verificar con securityheaders.com)
□ CORS configurado con lista blanca (no "*")

DATOS
□ Datos sensibles en tránsito: HTTPS
□ Datos sensibles en reposo: cifrados en la DB
□ Logs configurados sin datos sensibles
□ Backup automatizado activo

MONITORING
□ Alertas configuradas para: errores 5xx, login fallidos en serie, tráfico anómalo
□ Uptime monitoring activo (UptimeRobot / Better Uptime)
```

---

## PARTE 9 — SEGURIDAD EN AI-ASSISTED DEVELOPMENT

Las herramientas de AI-assisted coding como Cursor y Antigravity crean un entorno de desarrollo altamente capaz pero más expuesto a amenazas de seguridad. Prompt injection, ejecución de código malicioso y ataques a la supply chain han pasado de ser preocupaciones teóricas a realidades documentadas.

**Reglas para desarrollo con IA:**
```
□ NUNCA pegar API keys, secrets o datos de producción en el chat del agente
□ Revisar SIEMPRE el código generado antes de ejecutarlo — no ejecutar ciegamente
□ Código con acceso a filesystem o red: revisión manual obligatoria
□ Dependencias sugeridas por IA: auditar antes de instalar (npm audit)
□ Reglas de seguridad en .cursor/rules o Agent.md para que el agente las respete
□ No ejecutar comandos de terminal generados por IA sin entenderlos primero
```

En lugar de recordar seguridad en cada chat, usar archivos de configuración de reglas que integran los requerimientos de seguridad directamente en el proceso de toma de decisiones del agente, haciendo que el coding seguro sea automático.

---

## PARTE 10 — HERRAMIENTAS RECOMENDADAS POR CAPA

| Capa | Herramienta | Para qué |
|------|------------|---------|
| **Scan de código** | Snyk / Semgrep | SAST — encontrar vulns en el código |
| **Scan de deps** | npm audit / pip-audit / Dependabot | Vulnerabilidades en librerías |
| **Headers HTTP** | securityheaders.com | Verificar headers en producción |
| **SSL/TLS** | ssllabs.com/ssltest | Verificar configuración TLS |
| **Secretos en código** | git-secrets / truffleHog | Detectar secretos committeados |
| **Rate limiting** | Upstash Ratelimit | Rate limiting sin estado (edge) |
| **WAF** | Cloudflare WAF | Capa de protección ante ataques comunes |
| **Monitoring** | Sentry | Errores en producción sin exponer datos |
| **Uptime** | UptimeRobot | Alertas de caída |
| **Pentesting** | OWASP ZAP | Scan activo de vulnerabilidades |
| **Secrets manager** | Doppler / Vercel Env | Gestión de variables en producción |

---

## PARTE 11 — RESTRICCIONES Y ERRORES CRÍTICOS A EVITAR

| Error | Consecuencia | Solución |
|-------|-------------|---------|
| RLS desactivado en alguna tabla | Data leakage entre tenants — el error más costoso | Verificar en cada deploy |
| Service Role Key en frontend | Acceso total a la DB para cualquier usuario | Solo en server-side |
| JWT sin verificar audiencia/issuer | Token forgery attacks | Validar `aud` e `iss` en cada request |
| Secrets en variables NEXT_PUBLIC_ | Expuestos en el bundle del cliente | Solo variables que pueden ser públicas |
| Error messages verbosos al cliente | Information disclosure | Mensajes genéricos al cliente, detalle en logs |
| Sin rate limiting en auth | Brute force attacks | Max 5 intentos / 15 min |
| CORS con `*` | Cross-origin attacks | Lista blanca explícita |
| Cookies sin HttpOnly/Secure | XSS puede robar sesiones | Configurar siempre ambas flags |
| SQL concatenado con input | SQL injection | Siempre queries parametrizadas |
| Uploads sin validar MIME real | Subida de archivos maliciosos | Verificar tipo real del buffer |

---

## HISTORIAL DE VERSIONES

| Versión | Fecha | Cambio |
|---------|-------|--------|
| 1.0.0 | 2026-03-20 | Creación — OWASP Top 10 2025 + GitHub cursor-security-rules + CSA + StackHawk + patrones Supabase multi-tenant |
