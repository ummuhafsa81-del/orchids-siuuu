import { supabase } from "./supabase";

export interface UserTokens {
  email: string;
  dailyTokensRemaining: number;
  monthlyTokensRemaining: number;
  dailyLimit: number;
  monthlyLimit: number;
  lastDailyReset: string;
  lastMonthlyReset: string;
}

export interface UserSubscription {
  email: string;
  subscriptionStartedAt: string;
  subscriptionEndsAt: string;
  isActive: boolean;
  daysRemaining: number;
}

export interface GlobalTokenLimits {
  dailyLimit: number;
  monthlyLimit: number;
}

export async function getAdminTokenLimits(): Promise<GlobalTokenLimits> {
  try {
    const { data, error } = await supabase
      .from('global_token_limits')
      .select('daily_limit, monthly_limit')
      .eq('id', 'global')
      .single();
    
    if (error) {
      console.error("Error fetching global limits:", error);
      throw error;
    }
    
    if (data) {
      return {
        dailyLimit: data.daily_limit,
        monthlyLimit: data.monthly_limit
      };
    }
    
    throw new Error("No global token limits found");
  } catch (e) {
    console.error("Error fetching global limits:", e);
    throw e;
  }
}

export async function saveAdminTokenLimits(dailyLimit: number, monthlyLimit: number): Promise<void> {
  try {
    const { error } = await supabase
      .from('global_token_limits')
      .upsert({
        id: 'global',
        daily_limit: dailyLimit,
        monthly_limit: monthlyLimit,
        updated_at: new Date().toISOString()
      });
    
    if (error) throw error;
    
    // Update limits AND reset remaining tokens to new limits for all users
    const { error: updateError } = await supabase
      .from('user_token_balances')
      .update({
        daily_limit: dailyLimit,
        monthly_limit: monthlyLimit,
        daily_tokens_remaining: dailyLimit,
        monthly_tokens_remaining: monthlyLimit,
        updated_at: new Date().toISOString()
      })
      .neq('user_email', '');
    
    if (updateError) {
      console.error('Error updating user balances:', updateError);
    }
    
    window.dispatchEvent(new CustomEvent('token-limits-updated', { 
      detail: { dailyLimit, monthlyLimit } 
    }));
  } catch (e) {
    console.error("Error saving admin token limits:", e);
    throw e;
  }
}

export function subscribeToGlobalTokenLimits(
  callback: (limits: GlobalTokenLimits) => void
): () => void {
  const handleEvent = (event: Event) => {
    const customEvent = event as CustomEvent<GlobalTokenLimits>;
    if (customEvent.detail) {
      callback(customEvent.detail);
    }
  };
  
  window.addEventListener('token-limits-updated', handleEvent);
  
  const channel = supabase
    .channel('global-token-limits-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'global_token_limits' },
      async (payload) => {
        console.log('[Realtime] Global token limits changed:', payload);
        const limits = await getAdminTokenLimits();
        callback(limits);
        window.dispatchEvent(new CustomEvent('token-limits-updated', { 
          detail: limits 
        }));
      }
    )
    .subscribe();
  
  return () => {
    window.removeEventListener('token-limits-updated', handleEvent);
    supabase.removeChannel(channel);
  };
}

export function subscribeToUserTokens(
  email: string,
  callback: (tokens: UserTokens) => void
): () => void {
  const normalizedEmail = email.toLowerCase().trim();
  
  const handleEvent = (event: Event) => {
    const customEvent = event as CustomEvent<{email: string; dailyRemaining: number; monthlyRemaining: number}>;
    if (customEvent.detail && customEvent.detail.email === normalizedEmail) {
      getUserTokens(normalizedEmail).then(callback);
    }
  };
  
  window.addEventListener('tokens-updated', handleEvent);
  
  const channel = supabase
    .channel(`user-tokens-${normalizedEmail}`)
    .on(
      'postgres_changes',
      { 
        event: '*', 
        schema: 'public', 
        table: 'user_token_balances',
        filter: `user_email=eq.${normalizedEmail}`
      },
      async (payload) => {
        console.log('[Realtime] User tokens changed:', payload);
        const tokens = await getUserTokens(normalizedEmail);
        callback(tokens);
      }
    )
    .subscribe();
  
  return () => {
    window.removeEventListener('tokens-updated', handleEvent);
    supabase.removeChannel(channel);
  };
}

