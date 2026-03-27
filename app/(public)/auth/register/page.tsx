import RegisterForm from "@/components/auth-register-form"
import { Suspense } from "react"

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-accent/10 via-background to-background p-4 py-12">
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:40px_40px]"></div>
      <Suspense fallback={<div>Cargando...</div>}>
        <RegisterForm />
      </Suspense>
    </div>
  )
}
