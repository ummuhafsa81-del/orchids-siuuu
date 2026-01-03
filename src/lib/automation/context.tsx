import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { AutomationState, AutomationPlan, AutomationTask, AgentStatus, ExecutionLog, TaskStatus } from './types';
import * as historyStorage from './historyStorage';
import { ExecutionScreenshotCapture } from '../screenshotStorage';

interface AutomationContextType extends AutomationState {
  enableAutomation: () => void;
  disableAutomation: () => void;
  setConsent: (consent: boolean) => void;
  setPlan: (plan: AutomationPlan | null) => void;
  executePlan: () => void;
  stopExecution: () => void;
  updateTaskStatus: (taskId: string, status: TaskStatus, error?: string) => void;
  clearHistory: () => void;
  loadHistory: () => Promise<void>;
}

const AutomationContext = createContext<AutomationContextType | null>(null);

const CONSENT_KEY = 'nova_automation_consent';

export function AutomationProvider({ children }: { children: ReactNode }) {
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const screenshotCaptureRef = useRef<ExecutionScreenshotCapture | null>(null);
    
    const [state, setState] = useState<AutomationState>(() => {
    const savedConsent = localStorage.getItem(CONSENT_KEY) === 'true';
    
    return {
      isEnabled: false,
      hasConsent: savedConsent,
      agentStatus: {
        isInstalled: savedConsent,
        isRunning: false,
        isConnected: false,
        version: '1.0.0',
      },
      currentPlan: null,
      executionHistory: [],
    };
  });

  useEffect(() => {
    const email = sessionStorage.getItem("userEmail");
    if (email) {
      setUserEmail(email);
      setUserId(email.toLowerCase().trim());
    }
  }, []);

  const [executionInterval, setExecutionInterval] = useState<NodeJS.Timeout | null>(null);

  const loadHistory = useCallback(async () => {
    if (!userEmail) return;
    try {
      const history = await historyStorage.loadExecutionHistory(userEmail);
      setState(prev => ({ ...prev, executionHistory: history }));
    } catch (err) {
      console.error('Failed to load execution history:', err);
    }
  }, [userEmail]);

  useEffect(() => {
    if (userEmail) {
      loadHistory();
    }
  }, [loadHistory, userEmail]);

  useEffect(() => {
    if (state.hasConsent) {
      setState(prev => ({
        ...prev,
        agentStatus: {
          ...prev.agentStatus,
          isInstalled: true,
          isRunning: prev.isEnabled,
          isConnected: prev.isEnabled,
          lastHeartbeat: prev.isEnabled ? new Date() : undefined,
        }
      }));
    }
  }, [state.isEnabled, state.hasConsent]);

  const enableAutomation = useCallback(() => {
    if (!state.hasConsent) return;
    setState(prev => ({ ...prev, isEnabled: true }));
  }, [state.hasConsent]);

  const disableAutomation = useCallback(() => {
    setState(prev => ({ ...prev, isEnabled: false }));
    if (executionInterval) {
      clearInterval(executionInterval);
      setExecutionInterval(null);
    }
  }, [executionInterval]);

  const setConsent = useCallback((consent: boolean) => {
    localStorage.setItem(CONSENT_KEY, String(consent));
    setState(prev => ({
      ...prev,
      hasConsent: consent,
      agentStatus: {
        ...prev.agentStatus,
        isInstalled: consent,
      }
    }));
  }, []);

  const setPlan = useCallback((plan: AutomationPlan | null) => {
    setState(prev => ({ ...prev, currentPlan: plan }));
  }, []);

  const updateTaskStatus = useCallback((taskId: string, status: TaskStatus, error?: string) => {
    setState(prev => {
      if (!prev.currentPlan) return prev;
      
      const updatedTasks = prev.currentPlan.tasks.map(task => 
        task.id === taskId 
          ? { 
              ...task, 
              status, 
              error,
              startedAt: status === 'in_progress' ? new Date() : task.startedAt,
              completedAt: ['completed', 'failed', 'cancelled'].includes(status) ? new Date() : task.completedAt,
            } 
          : task
      );

      const allCompleted = updatedTasks.every(t => t.status === 'completed');
      const hasFailed = updatedTasks.some(t => t.status === 'failed');
      
      return {
        ...prev,
        currentPlan: {
          ...prev.currentPlan,
          tasks: updatedTasks,
          status: hasFailed ? 'failed' : allCompleted ? 'completed' : prev.currentPlan.status,
        }
      };
    });
  }, []);

  const saveLog = useCallback(async (log: ExecutionLog) => {
    if (!userEmail) return;
    try {
      await historyStorage.saveExecutionLog(userEmail, log);
    } catch (err) {
      console.error('Failed to save execution log:', err);
    }
  }, [userEmail]);

  const executePlan = useCallback(() => {
    if (!state.currentPlan || !state.isEnabled) return;

    setState(prev => ({
      ...prev,
      currentPlan: prev.currentPlan ? { ...prev.currentPlan, status: 'executing' } : null,
    }));

    if (userId) {
      screenshotCaptureRef.current = new ExecutionScreenshotCapture(userId, state.currentPlan.id);
      screenshotCaptureRef.current.startAutoCapture(10000, state.currentPlan.title);
    }

    let currentIndex = 0;
    const tasks = state.currentPlan.tasks;
    const startTime = Date.now();

    const interval = setInterval(() => {
      if (currentIndex >= tasks.length) {
        clearInterval(interval);
        setExecutionInterval(null);
        
        if (screenshotCaptureRef.current) {
          screenshotCaptureRef.current.captureOnComplete(state.currentPlan?.title, true);
        }
        
        setState(prev => {
          if (!prev.currentPlan) return prev;
          
          const log: ExecutionLog = {
            id: Date.now().toString(),
            planId: prev.currentPlan.id,
            planTitle: prev.currentPlan.title,
            status: prev.currentPlan.tasks.every(t => t.status === 'completed') ? 'completed' : 'failed',
            tasksCompleted: prev.currentPlan.tasks.filter(t => t.status === 'completed').length,
            totalTasks: prev.currentPlan.tasks.length,
            executedAt: new Date(),
            duration: Date.now() - startTime,
          };

          saveLog(log);

          return {
            ...prev,
            currentPlan: { ...prev.currentPlan, status: 'completed' },
            executionHistory: [log, ...prev.executionHistory].slice(0, 50),
          };
        });
        return;
      }

      const task = tasks[currentIndex];
      
      if (screenshotCaptureRef.current) {
        screenshotCaptureRef.current.captureNow(task.description || task.action, 'in_progress', { taskId: task.id });
      }
      
      updateTaskStatus(task.id, 'in_progress');
      
      setTimeout(() => {
        const success = Math.random() > 0.05;
        updateTaskStatus(task.id, success ? 'completed' : 'failed', success ? undefined : 'Simulated failure');
        currentIndex++;
      }, 1000 + Math.random() * 2000);
      
    }, 2000);

    setExecutionInterval(interval);
  }, [state.currentPlan, state.isEnabled, updateTaskStatus, saveLog, userId]);

  const stopExecution = useCallback(() => {
    if (executionInterval) {
      clearInterval(executionInterval);
      setExecutionInterval(null);
    }
    
    if (screenshotCaptureRef.current) {
      screenshotCaptureRef.current.captureOnComplete(state.currentPlan?.title, false, { reason: 'cancelled' });
    }
    
    setState(prev => {
      if (!prev.currentPlan) return prev;
      
      const updatedTasks = prev.currentPlan.tasks.map(task => 
        task.status === 'in_progress' || task.status === 'pending' || task.status === 'queued'
          ? { ...task, status: 'cancelled' as TaskStatus }
          : task
      );

      const log: ExecutionLog = {
        id: Date.now().toString(),
        planId: prev.currentPlan.id,
        planTitle: prev.currentPlan.title,
        status: 'cancelled',
        tasksCompleted: updatedTasks.filter(t => t.status === 'completed').length,
        totalTasks: updatedTasks.length,
        executedAt: new Date(),
        duration: 0,
      };

      saveLog(log);

      return {
        ...prev,
        currentPlan: { ...prev.currentPlan, tasks: updatedTasks, status: 'cancelled' },
        executionHistory: [log, ...prev.executionHistory].slice(0, 50),
      };
    });
  }, [executionInterval, saveLog]);

  const clearHistory = useCallback(async () => {
    if (!userEmail) return;
    try {
      await historyStorage.clearExecutionHistory(userEmail);
      setState(prev => ({ ...prev, executionHistory: [] }));
    } catch (err) {
      console.error('Failed to clear execution history:', err);
    }
  }, [userEmail]);

  return (
    <AutomationContext.Provider value={{
      ...state,
      enableAutomation,
      disableAutomation,
      setConsent,
      setPlan,
      executePlan,
      stopExecution,
      updateTaskStatus,
      clearHistory,
      loadHistory,
    }}>
      {children}
    </AutomationContext.Provider>
  );
}

export function useAutomation() {
  const context = useContext(AutomationContext);
  if (!context) {
    throw new Error('useAutomation must be used within an AutomationProvider');
  }
  return context;
}
