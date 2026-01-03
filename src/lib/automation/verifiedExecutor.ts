import { getAgentClient, AgentCommand, AgentResponse } from './agentClient';
import { screenshotService, CapturedScreenshot } from './screenshotService';
import { domStateCapture, DOMStateSnapshot, DOMElement } from './domStateCapture';

export type StepStatus = 'pending' | 'executing' | 'verifying' | 'verified' | 'failed' | 'skipped';

export interface VerificationCriteria {
  type: 'element_exists' | 'element_not_exists' | 'text_visible' | 'text_not_visible' | 'url_contains' | 'url_equals' | 'element_has_value' | 'element_clicked' | 'dom_changed' | 'custom';
  selector?: string;
  text?: string;
  value?: string;
  url?: string;
  customCheck?: (before: DOMStateSnapshot, after: DOMStateSnapshot) => boolean;
}

export interface ExecutionStep {
  id: string;
  order: number;
  action: AgentCommand['action'];
  params: Record<string, unknown>;
  description: string;
  verification: VerificationCriteria[];
  status: StepStatus;
  maxRetries: number;
  retryCount: number;
  timeoutMs: number;
  
  beforeDOMState?: DOMStateSnapshot;
  afterDOMState?: DOMStateSnapshot;
  beforeScreenshot?: string;
  afterScreenshot?: string;
  verificationScreenshot?: string;
  
  executedAt?: number;
  verifiedAt?: number;
  error?: string;
  verificationResult?: {
    passed: boolean;
    checks: { criteria: VerificationCriteria; passed: boolean; reason?: string }[];
  };
}

export interface ExecutionPlan {
  id: string;
  name: string;
  goal: string;
  steps: ExecutionStep[];
  status: 'draft' | 'running' | 'paused' | 'completed' | 'failed';
  currentStepIndex: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  totalVerified: number;
  totalFailed: number;
}

export interface StateComparison {
  domChanged: boolean;
  urlChanged: boolean;
  newElements: DOMElement[];
  removedElements: DOMElement[];
  changedElements: { before: DOMElement; after: DOMElement; changes: string[] }[];
  newErrors: string[];
  scrollChanged: boolean;
  focusChanged: boolean;
}

type ExecutorEventType = 
  | 'plan_started' 
  | 'step_started' 
  | 'action_executed' 
  | 'verification_started'
  | 'verification_passed'
  | 'verification_failed'
  | 'step_verified'
  | 'step_failed'
  | 'step_retrying'
  | 'plan_completed'
  | 'plan_failed'
  | 'state_captured'
  | 'screenshot_captured'
  | 'comparison_complete';

interface ExecutorEvent {
  type: ExecutorEventType;
  timestamp: number;
  planId: string;
  stepId?: string;
  data?: Record<string, unknown>;
}

type EventCallback = (event: ExecutorEvent) => void;

class VerifiedExecutor {
  private plans: Map<string, ExecutionPlan> = new Map();
  private activePlanId: string | null = null;
  private isRunning = false;
  private isPaused = false;
  private abortController: AbortController | null = null;
  private eventListeners: Set<EventCallback> = new Set();

  addEventListener(callback: EventCallback) {
    this.eventListeners.add(callback);
  }

  removeEventListener(callback: EventCallback) {
    this.eventListeners.delete(callback);
  }

  private emit(type: ExecutorEventType, planId: string, stepId?: string, data?: Record<string, unknown>) {
    const event: ExecutorEvent = { type, timestamp: Date.now(), planId, stepId, data };
    this.eventListeners.forEach(cb => cb(event));
  }

