import { FeedbackForm } from "@/components/feedback-form"

export default function DirectorFeedbackPage() {
  return (
    <div className="flex-1 p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2 max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          Canal de Mejora Continua
        </h1>
        <p className="text-muted-foreground">
          Como Director, tu visión es clave. Comparte tus ideas para potenciar PRISMA en toda la organización.
        </p>
      </div>

      <div className="flex justify-center pt-4">
        <FeedbackForm />
      </div>
    </div>
  )
}
