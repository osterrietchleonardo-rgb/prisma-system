import { ParsedMessage } from "./waParser";
import { WAMetrics } from "./types";
import { differenceInDays, differenceInMinutes } from "date-fns";

export function calculateQuantitativeMetrics(messages: ParsedMessage[], usuarioName: string): WAMetrics {
  if (messages.length === 0) return {};

  const wa_total_mensajes = messages.length;
  let wa_mensajes_usuario = 0;
  let wa_mensajes_lead = 0;

  for (const m of messages) {
    if (m.sender === usuarioName) {
      wa_mensajes_usuario++;
    } else {
      wa_mensajes_lead++;
    }
  }

  const wa_ratioStr = wa_mensajes_lead === 0 ? wa_mensajes_usuario : (wa_mensajes_usuario / wa_mensajes_lead);
  const wa_ratio = parseFloat(wa_ratioStr.toFixed(1));

  const startDate = messages[0].timestamp;
  const endDate = messages[messages.length - 1].timestamp;
  let wa_duracion_dias = Math.max(1, differenceInDays(endDate, startDate) + 1); // Minimum 1 day

  const wa_msgs_por_dia = parseFloat((wa_total_mensajes / wa_duracion_dias).toFixed(1));

  const wa_quien_inicio = messages[0].sender === usuarioName ? "usuario" : "lead";

  let wa_tiempo_respuesta_inicial_min: number | null = null;
  if (wa_quien_inicio === "usuario") {
    wa_tiempo_respuesta_inicial_min = 0;
  } else {
    // Find first message from user
    const firstUserMsgIndex = messages.findIndex(m => m.sender === usuarioName);
    if (firstUserMsgIndex !== -1) {
      wa_tiempo_respuesta_inicial_min = differenceInMinutes(messages[firstUserMsgIndex].timestamp, messages[0].timestamp);
    }
  }

  const responseTimes: number[] = [];
  let userWaitingForLead = false;
  let lastLeadMsgTime: Date | null = null;

  for (let i = 0; i < messages.length; i++) {
    const isUser = messages[i].sender === usuarioName;
    if (!isUser) {
      if (!lastLeadMsgTime) lastLeadMsgTime = messages[i].timestamp;
      userWaitingForLead = true;
    } else {
      if (userWaitingForLead && lastLeadMsgTime) {
        const gap = differenceInMinutes(messages[i].timestamp, lastLeadMsgTime);
        if (gap <= 480) { // Ignore > 8 hours
          responseTimes.push(gap);
        }
        userWaitingForLead = false;
        lastLeadMsgTime = null;
      }
    }
  }

  let wa_tiempo_respuesta_promedio_min: number | null = null;
  if (responseTimes.length > 0) {
    wa_tiempo_respuesta_promedio_min = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
  }

  return {
    wa_quien_inicio,
    wa_tiempo_respuesta_inicial_min,
    wa_tiempo_respuesta_promedio_min,
    wa_duracion_dias,
    wa_total_mensajes,
    wa_mensajes_usuario,
    wa_mensajes_lead,
    wa_ratio,
    wa_msgs_por_dia
  };
}
