import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, Circle, AlertCircle, XCircle, Clock } from "lucide-react";
import { AutomationTask, TaskStatus } from "@/lib/automation";
import { cn } from "@/lib/utils";

interface TaskChecklistProps {
  tasks: AutomationTask[];
  className?: string;
}

const statusConfig: Record<TaskStatus, { icon: typeof Check; color: string; bgColor: string; label: string }> = {
  pending: { icon: Circle, color: 'text-gray-300', bgColor: 'bg-gray-100', label: 'Waiting' },
  queued: { icon: Clock, color: 'text-blue-400', bgColor: 'bg-blue-50', label: 'Queued' },
  in_progress: { icon: Loader2, color: 'text-nova-pink', bgColor: 'bg-nova-pink/10', label: 'Running' },
  completed: { icon: Check, color: 'text-emerald-500', bgColor: 'bg-emerald-50', label: 'Done' },
  failed: { icon: AlertCircle, color: 'text-red-500', bgColor: 'bg-red-50', label: 'Failed' },
  cancelled: { icon: XCircle, color: 'text-gray-400', bgColor: 'bg-gray-50', label: 'Cancelled' },
};

export function TaskChecklist({ tasks, className }: TaskChecklistProps) {
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const progress = tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0;

  return (
    <div className={cn("bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden", className)}>
      <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-nova-pink animate-pulse" />
            <span className="font-semibold text-gray-900 text-sm">Live Execution</span>
          </div>
          <span className="text-xs text-gray-500 font-medium">
            {completedCount} / {tasks.length} completed
          </span>
        </div>
        
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-nova-pink to-nova-coral rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </div>

      <div className="divide-y divide-gray-50">
        <AnimatePresence mode="popLayout">
          {tasks.map((task, index) => {
            const config = statusConfig[task.status];
            const Icon = config.icon;
            const isActive = task.status === 'in_progress';

            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  "px-5 py-3.5 flex items-start gap-4 transition-colors",
                  isActive && "bg-nova-pink/5"
                )}
              >
                <div className="relative mt-0.5">
                  <motion.div
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center transition-colors",
                      config.bgColor
                    )}
                    animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                    transition={{ duration: 1.5, repeat: isActive ? Infinity : 0 }}
                  >
                    <Icon 
                      className={cn(
                        "w-4 h-4 transition-colors",
                        config.color,
                        task.status === 'in_progress' && "animate-spin"
                      )} 
                    />
                  </motion.div>
                  
                  {index < tasks.length - 1 && (
                    <div className={cn(
                      "absolute left-1/2 top-full w-0.5 h-3.5 -translate-x-1/2",
                      task.status === 'completed' ? "bg-emerald-200" : "bg-gray-100"
                    )} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={cn(
                      "text-sm font-medium truncate",
                      task.status === 'completed' && "text-gray-400 line-through",
                      task.status === 'in_progress' && "text-gray-900",
                      task.status === 'pending' && "text-gray-600",
                      task.status === 'failed' && "text-red-600",
                      task.status === 'cancelled' && "text-gray-400"
                    )}>
                      {task.action}
                    </p>
                    {isActive && (
                      <span className="flex-shrink-0 px-2 py-0.5 text-[10px] font-semibold text-nova-pink bg-nova-pink/10 rounded-full uppercase tracking-wider">
                        Active
                      </span>
                    )}
                  </div>
                  
                  {task.description && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{task.description}</p>
                  )}
                  
                  {task.error && (
                    <motion.p 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="text-xs text-red-500 mt-1"
                    >
                      {task.error}
                    </motion.p>
                  )}
                  
                  {isActive && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="text-xs text-nova-pink mt-1"
                    >
                      Executing via local agent...
                    </motion.p>
                  )}
                </div>

                {task.duration && task.status === 'completed' && (
                  <span className="text-[10px] text-gray-400 font-mono">
                    {(task.duration / 1000).toFixed(1)}s
                  </span>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div className="px-5 py-3 bg-gradient-to-r from-gray-50 to-white border-t border-gray-100">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>Local agent connected</span>
          <span className="text-gray-200">•</span>
          <span>Safety rules active</span>
        </div>
      </div>
    </div>
  );
}
