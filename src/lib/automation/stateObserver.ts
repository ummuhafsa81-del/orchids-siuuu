import { getAgentClient, AgentResponse } from './agentClient';

export interface DOMState {
  url: string;
  title: string;
  focusedElement: string | null;
  visibleText: string;
  timestamp: number;
}

export interface ScreenshotState {
  base64: string;
  timestamp: number;
}

export interface ObservedState {
  dom: DOMState;
  screenshot: ScreenshotState | null;
  hash: string;
}

export type StateChangeEvent = {
  type: 'state_change';
  previous: ObservedState | null;
  current: ObservedState;
  changes: string[];
};

export type StateChangeCallback = (event: StateChangeEvent) => void;

class StateObserver {
  private isObserving = false;
  private observeInterval: number | null = null;
  private lastState: ObservedState | null = null;
  private listeners: Set<StateChangeCallback> = new Set();
  private pendingCapture = false;
  private capturePromise: Promise<ObservedState | null> | null = null;

  on(callback: StateChangeCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  off(callback: StateChangeCallback): void {
    this.listeners.delete(callback);
  }

  private emit(event: StateChangeEvent): void {
    this.listeners.forEach(cb => {
      try {
        cb(event);
      } catch (e) {
        console.error('[StateObserver] Listener error:', e);
      }
    });
  }

  start(intervalMs: number = 200): void {
    if (this.isObserving) return;
    this.isObserving = true;

    this.observeInterval = window.setInterval(() => {
      this.checkForChanges();
    }, intervalMs);

    this.checkForChanges();
  }

  stop(): void {
    this.isObserving = false;
    if (this.observeInterval) {
      clearInterval(this.observeInterval);
      this.observeInterval = null;
    }
  }

  private async checkForChanges(): Promise<void> {
    if (this.pendingCapture) return;
    
    try {
      this.pendingCapture = true;
      const newState = await this.captureState();
      
      if (!newState) return;

      if (!this.lastState || newState.hash !== this.lastState.hash) {
        const changes = this.detectChanges(this.lastState, newState);
        
        this.emit({
          type: 'state_change',
          previous: this.lastState,
          current: newState,
          changes
        });

        this.lastState = newState;
      }
    } finally {
      this.pendingCapture = false;
    }
  }

  async captureNow(): Promise<ObservedState | null> {
    if (this.capturePromise) {
      return this.capturePromise;
    }

    this.capturePromise = this.captureState();
    const result = await this.capturePromise;
    this.capturePromise = null;
    
    if (result) {
      this.lastState = result;
    }
    
    return result;
  }

  private async captureState(): Promise<ObservedState | null> {
    const client = getAgentClient();
    if (!client.connected) return null;

    try {
      const [domResponse, screenshotResponse] = await Promise.all([
        client.execute({ action: 'get_dom_state' }).catch(() => null),
        client.execute({ action: 'screenshot' }).catch(() => null)
      ]);

      const dom: DOMState = {
        url: (domResponse as any)?.url || window.location.href,
        title: (domResponse as any)?.title || document.title,
        focusedElement: (domResponse as any)?.focusedElement || null,
        visibleText: (domResponse as any)?.visibleText?.substring(0, 500) || '',
        timestamp: Date.now()
      };

      const screenshot: ScreenshotState | null = screenshotResponse?.success && (screenshotResponse as any).screenshot
        ? { base64: (screenshotResponse as any).screenshot, timestamp: Date.now() }
        : null;

      const hash = this.computeHash(dom, screenshot);

      return { dom, screenshot, hash };
    } catch (e) {
      console.error('[StateObserver] Capture error:', e);
      return null;
    }
  }

  private computeHash(dom: DOMState, screenshot: ScreenshotState | null): string {
    const parts = [
      dom.url,
      dom.title,
      dom.focusedElement || '',
      dom.visibleText.substring(0, 200)
    ];
    
    if (screenshot) {
      parts.push(screenshot.base64.substring(0, 100));
    }

    let hash = 0;
    const str = parts.join('|');
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  private detectChanges(prev: ObservedState | null, curr: ObservedState): string[] {
    const changes: string[] = [];
    
    if (!prev) {
      changes.push('initial_state');
      return changes;
    }

    if (prev.dom.url !== curr.dom.url) {
      changes.push(`url_changed: ${curr.dom.url}`);
    }

    if (prev.dom.title !== curr.dom.title) {
      changes.push(`title_changed: ${curr.dom.title}`);
    }

    if (prev.dom.focusedElement !== curr.dom.focusedElement) {
      changes.push(`focus_changed: ${curr.dom.focusedElement || 'none'}`);
    }

    if (prev.dom.visibleText !== curr.dom.visibleText) {
      changes.push('content_changed');
    }

    if (changes.length === 0 && prev.hash !== curr.hash) {
      changes.push('visual_change');
    }

    return changes;
  }

  getLastState(): ObservedState | null {
    return this.lastState;
  }

  getScreenshot(): string | null {
    return this.lastState?.screenshot?.base64 || null;
  }

  getDOMState(): DOMState | null {
    return this.lastState?.dom || null;
  }

  reset(): void {
    this.lastState = null;
  }
}

export const stateObserver = new StateObserver();
export default stateObserver;
