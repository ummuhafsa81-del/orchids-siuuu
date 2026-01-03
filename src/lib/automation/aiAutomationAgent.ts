import { getAgentClient, AgentCommand, AgentResponse } from './agentClient';
import { screenshotService, CapturedScreenshot, AIVisionAnalysisConfig } from './screenshotService';
import { domStateCapture, DOMStateSnapshot, PageState } from './domStateCapture';
import { AutomationPlan, AutomationTask, TaskStatus } from './types';

export interface AIAgentPlan {
  id: string;
  goal: string;
  steps: AIAgentStep[];
  status: 'draft' | 'ready' | 'executing' | 'paused' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  createdBy: 'ai' | 'user';
  metadata?: Record<string, unknown>;
}

export interface AIAgentStep {
  id: string;
  action: string;
  description: string;
  params: Record<string, unknown>;
  status: TaskStatus;
  order: number;
  expectedOutcome?: string;
  actualOutcome?: string;
  screenshot?: CapturedScreenshot;
  domSnapshot?: DOMStateSnapshot;
  error?: string;
  retries: number;
  maxRetries: number;
  duration?: number;
  aiReasoning?: string;
}

export interface AIAgentContext {
  screenshot: string | null;
  domState: DOMStateSnapshot | null;
  pageState: PageState | null;
  currentPlan: AIAgentPlan | null;
  currentStepIndex: number;
  executionHistory: AIAgentExecutionEntry[];
  errors: string[];
}

export interface AIAgentExecutionEntry {
  stepId: string;
  action: string;
  timestamp: number;
  success: boolean;
  screenshot?: string;
  domSummary?: string;
  error?: string;
}

export interface AIAgentDecision {
  action: 'execute' | 'skip' | 'retry' | 'modify' | 'add_step' | 'abort' | 'complete';
  reasoning: string;
  confidence: number;
  suggestedStep?: Partial<AIAgentStep>;
  modifiedParams?: Record<string, unknown>;
  newSteps?: Partial<AIAgentStep>[];
}

type PlanUpdateCallback = (plan: AIAgentPlan) => void;
type StepUpdateCallback = (step: AIAgentStep, index: number) => void;
type ContextUpdateCallback = (context: AIAgentContext) => void;
type DecisionCallback = (decision: AIAgentDecision, step: AIAgentStep) => void;

class AIAutomationAgent {
  private currentPlan: AIAgentPlan | null = null;
  private isExecuting = false;
  private isPaused = false;
  private currentStepIndex = 0;
  private executionHistory: AIAgentExecutionEntry[] = [];
  private aiConfig: AIVisionAnalysisConfig | null = null;
  private planListeners: Set<PlanUpdateCallback> = new Set();
  private stepListeners: Set<StepUpdateCallback> = new Set();
  private contextListeners: Set<ContextUpdateCallback> = new Set();
  private decisionListeners: Set<DecisionCallback> = new Set();
  private captureInterval: number | null = null;

  setAIConfig(config: AIVisionAnalysisConfig) {
    this.aiConfig = config;
  }

  addPlanListener(cb: PlanUpdateCallback) { this.planListeners.add(cb); }
  removePlanListener(cb: PlanUpdateCallback) { this.planListeners.delete(cb); }
  addStepListener(cb: StepUpdateCallback) { this.stepListeners.add(cb); }
  removeStepListener(cb: StepUpdateCallback) { this.stepListeners.delete(cb); }
  addContextListener(cb: ContextUpdateCallback) { this.contextListeners.add(cb); }
  removeContextListener(cb: ContextUpdateCallback) { this.contextListeners.delete(cb); }
  addDecisionListener(cb: DecisionCallback) { this.decisionListeners.add(cb); }
  removeDecisionListener(cb: DecisionCallback) { this.decisionListeners.delete(cb); }

  private notifyPlanUpdate() {
    if (this.currentPlan) {
      this.planListeners.forEach(cb => cb(this.currentPlan!));
    }
  }

  private notifyStepUpdate(step: AIAgentStep, index: number) {
    this.stepListeners.forEach(cb => cb(step, index));
  }

  private notifyContextUpdate() {
    const context = this.getCurrentContext();
    this.contextListeners.forEach(cb => cb(context));
  }

  private notifyDecision(decision: AIAgentDecision, step: AIAgentStep) {
    this.decisionListeners.forEach(cb => cb(decision, step));
  }

