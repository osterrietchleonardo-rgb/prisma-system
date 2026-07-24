"use client";

import { useState } from "react";

// Barra de acciones (solo pantalla; se oculta al imprimir vía .no-print).
// "Descargar PDF" = imprimir la misma ficha → "Guardar como PDF" del navegador.
export default function PrintButton({ accent, onAccent, fileName }: { accent: string; onAccent: string; fileName: string }) {
  const [copied, setCopied] = useState(false);

  // El navegador usa el document.title como nombre del PDF: lo seteamos justo antes de imprimir y lo restauramos.
  const handlePrint = () => {
    const anterior = document.title;
    const restaurar = () => { document.title = anterior; };
    document.title = fileName;
    window.addEventListener("afterprint", restaurar, { once: true });
    try {
      window.print();
    } finally {
      setTimeout(restaurar, 1000);
    }
  };

  const doShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({ title: "Análisis Comparativo de Mercado", url });
        return;
      } catch {
        /* cancelado: caemos a copiar */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* sin permiso de clipboard */
    }
  };

  return (
    <div className="no-print fixed bottom-5 right-5 z-50 flex gap-3">
      <button
        onClick={doShare}
        className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-semibold shadow-lg bg-white text-neutral-800 border border-neutral-200 transition-transform active:scale-95"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        {copied ? "¡Link copiado!" : "Compartir"}
      </button>
      <button
        onClick={handlePrint}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold shadow-lg transition-transform active:scale-95"
        style={{ backgroundColor: accent, color: onAccent }}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
        </svg>
        Descargar PDF
      </button>
    </div>
  );
}
