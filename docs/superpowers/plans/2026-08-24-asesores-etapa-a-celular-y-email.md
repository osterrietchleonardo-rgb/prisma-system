# Etapa A — El celular obligatorio y el email como llave

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que ningún código de invitación se genere sin nombre, celular y email verificados, y que solo pueda usarlo la persona a la que se lo mandaron.

**Architecture:** Las reglas de validación viven en un módulo puro bajo `lib/invites/`, con tests. El diálogo del director (cliente) y el registro (servidor) usan **las mismas funciones**, así no pueden discrepar. Dos columnas nuevas en `agency_invites` llevan el celular y el email desde el código hasta el perfil. Todo es aditivo: si un código no trae email, se comporta como antes.

**Tech Stack:** Next.js App Router, Supabase (RLS + Management API para el DDL), vitest, libphonenumber-js, shadcn/ui, sonner.

**Spec:** `docs/superpowers/specs/2026-08-24-asesores-celular-y-documentos-design.md`

## Global Constraints

- **Rama y worktree:** se trabaja en `PRISMA-SYSTEM-asesores-docs`, rama `feat/asesores-celular-y-documentos`, salida de `main` @ 2ff67b2. Nunca `git add -A`: se agregan los archivos por nombre.
- **Nada de lo viejo se rompe.** La validación por email aplica **solo cuando el invite trae email**. Los 2 códigos sin usar que existen hoy no lo tienen y tienen que seguir funcionando igual.
- **El modo "crear" del registro no se toca.** Es el camino por el que un director funda una inmobiliaria. Cualquier cambio en `components/auth-register-form.tsx` y en el schema de `register` tiene que dejarlo idéntico.
- **El DDL contra producción necesita el OK explícito de Leonardo** antes de ejecutarse. Las migraciones del repo NO se aplican solas.
- **No se toca `components/shared/ManualContactFields.tsx`.** El campo verificado nace nuevo.
- **Se prueba con PRISMAIA - VAKDOR.** Central es del cliente real y no se toca. Nunca se entra con la cuenta de un asesor real: cuenta descartable o la del director.
- **Teléfonos siempre en E.164 sin `+`** (ej. `5491123456789`), usando `normalizePhoneE164` de `lib/whatsapp/phone.ts`. Emails siempre en minúsculas y sin espacios.
- **Tests:** vitest, y solo corre lo que está en `lib/**/*.test.ts` (ver `vitest.config.ts`). Comando: `npm test`.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/invites/reglas.ts` | **Crear.** Las reglas puras: normalizar, validar, comparar. Sin Supabase, sin React |
| `lib/invites/reglas.test.ts` | **Crear.** Los tests de lo anterior |
| `supabase/migrations/20260824120000_invites_celular_y_email.sql` | **Crear.** Las dos columnas + el tipo de acción nuevo |
| `components/shared/VerifiedPhoneField.tsx` | **Crear.** El campo de celular con doble tipeo, reusable |
| `components/director/NuevoCodigoDialog.tsx` | **Crear.** El formulario único de código nuevo |
| `lib/queries/director.ts` | **Modificar.** `generateAgencyInvite` con celular, email y chequeo de duplicado |
| `app/director/configuracion/page.tsx` | **Modificar.** Usa el diálogo; se saca el input suelto |
| `app/director/asesores/page.tsx` | **Modificar.** Usa el diálogo; se elimina `generateInviteCode`; se edita nombre y celular en la tarjeta |
| `lib/actions/auth.ts` | **Modificar.** Lee las columnas nuevas, valida el email, arma el perfil con los datos del código |
| `components/auth-register-form.tsx` | **Modificar.** El nombre se pide solo en modo "crear" |
| `app/actions/asesores.ts` | **Modificar.** Acción nueva para editar nombre y celular |
| `app/asesor/configuracion/page.tsx` | **Modificar.** El asesor ve su celular en solo lectura |

---

## Task 1: Las reglas del código, en funciones puras con tests

Todo lo que sea "esto es válido / esto no" vive acá, y de acá lo consumen el diálogo del director y el registro del servidor. Es lo único de la Etapa A que se puede testear automáticamente: el resto se prueba en el navegador.

**Files:**
- Create: `lib/invites/reglas.ts`
- Test: `lib/invites/reglas.test.ts`

**Interfaces:**
- Consumes: `normalizePhoneE164` de `lib/whatsapp/phone.ts`
- Produces:
  - `normalizarEmail(raw: string | null | undefined): string`
  - `emailValido(raw: string | null | undefined): boolean`
  - `type DatosNuevoCodigo = { nombre: string; email: string; emailConfirm: string; phone: string; phoneConfirm: string; country: CountryCode }`
  - `type ResultadoValidacion = { ok: true; datos: { nombre: string; email: string; phone: string } } | { ok: false; error: string }`
  - `validarNuevoCodigo(d: DatosNuevoCodigo): ResultadoValidacion`
  - `emailCoincideConInvite(inviteEmail: string | null | undefined, emailDeRegistro: string): boolean`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/invites/reglas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  normalizarEmail,
  emailValido,
  validarNuevoCodigo,
  emailCoincideConInvite,
  type DatosNuevoCodigo,
} from "./reglas";

const BASE: DatosNuevoCodigo = {
  nombre: "Juan Pérez",
  email: "juan@central.com",
  emailConfirm: "juan@central.com",
  phone: "11 2345-6789",
  phoneConfirm: "011 15 2345 6789",
  country: "AR",
};

describe("normalizarEmail", () => {
  it("saca espacios y pasa a minúsculas", () => {
    expect(normalizarEmail("  Juan@Central.COM ")).toBe("juan@central.com");
  });

  it("devuelve string vacío si no hay nada", () => {
    expect(normalizarEmail(null)).toBe("");
    expect(normalizarEmail(undefined)).toBe("");
  });
});

describe("emailValido", () => {
  it("acepta un email normal", () => {
    expect(emailValido("juan@central.com")).toBe(true);
  });

  it("rechaza uno sin dominio completo", () => {
    expect(emailValido("juan@central")).toBe(false);
  });

  it("rechaza uno con espacios adentro", () => {
    expect(emailValido("juan perez@central.com")).toBe(false);
  });

  it("rechaza vacío", () => {
    expect(emailValido("")).toBe(false);
  });
});

describe("validarNuevoCodigo", () => {
  it("acepta el caso feliz y devuelve el celular en E.164 sin +", () => {
    const r = validarNuevoCodigo(BASE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.nombre).toBe("Juan Pérez");
      expect(r.datos.email).toBe("juan@central.com");
      expect(r.datos.phone).toBe("5491123456789");
    }
  });

  it("acepta que el celular se escriba distinto en los dos campos si es el mismo número", () => {
    // "11 2345-6789" y "011 15 2345 6789" son el mismo número argentino.
    const r = validarNuevoCodigo(BASE);
    expect(r.ok).toBe(true);
  });

  it("rechaza si falta el nombre", () => {
    const r = validarNuevoCodigo({ ...BASE, nombre: "   " });
    expect(r).toEqual({ ok: false, error: "Escribí el nombre de la persona que vas a invitar" });
  });

  it("rechaza un nombre de menos de 3 letras", () => {
    const r = validarNuevoCodigo({ ...BASE, nombre: "Jo" });
    expect(r.ok).toBe(false);
  });

  it("rechaza si el email no tiene formato válido", () => {
    const r = validarNuevoCodigo({ ...BASE, email: "juan@central", emailConfirm: "juan@central" });
    expect(r).toEqual({ ok: false, error: "El email no parece válido" });
  });

  it("rechaza si los dos emails no coinciden", () => {
    const r = validarNuevoCodigo({ ...BASE, emailConfirm: "juan@centrall.com" });
    expect(r).toEqual({ ok: false, error: "Los dos emails no coinciden" });
  });

  it("compara los emails sin importar mayúsculas ni espacios", () => {
    const r = validarNuevoCodigo({ ...BASE, emailConfirm: "  JUAN@Central.com  " });
    expect(r.ok).toBe(true);
  });

  it("rechaza un celular que no es un número real", () => {
    const r = validarNuevoCodigo({ ...BASE, phone: "123", phoneConfirm: "123" });
    expect(r).toEqual({ ok: false, error: "El celular no parece válido para el país elegido" });
  });

  it("rechaza si los dos celulares son números distintos", () => {
    const r = validarNuevoCodigo({ ...BASE, phoneConfirm: "11 2345-6780" });
    expect(r).toEqual({ ok: false, error: "Los dos celulares no coinciden" });
  });
});

describe("emailCoincideConInvite", () => {
  it("coincide ignorando mayúsculas y espacios", () => {
    expect(emailCoincideConInvite("juan@central.com", "  JUAN@Central.COM ")).toBe(true);
  });

  it("no coincide si es otro email", () => {
    expect(emailCoincideConInvite("juan@central.com", "pedro@central.com")).toBe(false);
  });

  it("los códigos viejos, sin email, dejan pasar a cualquiera", () => {
    // Regla del spec §5.5: la validación aplica solo cuando el invite trae email.
    expect(emailCoincideConInvite(null, "pedro@central.com")).toBe(true);
    expect(emailCoincideConInvite("", "pedro@central.com")).toBe(true);
    expect(emailCoincideConInvite("   ", "pedro@central.com")).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npx vitest run lib/invites/reglas.test.ts
```

