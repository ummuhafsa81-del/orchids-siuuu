import { domStateCapture, DOMStateSnapshot, PageState } from './domStateCapture';
import { screenshotService } from './screenshotService';
import { aiPlanManager, AIPlan, PlanStep } from './aiPlanManager';

export interface PlanGenerationConfig {
  aiEndpoint: string;
  aiApiKey: string;
  aiModel: string;
  maxSteps?: number;
  maxRetries?: number;
  generateVerification?: boolean;
}

export interface GeneratedStep {
  action: string;
  description: string;
  params: Record<string, unknown>;
  target?: string;
  value?: string;
  expectedOutcome: string;
  reasoning: string;
}

export interface PlanGenerationResult {
  success: boolean;
  plan?: AIPlan;
  steps?: GeneratedStep[];
  error?: string;
  reasoning?: string;
  totalTokensUsed?: number;
}

interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | AIMessageContent[];
}

interface AIMessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail: string };
}

const SYSTEM_PROMPT = `You are an expert automation planning agent. Your task is to create comprehensive, step-by-step automation plans that achieve the user's goal.

CRITICAL RULES:
1. ALWAYS generate the COMPLETE plan with ALL steps needed to achieve the goal
2. NEVER stop early or leave steps incomplete
3. Each step must have clear verification criteria
4. Steps must be atomic and verifiable
5. Include error handling considerations
6. Plan for common edge cases

For each step, provide:
- action: The automation action type (click, type, navigate, wait, scroll, screenshot, verify)
- description: Clear human-readable description
- params: Parameters for the action (selector, text, url, etc.)
- verification: How to verify the step succeeded
- expectedOutcome: What should happen after this step
- reasoning: Why this step is needed

AVAILABLE ACTIONS:
- click: Click an element (params: { x, y } or { selector })
- type: Type text into an element (params: { text, selector? })
- navigate: Go to a URL (params: { url })
- wait: Wait for something (params: { ms } or { selector })
- scroll: Scroll the page (params: { x?, y?, selector? })
- screenshot: Capture current state
- hotkey: Press keyboard shortcut (params: { keys })
- verify: Check a condition (params: { selector?, text? })

VERIFICATION CRITERIA TYPES:
- element_exists: Check if selector exists
- element_not_exists: Check if selector is gone
- text_visible: Check if text is visible
- text_not_visible: Check if text is hidden
- url_contains: Check URL contains string
- url_equals: Check exact URL match
- element_has_value: Check input value
- dom_changed: Check if DOM changed

RESPOND WITH VALID JSON:
{
  "success": true,
  "reasoning": "Overall plan reasoning",
  "steps": [
    {
      "action": "string",
      "description": "string",
      "params": {},
      "verification": [{ "type": "...", "selector?": "...", "text?": "..." }],
      "expectedOutcome": "string",
      "reasoning": "string"
    }
  ]
}`;

class AIPlanningAgent {
  private config: PlanGenerationConfig | null = null;

  configure(config: PlanGenerationConfig) {
    this.config = config;
  }

  async generatePlan(
    goal: string,
    options?: {
      includeScreenshot?: boolean;
      includeDOMState?: boolean;
      additionalContext?: string;
    }
  ): Promise<PlanGenerationResult> {
    if (!this.config) {
      return { success: false, error: 'Planning agent not configured' };
    }

    try {
      const context = await this.gatherContext(options);
      const messages = this.buildMessages(goal, context, options?.additionalContext);
      
      const response = await this.callAI(messages);
      
      if (!response.success) {
        return { success: false, error: response.error };
      }

      const parsed = this.parseResponse(response.content!);
      
      if (!parsed.success || !parsed.steps || parsed.steps.length === 0) {
        return { 
          success: false, 
          error: parsed.error || 'No steps generated',
          reasoning: parsed.reasoning 
        };
      }

      const plan = aiPlanManager.createPlan(goal.substring(0, 100), goal, `AI-generated plan: ${goal}`);
      
      parsed.steps.forEach((step, index) => {
        aiPlanManager.addStep(plan.id, {
          description: step.description,
          action: this.mapActionType(step.action),
          target: step.target || step.params?.selector as string,
          value: step.value || step.params?.text as string || step.params?.url as string,
          order: index
        });
      });

      return {
        success: true,
        plan: aiPlanManager.getPlan(plan.id)!,
        steps: parsed.steps,
        reasoning: parsed.reasoning
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during plan generation'
      };
    }
  }

