import { screenshotService } from './screenshotService';
import { domStateCapture, DOMStateSnapshot } from './domStateCapture';
import { aiPlanManager, AIPlan, PlanStep, AIDecision, AIDecisionContext } from './aiPlanManager';
import { getAgentClient, AgentResponse } from './agentClient';

export interface VisualAgentConfig {
  screenshotOnEveryStep: boolean;
  captureStateOnEveryStep: boolean;
  pauseOnError: boolean;
  stepDelayMs: number;
  maxStepsPerRun: number;
  maxRetries: number;
  verificationTimeoutMs: number;
  verificationCheckIntervalMs: number;
  requireVerificationToAdvance: boolean;
  aiEndpoint?: string;
  aiApiKey?: string;
}

export interface AgentState {
  isRunning: boolean;
  isPaused: boolean;
  currentPlanId: string | null;
  currentStepIndex: number;
  lastScreenshot: string | null;
  lastDOMState: DOMStateSnapshot | null;
  lastError: string | null;
  stepsExecuted: number;
  currentPhase: 'idle' | 'capturing_before' | 'deciding' | 'executing' | 'capturing_after' | 'verifying';
}

export interface StepExecutionResult {
  success: boolean;
  verified: boolean;
  screenshot?: string;
  domState?: DOMStateSnapshot;
  error?: string;
  result?: string;
  verificationDetails?: VerificationResult;
}

export interface VerificationResult {
  passed: boolean;
  domChanged: boolean;
  screenshotChanged: boolean;
  expectedChanges: string[];
  actualChanges: string[];
  missingChanges: string[];
  unexpectedChanges: string[];
  confidence: number;
}

export interface StateComparison {
  urlChanged: boolean;
  titleChanged: boolean;
  elementsAdded: number;
  elementsRemoved: number;
  inputValuesChanged: string[];
  newErrors: string[];
  dialogsOpened: number;
  dialogsClosed: number;
  focusChanged: boolean;
  scrollChanged: boolean;
  significantChange: boolean;
  summary: string;
}

type AgentEventCallback = (event: AgentEvent) => void;

export interface AgentEvent {
  type: 'state_change' | 'phase_change' | 'step_start' | 'step_complete' | 'step_fail' | 'step_verified' | 'screenshot' | 'dom_state' | 'ai_decision' | 'error' | 'plan_complete' | 'comparison' | 'retry';
  data: Record<string, unknown>;
  timestamp: number;
}

class VisualAgent {
    private config: VisualAgentConfig = {
      screenshotOnEveryStep: false,
      captureStateOnEveryStep: false,
      pauseOnError: true,
      stepDelayMs: 50,
      maxStepsPerRun: 100,
      maxRetries: 1,
      verificationTimeoutMs: 500,
      verificationCheckIntervalMs: 100,
      requireVerificationToAdvance: false,
      aiEndpoint: undefined,
      aiApiKey: undefined
    };

    private screenshotCache: Map<string, { screenshot: string; timestamp: number }> = new Map();
    private domStateCache: { state: DOMStateSnapshot | null; timestamp: number } = { state: null, timestamp: 0 };
    private cacheMaxAge = 500;

  private state: AgentState = {
    isRunning: false,
    isPaused: false,
    currentPlanId: null,
    currentStepIndex: 0,
    lastScreenshot: null,
    lastDOMState: null,
    lastError: null,
    stepsExecuted: 0,
    currentPhase: 'idle'
  };

  private eventListeners: Set<AgentEventCallback> = new Set();
  private abortController: AbortController | null = null;

  configure(config: Partial<VisualAgentConfig>) {
    this.config = { ...this.config, ...config };
  }

  getConfig(): VisualAgentConfig {
    return { ...this.config };
  }

  getState(): AgentState {
    return { ...this.state };
  }

  addEventListener(callback: AgentEventCallback) {
    this.eventListeners.add(callback);
  }

  removeEventListener(callback: AgentEventCallback) {
    this.eventListeners.delete(callback);
  }

  private emit(event: Omit<AgentEvent, 'timestamp'>) {
    const fullEvent: AgentEvent = { ...event, timestamp: Date.now() };
    this.eventListeners.forEach(cb => cb(fullEvent));
  }

  private setPhase(phase: AgentState['currentPhase']) {
    this.state.currentPhase = phase;
    this.emit({ type: 'phase_change', data: { phase } });
  }