Esperado: FALLA con `Failed to resolve import "./reglas"`.

- [ ] **Step 3: Escribir la implementación mínima**

Crear `lib/invites/reglas.ts`:

```ts
import { normalizePhoneE164 } from "@/lib/whatsapp/phone"
import type { CountryCode } from "libphonenumber-js"

/**
 * Las reglas de un código de invitación, en funciones puras.
 *
 * Viven acá y no adentro del formulario porque las usan los dos lados: el diálogo
 * del director (navegador) y el registro (servidor). Si cada uno tuviera su copia,
 * tarde o temprano dirían cosas distintas sobre el mismo dato.
 */

/** Minúsculas y sin espacios. Es la forma en que el email se guarda y se compara, siempre. */
export function normalizarEmail(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toLowerCase()
}

// Mismo criterio que usa ManualContactFields: algo, arroba, algo, punto, algo.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function emailValido(raw: string | null | undefined): boolean {
  return EMAIL_REGEX.test(normalizarEmail(raw))
}

export type DatosNuevoCodigo = {
  nombre: string
  email: string
  emailConfirm: string
  phone: string
  phoneConfirm: string
  country: CountryCode
}

export type ResultadoValidacion =
  | { ok: true; datos: { nombre: string; email: string; phone: string } }
  | { ok: false; error: string }

/**
 * Valida todo lo que hace falta para generar un código, y devuelve los datos ya
 * normalizados y listos para guardar. El primer error que encuentra es el que
 * devuelve: al director le sirve más una frase concreta que una lista.
 */
export function validarNuevoCodigo(d: DatosNuevoCodigo): ResultadoValidacion {
  const nombre = d.nombre.trim()
  if (!nombre) return { ok: false, error: "Escribí el nombre de la persona que vas a invitar" }
  if (nombre.length < 3) return { ok: false, error: "El nombre es demasiado corto" }

  const email = normalizarEmail(d.email)
  if (!emailValido(email)) return { ok: false, error: "El email no parece válido" }
  if (email !== normalizarEmail(d.emailConfirm)) {
    return { ok: false, error: "Los dos emails no coinciden" }
  }

  // Se comparan los números normalizados, no el texto: "11 2345-6789" y
  // "011 15 2345 6789" son el mismo celular y tienen que dar iguales.
  const phone = normalizePhoneE164(d.phone, d.country)
  if (!phone) return { ok: false, error: "El celular no parece válido para el país elegido" }
  if (phone !== normalizePhoneE164(d.phoneConfirm, d.country)) {
    return { ok: false, error: "Los dos celulares no coinciden" }
  }

  return { ok: true, datos: { nombre, email, phone } }
}

/**
 * ¿El que se está registrando es la persona a la que se le mandó el código?
 *
 * Si el código no trae email es uno viejo, anterior a esta función: no hay contra
 * qué validar, así que se comporta como antes y deja pasar. (Spec §5.5)
 */
export function emailCoincideConInvite(
  inviteEmail: string | null | undefined,
  emailDeRegistro: string
): boolean {
  const esperado = normalizarEmail(inviteEmail)
  if (!esperado) return true
  return esperado === normalizarEmail(emailDeRegistro)
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npx vitest run lib/invites/reglas.test.ts
```

Esperado: PASA, 18 tests en verde.

- [ ] **Step 5: Correr la suite completa para confirmar que no se rompió nada**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npm test
```

Esperado: todo verde. Si algo falla que no sea `lib/invites/`, es preexistente: anotarlo y no arreglarlo acá.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs"
git add lib/invites/reglas.ts lib/invites/reglas.test.ts
git commit -m "feat(invites): las reglas del código, en un solo lugar y con tests

El diálogo del director y el registro del servidor tienen que decir lo mismo
sobre el mismo dato. Por eso normalizar, validar y comparar viven acá y no
adentro del formulario.

La regla que importa: un código sin email deja pasar a cualquiera, porque es
uno viejo y no hay contra qué validar.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: La migración — dos columnas y un tipo de acción nuevo

**Files:**
- Create: `supabase/migrations/20260824120000_invites_celular_y_email.sql`

**Interfaces:**
- Produces: las columnas `agency_invites.invitee_phone` e `agency_invites.invitee_email`, y el valor `'edicion_datos'` aceptado en `equipo_acciones.tipo_accion`.

**Contexto verificado:** el `CHECK` que hoy corre en producción es
`tipo_accion IN ('pausa','reanudacion','desvinculacion','eliminacion_definitiva')`.
El archivo de migración del repo está desactualizado (le falta el cuarto valor), así que
**la migración nueva tiene que recrear el constraint con la lista completa**, no asumir
lo que dice el repo.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260824120000_invites_celular_y_email.sql`:

```sql
-- ─────────────────────────────────────────────────────────────
-- El código de invitación pasa a llevar el celular y el email del invitado.
--
-- Por qué: hoy nadie valida que quien usa un código sea la persona invitada.
-- El registro ni siquiera lee invitee_name y le pone al perfil el nombre que
-- tipeó quien se registró. Con el email en el código, el código deja de ser
-- transferible: solo sirve para esa dirección.
--
-- 100% aditivo:
--  - Las dos columnas son nullables. Los códigos ya emitidos quedan en NULL y
--    siguen funcionando exactamente como antes (sin email no hay qué validar).
--  - No se toca ninguna política de RLS.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.agency_invites
  ADD COLUMN IF NOT EXISTS invitee_phone text,
  ADD COLUMN IF NOT EXISTS invitee_email text;

COMMENT ON COLUMN public.agency_invites.invitee_phone
  IS 'Celular del invitado en E.164 sin "+" (ej. 5491123456789). Pasa a profiles.phone al registrarse.';
COMMENT ON COLUMN public.agency_invites.invitee_email
  IS 'Email del invitado, en minúsculas. Es la llave: solo puede usar el código quien se registre con esta dirección.';

-- Búsqueda por email al chequear duplicados antes de generar un código.
CREATE INDEX IF NOT EXISTS agency_invites_invitee_email_idx
  ON public.agency_invites (invitee_email);

-- ─────────────────────────────────────────────────────────────
-- equipo_acciones: sumar 'edicion_datos'.
--
-- Cuando el director corrige el nombre o el celular de un asesor, queda la
-- constancia igual que con pausar y desvincular.
--
-- OJO: se recrea el CHECK con la lista COMPLETA que corre hoy en producción
-- (verificada por Management API el 2026-08-24), no con la del archivo viejo
-- del repo, que quedó sin 'eliminacion_definitiva'.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.equipo_acciones
  DROP CONSTRAINT IF EXISTS equipo_acciones_tipo_accion_check;

ALTER TABLE public.equipo_acciones
  ADD CONSTRAINT equipo_acciones_tipo_accion_check
  CHECK (tipo_accion IN (
    'pausa',
    'reanudacion',
    'desvinculacion',
    'eliminacion_definitiva',
    'edicion_datos'
  ));
```

- [ ] **Step 2: PARAR y pedirle el OK a Leonardo**

Este paso escribe en la base de producción. **No se ejecuta sin su OK explícito.**

Mostrarle exactamente esto:

- **Qué cambia:** dos columnas nuevas en `agency_invites` (`invitee_phone`, `invitee_email`), un índice sobre el email, y un valor más en la lista de tipos de acción de `equipo_acciones`.
- **Qué NO cambia:** ninguna fila existente, ninguna política de RLS, ninguna columna existente.
- **Si sale mal:** las columnas se sacan con `ALTER TABLE public.agency_invites DROP COLUMN invitee_phone, DROP COLUMN invitee_email;` y el constraint se recrea sin `'edicion_datos'`. Nada de lo que hay hoy depende de esto.

- [ ] **Step 3: Aplicar la migración con la Management API**

Solo después del OK. Desde el worktree:

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && node -e "
const fs=require('fs');
const env=Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^[\"']|[\"']\$/g,'')]}));
const sql=fs.readFileSync('supabase/migrations/20260824120000_invites_celular_y_email.sql','utf8');
fetch('https://api.supabase.com/v1/projects/'+env.SUPABASE_PROJECT_REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.SUPABASE_API_KEY_MANAGEMENT,'Content-Type':'application/json'},body:JSON.stringify({query:sql})}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d)));
"
```

Esperado: `[]` (el DDL no devuelve filas).

- [ ] **Step 4: Verificar contra producción que quedó**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && node -e "
const fs=require('fs');
const env=Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^[\"']|[\"']\$/g,'')]}));
const sql=\"select column_name from information_schema.columns where table_name='agency_invites' and column_name in ('invitee_phone','invitee_email') union all select pg_get_constraintdef(oid) from pg_constraint where conname='equipo_acciones_tipo_accion_check'\";
fetch('https://api.supabase.com/v1/projects/'+env.SUPABASE_PROJECT_REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.SUPABASE_API_KEY_MANAGEMENT,'Content-Type':'application/json'},body:JSON.stringify({query:sql})}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d,null,1)));
"
```

Esperado: las dos columnas listadas y el `CHECK` con los **cinco** valores, incluido `edicion_datos`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs"
git add supabase/migrations/20260824120000_invites_celular_y_email.sql
git commit -m "feat(db): el código de invitación lleva celular y email

Las dos columnas son nullables a propósito: los códigos ya emitidos quedan en
NULL y siguen funcionando como antes.

El CHECK de equipo_acciones se recrea con la lista completa que corre HOY en
producción (verificada por Management API), no con la del archivo viejo del
repo, que había quedado sin eliminacion_definitiva.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `generateAgencyInvite` guarda los datos nuevos y rechaza duplicados

**Files:**
- Modify: `lib/queries/director.ts:299-330` (la función `generateAgencyInvite`)

**Interfaces:**
- Consumes: `normalizarEmail`, `emailValido` de `lib/invites/reglas.ts` (Task 1); las columnas de la Task 2.
- Produces: `generateAgencyInvite(agencyId: string, role: "director" | "asesor", inviteeName: string, inviteePhone: string, inviteeEmail: string)` — **los cinco parámetros son obligatorios**. Lanza `Error` con mensaje legible si algo falta o si el email ya tiene cuenta.

**Nota:** este archivo corre en el navegador (importa `@/lib/supabase`, el cliente de browser), así que las consultas van con la sesión del director y las políticas de RLS que ya existen. No se cambia eso.

- [ ] **Step 1: Reemplazar la función**

En `lib/queries/director.ts`, reemplazar `generateAgencyInvite` entera por:

```ts
export async function generateAgencyInvite(
  agencyId: string,
  role: "director" | "asesor",
  inviteeName: string,
  inviteePhone: string,
  inviteeEmail: string
) {
  const supabase = createClient()

  // El rol del código define qué será la persona al registrarse.
  const safeRole = role === "director" ? "director" : "asesor"

  const nombre = inviteeName.trim()
  const phone = inviteePhone.trim()
  const email = normalizarEmail(inviteeEmail)

  // Última barrera. La validación de verdad la hace el diálogo con
  // validarNuevoCodigo(), pero esta función es pública y no puede confiar en
  // que la llamen bien.
  if (!nombre) throw new Error("Falta el nombre del invitado")
  if (!phone) throw new Error("Falta el celular del invitado")
  if (!emailValido(email)) throw new Error("Falta un email válido del invitado")

  // Que no se genere un código para alguien que ya tiene cuenta acá. Es más
  // barato negarlo ahora que borrar un perfil duplicado después.
  const { data: yaExiste } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("agency_id", agencyId)
    .ilike("email", email)
    .maybeSingle()

  if (yaExiste) {
    throw new Error(
      `Ese email ya tiene cuenta en tu inmobiliaria${yaExiste.full_name ? `: ${yaExiste.full_name}` : ""}`
    )
  }

  // Get agency name prefix for the code
  const { data: agency } = await supabase
    .from("agencies")
    .select("name")
    .eq("id", agencyId)
    .single()

  const prefix = (agency?.name?.substring(0, 6).toUpperCase() || "PRISMA").replace(/\s/g, "")
  const random = Math.random().toString(36).substring(2, 5).toUpperCase()
  const year = new Date().getFullYear()
  const roleTag = safeRole === "director" ? "DIR" : "ASE"
  const code = `${prefix}-${roleTag}-${year}-${random}`

  const { data, error } = await supabase
    .from("agency_invites")
    .insert({
      agency_id: agencyId,
      code,
      role: safeRole,
      invitee_name: nombre,
      invitee_phone: phone,
      invitee_email: email,
    })
    .select()

  if (error) throw error
  return data[0]
}
```

- [ ] **Step 2: Agregar el import arriba del archivo**

En la primera línea de `lib/queries/director.ts`, debajo del import existente:

```ts
import { createClient } from "@/lib/supabase"
import { emailValido, normalizarEmail } from "@/lib/invites/reglas"
```

