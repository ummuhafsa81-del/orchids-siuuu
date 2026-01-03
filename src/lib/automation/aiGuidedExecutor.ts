import { getAgentClient, AgentCommand, AgentResponse } from './agentClient';
import { screenshotService, CapturedScreenshot, AIVisionAnalysisConfig, AIVisionAnalysisResult } from './screenshotService';
import { realtimeScreenshotLoop, AIGuidanceResponse, ScreenshotEvent } from './realtimeScreenshotLoop';

export interface AIGuidedStep {
  id: string;
  action: string;
  params: Record<string, unknown>;
  description: string;
  expectedOutcome?: string;
  verificationRequired?: boolean;
  maxRetries?: number;
}

export interface AIGuidedExecutionResult {
  stepId: string;
  success: boolean;
  beforeScreenshot: CapturedScreenshot | null;
  afterScreenshot: CapturedScreenshot | null;
  aiAnalysisBefore: AIVisionAnalysisResult | null;
  aiAnalysisAfter: AIVisionAnalysisResult | null;
  verificationPassed: boolean;
  duration: number;
  retryCount: number;
  error?: string;
  aiSuggestion?: string;
}

export interface AIGuidedExecutionOptions {
  aiConfig: AIVisionAnalysisConfig;
  onStepStart?: (step: AIGuidedStep, screenshot: CapturedScreenshot | null) => void;
  onStepComplete?: (step: AIGuidedStep, result: AIGuidedExecutionResult) => void;
  onAIAnalysis?: (step: AIGuidedStep, analysis: AIVisionAnalysisResult | null) => void;
  onScreenshotCapture?: (screenshot: CapturedScreenshot, phase: 'before' | 'after' | 'error' | 'verification') => void;
  onVerificationFailed?: (step: AIGuidedStep, expected: string, actual: string) => 'retry' | 'skip' | 'abort';
  maxRetriesPerStep?: number;
  verificationTimeout?: number;
  captureIntervalMs?: number;
  sendScreenshotsToAI?: boolean;
}

type ExecutionEventType = 
  | 'execution_started'
  | 'step_started'
  | 'step_completed'
  | 'step_failed'
  | 'verification_started'
  | 'verification_passed'
  | 'verification_failed'
  | 'ai_guidance_received'
  | 'execution_completed'
  | 'execution_aborted';

export interface ExecutionEvent {
  type: ExecutionEventType;
  timestamp: number;
  stepId?: string;
  stepIndex?: number;
  totalSteps?: number;
  screenshot?: CapturedScreenshot;
  analysis?: AIVisionAnalysisResult | AIGuidanceResponse;
  error?: string;
  success?: boolean;
}

type ExecutionEventCallback = (event: ExecutionEvent) => void;

class AIGuidedExecutor {
  private eventListeners: Set<ExecutionEventCallback> = new Set();
  private isExecuting = false;
  private shouldAbort = false;
  private currentStepIndex = 0;
  private executionHistory: AIGuidedExecutionResult[] = [];
  private aiConfig: AIVisionAnalysisConfig | null = null;

  addEventListener(callback: ExecutionEventCallback) {
    this.eventListeners.add(callback);
  }

  removeEventListener(callback: ExecutionEventCallback) {
    this.eventListeners.delete(callback);
  }

  private emitEvent(event: ExecutionEvent) {
    this.eventListeners.forEach(cb => cb(event));
  }

  setAIConfig(config: AIVisionAnalysisConfig) {
    this.aiConfig = config;
    realtimeScreenshotLoop.setAIConfig(
      config.endpoint,
      config.apiKey,
      config.model
    );
  }

