import { supabase } from './supabase';

const BUCKET_NAME = 'user-data';
const SCREENSHOTS_FOLDER = 'screenshots';

export interface ExecutionScreenshot {
  id: string;
  user_email: string;
  session_id: string | null;
  screenshot_url: string;
  task_description: string | null;
  execution_state: 'pending' | 'in_progress' | 'completed' | 'failed';
  metadata: Record<string, unknown>;
  created_at: string;
}

interface ScreenshotIndex {
  screenshots: ExecutionScreenshot[];
}

function getUserPath(userEmail: string): string {
  const safeEmail = userEmail.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
  return `${SCREENSHOTS_FOLDER}/${safeEmail}`;
}

function getIndexPath(userEmail: string): string {
  return `${getUserPath(userEmail)}/index.json`;
}

function getImagePath(userEmail: string, filename: string): string {
  return `${getUserPath(userEmail)}/images/${filename}`;
}

async function getScreenshotIndex(userEmail: string): Promise<ScreenshotIndex> {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(getIndexPath(userEmail));
    
    if (error || !data) {
      return { screenshots: [] };
    }
    
    const text = await data.text();
    return JSON.parse(text);
  } catch {
    return { screenshots: [] };
  }
}

async function saveScreenshotIndex(userEmail: string, index: ScreenshotIndex): Promise<boolean> {
  try {
    const blob = new Blob([JSON.stringify(index)], { type: 'application/json' });
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(getIndexPath(userEmail), blob, { upsert: true });
    
    return !error;
  } catch {
    return false;
  }
}

export async function captureAndStoreScreenshot(
  userEmail: string,
  canvas: HTMLCanvasElement,
  taskDescription?: string,
  sessionId?: string,
  executionState: ExecutionScreenshot['execution_state'] = 'in_progress',
  metadata: Record<string, unknown> = {}
): Promise<ExecutionScreenshot | null> {
  try {
    const normalizedEmail = userEmail.toLowerCase().trim();
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png', 0.9);
    });

    if (!blob) {
      console.error('Failed to create blob from canvas');
      return null;
    }

    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const filename = `${id}.png`;
    const imagePath = getImagePath(normalizedEmail, filename);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(imagePath, blob, {
        contentType: 'image/png',
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('Error uploading screenshot:', uploadError);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(imagePath);

    const screenshot: ExecutionScreenshot = {
      id,
      user_email: normalizedEmail,
      session_id: sessionId || null,
      screenshot_url: urlData.publicUrl,
      task_description: taskDescription || null,
      execution_state: executionState,
      metadata,
      created_at: new Date().toISOString()
    };

    const index = await getScreenshotIndex(normalizedEmail);
    index.screenshots.unshift(screenshot);
    
    if (index.screenshots.length > 100) {
      index.screenshots = index.screenshots.slice(0, 100);
    }
    
    await saveScreenshotIndex(normalizedEmail, index);

    return screenshot;
  } catch (err) {
    console.error('Screenshot capture error:', err);
    return null;
  }
}

export async function captureViewportScreenshot(
  userEmail: string,
  taskDescription?: string,
  sessionId?: string,
  executionState: ExecutionScreenshot['execution_state'] = 'in_progress',
  metadata: Record<string, unknown> = {}
): Promise<ExecutionScreenshot | null> {
  try {
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(document.body, {
      useCORS: true,
      allowTaint: true,
      logging: false,
      scale: 1,
    });

    return captureAndStoreScreenshot(
      userEmail,
      canvas,
      taskDescription,
      sessionId,
      executionState,
      metadata
    );
  } catch (err) {
    console.error('Viewport screenshot error:', err);
    return null;
  }
}

export async function getScreenshots(
  userEmail: string,
  sessionId?: string,
  limit: number = 50
): Promise<ExecutionScreenshot[]> {
  const normalizedEmail = userEmail.toLowerCase().trim();
  
  try {
    const index = await getScreenshotIndex(normalizedEmail);
    let screenshots = index.screenshots;
    
    if (sessionId) {
      screenshots = screenshots.filter(s => s.session_id === sessionId);
    }
    
    return screenshots.slice(0, limit);
  } catch (err) {
    console.error('Error fetching screenshots:', err);
    return [];
  }
}

export async function updateScreenshotState(
  userEmail: string,
  screenshotId: string,
  executionState: ExecutionScreenshot['execution_state'],
  metadata?: Record<string, unknown>
): Promise<ExecutionScreenshot | null> {
  const normalizedEmail = userEmail.toLowerCase().trim();
  
  try {
    const index = await getScreenshotIndex(normalizedEmail);
    const screenshot = index.screenshots.find(s => s.id === screenshotId);
    
    if (!screenshot) return null;
    
    screenshot.execution_state = executionState;
    if (metadata) {
      screenshot.metadata = { ...screenshot.metadata, ...metadata };
    }
    
    await saveScreenshotIndex(normalizedEmail, index);
    return screenshot;
  } catch (err) {
    console.error('Error updating screenshot state:', err);
    return null;
  }
}

export async function deleteScreenshot(userEmail: string, screenshotId: string): Promise<boolean> {
  const normalizedEmail = userEmail.toLowerCase().trim();
  
  try {
    const index = await getScreenshotIndex(normalizedEmail);
    const screenshot = index.screenshots.find(s => s.id === screenshotId);
    
    if (!screenshot) return false;
    
    const imagePath = getImagePath(normalizedEmail, `${screenshotId}.png`);
    await supabase.storage.from(BUCKET_NAME).remove([imagePath]);
    
    index.screenshots = index.screenshots.filter(s => s.id !== screenshotId);
    await saveScreenshotIndex(normalizedEmail, index);
    
    return true;
  } catch (err) {
    console.error('Error deleting screenshot:', err);
    return false;
  }
}

export class ExecutionScreenshotCapture {
  private userEmail: string;
  private sessionId?: string;
  private intervalId?: number;
  private isCapturing = false;

  constructor(userEmail: string, sessionId?: string) {
    this.userEmail = userEmail.toLowerCase().trim();
    this.sessionId = sessionId;
  }

  async captureNow(
    taskDescription?: string,
    executionState: ExecutionScreenshot['execution_state'] = 'in_progress',
    metadata: Record<string, unknown> = {}
  ): Promise<ExecutionScreenshot | null> {
    return captureViewportScreenshot(
      this.userEmail,
      taskDescription,
      this.sessionId,
      executionState,
      metadata
    );
  }

  startAutoCapture(
    intervalMs: number = 5000,
    taskDescription?: string
  ): void {
    if (this.isCapturing) return;
    this.isCapturing = true;

    this.intervalId = window.setInterval(async () => {
      await this.captureNow(taskDescription, 'in_progress', {
        auto_captured: true,
        timestamp: Date.now(),
      });
    }, intervalMs);
  }

  stopAutoCapture(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isCapturing = false;
  }

  async captureOnComplete(
    taskDescription?: string,
    success: boolean = true,
    metadata: Record<string, unknown> = {}
  ): Promise<ExecutionScreenshot | null> {
    this.stopAutoCapture();
    return this.captureNow(
      taskDescription,
      success ? 'completed' : 'failed',
      { ...metadata, completion_time: Date.now() }
    );
  }
}