- [ ] **Step 3: Verificar que TypeScript no se queja de las llamadas viejas**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npx tsc --noEmit 2>&1 | head -20
```

Esperado: **falla** en `app/director/configuracion/page.tsx`, porque ahí todavía se la llama con 3 argumentos. Eso está bien: es exactamente lo que la Task 4 va a arreglar, y confirma que el compilador nos protege de dejar un llamador viejo suelto. Anotar la línea exacta que reporta.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs"
git add lib/queries/director.ts
git commit -m "feat(invites): generar un código exige nombre, celular y email

Y se niega si ese email ya tiene cuenta en la inmobiliaria: es más barato
negarlo ahora que borrar un perfil duplicado después.

Los cinco parámetros son obligatorios a propósito. Deja el build roto en
configuracion/page.tsx hasta que se conecte el diálogo nuevo, que es la forma
de garantizar que no quede ningún llamador viejo generando códigos pelados.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: El campo de celular verificado y el diálogo, conectados en Configuración

Acá aparece la primera pantalla que se puede abrir y probar.

**Files:**
- Create: `components/shared/VerifiedPhoneField.tsx`
- Create: `components/director/NuevoCodigoDialog.tsx`
- Modify: `app/director/configuracion/page.tsx` (la función `generateCode:334` y `renderInviteSection:381`)

**Interfaces:**
- Consumes: `validarNuevoCodigo`, `type DatosNuevoCodigo` de `lib/invites/reglas.ts`; `generateAgencyInvite` con su firma nueva; `normalizePhoneE164`, `formatPhoneInternational`, `getPhoneCountries` de `lib/whatsapp/phone.ts`.
- Produces:
  - `<VerifiedPhoneField value={{phone, phoneConfirm, country}} onChange={(v) => void} disabled?: boolean />`
  - `<NuevoCodigoDialog open agencyId role onOpenChange onCreated />` — llama `onCreated()` después de generar, para que la pantalla recargue su lista.

- [ ] **Step 1: Crear el campo de celular**

Crear `components/shared/VerifiedPhoneField.tsx`:

```tsx
"use client";

import React, { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Check, AlertCircle } from "lucide-react";
import type { CountryCode } from "libphonenumber-js";
import {
  normalizePhoneE164,
  formatPhoneInternational,
  getPhoneCountries,
} from "@/lib/whatsapp/phone";

export interface VerifiedPhoneValue {
  phone: string;
  phoneConfirm: string;
  country: CountryCode;
}

interface Props {
  value: VerifiedPhoneValue;
  onChange: (v: VerifiedPhoneValue) => void;
  disabled?: boolean;
}

// El celular se escribe dos veces y no se puede pegar. Es la misma regla que
// usa el alta manual de contactos: un número mal tipeado no se nota hasta que
// alguien intenta llamar y no atiende nadie.
const blockPaste = (e: React.ClipboardEvent | React.DragEvent) => e.preventDefault();

