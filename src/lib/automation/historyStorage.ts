import { supabase } from '../supabase';
import { ExecutionLog } from './types';

const BUCKET_NAME = 'user-data';
const HISTORY_FOLDER = 'execution-history';

interface ExecutionHistoryIndex {
  logs: {
    id: string;
    planId: string;
    planTitle: string;
    status: 'completed' | 'failed' | 'cancelled';
    tasksCompleted: number;
    totalTasks: number;
    executedAt: string;
    duration: number;
    error?: string;
  }[];
}

function getUserPath(email: string): string {
  const safeEmail = email.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
  return `${HISTORY_FOLDER}/${safeEmail}`;
}

function getIndexPath(email: string): string {
  return `${getUserPath(email)}/index.json`;
}

async function getHistoryIndex(email: string): Promise<ExecutionHistoryIndex> {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(getIndexPath(email));
    
    if (error || !data) {
      return { logs: [] };
    }
    
    const text = await data.text();
    return JSON.parse(text);
  } catch {
    return { logs: [] };
  }
}

async function saveHistoryIndex(email: string, index: ExecutionHistoryIndex): Promise<boolean> {
  try {
    const blob = new Blob([JSON.stringify(index)], { type: 'application/json' });
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(getIndexPath(email), blob, { upsert: true });
    
    return !error;
  } catch {
    return false;
  }
}

export async function saveExecutionLog(email: string, log: ExecutionLog): Promise<void> {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const index = await getHistoryIndex(normalizedEmail);
    
    index.logs.unshift({
      id: log.id,
      planId: log.planId,
      planTitle: log.planTitle,
      status: log.status,
      tasksCompleted: log.tasksCompleted,
      totalTasks: log.totalTasks,
      executedAt: log.executedAt.toISOString(),
      duration: log.duration,
      error: log.error
    });
    
    if (index.logs.length > 50) {
      index.logs = index.logs.slice(0, 50);
    }
    
    await saveHistoryIndex(normalizedEmail, index);
  } catch (err) {
    console.error('Failed to save execution log:', err);
  }
}

export async function loadExecutionHistory(email: string): Promise<ExecutionLog[]> {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const index = await getHistoryIndex(normalizedEmail);
    
    return index.logs.map(log => ({
      id: log.id,
      planId: log.planId,
      planTitle: log.planTitle,
      status: log.status,
      tasksCompleted: log.tasksCompleted,
      totalTasks: log.totalTasks,
      executedAt: new Date(log.executedAt),
      duration: log.duration,
      error: log.error
    }));
  } catch (err) {
    console.error('Failed to load execution history:', err);
    return [];
  }
}

export async function clearExecutionHistory(email: string): Promise<void> {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    await supabase.storage.from(BUCKET_NAME).remove([getIndexPath(normalizedEmail)]);
  } catch (err) {
    console.error('Failed to clear execution history:', err);
  }
}