    async captureCurrentState(): Promise<{ screenshot: string | null; domState: DOMStateSnapshot }> {
      const now = Date.now();
      
      const [screenshot, domState] = await Promise.all([
        (async () => {
          const cached = this.screenshotCache.get('latest');
          if (cached && (now - cached.timestamp) < this.cacheMaxAge) {
            return cached.screenshot;
          }
          const fresh = await screenshotService.captureFullPage().catch(() => null);
          if (fresh) {
            this.screenshotCache.set('latest', { screenshot: fresh, timestamp: now });
          }
          return fresh;
        })(),
        (async () => {
          if (this.domStateCache.state && (now - this.domStateCache.timestamp) < this.cacheMaxAge) {
            return this.domStateCache.state;
          }
          const fresh = domStateCapture.captureSnapshot();
          this.domStateCache = { state: fresh, timestamp: now };
          return fresh;
        })()
      ]);

      this.state.lastScreenshot = screenshot;
      this.state.lastDOMState = domState;

      this.emit({ type: 'screenshot', data: { screenshot } });
      this.emit({ type: 'dom_state', data: { domState } });

      return { screenshot, domState };
    }

  async takeScreenshot(): Promise<string | null> {
    const screenshot = await screenshotService.captureFullPage().catch(() => null);
    this.state.lastScreenshot = screenshot;
    this.emit({ type: 'screenshot', data: { screenshot } });
    return screenshot;
  }

  captureDOMState(): DOMStateSnapshot {
    const domState = domStateCapture.captureSnapshot();
    this.state.lastDOMState = domState;
    this.emit({ type: 'dom_state', data: { domState } });
    return domState;
  }

  compareDOMStates(before: DOMStateSnapshot, after: DOMStateSnapshot): StateComparison {
    const urlChanged = before.pageState.url !== after.pageState.url;
    const titleChanged = before.pageState.title !== after.pageState.title;
    
    const beforeButtonIds = new Set(before.buttons.map(b => b.selector));
    const afterButtonIds = new Set(after.buttons.map(b => b.selector));
    const beforeInputIds = new Set(before.inputs.map(i => i.selector));
    const afterInputIds = new Set(after.inputs.map(i => i.selector));
    const beforeLinkIds = new Set(before.links.map(l => l.selector));
    const afterLinkIds = new Set(after.links.map(l => l.selector));

    let elementsAdded = 0;
    let elementsRemoved = 0;

    afterButtonIds.forEach(id => { if (!beforeButtonIds.has(id)) elementsAdded++; });
    beforeButtonIds.forEach(id => { if (!afterButtonIds.has(id)) elementsRemoved++; });
    afterInputIds.forEach(id => { if (!beforeInputIds.has(id)) elementsAdded++; });
    beforeInputIds.forEach(id => { if (!afterInputIds.has(id)) elementsRemoved++; });
    afterLinkIds.forEach(id => { if (!beforeLinkIds.has(id)) elementsAdded++; });
    beforeLinkIds.forEach(id => { if (!afterLinkIds.has(id)) elementsRemoved++; });

    const inputValuesChanged: string[] = [];
    before.inputs.forEach(beforeInput => {
      const afterInput = after.inputs.find(i => i.selector === beforeInput.selector);
      if (afterInput && beforeInput.value !== afterInput.value) {
        inputValuesChanged.push(`${beforeInput.selector}: "${beforeInput.value}" -> "${afterInput.value}"`);
      }
    });

    const beforeErrorSet = new Set(before.pageState.consoleErrors);
    const newErrors = after.pageState.consoleErrors.filter(e => !beforeErrorSet.has(e));

    const dialogsOpened = after.dialogs.length - before.dialogs.length;
    const dialogsClosed = dialogsOpened < 0 ? Math.abs(dialogsOpened) : 0;

    const focusChanged = before.focusedElement?.selector !== after.focusedElement?.selector;

    const scrollChanged = 
      before.pageState.scrollPosition.x !== after.pageState.scrollPosition.x ||
      before.pageState.scrollPosition.y !== after.pageState.scrollPosition.y;

    const significantChange = 
      urlChanged || 
      titleChanged || 
      elementsAdded > 0 || 
      elementsRemoved > 0 || 
      inputValuesChanged.length > 0 || 
      dialogsOpened !== 0 ||
      newErrors.length > 0;

    const summaryParts: string[] = [];
    if (urlChanged) summaryParts.push(`URL changed to ${after.pageState.url}`);
    if (titleChanged) summaryParts.push(`Title changed to "${after.pageState.title}"`);
    if (elementsAdded > 0) summaryParts.push(`${elementsAdded} elements added`);
    if (elementsRemoved > 0) summaryParts.push(`${elementsRemoved} elements removed`);
    if (inputValuesChanged.length > 0) summaryParts.push(`${inputValuesChanged.length} input(s) changed`);
    if (dialogsOpened > 0) summaryParts.push(`${dialogsOpened} dialog(s) opened`);
    if (dialogsClosed > 0) summaryParts.push(`${dialogsClosed} dialog(s) closed`);
    if (newErrors.length > 0) summaryParts.push(`${newErrors.length} new error(s)`);
    if (focusChanged) summaryParts.push('Focus changed');
    if (scrollChanged) summaryParts.push('Page scrolled');

    const comparison: StateComparison = {
      urlChanged,
      titleChanged,
      elementsAdded,
      elementsRemoved,
      inputValuesChanged,
      newErrors,
      dialogsOpened: dialogsOpened > 0 ? dialogsOpened : 0,
      dialogsClosed,
      focusChanged,
      scrollChanged,
      significantChange,
      summary: summaryParts.length > 0 ? summaryParts.join('; ') : 'No significant changes detected'
    };

    this.emit({ type: 'comparison', data: { comparison } });
    return comparison;
  }