  async executeStepsWithAIGuidance(
    steps: AIGuidedStep[],
    options: AIGuidedExecutionOptions
  ): Promise<{
    results: AIGuidedExecutionResult[];
    allSucceeded: boolean;
    abortedAt?: number;
  }> {
    if (this.isExecuting) {
      throw new Error('Execution already in progress');
    }

    this.isExecuting = true;
    this.shouldAbort = false;
    this.currentStepIndex = 0;
    this.executionHistory = [];
    
    const client = getAgentClient();
    if (!client.connected) {
      this.isExecuting = false;
      throw new Error('Agent not connected');
    }

    this.emitEvent({
      type: 'execution_started',
      timestamp: Date.now(),
      totalSteps: steps.length
    });

    realtimeScreenshotLoop.start({
      captureIntervalMs: options.captureIntervalMs || 5000,
      sendToAIImmediately: false,
      taskDescription: `Executing ${steps.length} automation steps`
    });

    const results: AIGuidedExecutionResult[] = [];
    let abortedAt: number | undefined;

    try {
      for (let i = 0; i < steps.length; i++) {
        if (this.shouldAbort) {
          abortedAt = i;
          break;
        }

        this.currentStepIndex = i;
        const step = steps[i];
        
        realtimeScreenshotLoop.setTaskContext(step.description, i, steps.length);

        const result = await this.executeStepWithAI(step, i, steps.length, options);
        results.push(result);
        this.executionHistory.push(result);

        if (!result.success && !result.verificationPassed) {
          if (options.onVerificationFailed && step.expectedOutcome) {
            const decision = options.onVerificationFailed(
              step,
              step.expectedOutcome,
              result.aiAnalysisAfter?.stateVerification?.actualState || 'Unknown'
            );

            if (decision === 'abort') {
              abortedAt = i;
              this.emitEvent({
                type: 'execution_aborted',
                timestamp: Date.now(),
                stepId: step.id,
                stepIndex: i,
                error: 'Aborted by verification failure handler'
              });
              break;
            } else if (decision === 'retry' && result.retryCount < (options.maxRetriesPerStep || 3)) {
              i--;
              continue;
            }
          }
        }
      }
    } finally {
      realtimeScreenshotLoop.stop();
      realtimeScreenshotLoop.clearTaskContext();
      this.isExecuting = false;
    }

    this.emitEvent({
      type: 'execution_completed',
      timestamp: Date.now(),
      totalSteps: steps.length,
      success: results.every(r => r.success)
    });

    return {
      results,
      allSucceeded: results.every(r => r.success && r.verificationPassed),
      abortedAt
    };
  }

