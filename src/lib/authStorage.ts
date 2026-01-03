import { supabase } from './supabase';

const ADMIN_EMAIL = 'abdisamadbashir14@gmail.com';
const ADMIN_PASSWORD = 'Xr7!vG$92dLq@Mez';

export interface UserAccount {
  email: string;
  passwordHash: string;
  createdAt: string;
  paymentStatus: 'pending' | 'completed';
  subscriptionId?: string;
  isAdmin: boolean;
  subscriptionStartedAt?: string;
  subscriptionEndsAt?: string;
}

function hashPassword(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `hash_${Math.abs(hash).toString(16)}_${password.length}`;
}

export function isAdminCredentials(email: string, password: string): boolean {
  return email.toLowerCase().trim() === ADMIN_EMAIL && password === ADMIN_PASSWORD;
}

export async function validateSignupEmail(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, is_verified, is_subscribed')
      .eq('email', normalizedEmail)
      .single();
    
    if (existingUser && existingUser.is_verified && existingUser.is_subscribed) {
      return { success: false, error: 'Account already exists. Please login.' };
    }
    
    return { success: true };
  } catch (err) {
    return { success: true };
  }
}

export async function verifyUserAfterPayment(
  email: string, 
  password?: string,
  subscriptionId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const now = new Date();
    const subscriptionExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();
    
    if (!existingUser) {
      if (!password) {
        return { success: false, error: 'Account credentials missing.' };
      }
      
      const { error: insertError } = await supabase
        .from('users')
        .insert([
          {
            email: normalizedEmail,
            password_hash: hashPassword(password),
            is_verified: true,
            is_subscribed: true,
            subscription_started_at: now.toISOString(),
            subscription_expires_at: subscriptionExpiresAt.toISOString()
          }
        ]);
      
      if (insertError) {
        console.error('Insert error:', insertError);
        return { success: false, error: 'Failed to create account.' };
      }
    } else {
      const updateData: any = {
        is_verified: true,
        is_subscribed: true,
        subscription_started_at: now.toISOString(),
        subscription_expires_at: subscriptionExpiresAt.toISOString()
      };
      
      if (password && !existingUser.password_hash) {
        updateData.password_hash = hashPassword(password);
      }
      
      const { error: updateError } = await supabase
        .from('users')
        .update(updateData)
        .eq('email', normalizedEmail);
      
      if (updateError) {
        console.error('Update error:', updateError);
        return { success: false, error: 'Failed to verify account.' };
      }
    }
    
    return { success: true };
  } catch (err) {
    console.error('Error in verifyUserAfterPayment:', err);
    return { success: false, error: 'An unexpected error occurred.' };
  }
}

export async function validateLogin(
  email: string, 
  password: string
): Promise<{ success: boolean; isAdmin: boolean; error?: string }> {
  if (email.toLowerCase().trim() === ADMIN_EMAIL) {
    if (password === ADMIN_PASSWORD) {
      return { success: true, isAdmin: true };
    } else {
      return { success: false, isAdmin: false, error: 'Invalid admin credentials.' };
    }
  }
  
  try {
    const normalizedEmail = email.toLowerCase().trim();
    
    const { data: userData, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();
    
    if (error || !userData) {
      return { success: false, isAdmin: false, error: 'Account not found. Please sign up and complete payment.' };
    }
    
    if (!userData.is_verified || !userData.is_subscribed) {
      return { success: false, isAdmin: false, error: 'Payment not completed.' };
    }
    
    if (userData.subscription_expires_at) {
      const expiresAt = new Date(userData.subscription_expires_at);
      if (expiresAt.getTime() < Date.now()) {
        return { success: false, isAdmin: false, error: 'Subscription expired. Please renew.' };
      }
    }
    
    const inputHash = hashPassword(password);
    if (userData.password_hash !== inputHash) {
      return { success: false, isAdmin: false, error: 'Invalid password.' };
    }
    
    return { success: true, isAdmin: false };
  } catch (err) {
    console.error('Error in validateLogin:', err);
    return { success: false, isAdmin: false, error: 'An unexpected error occurred.' };
  }
}

export async function deletePendingUser(email: string): Promise<void> {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    await supabase.from('users').delete().eq('email', normalizedEmail).eq('is_verified', false);
  } catch (err) {
    console.error('Error deleting pending user:', err);
  }
}

export async function getUserData(email: string): Promise<UserAccount | null> {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();
    
    if (error || !data) return null;
    
    return {
      email: data.email,
      passwordHash: data.password_hash,
      createdAt: data.created_at,
      paymentStatus: data.is_verified && data.is_subscribed ? 'completed' : 'pending',
      subscriptionId: undefined,
      isAdmin: false,
      subscriptionStartedAt: data.subscription_started_at,
      subscriptionEndsAt: data.subscription_expires_at
    };
  } catch {
    return null;
  }
}

export interface UserStats {
  totalUsers: number;
  verifiedUsers: number;
  pendingUsers: number;
  activeUsers?: number;
  usersByDate: { date: string; count: number }[];
}

export async function getAllUserStats(): Promise<UserStats> {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('email, is_verified, is_subscribed, created_at, subscription_expires_at');
    
    if (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
    
    if (!users) {
      return {
        totalUsers: 0,
        verifiedUsers: 0,
        pendingUsers: 0,
        activeUsers: 0,
        usersByDate: []
      };
    }
    
    const now = new Date();
    const verifiedCount = users.filter(u => u.is_verified && u.is_subscribed).length;
    const pendingCount = users.filter(u => !u.is_verified || !u.is_subscribed).length;
    
    const activeCount = users.filter(u => {
      if (!u.is_verified || !u.is_subscribed || !u.subscription_expires_at) return false;
      return new Date(u.subscription_expires_at) > now;
    }).length;
    
    const dateGroups: Record<string, number> = {};
    users.forEach(u => {
      const date = u.created_at?.split('T')[0];
      if (date) {
        dateGroups[date] = (dateGroups[date] || 0) + 1;
      }
    });
    
    const usersByDate = Object.entries(dateGroups)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);
    
    return {
      totalUsers: users.length,
      verifiedUsers: verifiedCount,
      pendingUsers: pendingCount,
      activeUsers: activeCount,
      usersByDate
    };
  } catch (err) {
    console.error('Error getting user stats:', err);
    return {
      totalUsers: 0,
      verifiedUsers: 0,
      pendingUsers: 0,
      activeUsers: 0,
      usersByDate: []
    };
  }
}

export async function getSubscriptionInfo(email: string): Promise<{
  startedAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  remainingMs: number;
}> {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const { data } = await supabase
      .from('users')
      .select('subscription_started_at, subscription_expires_at')
      .eq('email', normalizedEmail)
      .single();
    
    if (data && data.subscription_expires_at) {
      const expiresAt = new Date(data.subscription_expires_at);
      const now = new Date();
      const remainingMs = Math.max(0, expiresAt.getTime() - now.getTime());
      
      return {
        startedAt: data.subscription_started_at,
        endsAt: data.subscription_expires_at,
        isActive: remainingMs > 0,
        remainingMs
      };
    }
  } catch (e) {
    console.error('Error getting subscription info:', e);
  }
  
  return {
    startedAt: null,
    endsAt: null,
    isActive: false,
    remainingMs: 0
  };
}
