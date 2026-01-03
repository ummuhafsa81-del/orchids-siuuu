import { screenshotService, CapturedScreenshot, AIVisionAnalysisConfig, AIVisionAnalysisResult } from './screenshotService';
import { realtimeScreenshotLoop } from './realtimeScreenshotLoop';
import { getAgentClient } from './agentClient';

export interface VerificationCondition {
  type: 'element_visible' | 'element_absent' | 'text_present' | 'text_absent' | 'state_matches' | 'custom';
  target?: string;
  expectedValue?: string;
  customCheck?: (analysis: AIVisionAnalysisResult) => boolean;
}

export interface VerificationResult {
  passed: boolean;
  conditionResults: {
    condition: VerificationCondition;
    passed: boolean;
    actualValue?: string;
    confidence: number;
  }[];
  screenshot: CapturedScreenshot | null;
  analysis: AIVisionAnalysisResult | null;
  duration: number;
  attempts: number;
}

export interface VerificationLoopOptions {
  conditions: VerificationCondition[];
  aiConfig: AIVisionAnalysisConfig;
  maxAttempts?: number;
  checkIntervalMs?: number;
  timeoutMs?: number;
  onAttempt?: (attempt: number, result: Partial<VerificationResult>) => void;
  onScreenshotCapture?: (screenshot: CapturedScreenshot) => void;
  onAIAnalysis?: (analysis: AIVisionAnalysisResult) => void;
  taskDescription?: string;
}

type VerificationEventType = 
  | 'verification_started'
  | 'verification_attempt'
  | 'verification_passed'
  | 'verification_failed'
  | 'verification_timeout';

export interface VerificationEvent {
  type: VerificationEventType;
  timestamp: number;
  attempt?: number;
  maxAttempts?: number;
  conditionsPassed?: number;
  totalConditions?: number;
  screenshot?: CapturedScreenshot;
  analysis?: AIVisionAnalysisResult;
  error?: string;
}

type VerificationEventCallback = (event: VerificationEvent) => void;

class StateVerificationLoop {
  private eventListeners: Set<VerificationEventCallback> = new Set();
  private isVerifying = false;
  private shouldAbort = false;

  addEventListener(callback: VerificationEventCallback) {
    this.eventListeners.add(callback);
  }

  removeEventListener(callback: VerificationEventCallback) {
    this.eventListeners.delete(callback);
  }

  private emitEvent(event: VerificationEvent) {
    this.eventListeners.forEach(cb => cb(event));
  }

