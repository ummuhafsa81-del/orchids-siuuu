export interface DOMElement {
  tagName: string;
  id?: string;
  className?: string;
  textContent?: string;
  type?: string;
  name?: string;
  value?: string;
  placeholder?: string;
  href?: string;
  src?: string;
  disabled?: boolean;
  checked?: boolean;
  visible: boolean;
  clickable: boolean;
  editable: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  xpath: string;
  selector: string;
}

export interface PageState {
  url: string;
  title: string;
  readyState: DocumentReadyState;
  timestamp: number;
  scrollPosition: { x: number; y: number };
  viewportSize: { width: number; height: number };
  hasErrors: boolean;
  consoleErrors: string[];
  networkErrors: string[];
}

export interface DOMStateSnapshot {
  id: string;
  timestamp: number;
  pageState: PageState;
  buttons: DOMElement[];
  inputs: DOMElement[];
  links: DOMElement[];
  labels: DOMElement[];
  images: DOMElement[];
  dialogs: DOMElement[];
  forms: DOMElement[];
  interactiveElements: DOMElement[];
  errorElements: DOMElement[];
  focusedElement: DOMElement | null;
  summary: string;
}

type ErrorCallback = (error: string, source: 'console' | 'network' | 'runtime') => void;

class DOMStateCapture {
    private consoleErrors: string[] = [];
    private networkErrors: string[] = [];
    private maxErrors = 20;
    private errorListeners: Set<ErrorCallback> = new Set();
    private originalConsoleError: typeof console.error | null = null;
    private isMonitoring = false;
    private snapshotCache: { snapshot: DOMStateSnapshot; timestamp: number } | null = null;
    private cacheMaxAge = 200;

