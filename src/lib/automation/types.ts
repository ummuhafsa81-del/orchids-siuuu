export type TaskStatus = 'pending' | 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export interface AutomationTask {
  id: string;
  action: string;
  description?: string;
  status: TaskStatus;
  progress?: number;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
}

export interface AutomationPlan {
  id: string;
  title: string;
  description: string;
  tasks: AutomationTask[];
  createdAt: Date;
  status: 'draft' | 'ready' | 'executing' | 'completed' | 'failed' | 'cancelled';
  estimatedDuration?: number;
}

export interface AgentStatus {
  isInstalled: boolean;
  isRunning: boolean;
  isConnected: boolean;
  version?: string;
  lastHeartbeat?: Date;
}

export interface ExecutionLog {
  id: string;
  planId: string;
  planTitle: string;
  status: 'completed' | 'failed' | 'cancelled';
  tasksCompleted: number;
  totalTasks: number;
  executedAt: Date;
  duration: number;
  error?: string;
}

export interface AutomationState {
  isEnabled: boolean;
  hasConsent: boolean;
  agentStatus: AgentStatus;
  currentPlan: AutomationPlan | null;
  executionHistory: ExecutionLog[];
}
