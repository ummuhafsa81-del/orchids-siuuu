import { supabase } from './supabase';
import { getAdminTokenLimits } from './tokenStorage';

export interface TokenLimits {
  id: string;
  user_email: string;
  daily_limit: number;
  monthly_limit: number;
  created_at: string;
  updated_at: string;
}

export interface TokenUsage {
  id: string;
  user_email: string;
  session_id: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  model: string | null;
  request_id: string | null;
  created_at: string;
}

export interface TokenStats {
  dailyUsed: number;
  monthlyUsed: number;
  dailyLimit: number;
  monthlyLimit: number;
  dailyRemaining: number;
  monthlyRemaining: number;
  dailyPercentage: number;
  monthlyPercentage: number;
}

export async function getTokenLimits(userEmail: string): Promise<TokenLimits | null> {
  const normalizedEmail = userEmail.toLowerCase().trim();
  
  const { data, error } = await supabase
    .from('token_limits')
    .select('*')
    .eq('user_email', normalizedEmail)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching token limits:', error);
    return null;
  }

  return data;
}

export async function setTokenLimits(
  userEmail: string,
  dailyLimit: number,
  monthlyLimit: number
): Promise<TokenLimits | null> {
  const normalizedEmail = userEmail.toLowerCase().trim();
  
  const { data, error } = await supabase
    .from('token_limits')
    .upsert({
      user_email: normalizedEmail,
      daily_limit: dailyLimit,
      monthly_limit: monthlyLimit,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_email' })
    .select()
    .single();

  if (error) {
    console.error('Error setting token limits:', error);
    return null;
  }

  return data;
}

export async function recordTokenUsage(
  userEmail: string,
  promptTokens: number,
  completionTokens: number,
  model?: string,
  sessionId?: string,
  requestId?: string
): Promise<TokenUsage | null> {
  const normalizedEmail = userEmail.toLowerCase().trim();
  const totalTokens = promptTokens + completionTokens;

  const { data, error } = await supabase
    .from('token_usage')
    .insert({
      user_email: normalizedEmail,
      session_id: sessionId || null,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      model: model || null,
      request_id: requestId || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error recording token usage:', error);
    return null;
  }

  window.dispatchEvent(new CustomEvent('token-usage-recorded', { 
    detail: { userEmail: normalizedEmail, totalTokens, promptTokens, completionTokens } 
  }));

  return data;
}

export async function getDailyUsage(userEmail: string): Promise<number> {
  const normalizedEmail = userEmail.toLowerCase().trim();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('token_usage')
    .select('total_tokens')
    .eq('user_email', normalizedEmail)
    .gte('created_at', today.toISOString());

  if (error) {
    console.error('Error fetching daily usage:', error);
    return 0;
  }

  return data?.reduce((sum, row) => sum + (row.total_tokens || 0), 0) || 0;
}

export async function getMonthlyUsage(userEmail: string): Promise<number> {
  const normalizedEmail = userEmail.toLowerCase().trim();
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  firstOfMonth.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('token_usage')
    .select('total_tokens')
    .eq('user_email', normalizedEmail)
    .gte('created_at', firstOfMonth.toISOString());

  if (error) {
    console.error('Error fetching monthly usage:', error);
    return 0;
  }

  return data?.reduce((sum, row) => sum + (row.total_tokens || 0), 0) || 0;
}

export async function getTokenStats(userEmail: string): Promise<TokenStats> {
  const normalizedEmail = userEmail.toLowerCase().trim();
  
  // Always get limits from global_token_limits (admin settings)
  const adminLimits = await getAdminTokenLimits();
  const dailyLimit = adminLimits.dailyLimit;
  const monthlyLimit = adminLimits.monthlyLimit;
  
  // Get user's remaining tokens from user_token_balances table
  const { data: balance } = await supabase
    .from('user_token_balances')
    .select('daily_tokens_remaining, monthly_tokens_remaining')
    .eq('user_email', normalizedEmail)
    .single();

  if (balance) {
    const dailyRemaining = balance.daily_tokens_remaining;
    const monthlyRemaining = balance.monthly_tokens_remaining;
    
    const dailyUsed = Math.max(0, dailyLimit - dailyRemaining);
    const monthlyUsed = Math.max(0, monthlyLimit - monthlyRemaining);

    return {
      dailyUsed,
      monthlyUsed,
      dailyLimit,
      monthlyLimit,
      dailyRemaining: Math.max(0, dailyRemaining),
      monthlyRemaining: Math.max(0, monthlyRemaining),
      dailyPercentage: dailyLimit > 0 ? Math.min(100, (dailyUsed / dailyLimit) * 100) : 0,
      monthlyPercentage: monthlyLimit > 0 ? Math.min(100, (monthlyUsed / monthlyLimit) * 100) : 0,
    };
  }

  // Fallback if no balance record exists
  return {
    dailyUsed: 0,
    monthlyUsed: 0,
    dailyLimit,
    monthlyLimit,
    dailyRemaining: dailyLimit,
    monthlyRemaining: monthlyLimit,
    dailyPercentage: 0,
    monthlyPercentage: 0,
  };
}

export async function checkTokenAvailability(
  userEmail: string,
  estimatedTokens: number
): Promise<{ allowed: boolean; reason?: string }> {
  const stats = await getTokenStats(userEmail);

  if (stats.dailyRemaining < estimatedTokens) {
    return {
      allowed: false,
      reason: `Daily token limit exceeded. Remaining: ${stats.dailyRemaining.toLocaleString()} tokens`,
    };
  }

  if (stats.monthlyRemaining < estimatedTokens) {
    return {
      allowed: false,
      reason: `Monthly token limit exceeded. Remaining: ${stats.monthlyRemaining.toLocaleString()} tokens`,
    };
  }

  return { allowed: true };
}

export function subscribeToTokenUsage(
  userEmail: string,
  callback: (usage: TokenUsage) => void
) {
  const normalizedEmail = userEmail.toLowerCase().trim();
  const channel = supabase
    .channel(`token_usage_${normalizedEmail.replace(/[^a-z0-9]/g, '_')}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'token_usage',
        filter: `user_email=eq.${normalizedEmail}`,
      },
      (payload) => {
        callback(payload.new as TokenUsage);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToTokenLimits(
  userEmail: string,
  callback: (limits: TokenLimits) => void
) {
  const normalizedEmail = userEmail.toLowerCase().trim();
  const channel = supabase
    .channel(`token_limits_${normalizedEmail.replace(/[^a-z0-9]/g, '_')}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'token_limits',
        filter: `user_email=eq.${normalizedEmail}`,
      },
      (payload) => {
        callback(payload.new as TokenLimits);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
