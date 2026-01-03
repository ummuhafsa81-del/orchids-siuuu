import { getAgentClient, AgentCommand, AgentResponse } from './agentClient';
import { screenshotService, CapturedScreenshot, AIVisionAnalysisConfig, AIVisionAnalysisResult } from './screenshotService';
import { realtimeScreenshotLoop } from './realtimeScreenshotLoop';

export interface ExecutionResult {
  success: boolean;
  response: AgentResponse;
  beforeScreenshot?: CapturedScreenshot | null;
  afterScreenshot?: CapturedScreenshot | null;
  errorScreenshot?: CapturedScreenshot | null;
  aiAnalysisBefore?: AIVisionAnalysisResult | null;
  aiAnalysisAfter?: AIVisionAnalysisResult | null;
  duration: number;
  mandatoryScreenshotsTaken: boolean;
}

export interface ExecutionOptions {
  taskId?: string;
  stepDescription?: string;
  captureScreenshots?: boolean;
  verifyAfterAction?: boolean;
  onScreenshot?: (screenshot: CapturedScreenshot, phase: 'before' | 'after' | 'error') => void;
  mandatoryScreenshots?: boolean;
  aiConfig?: AIVisionAnalysisConfig;
  sendToAI?: boolean;
  onAIAnalysis?: (analysis: AIVisionAnalysisResult | null, phase: 'before' | 'after') => void;
}

class AutomationExecutor {
  private defaultOptions: ExecutionOptions = {
    captureScreenshots: false,
    verifyAfterAction: false,
    mandatoryScreenshots: false,
    sendToAI: false
  };
  
  private aiConfig: AIVisionAnalysisConfig | null = null;
  private previousActions: string[] = [];

  setAIConfig(config: AIVisionAnalysisConfig) {
    this.aiConfig = config;
    realtimeScreenshotLoop.setAIConfig(config.endpoint, config.apiKey, config.model);
  }

