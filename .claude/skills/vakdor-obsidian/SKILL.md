---
name: vakdor-obsidian
description: Cómo estructurar el vault de Obsidian de Vakdor para que el grafo tenga forma de red y no de puntos sueltos. Usala SIEMPRE antes de crear o editar una nota en el vault VAKDOR — al escribir la bitácora, al vaciar el Inbox, al agregar una persona, un frente o un informe de mercado. Triggerea con "Obsidian", "el vault", "la bitácora", "una nota", "el grafo", "segundo cerebro".
---

# El vault de Vakdor

Ruta: `C:\Users\LENOVO\OneDrive\Escritorio\Vakdor\MEMORIA\VAKDOR`

Las skills `obsidian-markdown`, `obsidian-cli`, `obsidian-bases` y `json-canvas` cubren la
**sintaxis**. Esta cubre la **estructura**: dónde va cada nota y con qué se enlaza.

> [!important] La regla que ordena todo
> Cada carpeta tiene una **nota central (hub)** con el mismo nombre. Toda nota nueva se
> enlaza **hacia arriba** con su hub, y el hub la enlaza **hacia abajo**.
> Una nota sin al menos un enlace de ida y uno de vuelta está mal creada.

Eso es lo que hace que el grafo se vea como una red con racimos, y no como un puñado de
puntos sueltos: cada hub es un nodo grande y sus notas cuelgan alrededor.

## El mapa

```
VAKDOR/
├── Inbox.md              ← captura cruda. Se vacía en cada /socio.
├── 00 Norte/
│   └── Norte.md          ← EL CENTRO. Todo lo demás lo enlaza.
├── 10 Bitácora/
│   └── YYYY-MM-DD.md     ← una por día
├── 20 Frentes/
│   ├── ceo.md · marketing.md · producto.md · finanzas.md   ← 4 hubs
├── 30 Mercado/
│   └── YYYY-MM-DD informe.md
├── 40 Gente/
│   └── Nombre Apellido.md
└── 50 Aprendizajes/
    └── tema.md
```

## Con qué se enlaza cada cosa

| Nota | Enlaza SÍ o SÍ hacia | La enlazan desde |
|---|---|---|
| `Norte` | los 4 frentes + el cliente | todo el vault |
| Un **frente** | `Norte` + la gente y los temas de ese frente | `Norte`, bitácoras, gente |
| Una **persona** | el frente donde juega + `Norte` | el frente, las bitácoras |
| Una **bitácora** | `Norte` + la gente y frentes que aparecieron ese día | nada (son hojas) |
| Un **informe de mercado** | el frente que afecta + `Norte` | ese frente |
| Un **aprendizaje** | el frente donde aplica | ese frente |

Las bitácoras son la única excepción: nadie las enlaza. Son el registro temporal, y por eso
en el grafo se ven como un cinturón de puntos alrededor del núcleo. Está bien que sea así.

## Los cinco errores que ya se cometieron

1. **Wikilink partido en dos líneas.** `[[Matias\nO'Keefe]]` no resuelve. Si el enlace no
   entra en el renglón, se acorta el texto, nunca el enlace.
2. **Nota sin ningún enlace.** Un frente vacío es un punto suelto. Si no hay con qué
   enlazarla todavía, no se crea.
3. **Enlace a una nota que no existe.** `[[ACM]]` sin archivo `ACM.md` crea un nodo fantasma
   en el grafo. O se crea la nota, o se escribe en texto plano.
4. **Solo enlaces de ida.** Si el frente enlaza a la persona pero la persona no vuelve al
   frente, el racimo queda a medias.
5. **Dejar `Bienvenido.md`.** La nota que trae Obsidian por defecto enlaza a "cree un
   enlace" y ensucia el grafo con un nodo sin sentido.

## Frontmatter mínimo

```markdown
---
tipo: cliente | red | prospecto | frente | bitácora | mercado | aprendizaje
estado: activo | perdido | pausado        # solo en gente
actualizado: YYYY-MM-DD
---
```

Sirve para filtrar con Bases más adelante. Sin frontmatter la nota funciona, pero no se
puede agrupar.

## Callouts que se usan

```markdown
> [!important] El riesgo que no hay que olvidar
> Un solo cliente, un mes de ahorro.

> [!warning] Sin verificar
> Sale de una nota de reunión, no de producción.

> [!check] Verificado en producción
> 84 análisis reales en `acm_searches`.
```

Sirven para distinguir de un vistazo lo comprobado de lo supuesto — que es la diferencia
entre una decisión y una corazonada.

## Antes de guardar cualquier nota

1. ¿Enlaza a su hub?
2. ¿El hub la enlaza de vuelta?
3. ¿Todos los `[[ ]]` apuntan a archivos que existen?
4. ¿Ningún enlace quedó partido en dos líneas?

Para chequearlo de una:

```bash
V="/c/Users/LENOVO/OneDrive/Escritorio/Vakdor/MEMORIA/VAKDOR"
find "$V" -name "*.md" -not -path "*/.obsidian/*" | while read f; do
  n=$(basename "$f" .md)
  l=$(grep -o '\[\[[^]]*\]\]' "$f" | tr -d '[]' | sort -u | tr '\n' ',')
  printf "%-30s %s\n" "$n" "${l:---- SUELTA}"
done
```

## Si el CLI está disponible

`obsidian` no está instalado hoy (hay que habilitarlo desde la app). Cuando lo esté, conviene
usarlo en vez de escribir archivos a mano, porque resuelve los enlaces como lo hace Obsidian:

```bash
obsidian create name="Nombre" content="..." silent
obsidian backlinks file="Norte"      # verificar que el racimo cerró
```
