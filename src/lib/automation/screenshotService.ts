import { getAgentClient, AgentResponse } from './agentClient';
import { supabase } from '../supabase';

export type ScreenshotTrigger = 
  | 'before_click' 
  | 'after_click' 
  | 'before_action'
  | 'after_action'
  | 'state_change' 
  | 'error' 
  | 'verification'
  | 'task_start'
  | 'task_complete'
  | 'manual'
  | 'element_hover'
  | 'scroll'
  | 'focus_change'
  | 'dom_mutation';

export interface CapturedScreenshot {
  id: string;
  base64: string;
  trigger: ScreenshotTrigger;
  timestamp: number;
  taskId?: string;
  stepDescription?: string;
  metadata?: Record<string, unknown>;
  uploaded?: boolean;
  url?: string;
  aiAnalysis?: AIScreenshotAnalysis;
}

export interface AIScreenshotAnalysis {
  uiState: string;
  detectedElements: DetectedElement[];
  suggestedActions: string[];
  confidence: number;
  errorDetected: boolean;
  errorDescription?: string;
}

export interface DetectedElement {
  type: string;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  clickable: boolean;
  visible: boolean;
}

export interface ScreenshotContext {
  screenshots: CapturedScreenshot[];
  latestScreenshot: CapturedScreenshot | null;
  getBase64ForAI: () => string | null;
  getContextSummary: () => string;
}

export interface AIVisualContext {
  currentScreenshot: string | null;
  recentHistory: ScreenshotHistoryEntry[];
  uiStateSummary: string;
  detectedErrors: string[];
  suggestedNextAction?: string;
}

export interface AIVisionAnalysisConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
}

export interface AIVisionAnalysisResult {
  uiState: string;
  detectedElements: {
    type: string;
    label: string;
    position: { x: number; y: number; width?: number; height?: number };
    clickable: boolean;
    visible: boolean;
    confidence: number;
  }[];
  suggestedActions: {
    action: string;
    target?: string;
    params?: Record<string, unknown>;
    reasoning: string;
    priority: number;
  }[];
  errors: {
    detected: boolean;
    description?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
  };
  stateVerification?: {
    expectedState?: string;
    actualState: string;
    matches: boolean;
  };
  confidence: number;
  rawResponse?: string;
}

export interface ScreenshotHistoryEntry {
  trigger: ScreenshotTrigger;
  description: string;
  timestamp: number;
  hasError: boolean;
}

type ScreenshotCallback = (screenshot: CapturedScreenshot, phase?: 'before' | 'after' | 'error' | 'state_change') => void;
type AIContextCallback = (context: AIVisualContext) => void;

class ScreenshotService {
    private screenshots: CapturedScreenshot[] = [];
    private maxScreenshots = 20;
    private isCapturing = false;
    private listeners: Set<ScreenshotCallback> = new Set();
    private aiContextListeners: Set<AIContextCallback> = new Set();
    private userEmail: string | null = null;
    private sessionId: string | null = null;
    private captureInterval: number | null = null;
    private stateChangeDebounce: number | null = null;
    private lastUIState: string = '';
    private autoCaptureEnabled = false;
    private domObserver: MutationObserver | null = null;
    private screenshotCache: { base64: string; timestamp: number } | null = null;
    private cacheMaxAge = 300;

  setUserContext(email: string, sessionId?: string) {
    this.userEmail = email.toLowerCase().trim();
    this.sessionId = sessionId || null;
  }

  enableAutoCapture(options: {
    captureOnDomMutation?: boolean;
    captureOnScroll?: boolean;
    captureOnFocusChange?: boolean;
    debounceMs?: number;
  } = {}) {
    this.autoCaptureEnabled = true;
    const debounceMs = options.debounceMs || 500;

    if (options.captureOnDomMutation) {
      this.setupDomObserver(debounceMs);
    }

    if (options.captureOnScroll) {
      window.addEventListener('scroll', this.createDebouncedHandler(() => {
        this.captureOnStateChange('Scroll event detected');
      }, debounceMs), { passive: true });
    }

    if (options.captureOnFocusChange) {
      document.addEventListener('focusin', this.createDebouncedHandler((e: Event) => {
        const target = e.target as HTMLElement;
        this.captureOnStateChange(`Focus changed to ${target.tagName} ${target.id || target.className || ''}`);
      }, debounceMs));
    }
  }

  disableAutoCapture() {
    this.autoCaptureEnabled = false;
    if (this.domObserver) {
      this.domObserver.disconnect();
      this.domObserver = null;
    }
  }

