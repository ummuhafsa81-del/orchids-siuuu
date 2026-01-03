import { useState, useEffect, useCallback } from 'react';
import {
  getTokenStats,
  subscribeToTokenUsage,
  subscribeToTokenLimits,
  TokenStats,
} from '../lib/tokenManagement';

export function useTokenStats(userEmail: string | null) {
  const [stats, setStats] = useState<TokenStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userEmail) return;
    try {
      const data = await getTokenStats(userEmail);
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load token stats');
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  useEffect(() => {
    if (!userEmail) {
      setLoading(false);
      return;
    }

    refresh();

    const unsubUsage = subscribeToTokenUsage(userEmail, () => {
      refresh();
    });

    const unsubLimits = subscribeToTokenLimits(userEmail, () => {
      refresh();
    });

    return () => {
      unsubUsage();
      unsubLimits();
    };
  }, [userEmail, refresh]);

  return { stats, loading, error, refresh };
}