export function VerifiedPhoneField({ value, onChange, disabled }: Props) {
  const countries = useMemo(() => getPhoneCountries("es"), []);
  const countryOptions = useMemo(
    () =>
      countries.map((c) => ({
        value: c.iso,
        label: `${c.flag} ${c.name}`,
        description: `+${c.callingCode}`,
      })),
    [countries]
  );

  // Se comparan los números normalizados, no el texto: "11 2345-6789" y
  // "011 15 2345 6789" son el mismo celular.
  const e164 = normalizePhoneE164(value.phone, value.country);
  const e164Confirm = normalizePhoneE164(value.phoneConfirm, value.country);
  const preview = formatPhoneInternational(value.phone, value.country);
  const coincide = !!e164 && e164 === e164Confirm;
  const escribioConfirmacion = value.phoneConfirm.trim() !== "";

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="vpf-country">País</Label>
        {/* OJO: la prop se llama onChange, no onValueChange. Verificado en
            components/ui/searchable-select.tsx:19. */}
        <SearchableSelect
          options={countryOptions}
          value={value.country}
          onChange={(iso) => onChange({ ...value, country: iso as CountryCode })}
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="vpf-phone">Celular</Label>
        <Input
          id="vpf-phone"
          inputMode="tel"
          placeholder="11 2345-6789"
          value={value.phone}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, phone: e.target.value })}
        />
        {preview && (
          <p className="text-xs text-muted-foreground">Se va a guardar como {preview}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="vpf-phone-confirm">Repetí el celular</Label>
        <Input
          id="vpf-phone-confirm"
          inputMode="tel"
          placeholder="Escribilo de nuevo"
          value={value.phoneConfirm}
          disabled={disabled}
          onPaste={blockPaste}
          onDrop={blockPaste}
          onChange={(e) => onChange({ ...value, phoneConfirm: e.target.value })}
        />
        {escribioConfirmacion && (
          <p
            className={`text-xs flex items-center gap-1 ${
              coincide ? "text-green-600" : "text-destructive"
            }`}
          >
            {coincide ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
            {coincide ? "Coinciden" : "Todavía no coinciden"}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Crear el diálogo**

Crear `components/director/NuevoCodigoDialog.tsx`:

```tsx
"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Check, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { CountryCode } from "libphonenumber-js";
import { VerifiedPhoneField, type VerifiedPhoneValue } from "@/components/shared/VerifiedPhoneField";
import { validarNuevoCodigo, normalizarEmail } from "@/lib/invites/reglas";
import { generateAgencyInvite } from "@/lib/queries/director";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencyId: string;
  /** Lo fija la pantalla que abre el diálogo. Acá NO se elige ni se muestra. */
  role: "asesor" | "director";
  /** Se llama después de generar, para que la pantalla recargue su lista. */
  onCreated: (code: string) => void;
}

const blockPaste = (e: React.ClipboardEvent | React.DragEvent) => e.preventDefault();

const PHONE_VACIO: VerifiedPhoneValue = { phone: "", phoneConfirm: "", country: "AR" as CountryCode };

export function NuevoCodigoDialog({ open, onOpenChange, agencyId, role, onCreated }: Props) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [emailConfirm, setEmailConfirm] = useState("");
  const [phone, setPhone] = useState<VerifiedPhoneValue>(PHONE_VACIO);
  const [guardando, setGuardando] = useState(false);

  const validacion = validarNuevoCodigo({
    nombre,
    email,
    emailConfirm,
    phone: phone.phone,
    phoneConfirm: phone.phoneConfirm,
    country: phone.country,
  });

  const emailCoincide =
    normalizarEmail(email) !== "" && normalizarEmail(email) === normalizarEmail(emailConfirm);
  const escribioConfirmacion = emailConfirm.trim() !== "";

  const limpiar = () => {
    setNombre("");
    setEmail("");
    setEmailConfirm("");
    setPhone(PHONE_VACIO);
  };

  const confirmar = async () => {
    if (!validacion.ok) {
      toast.error(validacion.error);
      return;
    }
    try {
      setGuardando(true);
      const invite = await generateAgencyInvite(
        agencyId,
        role,
        validacion.datos.nombre,
        validacion.datos.phone,
        validacion.datos.email
      );
      toast.success(`Código generado para ${validacion.datos.nombre}`);
      limpiar();
      onOpenChange(false);
      onCreated(invite.code);
    } catch (e: unknown) {
      // El mensaje real importa: puede ser "ese email ya tiene cuenta".
      toast.error(e instanceof Error ? e.message : "No se pudo generar el código");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) limpiar();
        onOpenChange(v);
      }}
    >
      <DialogContent className="bg-card border-accent/20 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            Invitar a un {role === "director" ? "director" : "asesor"}
          </DialogTitle>
          <DialogDescription>
            El código solo va a servirle a la persona que uses acá. Con estos datos ya queda
            armado su perfil el día que entre.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="nc-nombre">Nombre y apellido</Label>
            <Input
              id="nc-nombre"
              placeholder="Juan Pérez"
              value={nombre}
              disabled={guardando}
              onChange={(e) => setNombre(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Así va a figurar en tu equipo. No lo puede cambiar al registrarse.
            </p>
          </div>

          <VerifiedPhoneField value={phone} onChange={setPhone} disabled={guardando} />

          <div className="space-y-2">
            <Label htmlFor="nc-email">Email</Label>
            <Input
              id="nc-email"
              type="email"
              placeholder="nombre@ejemplo.com"
              value={email}
              disabled={guardando}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Es la llave del código: solo se va a poder registrar con este email.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nc-email-confirm">Repetí el email</Label>
            <Input
              id="nc-email-confirm"
              type="email"
              placeholder="Escribilo de nuevo"
              value={emailConfirm}
              disabled={guardando}
              onPaste={blockPaste}
              onDrop={blockPaste}
              onChange={(e) => setEmailConfirm(e.target.value)}
            />
            {escribioConfirmacion && (
              <p
                className={`text-xs flex items-center gap-1 ${
                  emailCoincide ? "text-green-600" : "text-destructive"
                }`}
              >
                {emailCoincide ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                {emailCoincide ? "Coinciden" : "Todavía no coinciden"}
              </p>
            )}
          </div>

          {!validacion.ok && (nombre || email || phone.phone) ? (
            <p className="text-xs text-muted-foreground">{validacion.error}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!validacion.ok || guardando} className="bg-accent gap-2">
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
            Generar código
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Conectarlo en Configuración**

En `app/director/configuracion/page.tsx`:

1. Agregar el import junto a los demás:

```tsx
import { NuevoCodigoDialog } from "@/components/director/NuevoCodigoDialog"
```

2. Reemplazar el estado `inviteeName` (línea 88) por el del diálogo:

```tsx
// Qué rol se está invitando en el diálogo abierto. null = cerrado.
const [dialogoRol, setDialogoRol] = useState<"asesor" | "director" | null>(null)
```

3. Reemplazar la función `generateCode` (línea 334) por el recargador de la lista:

```tsx
const recargarInvites = async () => {
  if (!profile.agency_id) return
  const codes = await getAgencyInvites(profile.agency_id)
  setInviteCodes(codes)
}
```

4. En `renderInviteSection` (línea 381), reemplazar el input de nombre y su botón por un solo botón:

```tsx
<Button
  onClick={() => setDialogoRol(role)}
  disabled={loading}
  variant="outline"
  className="gap-2 border-accent/20 text-accent hover:bg-accent/10 shrink-0"
>
  Generar código de {role === "director" ? "director" : "asesor"}
</Button>
```

5. Antes del cierre del componente, montar el diálogo una sola vez:

```tsx
{profile.agency_id && dialogoRol && (
  <NuevoCodigoDialog
    open={!!dialogoRol}
    onOpenChange={(v) => setDialogoRol(v ? dialogoRol : null)}
    agencyId={profile.agency_id}
    role={dialogoRol}
    onCreated={recargarInvites}
  />
)}
```

6. Borrar el texto de la línea 436 que dice "Escribí un nombre y generá uno" y dejar solo "No hay códigos de … todavía."

- [ ] **Step 4: Compilar**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npx tsc --noEmit 2>&1 | head -20
```

Esperado: sin errores. El que aparecía en la Task 3 ya no está.

- [ ] **Step 5: Probarlo en el navegador**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npm run dev -- -p 3010
```

Entrar con la cuenta de director de **PRISMAIA - VAKDOR** a `http://localhost:3010/director/configuracion` y comprobar:

1. El botón abre el diálogo y **no muestra ningún selector de rol**.
2. Con el nombre solo, "Generar código" está apagado.
3. Escribir un celular distinto en los dos campos → dice "Todavía no coinciden" y el botón sigue apagado.
4. Escribir `11 2345-6789` y `011 15 2345 6789` → dice "Coinciden" (es el mismo número).
5. En el campo de repetir el email, **Ctrl+V no pega nada**.
6. Con los tres campos bien, genera el código y aparece en la lista.
7. Generar otro con el email de un asesor que ya existe → sale el error diciendo quién lo usa, y **no se crea el código**.
8. Repetir todo en celular emulado (DevTools → dispositivo, no achicando la ventana).

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs"
git add components/shared/VerifiedPhoneField.tsx components/director/NuevoCodigoDialog.tsx app/director/configuracion/page.tsx
git commit -m "feat(invites): el formulario único de código nuevo, con celular y email verificados

El diálogo no pregunta el rol: se lo pasa la pantalla que lo abre. Así la
página de Asesores no va a poder generar códigos de director aunque quiera.

El email va con doble tipeo igual que el celular porque dejó de ser un dato de
contacto: es una credencial. Un typo ahí no molesta, deja a una persona sin
poder registrarse con un código quemado.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: La página de Asesores usa el mismo formulario, y se tapa la puerta trasera

**Files:**
- Modify: `app/director/asesores/page.tsx:340-356` (eliminar `generateInviteCode`), `:429-469` (el modal)

**Interfaces:**
- Consumes: `NuevoCodigoDialog` (Task 4).

- [ ] **Step 1: Eliminar la generación de código al azar**

En `app/director/asesores/page.tsx`, **borrar entera** la función `generateInviteCode` (línea 340). Es la que hoy inserta un código de 8 caracteres sin nombre, sin celular y sin email.

- [ ] **Step 2: Agregar el import y el estado**

```tsx
import { NuevoCodigoDialog } from "@/components/director/NuevoCodigoDialog"
```

Junto a los demás `useState`:

```tsx
const [dialogoCodigoAbierto, setDialogoCodigoAbierto] = useState(false)
```

- [ ] **Step 3: Reemplazar el cuerpo del modal "Invitar al equipo"**

El `<Dialog>` que hoy contiene el código y el botón "Regenerar" pasa a mostrar solo el último código libre y un botón que abre el diálogo compartido. Reemplazar el `<DialogContent>` (línea 431) por:

```tsx
<DialogContent className="bg-card border-accent/20">
  <DialogHeader>
    <DialogTitle className="text-xl font-bold">Invitar al equipo</DialogTitle>
    <DialogDescription>
      Cada código se genera para una persona concreta y solo le sirve a ella.
    </DialogDescription>
  </DialogHeader>

  <div className="space-y-6 py-4">
    {inviteCode ? (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Último código libre</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-accent/5 p-3 rounded-xl border border-accent/20 font-mono text-center text-lg font-bold tracking-widest text-accent">
            {inviteCode}
          </div>
          <Button variant="outline" size="icon" className="h-12 w-12" onClick={copyToClipboard}>
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    ) : (
      <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
        <QrCode className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No hay ningún código libre.</p>
      </div>
    )}

    <Button
      className="w-full bg-accent gap-2"
      onClick={() => {
        setIsInviteModalOpen(false)
        setDialogoCodigoAbierto(true)
      }}
    >
      <UserPlus className="h-4 w-4" />
      Generar código para un asesor
    </Button>
  </div>

  <DialogFooter>
    <Button variant="secondary" className="w-full" onClick={() => setIsInviteModalOpen(false)}>
      Listo
    </Button>
  </DialogFooter>
</DialogContent>
```

- [ ] **Step 4: Montar el diálogo compartido**

Al final del componente, antes del cierre del `<div>` principal:

```tsx
{agencyId && (
  <NuevoCodigoDialog
    open={dialogoCodigoAbierto}
    onOpenChange={setDialogoCodigoAbierto}
    agencyId={agencyId}
    role="asesor"
    onCreated={(code) => setInviteCode(code)}
  />
)}
```

El `role="asesor"` está escrito a mano y no sale de ningún estado: desde esta pantalla **no hay forma** de generar un código de director.

- [ ] **Step 5: Compilar y probar**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npx tsc --noEmit 2>&1 | head -20
```

Esperado: sin errores. Si aparece un `RefreshCcw is declared but never read`, sacar ese import.

En el navegador, en `/director/asesores`: abrir "Invitar al equipo" → "Generar código para un asesor" → sale el mismo diálogo que en Configuración, sin selector de rol. Generar uno y comprobar que aparece en la lista de Configuración con nombre, y que su formato es `VAKDOR-ASE-2026-XXX` y no 8 letras sueltas.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs"
git add app/director/asesores/page.tsx
git commit -m "fix(invites): la página de Asesores deja de ser la puerta trasera

Generaba códigos de 8 caracteres al azar, sin nombre, sin rol elegido y sin
pasar por ninguna regla. Ahora abre el mismo formulario que Configuración, con
el rol fijo en asesor.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: El registro valida el email y arma el perfil con los datos del código

**Files:**
- Modify: `lib/actions/auth.ts:10-19` (el schema), `:85-98` (la consulta del invite), `:118-135` (el upsert del perfil), `:180-186` (la rama "unirme")
- Modify: `components/auth-register-form.tsx:110-115` (el campo de nombre)

**Interfaces:**
- Consumes: `emailCoincideConInvite` de `lib/invites/reglas.ts` (Task 1); las columnas de la Task 2.

- [ ] **Step 1: Hacer el nombre condicional en el schema**

En `lib/actions/auth.ts`, reemplazar `registerSchema` (línea 10) por:

```ts
const registerSchema = z
  .object({
    // Opcional a nivel de tipo, obligatorio solo en modo "crear": quien se une
    // con un código ya no tipea su nombre, se lo define su inmobiliaria.
    fullName: z.string().optional(),
    email: z.string().email("Email inválido"),
    password: z.string().min(6, "Mínimo 6 caracteres"),
    // "crear" = funda una inmobiliaria nueva (requiere código de Vakdor/admin).
    // "unirme" = entra a una inmobiliaria existente; el rol lo define el código.
    mode: z.enum(["crear", "unirme"]),
    agencyName: z.string().optional(),
    inviteCode: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.mode === "crear" && (d.fullName ?? "").trim().length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fullName"],
        message: "Mínimo 3 caracteres",
      })
    }
  })
```

- [ ] **Step 2: Traer los datos nuevos del invite y validar el email**

Reemplazar el bloque `else` de validación del código (línea 85, el que hoy hace `.select('agency_id, is_used, role')`) por:

```ts
      if (!data.inviteCode) return { error: "Código de invitación obligatorio" }

      const { data: invite, error: findError } = await adminClient
        .from('agency_invites')
        .select('agency_id, is_used, role, invitee_name, invitee_phone, invitee_email')
        .eq('code', data.inviteCode)
        .single()

      if (findError || !invite) return { error: "Código incorrecto" }
      if (invite.is_used) return { error: "Este código ya fue utilizado" }

      // La llave. Si el código trae email, solo sirve para esa dirección.
      // Se corta ANTES de crear el usuario, así el código no se consume.
      if (!emailCoincideConInvite(invite.invitee_email, data.email)) {
        return { error: "Este código no corresponde a este email." }
      }

      validAgencyInvite = {
        agency_id: invite.agency_id,
        role: invite.role === 'director' ? 'director' : 'asesor',
        invitee_name: invite.invitee_name,
        invitee_phone: invite.invitee_phone,
      }
      finalRole = validAgencyInvite.role
```

Y ampliar el tipo de la variable, unas líneas más arriba (línea 66):

```ts
    let validAgencyInvite: {
      agency_id: string
      role: 'director' | 'asesor'
      invitee_name: string | null
      invitee_phone: string | null
    } | null = null
```

- [ ] **Step 3: Agregar el import**

Junto a los imports de arriba del archivo:

```ts
import { emailCoincideConInvite } from "@/lib/invites/reglas"
```

- [ ] **Step 4: Que el perfil se arme con los datos del código**

Justo antes del `supabase.auth.signUp` (línea 102), agregar:

```ts
    // El nombre del código manda. Si es un código viejo que no lo trae, cae en lo
    // que haya tipeado la persona; y si tampoco hay, en la parte del email antes
    // del arroba, para no dejar el perfil sin nombre. El director lo corrige
    // después desde la tarjeta del asesor.
    const nombreFinal =
      validAgencyInvite?.invitee_name?.trim() ||
      data.fullName?.trim() ||
      data.email.split("@")[0]
```

Reemplazar en el `signUp` `full_name: data.fullName` por `full_name: nombreFinal`, y lo mismo en **los dos** `upsert` de `profiles` (el original y el reintento, líneas 120 y 130).

- [ ] **Step 5: Guardar el celular al vincular**

En la rama `mode === 'unirme'` (línea 180), reemplazar el update por:

```ts
    } else if (data.mode === 'unirme' && validAgencyInvite) {
      const { error: asesorLinkError } = await adminClient
        .from('profiles')
        .update({
          agency_id: validAgencyInvite.agency_id,
          role: finalRole,
          full_name: nombreFinal,
          // Solo se pisa si el código lo trae: un código viejo no tiene que
          // borrarle el teléfono a nadie.
          ...(validAgencyInvite.invitee_phone
            ? { phone: validAgencyInvite.invitee_phone }
            : {}),
        })
        .eq('id', userId)
```

- [ ] **Step 6: Esconder el campo de nombre cuando alguien se une**

En `components/auth-register-form.tsx`, envolver el bloque del nombre (línea 111-115) para que se muestre solo en modo "crear":

```tsx
{mode === 'crear' && (
  <div className="space-y-2">
    <Label htmlFor="fullName">Nombre Completo</Label>
    <Input id="fullName" name="fullName" placeholder="Juan Pérez" required disabled={loading} className="bg-background/50" />
  </div>
)}
```

- [ ] **Step 7: Compilar**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npx tsc --noEmit 2>&1 | head -20
```

Esperado: sin errores.

- [ ] **Step 8: Probar los cuatro caminos en el navegador**

Con el servidor levantado, en ventana de incógnito:

1. **Email equivocado.** Generar un código para `prueba1@vakdor.com` y registrarse con `otro@vakdor.com` → tiene que decir *"Este código no corresponde a este email."*. Después verificar contra la base que **el código sigue libre**:

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && node -e "
const fs=require('fs');
const env=Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^[\"']|[\"']\$/g,'')]}));
const sql=\"select code, is_used, invitee_name, invitee_email, invitee_phone from public.agency_invites order by created_at desc limit 5\";
fetch('https://api.supabase.com/v1/projects/'+env.SUPABASE_PROJECT_REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.SUPABASE_API_KEY_MANAGEMENT,'Content-Type':'application/json'},body:JSON.stringify({query:sql})}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d,null,1)));
"
```

2. **Email correcto.** Registrarse con `prueba1@vakdor.com` → entra, y el perfil queda con **el nombre y el celular que cargó el director**. Verificar con la misma consulta pero sobre `profiles`.

3. **Código viejo.** Usar uno de los 2 códigos sin usar que no tienen email → tiene que dejar registrar sin validar nada, igual que antes.

4. **Crear una inmobiliaria.** En la solapa "Crear", el campo de nombre **sigue estando** y el alta funciona igual que siempre.

- [ ] **Step 9: Commit**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs"
git add lib/actions/auth.ts components/auth-register-form.tsx
git commit -m "feat(auth): el código solo sirve para el email al que se lo mandaron

Se corta antes de crear el usuario, así el código no se consume en un intento
fallido.

Y el perfil pasa a armarse con el nombre y el celular del código: hasta ahora
auth.ts ni siquiera leía invitee_name y le ponía al perfil lo que tipeaba quien
se registraba. El modo crear queda igual que antes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Editar el nombre y el celular desde la tarjeta del asesor

Es lo que le permite a Leonardo cargarle el celular a los que ya están adentro.

**Files:**
- Modify: `app/actions/asesores.ts` (agregar la acción al final, después de `reanudarAsesor`)
- Modify: `app/director/asesores/page.tsx` (el panel lateral del asesor)

**Interfaces:**
- Consumes: `requireDirectorSobreAsesor` y `registrarAccion`, ya existentes en `app/actions/asesores.ts:49`; `normalizePhoneE164`; `VerifiedPhoneField` (Task 4); el tipo de acción `'edicion_datos'` (Task 2).
- Produces: `actualizarDatosAsesor(agentId: string, datos: { full_name?: string; phone?: string }): Promise<{ success: true }>`

- [ ] **Step 1: Escribir la acción**

En `app/actions/asesores.ts`, después de `reanudarAsesor`:

```ts
/**
 * El director corrige el nombre o el celular de un asesor de su inmobiliaria.
 *
 * El email NO se toca: es la cuenta con la que la persona se registró y cambiarlo
 * sería cambiarle el usuario.
 */
