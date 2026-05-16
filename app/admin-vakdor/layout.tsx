import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verifyAdminToken } from "@/lib/admin-vakdor/auth"
import AdminSidebar from "@/components/admin-vakdor/sidebar"

export const metadata = {
  robots: { index: false, follow: false },
}

export default async function AdminVakdorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = cookies()
  const token = cookieStore.get("admin_vakdor_token")?.value

  if (!token) {
    redirect("/admin-vakdor/login")
  }

  const payload = await verifyAdminToken(token)
  if (!payload) {
    redirect("/admin-vakdor/login")
  }

  return (
    <html lang="es">
      <head>
        <meta name="robots" content="noindex, nofollow" />
      </head>
      <body className="bg-[#070B14] text-white antialiased">
        <div className="flex h-screen overflow-hidden">
          <AdminSidebar adminEmail={payload.email} />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
