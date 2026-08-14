-- Escenas del banco: etiquetado de las 30 existentes + 60 nuevas = 90.
--
-- Matriz objetivo (18 celdas, ninguna por debajo de 4):
--   area                        dolor  intento_fallido  resuelto
--   ventas                      12          4              4
--   equipo                      10          4              4
--   direccion                    6          4              4
--   alquileres_administracion    5          4              4
--   captacion_tasacion           5          4              4
--   pauta_marketing              4          4              4
--
-- El momento se ata a la etapa del embudo: tofu->dolor, mofu->intento_fallido,
-- bofu->resuelto. Antes las tres etapas sorteaban de la misma bolsa de dolor y
-- BOFU tenia que improvisar el "asi se ve resuelto".
--
-- Reglas de redaccion (canon): situacion concreta, al menos un detalle especifico
-- (hora, dia, plazo, tipo de propiedad), espanol rioplatense. PROHIBIDO inventar
-- cifras, clientes, casos con nombre o resultados atribuidos. Las escenas de
-- `resuelto` NO nombran PRISMA: el producto lo agrega el prompt segun la etapa.

-- ===========================================================================
-- 1. ETIQUETAR LAS 30 EXISTENTES. Todas son dolor. No se toca titulo ni detalle.
-- ===========================================================================
update marketing_recursos set momento='dolor', area='ventas' where tipo='escena' and titulo in (
  'Menú automático a una consulta concreta','El lead del sábado a la noche','El mismo lead llamado dos veces',
  'El lead frío que era el mejor','La competencia contesta en dos minutos','El presupuesto que nunca se pregunta',
  'El "mandame info" que muere','El teléfono mal cargado','La búsqueda que nadie cruzó','El horario que no existe');

update marketing_recursos set momento='dolor', area='equipo' where tipo='escena' and titulo in (
  'La cartera se va en el celular','El Excel paralelo','El WhatsApp personal del asesor',
  'Dos asesores hacen el 70%','El asesor nuevo sin proceso','El seguimiento que depende de la memoria',
  'El CRM cargado a medias','Los 47 chats sin leer');

update marketing_recursos set momento='dolor', area='direccion' where tipo='escena' and titulo in (
  'El pasillo como sistema de reporte','La reunión de los lunes','El informe armado a mano',
  'La operación que se cayó en silencio');

update marketing_recursos set momento='dolor', area='alquileres_administracion' where tipo='escena' and titulo in (
  'Las expensas que nadie confirma','La propiedad reservada que sigue publicada','El "te confirmo y te aviso"');

update marketing_recursos set momento='dolor', area='captacion_tasacion' where tipo='escena' and titulo in (
  'La tasación por corazonada','El propietario que llama a preguntar','La visita que nadie confirmó');

update marketing_recursos set momento='dolor', area='pauta_marketing' where tipo='escena' and titulo in (
  'La campaña que entra y se desborda','El cliente que ya contó todo');

-- Red de seguridad: si algun titulo no matcheo (por una tilde distinta, por ejemplo),
-- la escena igual queda etiquetada y el filtro no la pierde.
update marketing_recursos set momento='dolor', area='ventas'
 where tipo='escena' and (area is null or momento is null);

-- ===========================================================================
-- 2. LAS 60 NUEVAS
-- ===========================================================================

