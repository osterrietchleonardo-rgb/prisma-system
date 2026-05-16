/**
 * Layout independiente para páginas públicas del admin (login).
 * No hereda el layout protegido con auth check.
 * Los paréntesis en el nombre del directorio son un Route Group de Next.js
 * y NO afectan la URL — /admin-vakdor/login sigue siendo la ruta.
 */
export default function AdminPublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Sin auth check — solo renderizamos el contenido
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#070B14",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </div>
  )
}
