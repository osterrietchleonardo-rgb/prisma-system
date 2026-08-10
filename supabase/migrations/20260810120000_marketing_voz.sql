-- Banco de recursos de voz para el motor de contenido de Marketing.
create table if not exists marketing_recursos (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null check (tipo in ('canon','estructura','escena','comentario')),
  clave        text,
  titulo       text not null,
  detalle      text not null,
  tags         text[] not null default '{}',
  activo       boolean not null default true,
  usos         integer not null default 0,
  ultimo_uso   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists marketing_recursos_tipo_activo_idx
  on marketing_recursos (tipo, activo);

alter table marketing_recursos enable row level security;
-- Sin políticas públicas: solo service_role (mismo criterio que marketing_ideas).

alter table marketing_ideas add column if not exists receta jsonb;

insert into marketing_recursos (tipo, clave, titulo, detalle) values
('canon','v1','Canon de voz de Vakdor',
$$Escribís como alguien que está adentro del rubro inmobiliario, no como un consultor que lo mira de afuera.

1. ESCENA PRIMERO. Abrí con una situación concreta y reconocible, nunca con una tesis abstracta. Mal: "La falta de sistematización erosiona la rentabilidad". Bien: "Te escribe por un tres ambientes y le mandás un menú genérico".
2. TOMÁ POSICIÓN. Afirmá algo que alguien podría discutir. Si nadie puede estar en desacuerdo con lo que escribiste, no dijiste nada.
3. GIRO DE CONCESIÓN. Concedele la razón al lector y ahí dala vuelta. "Y tienen razón. El software no te enseña a vender. Lo que hace es que el pibe nuevo de enfrente te robe tres ventas."
4. VIVENCIA DE CAMPO SIN INVENTAR DATOS. Podés escribir "hablo con directores que me dicen...", "lo veo todas las semanas". NUNCA inventes cifras, clientes, casos con nombre ni resultados atribuidos.
5. DETALLE ESPECÍFICO. Al menos dos anclas concretas por pieza: una hora, un día de la semana, un plazo, un tipo de propiedad, una cantidad. "Un sábado a la noche", "en dos minutos", "hace seis meses", "un tres ambientes".
6. CERRÁ EN LA CONSECUENCIA, no en un pedido. Que la última línea deje al lector con el costo de no hacer nada, no con un favor pedido.

Español rioplatense natural y hablado: "el pibe nuevo", "cortar la venta en seco", "te lo confirmo y te aviso". Sin solemnidad y sin jerga de consultora.$$);

insert into marketing_recursos (tipo, clave, titulo, detalle) values
('estructura','confesion','Confesión',
 'Contás un error o una creencia propia que resultó equivocada, y qué la corrigió. Arranca reconociendo algo que hacías mal. La autoridad viene de admitir, no de saber.'),
('estructura','concesion_vuelta','Concesión y vuelta',
 'Tomás la objeción más fuerte del lector, le decís que tiene razón, y mostrás que por eso mismo el problema real es otro. El giro tiene que llegar en el tercio inicial.'),
('estructura','escena_campo','Escena de campo',
 'Narrás una situación observada como si el lector estuviera ahí: qué pasó, en qué orden, qué se dijo. Recién al final nombrás lo que la escena demuestra.'),
('estructura','contraste','Contraste de dos perfiles',
 'Enfrentás dos personas o dos formas de trabajar (el de treinta años vs. el que empezó hace seis meses). No hay bueno y malo: cada uno gana en un terreno distinto.'),
('estructura','autopsia','Autopsia de un caso',
 'Desarmás paso por paso algo que salió mal, en orden cronológico, marcando en qué momento exacto se perdió. Terminás en el punto donde todavía se podía evitar.'),
('estructura','mito_realidad','Mito contra realidad',
 'Enunciás lo que se repite en el rubro y lo confrontás con lo que pasa cuando mirás los números. Un solo mito por pieza, desarrollado a fondo.'),
('estructura','carta_director','Carta al director',
 'Le hablás directo a una persona concreta, en segunda persona, como si le estuvieras escribiendo solo a él. Íntimo y directo, sin audiencia de por medio.'),
('estructura','numero_duele','El número que duele',
 'Arrancás con un número del negocio y desplegás todo lo que ese número implica hacia atrás. El número tiene que ser verificable o presentado como estimación honesta.');

insert into marketing_recursos (tipo, clave, titulo, detalle) values
('comentario','dato_crudo','Dato crudo con contexto',
 'Un número real con el contexto que lo hace doler. Nada de pedir nada. Dos o tres líneas.'),
('comentario','opinion_filosa','Opinión más filosa que el post',
 'Una postura más dura que la del post, que el post no se animó a decir. Controversia acotada al negocio, nunca agravio a personas.'),
('comentario','matiz','El matiz que nadie dice',
 'La excepción honesta: "esto no aplica si...". Es el que más autoridad da, porque demuestra que conocés los bordes del problema.'),
('comentario','micro_caso','Micro-caso en tres líneas',
 'La escena contada en tres líneas, sin moraleja ni cierre. Que el lector saque la conclusión.'),
('comentario','pregunta_binaria','Pregunta binaria concreta',
 'Una pregunta de dos opciones específicas del negocio. Prohibido "¿y vos qué opinás?" y cualquier variante genérica.');

insert into marketing_recursos (tipo, titulo, detalle) values
('escena','Menú automático a una consulta concreta','Preguntan por un tres ambientes en una zona puntual y el bot contesta con un menú de opciones genérico.'),
('escena','El lead del sábado a la noche','Entra una consulta de portal un sábado 22:40 y se contesta el lunes a las 10:15.'),
('escena','La cartera se va en el celular','Un asesor renuncia y con él se van los chats, los teléfonos y el historial de cada cliente.'),
('escena','El Excel paralelo','Cada asesor lleva su propia planilla porque el CRM "le queda incómodo", y nadie ve lo mismo.'),
('escena','El pasillo como sistema de reporte','El director se entera de que se cayó una operación por un comentario al pasar, no por el sistema.'),
('escena','El "te confirmo y te aviso"','Se le promete al cliente confirmar un dato y nadie vuelve nunca a ese chat.'),
('escena','La reunión de los lunes','Dos horas para que cada asesor cuente de memoria cómo viene, sin un solo dato duro sobre la mesa.'),
('escena','El mismo lead llamado dos veces','Dos asesores llaman al mismo cliente el mismo día porque entró por dos portales distintos.'),
('escena','La propiedad reservada que sigue publicada','Se reservó hace tres semanas y sigue online recibiendo consultas que alguien tiene que contestar.'),
('escena','Las expensas que nadie confirma','El cliente pregunta las expensas y la respuesta tarda dos días, o llega y está mal.'),
('escena','La visita que nadie confirmó','Se agenda una visita, nadie la confirma, el asesor viaja cuarenta minutos y el cliente no aparece.'),
('escena','El WhatsApp personal del asesor','Toda la relación con el cliente vive en un número de teléfono que la agencia no controla.'),
('escena','El lead frío que era el mejor','Un contacto de hace cuatro meses compra con otra agencia porque nadie le hizo seguimiento.'),
('escena','El informe armado a mano','Alguien pasa el viernes entero copiando números a una planilla para la reunión del lunes.'),
('escena','Dos asesores hacen el 70%','La mayoría de las operaciones las cierran dos personas y nadie sabe qué hacen distinto del resto.'),
('escena','La tasación por corazonada','Se define el precio con "yo conozco la zona" y la propiedad queda ocho meses publicada.'),
('escena','El propietario que llama a preguntar','El dueño llama para saber si hubo movimiento y nadie tiene la respuesta a mano.'),
('escena','El horario que no existe','Las consultas llegan de noche y los fines de semana; la agencia atiende de nueve a seis.'),
('escena','Los 47 chats sin leer','Lunes a la mañana: la bandeja tiene cuarenta y siete conversaciones sin abrir del fin de semana.'),
('escena','La búsqueda que nadie cruzó','Entra un comprador con el presupuesto exacto de una propiedad de la cartera y nadie los cruza.'),
('escena','El seguimiento que depende de la memoria','El recontacto ocurre solamente si el asesor se acuerda ese día.'),
('escena','El CRM cargado a medias','Los campos que de verdad importan están vacíos, porque cargarlos lleva tiempo y nadie los mira.'),
('escena','La competencia contesta en dos minutos','La inmobiliaria de enfrente responde al toque y se lleva la visita del sábado.'),
('escena','El presupuesto que nunca se pregunta','Se muestran cinco propiedades antes de saber cuánto puede pagar el cliente.'),
('escena','El "mandame info" que muere','Se manda la ficha en PDF y la conversación termina ahí, sin una sola pregunta de vuelta.'),
('escena','El asesor nuevo sin proceso','Entra alguien, aprende mirando, y a los tres meses hace las cosas distinto que todos los demás.'),
('escena','La operación que se cayó en silencio','Nadie registró por qué se perdió, así que el mes que viene se pierde igual por lo mismo.'),
('escena','El teléfono mal cargado','Un dígito de más al anotar y el lead queda inalcanzable para siempre.'),
('escena','La campaña que entra y se desborda','Se invierte en pauta, entran sesenta consultas y se contestan veintidós.'),
('escena','El cliente que ya contó todo','Repite su búsqueda por tercera vez porque cada vez lo atiende una persona distinta.');