export async function actualizarDatosAsesor(
  agentId: string,
  datos: { full_name?: string; phone?: string }
) {
  const { directorId, agencyId, asesor, admin } = await requireDirectorSobreAsesor(agentId)

  const cambios: Record<string, string> = {}
  const detalle: string[] = []

  if (datos.full_name !== undefined) {
    const nombre = datos.full_name.trim()
    if (nombre.length < 3) throw new Error("El nombre es demasiado corto")
    if (nombre !== asesor.full_name) {
      cambios.full_name = nombre
      detalle.push(`nombre: "${asesor.full_name ?? "—"}" → "${nombre}"`)
    }
  }

  if (datos.phone !== undefined) {
    // Llega ya normalizado desde el formulario, pero esta función es pública:
    // se vuelve a normalizar acá antes de guardar nada.
    const phone = normalizePhoneE164(datos.phone, "AR")
    if (!phone) throw new Error("El celular no parece válido")
    if (phone !== asesor.phone) {
      cambios.phone = phone
      detalle.push(`celular: "${asesor.phone ?? "—"}" → "${phone}"`)
    }
  }

  if (Object.keys(cambios).length === 0) return { success: true as const }

  const { error } = await admin.from("profiles").update(cambios).eq("id", agentId)
  if (error) {
    console.error("Error actualizando datos del asesor:", error)
    throw new Error(error.message)
  }

  await registrarAccion(admin, {
    agencyId,
    asesorId: asesor.id,
    ejecutadoPor: directorId,
    tipoAccion: "edicion_datos",
    motivo: detalle.join(" · "),
  })

  revalidatePath("/director/asesores")
  return { success: true as const }
}
```

- [ ] **Step 2: Ampliar el tipo de `registrarAccion` y el import**

En `app/actions/asesores.ts:57`, agregar el valor nuevo:

```ts
    tipoAccion: "pausa" | "reanudacion" | "desvinculacion" | "eliminacion_definitiva" | "edicion_datos"