  private setupDomObserver(debounceMs: number) {
    if (this.domObserver) return;

    const debouncedCapture = this.createDebouncedHandler(() => {
      this.captureOnStateChange('DOM mutation detected');
    }, debounceMs);

    this.domObserver = new MutationObserver(() => {
      if (this.autoCaptureEnabled) {
        debouncedCapture();
      }
    });

    this.domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'disabled']
    });
  }

  private createDebouncedHandler<T extends (...args: any[]) => void>(fn: T, delay: number): T {
    let timeoutId: number | null = null;
    return ((...args: Parameters<T>) => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => fn(...args), delay);
    }) as T;
  }

  startContinuousCapture(intervalMs: number = 5000) {
    if (this.captureInterval) return;
    
    this.captureInterval = window.setInterval(async () => {
      if (getAgentClient().connected && !this.isCapturing) {
        await this.captureScreenshot('manual', {
          stepDescription: 'Real-time background capture',
          uploadToStorage: true,
          sendToAI: true
        });
      }
    }, intervalMs);
  }

  stopContinuousCapture() {
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }
  }

  addListener(callback: ScreenshotCallback) {
    this.listeners.add(callback);
  }

  removeListener(callback: ScreenshotCallback) {
    this.listeners.delete(callback);
  }

  addAIContextListener(callback: AIContextCallback) {
    this.aiContextListeners.add(callback);
  }

  removeAIContextListener(callback: AIContextCallback) {
    this.aiContextListeners.delete(callback);
  }

  private notifyListeners(screenshot: CapturedScreenshot, phase?: 'before' | 'after' | 'error' | 'state_change') {
    this.listeners.forEach(cb => cb(screenshot, phase));
  }

  private notifyAIContextListeners() {
    const context = this.buildAIVisualContext();
    this.aiContextListeners.forEach(cb => cb(context));
  }

    async captureScreenshot(
      trigger: ScreenshotTrigger,
      options: {
        taskId?: string;
        stepDescription?: string;
        metadata?: Record<string, unknown>;
        uploadToStorage?: boolean;
        useCache?: boolean;
      } = {}
    ): Promise<CapturedScreenshot | null> {
      const now = Date.now();
      
      if (options.useCache !== false && this.screenshotCache && (now - this.screenshotCache.timestamp) < this.cacheMaxAge) {
        const cached: CapturedScreenshot = {
          id: `ss_${now}_${Math.random().toString(36).substr(2, 9)}`,
          base64: this.screenshotCache.base64,
          trigger,
          timestamp: now,
          taskId: options.taskId,
          stepDescription: options.stepDescription,
          metadata: { ...options.metadata, cached: true },
          uploaded: false
        };
        return cached;
      }

      if (this.isCapturing) return null;
      this.isCapturing = true;

      try {
        const client = getAgentClient();
        if (!client.connected) {
          return null;
        }

        const response: AgentResponse = await Promise.race([
          client.execute({ action: 'screenshot' }),
          new Promise<AgentResponse>((_, reject) => 
            setTimeout(() => reject(new Error('Screenshot timeout')), 500)
          )
        ]);

        if (!response.success || !response.screenshot) {
          return null;
        }

        const screenshot: CapturedScreenshot = {
          id: `ss_${now}_${Math.random().toString(36).substr(2, 9)}`,
          base64: response.screenshot,
          trigger,
          timestamp: now,
          taskId: options.taskId,
          stepDescription: options.stepDescription,
          metadata: options.metadata,
          uploaded: false
        };

        this.screenshotCache = { base64: response.screenshot, timestamp: now };

        this.screenshots.push(screenshot);
        if (this.screenshots.length > this.maxScreenshots) {
          this.screenshots.shift();
        }

        if (options.uploadToStorage && this.userEmail) {
          this.uploadScreenshot(screenshot).catch(() => {});
        }

        this.notifyListeners(screenshot);
        return screenshot;
      } catch {
        return null;
      } finally {
        this.isCapturing = false;
      }
    }

  async captureBeforeClick(x: number, y: number, taskId?: string): Promise<CapturedScreenshot | null> {
    return this.captureScreenshot('before_click', {
      taskId,
      stepDescription: `Before click at (${x}, ${y})`,
      metadata: { x, y, action: 'click' }
    });
  }

    async captureAfterClick(x: number, y: number, taskId?: string, success?: boolean): Promise<CapturedScreenshot | null> {
      await this.delay(20);
      return this.captureScreenshot('after_click', {
        taskId,
        stepDescription: `After click at (${x}, ${y})`,
        metadata: { x, y, action: 'click', success },
        useCache: false
      });
    }

    async captureBeforeAction(action: string, params: Record<string, unknown>, taskId?: string): Promise<CapturedScreenshot | null> {
      return this.captureScreenshot('before_action', {
        taskId,
        stepDescription: `Before ${action}`,
        metadata: { action, params }
      });
    }

    async captureAfterAction(action: string, params: Record<string, unknown>, taskId?: string, success?: boolean): Promise<CapturedScreenshot | null> {
      await this.delay(30);
      return this.captureScreenshot('after_action', {
        taskId,
        stepDescription: `After ${action}`,
        metadata: { action, params, success },
        useCache: false
      });
    }

  async captureOnError(error: string, taskId?: string, action?: string): Promise<CapturedScreenshot | null> {
    return this.captureScreenshot('error', {
      taskId,
      stepDescription: `Error: ${error}`,
      metadata: { error, action },
      uploadToStorage: true
    });
  }

  async captureOnStateChange(description: string, taskId?: string): Promise<CapturedScreenshot | null> {
    return this.captureScreenshot('state_change', {
      taskId,
      stepDescription: description,
      metadata: { stateChange: true }
    });
  }

  async captureForVerification(description: string, taskId?: string): Promise<CapturedScreenshot | null> {
    return this.captureScreenshot('verification', {
      taskId,
      stepDescription: description,
      metadata: { verification: true }
    });
  }

  async captureTaskStart(taskId: string, taskDescription: string): Promise<CapturedScreenshot | null> {
    return this.captureScreenshot('task_start', {
      taskId,
      stepDescription: `Starting: ${taskDescription}`,
      metadata: { taskStart: true }
    });
  }

  async captureTaskComplete(taskId: string, taskDescription: string, success: boolean): Promise<CapturedScreenshot | null> {
    return this.captureScreenshot('task_complete', {
      taskId,
      stepDescription: `Completed: ${taskDescription}`,
      metadata: { taskComplete: true, success },
      uploadToStorage: true
    });
  }

  private async uploadScreenshot(screenshot: CapturedScreenshot): Promise<string | null> {
    if (!this.userEmail) return null;

    try {
      const base64Data = screenshot.base64.replace(/^data:image\/\w+;base64,/, '');
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'image/png' });

      const safeEmail = this.userEmail.replace(/[^a-z0-9]/g, '_');
      const filename = `screenshots/${safeEmail}/${screenshot.id}.png`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('execution-screenshots')
        .upload(filename, blob, {
          contentType: 'image/png',
          cacheControl: '3600',
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        return null;
      }

      const { data: urlData } = supabase.storage
        .from('execution-screenshots')
        .getPublicUrl(uploadData.path);

      await supabase.from('execution_screenshots').insert({
        user_email: this.userEmail,
        session_id: this.sessionId,
        screenshot_url: urlData.publicUrl,
        task_description: screenshot.stepDescription,
        execution_state: screenshot.trigger === 'error' ? 'failed' : 'in_progress',
        metadata: {
          trigger: screenshot.trigger,
          ...screenshot.metadata
        }
      });

      screenshot.uploaded = true;
      screenshot.url = urlData.publicUrl;
      return urlData.publicUrl;
    } catch (error) {
      console.error('Screenshot upload failed:', error);
      return null;
    }
  }

    getLatestScreenshot(): CapturedScreenshot | null {
      return this.screenshots.length > 0 
        ? this.screenshots[this.screenshots.length - 1] 
        : null;
    }

    async captureFullPage(): Promise<string | null> {
      const now = Date.now();
      if (this.screenshotCache && (now - this.screenshotCache.timestamp) < this.cacheMaxAge) {
        return this.screenshotCache.base64;
      }
      
      const screenshot = await this.captureScreenshot('manual', { useCache: false });
      return screenshot?.base64 || null;
    }

  getScreenshotsByTask(taskId: string): CapturedScreenshot[] {
    return this.screenshots.filter(s => s.taskId === taskId);
  }

  getRecentScreenshots(count: number = 5): CapturedScreenshot[] {
    return this.screenshots.slice(-count);
  }

  getBase64ForAI(): string | null {
    const latest = this.getLatestScreenshot();
    return latest?.base64 || null;
  }

  getContextForAI(includeRecent: number = 3): {
    current: string | null;
    history: { trigger: ScreenshotTrigger; description: string; timestamp: number }[];
    summary: string;
  } {
    const recent = this.getRecentScreenshots(includeRecent);
    const latest = this.getLatestScreenshot();

    return {
      current: latest?.base64 || null,
      history: recent.map(s => ({
        trigger: s.trigger,
        description: s.stepDescription || s.trigger,
        timestamp: s.timestamp
      })),
      summary: this.generateContextSummary()
    };
  }

  private generateContextSummary(): string {
    if (this.screenshots.length === 0) {
      return 'No screenshots captured yet.';
    }

    const latest = this.getLatestScreenshot()!;
    const errorScreenshots = this.screenshots.filter(s => s.trigger === 'error');
    const recentActions = this.screenshots.slice(-5).map(s => s.stepDescription || s.trigger);

    let summary = `Latest screenshot: ${latest.stepDescription || latest.trigger} (${new Date(latest.timestamp).toLocaleTimeString()})`;
    
    if (errorScreenshots.length > 0) {
      summary += `\nErrors detected: ${errorScreenshots.length}`;
    }
    
    summary += `\nRecent actions: ${recentActions.join(' -> ')}`;
    
    return summary;
  }

  buildAIPromptWithScreenshot(basePrompt: string): { prompt: string; imageBase64?: string } {
    const latest = this.getLatestScreenshot();
    
    if (!latest) {
      return { prompt: basePrompt };
    }

    const contextInfo = `
[SCREENSHOT CONTEXT]
Trigger: ${latest.trigger}
Description: ${latest.stepDescription || 'N/A'}
Timestamp: ${new Date(latest.timestamp).toLocaleTimeString()}
${latest.metadata ? `Metadata: ${JSON.stringify(latest.metadata)}` : ''}

IMPORTANT: Use this screenshot to:
1. Confirm the current UI state before taking action
2. Verify element positions and visibility
3. Detect any unexpected states or errors
4. Validate previous action results
`;

    return {
      prompt: `${contextInfo}\n\n${basePrompt}`,
      imageBase64: latest.base64
    };
  }

  async analyzeWithAI(
    screenshot: CapturedScreenshot,
    config: AIVisionAnalysisConfig,
    context?: {
      currentTask?: string;
      expectedState?: string;
      previousActions?: string[];
    }
  ): Promise<AIVisionAnalysisResult | null> {
    try {
      const cleanedBase64 = screenshot.base64.replace(/^data:image\/\w+;base64,/, '');
      
      const systemPrompt = `You are an AI vision assistant for desktop automation. Analyze screenshots to help guide automation tasks.

MANDATORY: Your response MUST be valid JSON with this exact structure:
{
  "uiState": "description of what's visible on screen",
  "detectedElements": [
    {
      "type": "button|input|link|menu|dialog|text|icon|other",
      "label": "element text or description",
      "position": { "x": number, "y": number, "width": number, "height": number },
      "clickable": boolean,
      "visible": boolean,
      "confidence": 0.0-1.0
    }
  ],
  "suggestedActions": [
    {
      "action": "click|type|scroll|wait|hotkey|other",
      "target": "element description",
      "params": { "x": number, "y": number, "text": "string", "keys": "string" },
      "reasoning": "why this action",
      "priority": 1-5
    }
  ],
  "errors": {
    "detected": boolean,
    "description": "error description if any",
    "severity": "low|medium|high|critical"
  },
  "stateVerification": {
    "expectedState": "what was expected",
    "actualState": "what is actually shown",
    "matches": boolean
  },
  "confidence": 0.0-1.0
}

${context?.currentTask ? `Current Task: ${context.currentTask}` : ''}
${context?.expectedState ? `Expected State: ${context.expectedState}` : ''}
${context?.previousActions?.length ? `Previous Actions: ${context.previousActions.join(' -> ')}` : ''}

Focus on:
1. Identifying clickable elements with accurate positions
2. Detecting any errors, dialogs, or unexpected states
3. Suggesting the next best action to complete the task
4. Verifying if the expected state matches what's shown`;

      const isAnthropic = config.endpoint.includes('anthropic.com');
      const isGoogle = config.endpoint.includes('googleapis.com') || config.endpoint.includes('generativelanguage');

      let url = config.endpoint;
      let headers: Record<string, string> = { 'Content-Type': 'application/json' };
      let requestBody: any;

      if (isAnthropic) {
        url = config.endpoint.includes('/messages') ? config.endpoint : `${config.endpoint}/messages`;
        headers['x-api-key'] = config.apiKey;
        headers['anthropic-version'] = '2023-06-01';
        requestBody = {
          model: config.model.replace('anthropic/', ''),
          max_tokens: config.maxTokens || 2000,
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: cleanedBase64
                }
              },
              {
                type: 'text',
                text: 'Analyze this screenshot and provide guidance in JSON format.'
              }
            ]
          }]
        };
      } else if (isGoogle) {
        const modelName = config.model.replace('google/', '');
        url = `${config.endpoint}/models/${modelName}:generateContent?key=${config.apiKey}`;
        requestBody = {
          contents: [{
            parts: [
              { text: `${systemPrompt}\n\nAnalyze this screenshot and provide guidance in JSON format.` },
              {
                inline_data: {
                  mime_type: 'image/png',
                  data: cleanedBase64
                }
              }
            ]
          }],
          generationConfig: { maxOutputTokens: config.maxTokens || 2000 }
        };
      } else {
        url = config.endpoint.includes('/chat/completions') ? config.endpoint : `${config.endpoint}/chat/completions`;
        headers['Authorization'] = `Bearer ${config.apiKey}`;
        requestBody = {
          model: config.model,
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
                  text: 'Analyze this screenshot and provide guidance in JSON format.'
                }
              ]
            }
          ],
          max_tokens: config.maxTokens || 2000,
          response_format: { type: 'json_object' }
        };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        console.error('[ScreenshotService] AI analysis failed:', response.status);
        return null;
      }

      const data = await response.json();
      let content: string;

      if (isAnthropic) {
        content = data.content?.[0]?.text || '';
      } else if (isGoogle) {
        content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else {
        content = data.choices?.[0]?.message?.content || '';
      }

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[ScreenshotService] Could not parse JSON from AI response');
        return null;
      }

      const result: AIVisionAnalysisResult = JSON.parse(jsonMatch[0]);
      result.rawResponse = content;
      
      screenshot.aiAnalysis = {
        uiState: result.uiState,
        detectedElements: result.detectedElements.map(e => ({
          type: e.type,
          label: e.label,
          bounds: { x: e.position.x, y: e.position.y, width: e.position.width || 0, height: e.position.height || 0 },
          clickable: e.clickable,
          visible: e.visible
        })),
        suggestedActions: result.suggestedActions.map(a => `${a.action}: ${a.target || ''}`),
        confidence: result.confidence,
        errorDetected: result.errors.detected,
        errorDescription: result.errors.description
      };

      return result;
    } catch (error) {
      console.error('[ScreenshotService] AI analysis error:', error);
      return null;
    }
  }

  async captureAndAnalyze(
    trigger: ScreenshotTrigger,
    config: AIVisionAnalysisConfig,
    options: {
      taskId?: string;
      stepDescription?: string;
      expectedState?: string;
      previousActions?: string[];
    } = {}
  ): Promise<{ screenshot: CapturedScreenshot | null; analysis: AIVisionAnalysisResult | null }> {
    const screenshot = await this.captureScreenshot(trigger, {
      taskId: options.taskId,
      stepDescription: options.stepDescription,
      uploadToStorage: true
    });

    if (!screenshot) {
      return { screenshot: null, analysis: null };
    }

    const analysis = await this.analyzeWithAI(screenshot, config, {
      currentTask: options.taskId,
      expectedState: options.expectedState,
      previousActions: options.previousActions
    });

    return { screenshot, analysis };
  }

  buildMandatoryScreenshotContext(action: string, params: Record<string, unknown>): {
    beforeCapture: () => Promise<CapturedScreenshot | null>;
    afterCapture: (success: boolean) => Promise<CapturedScreenshot | null>;
    errorCapture: (error: string) => Promise<CapturedScreenshot | null>;
  } {
    return {
      beforeCapture: async () => {
        return this.captureScreenshot('before_action', {
          stepDescription: `Before ${action}`,
          metadata: { action, params, phase: 'before' },
          uploadToStorage: false
        });
      },
      afterCapture: async (success: boolean) => {
        await this.delay(50);
        return this.captureScreenshot('after_action', {
          stepDescription: `After ${action} (${success ? 'success' : 'failed'})`,
          metadata: { action, params, phase: 'after', success },
          uploadToStorage: false
        });
      },
      errorCapture: async (error: string) => {
        return this.captureScreenshot('error', {
          stepDescription: `Error during ${action}: ${error}`,
          metadata: { action, params, phase: 'error', error },
          uploadToStorage: true
        });
      }
    };
  }

  clearScreenshots() {
    this.screenshots = [];
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const screenshotService = new ScreenshotService();
export default screenshotService;
