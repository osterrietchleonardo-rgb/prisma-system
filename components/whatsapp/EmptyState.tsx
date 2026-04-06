import { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  subtitle?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon: Icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-in fade-in duration-500">
      <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-accent/50" aria-hidden="true" />
      </div>
      <h3 className="font-medium text-foreground">{title}</h3>
      {subtitle && (
        <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
          {subtitle}
        </p>
      )}
      {action && (
        <Button
          onClick={action.onClick}
          className="mt-6 bg-accent hover:bg-accent/90 text-white"
          aria-label={action.label}
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