-- --- VENTAS ---------------------------------------------------------------
insert into marketing_recursos (tipo, titulo, detalle, area, momento) values
('escena','La plantilla de respuesta que nadie usa',$$Se armó un documento con respuestas tipo para las consultas de portal, y a los diez días cada asesor volvió a escribir lo suyo desde cero.$$,'ventas','intento_fallido'),
('escena','El recordatorio en el calendario personal',$$El asesor se pone una alarma para recontactar el jueves. Ese jueves tiene tres visitas y la alarma se posterga hasta que desaparece.$$,'ventas','intento_fallido'),
('escena','El grupo de WhatsApp del equipo comercial',$$Los leads se reparten por un grupo donde también se manda todo lo demás. El del sábado quedó quince mensajes más arriba para cuando alguien mira el lunes.$$,'ventas','intento_fallido'),
('escena','El bot que contestaba cualquier cosa',$$Se puso un bot para responder rápido y le contestaba el horario de atención a alguien que preguntaba por una cochera.$$,'ventas','intento_fallido'),
('escena','La consulta del domingo ya contestada',$$Entra una consulta un domingo a las nueve de la noche por un dos ambientes, y el lunes a la mañana el asesor abre un chat donde ya se preguntó zona, presupuesto y plazo.$$,'ventas','resuelto'),
('escena','El lead llega calificado a la primera llamada',$$Antes de levantar el teléfono el asesor ya sabe cuánto puede pagar, si tiene algo para vender antes de comprar y para cuándo se quiere mudar.$$,'ventas','resuelto'),
('escena','El historial completo antes de atender',$$Un contacto de hace cuatro meses vuelve a escribir y aparece todo lo que había preguntado la primera vez, sin que nadie tenga que acordarse.$$,'ventas','resuelto'),
('escena','La visita se confirma sola',$$La visita del sábado a las once queda confirmada el viernes sin que el asesor tenga que escribirle uno por uno a cada cliente.$$,'ventas','resuelto'),
('escena','La contraoferta que se pierde en el chat',$$El comprador tira un número por WhatsApp un viernes a la tarde y el lunes nadie se acuerda de cuál era.$$,'ventas','dolor'),
('escena','La reserva que se cae el viernes',$$Se cae una reserva un viernes y los tres interesados que habían quedado atrás hace tres semanas ya compraron en otro lado.$$,'ventas','dolor');

-- --- EQUIPO ---------------------------------------------------------------
insert into marketing_recursos (tipo, titulo, detalle, area, momento) values
('escena','El manual de procesos en PDF',$$Se escribieron cuarenta páginas con el paso a paso de cómo atender. Están en una carpeta compartida que nadie abrió desde el día que se subió.$$,'equipo','intento_fallido'),
('escena','La capacitación de una tarde',$$Se juntó a todo el equipo un jueves a la tarde para enseñar el proceso nuevo. A las dos semanas cada uno volvió a su manera de siempre.$$,'equipo','intento_fallido'),
('escena','El CRM nuevo que duró dos meses',$$Se migró todo a una herramienta nueva y a los dos meses los datos que de verdad importan volvieron a estar en el celular de cada asesor.$$,'equipo','intento_fallido'),
('escena','El premio al que más llama',$$Se armó un incentivo por cantidad de llamadas. Subieron las llamadas y las visitas quedaron donde estaban.$$,'equipo','intento_fallido'),
('escena','El asesor nuevo produce en la primera semana',$$Entra alguien un lunes y el viernes ya atendió consultas con el mismo criterio que el resto, sin haber memorizado ningún guion.$$,'equipo','resuelto'),
('escena','La cartera queda cuando el asesor se va',$$Renuncia un asesor y al día siguiente otro retoma sus conversaciones con todo el historial, sin llamar a pedirle teléfonos.$$,'equipo','resuelto'),
('escena','Todos contestan igual sin guion memorizado',$$Tres asesores distintos responden la misma consulta por un PH en la misma zona, y las tres respuestas piden los mismos datos antes de mostrar.$$,'equipo','resuelto'),
('escena','El seguimiento no depende de quién esté',$$El asesor se toma una semana y sus contactos siguen recibiendo respuesta en el día.$$,'equipo','resuelto'),
('escena','El asesor que se lleva el mejor cliente',$$Se va a otra inmobiliaria y el cliente que venía trabajando hace seis meses se va con él.$$,'equipo','dolor'),
('escena','La discusión por quién cargó el lead',$$Dos asesores discuten de quién es la operación porque el mismo contacto entró por dos lados el mismo día.$$,'equipo','dolor');

