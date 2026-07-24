# GUÍA DEL DIRECTOR — SISTEMA PRISMA

> **Para quién es esta guía:** directores/dueños de inmobiliaria que administran su agencia en PRISMA.
> **Qué vas a encontrar:** qué hace cada pantalla, cómo configurarla y usarla paso a paso, consejos y tips.
>
> 💡 Como director tenés **acceso total** a tu agencia: configuración, integraciones, equipo, estadísticas globales y todas las herramientas de IA.

---

## ÍNDICE

1. [Primeros pasos: crear tu agencia](#1-primeros-pasos-crear-tu-agencia)
2. [Configuración inicial (lo primero que tenés que hacer)](#2-configuración-inicial-lo-primero-que-tenés-que-hacer)
3. [Cómo moverte por PRISMA](#3-cómo-moverte-por-prisma)
4. [Dashboard](#4-dashboard)
5. [Pulso de Mercado](#5-pulso-de-mercado)
6. [Pipeline (CRM)](#6-pipeline-crm)
7. [Propiedades](#7-propiedades)
8. [Tracking Performance](#8-tracking-performance)
9. [Leads Tokko](#9-leads-tokko)
10. [Asesor IA en WhatsApp (el bot)](#10-asesor-ia-en-whatsapp-el-bot)
11. [Leads WhatsApp](#11-leads-whatsapp)
12. [Marketing IA](#12-marketing-ia)
13. [Contratos IA](#13-contratos-ia)
14. [Asesores (gestión del equipo)](#14-asesores-gestión-del-equipo)
15. [Documentos (base de conocimiento)](#15-documentos-base-de-conocimiento)
16. [ACM — Análisis Comparativo de Mercado](#16-acm--análisis-comparativo-de-mercado)
17. [Calendario (visitas)](#17-calendario-visitas)
18. [Tutor IA](#18-tutor-ia)
19. [Buscador IA (+ notas del director)](#19-buscador-ia--notas-del-director)
20. [Configuración (perfil, agencia, créditos, costos, seguridad)](#20-configuración-perfil-agencia-créditos-costos-seguridad)
21. [Sugerencias](#21-sugerencias)
22. [Análisis de conversaciones (Inteligencia Conversacional)](#22-análisis-de-conversaciones-inteligencia-conversacional)
23. [Créditos IA: cómo administrarlos](#23-créditos-ia-cómo-administrarlos)
24. [Checklist de puesta en marcha](#24-checklist-de-puesta-en-marcha)
25. [Preguntas frecuentes](#25-preguntas-frecuentes)
26. [Personalizaciones de tu agencia](#26-personalizaciones-de-tu-agencia)

---

## 1. Primeros pasos: crear tu agencia

1. Entrá a la página de registro y elegí **"Crear inmobiliaria nueva"**.
2. Completá tu **nombre, email, contraseña**, el **nombre de tu agencia** y el **código de autorización** que te da el equipo de PRISMA (Vakdor). Ese código solo sirve para crear inmobiliarias nuevas.
3. Confirmá tu email (te llega un link).
4. Al confirmar, PRISMA crea automáticamente tu **agencia**. Entrás directo a tu **Dashboard**.

> 💡 **Tip:** también podés registrarte/ingresar con Google.

> 👥 **Varios directores, sin jerarquía:** una inmobiliaria puede tener **varios directores, todos con el mismo poder**. El primero se crea con el código de Vakdor; a los demás los invita cualquier director desde **Configuración → Inmobiliaria → Invitación de Directores** (ver sección 14). Todos los directores ven y gestionan lo mismo.

---

## 2. Configuración inicial (lo primero que tenés que hacer)

Antes de operar, dejá lista la base. Andá a **Configuración** (último ítem del menú) y luego seguí este orden:

1. **Conectá Tokko** (pestaña *Inmobiliaria*): pegá tu **Tokko Broker API Key** y guardá. PRISMA **sincroniza automáticamente** tus propiedades y leads en segundo plano.
2. **Subí el logo y datos de la agencia** (misma pestaña): logo (PNG/JPG/SVG, hasta 2MB) y nombre.
3. **Conectá WhatsApp** (sección *Asesor IA en WhatsApp*): seguí el asistente de configuración (ver sección 10).
4. **Cargá tu directiva de marketing y aviso legal** (Marketing IA → ajustes): así todos los contenidos salen con tu estilo y tu legal.
5. **Subí documentos a la Biblioteca:** manuales y guiones para que el Tutor IA capacite a tu equipo.
6. **Invitá a tu equipo** (Configuración → Inmobiliaria): dos cajitas, **Invitación de Asesores** e **Invitación de Directores**. Escribí el nombre de la persona y generá su código.

> 💡 **Tip:** completar estos 6 pasos hace que PRISMA funcione "lleno" desde el día uno.

---

## 3. Cómo moverte por PRISMA

- **Menú lateral izquierdo:** tu navegación principal (18 secciones).
- Arriba a la derecha: **botón de tema** (☀️/🌙) para modo claro u oscuro.
- Tu nombre y rol ("Director") aparecen arriba del menú.
- **"Cerrar Sesión"** está al final del menú.

Como director ves **todo** lo de tu agencia: el trabajo de todos los asesores, métricas globales y la configuración.

---

## 4. Dashboard

**Qué es:** la vista panorámica del rendimiento **de toda la agencia**.

**Qué muestra:** es una vista larga que reúne varias secciones, en este orden:
- **Tarjetas (KPIs):** leads, captaciones, reservas y cierres totales, con variación porcentual.
- **Gráficos:** evolución temporal (barras) y distribución por canal de origen (dona).
- **Objetivos vs Alcanzado:** la sección de metas mensuales (ver detalle abajo), justo antes del ranking.
- **Ranking de asesores:** quién rinde más en tu equipo.
- **Inteligencia Conversacional:** el análisis profundo de WhatsApp (ver sección 22; vive acá adentro, no en el menú).
- **Embudo (Pipeline):** resumen de leads por etapa.
- **Leads y Propiedades:** secciones con el detalle de leads recientes y de la cartera.
- **Actividad en tiempo real:** feed de últimos eventos (nuevo lead, propiedad sincronizada, etc.).

**Cómo usarlo:**
- Es tu tablero de control diario. El ranking te ayuda a detectar quién necesita apoyo y quién está rindiendo.
- Los KPIs se nutren de lo que el equipo carga en **Tracking Performance** y de los leads/visitas.

### Objetivos vs Alcanzado

**Qué es:** una tabla y un gráfico que comparan, mes a mes, **lo que planificaste** (los objetivos que cargaste en Tracking Performance → Objetivos) contra **lo que el equipo realmente logró**.

**Qué muestra:**
- Un **selector de métrica** (Facturación / Captación) y un **filtro de año** (por defecto el año en curso; podés mirar años anteriores).
- Una **tabla** con cada asesor y, por cada mes, tres filas: **Objetivo**, **Alcanzado** y **% cumplido** (coloreado: verde si llegó o superó la meta, y en tonos más bajos según se aleja).
- Un **gráfico de evolución** del total de la inmobiliaria: barras de objetivo vs alcanzado por mes, más una línea con el % de cumplimiento.

> 💡 **Tip:** si la sección dice que no hay objetivos cargados, andá a **Tracking Performance → Objetivos** y cargalos. El "alcanzado" se llena solo con la actividad del equipo.

---

## 5. Pulso de Mercado

**Qué es:** tablero de comando con datos reales del mercado argentino.

**Qué muestra:** dólar (tiempo real), **precio de cierre real** en CABA por ambientes (operaciones concretadas, estudio REMAX + Universidad del CEMA) con la brecha vs. lo publicado, gráfico de evolución **publicado vs. cierre real**, precios Zonaprop por zona, precio m² por barrio (lista Mudafy + cierre estimado con la brecha real del mes), ICC y escrituras CABA (Colegio de Escribanos). Cada dato con su **fecha real de actualización**.

**Cómo usarlo:**
- Botón **"Actualizar"** para refrescar todas las fuentes (se sincronizan en paralelo).
- Si una fuente dice "Sin datos", es porque no publicó el dato. PRISMA **no inventa** cifras.
- El **cierre real** y su brecha son el mejor respaldo para revisar tasaciones del equipo y alinear expectativas de propietarios.

> 💡 **Tip:** úsalo en reuniones y capacitaciones para fundamentar precios con datos oficiales — y la brecha publicado/cierre para explicar por qué sobretasar atrasa la venta.

---

## 6. Pipeline (CRM)

**Qué es:** tablero de columnas con **todos** los leads y oportunidades de la agencia (la pantalla se titula "Pipeline Global" y está marcada como **Beta**).

**Qué muestra:** une **leads de Tokko** y **conversaciones de WhatsApp** en 9 columnas: **Nuevo contacto, Primer contacto, Calificado, Visita agendada, Visita realizada, Propuesta enviada, Negociación, Cerrado, Perdido**.

**Cómo usarlo:**
- **Arrastrá** tarjetas entre columnas para reflejar el avance (el cambio de etapa se guarda al instante).
- Hacé clic en una tarjeta para abrir un **panel de detalle de solo lectura** (datos de contacto, historial de actividad y notas internas).

> 💡 **Tip:** revisá la columna "Nuevo" para asegurarte de que ningún lead quede sin asignar o sin trabajar.

---

## 7. Propiedades

**Qué es:** el catálogo completo de la cartera de la agencia (sincronizado desde Tokko).

**Qué muestra:** grilla o lista con filtros por texto y tipo. Cada propiedad tiene una **ficha detallada**: carrusel de fotos, ficha técnica (ambientes, baños, superficie **total** y **cubierta**), descripción, responsable interno asignado, creador original en Tokko y precios.

> 📐 **Superficies:** "Total" es la superficie total/lote y "Cubiertos" es la superficie techada real. (Antes la cubierta a veces mostraba el lote por error; ya está corregido.)
> 🔒 Los datos del **propietario** (nombre, teléfono, comisión) **no se muestran** en PRISMA por privacidad, aunque Tokko los exponga.
> 🔗 En el detalle de cada propiedad tenés el botón **"Ver Ficha Pública"**, que abre el **aviso público** de esa propiedad en el portal. Para mandarle a un cliente una **ficha de presentación de lujo** con la marca de tu inmobiliaria, usá el botón **"Compartir ficha"** del **Buscador IA** (ver más abajo).

> 🔄 **Sincronización automática:** PRISMA sincroniza propiedades y leads con Tokko **solo, dos veces por día (7:00 AM y 6:00 PM)**. No hace falta que sincronices a mano para que tus asesores vean los cambios; el botón manual queda para cuando necesitás algo al instante.

> 💡 **Tip:** si un dato de la propiedad no se ve bien, dentro de la ficha hay un botón para ver la **información tal como llega de Tokko** y entender de dónde viene el error.
> 💡 Si faltan propiedades, revisá la API Key de Tokko en Configuración y volvé a guardar para forzar la sincronización.

### 7.1 Descripción mejorada con IA

En la ficha de cada propiedad, debajo de la descripción de Tokko, está el bloque **"Descripción mejorada con IA"**. Genera una descripción profesional con un relato emocional (apunta a los deseos del comprador ideal **sin inventar**), un bloque de **Preguntas Frecuentes** y la deja preparada para aparecer en **Google y en los buscadores con IA**, usando **todos los datos** de la propiedad. Lo pueden usar tanto **vos como tus asesores**.

- **Versión 1:** se genera a partir de los datos de la propiedad.
- **Versión 2:** se genera sobre la V1 aplicando una **sugerencia** escrita por quien la usa.
- Cada versión queda **guardada** (no se pierde al recargar) y se puede **copiar** para pegarla en Tokko. La descripción original de Tokko **no se toca** y se sigue pisando en cada sincronización.

> ⚠️ **Costo:** cada generación **consume 1 crédito de IA**. El tope es **estricto: 2 versiones por propiedad** (V1 + V2), para mantener el gasto bajo control. El consumo queda registrado en el panel de Créditos IA.

---

## 8. Tracking Performance

**Qué es:** el registro de actividad comercial del equipo, que **alimenta el Dashboard**. Como director, además podés definir cuánto puntúa cada acción y **fijar los objetivos mensuales** de cada asesor.

Tenés **3 solapas**:
1. **Actividad:** el historial de actividad del equipo (ver, filtrar, cargar nuevas). Como director ves un **filtro por asesor** (desplegable en orden alfabético) que te permite ver solo la actividad de un asesor específico o de todos.
2. **Objetivos:** dónde fijás las metas mensuales por asesor (ver detalle abajo).
3. **Configuración IA:** ajustás las escalas (qué puntaje da cada acción: llamada, captación, prelisting, etc.). Esto define cómo se calculan los KPIs.

**Formulario de registro (igual que el asesor):** zona/barrio, propiedad de Tokko o de colaboración, vincular cliente (Tokko o WhatsApp), registro manual de lead nuevo y origen de consulta. El registro manual pide **nombre completo, celular, email y etiqueta**. El celular se carga eligiendo el **país** (lista con bandera) y escribiendo el número natural; el sistema lo normaliza al formato de WhatsApp (para AR agrega el "9" móvil aunque no se ponga el 15) y muestra el preview. Lleva **doble verificación** de nombre/celular/email (se reescriben sin copiar/pegar, con aviso ✅/❌) y una **casilla de certificación** obligatoria de que los datos son veraces. Como director, al cargar podés **elegir a qué asesor** corresponde.

### Solapa "Objetivos" (fijar metas mensuales)

**Qué es:** acá definís, **por asesor y por mes**, la meta de **Facturación** (en USD) y **Captación** (cantidad de propiedades captadas) durante el año.

**Cómo se usa:**
- Arriba elegís la **métrica** (Facturación o Captación) y el **año**.
- **Fila de "% del mes" (arriba de todo):** definís qué **porcentaje del año** cae en cada mes (por ejemplo, si facturás más a fin de año, ponés más % en noviembre y diciembre). Los 12 meses **tienen que sumar 100%** — al lado te muestra la suma con un ✓ verde cuando llegás. Cada métrica tiene su propio reparto. Apretás **"Guardar %"**.
- **Cargás la meta de cada asesor** de una de estas dos formas:
  - escribiendo el objetivo mes a mes en cada celda, o
  - escribiendo el **"Total del año"** del asesor (columna de la derecha) y apretando **"Aplicar"**: el sistema reparte ese total por mes según los % que definiste arriba (cada mes = total × % del mes).
- Apretás **"Guardar objetivos"**.

**Reglas importantes:**
- Solo podés editar el **mes en curso y los meses futuros**. Los meses ya cerrados aparecen **bloqueados** (no se tocan).
- Los **años anteriores** quedan en **solo lectura**: podés consultarlos cambiando el filtro de año, pero no modificarlos. Así mantenés el historial de planificaciones.
- Lo "alcanzado" **no se carga a mano**: se calcula solo a partir de las actividades que el equipo ya registró (cierres para Facturación, captaciones para Captación).

El resultado de estos objetivos se ve en el **Dashboard**, en la sección "Objetivos vs Alcanzado" (ver sección 4).

> 💡 **Tip:** definí bien las escalas de puntaje al principio; son la base de un ranking justo.
> 💡 **Tip:** cargá primero los **% de cada mes** (que sumen 100) una sola vez, y después, por asesor, poné el **total del año** y apretá "Aplicar": se reparte solo respetando la estacionalidad. Solo podrás corregir de acá en adelante, no el pasado.

---

## 9. Leads Tokko

**Qué es:** todos los leads/contactos importados de Tokko (de toda la agencia). Al sincronizar se traen los **más recientes primero** (hasta 1000 por vez) y cada lead queda **asignado automáticamente** al asesor cuyo email coincida con el agente de Tokko.

**Cómo usarlo:** abrí un lead para ver su **ficha 360** (contacto, **origen** real —Web/Zonaprop/Mercadolibre—, etiquetas Tokko, agente, ID de contacto y **última actualización**) y el **historial** de actividades.

> ℹ️ Tokko **no siempre nos pasa** la propiedad consultada ni el mensaje del lead, por eso "Inmueble consultado" puede figurar como "No hay propiedad vinculada". El origen y los intereses se deducen de las **etiquetas**.
> 💡 **Tip:** usalo para auditar la calidad de atención y detectar leads "calientes" que nadie está trabajando.

---

## 10. Asesor IA en WhatsApp (el bot)

**Qué es:** acá conectás el WhatsApp de la agencia y configurás el **bot de IA** que atiende a los clientes automáticamente.

### Si todavía no conectaste WhatsApp
Vas a ver un **asistente de configuración** que te guía paso a paso para conectar tu WhatsApp. Seguilo y listo.

### Una vez conectado, tenés 5 pestañas:
- **💬 Chat:** la bandeja de conversaciones en vivo. Podés **filtrar los chats por clasificación** (origen del lead) además de por asesor; cada chat muestra su **etiqueta de clasificación** con un color.
- **📋 Plantillas:** es un **gestor completo de plantillas de WhatsApp**. Además de las **8 plantillas de seguimiento** que PRISMA prepara (recordatorios de visita, reactivaciones, follow-ups) y de ver su **estado de aprobación**, podés **crear tus propias plantillas** (categoría, idioma, encabezado/cuerpo/pie, botones y variables `{{1}}`), **editarlas, eliminarlas** y **sincronizarlas desde Meta**.
- **👥 Contactos:** la lista de contactos de WhatsApp (la "agenda" para campañas), con búsqueda, **filtro por clasificación**, **paginación de 100 por página** (soporta miles), selección múltiple e **importación desde CSV/Excel**. Cada contacto tiene **Clasificación** (etiqueta de color) y botón para **eliminarlo**. Al **importar**: escribís una **clasificación para todo el lote**, el sistema **descarta repetidos** (por teléfono) y te avisa cuántos entraron/omitieron.
  - **Como director ves TODOS los contactos de la agencia.** En cambio, **cada asesor ve solo los suyos** (los que él importó/cargó, o los del lead que tiene asignado). Así cada uno trabaja con su propia base sin ver la de los demás, y vos tenés la vista completa.
  - **Excel/CSV — columnas:** solo necesita una columna de **teléfono** (puede llamarse `celular`, `telefono`, `phone`, etc.) — el **nombre del contacto es opcional**. Los teléfonos pueden venir en **cualquier formato argentino** (con/sin +, con 0, con 15, áreas 11/221/2227…): el sistema los **convierte solo** al formato de WhatsApp. La clasificación NO va en el Excel (se pone al importar).
- **📣 Campañas:** dos modos:
  - **Campaña automática por segmento (recomendada para masivo):** elegís una **clasificación** (ej. `reclutamiento`) + una **plantilla** y tocás **"Crear campaña"** (queda lista, en cola, sin enviar). Después confirmás con **"🚀 Lanzar ahora"**: empieza a enviar **en el acto** y sigue **solo, en goteo diario, hasta tu límite real de Meta**, marca enviados y **no repite**, hasta terminar todo el segmento (aunque cierres el navegador). **No tenés que entrar a GitHub ni a ningún lado.** Podés **pausar/eliminar** y ver el **progreso** (enviados/total, en cola, errores). El estado de cada lead se ve en **Contactos** (EN COLA → ENVIADO/ERROR + fecha).
  - **Envío manual puntual:** solo para **grupos chicos o individuales** (corre en el navegador, hay que dejar la pestaña abierta).
  - **🤖 Bot IA en las respuestas (en los dos modos):** antes de enviar, un **interruptor** decide si los chats que cree esa campaña nacen con la **IA prendida** (cuando el contacto responde, el bot le contesta — ideal para **captación de clientes**) o **apagada** (los chats quedan en **modo manual** — ideal para **reclutamiento** u otros envíos que **no son clientes**, donde no querés que la IA responda). Viene **prendido por defecto**. En el listado de campañas se ve una etiqueta **"Bot IA"** / **"Sin bot"**.
    > ⚠️ **Tenelo en cuenta:** el interruptor se aplica a **todos** los chats de la campaña, también a los de gente que **ya tenía un chat abierto**. Si un asesor le había puesto el bot a mano de otra forma, la campaña se lo cambia. Es a propósito: manda la campaña.
    > 🧭 **La clasificación se acumula, no se pisa.** Un lead puede tener varias y la columna las muestra en orden: `1. Whatsapp-Consulta` `2. Oferta-Julio` `3. oferta_julio_2026`. Es el recorrido: de dónde vino, en qué listas lo importaste y qué plantillas recibió.
    > - **Filtrás por cualquiera de ellas.** Si buscás `Whatsapp-Consulta` te aparece; si buscás la plantilla `oferta_julio_2026`, ese mismo lead **también** aparece. Sirve para ver en la bandeja quiénes recibieron una plantilla puntual, sin necesidad de una columna por campaña.
    > - **Al importar no se duplica nada.** Si el teléfono ya está en la agenda, se le **suma** la clasificación de la lista nueva: mismo contacto, mismo chat, sin perder de dónde venía. Antes esos contactos se salteaban y quedaban fuera del lote.
    > - **Las plantillas que mandás clasifican solas**, no tenés que cargar nada. Si la campaña va a un segmento, manda **el nombre que le pusiste al lote** cuando importaste (ej. `Oferta-Julio`), no el nombre técnico de la plantilla: un solo badge, no dos parecidos. El nombre de la plantilla se usa solo cuando la campaña va a todos los contactos, o en el envío manual puntual.
    > - Los seguimientos automáticos del sistema (recordatorios de visita, reactivación) **no** clasifican, para no ensuciar la lista.
- **⚙️ Configuración IA:** definís el comportamiento del bot (cómo responde, conocimiento, etc.).

Arriba a la derecha, un **indicador de conexión** te muestra si la instancia está conectada.

### Avisos automáticos por email al asesor

Cuando el bot detecta que un cliente avanza, **le manda un email al asesor asignado** (remitente "PRISMA IA") y **le deriva esa conversación a su bandeja** de WhatsApp para que tome el control. Pasa en 3 casos:

- **Consulta por una propiedad de su cartera:** un cliente está preguntando por una propiedad asignada a ese asesor.
- **Pedido de hablar con un humano:** el cliente solicita ser atendido por una persona.
- **Visita agendada:** el cliente coordinó una visita y se deriva al asesor para el seguimiento.

Así el equipo no pierde oportunidades: el asesor se entera por email aunque no tenga PRISMA abierto.

> 🔐 Si al abrir un link de PRISMA (por ejemplo, el del aviso de lead) la app pide **iniciar sesión de nuevo**, después de entrar lleva **directo a donde iba** el usuario, sin dejarlo en la pantalla de inicio. Con la sesión ya abierta, entra sin que le pida nada.

### Seguimientos automáticos

Con WhatsApp conectado y las **8 plantillas aprobadas por Meta**, PRISMA hace **seguimientos solos** a los leads por WhatsApp (recordatorios de visita, reactivación de contactos fríos y follow-ups según el momento del lead), sin que el asesor tenga que acordarse. Es lo que mantiene vivas las conversaciones y suma a las métricas de "seguimientos enviados".

> 💡 **Tip:** las plantillas de seguimiento deben estar **aprobadas por Meta** para que los flujos automáticos funcionen. PRISMA revisa el estado todos los días; cuando las 8 están aprobadas, se activan los flujos automáticos.
> 💡 El bot responde solo cuando está activo; si un asesor toma el control manual de un chat, el bot se pausa para esa conversación.
> 📎 **Enviar archivos en un chat:** con el chat en **control manual** (bot pausado), al lado de la caja de mensaje aparece un **clip 📎** para adjuntar foto, PDF, audio o video. El archivo queda **en espera** con vista previa (podés **Cambiarlo** o **Quitarlo** con la ✕) y se manda al tocar **Enviar**, pudiendo acompañarlo con un texto. Aplica tanto al director como a los asesores, y solo dentro de las 24 hs desde el último mensaje del cliente.

---

## 11. Leads WhatsApp

**Qué es:** los leads capturados por WhatsApp (de toda la agencia).

**Cómo usarlo:** abrí un lead para ver su detalle y el **chat en vivo**. Útil para supervisar conversaciones y reasignar si hace falta.

**Acciones por fila:**
- **✏️ Editar:** cambiá nombre, teléfono, etiquetas y **clasificación** del lead. Los cambios se reflejan también en la bandeja del chat y en la agenda de Contactos.
- **🗑️ Eliminar:** borra el lead, su conversación, sus mensajes y la memoria del bot (y lo quita de Contactos si no tiene otro chat con ese número). Pide confirmación.
- **Clasificación:** columna con etiqueta de color y **filtro por clasificación** para encontrar rápido (ej. todos los "Whatsapp-Consulta").

> 💡 **Clasificación del lead:** identifica de dónde vino cada contacto — `Whatsapp-Consulta` (te escribió), `Whatsapp-Manual` (lo cargaste a mano desde Tracking o Calendario) o una **personalizada** (la que pusiste al importar). Sirve para elegir en bloque a quién mandarle cada campaña. Los contactos importados **recién aparecen como chat** en la bandeja/Leads cuando les enviás la campaña o cuando la persona responde (y el chat hereda la clasificación del contacto).

---

## 12. Marketing IA

**Qué es:** el generador de contenido publicitario con IA, alineado a tu marca (la pantalla se titula "Marketing IA Pro").

**Tiene 5 pestañas:**
1. **Crear Anuncio:** el generador principal (ver abajo).
2. **Clientes Ideales (IPC):** donde creás y administrás tus perfiles de cliente ideal.
3. **Historial / Galería:** todos los anuncios generados, agrupados por tanda. Podés verlos, editar el texto, descargar la imagen y borrarlos.
4. **Guía Mágica:** una guía práctica de 5 fases para hacer campañas de captación de leads de calidad en Meta (Facebook/Instagram) Ads: segmentación, el anuncio, el formulario "filtro de oro", retargeting y medición. Es material de lectura, no genera nada.
5. **Configuración IA:** los ajustes de marca de la agencia (solo director, ver abajo).

**Cómo usarlo (pestaña "Crear Anuncio"):**
1. Primero creás un **perfil IPC** (Cliente Ideal) en la pestaña de IPC: objetivo **Captar** (propietarios) o **Vender** (compradores). Completás el perfil paso a paso (motivo, urgencia, ángulo, tono, CTA, nivel de conciencia, etc.).
2. En "Crear Anuncio" elegís: el **IPC**, el **tipo de copy** (Video/Reel o Post), el **formato de imagen** (Reels, Post o Historia) y el **estilo visual** (Moderno, Lujoso, Cálido, Corporativo o Vibrante).
3. Apretás **"Generar 3 Variantes Automáticamente"**: en una sola acción la IA crea **3 copies + 3 imágenes** (3 anuncios completos) usando 3 ángulos distintos (PAS, Transformación y Autoridad/Datos), para que elijas el que mejor convierta.
4. El resultado queda en la pestaña **Historial / Galería**.

**Ajustes de Marca (pestaña "Configuración IA", solo director):**
- **Colores de marca:** hasta 3 colores.
- **Logo:** subís el logo, y elegís su **posición** (4 esquinas) y su **tamaño** (chico/mediano/grande).
- **Tipografía:** moderna/sans, elegante/serif, manuscrita/script o impacto/bold.
- **Directiva creativa:** indicaciones de estilo (hasta 1000 caracteres) que la IA respeta en todos los copies e imágenes (tuyos y de tus asesores).
- **Aviso legal:** texto legal (hasta 300 caracteres) que se inserta en la franja inferior de las imágenes.

> 💡 **Tip:** configurá la directiva creativa y el aviso legal una sola vez; aplican a toda la agencia.
> 🏠 **IPC "Vender" con propiedad asociada:** al crear un IPC de tipo **Vender** podés **asociar una propiedad de tu cartera**. El buscador muestra **toda tu cartera completa** (no un tope de pocas). Si asociás una propiedad, los anuncios **toman sus datos reales** (ubicación, ambientes, superficie, lo más atractivo) integrados con criterio en el copy persuasivo —ni ficha técnica, ni texto genérico— y **sin inventar** nada.
> ⚠️ Si **no** se asocia ninguna propiedad, el generador **no inventa** datos concretos (direcciones, m², precios): los copies hablan del perfil de cliente, en términos generales.
> 💰 **Costo real:** cada "Generar 3 Variantes" consume **~7 créditos** (1 por los 3 textos + 2 por cada una de las 3 imágenes). Nota: el cartelito de la pantalla que dice "1 crédito" se refiere solo a la generación de textos, no al total.

---

## 13. Contratos IA

**Qué es:** generación y gestión de contratos a partir de plantillas, con trazabilidad completa.

**Pestañas que ves como director:**
- **Nuevo Contrato:** elegís tipo y completás el asistente.
- **Contratos Generados:** la tabla con **todos** los contratos del equipo (incluidos los eliminados, con su motivo). Cada fila muestra el asesor, el contrato, el **código único**, cliente/propiedad, estado de gestión y el PDF.
- **Mis Plantillas (solo director):** acá administrás las plantillas.

**Plantillas (clave para el director):**
- PRISMA siembra **4 plantillas del sistema** (Locación Habitacional, Locación Comercial, Boleto de Compraventa, Reserva de Venta).
- Podés **subir tus propias plantillas** (.docx o .pdf, hasta 25MB). La IA las convierte en plantillas reutilizables reemplazando los datos por campos variables. **Límite: 50 plantillas propias** por agencia.
- Cada plantilla tiene un **código único** (`PLT-XXXXXX`) que se hereda a los contratos que se generan con ella.

**Trazabilidad:**
- Cada contrato tiene un **estado de gestión**: `original` (verde), `modificado` (amarillo) o `eliminado` (rojo).
- Modificar o eliminar **exige un motivo**. Como director **conservás el historial completo** (incluso los eliminados).

> 💰 Convertir un documento en plantilla: 1 crédito · Finalizar un contrato: 5 créditos.
> 💡 La firma es **presencial (en papel)**: el PDF queda listo para imprimir y firmar.

---

## 14. Asesores (gestión del equipo)

**Qué es:** donde administrás a tu equipo (la pantalla se titula "Equipo de Asesores").

**Qué podés hacer:**
- **Invitar asesores:** generá un **código de invitación**. El asesor se registra con ese código y queda vinculado a tu agencia.
- **Ver el rendimiento real de cada asesor:** cada tarjeta muestra datos reales tomados de la actividad cargada (Captaciones, Cierres, Cartera activa y % de Rotación), más una etiqueta de estado (Activo / Pausado / Desvinculado). Al hacer clic se abre un panel con su embudo de conversión.
- **Clasificar a un asesor (Client Director / Client Support):** en cada tarjeta tenés dos botones. Tocá uno y el asesor queda marcado con esa clasificación (la ves arriba, en "Rol:"). Tocá **el mismo botón otra vez** y se deselecciona. Si no elegís ninguno, queda simplemente como **Asesor**. Es una **etiqueta interna tuya, para ordenar al equipo: no cambia los permisos ni lo que la persona ve en el sistema** (sigue entrando como asesor, exactamente igual que antes).
- **Pausar un asesor (temporal):** para cuando necesitás dejarlo fuera un tiempo (licencia, motivos internos) sin darlo de baja. Al pausar te pide un **motivo obligatorio**. El asesor pausado **queda deslogueado y no puede volver a entrar** hasta que lo reactivés; si intenta ingresar ve "Tu cuenta ha sido suspendida" (nunca ve el motivo). El mismo botón cambia a **Reactivar** para devolverle el acceso al instante. Su **email no se bloquea**, así que reactivarlo es inmediato.
- **Desvincular un asesor:** lo quita del equipo y **le bloquea el acceso al sistema con ese email** (no podrá volver a ingresar). Al desvincular también te pide un **motivo**. Es una acción más fuerte que la pausa y pide confirmación.
- **Trazabilidad:** cada pausa, reactivación y desvinculación queda registrada con **motivo, fecha y qué director la hizo**. Mientras un asesor está pausado, en su ficha (panel lateral) ves el **motivo, la fecha y quién lo pausó** (esto lo ves solo vos como director; el asesor no).

**Invitaciones (Configuración → Inmobiliaria):** hay dos cajitas, **Invitación de Asesores** e **Invitación de Directores**.
- En cualquiera: escribí el **nombre de la persona** a invitar y apretá **Generar Código**. El nombre queda pegado al código (lo ves aunque todavía no se haya registrado).
- El **código define el rol**: un código de la cajita "Directores" hace entrar a la persona **como director** (mismo poder que vos, sin jerarquía); uno de "Asesores", como asesor. La persona entra directo, sin que tengas que aprobar nada más.
- **Lista compartida:** si la inmobiliaria tiene varios directores, **todos ven la misma lista** de códigos (Activos y Usados, con el nombre de cada invitado). Así nadie invita dos veces a la misma persona.
- **Borrar un código:** cada código de la lista tiene un botón de **papelera 🗑️** para limpiarla (por ejemplo cuando generaste dos códigos para la misma persona, o uno sin querer). Al tocarlo aparece un **cartel de advertencia y confirmación**. Si el código **ya fue usado**, el cartel aclara fuerte que borrarlo **NO desvincula a la persona** (para eso está "Desvincular asesor"): solo saca la fila de la lista.

> 💡 **Tip:** cada código sirve una vez. El código de invitación **no** funciona para "Crear inmobiliaria nueva" (eso necesita el código de Vakdor); si alguien lo intenta, le aparece "Código incorrecto".
> ⚠️ **Pausar vs. Desvincular:** la **pausa** es temporal y la revertís vos con "Reactivar". La **desvinculación** bloquea el email y es más definitiva; si después necesitás reactivar a esa persona, contactá al equipo de PRISMA (Vakdor).

---

## 15. Documentos (base de conocimiento)

**Qué es:** la biblioteca de la agencia (la pantalla se titula "Biblioteca de Conocimiento"). Lo que subís acá **alimenta al Tutor IA**.

**Cómo usarla:**
1. **Subí documentos:** **PDF, Word (.docx/.doc) o CSV**, o un video de **YouTube** (se extrae la transcripción). PRISMA lee el contenido automáticamente.
2. Definí la **visibilidad** de cada documento:
   - **Privado:** solo lo ven los directores.
   - **Público:** lo ve todo el equipo.
3. Para los documentos **Privados** podés activar **"Permitir consulta vía Tutor IA"**: los asesores podrán preguntarle al Tutor IA sobre ese contenido **sin poder verlo ni descargarlo**.
4. Organizá en carpetas (crear, editar, mover, eliminar).

> 💡 **Tip:** subí guiones de venta, manejo de objeciones y procedimientos. El Tutor IA los usará para capacitar a tu equipo automáticamente.

### Solapa "Documentos Oficiales" (descargables, sin IA)

Arriba de la pantalla tenés dos solapas: **"Biblioteca de Conocimiento (IA)"** (lo de arriba) y **"Documentos Oficiales"**.

**Qué es:** una sección **aparte** para la **documentación oficial de la agencia** (contratos, reglamentos, formularios). A diferencia de la Biblioteca, **la IA NO consulta estos archivos**: es solo para que tu equipo los **descargue**.

**Cómo usarla:**
1. **Creá carpetas** con el nombre que quieras (ej. "Reglamentos", "Modelos de contrato"). Podés armar **subcarpetas dentro de una carpeta**: entrá a la carpeta (tocándola) y el botón pasa a llamarse **"Nueva Subcarpeta"**. Arriba ves el camino donde estás parado (**Inicio › Carpeta › Subcarpeta**); tocá cualquier parte para volver. Así podés ordenar tipo "Contratos › Alquiler", "Contratos › Venta".
2. **Subí archivos** con el botón **"Subir Documentos"** (cualquier formato, sin límite de tamaño — se alojan en la nube). Podés **seleccionar varios archivos a la vez**: el **nombre de cada documento se toma del archivo** (no hace falta escribir el título), y elegís **una sola carpeta** (o subcarpeta) donde se guardan todos. Antes de confirmar ves la **lista de archivos elegidos** (con su tamaño y un botón para sacar alguno), y mientras suben ves el **progreso** ("Subiendo 3/8…"); si alguno falla, los demás igual se suben y te avisa cuál no entró.
3. **Reemplazá por una versión nueva** (botón ↻): se sube la nueva y se borra la anterior; el documento muestra "v2", "v3", etc.
4. **Mové** archivos entre carpetas, **renombrá/eliminá** carpetas y **descargá** cuando quieras. Si borrás una carpeta que tiene subcarpetas, **se borran también las subcarpetas**; los **archivos no se borran**, quedan "sin carpeta".

> 🔒 Tus **asesores** ven esta solapa en **solo lectura**: solo navegan carpetas y subcarpetas y descargan, no pueden subir ni modificar nada.

---

## 16. ACM — Análisis Comparativo de Mercado

**Qué es:** herramienta para **encontrar comparables** de una propiedad, con **% de comparabilidad** y **checklist** (ex "Tasaciones"). Idéntica para director y asesor.

**Cómo usarlo:**
1. **Elegí la propiedad a analizar:** a mano, desde la **cartera** (con **buscador**: escribís parte del título, dirección o zona y filtra al toque, ideal cuando tenés muchas propiedades) o pegando un **link** de portal (botón **Analizar**, extrae los datos solos).
2. Elegí **operación** (Venta/Alquiler) y **Buscar comparables**.
3. Resultados en dos bloques (**Cartera de tu agencia** y **Red de colaboración**), cada comparable con su **%** y el **checklist** (barrio, superficie, ambientes, **dormitorios**, baños, **antigüedad**, amenities, tipo, operación). El **precio** va al costado, **fuera del %**.

> ℹ️ Si cambiás de modo (a mano / cartera / link), el formulario **se limpia** para no mezclar datos de una carga con otra.

> 💡 Tipo, operación **y barrio** son filtros estrictos: **todos los comparables son del mismo barrio** que la propiedad analizada (reconoce sub-barrios como Belgrano R/C y no le afectan los acentos). El **checklist compara todo lo que tiene dato real** (suma **dormitorios** y **antigüedad**; si falta un dato, dice "sin dato" y no baja el puntaje). Trae **hasta 50 por bloque**, ordenados por comparabilidad, de **tu cartera** y de la **red de colaboración**.
> 💰 No consume créditos por buscar comparables.

> 📄 **Al imprimir o guardar el informe como PDF**, el archivo se descarga con un **nombre claro**: **`ACM - Dirección - Mes Año`** (ej. `ACM - Arcos 2825 - Julio 2026`), así cada tasación queda con su nombre y no se pisan en la carpeta de descargas (fallback `ACM - Mes Año` si falta la dirección).

### Mis ACM (historial de tu equipo)

Arriba de todo tenés dos solapas: **Nuevo ACM** y **Mis ACM**.

**Cada análisis se guarda solo**, sin que nadie tenga que apretar "guardar". Como director, en **Mis ACM** ves **todos los ACM de tu agencia** —los tuyos y los de cada asesor, con el nombre de quién lo hizo—; el asesor solo ve los suyos.

Cada fila guarda la propiedad analizada y **todos los comparables** que aparecieron (cartera + red de colaboración, con su % y su checklist):

- **Tocá una fila** y se abre la **misma pantalla de resultados**, tal como quedó ese día (aunque después esas publicaciones hayan cambiado o se hayan dado de baja).
- Si de ese ACM salió una **ficha para el cliente**, la fila tiene el botón **"Ficha"** con el link directo.
- Si desde el mismo ACM se arma **otra ficha**, queda **una fila por cada ficha**.
- Se puede **borrar** del historial; si la ficha ya se compartió, **el link sigue funcionando**.

> 💡 Sirve para dos cosas: que nadie repita trabajo ya hecho, y que vos veas **qué se está tasando, en qué zonas y con qué comparables** se lo está mostrando al cliente.

### Crear una ficha para el cliente

Con los comparables a la vista, vos o tus asesores pueden armar una **ficha profesional** para pasarle al cliente (link para compartir **+ PDF**), con la marca de la agencia.

1. Tocá **"Crear ficha"** (arriba a la derecha de los resultados).
2. **Marcá** los comparables a incluir (se pueden mezclar los de la **cartera** y los de la **red de colaboración**). Cada uno ocupa **una hoja** con **todas sus fotos** y características.
3. Tocá **"Crear ficha"** en la barra de abajo: se abre un **link público** listo para compartir.
4. En esa página están **"Descargar PDF"** (para enviar por mail/WhatsApp) y **"Compartir"** (copia el link).

**Qué trae la ficha:**
- **Portada** con la propiedad de referencia, los datos de quien la crea y la fecha.
- **Una hoja por comparable**, con un **banner de mercado** arriba (el **precio de cierre por m²** del barrio y del segmento de 1/2/3 ambientes) y todas las fotos + características.
- **Hoja final** con la **comparación de valores por m²** (promedio y desvío de cada comparable respecto del cierre de **su propia zona**) y los **datos de contacto** de quien la generó.
- El **logo** y el **aviso legal** en el pie de cada hoja (si están cargados).

> 💡 **Tip:** la ficha toma los **colores, el logo y el aviso legal** que definís en **Marketing IA → Identidad Visual**. Si el logo o el aviso legal no están cargados, simplemente no aparecen (y si no hay colores, usa un diseño elegante por defecto). Configurarlos una vez mejora todas las fichas que creen tus asesores.
> 💰 Crear la ficha **no consume créditos**.

---

## 17. Calendario (visitas)

**Qué es:** la agenda de visitas de la agencia. Como director **ves las visitas de todos** y podés **filtrar por asesor**.

**Cómo agendar una visita (botón "Agendar Visita"):**
1. **Información del lead** — 3 formas: desde **Tokko** (desplegable con los leads de la agencia que recopila nombre, teléfono y email con tarjeta de vista previa), desde **WhatsApp**, o **carga manual** (nombre completo, celular, email y etiqueta). El celular se carga con **selector de país** + número natural (normalizado al formato WhatsApp con preview). La carga manual exige **doble verificación** de nombre/celular/email (reescribir sin copiar/pegar, con aviso ✅/❌) y tildar la **casilla de certificación** de que los datos son veraces antes de agendar.
2. **Detalle de la cita:** fecha, hora.
   - **Propiedad (Tokko):** si elegís un asesor, la lista se filtra automáticamente a **sus** propiedades.
   - **Propiedad (Colaboración):** texto libre para una propiedad externa.
3. **Calificación y perfil:** operación, presupuesto, calificación (HOT/WARM/COLD), intereses, objeciones, decisores.
4. **Gestión y asignación:** elegís el **asesor responsable** y el **origen de consulta**.

**Acciones sobre visitas futuras (solo las tuyas):**
- Igual que el asesor, podés **Reprogramar / Editar** y **Cancelar**, pero **solo en las visitas que tenés asignadas a vos** (las que agendaste para vos mismo). En las visitas de tus asesores ves el **detalle completo** pero **sin** botones de acción (esas las maneja el asesor responsable).
- **Reprogramar / Editar:** con **motivo obligatorio** (la visita queda marcada como "Modificada").
- **Cancelar:** confirma con pop-up y **motivo obligatorio** (se muestra el motivo en rojo).
- Solo aplica a **visitas futuras** y **agendadas**: las pasadas o ya canceladas no se pueden modificar.

> 💡 **Tip:** asigná siempre un responsable claro. El detalle de cada visita muestra intereses, objeciones, decisores y resumen, útil para el seguimiento.

---

## 18. Tutor IA

**Qué es:** mentor con IA que responde usando los **documentos de la Biblioteca** de tu agencia.

**Cómo usarlo:** preguntale lo que quieras sobre tus manuales y procedimientos. Te responde y te muestra las **fuentes** que usó.

> 💡 **Tip:** probalo después de subir documentos para verificar que el Tutor "aprendió" bien tu material.
> 💰 1 crédito por mensaje.

---

## 19. Buscador IA (+ notas del director)

**Qué es:** buscador conversacional de propiedades. Combina tu cartera de Tokko con una **red de colaboración** de propiedades externas.

**Cómo usarlo:**
1. Escribí lo que busca el cliente: *"3 ambientes en zona norte por menos de 250k con cochera"*.
2. Entiende operación, zona, tipo, presupuesto (USD o pesos), **ambientes** (no los confunde con dormitorios) y **todos los servicios/amenities** (cochera, pileta, parrilla, SUM, seguridad, balcón, terraza, gimnasio, baulera, apto profesional…).
3. Devuelve tarjetas en 3 grupos (**propias**, **agencia**, **red de colaboración**), ordenadas por un **% de coincidencia** visible en cada tarjeta (verde = justo lo pedido, ámbar = comparable, gris = más lejano). Busca sobre **toda** la red de colaboración, no una muestra.
4. **Primero pregunta, después busca:** para una búsqueda óptima pide 5 datos —**operación, tipo, zona, ambientes y presupuesto**—. Si falta alguno, **no muestra nada todavía**: repregunta de forma natural y recién busca cuando los tiene. **Y si no hay más datos, lo decís como quieras** (*"mostrame igual"*, *"dale, lo que tengas"*, *"no tengo más"*, *"avanzá"*) y busca con lo que haya — no depende de una frase exacta, lo interpreta.
5. **No pierde ventas:** muestra las exactas **y** los comparables cercanos (con menor %), pero descarta lo que no corresponde (un "2 ambientes" nunca trae un "4 ambientes").
6. Podés **refinar** sin repetir todo; el chat **recuerda** la conversación.

**Entiende mejor:** **"en venta"** trae solo venta (no mezcla con alquiler); **entiende la jerga del rubro** —*"espacio aéreo"*, *"patio o balcón"*, *"aire libre"*, *"a estrenar"*, *"en pozo"*, *"apto crédito"*, *"semipiso"*, *"categoría/premium"*—; **"depto y PH"** trae los dos tipos juntos (reconoce el PH aunque esté cargado con otro nombre); **"monoambiente"** lo toma como 1 ambiente aunque la ficha no use la palabra; **"piso alto/bajo"** = piso del depto en el edificio (**alto = 6° o más**, bajo/medio = PB al 5°; las que no informan el piso aparecen igual y conviene confirmarlas); y **características sueltas** como *"al frente"*, *"a estrenar"* o *"apto crédito"* las busca en toda la ficha para priorizarlas.

**Notas / directivas del director (exclusivo tuyo):**
- Dentro del Buscador tenés una solapa de **Notas** donde escribís indicaciones en **texto libre** (ej.: "evitar colaborar con tal inmobiliaria", "tal propiedad acepta permuta").
- Estas notas **aplican a vos y a todos tus asesores**: cuando una propiedad o inmobiliaria coincide con una nota, el Buscador la comunica como una **consideración**.

> 💡 **Tip:** las notas son ideales para bajar criterios comerciales a todo el equipo sin tener que avisarles uno por uno.

> 🔎 La **red de colaboración** son propiedades de **otras inmobiliarias** (en venta y alquiler) que amplían la oferta de tu equipo más allá de la cartera propia.
> ⚠️ El asesor **no ve** la solapa de Notas; solo recibe las consideraciones en sus búsquedas.
> 📱 **Desde el celular:** el chat se ve a pantalla completa. El **historial de búsquedas** queda escondido y se abre tocando el ícono del robot (arriba a la izquierda) o la pestaña de la izquierda; se cierra solo al elegir una búsqueda o tocando fuera.
> 💰 1 crédito por búsqueda.

### Compartir ficha con el cliente

Cuando vos o tus asesores hacen una búsqueda en el **Buscador IA** y abren el detalle de una propiedad (en los resultados), tienen el botón **"Compartir ficha"**: genera una **página de presentación profesional y de lujo** (con un link que se copia solo) para mandarle al cliente por WhatsApp. Muestra fotos, precio, datos, y la **tarjeta de contacto del asesor que la generó** (su WhatsApp y email), pintada con los **colores y el logo de tu inmobiliaria**.

> 🎨 **Importante para vos:** esos colores, la tipografía y el logo salen de **Marketing IA → Configuración IA**. Si los configurás bien, **todas las fichas que compartan tus asesores salen con tu identidad de marca**. Si no, usan un diseño elegante por defecto.
> 🔒 El cliente externo **no** ve de qué portal salió la propiedad (es info interna), ni puede acceder al sistema desde el link: es solo una vitrina de presentación de solo lectura.

---

## 20. Configuración (perfil, agencia, créditos, costos, seguridad)

La pantalla se titula "Ajustes Generales". Tiene 5 pestañas:

**1. Mi Perfil**
- Tu **nombre** visible y foto. El **email** es de solo lectura.

**2. Inmobiliaria**
- **Nombre** legal/fantasía de la agencia.
- **Tokko Broker API Key:** al guardarla con una key válida, PRISMA **sincroniza propiedades y leads automáticamente** en segundo plano.
- **Logo de la agencia** (PNG/JPG/SVG hasta 2MB).
- **Invitación de Asesores:** generá códigos únicos y copialos para compartir.

**3. Créditos IA**
- El **dashboard de créditos** de toda la agencia: cuánto se consumió por cada módulo (los 7 módulos de IA con su ícono).

**4. Costos Meta**
- El **panel de costos de WhatsApp** (gastos de la mensajería de Meta).
- **Token de Meta:** muestra si tu token está **válido o vencido**, tu **límite diario real** (leído de Meta) y un campo para **pegar el token permanente** (System User) sin reconectar. Si "Costos", "Sincronizar plantillas" **o el envío de mensajes** fallan, casi siempre es el token vencido: lo actualizás acá. Al **"Guardar y validar"**, PRISMA además **reconecta WhatsApp con el token nuevo automáticamente** (se corta la conexión unos segundos y vuelve; **no se pierde ningún chat ni lead**), así los mensajes vuelven a salir enseguida.

**5. Acceso & Seguridad**
- **Restablecer contraseña** (te llega un link).
- **Notificaciones administrativas:** avisos diarios de performance del equipo.

> 💡 **Tip:** si cambiás la API Key de Tokko, guardá para disparar una sincronización fresca.

---

## 21. Sugerencias

**Qué es:** canal directo para enviar feedback al equipo de PRISMA (Vakdor).

**Cómo usarlo:** escribí tu idea, problema o pedido. El equipo le da seguimiento.

---

## 22. Análisis de conversaciones (Inteligencia Conversacional)

**Qué es:** un análisis profundo de **todas las conversaciones de WhatsApp** de tu agencia. **Es exclusivo del director.** No es una sección aparte del menú: aparece **embebido dentro del Dashboard** (sección "Inteligencia Conversacional").

**Qué muestra (sin costo de créditos, es pura estadística):**
- **KPIs:** chats únicos, leads calificados, visitas agendadas, reservas, derivaciones a humano, seguimientos enviados, tasas de conversión, etc.
- **Funnel de conversión:** de chats recibidos → calificados → visita → reserva.
- **Perfil del lead buscador:** qué tipos de propiedad/operación, zonas, ambientes, presupuestos y amenities se piden más.
- **Análisis de demanda:** zonas más buscadas, tasa de visita por tipo.
- **Comportamiento temporal:** horas y días pico (heatmap), duración promedio.
- **Calidad de atención:** tasa de resolución del bot, objeciones frecuentes, causas de no avance.

> 💡 **Tip:** es tu herramienta de inteligencia comercial. Te dice qué pide realmente tu mercado y dónde se cae el embudo.
> 💡 Los datos se recalculan periódicamente (no en cada visita), así que pueden tener unas horas de antigüedad.

---

## 23. Créditos IA: cómo administrarlos

- Las herramientas de IA consumen **créditos**, que salen de la **bolsa general de la agencia**.
- Vos definís cómo se reparte entre los asesores (el límite mensual de cada asesor se calcula como el pool de asesores / asesores activos, y se renueva el 1° de cada mes).
- En **Configuración → Créditos IA** ves el consumo de toda la agencia por módulo.

**Costos de referencia:**

| Herramienta | Costo por uso |
|---|---|
| Buscador IA | 1 crédito |
| Tutor IA | 1 crédito |
| Marketing IA — "Generar 3 Variantes" | ~7 créditos (3 textos + 3 imágenes) |
| ACM (comparables) | **0 — sin costo por uso** |
| Convertir documento a plantilla | 1 crédito |
| Contratos (finalizar) | 5 créditos |

> ⚠️ Si la agencia se queda sin créditos, las herramientas de IA se bloquean para todo el equipo. La **recarga** la gestiona el equipo de PRISMA (Vakdor); usá **Sugerencias** o el canal de contacto.

---

## 24. Checklist de puesta en marcha

- [ ] Crear la agencia (registro como director).
- [ ] Cargar **Tokko API Key** → se sincronizan propiedades y leads.
- [ ] Subir **logo** y datos de la agencia.
- [ ] Conectar **WhatsApp** (asistente de configuración en "Asesor IA en WhatsApp").
- [ ] Verificar que las **8 plantillas** de seguimiento queden aprobadas.
- [ ] Configurar **directiva creativa** y **aviso legal** en Marketing IA.
- [ ] Definir **escalas de puntaje** en Tracking Performance.
- [ ] Cargar los **objetivos mensuales** de cada asesor (Tracking Performance → Objetivos).
- [ ] Subir **documentos** a la Biblioteca (para el Tutor IA).
- [ ] Cargar **notas/directivas** en el Buscador IA si tenés criterios comerciales.
- [ ] **Invitar a los asesores** con su código.
- [ ] Revisar el **Dashboard** y el **Análisis de conversaciones** una vez con actividad.

---

## 25. Preguntas frecuentes

**Cargué la API Key de Tokko pero no veo propiedades.**
Verificá que la key sea correcta y volvé a guardar (eso fuerza la sincronización). Mirá el aviso de "Sincronizando Tokko en segundo plano".

**¿Cómo activo los seguimientos automáticos de WhatsApp?**
Necesitás WhatsApp conectado y las **8 plantillas aprobadas por Meta**. PRISMA revisa la aprobación a diario y activa los flujos cuando están todas aprobadas.

**¿Los asesores ven mis "Notas" del Buscador IA?**
No. Solo reciben las **consideraciones** que se derivan de esas notas en sus búsquedas. La solapa de Notas es solo tuya.

**¿Puedo recuperar un contrato eliminado?**
El director conserva la trazabilidad: los contratos eliminados siguen visibles en "Contratos Generados" (en rojo, con su motivo). No se borran de verdad.

**¿La firma de contratos es digital?**
No, es **presencial (en papel)**. PRISMA genera el PDF listo para imprimir.

**¿Cómo recargo créditos de IA?**
La recarga la administra el equipo de PRISMA (Vakdor). Usá **Sugerencias** o el canal de contacto.

**¿Cuál es la diferencia entre "Leads Tokko" y "Leads WhatsApp"?**
Los primeros vienen del CRM Tokko; los segundos se capturaron por WhatsApp. El **Pipeline** los une a ambos en un solo tablero.

---

## 25-bis. Sincronización de visitas con Google Calendar

Tanto vos (director) como cada asesor pueden **vincular su propia cuenta de Google** para que sus visitas aparezcan en su calendario personal. Es **opcional y personal**: cada uno conecta la suya desde **Configuración → pestaña «Integraciones» → Conectar Google Calendar**.

**La regla de oro:** cada visita se sincroniza al Google de **una sola persona: el "asesor responsable" de esa visita**. No importa quién la creó, sino a quién está asignada.

**Qué significa para vos como director:**
- **Vos también podés conectar tu Google** y agendarte **visitas propias**. Para eso, en **Calendario → Nueva Visita**, elegite **a vos mismo** en el campo «Asesor Responsable». Esa visita irá **solo a tu** Google.
- Las visitas de tus asesores tienen como responsable al asesor → van **al Google de cada asesor**, **nunca al tuyo**. Tu calendario de Google no se llena con las visitas del equipo.
- Si creás una visita y se la asignás a un asesor, el evento aparece en **el Google de ese asesor** (si lo conectó), no en el tuyo.
- El **calendario de PRISMA** del director sigue mostrando **todas** las visitas de la agencia como siempre. Lo que cambia es solo qué se espeja en cada Google personal.
- La sincronización es **de PRISMA hacia Google**, una sola dirección: si alguien borra el evento en su Google, la visita **sigue intacta en PRISMA**. Si Google falla, la visita **igual se guarda** (nunca bloquea el agendado).

> Nota de puesta en marcha: requiere que el administrador (Vakdor) tenga configuradas las credenciales de Google en el servidor. Si en la pestaña Integraciones aparece "la integración no está habilitada", avisá a soporte.

---

## 26. Personalizaciones de tu agencia

PRISMA es **modular**: tu agencia puede tener módulos **habilitados o deshabilitados** según tu plan o tus necesidades. No todas las agencias usan todas las herramientas.

**Cómo se ve un módulo deshabilitado:** aparece en el menú lateral **atenuado (en gris) con la etiqueta «Deshabilitada»**, no se puede abrir y, si se entra por el enlace directo, el sistema redirige al Dashboard. Aplica al director y a todos los asesores de la agencia.

> 💡 Para **habilitar o deshabilitar** un módulo de tu agencia, coordinalo con el equipo de PRISMA (Vakdor).

---

## FIN DE LA GUÍA

Esta guía refleja el sistema PRISMA tal como funciona hoy. Para la guía operativa de tu equipo, compartiles el documento **«PRISMA - Guía del Asesor»**.
