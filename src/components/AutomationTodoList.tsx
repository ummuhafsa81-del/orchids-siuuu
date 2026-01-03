import { useState, useEffect, useRef } from "react";
import { Check, Loader2, Play, Square, AlertCircle, Zap, ChevronDown, ChevronUp, Sparkles, Terminal, Camera, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { eventDrivenExecutor, ExecutionStep, StepResult } from "@/lib/automation/eventDrivenExecutor";
import { stateObserver, StateChangeEvent } from "@/lib/automation/stateObserver";

export interface AutomationStep {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  duration?: number;
  error?: string;
  command?: {
    action: string;
    params: Record<string, unknown>;
  };
}

interface AutomationTodoListProps {
  title: string;
  steps: AutomationStep[];
  isExecuting: boolean;
  onStart: () => void;
  onStop: () => void;
  onStepUpdate?: (stepId: string, status: AutomationStep['status']) => void;
  onComplete?: () => void;
  onScreenshotCaptured?: (screenshot: string, stepId: string) => void;
  agentConnected?: boolean;
}

export const AutomationTodoList = ({
  title,
  steps,
  isExecuting,
  onStart,
  onStop,
  onStepUpdate,
  onComplete,
  onScreenshotCaptured,
  agentConnected = false
}: AutomationTodoListProps) => {
  const [localSteps, setLocalSteps] = useState<AutomationStep[]>(steps);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [isExpanded, setIsExpanded] = useState(true);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [terminalLogs, setTerminalLogs] = useState<{msg: string, type: 'info' | 'error' | 'success' | 'state'}[]>([]);
  const [latestScreenshot, setLatestScreenshot] = useState<string | null>(null);
  const [stateChanges, setStateChanges] = useState<string[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const executionRef = useRef<boolean>(false);

  useEffect(() => {
    setLocalSteps(prev => {
      if (isExecuting) return prev;
      return steps;
    });
  }, [steps, isExecuting]);

  useEffect(() => {
    if (isExecuting) {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isExecuting]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  const addLog = (msg: string, type: 'info' | 'error' | 'success' | 'state' = 'info') => {
    setTerminalLogs(prev => [...prev, { msg, type }].slice(-50));
  };

  useEffect(() => {
    if (!isExecuting || !agentConnected || executionRef.current) return;

    executionRef.current = true;

    const executionSteps: ExecutionStep[] = localSteps.map(s => ({
      id: s.id,
      title: s.title,
      command: s.command
    }));

    addLog(`Starting event-driven execution: ${title}`);

    eventDrivenExecutor.execute(executionSteps, {
      onStepStart: (step, index) => {
        setCurrentStepIndex(index);
        setLocalSteps(prev => prev.map((s, i) => 
          i === index ? { ...s, status: 'in_progress' as const } : s
        ));
        onStepUpdate?.(step.id, 'in_progress');
        addLog(`Executing: ${step.title}...`);
      },

      onStepComplete: (step, result) => {
        const duration = result.endTime ? result.endTime - result.startTime : 0;
        
        setLocalSteps(prev => prev.map(s => 
          s.id === step.id ? { ...s, status: 'completed' as const, duration } : s
        ));
        onStepUpdate?.(step.id, 'completed');
        
        if (result.stateAfter?.screenshot) {
          setLatestScreenshot(result.stateAfter.screenshot.base64);
          onScreenshotCaptured?.(result.stateAfter.screenshot.base64, step.id);
        }
        
        if (result.changes && result.changes.length > 0) {
          addLog(`State changes: ${result.changes.join(', ')}`, 'state');
          setStateChanges(result.changes);
        }
        
        addLog(`Completed: ${step.title} (${(duration / 1000).toFixed(1)}s)`, 'success');
      },

      onStepFailed: (step, error) => {
        setLocalSteps(prev => prev.map(s => 
          s.id === step.id ? { ...s, status: 'failed' as const, error } : s
        ));
        onStepUpdate?.(step.id, 'failed');
        addLog(`Failed: ${step.title} - ${error}`, 'error');
      },

      onStateChange: (event: StateChangeEvent) => {
        if (event.current.screenshot) {
          setLatestScreenshot(event.current.screenshot.base64);
        }
      },

      onAllComplete: () => {
        addLog("Automation completed successfully.", "success");
        executionRef.current = false;
        onComplete?.();
      }
    }).catch(err => {
      addLog(`Execution error: ${err.message}`, 'error');
      executionRef.current = false;
      onStop();
    });

    return () => {
      if (!isExecuting) {
        eventDrivenExecutor.stop();
        executionRef.current = false;
      }
    };
  }, [isExecuting, agentConnected]);

  useEffect(() => {
    if (!isExecuting && executionRef.current) {
      eventDrivenExecutor.stop();
      executionRef.current = false;
    }
  }, [isExecuting]);

  const completedCount = localSteps.filter(s => s.status === 'completed').length;
  const progress = localSteps.length > 0 ? (completedCount / localSteps.length) * 100 : 0;
  const hasFailure = localSteps.some(s => s.status === 'failed');

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStart = () => {
    setCurrentStepIndex(-1);
    setLocalSteps(steps.map(s => ({ ...s, status: 'pending' as const, error: undefined })));
    setElapsedTime(0);
    setTerminalLogs([{ msg: `Initializing automation: ${title}`, type: 'info' }]);
    setLatestScreenshot(null);
    setStateChanges([]);
    stateObserver.reset();
    onStart();
  };

  const handleStop = () => {
    eventDrivenExecutor.stop();
    executionRef.current = false;
    onStop();
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden my-6 max-w-2xl mx-auto"
    >
      <div 
        className="px-6 py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <motion.div 
              animate={isExecuting ? { scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] } : {}}
              transition={{ repeat: Infinity, duration: 2 }}
              className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500",
                isExecuting 
                  ? "bg-pink-600 shadow-lg shadow-pink-200" 
                  : hasFailure 
                    ? "bg-red-100" 
                    : progress === 100 
                      ? "bg-green-100" 
                      : "bg-gray-100"
              )}
            >
              {isExecuting ? (
                <Sparkles className="w-6 h-6 text-white" />
              ) : hasFailure ? (
                <AlertCircle className="w-6 h-6 text-red-500" />
              ) : progress === 100 ? (
                <Check className="w-6 h-6 text-green-600" />
              ) : (
                <Zap className="w-6 h-6 text-gray-500" />
              )}
            </motion.div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">{title}</h3>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {completedCount} / {localSteps.length} steps
                </span>
                {isExecuting && (
                  <span className="text-xs font-mono text-pink-600 animate-pulse">
                    {formatTime(elapsedTime)}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {!isExecuting ? (
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); handleStart(); }}
                disabled={!agentConnected}
                className={cn(
                  "rounded-full h-10 px-6 font-bold transition-all",
                  agentConnected 
                    ? "bg-black hover:bg-gray-800 text-white shadow-lg hover:shadow-black/20" 
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                )}
              >
                <Play size={16} className="mr-2 fill-current" />
                {progress === 100 ? 'Restart' : 'Run Plan'}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="destructive"
                onClick={(e) => { e.stopPropagation(); handleStop(); }}
                className="rounded-full h-10 px-6 font-bold shadow-lg shadow-red-100"
              >
                <Square size={16} className="mr-2 fill-current" />
                Stop
              </Button>
            )}
            
            <button className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>
          </div>
        </div>

        <div className="mt-4 relative h-2 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ type: "spring", stiffness: 50, damping: 20 }}
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-colors duration-500",
              hasFailure ? "bg-red-500" : "bg-pink-600"
            )}
          />
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-6 space-y-3 bg-gray-50/30">
              {localSteps.map((step, index) => (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={cn(
                    "flex items-start gap-4 p-4 rounded-2xl border transition-all duration-300",
                    step.status === 'in_progress' && "bg-white border-pink-200 shadow-md ring-1 ring-pink-100 scale-[1.01]",
                    step.status === 'completed' && "bg-gray-50/50 border-transparent opacity-80",
                    step.status === 'failed' && "bg-red-50 border-red-200",
                    step.status === 'pending' && "bg-white border-gray-100"
                  )}
                >
                  <div className="relative flex-shrink-0 mt-0.5">
                    <motion.div 
                      animate={step.status === 'in_progress' ? { scale: [1, 1.2, 1] } : {}}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-500",
                        step.status === 'completed' && "bg-green-500 border-green-500",
                        step.status === 'in_progress' && "border-pink-500 bg-white shadow-sm",
                        step.status === 'failed' && "bg-red-500 border-red-500",
                        step.status === 'pending' && "border-gray-200 bg-white"
                      )}
                    >
                      {step.status === 'completed' && (
                        <Check size={16} className="text-white" strokeWidth={3} />
                      )}
                      {step.status === 'in_progress' && (
                        <Loader2 size={16} className="text-pink-500 animate-spin" strokeWidth={3} />
                      )}
                      {step.status === 'failed' && (
                        <AlertCircle size={16} className="text-white" strokeWidth={3} />
                      )}
                      {step.status === 'pending' && (
                        <span className="text-xs font-bold text-gray-400">{index + 1}</span>
                      )}
                    </motion.div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn(
                        "text-sm font-bold transition-all",
                        step.status === 'completed' && "text-gray-400 line-through font-normal",
                        step.status === 'in_progress' && "text-gray-900",
                        step.status === 'failed' && "text-red-700",
                        step.status === 'pending' && "text-gray-700"
                      )}>
                        {step.title}
                      </p>
                      {step.duration && step.status === 'completed' && (
                        <span className="text-[10px] font-mono font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                          {(step.duration / 1000).toFixed(1)}s
                        </span>
                      )}
                    </div>
                    
                    {step.description && (
                      <p className={cn(
                        "text-xs mt-1 leading-relaxed transition-colors",
                        step.status === 'in_progress' ? "text-pink-600 font-medium" : "text-gray-500"
                      )}>
                        {step.description}
                      </p>
                    )}
                    
                    {step.error && (
                      <motion.p 
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-[10px] text-red-600 mt-2 font-bold bg-red-100/50 px-2 py-1 rounded border border-red-200 inline-block"
                      >
                        Error: {step.error}
                      </motion.p>
                    )}
                  </div>
                </motion.div>
              ))}

              {terminalLogs.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-4 bg-gray-900 rounded-xl p-3 border border-gray-800 shadow-inner overflow-hidden"
                >
                  <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-800">
                    <Terminal size={12} className="text-gray-500" />
                    <span className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest">Event-Driven Console</span>
                    {stateChanges.length > 0 && (
                      <div className="ml-auto flex items-center gap-1 text-emerald-400">
                        <Activity size={10} />
                        <span className="text-[9px] font-mono">State tracking active</span>
                      </div>
                    )}
                  </div>
                  <div 
                    ref={logContainerRef}
                    className="h-24 overflow-y-auto space-y-1 font-mono text-[10px] scrollbar-hide"
                  >
                    {terminalLogs.map((log, i) => (
                      <div key={i} className={cn(
                        "flex gap-2",
                        log.type === 'error' ? "text-red-400" : 
                        log.type === 'success' ? "text-green-400" : 
                        log.type === 'state' ? "text-emerald-400" : "text-gray-400"
                      )}>
                        <span className="opacity-30">[{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}]</span>
                        {log.type === 'state' && <Activity size={10} className="mt-0.5" />}
                        <span>{log.msg}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {latestScreenshot && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-4 bg-gray-800 rounded-xl p-3 border border-gray-700"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Camera size={12} className="text-cyan-400" />
                    <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-widest">Live State</span>
                    <span className="ml-auto text-[9px] text-gray-500 font-mono">
                      {new Date().toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="relative rounded-lg overflow-hidden border border-gray-700">
                    <img 
                      src={latestScreenshot.startsWith('data:') ? latestScreenshot : `data:image/png;base64,${latestScreenshot}`}
                      alt="Current state"
                      className="w-full h-32 object-cover object-top"
                    />
                    {stateChanges.length > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                        <p className="text-[9px] text-emerald-300 font-mono truncate">
                          Changes: {stateChanges.slice(0, 3).join(', ')}
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!agentConnected && (
        <div className="px-6 pb-6 pt-2">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-4 shadow-sm"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900">Local Agent Disconnected</p>
              <p className="text-xs text-amber-700 mt-0.5 font-medium">Please run NovaAgent.bat to start executing this plan.</p>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
};
