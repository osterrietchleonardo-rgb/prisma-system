/**
 * Estado "barra lateral cerrada" en escritorio. Este archivo NO es de cliente
 * a propósito: el layout (server component) necesita el script como texto para
 * inyectarlo antes del primer dibujo, y los botones (client) usan la misma clave.
 */
export const CLAVE_BARRA = "prisma.barra"

/** Se inyecta en el layout ANTES de la barra: si quedó cerrada, ya arranca cerrada, sin salto. */
export const SCRIPT_ESTADO_BARRA =
  `(function(){try{if(localStorage.getItem("${CLAVE_BARRA}")==="oculta")document.documentElement.dataset.barra="oculta"}catch(e){}})()`
