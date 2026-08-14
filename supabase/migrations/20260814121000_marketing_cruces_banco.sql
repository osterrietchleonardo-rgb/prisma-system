-- Banco del motor de cruces: 5 propositos, la estructura que faltaba y 8 clusters.
-- Diseno: docs/superpowers/specs/2026-08-14-marketing-motor-cruces-y-seo-design.md

-- ---------------------------------------------------------------------------
-- 5 PROPOSITOS: el PARA QUE de la pieza.
-- No dictan la forma (eso es de la estructura), solo la intencion y el tipo de
-- evidencia que corresponde usar. El worker los inyecta ANTES de la estructura,
-- dejando explicito que la forma la da la estructura y no este bloque.
-- ---------------------------------------------------------------------------
insert into marketing_recursos (tipo, clave, titulo, detalle) values
('proposito','convencer','Opinion fuerte',
$$Buscas mover una creencia. Afirmas algo que una parte del rubro discutiria y lo sostenes con razonamiento, no con datos. Terminas dejando al lector con una posicion tomada, no con una lista de consejos. Evidencia valida: la logica del negocio y las consecuencias de seguir como esta.$$),
('proposito','ensenar','Educativo',
$$Buscas que el lector se lleve algo aplicable hoy. Explicas un mecanismo o un metodo en partes ordenadas, cada una con su por que. No es una lista de tips sueltos: es un camino que se puede recorrer, y el orden importa. Evidencia valida: el mecanismo explicado paso a paso.$$),
('proposito','mostrar_detras','Experiencia',
$$Buscas confianza mostrando el detras de escena: una decision que tomaste, un error que cometiste, algo que estas construyendo o sobre lo que cambiaste de opinion. Hablas en primera persona del trabajo real. Evidencia valida: lo que viste o hiciste. Nunca cifras inventadas.$$),
('proposito','probar_con_dato','Dato o investigacion',
$$Buscas anclar un argumento en algo medible. Traes un numero del negocio y lo interpretas: que significa, por que duele, que decision deberia cambiar. Si no tenes un numero real disponible, NO inventes uno: cambia el angulo a una observacion cualitativa y decilo asi. Evidencia valida: el numero y su contexto.$$),
('proposito','reflexionar','Reflexion',
$$Buscas pensar en voz alta sobre el negocio, la tecnologia o el oficio. Menos cierre y mas pregunta honesta. Es la pieza que muestra criterio en vez de tecnica. Evidencia valida: la observacion propia y sus implicancias.$$)
on conflict (tipo, coalesce(clave, titulo)) do nothing;

-- ---------------------------------------------------------------------------
-- ESTRUCTURA NUEVA: la unica que ninguna de las 8 actuales cubria (el educativo).
-- ---------------------------------------------------------------------------
insert into marketing_recursos (tipo, clave, titulo, detalle) values
('estructura','framework_pasos','El metodo en pasos',
$$Abris con la situacion que hace falta resolver, contada como escena concreta, no como enunciado.

Despues nombras el metodo y lo desarrollas en 3 a 5 pasos. Cada paso lleva un titulo corto y dos o tres lineas que digan QUE se hace y POR QUE ese orden y no otro. Los pasos tienen que poder ejecutarse sin vos: si uno depende de que alguien se acuerde, no es un paso, es una intencion.

Cerras diciendo que cambia en la operacion cuando el metodo esta andando.

No es una lista de tips: es un camino. Si se pueden leer los pasos en cualquier orden, la pieza esta mal armada.$$)
on conflict (tipo, coalesce(clave, titulo)) do nothing;

