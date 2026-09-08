export const CHANNEL_COLORS: Record<string, string> = {
  Zonaprop: "bg-[#00c58e]/10 text-[#007050] dark:text-[#00c58e] border-[#00c58e]/20",
  Argenprop: "bg-[#ee2d24]/10 text-[#a81913] dark:text-[#ee2d24] border-[#ee2d24]/20",
  Mercadolibre: "bg-[#ffe600]/10 text-[#6b6100] dark:text-[#a39400] border-[#ffe600]/20",
  "Goplace.it": "bg-blue-500/10 text-blue-800 dark:text-blue-500 border-blue-500/20",
  EnBuenosAires: "bg-indigo-500/10 text-indigo-800 dark:text-indigo-500 border-indigo-500/20",
  Properati: "bg-rose-500/10 text-rose-800 dark:text-rose-500 border-rose-500/20",
  Salon: "bg-cyan-500/10 text-cyan-800 dark:text-cyan-500 border-cyan-500/20",
  Telefono: "bg-purple-500/10 text-purple-800 dark:text-purple-500 border-purple-500/20",
  Referido: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-500 border-emerald-500/20",
  Cartel: "bg-orange-500/10 text-orange-800 dark:text-orange-500 border-orange-500/20",
  ICasas: "bg-teal-500/10 text-teal-800 dark:text-teal-500 border-teal-500/20",
  Clienapp: "bg-sky-500/10 text-sky-800 dark:text-sky-500 border-sky-500/20",
  "Sin etiqueta": "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20",
};

export const FAST_CHART_COLORS: Record<string, string> = {
  Zonaprop: "#00c58e",
  Argenprop: "#ee2d24",
  Mercadolibre: "#ffe600",
  "Goplace.it": "#3b82f6",
  EnBuenosAires: "#6366f1",
  Properati: "#f43f5e",
  Salon: "#06b6d4",
  Telefono: "#a855f7",
  Referido: "#10b981",
  Cartel: "#f97316",
  ICasas: "#14b8a6",
  Clienapp: "#0ea5e9",
  "Sin etiqueta": "#64748b",
}

export const CLIENT_TYPE_COLORS: Record<string, string> = {
  Inversor: "bg-violet-500/10 text-violet-800 dark:text-violet-500",
  Inquilino: "bg-green-500/10 text-green-800 dark:text-green-500",
  Propietario: "bg-orange-500/10 text-orange-800 dark:text-orange-500",
  Colega: "bg-gray-500/10 text-gray-500",
  Proveedor: "bg-amber-800/10 text-amber-800",
  Gremio: "bg-blue-500/10 text-blue-800 dark:text-blue-500",
  "Sin clasificar": "bg-slate-200 text-slate-500",
};

/* Tono 800 en claro y 400 en oscuro: sobre el tinte del propio color, el 500
   se queda corto en oscuro (azul 4,31:1) y el 600 no llega en claro. Los chips
   neutros usan los tokens del tema; con `bg-slate-200` fijo quedaban como una
   pastilla clara flotando en el modo oscuro. */
export const OPERATION_COLORS: Record<string, string> = {
  Venta: "bg-blue-500/10 text-blue-800 dark:text-blue-400",
  Alquiler: "bg-green-500/10 text-green-800 dark:text-green-400",
  "Alquiler temporario": "bg-yellow-500/10 text-yellow-800 dark:text-yellow-400",
  Temporal: "bg-yellow-500/10 text-yellow-800 dark:text-yellow-400", // Alias
  "Sin dato": "bg-muted text-foreground",
};

export const STATUS_COLORS: Record<string, string> = {
  Activo: "bg-green-500/10 text-green-800 dark:text-green-400 border-green-500/20",
  "En negociación": "bg-blue-500/10 text-blue-800 dark:text-blue-400 border-blue-500/20",
  Cerrado: "bg-muted text-foreground border-border",
  Perdido: "bg-red-500/10 text-red-800 dark:text-red-400 border-red-500/20",
  "Sin estado": "bg-muted text-foreground border-border",
};

export const CHART_PALETTE = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#14b8a6", "#f97316"
]