  compareScreenshots(before: string | null, after: string | null): { changed: boolean; similarity: number } {
    if (!before || !after) return { changed: true, similarity: 0 };
    if (before === after) return { changed: false, similarity: 1 };
    return { changed: true, similarity: 0.5 };
  }

  async verifyStepExecution(
    step: PlanStep,
    domBefore: DOMStateSnapshot,
    domAfter: DOMStateSnapshot,
    screenshotBefore: string | null,
    screenshotAfter: string | null
  ): Promise<VerificationResult> {
    const domComparison = this.compareDOMStates(domBefore, domAfter);
    const screenshotComparison = this.compareScreenshots(screenshotBefore, screenshotAfter);
    
    const expectedChanges: string[] = [];
    const actualChanges: string[] = [];
    const missingChanges: string[] = [];
    const unexpectedChanges: string[] = [];

    switch (step.action) {
      case 'click':
        expectedChanges.push('Element interaction', 'Possible state change');
        if (domComparison.significantChange) {
          actualChanges.push(domComparison.summary);
        }
        if (domComparison.newErrors.length > 0) {
          unexpectedChanges.push(...domComparison.newErrors);
        }
        break;

      case 'type':
        expectedChanges.push(`Input value should be "${step.value}"`);
        const targetInput = domAfter.inputs.find(i => 
          i.selector === step.target || i.id === step.target?.replace('#', '')
        );
        if (targetInput?.value === step.value) {
          actualChanges.push(`Input value set to "${step.value}"`);
        } else {
          missingChanges.push(`Expected input value "${step.value}" but got "${targetInput?.value || 'not found'}"`);
        }
        break;

      case 'navigate':
        expectedChanges.push(`URL should change to ${step.value}`);
        if (domComparison.urlChanged) {
          actualChanges.push(`URL changed to ${domAfter.pageState.url}`);
          if (!domAfter.pageState.url.includes(step.value || '')) {
            unexpectedChanges.push(`Expected URL to contain "${step.value}" but got "${domAfter.pageState.url}"`);
          }
        } else {
          missingChanges.push('URL did not change');
        }
        break;

      case 'scroll':
        expectedChanges.push('Page should scroll');
        if (domComparison.scrollChanged) {
          actualChanges.push('Page scrolled');
        } else {
          missingChanges.push('Page did not scroll');
        }
        break;

      case 'verify':
        expectedChanges.push(`Element "${step.target}" should exist`);
        if (step.value) {
          expectedChanges.push(`Element should contain "${step.value}"`);
        }
        const element = domAfter.interactiveElements.find(el => 
          el.selector === step.target || el.textContent?.includes(step.value || '')
        ) || domAfter.buttons.find(b => b.textContent?.includes(step.value || ''))
          || domAfter.links.find(l => l.textContent?.includes(step.value || ''));
        
        if (element) {
          actualChanges.push(`Found element matching "${step.target || step.value}"`);
        } else {
          missingChanges.push(`Element "${step.target || step.value}" not found`);
        }
        break;

      case 'wait':
        actualChanges.push('Wait completed');
        break;

      default:
        if (domComparison.significantChange) {
          actualChanges.push(domComparison.summary);
        }
    }

    const passed = missingChanges.length === 0 && unexpectedChanges.length === 0;
    const confidence = passed ? 
      (actualChanges.length / Math.max(expectedChanges.length, 1)) : 
      (actualChanges.length / (actualChanges.length + missingChanges.length + unexpectedChanges.length));

    return {
      passed,
      domChanged: domComparison.significantChange,
      screenshotChanged: screenshotComparison.changed,
      expectedChanges,
      actualChanges,
      missingChanges,
      unexpectedChanges,
      confidence: Math.min(1, Math.max(0, confidence))
    };
  }

  async startPlan(planId: string): Promise<void> {
    const plan = aiPlanManager.getPlan(planId);
    if (!plan) throw new Error('Plan not found');

    this.state.isRunning = true;
    this.state.isPaused = false;
    this.state.currentPlanId = planId;
    this.state.currentStepIndex = plan.currentStepIndex;
    this.state.stepsExecuted = 0;
    this.state.lastError = null;
    this.abortController = new AbortController();

    aiPlanManager.setPlanStatus(planId, 'running');
    this.emit({ type: 'state_change', data: { state: this.state } });

    domStateCapture.startErrorMonitoring();

    try {
      await this.runControlLoop(plan);
    } catch (error) {
      this.state.lastError = error instanceof Error ? error.message : String(error);
      this.emit({ type: 'error', data: { error: this.state.lastError } });
    } finally {
      this.state.isRunning = false;
      this.setPhase('idle');
      this.abortController = null;
      this.emit({ type: 'state_change', data: { state: this.state } });
    }
  }

