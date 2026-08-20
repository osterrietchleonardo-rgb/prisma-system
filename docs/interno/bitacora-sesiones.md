# Bitácora de sesiones

> **Para el agente, no para Leonardo.** Se lee al empezar cada sesión para no arrancar de
> cero. Lo entrada más nueva va arriba. Corta: qué se hizo, qué se decidió, qué quedó.
>
> La bitácora del negocio —qué se decidió, con quién se habló, qué se esquivó— va en el
> vault de Obsidian, en `10 Bitácora/`. Esa la lee Leonardo. Esta la leo yo.

## Cómo se usa

- **Al empezar:** leer las últimas 3 entradas. Alcanza para saber dónde quedó todo.
- **Al terminar algo importante:** agregar la entrada del día arriba de todo. Si el día ya
  tiene entrada, se le suma; no se crea otra.
- **Qué NO va acá:** lo que ya está en un archivo propio. Si el Norte cambió, se cambia el
  Norte y acá va una línea que lo dice. Esto es un índice de lo que pasó, no un duplicado.

---

## 2026-08-20

**Qué se construyó**

- `outbound-diario.mjs`: entra a Sales Navigator con la sesión real, lee la búsqueda
  guardada con paginación y deja **10 candidatos del día en "sin contactar"** en el
  pipeline, con link al perfil y el motivo de la elección. Nunca manda mensajes.
- Se versionó `scratch/clickup-ids.json`: los dos scripts dependen de él y estaba solo en
  el disco, dentro de una carpeta gitignoreada.
- Se escribieron 4 memorias de proyecto (el Socio, el Norte, el outbound y el vault). Antes
  la memoria entre sesiones no sabía que nada de esto existía.

**Tres decisiones**

- El filtro del outbound **no usa la marca "Guardado"**: se cruza contra las dos bandejas
  reales. Guardar un lead no es escribirle, y estaba escondiendo a los mejores.
- **Un saludo no cuenta como contacto.** Los que solo tienen "me alegro de que hayamos
  conectado" o una felicitación suben al principio de la lista.
- Se descarta por **sub-rubro**, no por cargo: gerentes y socios entran; desarrolladoras,
  constructoras, tasadoras y cámaras no, porque no tienen equipo de asesores.

**Errores propios**

- Un reemplazo automático escapó todas las letras "s" y "d" del script y lo rompió. Se
  restauró de Git y se reescribió entero. Causa raíz: `\s` dentro de un template literal
  llega al navegador como `s`. Todo el código que va al navegador usa `String.raw`.
- Se cambiaron los estados de la lista de ClickUp con tareas adentro y quedaron huérfanas
  (la lista decía 5 y ninguna consulta las traía). Orden correcto: primero los estados,
  después las tareas.

**Hallazgos que valen plata**

- 5 CEOs de inmobiliaria (SkyOne, BRIKSS, R&R, Döst) solo habían recibido una felicitación
  de aniversario. Nunca la propuesta.
- **Beatriz Carámbula es presidenta de la Cámara Inmobiliaria Uruguaya** y es contacto de
  primer grado. No es clienta: es la red de todo el país.
- Tres personas mostraron interés y nunca recibieron respuesta: Cristian Ascanio (43 días),
  Héctor Sapriza (60) y Leandro Mugianesi (14).

**Quedó pendiente**

- Marcelo Quispe y Yani Jacobi pidieron el material el 6 de agosto. Siguen sin seguimiento.
- La búsqueda guardada se agota: de 340, ya hay ~90 contactados. Habrá que ampliar filtros.

---

## 2026-08-19

**Qué se construyó**

- **La sesión de fundación** → `00 Norte/Norte.md` con los números reales, sacados de
  producción y no de memoria. Ver la memoria [[norte-vakdor-numeros-reales]].
- El vault de Obsidian con sus hubs y la skill `vakdor-obsidian` con la regla de estructura.
- Se conectaron Buffer (por el CLI oficial) y NotebookLM (28 notebooks).
- Se re-priorizaron las 76 tareas contra el Norte: 7 bajaron a "baja" por ser módulos
  nuevos, que este año no se construyen.

**Decisiones de fondo**

- **Escalonado, no 50k en 12 meses:** 5-6 clientes y US$20-25.000/mes a 12 meses; el
  producto que escala viene después.
- **Posicionamiento: complemento del CRM, nunca reemplazo.** A priori solo Tokko.
- La jornada real es de 6 horas: 9-10:30, 11-13 y 15-17:30. **Las 13 a 15 son de su familia
  y no se agenda nada, nunca.**

**Errores propios**

- Se reportó un fallo del bot que Leonardo ya había arreglado: el recolector pedía los
  últimos errores de n8n **sin filtrar por fecha**. Ahora la ventana es de 48 h.
- El token de Buffer siempre estuvo bien; fallaba la query GraphQL escrita a mano.

---

## 2026-08-18

**Qué se construyó**

- Se conectaron ClickUp, Zoho Mail, Notion, MailerLite y Composio.
- Se diseñó el Socio (spec en `docs/superpowers/specs/`), el recolector y el comando.
- Se limpió MailerLite: 102 rebotados borrados, 136 importados en cuarentena. La lista
  tenía 40% de rebote y podía quemar el dominio.
- Se extrajeron **69 compromisos** de 10 notas de reunión de Gemini y **se verificó cada
  uno contra el código y producción**: 16 ya estaban hechos. Ver
  `docs/interno/verificacion-compromisos-2026-08-18.md`.

**La regla que salió de ahí**

- **Verificar antes de crear.** Un grep positivo no alcanza: hace falta el archivo, la
  columna o filas reales. Crear una tarea ya hecha destruye la confianza en el sistema.

**Errores propios**

- Se mandó un mail a `@keymexchile.cl` cuando la dirección real era `.com`. Se leyó la
  dirección truncada en vez de verificarla en el hilo. Regla: confirmar la dirección exacta
  en el hilo antes de escribir.
