# ACM · Servicio extractor (Tier 2) en EasyPanel — paso a paso

Este servicio es el "navegador disfrazado" que lee propiedades de portales que bloquean
la lectura simple (MercadoLibre, ZonaProp, Argenprop, etc.). La app PRISMA le pega cuando
apretás **Analizar** y el portal no se deja leer de forma directa.

Es **independiente del crawler de roomix**: el crawler es una tarea programada (se prende,
recolecta, se apaga); este extractor es un servicio **siempre prendido** que espera pedidos.
Usa el mismo código (`roomix-sync/`) y la misma imagen de Playwright.

---

## Qué se sube

Ya están en el repo, dentro de `roomix-sync/`:
- `extractor-server.mjs` — el servidor HTTP con Playwright stealth.
- `Dockerfile.extractor` — imagen del servicio (igual a la del crawler, pero arranca el extractor).
- script `npm run start:extractor`.

---

## Pasos en EasyPanel

1. **Entrá a tu proyecto en EasyPanel** (el mismo donde está el crawler de roomix).

2. **Create Service → App.** Ponele de nombre, por ejemplo, `acm-extractor`.

3. **Source (origen del código):** apuntá al **mismo repositorio Git** que usa el crawler.
   - Branch: la que tengas en producción (ej. `main`).
   - **Build context / Root directory:** `roomix-sync`
   - **Dockerfile:** `Dockerfile.extractor`  ← (importante: NO el `Dockerfile` normal)

   > Si tu crawler hoy no se construye desde Git sino de otra forma, igual sirve: lo importante
   > es que el build use la carpeta `roomix-sync` y el archivo `Dockerfile.extractor`.

4. **Environment (variables):** agregá:
   - `GEMINI_API_KEY` = (la misma que ya usás) — opcional, mejora el fallback.
   - `EXTRACTOR_SECRET` = inventá una clave larga (ej. `acm_8f3k...`). Sirve para que solo
     PRISMA pueda usar el servicio. **Anotala**, la vas a poner también en PRISMA.
   - `PORT` = `80` (o dejalo; el default ya es 80).
   - `EXTRACTOR_CONCURRENCY` = `2` (cuántas URLs en paralelo; con 2 alcanza).

5. **Port / Networking:** exponé el puerto **80**. EasyPanel te va a dar una URL interna
   (algo como `http://acm-extractor:80`) y/o un dominio. Anotá esa dirección.

6. **Deploy.** Esperá a que levante. Para probar que está vivo, abrí en el navegador
   `https://<tu-dominio-del-servicio>/health` → debe responder `{"ok":true,...}`.

---

## Conectar PRISMA al servicio

En el proyecto **PRISMA** (donde corre la app Next.js), agregá estas variables de entorno
(en Vercel/EasyPanel/donde esté hosteada la app, y en tu `.env.local` para probar local):

```
ACM_EXTRACTOR_URL=https://<la-url-del-servicio>/extract
ACM_EXTRACTOR_SECRET=<el mismo EXTRACTOR_SECRET de arriba>
```

> Si el extractor está en la red interna de EasyPanel y PRISMA también, podés usar la URL
> interna `http://acm-extractor:80/extract`. Si PRISMA está en Vercel (fuera de EasyPanel),
> necesitás un dominio público para el extractor y usar `https://.../extract`.

Reiniciá/redeployá PRISMA para que tome las variables. Listo: cuando un portal bloquee,
el botón **Analizar** caerá automáticamente a este servicio.

---

## Probar de punta a punta

1. `GET https://<servicio>/health` → `{"ok":true}`.
2. En PRISMA → ACM → modo **Desde un link** → pegá un aviso de MercadoLibre o ZonaProp →
   **Analizar** → ahora debería traer los datos reales (tipo, m², ambientes, precio, responsable, fecha).

## Notas

- Si querés probar el servicio a mano (con la clave):
  ```bash
  curl -X POST https://<servicio>/extract \
    -H "Content-Type: application/json" \
    -H "x-extractor-secret: <EXTRACTOR_SECRET>" \
    -d '{"url":"https://www.zonaprop.com.ar/..."}'
  ```
- El servicio levanta 1 navegador y lo reutiliza. Consume algo de RAM (~300-500 MB). En
  EasyPanel alcanzá con un contenedor chico.
- No es para uso masivo: 1 request por click. Si algún día hiciera falta volumen, se sube
  `EXTRACTOR_CONCURRENCY`.