```

Y arriba del archivo:

```ts
import { normalizePhoneE164 } from "@/lib/whatsapp/phone"
```

- [ ] **Step 3: Agregarle `phone` a `requireDirectorSobreAsesor`**

Verificado: el `.select()` del asesor en `app/actions/asesores.ts:28` trae hoy
`id, email, full_name, role, agency_id` — **le falta `phone`**. Sin eso, la comparación
"¿cambió algo?" siempre da que cambió y se registra una edición aunque no se haya
tocado nada.

```ts
  const { data: asesor } = await supabase
    .from("profiles")
    .select("id, email, full_name, phone, role, agency_id")
    .eq("id", agentId)
    .single()
```

- [ ] **Step 4: La UI en el panel lateral**

En `app/director/asesores/page.tsx`, dentro del `<SheetContent>` del asesor seleccionado, debajo del nombre, agregar el bloque de datos de contacto:

```tsx
<div className="rounded-xl border border-border/60 p-4 space-y-3">
  <div className="flex items-center justify-between">
    <p className="text-xs uppercase tracking-wider text-muted-foreground">Datos de contacto</p>
    <Button variant="ghost" size="sm" onClick={() => abrirEdicionDatos(selectedAgent)}>
      Editar
    </Button>
  </div>
  <div className="space-y-1 text-sm">
    <p><span className="text-muted-foreground">Email:</span> {selectedAgent.email}</p>
    <p>
      <span className="text-muted-foreground">Celular:</span>{" "}
      {selectedAgent.phone
        ? formatPhoneInternational(selectedAgent.phone, "AR") ?? selectedAgent.phone
        : <span className="text-amber-600">Sin cargar</span>}
    </p>
  </div>
  <p className="text-xs text-muted-foreground">El email no se puede cambiar: es su cuenta.</p>
</div>
```

Con el estado y el diálogo correspondientes:

```tsx
const [editandoDatos, setEditandoDatos] = useState<Record<string, any> | null>(null)
const [nombreEdit, setNombreEdit] = useState("")
const [phoneEdit, setPhoneEdit] = useState<VerifiedPhoneValue>({ phone: "", phoneConfirm: "", country: "AR" as CountryCode })
const [guardandoDatos, setGuardandoDatos] = useState(false)

const abrirEdicionDatos = (agent: Record<string, any>) => {
  setNombreEdit(agent.full_name ?? "")
  setPhoneEdit({ phone: "", phoneConfirm: "", country: "AR" as CountryCode })
  setEditandoDatos(agent)
}

const guardarDatos = async () => {
  if (!editandoDatos) return
  const e164 = normalizePhoneE164(phoneEdit.phone, phoneEdit.country)
  const confirm164 = normalizePhoneE164(phoneEdit.phoneConfirm, phoneEdit.country)
  const tocaCelular = phoneEdit.phone.trim() !== ""

  if (tocaCelular && (!e164 || e164 !== confirm164)) {
    toast.error("Revisá el celular: tiene que ser válido y estar escrito igual las dos veces")
    return
  }
  try {
    setGuardandoDatos(true)
    await actualizarDatosAsesor(editandoDatos.id, {
      full_name: nombreEdit,
      ...(tocaCelular && e164 ? { phone: e164 } : {}),
    })
    toast.success("Datos actualizados")
    setEditandoDatos(null)
    setSelectedAgent(null)
    fetchAgents()
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : "No se pudieron guardar los datos")
  } finally {
    setGuardandoDatos(false)
  }
}
```

Y el diálogo, junto a los demás del final del archivo:

```tsx
<Dialog open={!!editandoDatos} onOpenChange={(v) => !v && setEditandoDatos(null)}>
  <DialogContent className="bg-card border-accent/20 max-h-[90vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>Datos de {editandoDatos?.full_name || "el asesor"}</DialogTitle>
      <DialogDescription>
        El email queda como está: es la cuenta con la que se registró.
      </DialogDescription>
    </DialogHeader>
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label htmlFor="ed-nombre">Nombre y apellido</Label>
        <Input
          id="ed-nombre"
          value={nombreEdit}
          disabled={guardandoDatos}
          onChange={(e) => setNombreEdit(e.target.value)}
        />
      </div>
      <VerifiedPhoneField value={phoneEdit} onChange={setPhoneEdit} disabled={guardandoDatos} />
      <p className="text-xs text-muted-foreground">
        Dejá el celular en blanco si no querés cambiarlo.
      </p>
    </div>
    <DialogFooter>
      <Button variant="ghost" onClick={() => setEditandoDatos(null)} disabled={guardandoDatos}>
        Cancelar
      </Button>
      <Button onClick={guardarDatos} disabled={guardandoDatos} className="bg-accent">
        Guardar
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

