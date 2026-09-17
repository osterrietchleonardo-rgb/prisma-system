"use client"

// Farming · el tablero de las seis columnas.
//
// La misma caminata que la lista, mirada como método: cada puerta avanza de «Relevado» a
// «Captada» y **ningún movimiento pasa sin quedar anotado** — por eso soltar una tarjeta no
// mueve nada por sí solo: abre el diálogo, y recién cuando se guarda (con qué hiciste, el
// próximo paso y su fecha) la tarjeta cambia de columna. Si se cancela, nada cambió: no hay
// nada que devolver.
//
// En el celular el camino de verdad es el menú «Mover a…», no arrastrar. Arrastrar existe para
// el escritorio.
//
// Nada importante en un globito: en el celular no se abren. La próxima acción, su fecha y la
// palabra «vencida» van como líneas visibles.
import { useMemo, useState } from "react"
import { createPortal } from "react-dom"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ChevronLeft, ChevronRight, Clock, History, MoveRight } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { ETAPAS, TIPOS, etiquetaDe, type EtapaDireccion } from "@/lib/farming/direcciones"
import { COLUMNAS } from "@/lib/farming/tablero"
import { estadoDeFecha, fechaCorta, hoyEnBuenosAires } from "@/lib/farming/fechas"
import type { FilaDireccion } from "@/lib/farming/tipos"
import { MoverDialog } from "./mover-dialog"
import { Historial } from "./historial"

const etiquetaTipo = (t: FilaDireccion["tipo"]) => TIPOS.find((x) => x.clave === t)?.etiqueta ?? t

/** «Descartada» no es una columna del flujo: va al costado, plegada. */
const DESCARTADA: EtapaDireccion = "descartada"

/** Todas las etapas del desplegable «Mover a…»: las seis del método más «Descartada». Descartar
 *  también es un movimiento y también deja su línea de historial. */
const DESTINOS = ETAPAS.map((e) => e.clave)

/**
 * El orden dentro de una columna, igual que el del servidor: `orden` y, a igualdad, la más
 * vieja arriba. Se reordena acá y no se confía en el orden del array porque una tarjeta recién
 * movida vuelve con `orden: 0` —al caer en una columna va al principio— y sin esto se quedaría
 * en el lugar que tenía en la columna anterior.
 */
function enOrden(filas: FilaDireccion[]): FilaDireccion[] {
  return [...filas].sort((a, b) => a.orden - b.orden || a.created_at.localeCompare(b.created_at))
}

/**
 * El cuerpo de la tarjeta. Sin un solo hook de dnd adentro: así la misma tarjeta se dibuja
 * igual en la columna, en la sombra que sigue al dedo (`DragOverlay`) y en una zona archivada,
 * donde no hay nada que arrastrar.
 */
