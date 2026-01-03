import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Dialog, 
  DialogContent
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Shield, Cpu, Activity, Eye, Lock, Zap, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { useAutomation } from "@/lib/automation";

interface WelcomeOnboardingProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const steps = [
  {
    id: 'welcome',
    title: 'Welcome to NOVA',
    subtitle: 'Your intelligent automation partner',
  },
  {
    id: 'safety',
    title: 'Safety First',
    subtitle: 'How we keep you in control',
  },
  {
    id: 'consent',
    title: 'Your Permission',
    subtitle: 'Enable automation when you\'re ready',
  },
];

export function WelcomeOnboarding({ open, onOpenChange }: WelcomeOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [hasConsent, setHasConsent] = useState(false);
  const { setConsent } = useAutomation();

  const handleComplete = () => {
    if (hasConsent) {
      setConsent(true);
      onOpenChange(false);
    }
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px] bg-white border-none shadow-2xl p-0 overflow-hidden rounded-3xl">
        <div className="relative h-44 bg-gradient-to-br from-nova-pink via-nova-coral to-orange-400 overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0wIDBoNDB2NDBIMHoiLz48Y2lyY2xlIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iLjEiIGN4PSIyMCIgY3k9IjIwIiByPSIxIi8+PC9nPjwvc3ZnPg==')] opacity-30" />
          
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="text-center text-white z-10"
            >
              <motion.div 
                className="w-16 h-16 mx-auto mb-4 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center"
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity }}
              >
                <Sparkles className="w-8 h-8" />
              </motion.div>
              <h2 className="text-2xl font-bold">{steps[currentStep].title}</h2>
              <p className="text-white/80 mt-1">{steps[currentStep].subtitle}</p>
            </motion.div>
          </div>

          <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute -left-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
        </div>

        <div className="px-8 pb-8 pt-6">
          <div className="flex justify-center gap-2 mb-6">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  index === currentStep 
                    ? 'w-8 bg-nova-pink' 
                    : index < currentStep 
                      ? 'w-4 bg-nova-pink/40' 
                      : 'w-4 bg-gray-200'
                }`}
              />
            ))}
          </div>

          <AnimatePresence mode="wait">
            {currentStep === 0 && (
              <motion.div
                key="step-0"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <p className="text-gray-600 text-center leading-relaxed">
                  NOVA combines AI intelligence with local automation to help you accomplish tasks faster while keeping you in complete control.
                </p>
                
                <div className="grid grid-cols-3 gap-3 mt-6">
                  {[
                    { icon: Zap, label: 'Fast', desc: 'Instant execution' },
                    { icon: Shield, label: 'Safe', desc: 'You approve actions' },
                    { icon: Eye, label: 'Clear', desc: 'See everything' },
                  ].map(({ icon: Icon, label, desc }) => (
                    <div key={label} className="bg-gray-50 rounded-2xl p-4 text-center">
                      <div className="w-10 h-10 mx-auto mb-2 bg-white rounded-xl flex items-center justify-center shadow-sm">
                        <Icon className="w-5 h-5 text-nova-pink" />
                      </div>
                      <p className="font-semibold text-gray-900 text-sm">{label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {currentStep === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                {[
                  {
                    icon: Shield,
                    color: 'bg-nova-pink/10 text-nova-pink',
                    title: 'Safety by Separation',
                    desc: 'AI generates plans. A local agent executes them. Neither can act alone.',
                  },
                  {
                    icon: Cpu,
                    color: 'bg-blue-100 text-blue-600',
                    title: 'Local Agent',
                    desc: 'Small, signed executable that only activates when you enable Automation mode.',
                  },
                  {
                    icon: Activity,
                    color: 'bg-green-100 text-green-600',
                    title: 'Full Transparency',
                    desc: 'Watch every action in real-time. Stop instantly with one click.',
                  },
                  {
                    icon: Lock,
                    color: 'bg-amber-100 text-amber-600',
                      title: 'Safety Rules',
                      desc: 'The agent validates all actions against safety rules before executing.',
                  },
                ].map(({ icon: Icon, color, title, desc }) => (
                  <div key={title} className="flex gap-4">
                    <div className={`mt-0.5 p-2.5 rounded-xl ${color}`}>
                      <Icon size={18} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">{title}</h4>
                      <p className="text-sm text-gray-500">{desc}</p>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}

            {currentStep === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-5 rounded-2xl border border-gray-200">
                  <div className="flex items-start gap-3">
                    <Checkbox 
                      id="consent" 
                      checked={hasConsent} 
                      onCheckedChange={(checked) => setHasConsent(checked === true)}
                      className="mt-1 data-[state=checked]:bg-nova-pink data-[state=checked]:border-nova-pink"
                    />
                    <label 
                      htmlFor="consent" 
                      className="text-sm leading-relaxed text-gray-700 cursor-pointer"
                    >
                      I understand that AI generates plans and a local agent executes them. I give my explicit consent to install and use the local automation agent when Automation mode is enabled.
                    </label>
                  </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-2xl">
                  <p className="text-sm text-blue-700">
                    <strong>You're always in control.</strong> You can disable automation, revoke consent, or uninstall the agent at any time from Settings.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-between mt-8">
            <Button
              variant="ghost"
              onClick={prevStep}
              disabled={currentStep === 0}
              className="text-gray-500 hover:text-gray-700"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>

            {currentStep < steps.length - 1 ? (
              <Button
                onClick={nextStep}
                className="bg-black hover:bg-gray-800 text-white rounded-full px-6"
              >
                Continue
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={handleComplete}
                disabled={!hasConsent}
                className="bg-gradient-to-r from-nova-pink to-nova-coral hover:opacity-90 text-white rounded-full px-6 disabled:opacity-50"
              >
                Get Started
                <Sparkles className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
