import { getAgentClient, AgentResponse } from './agentClient';
import { screenshotService, CapturedScreenshot, AIVisualContext, ScreenshotTrigger } from './screenshotService';

export interface AIGuidanceRequest {
  screenshot: string;
  currentTask: string;
  stepIndex: number;
  totalSteps: number;
  previousActions: ActionHistoryEntry[];
  errorContext?: string;
}

export interface AIGuidanceResponse {
  shouldProceed: boolean;
  confidence: number;
  suggestedAction?: SuggestedAction;
  verificationResult?: VerificationResult;
  errorDetected: boolean;
  errorDescription?: string;
  uiStateDescription: string;
  detectedElements: DetectedUIElement[];
}

export interface SuggestedAction {
  action: string;
  params: Record<string, unknown>;
  reasoning: string;
  targetElement?: string;
}

export interface VerificationResult {
  actionSucceeded: boolean;
  stateChanged: boolean;
  expectedVsActual: string;
}

export interface DetectedUIElement {
  type: 'button' | 'input' | 'link' | 'menu' | 'dialog' | 'text' | 'image' | 'other';
  label: string;
  approximatePosition: { x: number; y: number };
  visible: boolean;
  interactable: boolean;
}

export interface ActionHistoryEntry {
  action: string;
  timestamp: number;
  success: boolean;
  screenshotTaken: boolean;
  description: string;
}

export type ScreenshotEventType = 
  | 'capture_started'
  | 'capture_completed'
  | 'capture_failed'
  | 'ai_analysis_started'
  | 'ai_analysis_completed'
  | 'verification_passed'
  | 'verification_failed'
  | 'error_detected'
  | 'state_change_detected';

export interface ScreenshotEvent {
  type: ScreenshotEventType;
  timestamp: number;
  screenshot?: CapturedScreenshot;
  analysis?: Partial<AIGuidanceResponse>;
  error?: string;
}

type ScreenshotEventCallback = (event: ScreenshotEvent) => void;
type AIAnalysisCallback = (screenshot: CapturedScreenshot, analysis: AIGuidanceResponse) => void;

class RealtimeScreenshotLoop {
    private isRunning = false;
    private captureIntervalMs = 2000;
    private intervalId: number | null = null;
    private actionHistory: ActionHistoryEntry[] = [];
    private maxHistorySize = 10;
    private eventListeners: Set<ScreenshotEventCallback> = new Set();
    private aiAnalysisListeners: Set<AIAnalysisCallback> = new Set();
    private currentTaskContext: { task: string; stepIndex: number; totalSteps: number } | null = null;
    private lastScreenshotHash: string = '';
    private consecutiveUnchangedCount = 0;
    private maxUnchangedBeforeAction = 3;
    private pendingAnalysis: Promise<AIGuidanceResponse | null> | null = null;
    private aiAnalysisEndpoint: string | null = null;
    private aiApiKey: string | null = null;
    private aiModel: string = 'gpt-4o';

  setAIConfig(endpoint: string, apiKey: string, model?: string) {
    this.aiAnalysisEndpoint = endpoint;
    this.aiApiKey = apiKey;
    if (model) this.aiModel = model;
  }

  addEventListener(callback: ScreenshotEventCallback) {
    this.eventListeners.add(callback);
  }

  removeEventListener(callback: ScreenshotEventCallback) {
    this.eventListeners.delete(callback);
  }

  addAIAnalysisListener(callback: AIAnalysisCallback) {
    this.aiAnalysisListeners.add(callback);
  }

  removeAIAnalysisListener(callback: AIAnalysisCallback) {
    this.aiAnalysisListeners.delete(callback);
  }

  private emitEvent(event: ScreenshotEvent) {
    this.eventListeners.forEach(cb => cb(event));
  }

  private emitAIAnalysis(screenshot: CapturedScreenshot, analysis: AIGuidanceResponse) {
    this.aiAnalysisListeners.forEach(cb => cb(screenshot, analysis));
  }

  setTaskContext(task: string, stepIndex: number, totalSteps: number) {
    this.currentTaskContext = { task, stepIndex, totalSteps };
  }

  clearTaskContext() {
    this.currentTaskContext = null;
  }