  createPlan(goal: string, steps: Partial<AIAgentStep>[] = []): AIAgentPlan {
    const plan: AIAgentPlan = {
      id: `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      goal,
      steps: steps.map((s, i) => this.createStep(s, i)),
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: 'user'
    };

    this.currentPlan = plan;
    this.notifyPlanUpdate();
    return plan;
  }

  private createStep(partial: Partial<AIAgentStep>, order: number): AIAgentStep {
    return {
      id: partial.id || `step_${Date.now()}_${order}`,
      action: partial.action || 'unknown',
      description: partial.description || '',
      params: partial.params || {},
      status: 'pending',
      order,
      expectedOutcome: partial.expectedOutcome,
      retries: 0,
      maxRetries: partial.maxRetries || 3,
      aiReasoning: partial.aiReasoning
    };
  }

  updatePlan(updates: Partial<AIAgentPlan>) {
    if (!this.currentPlan) return;

    this.currentPlan = {
      ...this.currentPlan,
      ...updates,
      updatedAt: Date.now()
    };

    this.notifyPlanUpdate();
  }

  addStep(step: Partial<AIAgentStep>, insertAt?: number) {
    if (!this.currentPlan) return;

    const newStep = this.createStep(step, insertAt ?? this.currentPlan.steps.length);
    
    if (insertAt !== undefined) {
      this.currentPlan.steps.splice(insertAt, 0, newStep);
      this.currentPlan.steps.forEach((s, i) => s.order = i);
    } else {
      this.currentPlan.steps.push(newStep);
    }

    this.currentPlan.updatedAt = Date.now();
    this.notifyPlanUpdate();
  }

  updateStep(stepId: string, updates: Partial<AIAgentStep>) {
    if (!this.currentPlan) return;

    const index = this.currentPlan.steps.findIndex(s => s.id === stepId);
    if (index === -1) return;

    this.currentPlan.steps[index] = {
      ...this.currentPlan.steps[index],
      ...updates
    };

    this.currentPlan.updatedAt = Date.now();
    this.notifyStepUpdate(this.currentPlan.steps[index], index);
    this.notifyPlanUpdate();
  }

  removeStep(stepId: string) {
    if (!this.currentPlan) return;

    const index = this.currentPlan.steps.findIndex(s => s.id === stepId);
    if (index === -1) return;

    this.currentPlan.steps.splice(index, 1);
    this.currentPlan.steps.forEach((s, i) => s.order = i);
    this.currentPlan.updatedAt = Date.now();
    this.notifyPlanUpdate();
  }

  reorderSteps(stepIds: string[]) {
    if (!this.currentPlan) return;

    const reordered: AIAgentStep[] = [];
    stepIds.forEach((id, index) => {
      const step = this.currentPlan!.steps.find(s => s.id === id);
      if (step) {
        step.order = index;
        reordered.push(step);
      }
    });

    this.currentPlan.steps = reordered;
    this.currentPlan.updatedAt = Date.now();
    this.notifyPlanUpdate();
  }

  async captureCurrentState(): Promise<{
    screenshot: CapturedScreenshot | null;
    domState: DOMStateSnapshot;
    pageState: PageState;
  }> {
    const screenshot = await screenshotService.captureScreenshot('manual', {
      stepDescription: 'AI state capture',
      uploadToStorage: true
    });

    const domState = domStateCapture.captureSnapshot();
    const pageState = domStateCapture.getPageState();

    this.notifyContextUpdate();

    return { screenshot, domState, pageState };
  }

  getCurrentContext(): AIAgentContext {
    const latestScreenshot = screenshotService.getLatestScreenshot();
    const domState = domStateCapture.captureSnapshot();
    const pageState = domStateCapture.getPageState();

    return {
      screenshot: latestScreenshot?.base64 || null,
      domState,
      pageState,
      currentPlan: this.currentPlan,
      currentStepIndex: this.currentStepIndex,
      executionHistory: [...this.executionHistory],
      errors: pageState.consoleErrors
    };
  }

  buildAIPrompt(): { prompt: string; imageBase64?: string } {
    const context = this.getCurrentContext();
    const currentStep = this.currentPlan?.steps[this.currentStepIndex];

    const domSummary = context.domState ? `
DOM State:
- ${context.domState.buttons.length} buttons
- ${context.domState.inputs.length} inputs
- ${context.domState.links.length} links
- ${context.domState.dialogs.length} dialogs open
- ${context.domState.errorElements.length} error elements
- Focused: ${context.domState.focusedElement?.selector || 'none'}

Interactive Elements:
${context.domState.interactiveElements.slice(0, 10).map(el => 
  `  - ${el.tagName}${el.id ? '#' + el.id : ''}: "${el.textContent?.substring(0, 50) || 'no text'}" at (${el.bounds.x}, ${el.bounds.y})`
).join('\n')}
` : '';

    const historyText = this.executionHistory.slice(-5).map(e => 
      `  - ${e.action}: ${e.success ? 'success' : 'failed'} ${e.error || ''}`
    ).join('\n');

    const prompt = `
[AI AUTOMATION AGENT CONTEXT]

Page: ${context.pageState?.title || 'Unknown'}
URL: ${context.pageState?.url || 'Unknown'}
Viewport: ${context.pageState?.viewportSize.width}x${context.pageState?.viewportSize.height}

${domSummary}

Current Plan: ${this.currentPlan?.goal || 'No plan'}
Current Step (${this.currentStepIndex + 1}/${this.currentPlan?.steps.length || 0}):
  Action: ${currentStep?.action || 'N/A'}
  Description: ${currentStep?.description || 'N/A'}
  Params: ${JSON.stringify(currentStep?.params || {})}
  Expected: ${currentStep?.expectedOutcome || 'N/A'}

Recent History:
${historyText || '  No previous actions'}

Errors: ${context.errors.length > 0 ? context.errors.slice(-3).join('; ') : 'None'}

Based on the screenshot and DOM state, decide the next action:
1. Should the current step be executed as planned?
2. Do the params need modification based on what you see?
3. Should additional steps be added?
4. Is there an error that needs handling?

Respond with JSON:
{
  "action": "execute" | "skip" | "retry" | "modify" | "add_step" | "abort" | "complete",
  "reasoning": "explanation",
  "confidence": 0.0-1.0,
  "suggestedStep": { optional modified step },
  "modifiedParams": { optional new params },
  "newSteps": [ optional additional steps ]
}
`;

    return {
      prompt,
      imageBase64: context.screenshot || undefined
    };
  }

  async requestAIDecision(): Promise<AIAgentDecision | null> {
    if (!this.aiConfig) {
      console.warn('[AIAgent] No AI config set');
      return null;
    }

    const { prompt, imageBase64 } = this.buildAIPrompt();
    
    try {
      const cleanedBase64 = imageBase64?.replace(/^data:image\/\w+;base64,/, '') || '';
      
      const response = await fetch(this.aiConfig.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.aiConfig.apiKey}`
        },
        body: JSON.stringify({
          model: this.aiConfig.model,
          messages: [
            { role: 'system', content: 'You are an AI automation agent. Analyze screenshots and DOM state to guide automation tasks. Always respond with valid JSON.' },
            {
              role: 'user',
              content: imageBase64 ? [
                { type: 'image_url', image_url: { url: `data:image/png;base64,${cleanedBase64}`, detail: 'high' } },
                { type: 'text', text: prompt }
              ] : prompt
            }
          ],
          max_tokens: 1000,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        throw new Error(`AI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      
      if (!content) return null;

      const decision: AIAgentDecision = JSON.parse(content);
      
      const currentStep = this.currentPlan?.steps[this.currentStepIndex];
      if (currentStep) {
        this.notifyDecision(decision, currentStep);
      }

      return decision;
    } catch (error) {
      console.error('[AIAgent] AI decision error:', error);
      return null;
    }
  }

  async startExecution(options: {
    captureOnEveryStep?: boolean;
    requestAIDecision?: boolean;
    autoRetry?: boolean;
  } = {}) {
    if (!this.currentPlan || this.isExecuting) return;

    const client = getAgentClient();
    if (!client.connected) {
      throw new Error('Agent not connected');
    }

    this.isExecuting = true;
    this.isPaused = false;
    this.currentStepIndex = 0;
    this.currentPlan.status = 'executing';
    this.notifyPlanUpdate();

    domStateCapture.startErrorMonitoring();

    if (options.captureOnEveryStep) {
      this.startContinuousCapture(2000);
    }

    try {
      while (this.currentStepIndex < this.currentPlan.steps.length) {
        if (this.isPaused) {
          await this.waitForResume();
        }

        if (!this.isExecuting) break;

        const step = this.currentPlan.steps[this.currentStepIndex];
        
        if (options.captureOnEveryStep) {
          const { screenshot, domState } = await this.captureCurrentState();
          step.screenshot = screenshot || undefined;
          step.domSnapshot = domState;
        }

        if (options.requestAIDecision && this.aiConfig) {
          const decision = await this.requestAIDecision();
          
          if (decision) {
            if (decision.action === 'abort') {
              this.currentPlan.status = 'failed';
              break;
            }
            
            if (decision.action === 'skip') {
              step.status = 'cancelled';
              step.aiReasoning = decision.reasoning;
              this.currentStepIndex++;
              continue;
            }
            
            if (decision.action === 'modify' && decision.modifiedParams) {
              step.params = { ...step.params, ...decision.modifiedParams };
              step.aiReasoning = decision.reasoning;
            }
            
            if (decision.action === 'add_step' && decision.newSteps) {
              decision.newSteps.forEach((newStep, i) => {
                this.addStep(newStep, this.currentStepIndex + 1 + i);
              });
            }
          }
        }

        const result = await this.executeStep(step);
        
        if (!result.success && options.autoRetry && step.retries < step.maxRetries) {
          step.retries++;
          continue;
        }

        this.currentStepIndex++;
      }

      if (this.currentPlan.steps.every(s => s.status === 'completed')) {
        this.currentPlan.status = 'completed';
      } else if (this.currentPlan.steps.some(s => s.status === 'failed')) {
        this.currentPlan.status = 'failed';
      }
    } finally {
      this.isExecuting = false;
      this.stopContinuousCapture();
      domStateCapture.stopErrorMonitoring();
      this.notifyPlanUpdate();
    }
  }

  private async executeStep(step: AIAgentStep): Promise<{ success: boolean; error?: string }> {
    const startTime = Date.now();
    step.status = 'in_progress';
    this.notifyStepUpdate(step, this.currentStepIndex);

    try {
      const command: AgentCommand = {
        action: step.action as AgentCommand['action'],
        ...step.params
      };

      const client = getAgentClient();
      const response: AgentResponse = await client.execute(command);

      step.duration = Date.now() - startTime;

      if (response.success) {
        step.status = 'completed';
        step.actualOutcome = response.message || 'Success';
        
        this.executionHistory.push({
          stepId: step.id,
          action: step.action,
          timestamp: Date.now(),
          success: true,
          domSummary: domStateCapture.captureSnapshot().summary
        });

        this.notifyStepUpdate(step, this.currentStepIndex);
        return { success: true };
      } else {
        throw new Error(response.error || 'Unknown error');
      }
    } catch (error) {
      step.status = 'failed';
      step.error = error instanceof Error ? error.message : 'Unknown error';
      step.duration = Date.now() - startTime;

      this.executionHistory.push({
        stepId: step.id,
        action: step.action,
        timestamp: Date.now(),
        success: false,
        error: step.error
      });

      this.notifyStepUpdate(step, this.currentStepIndex);
      return { success: false, error: step.error };
    }
  }

  pause() {
    this.isPaused = true;
    if (this.currentPlan) {
      this.currentPlan.status = 'paused';
      this.notifyPlanUpdate();
    }
  }

  resume() {
    this.isPaused = false;
    if (this.currentPlan) {
      this.currentPlan.status = 'executing';
      this.notifyPlanUpdate();
    }
  }

  stop() {
    this.isExecuting = false;
    this.isPaused = false;
    this.stopContinuousCapture();
    
    if (this.currentPlan) {
      this.currentPlan.steps.forEach(step => {
        if (step.status === 'in_progress' || step.status === 'pending') {
          step.status = 'cancelled';
        }
      });
      this.currentPlan.status = 'failed';
      this.notifyPlanUpdate();
    }
  }

  private async waitForResume(): Promise<void> {
    return new Promise(resolve => {
      const check = setInterval(() => {
        if (!this.isPaused || !this.isExecuting) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
  }

  private startContinuousCapture(intervalMs: number) {
    if (this.captureInterval) return;
    
    this.captureInterval = window.setInterval(() => {
      if (this.isExecuting) {
        this.captureCurrentState();
      }
    }, intervalMs);
  }

  private stopContinuousCapture() {
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }
  }

  getPlan(): AIAgentPlan | null {
    return this.currentPlan;
  }

  clearPlan() {
    this.currentPlan = null;
    this.executionHistory = [];
    this.currentStepIndex = 0;
    this.notifyPlanUpdate();
  }

  get executing(): boolean {
    return this.isExecuting;
  }

  get paused(): boolean {
    return this.isPaused;
  }

  convertToAutomationPlan(): AutomationPlan | null {
    if (!this.currentPlan) return null;

    return {
      id: this.currentPlan.id,
      title: this.currentPlan.goal,
      description: `AI-generated plan with ${this.currentPlan.steps.length} steps`,
      tasks: this.currentPlan.steps.map(step => ({
        id: step.id,
        action: step.action,
        description: step.description,
        status: step.status
      })),
      createdAt: new Date(this.currentPlan.createdAt),
      status: this.currentPlan.status === 'draft' ? 'draft' : 
              this.currentPlan.status === 'executing' ? 'executing' :
              this.currentPlan.status === 'completed' ? 'completed' :
              this.currentPlan.status === 'failed' ? 'failed' : 'ready'
    };
  }
}

export const aiAutomationAgent = new AIAutomationAgent();
export default aiAutomationAgent;
