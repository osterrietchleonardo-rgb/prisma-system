/**
 * Lo que ve un asesor cuando su agencia todavía no conectó WhatsApp. Solo el
 * director puede configurarlo; al asesor se le dice a quién pedírselo.
 */
export function WhatsAppNoConfigurado() {
  return (
    <div className="flex-1 flex items-center justify-center p-12">
      <div className="text-center space-y-3">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto text-3xl">
          💬
        </div>
        <h2 className="text-xl font-bold">WhatsApp no configurado</h2>
        <p className="text-muted-foreground text-sm max-w-xs mx-auto">
          Tu director de agencia aún no ha conectado WhatsApp Business. Pedile que lo configure desde su panel.
        </p>
      </div>
    </div>
  )
}