-- --- DIRECCION ------------------------------------------------------------
insert into marketing_recursos (tipo, titulo, detalle, area, momento) values
('escena','El tablero que nadie abre',$$Se contrató un tablero con veinte indicadores. El director lo mira el primer mes y después vuelve a preguntar cómo viene la cosa en el pasillo.$$,'direccion','intento_fallido'),
('escena','El reporte semanal por mail',$$Cada lunes llega un mail con los números de la semana. Nadie lo responde y nadie lo discute en la reunión.$$,'direccion','intento_fallido'),
('escena','La consultora que dejó un diagnóstico',$$Vinieron tres meses, entregaron un documento con recomendaciones, y la operación del lunes siguiente siguió exactamente igual.$$,'direccion','intento_fallido'),
('escena','Contratar a alguien para que ordene',$$Se sumó una persona para coordinar. Ahora toda la información pasa por ella, y se frena las dos semanas que se toma vacaciones.$$,'direccion','intento_fallido'),
('escena','El lunes el reporte ya está',$$El director abre el lunes a las nueve y los números de la semana ya están armados, sin que nadie haya pasado el viernes copiando datos a una planilla.$$,'direccion','resuelto'),
('escena','Se ve dónde se cae cada operación',$$Se puede señalar en qué paso se pierde la mayoría: entre que entra la consulta y que se contesta, o entre la visita y la oferta.$$,'direccion','resuelto'),
('escena','La reunión de los lunes dura veinte minutos',$$Deja de ser cada asesor contando de memoria cómo viene y pasa a ser mirar dos o tres números y decidir qué se hace esta semana.$$,'direccion','resuelto'),
('escena','Se decide sobre el dato, no sobre el recuerdo',$$Se discute bajar el precio de una propiedad mirando cuántas consultas tuvo en los últimos sesenta días, no lo que le pareció al que la mostró.$$,'direccion','resuelto'),
('escena','El número de cierre que cada uno calcula distinto',$$El director dice que se cerraron ocho operaciones, el gerente dice seis, y los dos tienen razón según cómo las cuenten.$$,'direccion','dolor'),
('escena','El mes que se cerró sin saber por qué',$$Un mes sale bastante mejor que el anterior y nadie en la agencia puede explicar qué se hizo distinto.$$,'direccion','dolor');

-- --- ALQUILERES Y ADMINISTRACION -----------------------------------------
insert into marketing_recursos (tipo, titulo, detalle, area, momento) values
('escena','La planilla compartida de vencimientos',$$Se armó una planilla con todos los vencimientos de contrato. Se actualiza cuando alguien se acuerda, que no es todos los meses.$$,'alquileres_administracion','intento_fallido'),
('escena','El mail masivo a los inquilinos',$$Se manda un mail a todos avisando el aumento, y contestan por WhatsApp uno por uno igual.$$,'alquileres_administracion','intento_fallido'),
('escena','El teléfono de administración que suena ocupado',$$Se puso una línea sólo para administración y de nueve a doce está ocupada.$$,'alquileres_administracion','intento_fallido'),
('escena','El WhatsApp de administración sin dueño',$$Se abrió un número para administración que miran tres personas. A veces contestan dos y a veces no contesta ninguna.$$,'alquileres_administracion','intento_fallido'),
('escena','El vencimiento avisa antes',$$Sesenta días antes de que venza el contrato el aviso ya salió, sin que nadie haya revisado una planilla.$$,'alquileres_administracion','resuelto'),
('escena','El inquilino se autogestiona el comprobante',$$Pide el comprobante de pago un sábado a la mañana y lo tiene, sin que nadie de la oficina abra la computadora.$$,'alquileres_administracion','resuelto'),
('escena','Las expensas salen confirmadas',$$Cuando alguien pregunta las expensas, la respuesta sale con la fecha del dato y aclarando qué queda por confirmar.$$,'alquileres_administracion','resuelto'),
('escena','Administración deja de ser un cuello',$$La persona de administración deja de ser el único camino para saber en qué estado está un contrato.$$,'alquileres_administracion','resuelto'),
('escena','La renovación que se venció sin avisar',$$Un contrato vence el 30 y el 2 del mes siguiente todavía nadie habló ni con el propietario ni con el inquilino.$$,'alquileres_administracion','dolor'),
('escena','El garante que nadie terminó de validar',$$Se firmó con la documentación del garante a medias porque el inquilino tenía apuro por entrar, y el legajo quedó así.$$,'alquileres_administracion','dolor');