  async verifyState(options: VerificationLoopOptions): Promise<VerificationResult> {
    const startTime = Date.now();
    const maxAttempts = options.maxAttempts || 5;
    const checkIntervalMs = options.checkIntervalMs || 1000;
    const timeoutMs = options.timeoutMs || 15000;

    this.isVerifying = true;
    this.shouldAbort = false;

    this.emitEvent({
      type: 'verification_started',
      timestamp: Date.now(),
      maxAttempts,
      totalConditions: options.conditions.length
    });

    let attempts = 0;
    let lastScreenshot: CapturedScreenshot | null = null;
    let lastAnalysis: AIVisionAnalysisResult | null = null;
    let conditionResults: VerificationResult['conditionResults'] = [];

    const client = getAgentClient();
    if (!client.connected) {
      this.isVerifying = false;
      return {
        passed: false,
        conditionResults: [],
        screenshot: null,
        analysis: null,
        duration: Date.now() - startTime,
        attempts: 0
      };
    }

    while (attempts < maxAttempts && !this.shouldAbort) {
      if (Date.now() - startTime > timeoutMs) {
        this.emitEvent({
          type: 'verification_timeout',
          timestamp: Date.now(),
          attempt: attempts,
          maxAttempts,
          error: `Verification timed out after ${timeoutMs}ms`
        });
        break;
      }

      attempts++;

      const screenshot = await screenshotService.captureScreenshot('verification', {
        stepDescription: options.taskDescription || `Verification attempt ${attempts}`,
        uploadToStorage: true
      });

      if (!screenshot) {
        await this.delay(checkIntervalMs);
        continue;
      }

      lastScreenshot = screenshot;
      options.onScreenshotCapture?.(screenshot);

      const analysis = await screenshotService.analyzeWithAI(
        screenshot,
        options.aiConfig,
        {
          currentTask: options.taskDescription,
          expectedState: options.conditions.map(c => this.conditionToString(c)).join(', ')
        }
      );

      if (!analysis) {
        await this.delay(checkIntervalMs);
        continue;
      }

      lastAnalysis = analysis;
      options.onAIAnalysis?.(analysis);

      conditionResults = this.evaluateConditions(options.conditions, analysis);
      const allPassed = conditionResults.every(r => r.passed);
      const passedCount = conditionResults.filter(r => r.passed).length;

      this.emitEvent({
        type: 'verification_attempt',
        timestamp: Date.now(),
        attempt: attempts,
        maxAttempts,
        conditionsPassed: passedCount,
        totalConditions: options.conditions.length,
        screenshot,
        analysis
      });

      options.onAttempt?.(attempts, {
        conditionResults,
        screenshot,
        analysis,
        attempts
      });

      if (allPassed) {
        this.isVerifying = false;
        this.emitEvent({
          type: 'verification_passed',
          timestamp: Date.now(),
          attempt: attempts,
          conditionsPassed: passedCount,
          totalConditions: options.conditions.length,
          screenshot,
          analysis
        });

        return {
          passed: true,
          conditionResults,
          screenshot: lastScreenshot,
          analysis: lastAnalysis,
          duration: Date.now() - startTime,
          attempts
        };
      }

      await this.delay(checkIntervalMs);
    }

    this.isVerifying = false;
    this.emitEvent({
      type: 'verification_failed',
      timestamp: Date.now(),
      attempt: attempts,
      maxAttempts,
      conditionsPassed: conditionResults.filter(r => r.passed).length,
      totalConditions: options.conditions.length,
      screenshot: lastScreenshot || undefined,
      analysis: lastAnalysis || undefined
    });

    return {
      passed: false,
      conditionResults,
      screenshot: lastScreenshot,
      analysis: lastAnalysis,
      duration: Date.now() - startTime,
      attempts
    };
  }

  async waitForState(
    description: string,
    aiConfig: AIVisionAnalysisConfig,
    options: {
      timeoutMs?: number;
      checkIntervalMs?: number;
    } = {}
  ): Promise<{ reached: boolean; screenshot: CapturedScreenshot | null; analysis: AIVisionAnalysisResult | null }> {
    const result = await this.verifyState({
      conditions: [{
        type: 'state_matches',
        expectedValue: description
      }],
      aiConfig,
      timeoutMs: options.timeoutMs || 10000,
      checkIntervalMs: options.checkIntervalMs || 1000,
      taskDescription: `Waiting for: ${description}`
    });

    return {
      reached: result.passed,
      screenshot: result.screenshot,
      analysis: result.analysis
    };
  }

  async waitForElement(
    elementDescription: string,
    aiConfig: AIVisionAnalysisConfig,
    options: {
      shouldBeVisible?: boolean;
      timeoutMs?: number;
    } = {}
  ): Promise<{ found: boolean; position?: { x: number; y: number } }> {
    const result = await this.verifyState({
      conditions: [{
        type: options.shouldBeVisible !== false ? 'element_visible' : 'element_absent',
        target: elementDescription
      }],
      aiConfig,
      timeoutMs: options.timeoutMs || 10000,
      taskDescription: `${options.shouldBeVisible !== false ? 'Waiting for' : 'Waiting for absence of'}: ${elementDescription}`
    });

    if (result.passed && result.analysis) {
      const element = result.analysis.detectedElements.find(
        e => e.label.toLowerCase().includes(elementDescription.toLowerCase())
      );
      if (element) {
        return {
          found: true,
          position: { x: element.position.x, y: element.position.y }
        };
      }
    }

    return { found: result.passed };
  }