  private async executeStepWithAI(
    step: AIGuidedStep,
    stepIndex: number,
    totalSteps: number,
    options: AIGuidedExecutionOptions
  ): Promise<AIGuidedExecutionResult> {
    const startTime = Date.now();
    const maxRetries = step.maxRetries || options.maxRetriesPerStep || 3;
    let retryCount = 0;

    this.emitEvent({
      type: 'step_started',
      timestamp: Date.now(),
      stepId: step.id,
      stepIndex,
      totalSteps
    });

    const beforeScreenshot = await realtimeScreenshotLoop.captureBeforeAction(
      step.action,
      step.params
    );

    if (beforeScreenshot) {
      options.onScreenshotCapture?.(beforeScreenshot, 'before');
    }

    let aiAnalysisBefore: AIVisionAnalysisResult | null = null;
    if (beforeScreenshot && options.sendScreenshotsToAI !== false) {
      aiAnalysisBefore = await screenshotService.analyzeWithAI(
        beforeScreenshot,
        options.aiConfig,
        {
          currentTask: step.description,
          expectedState: step.expectedOutcome,
          previousActions: this.executionHistory.map(r => `${r.stepId}: ${r.success ? 'success' : 'failed'}`)
        }
      );

      options.onAIAnalysis?.(step, aiAnalysisBefore);

      if (aiAnalysisBefore?.errors.detected) {
        this.emitEvent({
          type: 'ai_guidance_received',
          timestamp: Date.now(),
          stepId: step.id,
          analysis: aiAnalysisBefore,
          error: aiAnalysisBefore.errors.description
        });
      }
    }

    options.onStepStart?.(step, beforeScreenshot);

    const command: AgentCommand = {
      action: step.action as AgentCommand['action'],
      ...step.params
    };

    const client = getAgentClient();
    let response: AgentResponse;
    let success = false;
    let error: string | undefined;

    while (retryCount <= maxRetries) {
      try {
        response = await client.execute(command);
        success = response.success;
        if (!success) {
          error = response.error || 'Unknown error';
        }
        break;
      } catch (e) {
        error = e instanceof Error ? e.message : 'Unknown error';
        retryCount++;
        if (retryCount <= maxRetries) {
          await this.delay(500 * retryCount);
        }
      }
    }

    const afterScreenshot = await realtimeScreenshotLoop.captureAfterAction(
      step.action,
      step.params,
      success
    );

    if (afterScreenshot) {
      options.onScreenshotCapture?.(afterScreenshot, success ? 'after' : 'error');
    }

    let aiAnalysisAfter: AIVisionAnalysisResult | null = null;
    let verificationPassed = true;

    if (afterScreenshot && options.sendScreenshotsToAI !== false) {
      aiAnalysisAfter = await screenshotService.analyzeWithAI(
        afterScreenshot,
        options.aiConfig,
        {
          currentTask: step.description,
          expectedState: step.expectedOutcome,
          previousActions: this.executionHistory.map(r => `${r.stepId}: ${r.success ? 'success' : 'failed'}`)
        }
      );

      options.onAIAnalysis?.(step, aiAnalysisAfter);

      if (step.verificationRequired && step.expectedOutcome) {
        this.emitEvent({
          type: 'verification_started',
          timestamp: Date.now(),
          stepId: step.id
        });

        verificationPassed = aiAnalysisAfter?.stateVerification?.matches ?? false;

        if (!verificationPassed && success) {
          const verifyResult = await realtimeScreenshotLoop.verifyActionResult(
            step.expectedOutcome,
            options.verificationTimeout || 5000,
            500
          );
          verificationPassed = verifyResult.verified;

          if (verifyResult.analysis) {
            aiAnalysisAfter = verifyResult.analysis as unknown as AIVisionAnalysisResult;
          }
        }

        this.emitEvent({
          type: verificationPassed ? 'verification_passed' : 'verification_failed',
          timestamp: Date.now(),
          stepId: step.id,
          screenshot: afterScreenshot,
          analysis: aiAnalysisAfter || undefined
        });
      }
    }

    const result: AIGuidedExecutionResult = {
      stepId: step.id,
      success,
      beforeScreenshot,
      afterScreenshot,
      aiAnalysisBefore,
      aiAnalysisAfter,
      verificationPassed,
      duration: Date.now() - startTime,
      retryCount,
      error,
      aiSuggestion: aiAnalysisAfter?.suggestedActions[0]
        ? `${aiAnalysisAfter.suggestedActions[0].action}: ${aiAnalysisAfter.suggestedActions[0].reasoning}`
        : undefined
    };

    this.emitEvent({
      type: success ? 'step_completed' : 'step_failed',
      timestamp: Date.now(),
      stepId: step.id,
      stepIndex,
      success,
      error
    });

    options.onStepComplete?.(step, result);

    return result;
  }

  async executeSingleStepWithAI(
    step: AIGuidedStep,
    options: AIGuidedExecutionOptions
  ): Promise<AIGuidedExecutionResult> {
    if (!this.aiConfig && options.aiConfig) {
      this.setAIConfig(options.aiConfig);
    }

    const client = getAgentClient();
    if (!client.connected) {
      throw new Error('Agent not connected');
    }

    return this.executeStepWithAI(step, 0, 1, options);
  }

  async getAIGuidanceForCurrentState(
    taskDescription: string,
    options: AIGuidedExecutionOptions
  ): Promise<{ screenshot: CapturedScreenshot | null; analysis: AIVisionAnalysisResult | null }> {
    const screenshot = await screenshotService.captureScreenshot('manual', {
      stepDescription: `AI guidance request: ${taskDescription}`,
      uploadToStorage: true
    });

    if (!screenshot) {
      return { screenshot: null, analysis: null };
    }

    const analysis = await screenshotService.analyzeWithAI(
      screenshot,
      options.aiConfig,
      {
        currentTask: taskDescription,
        previousActions: this.executionHistory.map(r => `${r.stepId}: ${r.success ? 'success' : 'failed'}`)
      }
    );

    return { screenshot, analysis };
  }

  abort() {
    this.shouldAbort = true;
    realtimeScreenshotLoop.stop();
  }

  getExecutionHistory(): AIGuidedExecutionResult[] {
    return [...this.executionHistory];
  }

  clearHistory() {
    this.executionHistory = [];
  }

  get executing(): boolean {
    return this.isExecuting;
  }

  get currentStep(): number {
    return this.currentStepIndex;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const aiGuidedExecutor = new AIGuidedExecutor();
export default aiGuidedExecutor;
