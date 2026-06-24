---
name: vakdor-carousel
description: Experto en creación de carruseles e imágenes con la identidad visual de Vakdor. Usar SIEMPRE que el usuario pida crear un carrusel, slide, imagen de marca, post visual, o cualquier pieza gráfica. Triggerea también cuando mencione "carrusel", "slide", "imagen para redes", "pieza visual", o pida contenido visual con copy persuasivo. Antes de generar, analiza los assets de marca desde el código disponible. Integra la skill vakdor-copywriter para el copy.
---

# Vakdor Carousel — Skill de Creación Visual

## Flujo obligatorio antes de generar

### Paso 1 — Cargar brand assets

**Primero:** leer `assets/brand.json` (es la FUENTE ÚNICA de la marca). Usar siempre esos valores. Si el archivo no existe, recrearlo con la paleta de la "Regla de Colores Estricta" de abajo.

**Regla de Colores Estricta (deben coincidir con `brand.json`):**
- **Fondo de las slides:** Azul oscuro Vakdor `#0A0F1A`.
- **Título:** Blanco `#FFFFFF`.
- **Texto secundario / párrafos:** Gris claro `#B4BAC5`.
- **Acentos (líneas, bullets, paginación, botón CTA):** Cobre Vakdor `#C07C41`.

**Logos Requeridos:**
- **Logo Vakdor:** Debe existir en `assets/logo-vakdor.png` dentro del proyecto destino.
- **Logo PRISMA:** Extraído del codebase (`logo-icon.png`).

---

### Paso 2 — Preguntar sobre el contenido
Si el usuario no especificó el tema o el objetivo del carrusel, hacer UNA sola pregunta:
> "¿Sobre qué es el carrusel y a quién va dirigido?"
No preguntar más de lo necesario. Si ya está claro, avanzar directo.

---

### Paso 3 — Delegar TODO el contenido a vakdor-copywriter

Esta skill **NO escribe contenido**: solo arma la estructura visual (imágenes, PDF, blogs, posts, etc.). Todo el copy de cada slide — texto, ángulo, fuente de información, persuasión — lo define la skill **vakdor-copywriter**, que es la skill base de contenido.

Por lo tanto, antes de maquetar, activar SIEMPRE **vakdor-copywriter** y pedirle el copy de la pieza. Ella decide de dónde sale la información (ej. leer `FUNCIONAL-DIRECTOR-PRISMA.md` para contenido de venta/técnico, o trabajar conceptual para autoridad/educación). `vakdor-carousel` solo toma ese copy ya resuelto y lo coloca en la estructura del Paso 4.

---

### Paso 4 — Diseño Estricto y Exportación (Playwright)

El output ya no es solo código, sino los PNGs exportados a calidad óptima para producción.

**Estructura HTML, Tailwind CSS y Diseño Estandarizado de cada Slide:**
- **Resolución y Fondo:** `<div id="slide-XX" class="w-[1080px] h-[1080px] bg-[#0A0F1A] text-white relative font-sans overflow-hidden">`
- **Tailwind Config Obligatoria:** Inyectar `<script src="https://cdn.tailwindcss.com"></script>` y configurar la fuente `Inter` en el `<head>`.
- **Logos (Equilibrio Visual):**
- **Logos (Equilibrio Visual):**
  - Logo Vakdor: `<img src="../../../assets/logo-vakdor.png" class="absolute top-16 left-20 w-[80px] h-[80px] object-contain">`
  - Logo PRISMA: `<img src="../../../assets/logo-icon.png" class="absolute top-16 right-20 w-[80px] h-[80px] object-contain">`
- **Contenedor Principal (ALINEACIÓN ESTRICTA Y UNIFORME):** TODO el contenido debe estar agrupado dentro de un contenedor posicionado absolutamente: `<div class="content absolute top-[280px] left-20 right-20 flex flex-col items-start">`.
  - **REGLA CRÍTICA:** NUNCA utilizar estilos inline como `style="top: 350px;"` para acomodar textos en slides individuales. Todas las slides deben usar exactamente la misma altura base (`top-[280px]`) para que la raya de acento y el título comiencen exactamente en el mismo pixel y no "salten" al deslizar el carrusel.
- **Línea de Título:** Precediendo el título: `<div class="w-24 h-[6px] bg-[#C07C41] mb-10"></div>`.
- **Tipografía y Proporciones:**
  - Título Principal `h1`: `<h1 class="text-[80px] font-bold leading-[1.1] tracking-tight mb-10 text-white">`
  - Párrafos Secundarios `p`: `<p class="text-[45px] font-normal leading-[1.5] text-[#B4BAC5] max-w-[850px]">`
  - Listas/Bullets: `<li class="flex items-center gap-6 mb-6"><div class="w-4 h-4 rounded-full bg-[#C07C41]"></div><span class="text-[45px] text-[#B4BAC5]">Texto</span></li>`
- **Paginación (Esquina Inferior Izquierda):** Formato corto "— 01" sin el total.
  - `<div class="absolute bottom-16 left-20 flex items-center gap-6"><div class="w-16 h-[3px] bg-[#C07C41]"></div><span class="text-[35px] font-bold text-[#B4BAC5]">01</span></div>`