  createPlan(name: string, goal: string): ExecutionPlan {
    const plan: ExecutionPlan = {
      id: `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      goal,
      steps: [],
      status: 'draft',
      currentStepIndex: 0,
      createdAt: Date.now(),
      totalVerified: 0,
      totalFailed: 0
    };
    this.plans.set(plan.id, plan);
    return plan;
  }

  addStep(planId: string, step: Omit<ExecutionStep, 'id' | 'order' | 'status' | 'retryCount'>): ExecutionStep {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error('Plan not found');

    const newStep: ExecutionStep = {
      ...step,
      id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      order: plan.steps.length,
      status: 'pending',
      retryCount: 0
    };

    plan.steps.push(newStep);
    return newStep;
  }

  addSteps(planId: string, steps: Omit<ExecutionStep, 'id' | 'order' | 'status' | 'retryCount'>[]): ExecutionStep[] {
    return steps.map(s => this.addStep(planId, s));
  }

  getPlan(planId: string): ExecutionPlan | null {
    return this.plans.get(planId) || null;
  }

  getActivePlan(): ExecutionPlan | null {
    return this.activePlanId ? this.plans.get(this.activePlanId) || null : null;
  }

  async executePlan(planId: string): Promise<{ success: boolean; plan: ExecutionPlan }> {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error('Plan not found');
    if (this.isRunning) throw new Error('Executor is already running');

    const client = getAgentClient();
    if (!client.connected) throw new Error('Agent not connected');

    this.isRunning = true;
    this.isPaused = false;
    this.activePlanId = planId;
    this.abortController = new AbortController();

    plan.status = 'running';
    plan.startedAt = Date.now();
    plan.currentStepIndex = 0;
    plan.totalVerified = 0;
    plan.totalFailed = 0;

    domStateCapture.startErrorMonitoring();
    this.emit('plan_started', planId);

    try {
      while (plan.currentStepIndex < plan.steps.length) {
        if (this.abortController.signal.aborted) break;
        if (this.isPaused) {
          plan.status = 'paused';
          break;
        }

        const step = plan.steps[plan.currentStepIndex];
        const result = await this.executeStepWithVerification(plan, step);

        if (result.verified) {
          plan.totalVerified++;
          plan.currentStepIndex++;
        } else if (step.retryCount < step.maxRetries) {
          step.retryCount++;
          this.emit('step_retrying', planId, step.id, { attempt: step.retryCount + 1 });
          await this.delay(500 * step.retryCount);
        } else {
          plan.totalFailed++;
          step.status = 'failed';
          this.emit('step_failed', planId, step.id, { error: step.error });
          plan.currentStepIndex++;
        }
      }

      const allVerified = plan.totalFailed === 0 && plan.totalVerified === plan.steps.length;
      plan.status = allVerified ? 'completed' : 'failed';
      plan.completedAt = Date.now();

      this.emit(allVerified ? 'plan_completed' : 'plan_failed', planId, undefined, {
        verified: plan.totalVerified,
        failed: plan.totalFailed
      });

      return { success: allVerified, plan };
    } finally {
      this.isRunning = false;
      this.activePlanId = null;
      domStateCapture.stopErrorMonitoring();
    }
  }

  private async executeStepWithVerification(
    plan: ExecutionPlan,
    step: ExecutionStep
  ): Promise<{ verified: boolean }> {
    step.status = 'executing';
    this.emit('step_started', plan.id, step.id, { description: step.description });

    const beforeDOMState = domStateCapture.captureSnapshot();
    step.beforeDOMState = beforeDOMState;
    this.emit('state_captured', plan.id, step.id, { phase: 'before', stateId: beforeDOMState.id });

    const beforeScreenshot = await this.captureScreenshot();
    if (beforeScreenshot) {
      step.beforeScreenshot = beforeScreenshot;
      this.emit('screenshot_captured', plan.id, step.id, { phase: 'before' });
    }

    const command: AgentCommand = {
      action: step.action,
      ...step.params
    };

    const client = getAgentClient();
    let response: AgentResponse;

    try {
      response = await Promise.race([
        client.execute(command),
        this.timeout(step.timeoutMs).then(() => ({ success: false, error: 'Timeout' } as AgentResponse))
      ]);
    } catch (error) {
      step.error = error instanceof Error ? error.message : 'Execution failed';
      step.status = 'failed';
      return { verified: false };
    }

    step.executedAt = Date.now();
    this.emit('action_executed', plan.id, step.id, { success: response.success, error: response.error });

    if (!response.success) {
      step.error = response.error || 'Action failed';
      step.status = 'failed';
      return { verified: false };
    }

    await this.delay(200);

    const afterDOMState = domStateCapture.captureSnapshot();
    step.afterDOMState = afterDOMState;
    this.emit('state_captured', plan.id, step.id, { phase: 'after', stateId: afterDOMState.id });

    const afterScreenshot = await this.captureScreenshot();
    if (afterScreenshot) {
      step.afterScreenshot = afterScreenshot;
      this.emit('screenshot_captured', plan.id, step.id, { phase: 'after' });
    }

    const comparison = this.compareStates(beforeDOMState, afterDOMState);
    this.emit('comparison_complete', plan.id, step.id, { comparison });

    step.status = 'verifying';
    this.emit('verification_started', plan.id, step.id);

    const verificationResult = await this.runVerification(step, beforeDOMState, afterDOMState, comparison);
    step.verificationResult = verificationResult;
    step.verifiedAt = Date.now();

    if (verificationResult.passed) {
      step.status = 'verified';
      this.emit('verification_passed', plan.id, step.id, { checks: verificationResult.checks });
      this.emit('step_verified', plan.id, step.id);
      return { verified: true };
    } else {
      const failedChecks = verificationResult.checks.filter(c => !c.passed);
      step.error = `Verification failed: ${failedChecks.map(c => c.reason).join(', ')}`;
      this.emit('verification_failed', plan.id, step.id, { checks: verificationResult.checks });
      return { verified: false };
    }
  }

  private async runVerification(
    step: ExecutionStep,
    before: DOMStateSnapshot,
    after: DOMStateSnapshot,
    comparison: StateComparison
  ): Promise<{ passed: boolean; checks: { criteria: VerificationCriteria; passed: boolean; reason?: string }[] }> {
    const checks: { criteria: VerificationCriteria; passed: boolean; reason?: string }[] = [];

    for (const criteria of step.verification) {
      const result = this.checkCriteria(criteria, before, after, comparison);
      checks.push({ criteria, ...result });
    }

    if (checks.length === 0) {
      checks.push({
        criteria: { type: 'dom_changed' },
        passed: comparison.domChanged,
        reason: comparison.domChanged ? 'DOM changed as expected' : 'No DOM changes detected'
      });
    }

    return {
      passed: checks.every(c => c.passed),
      checks
    };
  }

  private checkCriteria(
    criteria: VerificationCriteria,
    before: DOMStateSnapshot,
    after: DOMStateSnapshot,
    comparison: StateComparison
  ): { passed: boolean; reason?: string } {
    switch (criteria.type) {
      case 'element_exists':
        if (!criteria.selector) return { passed: false, reason: 'No selector specified' };
        const exists = domStateCapture.findElementBySelector(criteria.selector);
        return {
          passed: !!exists,
          reason: exists ? `Element ${criteria.selector} found` : `Element ${criteria.selector} not found`
        };

      case 'element_not_exists':
        if (!criteria.selector) return { passed: false, reason: 'No selector specified' };
        const notExists = !domStateCapture.findElementBySelector(criteria.selector);
        return {
          passed: notExists,
          reason: notExists ? `Element ${criteria.selector} not present` : `Element ${criteria.selector} still exists`
        };

      case 'text_visible':
        if (!criteria.text) return { passed: false, reason: 'No text specified' };
        const textFound = domStateCapture.findElementByText(criteria.text);
        return {
          passed: !!textFound?.visible,
          reason: textFound?.visible ? `Text "${criteria.text}" is visible` : `Text "${criteria.text}" not visible`
        };

      case 'text_not_visible':
        if (!criteria.text) return { passed: false, reason: 'No text specified' };
        const textNotFound = !domStateCapture.findElementByText(criteria.text)?.visible;
        return {
          passed: textNotFound,
          reason: textNotFound ? `Text "${criteria.text}" not visible` : `Text "${criteria.text}" is still visible`
        };

      case 'url_contains':
        if (!criteria.url) return { passed: false, reason: 'No URL specified' };
        const urlContains = after.pageState.url.includes(criteria.url);
        return {
          passed: urlContains,
          reason: urlContains ? `URL contains "${criteria.url}"` : `URL does not contain "${criteria.url}"`
        };

      case 'url_equals':
        if (!criteria.url) return { passed: false, reason: 'No URL specified' };
        const urlEquals = after.pageState.url === criteria.url;
        return {
          passed: urlEquals,
          reason: urlEquals ? `URL matches` : `URL is ${after.pageState.url}, expected ${criteria.url}`
        };

      case 'element_has_value':
        if (!criteria.selector) return { passed: false, reason: 'No selector specified' };
        const elWithValue = after.inputs.find(i => 
          i.selector === criteria.selector || i.id === criteria.selector?.replace('#', '')
        );
        const hasValue = elWithValue?.value === criteria.value;
        return {
          passed: hasValue,
          reason: hasValue ? `Element has expected value` : `Element value is "${elWithValue?.value}", expected "${criteria.value}"`
        };

      case 'dom_changed':
        return {
          passed: comparison.domChanged,
          reason: comparison.domChanged ? 'DOM changed' : 'No DOM changes detected'
        };

      case 'custom':
        if (!criteria.customCheck) return { passed: false, reason: 'No custom check function' };
        try {
          const passed = criteria.customCheck(before, after);
          return { passed, reason: passed ? 'Custom check passed' : 'Custom check failed' };
        } catch (e) {
          return { passed: false, reason: `Custom check error: ${e}` };
        }

      default:
        return { passed: false, reason: `Unknown criteria type: ${criteria.type}` };
    }
  }

  compareStates(before: DOMStateSnapshot, after: DOMStateSnapshot): StateComparison {
    const beforeIds = new Set(before.interactiveElements.map(e => e.selector));
    const afterIds = new Set(after.interactiveElements.map(e => e.selector));

    const newElements = after.interactiveElements.filter(e => !beforeIds.has(e.selector));
    const removedElements = before.interactiveElements.filter(e => !afterIds.has(e.selector));

    const changedElements: StateComparison['changedElements'] = [];
    for (const afterEl of after.interactiveElements) {
      const beforeEl = before.interactiveElements.find(e => e.selector === afterEl.selector);
      if (beforeEl) {
        const changes: string[] = [];
        if (beforeEl.textContent !== afterEl.textContent) changes.push('textContent');
        if (beforeEl.value !== afterEl.value) changes.push('value');
        if (beforeEl.visible !== afterEl.visible) changes.push('visibility');
        if (beforeEl.disabled !== afterEl.disabled) changes.push('disabled');
        if (JSON.stringify(beforeEl.bounds) !== JSON.stringify(afterEl.bounds)) changes.push('bounds');
        
        if (changes.length > 0) {
          changedElements.push({ before: beforeEl, after: afterEl, changes });
        }
      }
    }

    const beforeErrorSet = new Set(before.pageState.consoleErrors);
    const newErrors = after.pageState.consoleErrors.filter(e => !beforeErrorSet.has(e));

    return {
      domChanged: newElements.length > 0 || removedElements.length > 0 || changedElements.length > 0,
      urlChanged: before.pageState.url !== after.pageState.url,
      newElements,
      removedElements,
      changedElements,
      newErrors,
      scrollChanged: before.pageState.scrollPosition.x !== after.pageState.scrollPosition.x ||
                     before.pageState.scrollPosition.y !== after.pageState.scrollPosition.y,
      focusChanged: before.focusedElement?.selector !== after.focusedElement?.selector
    };
  }

  private async captureScreenshot(): Promise<string | null> {
    try {
      const screenshot = await screenshotService.captureFullPage();
      return screenshot;
    } catch {
      return null;
    }
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    if (this.isPaused && this.activePlanId) {
      this.isPaused = false;
      const plan = this.plans.get(this.activePlanId);
      if (plan) {
        plan.status = 'running';
        this.executePlan(this.activePlanId);
      }
    }
  }

  abort() {
    this.abortController?.abort();
    this.isRunning = false;
    this.isPaused = false;
    if (this.activePlanId) {
      const plan = this.plans.get(this.activePlanId);
      if (plan) plan.status = 'failed';
    }
  }

  get running(): boolean {
    return this.isRunning;
  }

  get paused(): boolean {
    return this.isPaused;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private timeout(ms: number): Promise<void> {
    return new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms));
  }
}

export const verifiedExecutor = new VerifiedExecutor();
export default verifiedExecutor;
