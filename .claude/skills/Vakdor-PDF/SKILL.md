---
name: Vakdor-PDF
description: Convierte documentos Markdown (.md) en PDFs profesionales con la marca Vakdor/PRISMA — portada con logo, color cobre, índice clickeable, tablas y "tips" estilados, pie de página con numeración. Úsala cuando el usuario pida exportar/convertir documentación a PDF "presentable", "para clientes", "con la marca", o regenerar los PDFs de PRISMA. Acepta cualquier marca vía config.
---

# Vakdor-PDF

Genera PDFs **profesionales y on-brand** a partir de archivos Markdown, con el mismo
diseño aprobado para la documentación de PRISMA (cobre `#b87333`, logo en portada,
tipografía legible, tablas con cabecera cobre, blockquotes como "tips", numeración de
páginas y portada con título/subtítulo).

## Cuándo usarla

- "Exportá/convertí estos `.md` a PDF bien presentados / para clientes."
- "Regenerá los PDFs de PRISMA (Guía del Director, del Asesor, Técnica)."
- "Hacé un PDF con la marca a partir de este documento."

## Cómo funciona

`generate.mjs` toma un **config JSON** que describe la marca, la carpeta de salida y la
lista de documentos, y produce un PDF por documento usando **marked** (Markdown→HTML) +
**Playwright/Chromium** (HTML→PDF). El logo PRISMA viene incluido en `assets/logo-icon.png`
y se usa por defecto; cualquier campo de marca puede sobrescribirse en el config.

## Pasos para ejecutar

1. **Asegurar dependencias** (`marked` y `playwright` con Chromium). Si hay un proyecto
   con ellas (p. ej. `PRISMA-SYSTEM/roomix-sync` ya tiene `playwright` y el navegador
   instalado), corré el script desde ahí. Si faltan:
   ```bash
   npm install marked playwright        # marked + playwright (--no-save si no querés tocar package.json)
   npx playwright install chromium      # solo si Chromium no está instalado
   ```
2. **Escribir el config** (ej. `vakdor-pdf.config.json`). Ver formato abajo. Las rutas
   relativas se resuelven respecto a la ubicación del config.
3. **Ejecutar**:
   ```bash
   node "<ruta-a-la-skill>/generate.mjs" vakdor-pdf.config.json
   ```
4. **Verificar (opcional pero recomendado):** abrir 1–2 páginas a imagen para QA visual
   (portada + una página con tabla). Si no hay visor de PDF, renderizar el HTML con
   Playwright `page.screenshot({ fullPage:true, clip:{...} })` y revisar.
5. **Limpiar temporales** que hayas creado (config, capturas de QA) si el usuario no los
   pidió. No dejes residuos en el repo. Si instalaste paquetes con `--no-save`,
   desinstalalos al terminar para dejar el proyecto como estaba.

## Formato del config

```json
{
  "outDir": "C:/Users/.../Documentos - PRISMA",
  "brand": {
    "name": "PRISMA IA",
    "tagline": "Real Estate · Sistema Inteligente",
    "footerBrand": "PRISMA IA",
    "confidential": "Documento confidencial — uso interno y de clientes PRISMA",
    "copyright": "© 2026 Vakdor",
    "dateLabel": "Junio 2026",
    "copper": "#b87333",
    "copperLight": "#e29e6d",
    "dark": "#131A2D",
    "logo": "ruta/opcional/logo.png"
  },
  "docs": [
    {
      "file": "C:/Users/.../FUNCIONAL-DIRECTOR-PRISMA.md",
      "out": "PRISMA - Guia del Director.pdf",
      "kicker": "Guía de Usuario",
      "title": "Guía del Director",
      "subtitle": "Administración del sistema, configuración y uso"
    }
  ]
}
```

- **`brand`** es **opcional**: si se omite, se usa el branding PRISMA/Vakdor por defecto
  (cobre + logo incluido en la skill). Sobrescribí solo lo que necesites.
- Cada **doc**: `file` (Markdown origen), `out` (nombre del PDF), y para la portada
  `kicker` (etiqueta superior), `title`, `subtitle`. Por defecto se **elimina el primer
  H1** del Markdown (la portada ya muestra el título); poné `"dropFirstH1": false` para
  conservarlo.

## Detalles de diseño (no cambiar sin pedido)

- **Color de marca:** cobre `#b87333` (acentos, títulos, cabeceras de tabla, bullets,
  enlaces). Navy oscuro `#131A2D` para el círculo del logo y bloques de código.
- **Portada:** barra cobre superior, logo en círculo oscuro con borde cobre (sin
  `box-shadow` — algunos visores de celular lo pintan como un rectángulo oscuro),
  wordmark + tagline, kicker, título grande, subtítulo, regla cobre, línea meta y nota de
  confidencialidad + copyright al pie.
- **Contenido:** H1 con borde inferior cobre; H2 con barra lateral cobre; tablas con
  cabecera cobre y filas alternadas (`#faf6f1`); blockquotes como tarjetas "tip" con
  borde cobre; código inline y bloques `pre` estilados; índice (TOC) clickeable (se
  inyectan `id` estilo GitHub a los headings para que los enlaces `#ancla` funcionen).
- **Página:** A4, márgenes 18/16/15/15 mm, pie con marca + título + "Página X de Y".
- **Tipografía:** Segoe UI / Helvetica / Arial; cuerpo 10.5pt, interlineado 1.62.

## Notas

- El script es **autocontenido** salvo `marked` y `playwright`, que son librerías node.
- Para múltiples marcas/clientes, duplicá el bloque `brand` en distintos configs.
- Funciona en Windows; las rutas con espacios deben ir entre comillas.