  private async runControlLoop(plan: AIPlan): Promise<void> {
    while (
      this.state.isRunning &&
      !this.state.isPaused &&
      this.state.stepsExecuted < this.config.maxStepsPerRun
    ) {
      if (this.abortController?.signal.aborted) break;

      const currentStep = aiPlanManager.getCurrentStep(plan.id);
      if (!currentStep) {
        aiPlanManager.setPlanStatus(plan.id, 'completed');
        this.emit({ type: 'plan_complete', data: { planId: plan.id } });
        break;
      }

      this.state.currentStepIndex = plan.currentStepIndex;
      this.emit({ type: 'step_start', data: { step: currentStep } });

      const result = await this.executeStepWithVerification(plan.id, currentStep);

      if (result.verified) {
        aiPlanManager.setStepStatus(plan.id, currentStep.id, 'completed', result.result);
        this.emit({ type: 'step_verified', data: { step: currentStep, result, verification: result.verificationDetails } });
        aiPlanManager.advanceToNextStep(plan.id);
      } else if (result.success && !result.verified) {
        aiPlanManager.setStepStatus(plan.id, currentStep.id, 'completed', `${result.result} (unverified)`);
        this.emit({ type: 'step_complete', data: { step: currentStep, result, warning: 'Step completed but verification uncertain' } });
        aiPlanManager.advanceToNextStep(plan.id);
      } else {
        aiPlanManager.setStepStatus(plan.id, currentStep.id, 'failed', undefined, result.error);
        this.emit({ type: 'step_fail', data: { step: currentStep, error: result.error, verification: result.verificationDetails } });

        if (this.config.pauseOnError) {
          this.state.isPaused = true;
          aiPlanManager.setPlanStatus(plan.id, 'paused');
          break;
        }
      }

      this.state.stepsExecuted++;
      await this.delay(this.config.stepDelayMs);
    }
  }