Agregar a los imports del archivo:

```tsx
import { Label } from "@/components/ui/label"
import { VerifiedPhoneField, type VerifiedPhoneValue } from "@/components/shared/VerifiedPhoneField"
import { normalizePhoneE164, formatPhoneInternational } from "@/lib/whatsapp/phone"
import type { CountryCode } from "libphonenumber-js"
import { actualizarDatosAsesor } from "@/app/actions/asesores"
```

(`actualizarDatosAsesor` va agregado a la lista de imports que ya existe de ese archivo, no en una línea nueva.)

- [ ] **Step 5: Compilar y probar**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npx tsc --noEmit 2>&1 | head -20
```

En el navegador, en `/director/asesores`, abrir un asesor de **PRISMAIA - VAKDOR**:

1. Se ve el email y "Sin cargar" en el celular.
2. Editar → cargar un celular escrito distinto en los dos campos → no deja guardar.
3. Cargarlo bien → guarda, y al reabrir la tarjeta se ve formateado como `+54 9 11 …`.
4. Cambiar solo el nombre, dejando el celular en blanco → cambia el nombre y **no le borra el celular**.
5. Verificar la constancia:

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && node -e "
const fs=require('fs');
const env=Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^[\"']|[\"']\$/g,'')]}));
const sql=\"select tipo_accion, motivo, created_at from public.equipo_acciones order by created_at desc limit 5\";
fetch('https://api.supabase.com/v1/projects/'+env.SUPABASE_PROJECT_REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.SUPABASE_API_KEY_MANAGEMENT,'Content-Type':'application/json'},body:JSON.stringify({query:sql})}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d,null,1)));
"
```

Esperado: una fila `edicion_datos` con el detalle de qué cambió.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs"
git add app/actions/asesores.ts app/director/asesores/page.tsx
git commit -m "feat(asesores): cargarle el nombre y el celular a los que ya están adentro

El email se muestra pero no se toca: es la cuenta con la que se registró.

Dejar el celular en blanco significa \"no lo cambies\", no \"borralo\". Y queda la
constancia en equipo_acciones con el antes y el después, igual que pausar y
desvincular.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: El asesor ve su celular, en solo lectura

**Files:**
- Modify: `app/asesor/configuracion/page.tsx` (la tarjeta que ya usa el ícono `Smartphone`, línea ~442)

**Contexto verificado:** la página guarda el perfil en un estado tipado como
`{ full_name, email, avatar_url, agency_name }` (línea 65) y lo llena desde una consulta
a `profiles` (línea 147). **`phone` no está en ninguno de los dos**, así que hay que
sumarlo en los tres lugares.

- [ ] **Step 1: Sumar `phone` al estado y a la consulta**

En la línea 65, agregar el campo al tipo y al valor inicial:

```tsx
const [profile, setProfile] = useState<{ full_name: string; email: string; phone: string; avatar_url: string; agency_name: string }>({
```

(agregar `phone: "",` al objeto inicial)

En la consulta de la línea 147, agregar `phone` al `.select()`, y en el `setProfile` de la
línea 156:

```tsx
          phone: profileData.phone || "",
```

- [ ] **Step 2: Mostrar el celular en la tarjeta**

En la tarjeta que ya usa el ícono `Smartphone` (línea ~442), agregar:

```tsx
<div className="flex items-center justify-between py-2">
  <div>
    <p className="text-sm font-medium">Mi celular</p>
    <p className="text-sm text-muted-foreground">
      {profile.phone
        ? formatPhoneInternational(profile.phone, "AR") ?? profile.phone
        : "Todavía no está cargado"}
    </p>
  </div>
</div>
<p className="text-xs text-muted-foreground">
  Si cambiaste de número, pedíselo a la dirección de tu inmobiliaria: son los
  únicos que pueden actualizarlo.
</p>
```

Agregar el import:

```tsx
import { formatPhoneInternational } from "@/lib/whatsapp/phone"
```

**Importante:** la página tiene en la línea ~207 un update de `profiles` que guarda
`full_name`. **No se toca.** El asesor sigue pudiendo cambiarse el nombre a sí mismo,
igual que hoy. Ver "Lo que esta etapa NO hace".

- [ ] **Step 3: Compilar y probar**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npx tsc --noEmit 2>&1 | head -20
```

Entrar con la **cuenta descartable** creada en la Task 6 (nunca con la de un asesor real) a `/asesor/configuracion` y confirmar que ve su celular y que no hay ningún campo para editarlo.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs"
git add app/asesor/configuracion/page.tsx
git commit -m "feat(asesor): ve su celular y a quién pedirle el cambio

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: La prueba completa y la documentación

**Files:**
- Modify: `docs/interno/bitacora-sesiones.md`
- Modify: `docs/compartible/estandarizada/FUNCIONAL-DIRECTOR-PRISMA.md` (si existe una sección de invitaciones)

- [ ] **Step 1: Correr toda la suite**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npm test && npx tsc --noEmit && npm run lint 2>&1 | tail -20
```

- [ ] **Step 2: Compilar de verdad**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npm run build 2>&1 | tail -30
```

Esperado: build exitoso. Un fallo acá es bloqueante: no se le entrega a Leonardo algo que no compila.

- [ ] **Step 3: El recorrido completo en el navegador, escritorio y celular**

Los 7 puntos de la Etapa A del spec (§11), en orden, en escritorio y en celular emulado. Anotar el resultado de cada uno.

- [ ] **Step 4: Escribir la entrada de bitácora**

En `docs/interno/bitacora-sesiones.md`, arriba de todo: qué se construyó, qué se decidió y por qué, y qué quedó pendiente (las Etapas B y C).

- [ ] **Step 5: Actualizar la guía funcional del director**

Sin tecnicismos: que ahora al invitar se piden nombre, celular y email, que el código solo le sirve a esa persona, y que el celular de los que ya están se carga desde la tarjeta.

- [ ] **Step 6: Commit y entregarle el link a Leonardo para que lo pruebe él**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs"
git add docs/interno/bitacora-sesiones.md docs/compartible/estandarizada/FUNCIONAL-DIRECTOR-PRISMA.md
git commit -m "docs: la Etapa A, y la guía del director al día

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**No se mergea a `main` sin el OK de Leonardo después de probarlo él mismo.**

---

## Lo que esta etapa NO hace

- No toca `components/shared/ManualContactFields.tsx` (spec §9.2).
- **No le saca al asesor la posibilidad de cambiarse el nombre a sí mismo.** Apareció al
  escribir la Task 8: `app/asesor/configuracion/page.tsx:207` ya permite eso hoy. La
  decisión de Leonardo fue que el nombre del código mande **al registrarse** y que el
  celular lo maneje solo el director; nunca dijo de bloquear el auto-renombre, que es
  conducta que ya existe y no es un problema de seguridad. **Queda como está y se le
  consulta aparte.**
- No construye nada de documentos ni plantillas: son las Etapas B y C, con su propio plan.
- No arregla que el bucket `contratos` esté público (spec §9.3).
- No migra los 2 códigos viejos sin email: siguen funcionando como antes, a propósito.