export async function getUserTokens(email: string): Promise<UserTokens> {
  if (!email) throw new Error("Email is required for token tracking");
  
  const normalizedEmail = email.toLowerCase().trim();
  const adminLimits = await getAdminTokenLimits();
  
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const thisMonth = now.toISOString().slice(0, 7);
  
  try {
    const { data, error } = await supabase
      .from('user_token_balances')
      .select('*')
      .eq('user_email', normalizedEmail)
      .single();
    
    if (data) {
      const lastDailyDate = data.last_daily_reset.split('T')[0];
      const lastMonthlyDate = data.last_monthly_reset.slice(0, 7);
      
      let needsUpdate = false;
      let dailyRemaining = data.daily_tokens_remaining;
      let monthlyRemaining = data.monthly_tokens_remaining;
      let lastDailyReset = data.last_daily_reset;
      let lastMonthlyReset = data.last_monthly_reset;
      
        const storedDailyLimit = data.daily_limit || adminLimits.dailyLimit;
        const storedMonthlyLimit = data.monthly_limit || adminLimits.monthlyLimit;
      
      if (storedDailyLimit !== adminLimits.dailyLimit || storedMonthlyLimit !== adminLimits.monthlyLimit) {
        needsUpdate = true;
      }
      
      if (lastMonthlyDate !== thisMonth) {
        monthlyRemaining = adminLimits.monthlyLimit;
        lastMonthlyReset = now.toISOString();
        needsUpdate = true;
      }
      
        if (lastDailyDate !== today) {
          // ROLLOVER: Add unused daily tokens to monthly before resetting
          const unusedDailyTokens = dailyRemaining;
          if (unusedDailyTokens > 0) {
            monthlyRemaining = monthlyRemaining + unusedDailyTokens;
          }
          dailyRemaining = adminLimits.dailyLimit;
          lastDailyReset = now.toISOString();
          needsUpdate = true;
        }

      
      if (needsUpdate) {
        await supabase
          .from('user_token_balances')
          .update({
            daily_tokens_remaining: dailyRemaining,
            monthly_tokens_remaining: monthlyRemaining,
            daily_limit: adminLimits.dailyLimit,
            monthly_limit: adminLimits.monthlyLimit,
            last_daily_reset: lastDailyReset,
            last_monthly_reset: lastMonthlyReset,
            updated_at: now.toISOString()
          })
          .eq('user_email', normalizedEmail);
        
        window.dispatchEvent(new CustomEvent('tokens-updated', { 
          detail: { 
            email: normalizedEmail, 
            dailyRemaining,
            monthlyRemaining,
            rollover: true
          } 
        }));
      }
      
      // Monthly = monthlyLimit - dailyUsed (simple subtraction)
        const dailyUsed = adminLimits.dailyLimit - dailyRemaining;
        const calculatedMonthlyRemaining = adminLimits.monthlyLimit - dailyUsed;
        
        return {
          email: normalizedEmail,
          dailyTokensRemaining: dailyRemaining,
          monthlyTokensRemaining: calculatedMonthlyRemaining,
          dailyLimit: adminLimits.dailyLimit,
          monthlyLimit: adminLimits.monthlyLimit,
          lastDailyReset: lastDailyReset,
          lastMonthlyReset: lastMonthlyReset
        };
    }
  } catch (e) {
    console.log("Creating new token record for user");
  }
  
  const newTokens = {
    user_email: normalizedEmail,
    daily_tokens_remaining: adminLimits.dailyLimit,
    monthly_tokens_remaining: adminLimits.monthlyLimit,
    daily_limit: adminLimits.dailyLimit,
    monthly_limit: adminLimits.monthlyLimit,
    last_daily_reset: now.toISOString(),
    last_monthly_reset: now.toISOString()
  };
  
  await supabase.from('user_token_balances').upsert(newTokens);
  
  return {
    email: normalizedEmail,
    dailyTokensRemaining: adminLimits.dailyLimit,
    monthlyTokensRemaining: adminLimits.monthlyLimit,
    dailyLimit: adminLimits.dailyLimit,
    monthlyLimit: adminLimits.monthlyLimit,
    lastDailyReset: now.toISOString(),
    lastMonthlyReset: now.toISOString()
  };
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function estimateMessageTokens(
  userMessage: string,
  systemPrompt?: string
): { inputTokens: number; estimatedOutputTokens: number; totalEstimate: number } {
  // Use exact logic: chars / 4 rounded up
  const userTokens = estimateTokens(userMessage);
  
  // We don't charge for system prompt tokens in the user's estimation logic
  // to avoid the "300 tokens for 'hi'" issue
  const inputTokens = userTokens;
  const estimatedOutputTokens = Math.ceil(userTokens * 1.5); // reduced multiplier
  
  return {
    inputTokens,
    estimatedOutputTokens,
    totalEstimate: inputTokens + estimatedOutputTokens
  };
}

export async function deductTokens(
  email: string, 
  tokensUsed: number,
  promptTokens?: number,
  completionTokens?: number,
  model?: string,
  sessionId?: string
): Promise<{ 
  success: boolean; 
  dailyRemaining: number; 
  monthlyRemaining: number; 
  dailyExhausted: boolean; 
  monthlyExhausted: boolean 
}> {
  const normalizedEmail = email.toLowerCase().trim();
  const tokens = await getUserTokens(normalizedEmail);
  
  // Deduct from daily
  const dailyRemaining = Math.max(0, tokens.dailyTokensRemaining - tokensUsed);
  
  // Monthly = monthlyLimit - dailyUsed (simple subtraction)
  const dailyUsed = tokens.dailyLimit - dailyRemaining;
  const monthlyRemaining = tokens.monthlyLimit - dailyUsed;
  
  const { error } = await supabase
    .from('user_token_balances')
    .update({
      daily_tokens_remaining: dailyRemaining,
      monthly_tokens_remaining: monthlyRemaining,
      updated_at: new Date().toISOString()
    })
    .eq('user_email', normalizedEmail);
  
  if (error) {
    console.error('Error updating tokens:', error);
  }
  
    window.dispatchEvent(new CustomEvent('tokens-updated', {
    detail: { 
      email: normalizedEmail, 
      dailyRemaining,
      monthlyRemaining
    } 
  }));
  
  return {
    success: !error,
    dailyRemaining,
    monthlyRemaining,
    dailyExhausted: dailyRemaining <= 0,
    monthlyExhausted: monthlyRemaining <= 0
  };
}

export async function getUserSubscription(email: string): Promise<UserSubscription> {
  const normalizedEmail = email.toLowerCase().trim();
  
  const cachedKey = `subscription_${normalizedEmail}`;
  const cached = localStorage.getItem(cachedKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      const now = new Date();
      const endsAt = new Date(parsed.subscriptionEndsAt);
      
      if (endsAt.getTime() > now.getTime()) {
        const daysRemaining = Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        return {
          email: normalizedEmail,
          subscriptionStartedAt: parsed.subscriptionStartedAt,
          subscriptionEndsAt: parsed.subscriptionEndsAt,
          isActive: true,
          daysRemaining
        };
      }
    } catch (e) {
    }
  }
  
  try {
    const { data } = await supabase
      .from('users')
      .select('subscription_started_at, subscription_expires_at')
      .eq('email', normalizedEmail)
      .single();
    
    if (data && data.subscription_expires_at) {
      const now = new Date();
      const expiresAt = new Date(data.subscription_expires_at);
      const daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      const isActive = daysRemaining > 0;
      
      localStorage.setItem(cachedKey, JSON.stringify({
        subscriptionStartedAt: data.subscription_started_at,
        subscriptionEndsAt: data.subscription_expires_at
      }));
      
      return {
        email: normalizedEmail,
        subscriptionStartedAt: data.subscription_started_at || now.toISOString(),
        subscriptionEndsAt: data.subscription_expires_at,
        isActive,
        daysRemaining
      };
    }
  } catch (e) {
    console.log("No subscription found for user");
  }
  
  const now = new Date();
  const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  
  const newSubscription = {
    subscriptionStartedAt: now.toISOString(),
    subscriptionEndsAt: endsAt.toISOString()
  };
  localStorage.setItem(cachedKey, JSON.stringify(newSubscription));
  
  try {
    await supabase
      .from('users')
      .upsert({
        email: normalizedEmail,
        subscription_started_at: now.toISOString(),
        subscription_expires_at: endsAt.toISOString(),
        is_verified: true,
        is_subscribed: true
      }, { onConflict: 'email' });
  } catch (e) {
    console.log("Could not save subscription to database, using local cache");
  }
  
  return {
    email: normalizedEmail,
    subscriptionStartedAt: now.toISOString(),
    subscriptionEndsAt: endsAt.toISOString(),
    isActive: true,
    daysRemaining: 30
  };
}

