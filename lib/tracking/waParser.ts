export interface ParsedMessage {
  timestamp: Date;
  sender: string;
  text: string;
}

export function parseWhatsAppChat(text: string): ParsedMessage[] {
  const lines = text.split("\n");
  const messages: ParsedMessage[] = [];

  // Formato argentino: [04/10/24, 11:27:03 a. m.] Juan Perez: Hola
  // Regex to match timestamp and sender:
  // /^\[?(\d{2}\/\d{2}\/\d{2,4}),\s(\d{2}:\d{2}:\d{2})\s([ap]\.\s?m\.)\]?\s([^:]+):\s(.*)$/i
  const lineRegex = /^\[?(\d{2}\/\d{2}\/\d{2,4}),\s(\d{1,2}:\d{2}:\d{2})\s([ap]\.\s?m\.)\]?\s([^:]+):\s(.*)$/i;
  // A veces el formato no tiene brackets: 04/10/24, 11:27 a. m. - Nombre: Texto
  const lineRegexDash = /^(\d{2}\/\d{2}\/\d{2,4}),\s(\d{1,2}:\d{2}(?::\d{2})?)\s([ap]\.\s?m\.)\s-\s([^:]+):\s(.*)$/i;

  let currentMsg: ParsedMessage | null = null;

  for (let rawLine of lines) {
    // Remove invisible char \u200e
    const line = rawLine.replace(/\u200e/g, "").trim();
    if (!line) continue;
    
    // Ignore system messages
    if (line.includes("cifrados de extremo a extremo")) continue;

    const match = line.match(lineRegex) || line.match(lineRegexDash);

    if (match) {
      const [_, dateStr, timeStr, ampmStr, sender, msgText] = match;
      
      // Ignore media omitted
      if (msgText.toLowerCase().includes("omitido") || msgText.toLowerCase().includes("omitida")) {
        currentMsg = null;
        continue;
      }

      // Parse Date
      const [day, month, yearPart] = dateStr.split("/");
      const year = yearPart.length === 2 ? `20${yearPart}` : yearPart;
      
      const [hourStr, minStr, secStr] = timeStr.split(":");
      let hour = parseInt(hourStr, 10);
      const isPm = ampmStr.toLowerCase().includes("p");
      if (isPm && hour < 12) hour += 12;
      if (!isPm && hour === 12) hour = 0;

      const date = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        hour,
        parseInt(minStr),
        secStr ? parseInt(secStr) : 0
      );

      currentMsg = {
        timestamp: date,
        sender: sender.trim(),
        text: msgText.trim(),
      };
      messages.push(currentMsg);
    } else {
      // Continuation of previous message
      if (currentMsg) {
        // Double check it's not a dash system message like "10/05/24, 12:00 p. m. - Los mensajes y llamadas..."
        if (line.match(/^\d{2}\/\d{2}\/\d{2,4}/)) {
           // It's a new system message
           currentMsg = null;
           continue;
        }

        currentMsg.text += "\n" + line;
      }
    }
  }

  return messages;
}

export function getChatParticipants(messages: ParsedMessage[]): string[] {
  const participants = new Set<string>();
  for (const msg of messages) {
    participants.add(msg.sender);
  }
  return Array.from(participants);
}
