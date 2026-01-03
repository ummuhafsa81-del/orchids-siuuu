import { DOMStateSnapshot } from './domStateCapture';

export interface PlanStep {
  id: string;
  description: string;
  action: 'click' | 'type' | 'navigate' | 'wait' | 'scroll' | 'screenshot' | 'verify' | 'custom';
  target?: string;
  value?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  error?: string;
  result?: string;
  screenshotBefore?: string;
  screenshotAfter?: string;
  domStateBefore?: DOMStateSnapshot;
  domStateAfter?: DOMStateSnapshot;
  createdAt: number;
  updatedAt: number;
  executedAt?: number;
  order: number;
}

export interface AIPlan {
  id: string;
  name: string;
  description: string;
  goal: string;
  steps: PlanStep[];
  status: 'draft' | 'running' | 'paused' | 'completed' | 'failed';
  currentStepIndex: number;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  screenshotOnEveryStep: boolean;
  captureStateOnEveryStep: boolean;
  pauseOnError: boolean;
  maxRetries: number;
  executionHistory: ExecutionEvent[];
}

export interface ExecutionEvent {
  id: string;
  timestamp: number;
  type: 'step_start' | 'step_complete' | 'step_fail' | 'plan_start' | 'plan_complete' | 'plan_fail' | 'ai_decision' | 'user_edit' | 'plan_modified';
  stepId?: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface AIDecisionContext {
  screenshot: string | null;
  domState: DOMStateSnapshot | null;
  currentPlan: AIPlan | null;
  currentStep: PlanStep | null;
  previousSteps: PlanStep[];
  errors: string[];
  userGoal: string;
}

export interface AIDecision {
  action: 'execute' | 'modify_plan' | 'add_step' | 'remove_step' | 'reorder_steps' | 'skip_step' | 'retry_step' | 'pause' | 'complete' | 'fail';
  reasoning: string;
  newSteps?: Partial<PlanStep>[];
  modifiedSteps?: { id: string; changes: Partial<PlanStep> }[];
  removedStepIds?: string[];
  nextStepId?: string;
}

type PlanChangeListener = (plan: AIPlan) => void;

class AIPlanManager {
  private plans: Map<string, AIPlan> = new Map();
  private activePlanId: string | null = null;
  private listeners: Set<PlanChangeListener> = new Set();