function CuerpoTarjeta({
  d,
  hoy,
  soloLectura,
  arrastrando,
  onMover,
  onHistorial,
  manija,
}: {
  d: FilaDireccion
  /** Hoy en Buenos Aires, calculado UNA vez por el tablero: si cada tarjeta lo pidiera por su
   *  cuenta, dos tarjetas dibujadas a las 23:59:59 podrían discrepar sobre qué día es. */
  hoy: string
  soloLectura: boolean
  arrastrando?: boolean
  onMover: (d: FilaDireccion, destino: EtapaDireccion) => void
  onHistorial: (d: FilaDireccion) => void
  /** Lo que dnd-kit necesita colgar del área que se arrastra. Vacío si no se arrastra. */
  manija?: Record<string, unknown>
}) {
  const estado = estadoDeFecha(d.proxima_accion_en, hoy)
  const cuando = fechaCorta(d.proxima_accion_en)

  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-200 bg-card p-3 dark:border-zinc-800",
        arrastrando && "opacity-40",
      )}
    >
      {/* El título es la manija del arrastre: el resto de la tarjeta queda libre para scrollear
          la columna con el dedo. NO tiene además un `onClick` propio a propósito —el historial
          es el botón de abajo, aparte— porque las dos cosas colgadas del MISMO control chocan
          con el teclado: `KeyboardSensor` de dnd-kit también dispara con Enter/Espacio, así que
          un botón que a la vez mueve y abre el historial le hacía las dos cosas de un solo
          toque a quien navega sin mouse, sin forma de elegir una sola. Separados, un asesor con
          teclado puede mover la tarjeta (acá) o abrir su historial (el botón de abajo), nunca
          las dos a la fuerza. */}
      <button
        type="button"
        className="w-full min-h-[44px] text-left"
        aria-label={`Mover ${d.calle} ${d.altura ?? ""}: arrastrá, o usá "Mover a…" más abajo`}
        {...(manija ?? {})}
      >
        <p className="font-medium leading-tight">{d.calle} {d.altura ?? ""}</p>
        <p className="text-xs text-muted-foreground">
          {[
            etiquetaTipo(d.tipo),
            d.unidades_totales ? `${d.unidades_totales} ${d.unidades_totales === 1 ? "unidad" : "unidades"}` : null,
            d.tramo,
          ].filter(Boolean).join(" · ")}
        </p>
      </button>

      {/* La próxima acción con su fecha, como LÍNEA VISIBLE: es lo que hay que leer de un
          vistazo antes de volver a esa puerta. Y «vencida» va con PALABRA, no solo con color:
          un teléfono al sol en la vereda no distingue un rojo de un gris.
          Con la fecha sola —sin texto— la línea sale igual: el alta de una tarjeta deja cargar
          una sin la otra, y una fecha que vence en silencio es justo lo que hay que evitar. */}
      {d.proxima_accion || cuando ? (
        <p
          className={cn(
            "mt-1 flex items-start gap-1.5 text-xs font-medium",
            estado === "vencida" ? "text-destructive" : "text-accent",
          )}
        >
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {[
              d.proxima_accion,
              cuando,
              estado === "vencida" ? "vencida" : estado === "hoy" ? "es hoy" : null,
            ].filter(Boolean).join(" · ")}
          </span>
        </p>
      ) : (
        // Una tarjeta sin próximo paso es una tarjeta que se va a olvidar: se dice, no se deja
        // en blanco.
        <p className="mt-1 text-xs text-muted-foreground">Sin próximo paso anotado.</p>
      )}

      <div className="mt-2 flex items-center gap-1">
        {/* En una zona archivada no hay menú: se mira y no se toca. El servidor rechaza igual
            cualquier movimiento, esto es la pantalla. */}
        {!soloLectura && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Mover ${d.calle} ${d.altura ?? ""} a otra columna`}
                className="inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <MoveRight className="h-4 w-4" /> Mover a…
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel className="text-xs">Mover a…</DropdownMenuLabel>
              {/* «Anotar sin moverla» es «pasé otra carta»: la acción más repetida del método,
                  y hasta esta revisión NO TENÍA CAMINO DIRECTO — la columna actual estaba
                  deshabilitada acá abajo, así que para anotar una visita más sin cambiar de
                  columna había que elegir una columna DISTINTA y corregirla adentro del
                  diálogo. Va primera, con su propio nombre, y abre el mismo diálogo con el
                  destino ya puesto en la columna en la que la tarjeta está parada. El servidor
                  ya acepta mover a la misma etapa (y también anota su historial): esto solo le
                  da un camino corto a algo que la ruta de abajo ya permitía. */}
              <DropdownMenuItem className="min-h-[44px]" onClick={() => onMover(d, d.etapa)}>
                Anotar sin moverla
              </DropdownMenuItem>
              {DESTINOS.map((clave) => (
                <DropdownMenuItem
                  key={clave}
                  className="min-h-[44px]"
                  onClick={() => onMover(d, clave)}
                >
                  {etiquetaDe(clave)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* El historial SÍ se abre en una zona archivada: es justo lo que el cartel del
            archivado promete guardado. */}
        <button
          type="button"
          onClick={() => onHistorial(d)}
          className="ml-auto inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <History className="h-4 w-4" /> historial
        </button>
      </div>
    </div>
  )
}

/** La tarjeta dentro de la columna: le cuelga el arrastre al cuerpo. En una zona archivada
 *  `disabled` deja el sortable mudo y el cuerpo se dibuja sin manija. */
function TarjetaTablero(props: {
  d: FilaDireccion
  hoy: string
  soloLectura: boolean
  onMover: (d: FilaDireccion, destino: EtapaDireccion) => void
  onHistorial: (d: FilaDireccion) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.d.id,
    data: { tipo: "tarjeta-farming", direccion: props.d },
    disabled: props.soloLectura,
  })

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <CuerpoTarjeta
        {...props}
        arrastrando={isDragging}
        manija={props.soloLectura ? undefined : { ...attributes, ...listeners }}
      />
    </div>
  )
}

/** Una de las seis. El encabezado con su nombre y su conteo queda fijo; lo que scrollea es la
 *  pila de tarjetas. */
function Columna({
  etapa,
  filas,
  hoy,
  soloLectura,
  onMover,
  onHistorial,
}: {
  etapa: EtapaDireccion
  filas: FilaDireccion[]
  hoy: string
  soloLectura: boolean
  onMover: (d: FilaDireccion, destino: EtapaDireccion) => void
  onHistorial: (d: FilaDireccion) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa, disabled: soloLectura })

  return (
    <div className="flex h-full min-h-0 w-[280px] shrink-0 flex-col rounded-xl border border-zinc-200 bg-muted/40 dark:border-zinc-800">
      <div className="flex shrink-0 items-center justify-between gap-2 p-3">
        <h3 className="text-sm font-semibold leading-tight">{etiquetaDe(etapa)}</h3>
        <span className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold">{filas.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          // min-h-0 es lo que habilita el scroll propio adentro del flex.
          "min-h-0 flex-1 space-y-2 overflow-y-auto rounded-b-xl p-2 transition-colors",
          isOver && "bg-accent/10",
        )}
      >
        <SortableContext items={filas.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          {filas.map((d) => (
            <TarjetaTablero
              key={d.id}
              d={d}
              hoy={hoy}
              soloLectura={soloLectura}
              onMover={onMover}
              onHistorial={onHistorial}
            />
          ))}
        </SortableContext>

        {filas.length === 0 && (
          <p className="p-6 text-center text-xs text-muted-foreground">Ninguna puerta acá.</p>
        )}
      </div>
    </div>
  )
}

/**
 * «Descartada» al costado y plegada, porque no es una columna del método: son las puertas que
 * ya no se trabajan. Se despliega tocándola, y plegada sigue aceptando que le suelten una
 * tarjeta encima.
 */
function ColumnaDescartada({
  filas,
  abierta,
  onAlternar,
  hoy,
  soloLectura,
  onMover,
  onHistorial,
}: {
  filas: FilaDireccion[]
  abierta: boolean
  onAlternar: () => void
  hoy: string
  soloLectura: boolean
  onMover: (d: FilaDireccion, destino: EtapaDireccion) => void
  onHistorial: (d: FilaDireccion) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: DESCARTADA, disabled: soloLectura })

  if (!abierta) {
    return (
      <div
        ref={setNodeRef}
        className={cn(
          "flex h-full w-14 shrink-0 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700",
          isOver && "bg-accent/10",
        )}
      >
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={false}
          className="flex h-full w-full min-w-[44px] flex-col items-center gap-2 rounded-xl py-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" />
          <span className="[writing-mode:vertical-rl]">Descartadas ({filas.length})</span>
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 w-[280px] shrink-0 flex-col rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded
        className="flex min-h-[44px] shrink-0 items-center justify-between gap-2 p-3 text-left"
      >
        <h3 className="text-sm font-semibold leading-tight">Descartadas</h3>
        <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
          {filas.length} <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </button>

      <div
        ref={setNodeRef}
        className={cn(
          "min-h-0 flex-1 space-y-2 overflow-y-auto rounded-b-xl p-2 transition-colors",
          isOver && "bg-accent/10",
        )}
      >
        <SortableContext items={filas.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          {filas.map((d) => (
            <TarjetaTablero
              key={d.id}
              d={d}
              hoy={hoy}
              soloLectura={soloLectura}
              onMover={onMover}
              onHistorial={onHistorial}
            />
          ))}
        </SortableContext>

        {filas.length === 0 && (
          <p className="p-6 text-center text-xs text-muted-foreground">No descartaste ninguna puerta.</p>
        )}
      </div>
    </div>
  )
}

export function Tablero({
  direcciones,
  soloLectura,
  onMovida,
}: {
  direcciones: FilaDireccion[]
  /** La zona está archivada: el tablero SE MIRA y no se mueve. Sin arrastre y sin menú; el
   *  cartel que lo explica es el mismo que ya muestra la lista, arriba de las dos vistas. */
  soloLectura: boolean
  /** La fila que devolvió el servidor después de mover. La pantalla la aplica tal cual. */
  onMovida: (d: FilaDireccion) => void
}) {
  const [arrastrada, setArrastrada] = useState<FilaDireccion | null>(null)
  const [aMover, setAMover] = useState<{ d: FilaDireccion; destino: EtapaDireccion } | null>(null)
  const [viendoHistorial, setViendoHistorial] = useState<FilaDireccion | null>(null)
  const [descartadasAbiertas, setDescartadasAbiertas] = useState(false)

  // Sin sensores no hay arrastre posible: es lo que apaga el dnd entero en una zona archivada,
  // sin tener que dibujar un tablero distinto.
  const sensoresVivos = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const sensoresQuietos = useSensors()
  const sensors = soloLectura ? sensoresQuietos : sensoresVivos

  const hoy = hoyEnBuenosAires()

  const porEtapa = useMemo(() => {
    const mapa = new Map<EtapaDireccion, FilaDireccion[]>()
    for (const e of ETAPAS) mapa.set(e.clave, [])
    for (const d of direcciones) {
      // Una etapa que la pantalla no conoce no se traga en silencio: cae en «Relevado», que es
      // donde nace todo, antes que desaparecer del tablero.
      const lista = mapa.get(d.etapa) ?? mapa.get("relevado")!
      lista.push(d)
    }
    for (const [clave, lista] of mapa) mapa.set(clave, enOrden(lista))
    return mapa
  }, [direcciones])

  const pedirMover = (d: FilaDireccion, destino: EtapaDireccion) => {
    if (soloLectura) return
    setAMover({ d, destino })
  }

  const alSoltar = (e: DragEndEvent) => {
    const d = arrastrada
    setArrastrada(null)
    if (!d || !e.over) return

    const sobre = String(e.over.id)
    // Se puede haber soltado sobre la columna o sobre otra tarjeta: en el segundo caso, el
    // destino es la columna de ESA tarjeta.
    const destino = (ETAPAS.find((x) => x.clave === sobre)?.clave ??
      direcciones.find((x) => x.id === sobre)?.etapa) as EtapaDireccion | undefined
    if (!destino || destino === d.etapa) return

    // NADA se mueve todavía: se abre el diálogo y la tarjeta se queda donde está hasta que el
    // movimiento se guarde con su historial. Si se cancela, no hay nada que deshacer.
    pedirMover(d, destino)
  }

  const alEmpezar = (e: DragStartEvent) => {
    const d = e.active.data.current?.direccion as FilaDireccion | undefined
    if (d) setArrastrada(d)
  }

  return (
    <div className="space-y-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={alEmpezar}
        onDragEnd={alSoltar}
      >
        {/* Alto fijo a propósito, igual que el tablero de Tracking: el scroll pasa DENTRO de
            cada columna, así los nombres de las columnas no se van de la vista. A 390 px entra
            una columna y las demás se alcanzan deslizando al costado. */}
        <div className="h-[calc(100vh-24rem)] min-h-[26rem] overflow-x-auto pb-4">
          <div className="inline-flex h-full gap-3">
            {COLUMNAS.map((clave) => (
              <Columna
                key={clave}
                etapa={clave}
                filas={porEtapa.get(clave) ?? []}
                hoy={hoy}
                soloLectura={soloLectura}
                onMover={pedirMover}
                onHistorial={setViendoHistorial}
              />
            ))}

            <ColumnaDescartada
              filas={porEtapa.get(DESCARTADA) ?? []}
              abierta={descartadasAbiertas}
              onAlternar={() => setDescartadasAbiertas((a) => !a)}
              hoy={hoy}
              soloLectura={soloLectura}
              onMover={pedirMover}
              onHistorial={setViendoHistorial}
            />
          </div>
        </div>

        {typeof document !== "undefined" &&
          createPortal(
            <DragOverlay>
              {arrastrada ? (
                <div className="w-[264px]">
                  <CuerpoTarjeta
                    d={arrastrada}
                    hoy={hoy}
                    soloLectura
                    onMover={() => {}}
                    onHistorial={() => {}}
                  />
                </div>
              ) : null}
            </DragOverlay>,
            document.body,
          )}
      </DndContext>

      {/* La `key` remonta el diálogo al pasar de una tarjeta (o de un destino) a otro: así el
          tipo sugerido y los campos arrancan limpios y nunca quedan los de la puerta anterior. */}
      <MoverDialog
        key={aMover ? `${aMover.d.id}-${aMover.destino}` : "sin-mover"}
        direccion={aMover?.d ?? null}
        destino={aMover?.destino ?? "relevado"}
        onCerrar={() => setAMover(null)}
        onMovida={onMovida}
      />

      <Historial direccion={viendoHistorial} onCerrar={() => setViendoHistorial(null)} />
    </div>
  )
}
