import { useState, useEffect } from 'react';
import {
  getTokenStats,
  subscribeToTokenUsage,
  subscribeToTokenLimits,
  TokenStats,
} from '../lib/tokenManagement';

interface TokenUsageDisplayProps {
  userEmail: string;
  compact?: boolean;
}

export function TokenUsageDisplay({ userEmail, compact = false }: TokenUsageDisplayProps) {
  const [stats, setStats] = useState<TokenStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userEmail) {
      setLoading(false);
      return;
    }
    
    let mounted = true;

    const loadStats = async () => {
      const data = await getTokenStats(userEmail);
      if (mounted) {
        setStats(data);
        setLoading(false);
      }
    };

    loadStats();

    const unsubUsage = subscribeToTokenUsage(userEmail, () => {
      loadStats();
    });

    const unsubLimits = subscribeToTokenLimits(userEmail, () => {
      loadStats();
    });

    // Listen for global token limits updates from admin
    const handleGlobalLimitsUpdate = () => {
      loadStats();
    };
    window.addEventListener('token-limits-updated', handleGlobalLimitsUpdate);

    return () => {
      mounted = false;
      unsubUsage();
      unsubLimits();
      window.removeEventListener('token-limits-updated', handleGlobalLimitsUpdate);
    };
  }, [userEmail]);

  if (loading) {
    return (
      <div className="animate-pulse bg-zinc-800/50 rounded-lg p-4">
        <div className="h-4 bg-zinc-700 rounded w-24 mb-2"></div>
        <div className="h-3 bg-zinc-700 rounded w-32"></div>
      </div>
    );
  }

  if (!stats) return null;

  const getColorClass = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  if (compact) {
    return (
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-zinc-400">Daily:</span>
          <div className="w-20 h-2 bg-zinc-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${getColorClass(stats.dailyPercentage)} transition-all duration-300`}
              style={{ width: `${stats.dailyPercentage}%` }}
            />
          </div>
          <span className="text-zinc-300 font-mono text-xs">
            {formatNumber(stats.dailyUsed)}/{formatNumber(stats.dailyLimit)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-400">Monthly:</span>
          <div className="w-20 h-2 bg-zinc-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${getColorClass(stats.monthlyPercentage)} transition-all duration-300`}
              style={{ width: `${stats.monthlyPercentage}%` }}
            />
          </div>
          <span className="text-zinc-300 font-mono text-xs">
            {formatNumber(stats.monthlyUsed)}/{formatNumber(stats.monthlyLimit)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 space-y-5">
      <h3 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
        <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        Token Usage
      </h3>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-zinc-400">Daily Usage</span>
            <span className="text-sm font-mono text-zinc-300">
              {formatNumber(stats.dailyUsed)} / {formatNumber(stats.dailyLimit)}
            </span>
          </div>
          <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full ${getColorClass(stats.dailyPercentage)} transition-all duration-500 ease-out`}
              style={{ width: `${stats.dailyPercentage}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-zinc-500">
              {stats.dailyPercentage.toFixed(1)}% used
            </span>
            <span className="text-xs text-zinc-500">
              {formatNumber(stats.dailyRemaining)} remaining
            </span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-zinc-400">Monthly Usage</span>
            <span className="text-sm font-mono text-zinc-300">
              {formatNumber(stats.monthlyUsed)} / {formatNumber(stats.monthlyLimit)}
            </span>
          </div>
          <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full ${getColorClass(stats.monthlyPercentage)} transition-all duration-500 ease-out`}
              style={{ width: `${stats.monthlyPercentage}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-zinc-500">
              {stats.monthlyPercentage.toFixed(1)}% used
            </span>
            <span className="text-xs text-zinc-500">
              {formatNumber(stats.monthlyRemaining)} remaining
            </span>
          </div>
        </div>
      </div>

      {(stats.dailyPercentage >= 90 || stats.monthlyPercentage >= 90) && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
          <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="text-sm">
            <p className="text-red-300 font-medium">Token limit warning</p>
            <p className="text-red-400/80">You're approaching your token limit. Consider upgrading your plan.</p>
          </div>
        </div>
      )}
    </div>
  );
}