  createPlan(name: string, goal: string, description?: string): AIPlan {
    const plan: AIPlan = {
      id: `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description: description || '',
      goal,
      steps: [],
      status: 'draft',
      currentStepIndex: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      screenshotOnEveryStep: true,
      captureStateOnEveryStep: true,
      pauseOnError: true,
      maxRetries: 2,
      executionHistory: []
    };

    this.plans.set(plan.id, plan);
    this.addExecutionEvent(plan.id, 'plan_start', 'Plan created');
    this.notifyListeners(plan);
    return plan;
  }

  getPlan(planId: string): AIPlan | null {
    return this.plans.get(planId) || null;
  }

  getActivePlan(): AIPlan | null {
    return this.activePlanId ? this.plans.get(this.activePlanId) || null : null;
  }

  setActivePlan(planId: string | null) {
    this.activePlanId = planId;
    if (planId) {
      const plan = this.plans.get(planId);
      if (plan) this.notifyListeners(plan);
    }
  }

  getAllPlans(): AIPlan[] {
    return Array.from(this.plans.values());
  }

  deletePlan(planId: string) {
    this.plans.delete(planId);
    if (this.activePlanId === planId) {
      this.activePlanId = null;
    }
  }

  addStep(planId: string, step: Partial<PlanStep>): PlanStep {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error('Plan not found');

    const newStep: PlanStep = {
      id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      description: step.description || 'New step',
      action: step.action || 'custom',
      target: step.target,
      value: step.value,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      order: step.order ?? plan.steps.length
    };

    plan.steps.push(newStep);
    plan.steps.sort((a, b) => a.order - b.order);
    plan.updatedAt = Date.now();

    this.addExecutionEvent(planId, 'plan_modified', `Step added: ${newStep.description}`);
    this.notifyListeners(plan);
    return newStep;
  }

  addSteps(planId: string, steps: Partial<PlanStep>[]): PlanStep[] {
    return steps.map(step => this.addStep(planId, step));
  }

  updateStep(planId: string, stepId: string, changes: Partial<PlanStep>): PlanStep | null {
    const plan = this.plans.get(planId);
    if (!plan) return null;

    const stepIndex = plan.steps.findIndex(s => s.id === stepId);
    if (stepIndex === -1) return null;

    const step = plan.steps[stepIndex];
    Object.assign(step, changes, { updatedAt: Date.now() });
    plan.updatedAt = Date.now();

    this.addExecutionEvent(planId, 'plan_modified', `Step updated: ${step.description}`);
    this.notifyListeners(plan);
    return step;
  }

  removeStep(planId: string, stepId: string): boolean {
    const plan = this.plans.get(planId);
    if (!plan) return false;

    const stepIndex = plan.steps.findIndex(s => s.id === stepId);
    if (stepIndex === -1) return false;

    const removed = plan.steps.splice(stepIndex, 1)[0];
    plan.updatedAt = Date.now();

    this.addExecutionEvent(planId, 'plan_modified', `Step removed: ${removed.description}`);
    this.notifyListeners(plan);
    return true;
  }

  reorderSteps(planId: string, stepIds: string[]): boolean {
    const plan = this.plans.get(planId);
    if (!plan) return false;

    const stepMap = new Map(plan.steps.map(s => [s.id, s]));
    const newSteps: PlanStep[] = [];

    for (let i = 0; i < stepIds.length; i++) {
      const step = stepMap.get(stepIds[i]);
      if (step) {
        step.order = i;
        newSteps.push(step);
      }
    }

    plan.steps = newSteps;
    plan.updatedAt = Date.now();

    this.addExecutionEvent(planId, 'plan_modified', 'Steps reordered');
    this.notifyListeners(plan);
    return true;
  }

  moveStepUp(planId: string, stepId: string): boolean {
    const plan = this.plans.get(planId);
    if (!plan) return false;

    const stepIndex = plan.steps.findIndex(s => s.id === stepId);
    if (stepIndex <= 0) return false;

    const temp = plan.steps[stepIndex - 1].order;
    plan.steps[stepIndex - 1].order = plan.steps[stepIndex].order;
    plan.steps[stepIndex].order = temp;
    plan.steps.sort((a, b) => a.order - b.order);
    plan.updatedAt = Date.now();

    this.notifyListeners(plan);
    return true;
  }

  moveStepDown(planId: string, stepId: string): boolean {
    const plan = this.plans.get(planId);
    if (!plan) return false;

    const stepIndex = plan.steps.findIndex(s => s.id === stepId);
    if (stepIndex >= plan.steps.length - 1) return false;

    const temp = plan.steps[stepIndex + 1].order;
    plan.steps[stepIndex + 1].order = plan.steps[stepIndex].order;
    plan.steps[stepIndex].order = temp;
    plan.steps.sort((a, b) => a.order - b.order);
    plan.updatedAt = Date.now();

    this.notifyListeners(plan);
    return true;
  }

  setStepStatus(planId: string, stepId: string, status: PlanStep['status'], result?: string, error?: string) {
    const plan = this.plans.get(planId);
    if (!plan) return;

    const step = plan.steps.find(s => s.id === stepId);
    if (!step) return;

    step.status = status;
    step.updatedAt = Date.now();
    if (status === 'completed' || status === 'failed') {
      step.executedAt = Date.now();
    }
    if (result) step.result = result;
    if (error) step.error = error;

    plan.updatedAt = Date.now();

    const eventType = status === 'completed' ? 'step_complete' : 
                      status === 'failed' ? 'step_fail' : 
                      status === 'in_progress' ? 'step_start' : 'plan_modified';
    
    this.addExecutionEvent(planId, eventType, `Step ${status}: ${step.description}`, { stepId });
    this.notifyListeners(plan);
  }

  setPlanStatus(planId: string, status: AIPlan['status']) {
    const plan = this.plans.get(planId);
    if (!plan) return;

    plan.status = status;
    plan.updatedAt = Date.now();

    if (status === 'running' && !plan.startedAt) {
      plan.startedAt = Date.now();
    }
    if (status === 'completed' || status === 'failed') {
      plan.completedAt = Date.now();
    }

    const eventType = status === 'completed' ? 'plan_complete' : 
                      status === 'failed' ? 'plan_fail' : 'plan_modified';
    
    this.addExecutionEvent(planId, eventType, `Plan ${status}`);
    this.notifyListeners(plan);
  }

  getCurrentStep(planId: string): PlanStep | null {
    const plan = this.plans.get(planId);
    if (!plan) return null;
    return plan.steps[plan.currentStepIndex] || null;
  }

  advanceToNextStep(planId: string): PlanStep | null {
    const plan = this.plans.get(planId);
    if (!plan) return null;

    plan.currentStepIndex++;
    plan.updatedAt = Date.now();

    if (plan.currentStepIndex >= plan.steps.length) {
      this.setPlanStatus(planId, 'completed');
      return null;
    }

    this.notifyListeners(plan);
    return plan.steps[plan.currentStepIndex];
  }

  addExecutionEvent(planId: string, type: ExecutionEvent['type'], message: string, data?: Record<string, unknown>) {
    const plan = this.plans.get(planId);
    if (!plan) return;

    const event: ExecutionEvent = {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type,
      message,
      data
    };

    plan.executionHistory.push(event);
    if (plan.executionHistory.length > 500) {
      plan.executionHistory = plan.executionHistory.slice(-500);
    }
  }

  recordAIDecision(planId: string, decision: AIDecision) {
    this.addExecutionEvent(planId, 'ai_decision', decision.reasoning, {
      action: decision.action,
      newSteps: decision.newSteps,
      modifiedSteps: decision.modifiedSteps,
      removedStepIds: decision.removedStepIds
    });

    const plan = this.plans.get(planId);
    if (plan) this.notifyListeners(plan);
  }

  applyAIDecision(planId: string, decision: AIDecision) {
    const plan = this.plans.get(planId);
    if (!plan) return;

    this.recordAIDecision(planId, decision);

    if (decision.removedStepIds) {
      decision.removedStepIds.forEach(id => this.removeStep(planId, id));
    }

    if (decision.modifiedSteps) {
      decision.modifiedSteps.forEach(({ id, changes }) => this.updateStep(planId, id, changes));
    }

    if (decision.newSteps) {
      this.addSteps(planId, decision.newSteps);
    }

    switch (decision.action) {
      case 'pause':
        this.setPlanStatus(planId, 'paused');
        break;
      case 'complete':
        this.setPlanStatus(planId, 'completed');
        break;
      case 'fail':
        this.setPlanStatus(planId, 'failed');
        break;
      case 'skip_step':
        if (decision.nextStepId) {
          const step = plan.steps.find(s => s.id === decision.nextStepId);
          if (step) {
            this.setStepStatus(planId, decision.nextStepId, 'skipped');
          }
        }
        this.advanceToNextStep(planId);
        break;
    }

    this.notifyListeners(plan);
  }

  getDecisionContext(planId: string): Omit<AIDecisionContext, 'screenshot' | 'domState'> {
    const plan = this.plans.get(planId);
    if (!plan) {
      return {
        currentPlan: null,
        currentStep: null,
        previousSteps: [],
        errors: [],
        userGoal: ''
      };
    }

    const currentStep = this.getCurrentStep(planId);
    const previousSteps = plan.steps.slice(0, plan.currentStepIndex);
    const errors = plan.executionHistory
      .filter(e => e.type === 'step_fail')
      .map(e => e.message)
      .slice(-10);

    return {
      currentPlan: plan,
      currentStep,
      previousSteps,
      errors,
      userGoal: plan.goal
    };
  }

  addListener(listener: PlanChangeListener) {
    this.listeners.add(listener);
  }

  removeListener(listener: PlanChangeListener) {
    this.listeners.delete(listener);
  }

  private notifyListeners(plan: AIPlan) {
    this.listeners.forEach(listener => listener(plan));
  }

  exportPlan(planId: string): string {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error('Plan not found');
    return JSON.stringify(plan, null, 2);
  }

  importPlan(json: string): AIPlan {
    const plan = JSON.parse(json) as AIPlan;
    plan.id = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    plan.status = 'draft';
    plan.currentStepIndex = 0;
    plan.createdAt = Date.now();
    plan.updatedAt = Date.now();
    plan.startedAt = undefined;
    plan.completedAt = undefined;
    plan.executionHistory = [];
    
    plan.steps.forEach((step, i) => {
      step.id = `step_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`;
      step.status = 'pending';
      step.error = undefined;
      step.result = undefined;
      step.executedAt = undefined;
    });

    this.plans.set(plan.id, plan);
    this.notifyListeners(plan);
    return plan;
  }

  duplicatePlan(planId: string): AIPlan {
    const original = this.plans.get(planId);
    if (!original) throw new Error('Plan not found');
    return this.importPlan(JSON.stringify(original));
  }

  createPlanFromGoal(goal: string, suggestedSteps?: string[]): AIPlan {
    const plan = this.createPlan(
      goal.substring(0, 50) + (goal.length > 50 ? '...' : ''),
      goal,
      `Auto-generated plan for: ${goal}`
    );

    if (suggestedSteps) {
      suggestedSteps.forEach((desc, i) => {
        this.addStep(plan.id, {
          description: desc,
          action: 'custom',
          order: i
        });
      });
    }

    return plan;
  }
}

export const aiPlanManager = new AIPlanManager();
export default aiPlanManager;
