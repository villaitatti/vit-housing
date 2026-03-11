import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  id: string;
  label: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
  completedSteps: Set<number>;
  onStepClick: (step: number) => void;
}

export function StepIndicator({ steps, currentStep, completedSteps, onStepClick }: StepIndicatorProps) {
  return (
    <nav aria-label="Progress" className="mb-8">
      <ol className="flex items-center justify-between">
        {steps.map((step, index) => {
          const stepNum = index + 1;
          const isCompleted = completedSteps.has(stepNum);
          const isCurrent = stepNum === currentStep;
          const isClickable = isCompleted || stepNum < currentStep;

          return (
            <li key={step.id} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && onStepClick(stepNum)}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                    isCompleted && !isCurrent &&
                      'border-primary bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90',
                    isCurrent &&
                      'border-primary ring-2 ring-primary ring-offset-2 bg-background text-primary',
                    !isCompleted && !isCurrent &&
                      'border-muted-foreground/30 text-muted-foreground cursor-default',
                  )}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isCompleted && !isCurrent ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    stepNum
                  )}
                </button>
                <span
                  className={cn(
                    'mt-1.5 hidden text-xs font-medium sm:block',
                    isCurrent && 'text-primary font-semibold',
                    isCompleted && !isCurrent && 'text-foreground',
                    !isCompleted && !isCurrent && 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'mx-2 h-0.5 flex-1',
                    isCompleted ? 'bg-primary' : 'bg-muted-foreground/20',
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
