# Trabajo 2 — Editar y borrar registros de facturación de una agencia

**Fecha:** 2026-07-13
**Módulo:** admin-vakdor → detalle de agencia → sección "💳 Pagos"
**Alcance:** una rama propia (`feat/admin-facturacion-editar-borrar`), probar en local, OK de Leonardo, actualizar docs, mergear a main.

---

## 1. Objetivo

En el detalle de una agencia, el historial de pagos (facturación de esa agencia hacia Vakdor) hoy **solo se puede ver y agregar**. No se puede corregir un valor mal cargado ni borrar un registro de prueba (caso concreto: la agencia propia de Leonardo).

Queremos que cada fila del historial tenga **editar** y **borrar**.

Decisiones ya tomadas con Leonardo:

- **Borrado real** (hard delete): el registro desaparece de la base; siempre con confirmación previa. (Queda el rastro en el log de actividad del admin.)
- **Editar incluye el mes/período**, además de monto/moneda/notas, con chequeo de que el nuevo período **no choque** con otro pago de la misma agencia.

---

## 2. Estado actual (verificado en código)

- **Tabla:** `pagos_agencia` (id, agencia_id, monto, moneda, periodo_mes, notas, registrado_por, fecha_registro).
- **API:**
  - `GET/POST /api/admin-vakdor/agencias/[id]/pagos` — lista y crea (POST con `forzar:true` reemplaza si ya existe ese período).
  - `PATCH /api/admin-vakdor/pagos/[pago_id]` — **ya existe**, actualiza solo `monto, moneda, notas`. **No** toca `periodo_mes`. Registra `PAGO_EDITADO`.
  - **No existe DELETE.**
- **Datos que ya llegan al cliente:** `app/api/admin-vakdor/agencias/[id]/route.ts` devuelve `pagos.historial = pagosData` con `select("*")`, es decir **cada fila ya incluye `id`** (y `periodo_mes`, `monto`, `moneda`, `notas`). No hay que cambiar esta ruta.
- **UI:** `components/admin-vakdor/agencia-detalle-client.tsx`
  - Estado `pagoModal`, `pagoForm = { monto, moneda, periodo_mes, notas }`, función `registrarPago()` (POST).
  - Sección "💳 Pagos" (línea ~248): muestra `pagos.historial.slice(0,8)` con período + monto; **sin** botones por fila.
  - Modal "Registrar Pago" (línea ~449) con inputs `type="month"`, monto, moneda, notas.
- **Infra admin:** `requireAdminVakdor`, `getAdminDb`, `logAdminActivity`, `getClientIp` (patrón ya usado en todos los endpoints admin-vakdor).

---

## 3. Cambios en la API

### 3.1 Ampliar `PATCH /api/admin-vakdor/pagos/[pago_id]`

- Aceptar también `periodo_mes` en el body.
- Si viene `periodo_mes` y cambia respecto del actual:
  1. Leer el pago actual para obtener su `agencia_id` (el PATCH hoy no lo tiene en params).
  2. Chequear que **no exista otro** pago con `(agencia_id, periodo_mes)` distinto de este `id`. Si existe → `409` con `{ error: "PERIODO_OCUPADO", mensaje: "Ya hay un pago para ese mes en esta agencia." }`.
- Actualizar `monto, moneda, notas, periodo_mes`. Mantener el `logAdminActivity` `PAGO_EDITADO` (agregar `periodo_mes` al `detalleJson`).

### 3.2 Nuevo `DELETE /api/admin-vakdor/pagos/[pago_id]`

- `requireAdminVakdor`.
- `db.from("pagos_agencia").delete().eq("id", params.pago_id)`.
- `logAdminActivity({ accion: "PAGO_ELIMINADO", entidadTipo: "pago", entidadId: pago_id, ... })`.
- Devolver `{ ok: true }`. (Mismo patrón que el DELETE de `finance/expenses`.)

---

## 4. Cambios en la UI (`agencia-detalle-client.tsx`)

### 4.1 Botones por fila

En la lista de `pagos.historial` (línea ~264), cada fila suma dos botoncitos: **✏️ editar** y **🗑️ borrar** (íconos discretos, borrar en rojo tenue, como en `finanzas-client.tsx`).

### 4.2 Editar (reusar el modal)

- El modal "Registrar Pago" pasa a ser dual: título "Registrar Pago" / "Editar Pago" según haya `pagoForm.id`.
- `editarPago(p)` precarga `pagoForm = { id: p.id, monto: String(p.monto), moneda: p.moneda, periodo_mes: p.periodo_mes, notas: p.notas ?? "" }` y abre el modal.
- El botón de guardar del modal decide método por `pagoForm.id`:
  - **Con id →** `PATCH /api/admin-vakdor/pagos/${id}` con `{ monto, moneda, notas, periodo_mes }`. Si responde `409 PERIODO_OCUPADO`, mostrar mensaje claro y no cerrar.
  - **Sin id →** flujo POST actual (crear), sin cambios.
- Al cerrar/cancelar, limpiar `pagoForm.id`.

### 4.3 Borrar

- `borrarPago(p)`: `confirm("¿Borrar el pago de " + p.periodo_mes + " ($" + p.monto + ")? No se puede deshacer.")` → si acepta, `DELETE /api/admin-vakdor/pagos/${p.id}` → `fetchData()` para refrescar → `setMsg("Pago eliminado")`.

---

## 5. Casos borde / validaciones

- **Editar sin cambiar el período:** no dispara el chequeo de duplicado (comparar contra el actual).
- **Cambiar a un período ya ocupado:** 409, mensaje claro, el modal queda abierto.
- **Borrar el pago del mes actual:** permitido (es dato de prueba); el indicador "✓ Pago {mes}" se recalcula al refrescar.
- **Doble click / carreras:** deshabilitar botones mientras `actionLoading` (patrón ya presente).

## 6. Archivos a tocar

- `app/api/admin-vakdor/pagos/[pago_id]/route.ts` — ampliar PATCH + agregar DELETE.
- `components/admin-vakdor/agencia-detalle-client.tsx` — botones por fila, modal dual, `editarPago`, `borrarPago`.
- (No tocar) `app/api/admin-vakdor/agencias/[id]/route.ts` — ya devuelve `id` en el historial.

## 7. Prueba (local)

1. `npm run dev`, entrar a admin-vakdor, abrir una agencia (idealmente la propia de prueba).
2. Crear un pago, editar su monto → verificar que cambia.
3. Editar y cambiar el mes a uno libre → OK; cambiarlo a un mes ya ocupado → 409 con mensaje.
4. Borrar un pago → confirmación → desaparece del historial y del total acumulado.
5. Verificar en `admin_activity` (o el log) que quedaron `PAGO_EDITADO` / `PAGO_ELIMINADO`.

## 8. Docs a actualizar

- `docs/interno/TECNICO-PRISMA.md` (endpoints admin-vakdor de pagos). Es funcionalidad **interna de Vakdor**, no va en las guías FUNCIONAL del cliente.

## 9. Fuera de alcance (YAGNI)

- Borrado lógico / papelera / restaurar.
- Historial de cambios del pago (más allá del log de actividad).
- Paginación del historial (hoy muestra los primeros 8).
