import { useState, useEffect } from "react";
import { Check, Loader2, Play, Square, AlertCircle, Terminal, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PlanStep {
  id: string;
  action: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  error?: string;
}

interface AutomationPlanProps {
  plan: PlanStep[];
  onStart: () => void;
  onStop: () => void;
  isExecuting: boolean;
  onComplete?: () => void;
}

export const AutomationPlan = ({ plan, onStart, onStop, isExecuting, onComplete }: AutomationPlanProps) => {
  const [steps, setSteps] = useState<PlanStep[]>(plan);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);

  // Simulation effect for execution
  useEffect(() => {
    let timeout: NodeJS.Timeout;

    if (isExecuting && currentStepIndex < steps.length) {
      const nextStep = () => {
        const nextIndex = currentStepIndex + 1;
        if (nextIndex < steps.length) {
          // Set current step to in_progress
          setSteps(prev => prev.map((s, i) => i === nextIndex ? { ...s, status: 'in_progress' } : s));
          setCurrentStepIndex(nextIndex);

          // Simulate work
          timeout = setTimeout(() => {
            setSteps(prev => prev.map((s, i) => i === nextIndex ? { ...s, status: 'completed' } : s));
            nextStep();
          }, 1500 + Math.random() * 2000);
        } else {
          onComplete?.();
        }
      };

      if (currentStepIndex === -1) {
        nextStep();
      }
    }

    return () => clearTimeout(timeout);
  }, [isExecuting, currentStepIndex]);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden my-4 max-w-2xl mx-auto">
      <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal size={18} className="text-nova-pink" />
          <h3 className="font-semibold text-gray-800">Automation Plan</h3>
        </div>
        <div className="flex items-center gap-2">
          {!isExecuting ? (
            <Button 
              size="sm" 
              onClick={onStart}
              className="bg-black text-white hover:bg-gray-800 rounded-full h-8 px-4"
            >
              <Play size={14} className="mr-2 fill-current" /> Run
            </Button>
          ) : (
            <Button 
              size="sm" 
              variant="destructive"
              onClick={onStop}
              className="rounded-full h-8 px-4"
            >
              <Square size={14} className="mr-2 fill-current" /> Stop
            </Button>
          )}
        </div>
      </div>
      
      <div className="p-6 space-y-4">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-start gap-4">
            <div className={`mt-1 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center border-2 ${
              step.status === 'completed' ? 'bg-green-500 border-green-500 text-white' :
              step.status === 'in_progress' ? 'border-nova-pink text-nova-pink' :
              step.status === 'failed' ? 'bg-red-500 border-red-500 text-white' :
              'border-gray-200 text-gray-300'
            }`}>
              {step.status === 'completed' && <Check size={12} strokeWidth={3} />}
              {step.status === 'in_progress' && <Loader2 size={12} strokeWidth={3} className="animate-spin" />}
              {step.status === 'failed' && <AlertCircle size={12} strokeWidth={3} />}
            </div>
            <div className="flex-1">
              <p className={`text-sm font-medium ${
                step.status === 'completed' ? 'text-gray-400 line-through' : 
                step.status === 'in_progress' ? 'text-gray-900' : 
                'text-gray-600'
              }`}>
                {step.action}
              </p>
              {step.status === 'in_progress' && (
                <p className="text-xs text-nova-pink mt-1 animate-pulse">Executing via local agent...</p>
              )}
              {step.error && (
                <p className="text-xs text-red-500 mt-1">{step.error}</p>
              )}
            </div>
          </div>
        ))}
      </div>
      
      <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Shield size={12} />
          <span>Local agent active • Safety rules applied</span>
        </div>
      </div>
    </div>
  );
};
