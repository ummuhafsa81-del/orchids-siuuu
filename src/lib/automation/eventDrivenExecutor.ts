import { getAgentClient } from './agentClient';
import { stateObserver, ObservedState, StateChangeEvent } from './stateObserver';

export interface ExecutionStep {
  id: string;
  title: string;
  command?: {
    action: string;
    params?: Record<string, unknown>;
  };
}

export type StepStatus = 'pending' | 'executing' | 'waiting_state' | 'completed' | 'failed';

export interface StepResult {
  stepId: string;
  status: StepStatus;
  startTime: number;
  endTime?: number;
  stateBefore?: ObservedState;
  stateAfter?: ObservedState;
  error?: string;
  changes?: string[];
}

export interface ExecutionEvents {
  onStepStart?: (step: ExecutionStep, index: number) => void;
  onStepComplete?: (step: ExecutionStep, result: StepResult) => void;
  onStepFailed?: (step: ExecutionStep, error: string) => void;
  onStateChange?: (event: StateChangeEvent) => void;
  onAllComplete?: (results: StepResult[]) => void;
}

interface ExecutionState {
  steps: ExecutionStep[];
  currentIndex: number;
  results: StepResult[];
  isRunning: boolean;
  isPaused: boolean;
}

class EventDrivenExecutor {
  private state: ExecutionState = {
    steps: [],
    currentIndex: -1,
    results: [],
    isRunning: false,
    isPaused: false
  };

  private events: ExecutionEvents = {};
  private stateChangeUnsubscribe: (() => void) | null = null;
  private waitingForStateChange = false;
  private stateChangeTimeout: number | null = null;
  private currentStepStartTime = 0;
  private stateBefore: ObservedState | null = null;

  async execute(steps: ExecutionStep[], events: ExecutionEvents = {}): Promise<StepResult[]> {
    this.state = {
      steps,
      currentIndex: -1,
      results: [],
      isRunning: true,
      isPaused: false
    };
    this.events = events;

    stateObserver.start(150);
    
    this.stateChangeUnsubscribe = stateObserver.on((event) => {
      this.handleStateChange(event);
    });

    try {
      await this.executeNextStep();
      
      while (this.state.isRunning && this.state.currentIndex < this.state.steps.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      return this.state.results;
    } finally {
      this.cleanup();
    }
  }

  private async executeNextStep(): Promise<void> {
    if (!this.state.isRunning || this.state.isPaused) return;

    this.state.currentIndex++;
    
    if (this.state.currentIndex >= this.state.steps.length) {
      this.state.isRunning = false;
      this.events.onAllComplete?.(this.state.results);
      return;
    }

    const step = this.state.steps[this.state.currentIndex];
    this.currentStepStartTime = Date.now();
    
    this.stateBefore = await stateObserver.captureNow();
    
    this.events.onStepStart?.(step, this.state.currentIndex);

    if (!step.command) {
      this.completeCurrentStep([]);
      return;
    }

    try {
      const client = getAgentClient();
      if (!client.connected) {
        throw new Error('Agent not connected');
      }

      const response = await client.execute({
        action: step.command.action as any,
        ...step.command.params
      });

      if (!response.success) {
        throw new Error(response.error || 'Command failed');
      }

      this.waitForStateChange();

    } catch (error) {
      this.failCurrentStep(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private waitForStateChange(): void {
    this.waitingForStateChange = true;
    
    this.stateChangeTimeout = window.setTimeout(() => {
      if (this.waitingForStateChange) {
        this.completeCurrentStep(['timeout_no_change']);
      }
    }, 3000);
  }

  private handleStateChange(event: StateChangeEvent): void {
    this.events.onStateChange?.(event);

    if (!this.waitingForStateChange) return;

    if (event.changes.length > 0 && !event.changes.includes('initial_state')) {
      this.waitingForStateChange = false;
      
      if (this.stateChangeTimeout) {
        clearTimeout(this.stateChangeTimeout);
        this.stateChangeTimeout = null;
      }

      this.completeCurrentStep(event.changes, event.current);
    }
  }

  private completeCurrentStep(changes: string[], stateAfter?: ObservedState): void {
    const step = this.state.steps[this.state.currentIndex];
    
    const result: StepResult = {
      stepId: step.id,
      status: 'completed',
      startTime: this.currentStepStartTime,
      endTime: Date.now(),
      stateBefore: this.stateBefore || undefined,
      stateAfter: stateAfter,
      changes
    };

    this.state.results.push(result);
    this.events.onStepComplete?.(step, result);

    setTimeout(() => this.executeNextStep(), 50);
  }

  private failCurrentStep(error: string): void {
    this.waitingForStateChange = false;
    
    if (this.stateChangeTimeout) {
      clearTimeout(this.stateChangeTimeout);
      this.stateChangeTimeout = null;
    }

    const step = this.state.steps[this.state.currentIndex];
    
    const result: StepResult = {
      stepId: step.id,
      status: 'failed',
      startTime: this.currentStepStartTime,
      endTime: Date.now(),
      stateBefore: this.stateBefore || undefined,
      error
    };

    this.state.results.push(result);
    this.events.onStepFailed?.(step, error);

    setTimeout(() => this.executeNextStep(), 50);
  }

  pause(): void {
    this.state.isPaused = true;
  }

  resume(): void {
    if (this.state.isPaused) {
      this.state.isPaused = false;
      if (this.waitingForStateChange) {
      } else {
        this.executeNextStep();
      }
    }
  }

  stop(): void {
    this.state.isRunning = false;
    this.waitingForStateChange = false;
    
    if (this.stateChangeTimeout) {
      clearTimeout(this.stateChangeTimeout);
      this.stateChangeTimeout = null;
    }

    this.cleanup();
  }

  private cleanup(): void {
    if (this.stateChangeUnsubscribe) {
      this.stateChangeUnsubscribe();
      this.stateChangeUnsubscribe = null;
    }
    stateObserver.stop();
  }

  getCurrentState(): ObservedState | null {
    return stateObserver.getLastState();
  }

  getScreenshot(): string | null {
    return stateObserver.getScreenshot();
  }

  isRunning(): boolean {
    return this.state.isRunning;
  }

  getCurrentStepIndex(): number {
    return this.state.currentIndex;
  }
}

export const eventDrivenExecutor = new EventDrivenExecutor();
export default eventDrivenExecutor;