  async executeWithScreenshots(
    command: AgentCommand,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const opts = { ...this.defaultOptions, ...options };
    const startTime = Date.now();
    const client = getAgentClient();
    const effectiveAiConfig = opts.aiConfig || this.aiConfig;

    let beforeScreenshot: CapturedScreenshot | null = null;
    let afterScreenshot: CapturedScreenshot | null = null;
    let errorScreenshot: CapturedScreenshot | null = null;
    let aiAnalysisBefore: AIVisionAnalysisResult | null = null;
    let aiAnalysisAfter: AIVisionAnalysisResult | null = null;
    let mandatoryScreenshotsTaken = false;

    try {
      if (opts.captureScreenshots || opts.mandatoryScreenshots) {
        if (command.action === 'click' || command.action === 'doubleclick' || command.action === 'rightclick') {
          beforeScreenshot = await screenshotService.captureBeforeClick(
            command.x || 0, 
            command.y || 0, 
            opts.taskId
          );
        } else {
          beforeScreenshot = await screenshotService.captureBeforeAction(
            command.action,
            this.extractParams(command),
            opts.taskId
          );
        }

        if (beforeScreenshot) {
          mandatoryScreenshotsTaken = true;
          if (opts.onScreenshot) {
            opts.onScreenshot(beforeScreenshot, 'before');
          }

          if (opts.sendToAI && effectiveAiConfig) {
            aiAnalysisBefore = await screenshotService.analyzeWithAI(
              beforeScreenshot,
              effectiveAiConfig,
              {
                currentTask: opts.stepDescription || command.action,
                previousActions: this.previousActions.slice(-5)
              }
            );
            
            if (opts.onAIAnalysis) {
              opts.onAIAnalysis(aiAnalysisBefore, 'before');
            }
          }
        }
      }

      const response = await client.execute(command);

      if (opts.captureScreenshots || opts.mandatoryScreenshots) {
        if (response.success) {
          if (command.action === 'click' || command.action === 'doubleclick' || command.action === 'rightclick') {
            afterScreenshot = await screenshotService.captureAfterClick(
              command.x || 0,
              command.y || 0,
              opts.taskId,
              response.success
            );
          } else {
            afterScreenshot = await screenshotService.captureAfterAction(
              command.action,
              this.extractParams(command),
              opts.taskId,
              response.success
            );
          }

          if (afterScreenshot) {
            mandatoryScreenshotsTaken = true;
            if (opts.onScreenshot) {
              opts.onScreenshot(afterScreenshot, 'after');
            }

            if (opts.sendToAI && effectiveAiConfig) {
              aiAnalysisAfter = await screenshotService.analyzeWithAI(
                afterScreenshot,
                effectiveAiConfig,
                {
                  currentTask: opts.stepDescription || command.action,
                  previousActions: this.previousActions.slice(-5)
                }
              );
              
              if (opts.onAIAnalysis) {
                opts.onAIAnalysis(aiAnalysisAfter, 'after');
              }
            }
          }
        } else {
          errorScreenshot = await screenshotService.captureOnError(
            response.error || 'Unknown error',
            opts.taskId,
            command.action
          );

          mandatoryScreenshotsTaken = !!errorScreenshot;
          if (errorScreenshot && opts.onScreenshot) {
            opts.onScreenshot(errorScreenshot, 'error');
          }
        }
      }

      const actionDescription = `${command.action}: ${opts.stepDescription || JSON.stringify(this.extractParams(command)).substring(0, 50)}`;
      this.previousActions.push(`${actionDescription} (${response.success ? 'success' : 'failed'})`);
      if (this.previousActions.length > 20) {
        this.previousActions.shift();
      }

      return {
        success: response.success,
        response,
        beforeScreenshot,
        afterScreenshot,
        errorScreenshot,
        aiAnalysisBefore,
        aiAnalysisAfter,
        duration: Date.now() - startTime,
        mandatoryScreenshotsTaken
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (opts.captureScreenshots || opts.mandatoryScreenshots) {
        errorScreenshot = await screenshotService.captureOnError(
          errorMessage,
          opts.taskId,
          command.action
        );

        mandatoryScreenshotsTaken = !!errorScreenshot;
        if (errorScreenshot && opts.onScreenshot) {
          opts.onScreenshot(errorScreenshot, 'error');
        }
      }

      return {
        success: false,
        response: { success: false, error: errorMessage },
        beforeScreenshot,
        afterScreenshot: null,
        errorScreenshot,
        aiAnalysisBefore,
        aiAnalysisAfter: null,
        duration: Date.now() - startTime,
        mandatoryScreenshotsTaken
      };
    }
  }

  async executeClick(
    x: number, 
    y: number, 
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    return this.executeWithScreenshots(
      { action: 'click', x, y },
      { ...options, stepDescription: options.stepDescription || `Click at (${x}, ${y})` }
    );
  }

  async executeDoubleClick(
    x: number, 
    y: number, 
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    return this.executeWithScreenshots(
      { action: 'doubleclick', x, y },
      { ...options, stepDescription: options.stepDescription || `Double-click at (${x}, ${y})` }
    );
  }

  async executeRightClick(
    x: number, 
    y: number, 
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    return this.executeWithScreenshots(
      { action: 'rightclick', x, y },
      { ...options, stepDescription: options.stepDescription || `Right-click at (${x}, ${y})` }
    );
  }

  async executeType(
    text: string, 
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    return this.executeWithScreenshots(
      { action: 'type', text },
      { ...options, stepDescription: options.stepDescription || `Type: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"` }
    );
  }

  async executeHotkey(
    keys: string, 
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    return this.executeWithScreenshots(
      { action: 'hotkey', keys },
      { ...options, stepDescription: options.stepDescription || `Hotkey: ${keys}` }
    );
  }

  async executeRun(
    command: string, 
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    return this.executeWithScreenshots(
      { action: 'run', command },
      { ...options, stepDescription: options.stepDescription || `Run: ${command.substring(0, 50)}${command.length > 50 ? '...' : ''}` }
    );
  }

  async executeOpenUrl(
    url: string, 
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    return this.executeWithScreenshots(
      { action: 'openUrl', url },
      { ...options, stepDescription: options.stepDescription || `Open URL: ${url}` }
    );
  }

  async executeWait(
    ms: number, 
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    return this.executeWithScreenshots(
      { action: 'wait', ms },
      { ...options, stepDescription: options.stepDescription || `Wait ${ms}ms`, captureScreenshots: false }
    );
  }

  async captureCurrentState(taskId?: string, description?: string): Promise<CapturedScreenshot | null> {
    return screenshotService.captureForVerification(
      description || 'Current state verification',
      taskId
    );
  }

  async executeSequence(
    commands: Array<{ command: AgentCommand; options?: ExecutionOptions }>,
    sequenceOptions: {
      stopOnError?: boolean;
      delayBetweenCommands?: number;
      taskId?: string;
      onProgress?: (index: number, total: number, result: ExecutionResult) => void;
    } = {}
  ): Promise<{
    results: ExecutionResult[];
    allSucceeded: boolean;
    failedIndex?: number;
  }> {
    const results: ExecutionResult[] = [];
    let failedIndex: number | undefined;

      // Start continuous real-time capture during sequence execution (less frequent)
      screenshotService.startContinuousCapture(10000);

    try {
      for (let i = 0; i < commands.length; i++) {
        const { command, options } = commands[i];
        
        const result = await this.executeWithScreenshots(command, {
          ...options,
          taskId: sequenceOptions.taskId || options?.taskId
        });

        results.push(result);

        if (sequenceOptions.onProgress) {
          sequenceOptions.onProgress(i, commands.length, result);
        }

        if (!result.success) {
          failedIndex = i;
          if (sequenceOptions.stopOnError !== false) {
            break;
          }
        }

        if (sequenceOptions.delayBetweenCommands && i < commands.length - 1) {
          await this.delay(sequenceOptions.delayBetweenCommands);
        }
      }
    } finally {
      // Always stop continuous capture when sequence ends
      screenshotService.stopContinuousCapture();
    }

    return {
      results,
      allSucceeded: results.every(r => r.success),
      failedIndex
    };
  }

  private extractParams(command: AgentCommand): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    if (command.x !== undefined) params.x = command.x;
    if (command.y !== undefined) params.y = command.y;
    if (command.text) params.text = command.text;
    if (command.keys) params.keys = command.keys;
    if (command.command) params.command = command.command;
    if (command.url) params.url = command.url;
    if (command.path) params.path = command.path;
    if (command.ms) params.ms = command.ms;
    return params;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const automationExecutor = new AutomationExecutor();
export default automationExecutor;
