import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface StepperProps {
  steps: string[];
  currentStep: number;
  className?: string;
}

export function MarketingIAStepper({ steps, currentStep, className }: StepperProps) {
  return (
    <div className={cn("w-full py-4", className)}>
      <div className="flex items-center justify-between relative">
        {/* Progress Line */}
        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-muted -translate-y-1/2 z-0" />
        <div 
          className="absolute top-1/2 left-0 h-0.5 bg-accent -translate-y-1/2 z-0 transition-all duration-500" 
          style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
        />

        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;

          return (
            <div key={index} className="relative z-10 flex flex-col items-center">
              <div 
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                  isCompleted ? "bg-accent border-accent text-accent-foreground" : 
                  isCurrent ? "bg-background border-accent text-accent shadow-[0_0_10px_rgba(var(--accent),0.3)]" : 
                  "bg-background border-muted text-muted-foreground"
                )}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : index + 1}
              </div>
              <span 
                className={cn(
                  "absolute -bottom-6 text-[10px] whitespace-nowrap font-medium transition-colors duration-300 hidden sm:block",
                  isCurrent ? "text-foreground font-bold" : "text-muted-foreground"
                )}
              >
                {step}
              </span>
              {isCurrent && (
                <span className="absolute -top-10 text-[10px] sm:hidden whitespace-nowrap font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full border border-accent/20">
                  {step}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
