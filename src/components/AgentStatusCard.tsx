import { motion } from "framer-motion";
import { Cpu, Wifi, WifiOff, Circle, Shield } from "lucide-react";
import { AgentStatus } from "@/lib/automation";
import { cn } from "@/lib/utils";

interface AgentStatusCardProps {
  status: AgentStatus;
  isEnabled: boolean;
  className?: string;
}

export function AgentStatusCard({ status, isEnabled, className }: AgentStatusCardProps) {
  const getConnectionStatus = () => {
    if (!status.isInstalled) return { label: 'Not Installed', color: 'text-gray-400', dot: 'bg-gray-300' };
    if (!isEnabled) return { label: 'Standby', color: 'text-gray-500', dot: 'bg-gray-400' };
    if (status.isConnected) return { label: 'Connected', color: 'text-emerald-600', dot: 'bg-emerald-500' };
    return { label: 'Connecting...', color: 'text-amber-500', dot: 'bg-amber-400' };
  };

  const connectionStatus = getConnectionStatus();

  return (
    <div className={cn(
      "bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden",
      className
    )}>
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <motion.div 
              className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center",
                isEnabled && status.isConnected 
                  ? "bg-gradient-to-br from-nova-pink to-nova-coral" 
                  : "bg-gray-100"
              )}
              animate={isEnabled && status.isConnected ? { scale: [1, 1.02, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Cpu className={cn(
                "w-6 h-6",
                isEnabled && status.isConnected ? "text-white" : "text-gray-400"
              )} />
            </motion.div>
            
            <div>
              <h3 className="font-semibold text-gray-900">Local Agent</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <motion.div 
                  className={cn("w-2 h-2 rounded-full", connectionStatus.dot)}
                  animate={isEnabled && status.isConnected ? { opacity: [1, 0.5, 1] } : {}}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <span className={cn("text-sm", connectionStatus.color)}>
                  {connectionStatus.label}
                </span>
              </div>
            </div>
          </div>

          {status.isConnected && isEnabled ? (
            <Wifi className="w-5 h-5 text-emerald-500" />
          ) : (
            <WifiOff className="w-5 h-5 text-gray-300" />
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Version</p>
            <p className="text-sm font-mono text-gray-700">{status.version || '—'}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Status</p>
            <p className="text-sm text-gray-700">{status.isRunning ? 'Running' : 'Idle'}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Mode</p>
            <p className="text-sm text-gray-700">{isEnabled ? 'Active' : 'Off'}</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-3 bg-gradient-to-r from-gray-50 to-white border-t border-gray-100">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Shield className="w-3.5 h-3.5" />
          <span>Signed executable • Loopback only • Safety validated</span>
        </div>
      </div>
    </div>
  );
}