- **Botón CTA (Slide Final):** 
  - Pastilla redondeada naranja: El botón final del carrusel **debe pedir siempre de forma uniforme la palabra "SISTEMA"**:
    `<div class="mt-12 bg-[#C07C41] px-12 py-5 rounded-full inline-flex items-center"><span class="text-[35px] font-bold text-white">Comentá SISTEMA &rarr;</span></div>`

**Caso Especial: Imagen Única (Single Slice)**
Cuando se pida una sola imagen o slide:
- Seguir el mismo proceso pero definiendo únicamente `#slide-01`.
- Se omite la numeración de secuencia en el diseño.

**Caso Especial: Portada de Artículo (Open Graph)**
Cuando se pida una "portada de artículo", "portada", o imagen para "thumbnail" / "Open Graph":
- **Resolución:** Cambiar el contenedor principal a `w-[1200px] h-[630px]`.
- **Logos:** Reducir tamaño a `w-[60px] h-[60px]`. Posicionarlos en `../../../assets/logo-vakdor.png` y `../../../assets/logo-icon.png` en `top-8 left-12` y `top-8 right-12`.
- **Contenedor Principal:** Posicionar más arriba y con márgenes ajustados: `<div class="absolute top-[140px] left-12 right-12 flex flex-col items-start z-10">`.
- **Tipografía ajustada:** 
  - Título: `text-[55px] mb-6`
  - Párrafo: `text-[30px] max-w-[800px] mb-8`
  - Bullets: `text-[26px]`
  - Línea acento: `w-20 h-[5px] mb-6`

**Proceso de Generación y Exportación (`export.js`):**

> ⛔ **REGLA DE ORO DE SALIDA (INQUEBRANTABLE):** Esta skill se INVOCA desde el proyecto PRISMA-SYSTEM, pero NUNCA debe crear, escribir ni descargar NINGÚN archivo dentro de `PRISMA-SYSTEM`. TODO el output (carpetas, `export.html`, `export.js`, PNGs, `carousel.pdf`, `copy.md`, imágenes generadas, registro en memoria) va SIEMPRE con ruta absoluta dentro de `C:\Users\LENOVO\Desktop\CODE\Antigravity - Apps\Prisma - MK`. Se permite LEER de PRISMA-SYSTEM (ej. logos, `.env`), nunca escribir.

**UBICACIÓN OBLIGATORIA:** Todo el trabajo (creación de carpeta, `export.html`, `export.js` y exportación de PNGs) debe realizarse dentro de la carpeta fechada en `Activos de Marketing/[Fecha Actual]` (ej. `Activos de Marketing/15 de junio de 2026`) en el directorio de marketing: `C:\Users\LENOVO\Desktop\CODE\Antigravity - Apps\Prisma - MK\Activos de Marketing\[Fecha Actual]\[nombre-del-carrusel]`.
1. **Verificación de Memoria:** Antes de iniciar, consultar siempre `C:\Users\LENOVO\Desktop\CODE\Antigravity - Apps\Prisma - MK\memoria.md` para verificar qué copies y ángulos se han usado antes y no repetir.
2. Crear el archivo `export.html` en la ubicación obligatoria.
3. Crear un script `export.js` que utilice `playwright` y `pdfkit`. (Asegurarse de darle tiempo a Tailwind CDN para cargar antes del screenshot).
4. Ejecutar `node export.js`. El script debe limpiar archivos viejos, tomar captura de cada `#slide-` y compilar el `carousel.pdf`.
5. **Registro en Memoria:** Registrar el activo generado con todo su análisis, copy, objetivo y slides en el archivo de memoria al finalizar.
6. **Archivo de Copy Unificado (`copy.md`):** Crear obligatoriamente un archivo `copy.md` dentro de la carpeta del activo. Este archivo debe contener la descripción completa del post de LinkedIn y el primer comentario, unificando todo el material del activo en su propia carpeta.

---

### Paso 5 — Integración de Nano Banana Pro 2 para Elementos Gráficos
Si la slide o imagen única requiere un fondo ilustrado, una foto de una propiedad real, o un elemento gráfico de soporte (en vez de solo textos y colores planos):
1. Usar la API de **Nano Banana Pro 2** (modelo `gemini-3-pro-image-preview`) para generar la imagen.
2. Escribir y ejecutar el script helper (`generate-image.js`) DENTRO de la carpeta del activo en `Prisma - MK` (nunca en PRISMA-SYSTEM), para descargar la imagen usando `@google/generative-ai` y la variable de entorno `GEMINI_API_KEY`. La key se puede LEER del `.env` de `Prisma - MK` o del `.env` de `PRISMA-SYSTEM`, pero el script y la imagen se guardan en `Prisma - MK`.
3. Guardar la imagen generada en la carpeta `assets/` de la carpeta del activo en `Prisma - MK` (ej. `.../[nombre-del-carrusel]/assets/generated-house.jpg`).
4. Referenciar la imagen generada localmente en la estructura HTML (`export.html`) para que Playwright la renderice en la slice final.

---

## Actualización de brand assets
`assets/brand.json` es la fuente única de la marca de marketing (identidad oscura: fondo `#0A0F1A`, cobre `#C07C41`). Si el usuario dice "actualizá los colores", "cambié el logo", o similar: editar directamente `assets/brand.json` con los valores que indique el usuario (o pedirle el logo actualizado). NO re-escanear el codebase de PRISMA-SYSTEM: ese es el tema de la app (claro) y NO es la identidad de los carruseles.
