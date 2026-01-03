import { useState, useEffect } from 'react';
import { getSubscriptionCountdown, getUserSubscription } from '@/lib/tokenStorage';
import { getSubscriptionInfo } from '@/lib/authStorage';

interface SubscriptionTimerProps {
  userEmail: string;
  onExpired: () => void;
}

export function SubscriptionTimer({ userEmail, onExpired }: SubscriptionTimerProps) {
  const [countdown, setCountdown] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    expired: boolean;
  } | null>(null);
  const [endsAt, setEndsAt] = useState<string | null>(null);

  useEffect(() => {
    const loadSubscription = async () => {
      if (!userEmail) return;
      
      // First try to get from users table (stored subscription)
      const info = await getSubscriptionInfo(userEmail);
      if (info.endsAt) {
        setEndsAt(info.endsAt);
        return;
      }
      
      // Fallback: use getUserSubscription which creates a 30-day default if none exists
      const subscription = await getUserSubscription(userEmail);
      if (subscription.subscriptionEndsAt) {
        setEndsAt(subscription.subscriptionEndsAt);
      }
    };
    
    loadSubscription();
  }, [userEmail]);

  useEffect(() => {
    if (!endsAt) return;

    const updateCountdown = () => {
      const result = getSubscriptionCountdown(endsAt);
      setCountdown(result);
      
      if (result.expired) {
        onExpired();
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [endsAt, onExpired]);

  if (!countdown || !endsAt) {
    return null;
  }

  if (countdown.expired) {
    return (
      <div className="fixed top-4 right-4 z-50 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg font-mono text-sm">
        Subscription Expired
      </div>
    );
  }

  return (
    <div className="fixed top-4 right-4 z-50 bg-gradient-to-r from-nova-pink to-nova-coral text-white px-4 py-2 rounded-lg shadow-lg">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
        <span className="text-xs font-medium uppercase tracking-wider opacity-90">Subscription</span>
      </div>
      <div className="font-mono text-lg font-bold tabular-nums mt-1">
        {countdown.days > 0 && (
          <span>{countdown.days}d </span>
        )}
        <span>{String(countdown.hours).padStart(2, '0')}</span>
        <span className="animate-pulse">:</span>
        <span>{String(countdown.minutes).padStart(2, '0')}</span>
        <span className="animate-pulse">:</span>
        <span>{String(countdown.seconds).padStart(2, '0')}</span>
      </div>
    </div>
  );
}