  private mapActionType(action: string): PlanStep['action'] {
    const actionMap: Record<string, PlanStep['action']> = {
      'click': 'click',
      'type': 'type',
      'navigate': 'navigate',
      'wait': 'wait',
      'scroll': 'scroll',
      'screenshot': 'screenshot',
      'verify': 'verify',
      'hotkey': 'custom'
    };
    return actionMap[action.toLowerCase()] || 'custom';
  }

  async refinePlan(
    existingPlan: AIPlan,
    feedback: string
  ): Promise<PlanGenerationResult> {
    if (!this.config) {
      return { success: false, error: 'Planning agent not configured' };
    }

    try {
      const context = await this.gatherContext({ includeScreenshot: true, includeDOMState: true });
      
      const planSummary = existingPlan.steps.map((s, i) => 
        `${i + 1}. [${s.status}] ${s.description} (${s.action})`
      ).join('\n');

      const refinementPrompt = `
CURRENT PLAN FOR GOAL: "${existingPlan.goal}"

${planSummary}

USER FEEDBACK: ${feedback}

Please refine the plan based on the feedback. You may:
1. Modify existing steps
2. Add new steps
3. Remove unnecessary steps
4. Reorder steps
5. Update verification criteria

Provide the COMPLETE updated plan with ALL steps.`;

      const messages: AIMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { 
          role: 'user', 
          content: this.buildUserContent(refinementPrompt, context)
        }
      ];

      const response = await this.callAI(messages);
      
      if (!response.success) {
        return { success: false, error: response.error };
      }

      const parsed = this.parseResponse(response.content!);
      
      if (!parsed.success || !parsed.steps) {
        return { success: false, error: parsed.error || 'Failed to parse refined plan' };
      }

      const newPlan = aiPlanManager.createPlan(
        existingPlan.name + ' (refined)',
        existingPlan.goal,
        `Refined plan: ${existingPlan.goal}`
      );
      
      parsed.steps.forEach((step, index) => {
        aiPlanManager.addStep(newPlan.id, {
          description: step.description,
          action: this.mapActionType(step.action),
          target: step.target || step.params?.selector as string,
          value: step.value || step.params?.text as string || step.params?.url as string,
          order: index
        });
      });

      return {
        success: true,
        plan: aiPlanManager.getPlan(newPlan.id)!,
        steps: parsed.steps,
        reasoning: parsed.reasoning
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during plan refinement'
      };
    }
  }

  async suggestNextStep(
    currentPlan: AIPlan,
    currentContext: { screenshot?: string; domState?: DOMStateSnapshot }
  ): Promise<GeneratedStep | null> {
    if (!this.config) return null;

    const completedSteps = currentPlan.steps
      .filter(s => s.status === 'completed')
      .map(s => s.description);
    
    const failedSteps = currentPlan.steps
      .filter(s => s.status === 'failed')
      .map(s => `${s.description}: ${s.error}`);

    const prompt = `
GOAL: ${currentPlan.goal}

COMPLETED STEPS:
${completedSteps.map((s, i) => `${i + 1}. ${s}`).join('\n') || 'None'}

FAILED STEPS:
${failedSteps.join('\n') || 'None'}

Based on the current state (screenshot and DOM), suggest the NEXT single step to take.
Consider what has been completed and what failed. Provide ONE step that will move toward the goal.`;

    const messages: AIMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { 
        role: 'user', 
        content: this.buildUserContent(prompt, {
          screenshot: currentContext.screenshot,
          domState: currentContext.domState
        })
      }
    ];

    const response = await this.callAI(messages);
    
    if (!response.success) return null;

    const parsed = this.parseResponse(response.content!);
    
    return parsed.steps?.[0] || null;
  }

  private async gatherContext(options?: {
    includeScreenshot?: boolean;
    includeDOMState?: boolean;
  }): Promise<{ screenshot?: string; domState?: DOMStateSnapshot; pageState?: PageState }> {
    const context: { screenshot?: string; domState?: DOMStateSnapshot; pageState?: PageState } = {};

    if (options?.includeScreenshot !== false) {
      try {
        const screenshot = await screenshotService.captureFullPage();
        if (screenshot) {
          context.screenshot = screenshot;
        }
      } catch {}
    }

    if (options?.includeDOMState !== false) {
      context.domState = domStateCapture.captureSnapshot();
      context.pageState = domStateCapture.getPageState();
    }

    return context;
  }

  private buildMessages(
    goal: string,
    context: { screenshot?: string; domState?: DOMStateSnapshot; pageState?: PageState },
    additionalContext?: string
  ): AIMessage[] {
    const pageInfo = context.pageState ? `
CURRENT PAGE:
- URL: ${context.pageState.url}
- Title: ${context.pageState.title}
- Viewport: ${context.pageState.viewportSize.width}x${context.pageState.viewportSize.height}
` : '';

    const domInfo = context.domState ? `
DOM STATE:
- ${context.domState.buttons.length} buttons
- ${context.domState.inputs.length} inputs  
- ${context.domState.links.length} links
- ${context.domState.dialogs.length} dialogs
- ${context.domState.errorElements.length} error elements

INTERACTIVE ELEMENTS (first 15):
${context.domState.interactiveElements.slice(0, 15).map(el => 
  `  - ${el.selector}: "${el.textContent?.substring(0, 40) || 'no text'}" at (${el.bounds.x}, ${el.bounds.y})`
).join('\n')}
` : '';

    const userPrompt = `
GOAL: ${goal}

${pageInfo}
${domInfo}
${additionalContext ? `\nADDITIONAL CONTEXT:\n${additionalContext}` : ''}

Generate a COMPLETE automation plan to achieve this goal. Include ALL necessary steps.
DO NOT stop early. Ensure the plan covers the entire workflow from start to finish.`;

    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { 
        role: 'user', 
        content: this.buildUserContent(userPrompt, context)
      }
    ];
  }

  private buildUserContent(
    text: string,
    context: { screenshot?: string; domState?: DOMStateSnapshot }
  ): string | AIMessageContent[] {
    if (!context.screenshot) {
      return text;
    }

    const cleanBase64 = context.screenshot.replace(/^data:image\/\w+;base64,/, '');
    
    return [
      { 
        type: 'image_url', 
        image_url: { 
          url: `data:image/png;base64,${cleanBase64}`,
          detail: 'high'
        }
      },
      { type: 'text', text }
    ];
  }

  private async callAI(messages: AIMessage[]): Promise<{ success: boolean; content?: string; error?: string }> {
    if (!this.config) {
      return { success: false, error: 'Not configured' };
    }

    try {
      const response = await fetch(this.config.aiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.aiApiKey}`
        },
        body: JSON.stringify({
          model: this.config.aiModel,
          messages,
          max_tokens: 4000,
          temperature: 0.7,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `API error ${response.status}: ${errorText}` };
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        return { success: false, error: 'No content in API response' };
      }

      return { success: true, content };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown API error' 
      };
    }
  }

  private parseResponse(content: string): { 
    success: boolean; 
    steps?: GeneratedStep[]; 
    reasoning?: string;
    error?: string;
  } {
    try {
      const parsed = JSON.parse(content);
      
      if (!parsed.steps || !Array.isArray(parsed.steps)) {
        return { 
          success: false, 
          error: 'Invalid response format: missing steps array',
          reasoning: parsed.reasoning
        };
      }

      if (parsed.steps.length === 0) {
        return {
          success: false,
          error: 'Empty steps array',
          reasoning: parsed.reasoning
        };
      }

      const steps: GeneratedStep[] = parsed.steps.map((step: Record<string, unknown>) => ({
        action: String(step.action || 'custom'),
        description: String(step.description || ''),
        params: (step.params as Record<string, unknown>) || {},
        target: step.target as string || (step.params as Record<string, unknown>)?.selector as string,
        value: step.value as string || (step.params as Record<string, unknown>)?.text as string || (step.params as Record<string, unknown>)?.url as string,
        expectedOutcome: String(step.expectedOutcome || ''),
        reasoning: String(step.reasoning || '')
      }));

      return {
        success: true,
        steps,
        reasoning: parsed.reasoning
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse AI response: ${error}`
      };
    }
  }
}

export const aiPlanningAgent = new AIPlanningAgent();
export default aiPlanningAgent;