-- ---------------------------------------------------------------------------
-- COMPATIBILIDAD proposito -> estructura.
-- Cada proposito queda con 2 estructuras como minimo, para que la rotacion
-- (que evita repetir la estructura de las piezas recientes) nunca se trabe.
-- ---------------------------------------------------------------------------
update marketing_recursos set propositos = '{convencer}'                  where tipo='estructura' and clave='mito_realidad';
update marketing_recursos set propositos = '{convencer}'                  where tipo='estructura' and clave='concesion_vuelta';
update marketing_recursos set propositos = '{convencer}'                  where tipo='estructura' and clave='contraste';
update marketing_recursos set propositos = '{ensenar}'                    where tipo='estructura' and clave='framework_pasos';
update marketing_recursos set propositos = '{ensenar,probar_con_dato}'    where tipo='estructura' and clave='autopsia';
update marketing_recursos set propositos = '{mostrar_detras,reflexionar}' where tipo='estructura' and clave='confesion';
update marketing_recursos set propositos = '{mostrar_detras}'             where tipo='estructura' and clave='escena_campo';
update marketing_recursos set propositos = '{probar_con_dato}'            where tipo='estructura' and clave='numero_duele';
update marketing_recursos set propositos = '{reflexionar}'                where tipo='estructura' and clave='carta_director';

-- ---------------------------------------------------------------------------
-- 8 CLUSTERS. Cada uno cuelga de una de las 3 fracturas del eje de marca.
-- `url_pilar` es el destino previsto: sembrar la taxonomia no implica que la
-- pagina exista. `areas` sesga que escenas son afines a cada territorio.
-- Tokko Broker queda afuera a proposito: es la keyword de otro producto y
-- atrae usuarios de Tokko buscando soporte, no directores con capacidad de inversion.
-- ---------------------------------------------------------------------------
insert into marketing_clusters (clave, titulo, descripcion, keyword_pilar, url_pilar, fractura, areas) values
('operaciones_inmobiliarias','Operaciones inmobiliarias',
 'Como funciona por dentro una inmobiliaria y donde se rompe la operacion.',
 'operaciones inmobiliarias','/operaciones-inmobiliarias/','madre',
 '{direccion,equipo,ventas,alquileres_administracion}'),
('leads_inmobiliarios','Leads inmobiliarios',
 'Donde se pierden las consultas entre que entran y que se convierten en visita.',
 'leads inmobiliarios','/leads-inmobiliarios/','hemorragia',
 '{ventas,pauta_marketing}'),
('whatsapp_inmobiliarias','WhatsApp para inmobiliarias',
 'El canal donde hoy pasa la conversacion con el cliente y como no perder el control.',
 'WhatsApp para inmobiliarias','/whatsapp-para-inmobiliarias/','hemorragia',
 '{ventas,equipo}'),
('equipo_y_asesores','Performance de asesores',
 'Como se mide, se estandariza y se sostiene el rendimiento de un equipo comercial.',
 'performance asesores inmobiliaria','/performance-asesores/','anarquia',
 '{equipo,ventas}'),
('automatizacion_inmobiliaria','Automatizacion inmobiliaria',
 'Que tareas del dia a dia pueden dejar de depender de que alguien se acuerde.',
 'automatizacion inmobiliaria','/automatizacion-inmobiliaria/','anarquia',
 '{alquileres_administracion,equipo,ventas}'),
('ia_para_inmobiliarias','IA para inmobiliarias',
 'Donde tiene sentido usar IA en una inmobiliaria y donde no.',
 'IA para inmobiliarias','/ia-para-inmobiliarias/','anarquia',
 '{ventas,direccion}'),
('kpis_y_gobernanza','KPIs inmobiliarios',
 'Que mira un director para dirigir con datos en vez de con comentarios de pasillo.',
 'KPIs inmobiliarios','/kpis-inmobiliarios/','ceguera',
 '{direccion,equipo}'),
('escalar_inmobiliaria','Escalar una inmobiliaria',
 'Como crecer en volumen sin que la estructura crezca en la misma proporcion.',
 'escalar inmobiliaria','/escalar-inmobiliaria/','ceguera',
 '{direccion,captacion_tasacion,pauta_marketing}')
on conflict (clave) do nothing;