export async function renewSubscription(email: string): Promise<UserSubscription> {
  const normalizedEmail = email.toLowerCase().trim();
  
  const now = new Date();
  const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  
  const cachedKey = `subscription_${normalizedEmail}`;
  localStorage.setItem(cachedKey, JSON.stringify({
    subscriptionStartedAt: now.toISOString(),
    subscriptionEndsAt: endsAt.toISOString()
  }));
  
  await supabase
    .from('users')
    .update({
      subscription_started_at: now.toISOString(),
      subscription_expires_at: endsAt.toISOString()
    })
    .eq('email', normalizedEmail);
  
  return {
    email: normalizedEmail,
    subscriptionStartedAt: now.toISOString(),
    subscriptionEndsAt: endsAt.toISOString(),
    isActive: true,
    daysRemaining: 30
  };
}

export async function addMonthlyTokens(email: string, tokensToAdd: number): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  const tokens = await getUserTokens(normalizedEmail);
  
  await supabase
    .from('user_token_balances')
    .update({
      monthly_tokens_remaining: tokens.monthlyTokensRemaining + tokensToAdd,
      updated_at: new Date().toISOString()
    })
    .eq('user_email', normalizedEmail);
  
  window.dispatchEvent(new Event('tokens-updated'));
}

export async function restoreUserTokens(email: string, dailyLimit: number, monthlyLimit: number): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  
  await supabase
    .from('user_token_balances')
    .upsert({
      user_email: normalizedEmail,
      daily_tokens_remaining: dailyLimit,
      monthly_tokens_remaining: monthlyLimit,
      daily_limit: dailyLimit,
      monthly_limit: monthlyLimit,
      updated_at: new Date().toISOString()
    });
  
  const now = new Date();
  const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  
  await supabase
    .from('users')
    .update({
      subscription_started_at: now.toISOString(),
      subscription_expires_at: endsAt.toISOString(),
      is_verified: true,
      is_subscribed: true
    })
    .eq('email', normalizedEmail);
  
  window.dispatchEvent(new Event('tokens-updated'));
}

export function getTimeUntilMidnight(): { hours: number; minutes: number; seconds: number; totalMs: number } {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  
  const diff = midnight.getTime() - now.getTime();
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  return { hours, minutes, seconds, totalMs: diff };
}

export function getSubscriptionCountdown(endsAt: string): { 
  days: number; 
  hours: number; 
  minutes: number; 
  seconds: number; 
  totalMs: number; 
  expired: boolean 
} {
  const now = new Date();
  const endDate = new Date(endsAt);
  const diff = endDate.getTime() - now.getTime();
  
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0, expired: true };
  }
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  return { days, hours, minutes, seconds, totalMs: diff, expired: false };
}

export function getTimeUntilDailyReset(lastReset: string): { hours: number; minutes: number; seconds: number; totalMs: number } {
  const lastResetDate = new Date(lastReset);
  const nextReset = new Date(lastResetDate);
  nextReset.setDate(nextReset.getDate() + 1);
  nextReset.setHours(0, 0, 0, 0);
  
  const now = new Date();
  const diff = nextReset.getTime() - now.getTime();
  
  if (diff <= 0) {
    return { hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
  }
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  return { hours, minutes, seconds, totalMs: diff };
}