    private async executeStepWithVerification(planId: string, step: PlanStep): Promise<StepExecutionResult> {
      let retries = 0;
      const agentClient = getAgentClient();
      const useLocalAgent = agentClient.connected;

      while (retries <= this.config.maxRetries) {
        if (retries > 0) {
          this.emit({ type: 'retry', data: { step, attempt: retries + 1, maxRetries: this.config.maxRetries + 1 } });
          await this.delay(200);
        }

        this.setPhase('capturing_before');
        
        const capturePromises: Promise<any>[] = [];
        let screenshotBefore: string | null = null;
        let screenshotBeforeHash: string | null = null;
        let domBefore: DOMStateSnapshot;

        const now = Date.now();
        if (this.domStateCache.state && (now - this.domStateCache.timestamp) < this.cacheMaxAge) {
          domBefore = this.domStateCache.state;
        } else {
          domBefore = domStateCapture.captureSnapshot();
          this.domStateCache = { state: domBefore, timestamp: now };
        }

        if (useLocalAgent) {
          const agentScreenshotPromise = agentClient.execute({ action: 'screenshot' }).then(res => {
            if (res.success && (res as any).image) {
              screenshotBefore = `data:image/jpeg;base64,${(res as any).image}`;
              screenshotBeforeHash = (res as any).hash || null;
            }
          }).catch(() => {});
          capturePromises.push(agentScreenshotPromise);
        }

        if (capturePromises.length > 0) {
          await Promise.race([
            Promise.all(capturePromises),
            this.delay(300)
          ]);
        }

        if (!screenshotBefore) {
          const cached = this.screenshotCache.get('latest');
          if (cached && (now - cached.timestamp) < 1000) {
            screenshotBefore = cached.screenshot;
          }
        }

        this.state.lastScreenshot = screenshotBefore;
        this.state.lastDOMState = domBefore;
        
        if (screenshotBefore || domBefore) {
          this.emit({ type: 'screenshot', data: { screenshot: screenshotBefore, phase: 'before', hash: screenshotBeforeHash } });
          this.emit({ type: 'dom_state', data: { domState: domBefore, phase: 'before' } });
        }

        aiPlanManager.updateStep(planId, step.id, { 
          screenshotBefore: screenshotBefore || undefined, 
          domStateBefore: domBefore 
        });

        this.setPhase('executing');
        aiPlanManager.setStepStatus(planId, step.id, 'in_progress');
        
        let execResult: { 
          success: boolean; 
          result?: string; 
          error?: string; 
          agentResponse?: AgentResponse;
          beforeScreenshot?: any;
          afterScreenshot?: any;
          stateChanged?: boolean;
        };

        if (useLocalAgent) {
          execResult = await this.executeActionViaLocalAgent(step, agentClient);
          
          if (execResult.afterScreenshot?.image) {
            this.state.lastScreenshot = `data:image/jpeg;base64,${execResult.afterScreenshot.image}`;
            this.screenshotCache.set('latest', { 
              screenshot: this.state.lastScreenshot, 
              timestamp: Date.now() 
            });
          }
        } else {
          const browserResult = await this.executeAction(step);
          execResult = { ...browserResult, stateChanged: false };
        }

        if (!execResult.success) {
          this.emit({ type: 'step_fail', data: { step, error: execResult.error, phase: 'execution' } });
          retries++;
          if (retries <= this.config.maxRetries) {
            continue;
          }
          return {
            success: false,
            verified: false,
            error: execResult.error
          };
        }

        await this.delay(50);

        this.setPhase('capturing_after');
        let screenshotAfter: string | null = null;
        let screenshotAfterHash: string | null = null;

        if (execResult.afterScreenshot?.image) {
          screenshotAfter = `data:image/jpeg;base64,${execResult.afterScreenshot.image}`;
          screenshotAfterHash = execResult.afterScreenshot.hash || null;
        } else if (useLocalAgent) {
          const afterPromise = agentClient.execute({ action: 'screenshot' }).then(res => {
            if (res.success && (res as any).image) {
              screenshotAfter = `data:image/jpeg;base64,${(res as any).image}`;
              screenshotAfterHash = (res as any).hash || null;
            }
          }).catch(() => {});
          
          await Promise.race([afterPromise, this.delay(200)]);
        }

        const domAfter = domStateCapture.captureSnapshot();
        this.domStateCache = { state: domAfter, timestamp: Date.now() };

        this.state.lastScreenshot = screenshotAfter;
        this.state.lastDOMState = domAfter;
        this.emit({ type: 'screenshot', data: { screenshot: screenshotAfter, phase: 'after', hash: screenshotAfterHash } });
        this.emit({ type: 'dom_state', data: { domState: domAfter, phase: 'after' } });

        aiPlanManager.updateStep(planId, step.id, { 
          screenshotAfter: screenshotAfter || undefined, 
          domStateAfter: domAfter 
        });

        const stateChangedByAgent = execResult.stateChanged || 
          (screenshotBeforeHash && screenshotAfterHash && screenshotBeforeHash !== screenshotAfterHash);

        this.setPhase('verifying');
        const verificationResult = await this.runVerificationLoopWithBlocking(
          step,
          domBefore,
          domAfter,
          screenshotBefore,
          screenshotAfter,
          agentClient,
          useLocalAgent,
          stateChangedByAgent
        );

        this.emit({ type: 'step_verified', data: { 
          step, 
          verification: verificationResult.verification,
          passed: verificationResult.passed,
          confidence: verificationResult.verification?.confidence || 0,
          stateChanged: stateChangedByAgent
        }});

        if (verificationResult.passed) {
          return {
            success: true,
            verified: true,
            screenshot: verificationResult.finalScreenshot || screenshotAfter || undefined,
            domState: verificationResult.finalDomState || domAfter,
            result: execResult.result,
            verificationDetails: verificationResult.verification
          };
        }

        if (this.config.requireVerificationToAdvance) {
          retries++;
          if (retries <= this.config.maxRetries) {
            this.emit({ type: 'error', data: { 
              message: `Verification failed. Retrying (${retries}/${this.config.maxRetries + 1})`,
              verification: verificationResult.verification,
              step
            }});
            continue;
          }

          return {
            success: false,
            verified: false,
            error: `Verification failed after ${retries} attempts`,
            verificationDetails: verificationResult.verification
          };
        }

        if (verificationResult.verification && verificationResult.verification.confidence >= 0.3) {
          return {
            success: true,
            verified: false,
            screenshot: screenshotAfter || undefined,
            domState: domAfter,
            result: `${execResult.result} (confidence: ${Math.round(verificationResult.verification.confidence * 100)}%)`,
            verificationDetails: verificationResult.verification
          };
        }

        retries++;
        if (retries <= this.config.maxRetries) {
          continue;
        }

        return {
          success: true,
          verified: false,
          result: execResult.result,
          verificationDetails: verificationResult.verification
        };
      }

      return {
        success: false,
        verified: false,
        error: 'Max retries exceeded'
      };
    }

