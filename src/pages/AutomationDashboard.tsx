import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { 
  Play, 
  Square, 
  History, 
  Settings, 
  Sparkles, 
  ChevronLeft,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trash2,
  Camera,
  Eye,
  Plus,
  FileJson,
  Pause,
  RefreshCw,
  Loader2
} from "lucide-react";
import { Link } from "react-router-dom";
import { NovaLogoSvg } from "@/components/NovaLogoSvg";
import { TaskChecklist } from "@/components/TaskChecklist";
import { AgentStatusCard } from "@/components/AgentStatusCard";
import { WelcomeOnboarding } from "@/components/WelcomeOnboarding";
import { EditablePlan } from "@/components/EditablePlan";
import { useAutomation, AutomationPlan, AutomationTask } from "@/lib/automation";
import { aiPlanManager, AIPlan } from "@/lib/automation/aiPlanManager";
import { visualAgent, AgentEvent } from "@/lib/automation/visualAgent";
import { domStateCapture, DOMStateSnapshot } from "@/lib/automation/domStateCapture";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function AutomationDashboard() {
  const {
    isEnabled,
    hasConsent,
    agentStatus,
    currentPlan,
    executionHistory,
    enableAutomation,
    disableAutomation,
    setPlan,
    executePlan,
    stopExecution,
    clearHistory,
  } = useAutomation();

  const [showOnboarding, setShowOnboarding] = useState(!hasConsent);
  const [showHistory, setShowHistory] = useState(false);
  const [aiPlans, setAiPlans] = useState<AIPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [lastScreenshot, setLastScreenshot] = useState<string | null>(null);
  const [lastDOMState, setLastDOMState] = useState<DOMStateSnapshot | null>(null);
  const [showNewPlanModal, setShowNewPlanModal] = useState(false);
  const [newPlanGoal, setNewPlanGoal] = useState('');
  const [agentState, setAgentState] = useState(visualAgent.getState());
  const [viewMode, setViewMode] = useState<'classic' | 'visual'>('visual');

  useEffect(() => {
    if (!hasConsent) {
      setShowOnboarding(true);
    }
  }, [hasConsent]);

  useEffect(() => {
    setAiPlans(aiPlanManager.getAllPlans());
    
    const handlePlanChange = () => {
      setAiPlans(aiPlanManager.getAllPlans());
    };
    
    aiPlanManager.addListener(handlePlanChange);
    return () => aiPlanManager.removeListener(handlePlanChange);
  }, []);

  useEffect(() => {
    const handleAgentEvent = (event: AgentEvent) => {
      setAgentState(visualAgent.getState());
      
      if (event.type === 'screenshot' && event.data.screenshot) {
        setLastScreenshot(event.data.screenshot as string);
      }
      if (event.type === 'dom_state' && event.data.domState) {
        setLastDOMState(event.data.domState as DOMStateSnapshot);
      }
      if (event.type === 'step_complete') {
        toast.success('Step completed');
      }
      if (event.type === 'step_fail') {
        toast.error(`Step failed: ${event.data.error}`);
      }
      if (event.type === 'plan_complete') {
        toast.success('Plan completed!');
      }
    };

    visualAgent.addEventListener(handleAgentEvent);
    return () => visualAgent.removeEventListener(handleAgentEvent);
  }, []);

  const handleToggleAutomation = (enabled: boolean) => {
    if (enabled) {
      enableAutomation();
      domStateCapture.startErrorMonitoring();
      toast.success("Automation mode enabled");
    } else {
      disableAutomation();
      domStateCapture.stopErrorMonitoring();
      toast.info("Automation mode disabled");
    }
  };

  const handleCreatePlan = useCallback(() => {
    if (!newPlanGoal.trim()) return;
    
    const plan = aiPlanManager.createPlanFromGoal(newPlanGoal);
    setSelectedPlanId(plan.id);
    setNewPlanGoal('');
    setShowNewPlanModal(false);
    toast.success('Plan created');
  }, [newPlanGoal]);

  const handleRunPlan = useCallback(async (planId: string) => {
    if (!isEnabled) {
      toast.error("Enable automation mode first");
      return;
    }
    
    setSelectedPlanId(planId);
    await visualAgent.startPlan(planId);
  }, [isEnabled]);

  const handlePausePlan = useCallback(() => {
    visualAgent.pause();
    toast.info('Plan paused');
  }, []);

  const handleStopPlan = useCallback(() => {
    visualAgent.stop();
    toast.info('Plan stopped');
  }, []);

  const handleResumePlan = useCallback(async () => {
    await visualAgent.resume();
    toast.success('Plan resumed');
  }, []);

  const handleTakeScreenshot = useCallback(async () => {
    const screenshot = await visualAgent.takeScreenshot();
    if (screenshot) {
      setLastScreenshot(screenshot);
      toast.success('Screenshot captured');
    }
  }, []);

  const handleCaptureDOMState = useCallback(() => {
    const state = visualAgent.captureDOMState();
    setLastDOMState(state);
    toast.success('DOM state captured');
  }, []);

  const handleImportPlan = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const text = await file.text();
        try {
          const plan = aiPlanManager.importPlan(text);
          setSelectedPlanId(plan.id);
          toast.success('Plan imported');
        } catch {
          toast.error('Failed to import plan');
        }
      }
    };
    input.click();
  }, []);

  const isExecuting = agentState.isRunning;
  const isPaused = agentState.isPaused;

  return (
    <div className="min-h-screen bg-zinc-950">
      <WelcomeOnboarding open={showOnboarding} onOpenChange={setShowOnboarding} />
      
      <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-sm border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/" className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors">
                <ChevronLeft className="w-4 h-4" />
                <span className="text-sm">Back</span>
              </Link>
              <div className="w-px h-6 bg-zinc-800" />
              <NovaLogoSvg className="h-8 w-auto" />
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-zinc-900 rounded-lg px-2 py-1">
                <button
                  onClick={() => setViewMode('classic')}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded transition-colors",
                    viewMode === 'classic' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                  )}
                >
                  Classic
                </button>
                <button
                  onClick={() => setViewMode('visual')}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded transition-colors",
                    viewMode === 'visual' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                  )}
                >
                  Visual Agent
                </button>
              </div>

              <div className="flex items-center gap-3 bg-zinc-900 rounded-full px-4 py-2">
                <span className="text-sm text-zinc-400">Automation</span>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={handleToggleAutomation}
                  disabled={!hasConsent}
                  className="data-[state=checked]:bg-emerald-500"
                />
              </div>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowHistory(!showHistory)}
                className="relative text-zinc-400 hover:text-white"
              >
                <History className="w-5 h-5" />
                {executionHistory.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-white text-[10px] rounded-full flex items-center justify-center">
                    {executionHistory.length}
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {viewMode === 'visual' ? (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-white mb-2">Visual Agent</h1>
                  <p className="text-zinc-500">AI-powered automation with screenshots and DOM state capture.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleTakeScreenshot}
                    variant="outline"
                    size="sm"
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Screenshot
                  </Button>
                  <Button
                    onClick={handleCaptureDOMState}
                    variant="outline"
                    size="sm"
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Capture DOM
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                  <Button
                    onClick={() => setShowNewPlanModal(true)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    New Plan
                  </Button>
                  <Button
                    onClick={handleImportPlan}
                    variant="outline"
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  >
                    <FileJson className="w-4 h-4 mr-2" />
                    Import Plan
                  </Button>
                </div>

                {showNewPlanModal && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <h3 className="text-white font-medium mb-3">Create New Plan</h3>
                    <textarea
                      value={newPlanGoal}
                      onChange={(e) => setNewPlanGoal(e.target.value)}
                      placeholder="Describe what you want to automate..."
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500 min-h-[100px]"
                      autoFocus
                    />
                    <div className="flex gap-2 mt-3">
                      <Button
                        onClick={handleCreatePlan}
                        disabled={!newPlanGoal.trim()}
                        className="bg-emerald-600 hover:bg-emerald-500"
                      >
                        Create Plan
                      </Button>
                      <Button
                        onClick={() => setShowNewPlanModal(false)}
                        variant="outline"
                        className="border-zinc-700 text-zinc-300"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

              {aiPlans.length === 0 ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
                  <Sparkles className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">No Plans Yet</h3>
                  <p className="text-zinc-500 mb-4">Create your first AI-driven automation plan</p>
                  <Button
                    onClick={() => setShowNewPlanModal(true)}
                    className="bg-emerald-600 hover:bg-emerald-500"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Plan
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {aiPlans.map((plan) => (
                    <EditablePlan
                      key={plan.id}
                      planId={plan.id}
                      onRunPlan={handleRunPlan}
                      onPausePlan={handlePausePlan}
                      onStopPlan={handleStopPlan}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Agent Status</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400 text-sm">Status</span>
                    <span className={cn(
                      "text-sm font-medium",
                      isExecuting ? "text-amber-400" : isPaused ? "text-blue-400" : "text-zinc-500"
                    )}>
                      {isExecuting ? 'Running' : isPaused ? 'Paused' : 'Idle'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400 text-sm">Steps Executed</span>
                    <span className="text-white text-sm">{agentState.stepsExecuted}</span>
                  </div>
                  {agentState.lastError && (
                    <div className="p-2 bg-red-500/10 border border-red-500/20 rounded">
                      <p className="text-xs text-red-400">{agentState.lastError}</p>
                    </div>
                  )}
                </div>
              </div>

              {lastScreenshot && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-800">
                    <h3 className="text-sm font-semibold text-white">Last Screenshot</h3>
                  </div>
                  <div className="p-2">
                    <img 
                      src={lastScreenshot} 
                      alt="Screenshot" 
                      className="w-full rounded border border-zinc-700"
                    />
                  </div>
                </div>
              )}

              {lastDOMState && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-800">
                    <h3 className="text-sm font-semibold text-white">DOM State</h3>
                  </div>
                  <div className="p-4 space-y-2 text-xs">
                    <div className="flex justify-between text-zinc-400">
                      <span>Page</span>
                      <span className="text-zinc-300 truncate max-w-[200px]">{lastDOMState.pageState.title}</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Buttons</span>
                      <span className="text-emerald-400">{lastDOMState.buttons.length}</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Inputs</span>
                      <span className="text-blue-400">{lastDOMState.inputs.length}</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Links</span>
                      <span className="text-purple-400">{lastDOMState.links.length}</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Interactive</span>
                      <span className="text-amber-400">{lastDOMState.interactiveElements.length}</span>
                    </div>
                    {lastDOMState.errorElements.length > 0 && (
                      <div className="flex justify-between text-zinc-400">
                        <span>Errors</span>
                        <span className="text-red-400">{lastDOMState.errorElements.length}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <AnimatePresence>
                {showHistory && executionHistory.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden"
                  >
                    <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                      <h3 className="font-semibold text-white text-sm">History</h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearHistory}
                        className="text-zinc-400 hover:text-red-500 h-8 px-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="divide-y divide-zinc-800 max-h-80 overflow-y-auto">
                      {executionHistory.map((log) => (
                        <div key={log.id} className="px-4 py-3 flex items-center gap-3">
                          {log.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                          {log.status === 'failed' && <XCircle className="w-4 h-4 text-red-500" />}
                          {log.status === 'cancelled' && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-300 truncate">{log.planTitle}</p>
                            <p className="text-xs text-zinc-500">
                              {log.tasksCompleted}/{log.totalTasks} tasks
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {!isEnabled && hasConsent && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-400">Automation is off</p>
                      <p className="text-xs text-amber-500/70 mt-0.5">
                        Enable automation mode to run plans
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <ClassicAutomationView
            isEnabled={isEnabled}
            currentPlan={currentPlan}
            setPlan={setPlan}
            executePlan={executePlan}
            stopExecution={stopExecution}
            executionHistory={executionHistory}
            showHistory={showHistory}
            clearHistory={clearHistory}
            hasConsent={hasConsent}
            agentStatus={agentStatus}
          />
        )}
      </main>
    </div>
  );
}

interface ClassicAutomationViewProps {
  isEnabled: boolean;
  currentPlan: AutomationPlan | null;
  setPlan: (plan: AutomationPlan | null) => void;
  executePlan: () => void;
  stopExecution: () => void;
  executionHistory: any[];
  showHistory: boolean;
  clearHistory: () => void;
  hasConsent: boolean;
  agentStatus: string;
}

function ClassicAutomationView({
  isEnabled,
  currentPlan,
  setPlan,
  executePlan,
  stopExecution,
  executionHistory,
  showHistory,
  clearHistory,
  hasConsent,
  agentStatus,
}: ClassicAutomationViewProps) {
  const samplePlans = [
    {
      title: "Organize Project Files",
      description: "Scan and organize files in the project directory",
      status: 'ready' as const,
      tasks: [
        { id: '1', action: 'Scanning project structure', status: 'pending' as const },
        { id: '2', action: 'Identifying file types', status: 'pending' as const },
        { id: '3', action: 'Creating folder structure', status: 'pending' as const },
        { id: '4', action: 'Moving files to categories', status: 'pending' as const },
        { id: '5', action: 'Generating summary report', status: 'pending' as const },
      ],
    },
    {
      title: "Setup Development Environment",
      description: "Configure local development tools and dependencies",
      status: 'ready' as const,
      tasks: [
        { id: '1', action: 'Checking Node.js version', status: 'pending' as const },
        { id: '2', action: 'Installing dependencies', status: 'pending' as const },
        { id: '3', action: 'Configuring environment variables', status: 'pending' as const },
        { id: '4', action: 'Setting up database connection', status: 'pending' as const },
        { id: '5', action: 'Running initial migrations', status: 'pending' as const },
        { id: '6', action: 'Verifying setup complete', status: 'pending' as const },
      ],
    },
  ];

  const handleSelectPlan = (plan: typeof samplePlans[0]) => {
    const newPlan: AutomationPlan = {
      ...plan,
      id: Date.now().toString(),
      createdAt: new Date(),
      tasks: plan.tasks.map(t => ({ ...t, status: 'pending' as const })),
    };
    setPlan(newPlan);
  };

  const handleStartExecution = () => {
    if (!isEnabled) {
      toast.error("Enable automation mode first");
      return;
    }
    executePlan();
    toast.success("Execution started");
  };

  const isExecuting = currentPlan?.status === 'executing';

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Classic Automation</h1>
          <p className="text-zinc-500">Select a plan and watch the local agent execute it in real-time.</p>
        </div>

        {!currentPlan ? (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Available Plans</h2>
            <div className="grid gap-4">
              {samplePlans.map((plan, index) => (
                <motion.button
                  key={index}
                  onClick={() => handleSelectPlan(plan)}
                  className="w-full text-left bg-zinc-900 rounded-lg border border-zinc-800 p-5 hover:border-emerald-500/50 hover:bg-zinc-800/50 transition-all group"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-white group-hover:text-emerald-400 transition-colors">
                        {plan.title}
                      </h3>
                      <p className="text-sm text-zinc-500 mt-1">{plan.description}</p>
                      <div className="flex items-center gap-2 mt-3">
                        <span className="px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-400">
                          {plan.tasks.length} steps
                        </span>
                      </div>
                    </div>
                    <Sparkles className="w-5 h-5 text-zinc-600 group-hover:text-emerald-400 transition-colors" />
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">{currentPlan.title}</h2>
                <p className="text-sm text-zinc-500">{currentPlan.description}</p>
              </div>
              <div className="flex items-center gap-2">
                {!isExecuting && currentPlan.status !== 'completed' && (
                  <Button
                    variant="ghost"
                    onClick={() => setPlan(null)}
                    className="text-zinc-500"
                  >
                    Cancel
                  </Button>
                )}
                {isExecuting ? (
                  <Button
                    onClick={stopExecution}
                    className="bg-red-500 hover:bg-red-600 text-white"
                  >
                    <Square className="w-4 h-4 mr-2 fill-current" />
                    Stop
                  </Button>
                ) : currentPlan.status !== 'completed' ? (
                  <Button
                    onClick={handleStartExecution}
                    disabled={!isEnabled}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                  >
                    <Play className="w-4 h-4 mr-2 fill-current" />
                    Run Plan
                  </Button>
                ) : (
                  <Button
                    onClick={() => setPlan(null)}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white"
                  >
                    New Plan
                  </Button>
                )}
              </div>
            </div>

            <TaskChecklist tasks={currentPlan.tasks} />
          </div>
        )}
      </div>

      <div className="space-y-6">
        <AgentStatusCard status={agentStatus} isEnabled={isEnabled} />

        <AnimatePresence>
          {showHistory && executionHistory.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="font-semibold text-white text-sm">Execution History</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearHistory}
                  className="text-zinc-400 hover:text-red-500 h-8 px-2"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="divide-y divide-zinc-800 max-h-80 overflow-y-auto">
                {executionHistory.map((log) => (
                  <div key={log.id} className="px-5 py-3 flex items-center gap-3">
                    {log.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    {log.status === 'failed' && <XCircle className="w-4 h-4 text-red-500" />}
                    {log.status === 'cancelled' && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-300 truncate">{log.planTitle}</p>
                      <p className="text-xs text-zinc-500">
                        {log.tasksCompleted}/{log.totalTasks} tasks • {new Date(log.executedAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!isEnabled && hasConsent && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-400">Automation is off</p>
                <p className="text-xs text-amber-500/70 mt-0.5">
                  Enable automation mode to run plans
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
