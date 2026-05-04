import { FeedbackForm } from "@/components/feedback-form"

export default function AsesorFeedbackPage() {
  return (
    <div className="flex-1 p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2 max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          Sugerencias y Feedback
        </h1>
        <p className="text-muted-foreground">
          Tu experiencia diaria nos ayuda a mejorar. Cuéntanos qué necesitas para trabajar mejor.
        </p>
      </div>

      <div className="flex justify-center pt-4">
        <FeedbackForm />
      </div>
    </div>
  )
}
