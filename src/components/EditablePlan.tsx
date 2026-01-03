import React, { useState, useEffect, useCallback } from 'react';
import { 
  AIPlan, 
  PlanStep, 
  aiPlanManager 
} from '@/lib/automation/aiPlanManager';
import { 
  Play, 
  Pause, 
  Square, 
  Plus, 
  Trash2, 
  ChevronUp, 
  ChevronDown, 
  Edit2, 
  Check, 
  X, 
  Camera,
  Clock,
  AlertCircle,
  CheckCircle,
  Circle,
  SkipForward,
  GripVertical,
  Copy,
  Download,
  Upload
} from 'lucide-react';

interface EditablePlanProps {
  planId: string;
  onRunPlan?: (planId: string) => void;
  onPausePlan?: (planId: string) => void;
  onStopPlan?: (planId: string) => void;
  onStepClick?: (step: PlanStep) => void;
  readOnly?: boolean;
}

const ACTION_OPTIONS: PlanStep['action'][] = [
  'click', 'type', 'navigate', 'wait', 'scroll', 'screenshot', 'verify', 'custom'
];

const STATUS_ICONS: Record<PlanStep['status'], React.ReactNode> = {
  pending: <Circle className="w-4 h-4 text-zinc-400" />,
  in_progress: <Clock className="w-4 h-4 text-amber-500 animate-pulse" />,
  completed: <CheckCircle className="w-4 h-4 text-emerald-500" />,
  failed: <AlertCircle className="w-4 h-4 text-red-500" />,
  skipped: <SkipForward className="w-4 h-4 text-zinc-500" />
};

const STATUS_COLORS: Record<PlanStep['status'], string> = {
  pending: 'border-zinc-700 bg-zinc-800/50',
  in_progress: 'border-amber-500/50 bg-amber-500/10',
  completed: 'border-emerald-500/50 bg-emerald-500/10',
  failed: 'border-red-500/50 bg-red-500/10',
  skipped: 'border-zinc-600 bg-zinc-700/30'
};

