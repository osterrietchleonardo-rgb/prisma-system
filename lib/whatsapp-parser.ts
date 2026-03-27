/**
 * Sanitizes and parses WhatsApp chat export files (.txt)
 * to prepare them for AI analysis.
 */

export function parseWhatsAppChat(text: string) {
  // Remove empty lines and trim
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Basic cleaning: remove system messages like "Messages and calls are end-to-end encrypted"
  const cleanedLines = lines.filter(line => {
    const isSystemMessage = line.includes("end-to-end encrypted") || 
                            line.includes("changed their phone number") ||
                            line.includes("created group") ||
                            line.includes("added you");
    return !isSystemMessage;
  });

  // Limit size to avoid token overflow but keep enough context (last 100 lines)
  const truncatedChat = cleanedLines.slice(-100).join('\n');
  
  return truncatedChat;
}

export interface ChatAnalysisResult {
  lead_name?: string
  phone?: string
  search_intent: string
  response_time_eval: string
  lead_attitude: 'caluroso' | 'interesado' | 'dudoso' | 'frio'
  commercial_process_eval: string
  summary: string
  next_step: string
}