  startErrorMonitoring() {
    if (this.isMonitoring) return;
    this.isMonitoring = true;

    this.originalConsoleError = console.error;
    console.error = (...args) => {
      const errorMsg = args.map(a => 
        typeof a === 'object' ? JSON.stringify(a) : String(a)
      ).join(' ');
      this.addConsoleError(errorMsg);
      this.originalConsoleError?.apply(console, args);
    };

    window.addEventListener('error', this.handleWindowError);
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  stopErrorMonitoring() {
    if (!this.isMonitoring) return;
    this.isMonitoring = false;

    if (this.originalConsoleError) {
      console.error = this.originalConsoleError;
      this.originalConsoleError = null;
    }

    window.removeEventListener('error', this.handleWindowError);
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  private handleWindowError = (event: ErrorEvent) => {
    const errorMsg = `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`;
    this.addConsoleError(errorMsg);
  };

  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const errorMsg = `Unhandled Promise: ${event.reason}`;
    this.addConsoleError(errorMsg);
  };

  private addConsoleError(error: string) {
    this.consoleErrors.push(error);
    if (this.consoleErrors.length > this.maxErrors) {
      this.consoleErrors.shift();
    }
    this.notifyErrorListeners(error, 'console');
  }

  addNetworkError(error: string) {
    this.networkErrors.push(error);
    if (this.networkErrors.length > this.maxErrors) {
      this.networkErrors.shift();
    }
    this.notifyErrorListeners(error, 'network');
  }

  addErrorListener(callback: ErrorCallback) {
    this.errorListeners.add(callback);
  }

  removeErrorListener(callback: ErrorCallback) {
    this.errorListeners.delete(callback);
  }

  private notifyErrorListeners(error: string, source: 'console' | 'network' | 'runtime') {
    this.errorListeners.forEach(cb => cb(error, source));
  }

  getPageState(): PageState {
    return {
      url: window.location.href,
      title: document.title,
      readyState: document.readyState,
      timestamp: Date.now(),
      scrollPosition: {
        x: window.scrollX,
        y: window.scrollY
      },
      viewportSize: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      hasErrors: this.consoleErrors.length > 0 || this.networkErrors.length > 0,
      consoleErrors: [...this.consoleErrors],
      networkErrors: [...this.networkErrors]
    };
  }

    captureSnapshot(forceRefresh = false): DOMStateSnapshot {
      const now = Date.now();
      if (!forceRefresh && this.snapshotCache && (now - this.snapshotCache.timestamp) < this.cacheMaxAge) {
        return this.snapshotCache.snapshot;
      }

      const pageState = this.getPageState();
      const buttons = this.captureButtons();
      const inputs = this.captureInputs();
      const links = this.captureLinks();
      const dialogs = this.captureDialogs();
      const focusedElement = this.captureFocusedElement();

      const interactiveElements = [
        ...buttons.slice(0, 20),
        ...inputs.slice(0, 20),
        ...links.slice(0, 20)
      ].filter(el => el.visible && el.clickable);

      const summary = this.generateSummary(pageState, {
        buttons: buttons.length,
        inputs: inputs.length,
        links: links.length,
        dialogs: dialogs.length,
        errors: 0,
        hasActiveInput: focusedElement?.editable || false
      });

      const snapshot: DOMStateSnapshot = {
        id: `dom_${now}_${Math.random().toString(36).substr(2, 6)}`,
        timestamp: now,
        pageState,
        buttons: buttons.slice(0, 30),
        inputs: inputs.slice(0, 30),
        links: links.slice(0, 30),
        labels: [],
        images: [],
        dialogs,
        forms: [],
        interactiveElements: interactiveElements.slice(0, 50),
        errorElements: [],
        focusedElement,
        summary
      };

      this.snapshotCache = { snapshot, timestamp: now };
      return snapshot;
    }

  private captureButtons(): DOMElement[] {
    const elements: DOMElement[] = [];
    const buttonSelectors = 'button, [role="button"], input[type="button"], input[type="submit"]';
    
    document.querySelectorAll(buttonSelectors).forEach(el => {
      const domEl = this.elementToDOMElement(el as HTMLElement);
      if (domEl) elements.push(domEl);
    });

    return elements;
  }

  private captureInputs(): DOMElement[] {
    const elements: DOMElement[] = [];
    const inputSelectors = 'input:not([type="button"]):not([type="submit"]):not([type="hidden"])';
    
    document.querySelectorAll(inputSelectors).forEach(el => {
      const domEl = this.elementToDOMElement(el as HTMLInputElement);
      if (domEl) {
        const input = el as HTMLInputElement;
        domEl.type = input.type;
        domEl.value = input.type === 'password' ? '***' : input.value;
        domEl.placeholder = input.placeholder;
        domEl.checked = input.checked;
        elements.push(domEl);
      }
    });

    return elements;
  }

  private captureTextareas(): DOMElement[] {
    const elements: DOMElement[] = [];
    
    document.querySelectorAll('textarea').forEach(el => {
      const domEl = this.elementToDOMElement(el as HTMLElement);
      if (domEl) {
        domEl.value = (el as HTMLTextAreaElement).value;
        domEl.placeholder = (el as HTMLTextAreaElement).placeholder;
        elements.push(domEl);
      }
    });

    return elements;
  }

  private captureSelectElements(): DOMElement[] {
    const elements: DOMElement[] = [];
    
    document.querySelectorAll('select').forEach(el => {
      const domEl = this.elementToDOMElement(el as HTMLElement);
      if (domEl) {
        const select = el as HTMLSelectElement;
        domEl.value = select.options[select.selectedIndex]?.text || '';
        elements.push(domEl);
      }
    });

    return elements;
  }

  private captureLinks(): DOMElement[] {
    const elements: DOMElement[] = [];
    
    document.querySelectorAll('a[href]').forEach(el => {
      const domEl = this.elementToDOMElement(el as HTMLAnchorElement);
      if (domEl) {
        domEl.href = (el as HTMLAnchorElement).href;
        elements.push(domEl);
      }
    });

    return elements;
  }

  private captureLabels(): DOMElement[] {
    const elements: DOMElement[] = [];
    
    document.querySelectorAll('label, [aria-label]').forEach(el => {
      const domEl = this.elementToDOMElement(el as HTMLElement);
      if (domEl) elements.push(domEl);
    });

    return elements;
  }

  private captureImages(): DOMElement[] {
    const elements: DOMElement[] = [];
    
    document.querySelectorAll('img').forEach(el => {
      const domEl = this.elementToDOMElement(el as HTMLImageElement);
      if (domEl) {
        domEl.src = (el as HTMLImageElement).src;
        elements.push(domEl);
      }
    });

    return elements;
  }

  private captureDialogs(): DOMElement[] {
    const elements: DOMElement[] = [];
    const dialogSelectors = 'dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"], .modal, .dialog';
    
    document.querySelectorAll(dialogSelectors).forEach(el => {
      const domEl = this.elementToDOMElement(el as HTMLElement);
      if (domEl && domEl.visible) elements.push(domEl);
    });

    return elements;
  }

  private captureForms(): DOMElement[] {
    const elements: DOMElement[] = [];
    
    document.querySelectorAll('form').forEach(el => {
      const domEl = this.elementToDOMElement(el as HTMLFormElement);
      if (domEl) {
        domEl.name = (el as HTMLFormElement).name;
        elements.push(domEl);
      }
    });

    return elements;
  }

  private captureErrorElements(): DOMElement[] {
    const elements: DOMElement[] = [];
    const errorSelectors = '[role="alert"], .error, .error-message, [aria-invalid="true"], .invalid, .is-invalid';
    
    document.querySelectorAll(errorSelectors).forEach(el => {
      const domEl = this.elementToDOMElement(el as HTMLElement);
      if (domEl && domEl.visible && domEl.textContent) {
        elements.push(domEl);
      }
    });

    return elements;
  }

  private captureFocusedElement(): DOMElement | null {
    const focused = document.activeElement;
    if (focused && focused !== document.body) {
      return this.elementToDOMElement(focused as HTMLElement);
    }
    return null;
  }

  private elementToDOMElement(el: HTMLElement): DOMElement | null {
    try {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      
      const visible = (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        parseFloat(style.opacity) > 0
      );

      const clickable = (
        !el.hasAttribute('disabled') &&
        style.pointerEvents !== 'none'
      );

      const editable = (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.contentEditable === 'true'
      );

      return {
        tagName: el.tagName.toLowerCase(),
        id: el.id || undefined,
        className: el.className || undefined,
        textContent: el.textContent?.trim().substring(0, 200) || undefined,
        disabled: el.hasAttribute('disabled'),
        visible,
        clickable,
        editable,
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        xpath: this.getXPath(el),
        selector: this.getSelector(el)
      };
    } catch {
      return null;
    }
  }

  private getXPath(el: HTMLElement): string {
    const parts: string[] = [];
    let current: HTMLElement | null = el;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = current.previousElementSibling;
      
      while (sibling) {
        if (sibling.tagName === current.tagName) index++;
        sibling = sibling.previousElementSibling;
      }

      const tagName = current.tagName.toLowerCase();
      parts.unshift(`${tagName}[${index}]`);
      current = current.parentElement;
    }

    return '/' + parts.join('/');
  }

