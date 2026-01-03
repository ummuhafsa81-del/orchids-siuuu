import { useState, useEffect } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Shield, Cpu, Activity, Info } from "lucide-react";

interface OnboardingModalProps {
  onComplete: () => void;
}

    export const OnboardingModal = ({ onComplete }: OnboardingModalProps) => {
      const [isOpen, setIsOpen] = useState(false);
      const [hasConsent, setHasConsent] = useState(false);
    
      useEffect(() => {
        const consent = localStorage.getItem("nova_automation_consent");
        const isOpenedAsFile = window.location.protocol === 'file:';
        
        // Only pop up automatically if the file is opened directly (protocol is file:)
        if (!consent && isOpenedAsFile) {
          setIsOpen(true);
        }
      }, []);

      const handleContinue = () => {
    if (hasConsent) {
      localStorage.setItem("nova_automation_consent", "true");
      setIsOpen(false);
      onComplete();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[550px] bg-white border-none shadow-2xl p-0 overflow-hidden rounded-3xl">
        <div className="bg-nova-pink p-8 text-white relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-3xl font-bold mb-2">Welcome to NOVA</h2>
            <p className="opacity-90">Your intelligent automation partner.</p>
          </div>
          <div className="absolute -right-10 -bottom-10 opacity-10 rotate-12">
            <Cpu size={200} />
          </div>
        </div>

        <div className="p-8 space-y-6">
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="mt-1 bg-nova-pink/10 p-2 rounded-lg text-nova-pink">
                <Shield size={20} />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Safety by Separation</h4>
                <p className="text-sm text-gray-500">The AI never touches your computer directly. It only creates plans for you to review.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="mt-1 bg-blue-100 p-2 rounded-lg text-blue-600">
                <Cpu size={20} />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Local Agent Execution</h4>
                <p className="text-sm text-gray-500">A small, transparent local agent carries out tasks only when you explicitly turn on Automation mode.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="mt-1 bg-green-100 p-2 rounded-lg text-green-600">
                <Activity size={20} />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Full Transparency</h4>
                <p className="text-sm text-gray-500">See every action in real-time with a live checklist. Stop any automation instantly with one click.</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-4">
            <div className="flex items-start space-x-3">
              <Checkbox 
                id="consent" 
                checked={hasConsent} 
                onCheckedChange={(checked) => setHasConsent(checked === true)}
                className="mt-1"
              />
              <label 
                htmlFor="consent" 
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-gray-700 cursor-pointer"
              >
                I understand that AI generates plans and a local agent executes them. I give my explicit consent to install and use the local automation agent when Automation mode is enabled.
              </label>
            </div>
          </div>

          <Button 
            className="w-full h-12 rounded-2xl bg-black hover:bg-gray-800 text-white font-semibold transition-all"
            disabled={!hasConsent}
            onClick={handleContinue}
          >
            Get Started
          </Button>
          
          <p className="text-center text-xs text-gray-400">
            You can uninstall the agent or revoke consent at any time in settings.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