-- --- CAPTACION Y TASACION -------------------------------------------------
insert into marketing_recursos (tipo, titulo, detalle, area, momento) values
('escena','El comparativo armado a ojo',$$Se buscan tres publicaciones parecidas en un portal y se saca un promedio, sin mirar que una lleva ocho meses publicada sin bajar el precio.$$,'captacion_tasacion','intento_fallido'),
('escena','La carpeta de captación en Canva',$$Se armó una presentación linda para el propietario que tarda dos días en personalizarse, y por eso casi nunca se manda.$$,'captacion_tasacion','intento_fallido'),
('escena','El propietario pide otra tasación',$$Se le entrega el número y va a preguntar a la inmobiliaria de enfrente, porque nadie le mostró con qué propiedades se comparó la suya.$$,'captacion_tasacion','intento_fallido'),
('escena','El precio se baja tarde',$$Se acepta publicar arriba para no discutir en la primera reunión, y se corrige recién a los cinco meses, cuando la publicación ya no la mira nadie.$$,'captacion_tasacion','intento_fallido'),
('escena','La tasación sale con comparables reales',$$El informe muestra con qué propiedades se comparó y cuánto tiempo lleva publicada cada una.$$,'captacion_tasacion','resuelto'),
('escena','El propietario ve el movimiento solo',$$Llama a preguntar cómo viene y se le puede decir cuántas consultas y cuántas visitas tuvo en el último mes.$$,'captacion_tasacion','resuelto'),
('escena','La captación entra con precio defendible',$$Se puede sostener el número en la primera reunión con el propietario, con el dato a la vista sobre la mesa.$$,'captacion_tasacion','resuelto'),
('escena','El informe se manda el mismo día',$$Se visita la propiedad a la mañana y el informe sale a la tarde, no la semana que viene.$$,'captacion_tasacion','resuelto'),
('escena','La captación que se firmó sin exclusividad',$$Se toma la propiedad sin exclusividad para no perderla, y termina publicada por cuatro inmobiliarias con cuatro precios distintos.$$,'captacion_tasacion','dolor'),
('escena','El informe de tasación que nunca se entregó',$$Se visitó la propiedad, se sacaron las fotos, y el informe quedó a medio armar en la carpeta de alguien.$$,'captacion_tasacion','dolor');

-- --- PAUTA Y MARKETING ----------------------------------------------------
insert into marketing_recursos (tipo, titulo, detalle, area, momento) values
('escena','La agencia de marketing que trae volumen',$$Se contrató una agencia que reporta más consultas cada mes, y la cantidad de visitas quedó donde estaba.$$,'pauta_marketing','intento_fallido'),
('escena','Duplicar el presupuesto de pauta',$$Se duplicó la inversión del mes y se duplicaron también las consultas que quedaron sin contestar.$$,'pauta_marketing','intento_fallido'),
('escena','El formulario con diez campos',$$Se agregaron campos al formulario para filtrar mejor, y bajó la cantidad de gente que lo termina de completar.$$,'pauta_marketing','intento_fallido'),
('escena','Publicar en más portales',$$Se sumaron dos portales más para tener más alcance, y ahora el mismo lead entra por tres lados distintos.$$,'pauta_marketing','intento_fallido'),
('escena','Se sabe qué campaña trajo la operación',$$Cuando se firma, se puede decir de dónde salió ese cliente y qué se invirtió para traerlo.$$,'pauta_marketing','resuelto'),
('escena','El costo por visita, no por clic',$$Se mide cuánto cuesta una visita concretada, no cuánto cuesta que alguien haga clic en una publicación.$$,'pauta_marketing','resuelto'),
('escena','La pauta se corta con dato',$$Se deja de invertir en una zona porque las consultas que trae no llegan a visita, no porque a alguien le pareció.$$,'pauta_marketing','resuelto'),
('escena','Entra menos y cierra más',$$Bajan las consultas del mes y suben las operaciones, y se puede explicar por qué.$$,'pauta_marketing','resuelto'),
('escena','El costo por consulta que nadie calcula',$$Se invierte todos los meses en portales y nadie sabe cuánto termina costando cada consulta que entra.$$,'pauta_marketing','dolor'),
('escena','La campaña que trae curiosos',$$Entran cincuenta consultas de una campaña y cuarenta preguntan por algo que la agencia no vende.$$,'pauta_marketing','dolor');