  private getSelector(el: HTMLElement): string {
    if (el.id) return `#${el.id}`;
    
    const tagName = el.tagName.toLowerCase();
    const classes = Array.from(el.classList).slice(0, 2).join('.');
    
    if (classes) {
      return `${tagName}.${classes}`;
    }
    
    const name = el.getAttribute('name');
    if (name) return `${tagName}[name="${name}"]`;
    
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return `${tagName}[aria-label="${ariaLabel}"]`;
    
    return tagName;
  }

  private generateSummary(
    pageState: PageState,
    counts: {
      buttons: number;
      inputs: number;
      links: number;
      dialogs: number;
      errors: number;
      hasActiveInput: boolean;
    }
  ): string {
    const parts: string[] = [
      `Page: ${pageState.title || 'Untitled'}`,
      `URL: ${pageState.url}`,
      `Elements: ${counts.buttons} buttons, ${counts.inputs} inputs, ${counts.links} links`
    ];

    if (counts.dialogs > 0) {
      parts.push(`${counts.dialogs} dialog(s) open`);
    }

    if (counts.errors > 0) {
      parts.push(`${counts.errors} error(s) visible`);
    }

    if (pageState.hasErrors) {
      parts.push(`Console/Network errors: ${pageState.consoleErrors.length + pageState.networkErrors.length}`);
    }

    if (counts.hasActiveInput) {
      parts.push('Input field is focused');
    }

    return parts.join(' | ');
  }

  clearErrors() {
    this.consoleErrors = [];
    this.networkErrors = [];
  }

  getRecentErrors(count: number = 10): { console: string[]; network: string[] } {
    return {
      console: this.consoleErrors.slice(-count),
      network: this.networkErrors.slice(-count)
    };
  }

  findElementByText(text: string, tagName?: string): DOMElement | null {
    const selector = tagName || '*';
    const elements = document.querySelectorAll(selector);
    
    for (const el of elements) {
      if (el.textContent?.toLowerCase().includes(text.toLowerCase())) {
        return this.elementToDOMElement(el as HTMLElement);
      }
    }
    
    return null;
  }

  findElementBySelector(selector: string): DOMElement | null {
    try {
      const el = document.querySelector(selector);
      if (el) return this.elementToDOMElement(el as HTMLElement);
    } catch {}
    return null;
  }

  findClickableNear(x: number, y: number, radius: number = 50): DOMElement[] {
    const snapshot = this.captureSnapshot();
    return snapshot.interactiveElements.filter(el => {
      const centerX = el.bounds.x + el.bounds.width / 2;
      const centerY = el.bounds.y + el.bounds.height / 2;
      const distance = Math.sqrt(Math.pow(centerX - x, 2) + Math.pow(centerY - y, 2));
      return distance <= radius;
    });
  }
}

export const domStateCapture = new DOMStateCapture();
export default domStateCapture;