  async waitForText(
    text: string,
    aiConfig: AIVisionAnalysisConfig,
    options: {
      shouldBePresent?: boolean;
      timeoutMs?: number;
    } = {}
  ): Promise<{ found: boolean }> {
    const result = await this.verifyState({
      conditions: [{
        type: options.shouldBePresent !== false ? 'text_present' : 'text_absent',
        expectedValue: text
      }],
      aiConfig,
      timeoutMs: options.timeoutMs || 10000,
      taskDescription: `${options.shouldBePresent !== false ? 'Waiting for text' : 'Waiting for text to disappear'}: ${text}`
    });

    return { found: result.passed };
  }

  abort() {
    this.shouldAbort = true;
  }

  get verifying(): boolean {
    return this.isVerifying;
  }

  private evaluateConditions(
    conditions: VerificationCondition[],
    analysis: AIVisionAnalysisResult
  ): VerificationResult['conditionResults'] {
    return conditions.map(condition => {
      const result = this.evaluateCondition(condition, analysis);
      return {
        condition,
        ...result
      };
    });
  }

  private evaluateCondition(
    condition: VerificationCondition,
    analysis: AIVisionAnalysisResult
  ): { passed: boolean; actualValue?: string; confidence: number } {
    switch (condition.type) {
      case 'element_visible': {
        const found = analysis.detectedElements.some(
          e => e.visible && e.label.toLowerCase().includes((condition.target || '').toLowerCase())
        );
        return {
          passed: found,
          actualValue: found ? 'Element found and visible' : 'Element not found',
          confidence: found ? analysis.confidence : 0.5
        };
      }

      case 'element_absent': {
        const found = analysis.detectedElements.some(
          e => e.visible && e.label.toLowerCase().includes((condition.target || '').toLowerCase())
        );
        return {
          passed: !found,
          actualValue: found ? 'Element still present' : 'Element absent',
          confidence: analysis.confidence
        };
      }

      case 'text_present': {
        const textPresent = analysis.uiState.toLowerCase().includes((condition.expectedValue || '').toLowerCase()) ||
          analysis.detectedElements.some(e => e.label.toLowerCase().includes((condition.expectedValue || '').toLowerCase()));
        return {
          passed: textPresent,
          actualValue: textPresent ? 'Text found' : 'Text not found',
          confidence: textPresent ? analysis.confidence : 0.5
        };
      }

      case 'text_absent': {
        const textPresent = analysis.uiState.toLowerCase().includes((condition.expectedValue || '').toLowerCase()) ||
          analysis.detectedElements.some(e => e.label.toLowerCase().includes((condition.expectedValue || '').toLowerCase()));
        return {
          passed: !textPresent,
          actualValue: textPresent ? 'Text still present' : 'Text absent',
          confidence: analysis.confidence
        };
      }

      case 'state_matches': {
        const matches = analysis.stateVerification?.matches ?? false;
        const actualState = analysis.stateVerification?.actualState || analysis.uiState;
        return {
          passed: matches || actualState.toLowerCase().includes((condition.expectedValue || '').toLowerCase()),
          actualValue: actualState,
          confidence: analysis.confidence
        };
      }

      case 'custom': {
        if (condition.customCheck) {
          const passed = condition.customCheck(analysis);
          return {
            passed,
            actualValue: passed ? 'Custom check passed' : 'Custom check failed',
            confidence: analysis.confidence
          };
        }
        return {
          passed: false,
          actualValue: 'No custom check function provided',
          confidence: 0
        };
      }

      default:
        return {
          passed: false,
          actualValue: 'Unknown condition type',
          confidence: 0
        };
    }
  }

  private conditionToString(condition: VerificationCondition): string {
    switch (condition.type) {
      case 'element_visible':
        return `Element "${condition.target}" should be visible`;
      case 'element_absent':
        return `Element "${condition.target}" should be absent`;
      case 'text_present':
        return `Text "${condition.expectedValue}" should be present`;
      case 'text_absent':
        return `Text "${condition.expectedValue}" should be absent`;
      case 'state_matches':
        return `State should match: ${condition.expectedValue}`;
      case 'custom':
        return 'Custom condition';
      default:
        return 'Unknown condition';
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const stateVerificationLoop = new StateVerificationLoop();
export default stateVerificationLoop;