export function EditablePlan({ 
  planId, 
  onRunPlan, 
  onPausePlan, 
  onStopPlan,
  onStepClick,
  readOnly = false 
}: EditablePlanProps) {
  const [plan, setPlan] = useState<AIPlan | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingPlanName, setEditingPlanName] = useState(false);
  const [newStepDescription, setNewStepDescription] = useState('');
  const [newStepAction, setNewStepAction] = useState<PlanStep['action']>('custom');
  const [newStepTarget, setNewStepTarget] = useState('');
  const [newStepValue, setNewStepValue] = useState('');
  const [showAddStep, setShowAddStep] = useState(false);
  const [draggedStepId, setDraggedStepId] = useState<string | null>(null);

  useEffect(() => {
    const handlePlanChange = (updatedPlan: AIPlan) => {
      if (updatedPlan.id === planId) {
        setPlan({ ...updatedPlan });
      }
    };

    aiPlanManager.addListener(handlePlanChange);
    const initialPlan = aiPlanManager.getPlan(planId);
    if (initialPlan) setPlan(initialPlan);

    return () => {
      aiPlanManager.removeListener(handlePlanChange);
    };
  }, [planId]);

  const handleAddStep = useCallback(() => {
    if (!newStepDescription.trim()) return;

    aiPlanManager.addStep(planId, {
      description: newStepDescription,
      action: newStepAction,
      target: newStepTarget || undefined,
      value: newStepValue || undefined
    });

    setNewStepDescription('');
    setNewStepTarget('');
    setNewStepValue('');
    setShowAddStep(false);
  }, [planId, newStepDescription, newStepAction, newStepTarget, newStepValue]);

  const handleRemoveStep = useCallback((stepId: string) => {
    aiPlanManager.removeStep(planId, stepId);
  }, [planId]);

  const handleMoveUp = useCallback((stepId: string) => {
    aiPlanManager.moveStepUp(planId, stepId);
  }, [planId]);

  const handleMoveDown = useCallback((stepId: string) => {
    aiPlanManager.moveStepDown(planId, stepId);
  }, [planId]);

  const handleUpdateStep = useCallback((stepId: string, changes: Partial<PlanStep>) => {
    aiPlanManager.updateStep(planId, stepId, changes);
    setEditingStepId(null);
  }, [planId]);

  const handleDuplicatePlan = useCallback(() => {
    const newPlan = aiPlanManager.duplicatePlan(planId);
    alert(`Plan duplicated! New ID: ${newPlan.id}`);
  }, [planId]);

  const handleExportPlan = useCallback(() => {
    const json = aiPlanManager.exportPlan(planId);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plan-${planId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [planId]);

  const handleDragStart = (stepId: string) => {
    setDraggedStepId(stepId);
  };

  const handleDragOver = (e: React.DragEvent, targetStepId: string) => {
    e.preventDefault();
    if (!draggedStepId || draggedStepId === targetStepId) return;
  };

  const handleDrop = (targetStepId: string) => {
    if (!draggedStepId || draggedStepId === targetStepId || !plan) return;

    const steps = [...plan.steps];
    const draggedIndex = steps.findIndex(s => s.id === draggedStepId);
    const targetIndex = steps.findIndex(s => s.id === targetStepId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newOrder = steps.map(s => s.id);
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedStepId);

    aiPlanManager.reorderSteps(planId, newOrder);
    setDraggedStepId(null);
  };

  if (!plan) {
    return (
      <div className="p-4 text-center text-zinc-500">
        Plan not found
      </div>
    );
  }

  const isRunning = plan.status === 'running';
  const isPaused = plan.status === 'paused';
  const completedSteps = plan.steps.filter(s => s.status === 'completed').length;
  const progress = plan.steps.length > 0 
    ? Math.round((completedSteps / plan.steps.length) * 100) 
    : 0;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          {editingPlanName && !readOnly ? (
            <input
              type="text"
              defaultValue={plan.name}
              className="bg-zinc-800 px-2 py-1 rounded text-white flex-1 mr-2"
              onBlur={(e) => {
                aiPlanManager.updateStep(planId, plan.steps[0]?.id || '', {});
                setEditingPlanName(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setEditingPlanName(false);
              }}
              autoFocus
            />
          ) : (
            <h3 
              className="text-lg font-semibold text-white cursor-pointer hover:text-zinc-300"
              onClick={() => !readOnly && setEditingPlanName(true)}
            >
              {plan.name}
            </h3>
          )}
          
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-1 rounded ${
              plan.status === 'running' ? 'bg-amber-500/20 text-amber-400' :
              plan.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
              plan.status === 'failed' ? 'bg-red-500/20 text-red-400' :
              plan.status === 'paused' ? 'bg-blue-500/20 text-blue-400' :
              'bg-zinc-700 text-zinc-400'
            }`}>
              {plan.status}
            </span>
          </div>
        </div>

        <p className="text-sm text-zinc-400 mb-3">{plan.goal}</p>

        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-zinc-500">{completedSteps}/{plan.steps.length}</span>
        </div>

        <div className="flex items-center gap-2">
          {!isRunning && !isPaused && (
            <button
              onClick={() => onRunPlan?.(planId)}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded transition-colors"
            >
              <Play className="w-4 h-4" />
              Run
            </button>
          )}
          
          {isRunning && (
            <button
              onClick={() => onPausePlan?.(planId)}
              className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded transition-colors"
            >
              <Pause className="w-4 h-4" />
              Pause
            </button>
          )}
          
          {isPaused && (
            <button
              onClick={() => onRunPlan?.(planId)}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
            >
              <Play className="w-4 h-4" />
              Resume
            </button>
          )}
          
          {(isRunning || isPaused) && (
            <button
              onClick={() => onStopPlan?.(planId)}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded transition-colors"
            >
              <Square className="w-4 h-4" />
              Stop
            </button>
          )}

          <div className="flex-1" />

          <button
            onClick={handleDuplicatePlan}
            className="p-1.5 text-zinc-400 hover:text-white transition-colors"
            title="Duplicate plan"
          >
            <Copy className="w-4 h-4" />
          </button>
          
          <button
            onClick={handleExportPlan}
            className="p-1.5 text-zinc-400 hover:text-white transition-colors"
            title="Export plan"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="divide-y divide-zinc-800">
        {plan.steps.map((step, index) => (
          <div
            key={step.id}
            draggable={!readOnly && !isRunning}
            onDragStart={() => handleDragStart(step.id)}
            onDragOver={(e) => handleDragOver(e, step.id)}
            onDrop={() => handleDrop(step.id)}
            className={`p-3 ${STATUS_COLORS[step.status]} ${
              draggedStepId === step.id ? 'opacity-50' : ''
            } ${index === plan.currentStepIndex && isRunning ? 'ring-2 ring-amber-500' : ''}`}
            onClick={() => onStepClick?.(step)}
          >
            {editingStepId === step.id && !readOnly ? (
              <StepEditor
                step={step}
                onSave={(changes) => handleUpdateStep(step.id, changes)}
                onCancel={() => setEditingStepId(null)}
              />
            ) : (
              <div className="flex items-start gap-3">
                {!readOnly && !isRunning && (
                  <div className="cursor-grab text-zinc-600 hover:text-zinc-400 mt-0.5">
                    <GripVertical className="w-4 h-4" />
                  </div>
                )}
                
                <div className="mt-0.5">
                  {STATUS_ICONS[step.status]}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-1.5 py-0.5 bg-zinc-700 text-zinc-300 rounded">
                      {step.action}
                    </span>
                    <span className="text-sm text-white truncate">
                      {step.description}
                    </span>
                  </div>
                  
                  {step.target && (
                    <div className="text-xs text-zinc-500 truncate">
                      Target: <code className="text-zinc-400">{step.target}</code>
                    </div>
                  )}
                  
                  {step.value && (
                    <div className="text-xs text-zinc-500 truncate">
                      Value: <code className="text-zinc-400">{step.value}</code>
                    </div>
                  )}
                  
                  {step.error && (
                    <div className="text-xs text-red-400 mt-1">
                      Error: {step.error}
                    </div>
                  )}
                  
                  {step.result && (
                    <div className="text-xs text-emerald-400 mt-1">
                      {step.result}
                    </div>
                  )}

                  {step.screenshotBefore && (
                    <div className="mt-2 flex gap-2">
                      <img 
                        src={step.screenshotBefore} 
                        alt="Before" 
                        className="w-20 h-12 object-cover rounded border border-zinc-700"
                      />
                      {step.screenshotAfter && (
                        <img 
                          src={step.screenshotAfter} 
                          alt="After" 
                          className="w-20 h-12 object-cover rounded border border-zinc-700"
                        />
                      )}
                    </div>
                  )}
                </div>
                
                {!readOnly && !isRunning && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingStepId(step.id);
                      }}
                      className="p-1 text-zinc-500 hover:text-white transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveUp(step.id);
                      }}
                      disabled={index === 0}
                      className="p-1 text-zinc-500 hover:text-white transition-colors disabled:opacity-30"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveDown(step.id);
                      }}
                      disabled={index === plan.steps.length - 1}
                      className="p-1 text-zinc-500 hover:text-white transition-colors disabled:opacity-30"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveStep(step.id);
                      }}
                      className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {!readOnly && !isRunning && (
        <div className="p-3 border-t border-zinc-800">
          {showAddStep ? (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Step description..."
                value={newStepDescription}
                onChange={(e) => setNewStepDescription(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-500"
                autoFocus
              />
              
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={newStepAction}
                  onChange={(e) => setNewStepAction(e.target.value as PlanStep['action'])}
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white"
                >
                  {ACTION_OPTIONS.map(action => (
                    <option key={action} value={action}>{action}</option>
                  ))}
                </select>
                
                <input
                  type="text"
                  placeholder="Target (selector)"
                  value={newStepTarget}
                  onChange={(e) => setNewStepTarget(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white placeholder-zinc-500"
                />
                
                <input
                  type="text"
                  placeholder="Value"
                  value={newStepValue}
                  onChange={(e) => setNewStepValue(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white placeholder-zinc-500"
                />
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={handleAddStep}
                  disabled={!newStepDescription.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
                >
                  <Check className="w-4 h-4" />
                  Add Step
                </button>
                <button
                  onClick={() => setShowAddStep(false)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-sm rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddStep(true)}
              className="flex items-center gap-2 w-full px-3 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Step
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface StepEditorProps {
  step: PlanStep;
  onSave: (changes: Partial<PlanStep>) => void;
  onCancel: () => void;
}

function StepEditor({ step, onSave, onCancel }: StepEditorProps) {
  const [description, setDescription] = useState(step.description);
  const [action, setAction] = useState(step.action);
  const [target, setTarget] = useState(step.target || '');
  const [value, setValue] = useState(step.value || '');

  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-sm text-white"
        autoFocus
      />
      
      <div className="grid grid-cols-3 gap-2">
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as PlanStep['action'])}
          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm text-white"
        >
          {ACTION_OPTIONS.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        
        <input
          type="text"
          placeholder="Target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm text-white placeholder-zinc-500"
        />
        
        <input
          type="text"
          placeholder="Value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm text-white placeholder-zinc-500"
        />
      </div>
      
      <div className="flex gap-2">
        <button
          onClick={() => onSave({ description, action, target: target || undefined, value: value || undefined })}
          className="flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded"
        >
          <Check className="w-3 h-3" />
          Save
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1 px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-white text-xs rounded"
        >
          <X className="w-3 h-3" />
          Cancel
        </button>
      </div>
    </div>
  );
}

export default EditablePlan;