  private async executeActionViaLocalAgent(
    step: PlanStep,
    agentClient: ReturnType<typeof getAgentClient>
  ): Promise<{ 
    success: boolean; 
    result?: string; 
    error?: string; 
    agentResponse?: AgentResponse;
    beforeScreenshot?: any;
    afterScreenshot?: any;
    stateChanged?: boolean;
  }> {
    try {
      let response: any;

      switch (step.action) {
        case 'click':
          if (step.target) {
            const element = this.findElementForAction(step.target);
            if (element) {
              const rect = element.getBoundingClientRect();
              const x = Math.round(rect.left + rect.width / 2 + window.screenX);
              const y = Math.round(rect.top + rect.height / 2 + window.screenY);
              response = await agentClient.execute({ action: 'click', x, y });
            } else {
              return { success: false, error: `Element not found: ${step.target}` };
            }
          } else {
            return { success: false, error: 'No target specified for click action' };
          }
          break;

        case 'type':
          if (step.value) {
            response = await agentClient.execute({ action: 'type', text: step.value });
          } else {
            return { success: false, error: 'No value specified for type action' };
          }
          break;

        case 'navigate':
          if (step.value) {
            response = await agentClient.execute({ action: 'openUrl', url: step.value });
          } else {
            return { success: false, error: 'No URL specified for navigate action' };
          }
          break;

        case 'wait':
          const ms = parseInt(step.value || '1000', 10);
          response = await agentClient.execute({ action: 'wait', ms });
          break;

        case 'scroll':
          if (step.value) {
            const [, y] = step.value.split(',').map(v => parseInt(v.trim(), 10));
            const delta = y > 0 ? -3 : 3;
            response = await agentClient.execute({ action: 'scroll', delta });
          } else if (step.target) {
            const element = this.findElementForAction(step.target);
            if (element) {
              const rect = element.getBoundingClientRect();
              response = await agentClient.execute({ 
                action: 'scroll', 
                delta: -3,
                x: Math.round(rect.left + rect.width / 2 + window.screenX),
                y: Math.round(rect.top + rect.height / 2 + window.screenY)
              });
            } else {
              return { success: false, error: `Element not found: ${step.target}` };
            }
          } else {
            return { success: false, error: 'No scroll target or position specified' };
          }
          break;

        case 'screenshot':
          response = await agentClient.execute({ action: 'screenshot' });
          break;

        case 'verify':
          response = await agentClient.execute({ action: 'verifyState' });
          break;

        case 'custom':
          if (step.value && (step.value.includes('$') || step.value.includes('|'))) {
            response = await agentClient.execute({ action: 'powershell', script: step.value });
          } else if (step.value) {
            response = await agentClient.execute({ action: 'run', command: step.value });
          } else {
            return { success: true, result: `Custom step acknowledged: ${step.description}` };
          }
          break;

        default:
          return { success: false, error: `Unknown action: ${step.action}` };
      }

      if (response.success) {
        return { 
          success: true, 
          result: `${step.action}: ${step.target || step.value || 'completed'}`,
          agentResponse: response,
          beforeScreenshot: response.beforeScreenshot,
          afterScreenshot: response.afterScreenshot,
          stateChanged: response.stateChanged
        };
      } else {
        return { 
          success: false, 
          error: response.error || 'Agent action failed',
          agentResponse: response
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async runVerificationLoopWithBlocking(
    step: PlanStep,
    domBefore: DOMStateSnapshot,
    domAfter: DOMStateSnapshot,
    screenshotBefore: string | null,
    screenshotAfter: string | null,
    agentClient: ReturnType<typeof getAgentClient>,
    useLocalAgent: boolean,
    stateChangedByAgent: boolean | undefined
  ): Promise<{
    passed: boolean;
    verification: VerificationResult | null;
    finalScreenshot: string | null;
    finalDomState: DOMStateSnapshot | null;
  }> {
    const verification = await this.verifyStepExecution(
      step,
      domBefore,
      domAfter,
      screenshotBefore,
      screenshotAfter
    );

    if (stateChangedByAgent && verification.confidence < 0.8) {
      verification.confidence = Math.min(1, verification.confidence + 0.3);
      verification.actualChanges.push('Agent detected state change');
    }

    const passed = verification.passed || verification.confidence >= 0.5;

    return {
      passed,
      verification,
      finalScreenshot: screenshotAfter,
      finalDomState: domAfter
    };
  }

  private findElementForAction(target: string): HTMLElement | null {
    // Try direct selector first
    let element = document.querySelector(target) as HTMLElement;
    if (element) return element;

    // Try finding by text content
    const found = domStateCapture.findElementByText(target);
    if (found) {
      element = document.querySelector(found.selector) as HTMLElement;
      if (element) return element;
    }

    // Try finding by ID
    element = document.getElementById(target.replace('#', '')) as HTMLElement;
    if (element) return element;

    return null;
  }

  private async executeAction(step: PlanStep): Promise<{ success: boolean; result?: string; error?: string }> {
    try {
      switch (step.action) {
        case 'click':
          return await this.executeClick(step);
        case 'type':
          return await this.executeType(step);
        case 'navigate':
          return await this.executeNavigate(step);
        case 'wait':
          return await this.executeWait(step);
        case 'scroll':
          return await this.executeScroll(step);
        case 'screenshot':
          return { success: true, result: 'Screenshot captured' };
        case 'verify':
          return await this.executeVerifyAction(step);
        case 'custom':
          return { success: true, result: `Custom step: ${step.description}` };
        default:
          return { success: false, error: `Unknown action: ${step.action}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async executeClick(step: PlanStep): Promise<{ success: boolean; result?: string; error?: string }> {
    if (!step.target) {
      return { success: false, error: 'No target specified for click action' };
    }

    let element = document.querySelector(step.target) as HTMLElement;
    
    if (!element) {
      const found = domStateCapture.findElementByText(step.target);
      if (found) {
        element = document.querySelector(found.selector) as HTMLElement;
      }
    }

    if (!element) {
      return { success: false, error: `Element not found: ${step.target}` };
    }

    element.scrollIntoView({ behavior: 'instant', block: 'center' });
    await this.delay(100);
    
    element.focus();
    element.click();
    
    return { success: true, result: `Clicked: ${step.target}` };
  }

  private async executeType(step: PlanStep): Promise<{ success: boolean; result?: string; error?: string }> {
    if (!step.target) {
      return { success: false, error: 'No target specified for type action' };
    }

    const element = document.querySelector(step.target) as HTMLInputElement | HTMLTextAreaElement;
    if (!element) {
      return { success: false, error: `Element not found: ${step.target}` };
    }

    element.focus();
    element.value = '';
    
    const value = step.value || '';
    for (const char of value) {
      element.value += char;
      element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
      await this.delay(10);
    }
    
    element.dispatchEvent(new Event('change', { bubbles: true }));

    return { success: true, result: `Typed: ${step.value}` };
  }

  private async executeNavigate(step: PlanStep): Promise<{ success: boolean; result?: string; error?: string }> {
    if (!step.value) {
      return { success: false, error: 'No URL specified for navigate action' };
    }

    window.location.href = step.value;
    return { success: true, result: `Navigating to: ${step.value}` };
  }

  private async executeWait(step: PlanStep): Promise<{ success: boolean; result?: string; error?: string }> {
    const ms = parseInt(step.value || '1000', 10);
    await this.delay(ms);
    return { success: true, result: `Waited ${ms}ms` };
  }

  private async executeScroll(step: PlanStep): Promise<{ success: boolean; result?: string; error?: string }> {
    if (step.target) {
      const element = document.querySelector(step.target);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return { success: true, result: `Scrolled to: ${step.target}` };
      }
      return { success: false, error: `Element not found: ${step.target}` };
    }
    
    if (step.value) {
      const [x, y] = step.value.split(',').map(v => parseInt(v.trim(), 10));
      window.scrollTo({ left: x || 0, top: y || 0, behavior: 'smooth' });
      return { success: true, result: `Scrolled to: ${x}, ${y}` };
    }

    return { success: false, error: 'No scroll target or position specified' };
  }

  private async executeVerifyAction(step: PlanStep): Promise<{ success: boolean; result?: string; error?: string }> {
    const domState = this.captureDOMState();
    
    if (step.target) {
      const element = domStateCapture.findElementBySelector(step.target);
      if (!element) {
        return { success: false, error: `Element not found: ${step.target}` };
      }
      if (step.value && !element.textContent?.includes(step.value)) {
        return { success: false, error: `Element does not contain expected text: ${step.value}` };
      }
      return { success: true, result: `Verified element: ${step.target}` };
    }

    if (step.value) {
      const found = domStateCapture.findElementByText(step.value);
      if (!found) {
        return { success: false, error: `Text not found: ${step.value}` };
      }
      return { success: true, result: `Found text: ${step.value}` };
    }

    return { success: true, result: `Page state verified: ${domState.summary}` };
  }

  private async getAIDecisionForStep(
    step: PlanStep,
    domState: DOMStateSnapshot,
    screenshot: string | null
  ): Promise<AIDecision | null> {
    if (!this.config.aiEndpoint || !this.config.aiApiKey) {
      return null;
    }

    if (!this.state.currentPlanId) return null;

    const baseContext = aiPlanManager.getDecisionContext(this.state.currentPlanId);
    const context: AIDecisionContext = {
      ...baseContext,
      screenshot,
      domState
    };

    return this.getAIDecision(context);
  }

  async getAIDecision(context: AIDecisionContext): Promise<AIDecision | null> {
    if (!this.config.aiEndpoint || !this.config.aiApiKey) {
      return null;
    }

    try {
      const response = await fetch(this.config.aiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.aiApiKey}`
        },
        body: JSON.stringify({
          screenshot: context.screenshot,
          domState: context.domState,
          currentPlan: context.currentPlan,
          currentStep: context.currentStep,
          previousSteps: context.previousSteps,
          errors: context.errors,
          userGoal: context.userGoal
        })
      });

      if (!response.ok) {
        throw new Error(`AI API error: ${response.status}`);
      }

      const decision = await response.json() as AIDecision;
      this.emit({ type: 'ai_decision', data: { decision } });
      return decision;
    } catch (error) {
      console.error('Failed to get AI decision:', error);
      return null;
    }
  }

  pause() {
    if (this.state.isRunning) {
      this.state.isPaused = true;
      if (this.state.currentPlanId) {
        aiPlanManager.setPlanStatus(this.state.currentPlanId, 'paused');
      }
      this.emit({ type: 'state_change', data: { state: this.state } });
    }
  }

  async resume() {
    if (this.state.isPaused && this.state.currentPlanId) {
      this.state.isPaused = false;
      const plan = aiPlanManager.getPlan(this.state.currentPlanId);
      if (plan) {
        aiPlanManager.setPlanStatus(this.state.currentPlanId, 'running');
        this.emit({ type: 'state_change', data: { state: this.state } });
        await this.runControlLoop(plan);
      }
    }
  }

  stop() {
    this.state.isRunning = false;
    this.state.isPaused = false;
    this.setPhase('idle');
    this.abortController?.abort();
    if (this.state.currentPlanId) {
      aiPlanManager.setPlanStatus(this.state.currentPlanId, 'paused');
    }
    this.emit({ type: 'state_change', data: { state: this.state } });
  }

  async executeOnDemandCapture(): Promise<{ screenshot: string | null; domState: DOMStateSnapshot; comparison?: StateComparison }> {
    const previousDomState = this.state.lastDOMState;
    const { screenshot, domState } = await this.captureCurrentState();
    
    let comparison: StateComparison | undefined;
    if (previousDomState) {
      comparison = this.compareDOMStates(previousDomState, domState);
    }

    return { screenshot, domState, comparison };
  }

  async runWithAIGuidance(planId: string): Promise<void> {
    const plan = aiPlanManager.getPlan(planId);
    if (!plan) throw new Error('Plan not found');

    this.state.isRunning = true;
    this.state.isPaused = false;
    this.state.currentPlanId = planId;
    this.abortController = new AbortController();

    aiPlanManager.setPlanStatus(planId, 'running');
    domStateCapture.startErrorMonitoring();
    this.emit({ type: 'state_change', data: { state: this.state } });

    try {
      while (this.state.isRunning && !this.state.isPaused) {
        if (this.abortController?.signal.aborted) break;

        this.setPhase('capturing_before');
        const { screenshot, domState } = await this.captureCurrentState();

        this.setPhase('deciding');
        const baseContext = aiPlanManager.getDecisionContext(planId);
        const context: AIDecisionContext = {
          ...baseContext,
          screenshot,
          domState
        };

        const decision = await this.getAIDecision(context);
        
        if (decision) {
          aiPlanManager.applyAIDecision(planId, decision);

          if (decision.action === 'complete' || decision.action === 'fail' || decision.action === 'pause') {
            break;
          }

          if (decision.action === 'execute') {
            const currentStep = aiPlanManager.getCurrentStep(planId);
            if (currentStep) {
              const result = await this.executeStepWithVerification(planId, currentStep);
              
              if (result.verified) {
                aiPlanManager.setStepStatus(planId, currentStep.id, 'completed', result.result);
                aiPlanManager.advanceToNextStep(planId);
              } else if (!result.success) {
                aiPlanManager.setStepStatus(planId, currentStep.id, 'failed', undefined, result.error);
                if (this.config.pauseOnError) {
                  this.state.isPaused = true;
                  aiPlanManager.setPlanStatus(planId, 'paused');
                }
              }
            }
          }
        } else {
          const currentStep = aiPlanManager.getCurrentStep(planId);
          if (!currentStep) {
            aiPlanManager.setPlanStatus(planId, 'completed');
            break;
          }

          const result = await this.executeStepWithVerification(planId, currentStep);
          
          if (result.verified || (result.success && (result.verificationDetails?.confidence || 0) >= 0.5)) {
            aiPlanManager.setStepStatus(planId, currentStep.id, 'completed', result.result);
            aiPlanManager.advanceToNextStep(planId);
          } else {
            aiPlanManager.setStepStatus(planId, currentStep.id, 'failed', undefined, result.error);
            if (this.config.pauseOnError) {
              this.state.isPaused = true;
              aiPlanManager.setPlanStatus(planId, 'paused');
            }
          }
        }

        await this.delay(this.config.stepDelayMs);
      }
    } finally {
      this.state.isRunning = false;
      this.setPhase('idle');
      this.emit({ type: 'state_change', data: { state: this.state } });
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const visualAgent = new VisualAgent();
export default visualAgent;
