const AGENT_PORTS = [9147, 8000, 3001];
const AGENT_URLS = AGENT_PORTS.flatMap(port => [
  `http://127.0.0.1:${port}`,
  `http://localhost:${port}`
]);

export interface AgentCommand {
  action: 'click' | 'rightclick' | 'doubleclick' | 'type' | 'hotkey' | 'move' | 'screenshot' | 'ping' | 'run' | 'powershell' | 'cmd' | 'openUrl' | 'readFile' | 'writeFile' | 'wait' | 'scroll' | 'verifyState';
  x?: number;
  y?: number;
  text?: string;
  keys?: string;
  command?: string;
  script?: string;
  url?: string;
  path?: string;
  content?: string;
  ms?: number;
  delta?: number;
  params?: Record<string, unknown>;
}

export interface AgentResponse {
  success: boolean;
  message?: string;
  error?: string;
  status?: string;
  version?: string;
  screenshot?: string;
}

type StatusCallback = (connected: boolean, error?: string) => void;

export class NovaAgentClient {
  private isConnected: boolean = false;
  private statusCheckInterval: NodeJS.Timeout | null = null;
  private listeners: Set<StatusCallback> = new Set();
  private activeBaseUrl: string = AGENT_URLS[0];
  private lastError: string | null = null;

  constructor(onStatusChange?: StatusCallback) {
    if (onStatusChange) this.listeners.add(onStatusChange);
  }

  addListener(callback: StatusCallback) {
    this.listeners.add(callback);
    // Immediately call with current state
    callback(this.isConnected, this.lastError || undefined);
  }

  removeListener(callback: StatusCallback) {
    this.listeners.delete(callback);
  }

  private notifyListeners(connected: boolean, error?: string) {
    this.isConnected = connected;
    this.lastError = error || null;
    this.listeners.forEach(callback => callback(connected, error));
  }

  async checkStatus(): Promise<boolean> {
    const isHttps = window.location.protocol === 'https:';
    let currentLastError: string | undefined;
    
    // First try the active URL
    const urlsToTry = [this.activeBaseUrl, ...AGENT_URLS.filter(u => u !== this.activeBaseUrl)];

    for (const url of urlsToTry) {
      try {
        const response = await fetch(`${url}/status`, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          signal: AbortSignal.timeout(2000),
        });

          if (response.ok) {
            // If we get a 200 OK from /status, the agent is alive
            this.activeBaseUrl = url;
            if (!this.isConnected) {
              this.notifyListeners(true);
            }
            return true;
          }
      } catch (error: any) {
        currentLastError = error?.message || 'Connection failed';
      }
    }

    if (this.isConnected) {
      this.notifyListeners(false);
    }
    
    if (isHttps) {
      // On HTTPS, if all attempts fail, it's almost certainly Mixed Content blocking
      this.notifyListeners(false, 'HTTPS_BLOCK');
    } else if (currentLastError) {
      this.notifyListeners(false, currentLastError);
    }

    return false;
  }

  startStatusPolling(intervalMs: number = 3000): void {
    this.stopStatusPolling();
    this.checkStatus();
    this.statusCheckInterval = setInterval(() => this.checkStatus(), intervalMs);
  }

  stopStatusPolling(): void {
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
      this.statusCheckInterval = null;
    }
  }

  async execute(command: AgentCommand): Promise<AgentResponse> {
    try {
      // Normalize command for the agent
      const payload = command.params ? { action: command.action, ...command.params } : command;

      const response = await fetch(`${this.activeBaseUrl}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60000), // Longer timeout for complex scripts
      });
      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute command',
      };
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }

  get baseUrl(): string {
    return this.activeBaseUrl;
  }

  destroy(): void {
    this.stopStatusPolling();
  }
}

let agentInstance: NovaAgentClient | null = null;

export function getAgentClient(onStatusChange?: (connected: boolean) => void): NovaAgentClient {
  if (!agentInstance) {
    agentInstance = new NovaAgentClient(onStatusChange);
  }
  return agentInstance;
}

export function destroyAgentClient(): void {
  if (agentInstance) {
    agentInstance.destroy();
    agentInstance = null;
  }
}