  setCaptureInterval(ms: number) {
    this.captureIntervalMs = Math.max(500, ms);
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  async start(options: {
    captureIntervalMs?: number;
    sendToAIImmediately?: boolean;
    taskDescription?: string;
  } = {}) {
    if (this.isRunning) return;

    const client = getAgentClient();
    if (!client.connected) {
      console.warn('[RealtimeLoop] Agent not connected, cannot start');
      return;
    }

    this.isRunning = true;
    if (options.captureIntervalMs) {
      this.captureIntervalMs = options.captureIntervalMs;
    }

    console.log(`[RealtimeLoop] Starting continuous capture every ${this.captureIntervalMs}ms`);

    const captureInitial = await this.captureAndAnalyze('task_start', options.taskDescription || 'Starting automation');
    if (captureInitial && options.sendToAIImmediately) {
      await this.requestAIGuidance(captureInitial);
    }

    this.intervalId = window.setInterval(async () => {
      if (!this.isRunning) return;
      await this.captureAndAnalyze('manual', 'Continuous monitoring');
    }, this.captureIntervalMs);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.consecutiveUnchangedCount = 0;
    console.log('[RealtimeLoop] Stopped continuous capture');
  }

  async captureAndAnalyze(
    trigger: ScreenshotTrigger = 'manual',
    description?: string
  ): Promise<CapturedScreenshot | null> {
    this.emitEvent({
      type: 'capture_started',
      timestamp: Date.now()
    });

    const screenshot = await screenshotService.captureScreenshot(trigger, {
      stepDescription: description,
      taskId: this.currentTaskContext?.task,
      uploadToStorage: true
    });

    if (!screenshot) {
      this.emitEvent({
        type: 'capture_failed',
        timestamp: Date.now(),
        error: 'Failed to capture screenshot'
      });
      return null;
    }

    this.emitEvent({
      type: 'capture_completed',
      timestamp: Date.now(),
      screenshot
    });

    const currentHash = this.computeSimpleHash(screenshot.base64);
    if (currentHash === this.lastScreenshotHash) {
      this.consecutiveUnchangedCount++;
      if (this.consecutiveUnchangedCount >= this.maxUnchangedBeforeAction) {
        this.emitEvent({
          type: 'state_change_detected',
          timestamp: Date.now(),
          analysis: {
            uiStateDescription: 'UI appears unchanged for multiple captures - may be waiting for input or stuck'
          }
        });
      }
    } else {
      if (this.consecutiveUnchangedCount > 0) {
        this.emitEvent({
          type: 'state_change_detected',
          timestamp: Date.now(),
          analysis: {
            uiStateDescription: 'UI state has changed'
          }
        });
      }
      this.consecutiveUnchangedCount = 0;
      this.lastScreenshotHash = currentHash;
    }

    return screenshot;
  }

  async captureBeforeAction(
    action: string,
    params: Record<string, unknown>
  ): Promise<CapturedScreenshot | null> {
    const description = `Before ${action}: ${JSON.stringify(params).substring(0, 100)}`;
    return this.captureAndAnalyze('before_action', description);
  }

  async captureAfterAction(
    action: string,
    params: Record<string, unknown>,
    success: boolean
  ): Promise<CapturedScreenshot | null> {
    await this.delay(50);

    const description = `After ${action} (${success ? 'success' : 'failed'}): ${JSON.stringify(params).substring(0, 100)}`;
    const screenshot = await this.captureAndAnalyze('after_action', description);

    this.addToHistory({
      action,
      timestamp: Date.now(),
      success,
      screenshotTaken: !!screenshot,
      description
    });

    return screenshot;
  }

  async captureOnError(error: string, action?: string): Promise<CapturedScreenshot | null> {
    const screenshot = await this.captureAndAnalyze('error', `Error: ${error}`);
    
    this.emitEvent({
      type: 'error_detected',
      timestamp: Date.now(),
      screenshot: screenshot || undefined,
      error
    });

    if (action) {
      this.addToHistory({
        action,
        timestamp: Date.now(),
        success: false,
        screenshotTaken: !!screenshot,
        description: `Error during ${action}: ${error}`
      });
    }

    return screenshot;
  }

    async verifyActionResult(
      expectedState: string,
      maxWaitMs: number = 1000,
      checkIntervalMs: number = 200
    ): Promise<{ verified: boolean; screenshot: CapturedScreenshot | null; analysis?: AIGuidanceResponse }> {
      const startTime = Date.now();
      let lastScreenshot: CapturedScreenshot | null = null;

      while (Date.now() - startTime < maxWaitMs) {
        const screenshot = await this.captureAndAnalyze('verification', `Verifying: ${expectedState}`);
        lastScreenshot = screenshot;
        
        if (screenshot && this.aiAnalysisEndpoint) {
          const analysisPromise = this.requestAIGuidance(screenshot, `Verify: ${expectedState}`);
          const analysis = await Promise.race([
            analysisPromise,
            this.delay(300).then(() => null)
          ]);
          
          if (analysis && analysis.verificationResult?.actionSucceeded) {
            this.emitEvent({
              type: 'verification_passed',
              timestamp: Date.now(),
              screenshot,
              analysis
            });
            return { verified: true, screenshot, analysis };
          }
        }

        await this.delay(checkIntervalMs);
      }

      this.emitEvent({
        type: 'verification_failed',
        timestamp: Date.now(),
        screenshot: lastScreenshot || undefined,
        error: `Verification timed out`
      });

      return { verified: false, screenshot: lastScreenshot };
    }

  async requestAIGuidance(
    screenshot: CapturedScreenshot,
    additionalContext?: string
  ): Promise<AIGuidanceResponse | null> {
    if (!this.aiAnalysisEndpoint || !this.aiApiKey) {
      console.warn('[RealtimeLoop] AI analysis not configured');
      return null;
    }

    this.emitEvent({
      type: 'ai_analysis_started',
      timestamp: Date.now(),
      screenshot
    });

    try {
      const request: AIGuidanceRequest = {
        screenshot: screenshot.base64,
        currentTask: this.currentTaskContext?.task || 'Unknown task',
        stepIndex: this.currentTaskContext?.stepIndex || 0,
        totalSteps: this.currentTaskContext?.totalSteps || 0,
        previousActions: this.actionHistory.slice(-5),
        errorContext: additionalContext
      };

      const systemPrompt = `You are an AI vision assistant helping automate desktop tasks. Analyze the screenshot and provide guidance.

Your response MUST be valid JSON with this structure:
{
  "shouldProceed": boolean,
  "confidence": number (0-1),
  "suggestedAction": { "action": string, "params": object, "reasoning": string, "targetElement": string } | null,
  "verificationResult": { "actionSucceeded": boolean, "stateChanged": boolean, "expectedVsActual": string } | null,
  "errorDetected": boolean,
  "errorDescription": string | null,
  "uiStateDescription": string,
  "detectedElements": [{ "type": string, "label": string, "approximatePosition": { "x": number, "y": number }, "visible": boolean, "interactable": boolean }]
}

Current Task: ${request.currentTask}
Step ${request.stepIndex + 1} of ${request.totalSteps}
${additionalContext ? `Additional Context: ${additionalContext}` : ''}

Previous Actions:
${request.previousActions.map(a => `- ${a.description} (${a.success ? 'success' : 'failed'})`).join('\n')}`;

      const cleanedBase64 = screenshot.base64.replace(/^data:image\/\w+;base64,/, '');

      const response = await fetch(this.aiAnalysisEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.aiApiKey}`
        },
        body: JSON.stringify({
          model: this.aiModel,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/png;base64,${cleanedBase64}`,
                    detail: 'high'
                  }
                },
                {
                  type: 'text',
                  text: 'Analyze this screenshot and provide guidance for the current automation task.'
                }
              ]
            }
          ],
          max_tokens: 2000,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        throw new Error(`AI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error('Empty AI response');
      }

      const analysis: AIGuidanceResponse = JSON.parse(content);

      this.emitEvent({
        type: 'ai_analysis_completed',
        timestamp: Date.now(),
        screenshot,
        analysis
      });

      this.emitAIAnalysis(screenshot, analysis);

      return analysis;
    } catch (error) {
      console.error('[RealtimeLoop] AI analysis failed:', error);
      return null;
    }
  }

  getLatestVisualContext(): AIVisualContext {
    const recentScreenshots = screenshotService.getRecentScreenshots(5);
    const latest = screenshotService.getLatestScreenshot();

    return {
      currentScreenshot: latest?.base64 || null,
      recentHistory: recentScreenshots.map(s => ({
        trigger: s.trigger,
        description: s.stepDescription || s.trigger,
        timestamp: s.timestamp,
        hasError: s.trigger === 'error'
      })),
      uiStateSummary: this.generateUIStateSummary(),
      detectedErrors: this.getRecentErrors(),
      suggestedNextAction: undefined
    };
  }

  getActionHistory(): ActionHistoryEntry[] {
    return [...this.actionHistory];
  }

  clearHistory() {
    this.actionHistory = [];
    this.lastScreenshotHash = '';
    this.consecutiveUnchangedCount = 0;
  }

  private addToHistory(entry: ActionHistoryEntry) {
    this.actionHistory.push(entry);
    if (this.actionHistory.length > this.maxHistorySize) {
      this.actionHistory.shift();
    }
  }

  private generateUIStateSummary(): string {
    const latest = screenshotService.getLatestScreenshot();
    if (!latest) return 'No screenshots captured';

    const recentErrors = this.getRecentErrors();
    const unchangedNote = this.consecutiveUnchangedCount > 0 
      ? ` (UI unchanged for ${this.consecutiveUnchangedCount} captures)` 
      : '';

    return `Last capture: ${latest.stepDescription || latest.trigger}${unchangedNote}` +
      (recentErrors.length > 0 ? ` | Errors: ${recentErrors.length}` : '');
  }

  private getRecentErrors(): string[] {
    return this.actionHistory
      .filter(a => !a.success)
      .slice(-3)
      .map(a => a.description);
  }

  private computeSimpleHash(base64: string): string {
    const sample = base64.substring(100, 600);
    let hash = 0;
    for (let i = 0; i < sample.length; i++) {
      const char = sample.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  get running(): boolean {
    return this.isRunning;
  }
}

export const realtimeScreenshotLoop = new RealtimeScreenshotLoop();
export default realtimeScreenshotLoop;
