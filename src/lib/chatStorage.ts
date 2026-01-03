import { supabase } from './supabase';

const BUCKET_NAME = 'user-data';
const CHAT_FOLDER = 'chat-sessions';

export interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: string;
  attachments?: any[];
}

export interface ChatSession {
  id: string;
  title: string;
  timestamp: string;
  preview: string;
  messages: ChatMessage[];
  activeTab: string;
}

interface SessionIndex {
  sessions: {
    id: string;
    title: string;
    preview: string;
    timestamp: string;
    activeTab: string;
  }[];
  lastSessionId?: string;
}

function getUserPath(userId: string): string {
  const safeEmail = userId.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
  return `${CHAT_FOLDER}/${safeEmail}`;
}

function getSessionPath(userId: string, sessionId: string): string {
  return `${getUserPath(userId)}/sessions/${sessionId}.json`;
}

function getIndexPath(userId: string): string {
  return `${getUserPath(userId)}/index.json`;
}

export async function getUserId(): Promise<string | null> {
  const userEmail = sessionStorage.getItem("userEmail");
  if (userEmail) {
    return userEmail.toLowerCase().trim();
  }
  
  const { data } = await supabase.auth.getUser();
  return data.user?.email || null;
}

async function getSessionIndex(userId: string): Promise<SessionIndex> {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(getIndexPath(userId));
    
    if (error || !data) {
      return { sessions: [] };
    }
    
    const text = await data.text();
    return JSON.parse(text);
  } catch {
    return { sessions: [] };
  }
}

async function saveSessionIndex(userId: string, index: SessionIndex): Promise<boolean> {
  try {
    const blob = new Blob([JSON.stringify(index)], { type: 'application/json' });
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(getIndexPath(userId), blob, { upsert: true });
    
    return !error;
  } catch {
    return false;
  }
}

export async function saveSession(userId: string, session: ChatSession): Promise<boolean> {
  if (!userId) return false;
  
  const normalizedUserId = userId.toLowerCase().trim();
  console.log('[chatStorage.saveSession] Starting save for user:', normalizedUserId, 'session:', session.id);
  
  try {
    const sessionData = {
      ...session,
      timestamp: session.timestamp || new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(sessionData)], { type: 'application/json' });
    const sessionPath = getSessionPath(normalizedUserId, session.id);
    console.log('[chatStorage.saveSession] Uploading to path:', sessionPath);
    
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(sessionPath, blob, { upsert: true });
    
    if (error) {
      console.error('[chatStorage.saveSession] Save session error:', error);
      return false;
    }
    
    console.log('[chatStorage.saveSession] Session file saved, updating index...');
    const index = await getSessionIndex(normalizedUserId);
    console.log('[chatStorage.saveSession] Current index has', index.sessions.length, 'sessions');
    
    const existingIdx = index.sessions.findIndex(s => s.id === session.id);
    
    const sessionMeta = {
      id: session.id,
      title: session.title,
      preview: session.preview,
      timestamp: sessionData.timestamp,
      activeTab: session.activeTab
    };
    
    if (existingIdx >= 0) {
      index.sessions[existingIdx] = sessionMeta;
    } else {
      index.sessions.unshift(sessionMeta);
    }
    
    index.sessions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    const indexSaved = await saveSessionIndex(normalizedUserId, index);
    console.log('[chatStorage.saveSession] Index save result:', indexSaved, 'Now has', index.sessions.length, 'sessions');
    
    window.dispatchEvent(new CustomEvent('chat-session-saved', { detail: { sessionId: session.id } }));
    return true;
  } catch (e) {
    console.error('[chatStorage.saveSession] Save session failed:', e);
    return false;
  }
}

export async function loadSession(userId: string, sessionId: string): Promise<ChatSession | null> {
  if (!userId) return null;
  
  const normalizedUserId = userId.toLowerCase().trim();
  
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(getSessionPath(normalizedUserId, sessionId));
    
    if (error || !data) return null;
    
    const text = await data.text();
    return JSON.parse(text);
  } catch (e) {
    console.error('Load session failed:', e);
    return null;
  }
}

export async function deleteSession(userId: string, sessionId: string): Promise<boolean> {
  if (!userId) return false;
  
  const normalizedUserId = userId.toLowerCase().trim();
  
  try {
    await supabase.storage
      .from(BUCKET_NAME)
      .remove([getSessionPath(normalizedUserId, sessionId)]);
    
    const index = await getSessionIndex(normalizedUserId);
    index.sessions = index.sessions.filter(s => s.id !== sessionId);
    await saveSessionIndex(normalizedUserId, index);
    
    return true;
  } catch (e) {
    console.error('Delete session failed:', e);
    return false;
  }
}

export async function getAllSessions(userId: string): Promise<ChatSession[]> {
  if (!userId) return [];
  
  const normalizedUserId = userId.toLowerCase().trim();
  
  try {
    const index = await getSessionIndex(normalizedUserId);
    
    return index.sessions.map(s => ({
      id: s.id,
      title: s.title,
      timestamp: s.timestamp,
      preview: s.preview,
      messages: [],
      activeTab: s.activeTab
    }));
  } catch (e) {
    console.error('getAllSessions failed:', e);
    return [];
  }
}

export async function clearAllSessions(userId: string): Promise<boolean> {
  if (!userId) return false;
  
  const normalizedUserId = userId.toLowerCase().trim();
  
  try {
    const index = await getSessionIndex(normalizedUserId);
    
    const filesToDelete = index.sessions.map(s => getSessionPath(normalizedUserId, s.id));
    filesToDelete.push(getIndexPath(normalizedUserId));
    
    if (filesToDelete.length > 0) {
      await supabase.storage.from(BUCKET_NAME).remove(filesToDelete);
    }
    
    return true;
  } catch (e) {
    console.error('Clear sessions failed:', e);
    return false;
  }
}

export async function saveLastSessionId(userId: string, sessionId: string): Promise<void> {
  if (!userId) return;
  
  const normalizedUserId = userId.toLowerCase().trim();
  
  try {
    const index = await getSessionIndex(normalizedUserId);
    index.lastSessionId = sessionId;
    await saveSessionIndex(normalizedUserId, index);
  } catch (e) {
    console.error('Save last session failed:', e);
  }
}

export async function getLastSessionId(userId: string): Promise<string | null> {
  if (!userId) return null;
  
  const normalizedUserId = userId.toLowerCase().trim();
  
  try {
    const index = await getSessionIndex(normalizedUserId);
    return index.lastSessionId || null;
  } catch (e) {
    return null;
  }
}

export async function renameSession(userId: string, sessionId: string, newTitle: string): Promise<boolean> {
  if (!userId) return false;
  
  const normalizedUserId = userId.toLowerCase().trim();
  
  try {
    const session = await loadSession(normalizedUserId, sessionId);
    if (!session) return false;
    
    session.title = newTitle;
    return await saveSession(normalizedUserId, session);
  } catch (e) {
    console.error('Rename session failed:', e);
    return false;
  }
}
