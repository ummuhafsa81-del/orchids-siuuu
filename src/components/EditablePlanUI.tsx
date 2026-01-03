import { useState, useEffect, useCallback } from 'react';
import { aiPlanManager, AIPlan, PlanStep } from '../lib/automation/aiPlanManager';
import { visualAgent, AgentState, VerificationResult } from '../lib/automation/visualAgent';

interface EditablePlanUIProps {
  onPlanStart?: (planId: string) => void;
  onPlanComplete?: (planId: string) => void;
}

type ActionType = PlanStep['action'];

const ACTION_OPTIONS: { value: ActionType; label: string }[] = [
  { value: 'click', label: 'Click' },
  { value: 'type', label: 'Type' },
  { value: 'navigate', label: 'Navigate' },
  { value: 'wait', label: 'Wait' },
  { value: 'scroll', label: 'Scroll' },
  { value: 'screenshot', label: 'Screenshot' },
  { value: 'verify', label: 'Verify' },
  { value: 'custom', label: 'Custom' }
];

const STATUS_COLORS: Record<PlanStep['status'], string> = {
  pending: '#6b7280',
  in_progress: '#3b82f6',
  completed: '#22c55e',
  failed: '#ef4444',
  skipped: '#f59e0b'
};

const PHASE_LABELS: Record<AgentState['currentPhase'], string> = {
  idle: 'Idle',
  capturing_before: 'Capturing State (Before)',
  deciding: 'AI Deciding',
  executing: 'Executing Action',
  capturing_after: 'Capturing State (After)',
  verifying: 'Verifying Result'
};

export function EditablePlanUI({ onPlanStart, onPlanComplete }: EditablePlanUIProps) {
  const [plans, setPlans] = useState<AIPlan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [agentState, setAgentState] = useState<AgentState>(visualAgent.getState());
  const [newPlanGoal, setNewPlanGoal] = useState('');
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [lastVerification, setLastVerification] = useState<VerificationResult | null>(null);
  const [showAddStep, setShowAddStep] = useState(false);
  const [newStep, setNewStep] = useState<Partial<PlanStep>>({
    action: 'click',
    description: '',
    target: '',
    value: ''
  });

  useEffect(() => {
    const handlePlanChange = (plan: AIPlan) => {
      setPlans(aiPlanManager.getAllPlans());
      if (plan.status === 'completed') {
        onPlanComplete?.(plan.id);
      }
    };

    const handleAgentEvent = (event: { type: string; data: Record<string, unknown> }) => {
      if (event.type === 'state_change' || event.type === 'phase_change') {
        setAgentState(visualAgent.getState());
      }
      if (event.type === 'step_verified' && event.data.verification) {
        setLastVerification(event.data.verification as VerificationResult);
      }
    };

    aiPlanManager.addListener(handlePlanChange);
    visualAgent.addEventListener(handleAgentEvent);
    setPlans(aiPlanManager.getAllPlans());

    return () => {
      aiPlanManager.removeListener(handlePlanChange);
      visualAgent.removeEventListener(handleAgentEvent);
    };
  }, [onPlanComplete]);

  const activePlan = activePlanId ? aiPlanManager.getPlan(activePlanId) : null;

  const handleCreatePlan = useCallback(() => {
    if (!newPlanGoal.trim()) return;
    const plan = aiPlanManager.createPlan(
      newPlanGoal.substring(0, 50),
      newPlanGoal
    );
    setActivePlanId(plan.id);
    setNewPlanGoal('');
  }, [newPlanGoal]);

  const handleAddStep = useCallback(() => {
    if (!activePlanId || !newStep.description) return;
    aiPlanManager.addStep(activePlanId, newStep);
    setNewStep({ action: 'click', description: '', target: '', value: '' });
    setShowAddStep(false);
  }, [activePlanId, newStep]);

  const handleUpdateStep = useCallback((stepId: string, changes: Partial<PlanStep>) => {
    if (!activePlanId) return;
    aiPlanManager.updateStep(activePlanId, stepId, changes);
  }, [activePlanId]);

  const handleDeleteStep = useCallback((stepId: string) => {
    if (!activePlanId) return;
    aiPlanManager.removeStep(activePlanId, stepId);
  }, [activePlanId]);

  const handleMoveStep = useCallback((stepId: string, direction: 'up' | 'down') => {
    if (!activePlanId) return;
    if (direction === 'up') {
      aiPlanManager.moveStepUp(activePlanId, stepId);
    } else {
      aiPlanManager.moveStepDown(activePlanId, stepId);
    }
  }, [activePlanId]);

  const handleStartPlan = useCallback(async () => {
    if (!activePlanId) return;
    onPlanStart?.(activePlanId);
    await visualAgent.startPlan(activePlanId);
  }, [activePlanId, onPlanStart]);

  const handlePausePlan = useCallback(() => {
    visualAgent.pause();
  }, []);

  const handleResumePlan = useCallback(async () => {
    await visualAgent.resume();
  }, []);

  const handleStopPlan = useCallback(() => {
    visualAgent.stop();
  }, []);

  const handleDeletePlan = useCallback((planId: string) => {
    aiPlanManager.deletePlan(planId);
    if (activePlanId === planId) {
      setActivePlanId(null);
    }
  }, [activePlanId]);

  const handleDuplicatePlan = useCallback((planId: string) => {
    const newPlan = aiPlanManager.duplicatePlan(planId);
    setActivePlanId(newPlan.id);
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>AI Automation Plans</h2>
        <div style={styles.statusBadge}>
          <span style={{
            ...styles.statusDot,
            backgroundColor: agentState.isRunning ? '#22c55e' : '#6b7280'
          }} />
          {PHASE_LABELS[agentState.currentPhase]}
        </div>
      </div>

      <div style={styles.createSection}>
        <input
          type="text"
          value={newPlanGoal}
          onChange={(e) => setNewPlanGoal(e.target.value)}
          placeholder="Enter automation goal..."
          style={styles.input}
          onKeyDown={(e) => e.key === 'Enter' && handleCreatePlan()}
        />
        <button onClick={handleCreatePlan} style={styles.primaryButton}>
          Create Plan
        </button>
      </div>

      <div style={styles.plansList}>
        {plans.map(plan => (
          <div
            key={plan.id}
            style={{
              ...styles.planCard,
              borderColor: activePlanId === plan.id ? '#3b82f6' : '#374151'
            }}
            onClick={() => setActivePlanId(plan.id)}
          >
            <div style={styles.planHeader}>
              <span style={styles.planName}>{plan.name}</span>
              <span style={{
                ...styles.planStatus,
                backgroundColor: STATUS_COLORS[plan.status === 'draft' ? 'pending' : plan.status === 'running' ? 'in_progress' : plan.status === 'completed' ? 'completed' : plan.status === 'failed' ? 'failed' : 'pending']
              }}>
                {plan.status}
              </span>
            </div>
            <div style={styles.planMeta}>
              {plan.steps.length} steps • {plan.steps.filter(s => s.status === 'completed').length} completed
            </div>
            <div style={styles.planActions}>
              <button onClick={(e) => { e.stopPropagation(); handleDuplicatePlan(plan.id); }} style={styles.iconButton}>
                ⎘
              </button>
              <button onClick={(e) => { e.stopPropagation(); handleDeletePlan(plan.id); }} style={styles.iconButton}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {activePlan && (
        <div style={styles.planDetail}>
          <div style={styles.planDetailHeader}>
            <h3 style={styles.planDetailTitle}>{activePlan.name}</h3>
            <div style={styles.controlButtons}>
              {!agentState.isRunning && activePlan.status !== 'completed' && (
                <button onClick={handleStartPlan} style={styles.startButton}>
                  ▶ Start
                </button>
              )}
              {agentState.isRunning && !agentState.isPaused && (
                <button onClick={handlePausePlan} style={styles.pauseButton}>
                  ⏸ Pause
                </button>
              )}
              {agentState.isPaused && (
                <button onClick={handleResumePlan} style={styles.resumeButton}>
                  ▶ Resume
                </button>
              )}
              {agentState.isRunning && (
                <button onClick={handleStopPlan} style={styles.stopButton}>
                  ⏹ Stop
                </button>
              )}
            </div>
          </div>

          <p style={styles.planGoal}>{activePlan.goal}</p>

          {agentState.isRunning && (
            <div style={styles.progressBar}>
              <div style={{
                ...styles.progressFill,
                width: `${(activePlan.currentStepIndex / Math.max(activePlan.steps.length, 1)) * 100}%`
              }} />
            </div>
          )}

          <div style={styles.stepsList}>
            {activePlan.steps.map((step, index) => (
              <div
                key={step.id}
                style={{
                  ...styles.stepCard,
                  borderLeftColor: STATUS_COLORS[step.status],
                  backgroundColor: activePlan.currentStepIndex === index && agentState.isRunning ? '#1e3a5f' : '#1f2937'
                }}
              >
                <div style={styles.stepHeader}>
                  <span style={styles.stepNumber}>{index + 1}</span>
                  <span style={{
                    ...styles.stepStatus,
                    backgroundColor: STATUS_COLORS[step.status]
                  }}>
                    {step.status}
                  </span>
                  <span style={styles.stepAction}>{step.action}</span>
                </div>

                {editingStepId === step.id ? (
                  <div style={styles.editForm}>
                    <input
                      type="text"
                      value={step.description}
                      onChange={(e) => handleUpdateStep(step.id, { description: e.target.value })}
                      style={styles.editInput}
                      placeholder="Description"
                    />
                    <select
                      value={step.action}
                      onChange={(e) => handleUpdateStep(step.id, { action: e.target.value as ActionType })}
                      style={styles.editSelect}
                    >
                      {ACTION_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={step.target || ''}
                      onChange={(e) => handleUpdateStep(step.id, { target: e.target.value })}
                      style={styles.editInput}
                      placeholder="Target (selector or text)"
                    />
                    <input
                      type="text"
                      value={step.value || ''}
                      onChange={(e) => handleUpdateStep(step.id, { value: e.target.value })}
                      style={styles.editInput}
                      placeholder="Value"
                    />
                    <button onClick={() => setEditingStepId(null)} style={styles.doneButton}>
                      Done
                    </button>
                  </div>
                ) : (
                  <>
                    <p style={styles.stepDescription}>{step.description}</p>
                    {step.target && <code style={styles.stepTarget}>{step.target}</code>}
                    {step.value && <span style={styles.stepValue}>→ {step.value}</span>}
                    {step.result && <p style={styles.stepResult}>✓ {step.result}</p>}
                    {step.error && <p style={styles.stepError}>✕ {step.error}</p>}
                  </>
                )}

                <div style={styles.stepActions}>
                  <button onClick={() => handleMoveStep(step.id, 'up')} style={styles.moveButton} disabled={index === 0}>
                    ↑
                  </button>
                  <button onClick={() => handleMoveStep(step.id, 'down')} style={styles.moveButton} disabled={index === activePlan.steps.length - 1}>
                    ↓
                  </button>
                  <button onClick={() => setEditingStepId(step.id)} style={styles.editButton}>
                    ✎
                  </button>
                  <button onClick={() => handleDeleteStep(step.id)} style={styles.deleteButton}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          {showAddStep ? (
            <div style={styles.addStepForm}>
              <input
                type="text"
                value={newStep.description || ''}
                onChange={(e) => setNewStep({ ...newStep, description: e.target.value })}
                style={styles.input}
                placeholder="Step description"
              />
              <select
                value={newStep.action}
                onChange={(e) => setNewStep({ ...newStep, action: e.target.value as ActionType })}
                style={styles.select}
              >
                {ACTION_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <input
                type="text"
                value={newStep.target || ''}
                onChange={(e) => setNewStep({ ...newStep, target: e.target.value })}
                style={styles.input}
                placeholder="Target selector"
              />
              <input
                type="text"
                value={newStep.value || ''}
                onChange={(e) => setNewStep({ ...newStep, value: e.target.value })}
                style={styles.input}
                placeholder="Value"
              />
              <div style={styles.addStepButtons}>
                <button onClick={handleAddStep} style={styles.primaryButton}>Add Step</button>
                <button onClick={() => setShowAddStep(false)} style={styles.secondaryButton}>Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAddStep(true)} style={styles.addStepButton}>
              + Add Step
            </button>
          )}

          {lastVerification && (
            <div style={styles.verificationPanel}>
              <h4 style={styles.verificationTitle}>Last Verification</h4>
              <div style={{
                ...styles.verificationStatus,
                backgroundColor: lastVerification.passed ? '#166534' : '#991b1b'
              }}>
                {lastVerification.passed ? 'VERIFIED' : 'FAILED'} ({Math.round(lastVerification.confidence * 100)}% confidence)
              </div>
              {lastVerification.actualChanges.length > 0 && (
                <div style={styles.verificationSection}>
                  <strong>Changes Detected:</strong>
                  <ul style={styles.verificationList}>
                    {lastVerification.actualChanges.map((c, i) => (
                      <li key={i} style={styles.verificationItem}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {lastVerification.missingChanges.length > 0 && (
                <div style={styles.verificationSection}>
                  <strong style={{ color: '#ef4444' }}>Missing:</strong>
                  <ul style={styles.verificationList}>
                    {lastVerification.missingChanges.map((c, i) => (
                      <li key={i} style={{ ...styles.verificationItem, color: '#ef4444' }}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: '#111827',
    color: '#f3f4f6',
    padding: '20px',
    borderRadius: '12px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    maxHeight: '100vh',
    overflow: 'auto'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px'
  },
  title: {
    margin: 0,
    fontSize: '24px',
    fontWeight: 600
  },
  statusBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    backgroundColor: '#1f2937',
    borderRadius: '20px',
    fontSize: '14px'
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%'
  },
  createSection: {
    display: 'flex',
    gap: '12px',
    marginBottom: '20px'
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '8px',
    color: '#f3f4f6',
    fontSize: '14px',
    outline: 'none'
  },
  select: {
    padding: '12px 16px',
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '8px',
    color: '#f3f4f6',
    fontSize: '14px',
    outline: 'none'
  },
  primaryButton: {
    padding: '12px 24px',
    backgroundColor: '#3b82f6',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer'
  },
  secondaryButton: {
    padding: '12px 24px',
    backgroundColor: '#374151',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer'
  },
  plansList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '20px'
  },
  planCard: {
    padding: '12px 16px',
    backgroundColor: '#1f2937',
    border: '2px solid #374151',
    borderRadius: '8px',
    cursor: 'pointer',
    position: 'relative'
  },
  planHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  planName: {
    fontWeight: 500,
    flex: 1
  },
  planStatus: {
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '12px',
    textTransform: 'uppercase'
  },
  planMeta: {
    fontSize: '12px',
    color: '#9ca3af',
    marginTop: '4px'
  },
  planActions: {
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    gap: '4px'
  },
  iconButton: {
    padding: '4px 8px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    fontSize: '16px'
  },
  planDetail: {
    backgroundColor: '#1f2937',
    borderRadius: '12px',
    padding: '20px'
  },
  planDetailHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px'
  },
  planDetailTitle: {
    margin: 0,
    fontSize: '18px'
  },
  controlButtons: {
    display: 'flex',
    gap: '8px'
  },
  startButton: {
    padding: '8px 16px',
    backgroundColor: '#22c55e',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    cursor: 'pointer',
    fontWeight: 500
  },
  pauseButton: {
    padding: '8px 16px',
    backgroundColor: '#f59e0b',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    cursor: 'pointer',
    fontWeight: 500
  },
  resumeButton: {
    padding: '8px 16px',
    backgroundColor: '#3b82f6',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    cursor: 'pointer',
    fontWeight: 500
  },
  stopButton: {
    padding: '8px 16px',
    backgroundColor: '#ef4444',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    cursor: 'pointer',
    fontWeight: 500
  },
  planGoal: {
    color: '#9ca3af',
    fontSize: '14px',
    marginBottom: '16px'
  },
  progressBar: {
    height: '4px',
    backgroundColor: '#374151',
    borderRadius: '2px',
    marginBottom: '16px',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    transition: 'width 0.3s'
  },
  stepsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '16px'
  },
  stepCard: {
    padding: '12px 16px',
    backgroundColor: '#1f2937',
    borderLeft: '4px solid',
    borderRadius: '0 8px 8px 0',
    position: 'relative'
  },
  stepHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px'
  },
  stepNumber: {
    width: '24px',
    height: '24px',
    backgroundColor: '#374151',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 600
  },
  stepStatus: {
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '10px',
    textTransform: 'uppercase'
  },
  stepAction: {
    padding: '2px 8px',
    backgroundColor: '#374151',
    borderRadius: '4px',
    fontSize: '12px'
  },
  stepDescription: {
    margin: '0 0 4px 0',
    fontSize: '14px'
  },
  stepTarget: {
    display: 'inline-block',
    padding: '2px 6px',
    backgroundColor: '#374151',
    borderRadius: '4px',
    fontSize: '12px',
    marginRight: '8px'
  },
  stepValue: {
    color: '#9ca3af',
    fontSize: '12px'
  },
  stepResult: {
    color: '#22c55e',
    fontSize: '12px',
    margin: '4px 0 0 0'
  },
  stepError: {
    color: '#ef4444',
    fontSize: '12px',
    margin: '4px 0 0 0'
  },
  stepActions: {
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    gap: '4px'
  },
  moveButton: {
    padding: '4px 8px',
    backgroundColor: '#374151',
    border: 'none',
    borderRadius: '4px',
    color: '#9ca3af',
    cursor: 'pointer'
  },
  editButton: {
    padding: '4px 8px',
    backgroundColor: '#374151',
    border: 'none',
    borderRadius: '4px',
    color: '#9ca3af',
    cursor: 'pointer'
  },
  deleteButton: {
    padding: '4px 8px',
    backgroundColor: '#374151',
    border: 'none',
    borderRadius: '4px',
    color: '#ef4444',
    cursor: 'pointer'
  },
  editForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '8px'
  },
  editInput: {
    padding: '8px 12px',
    backgroundColor: '#111827',
    border: '1px solid #374151',
    borderRadius: '6px',
    color: '#f3f4f6',
    fontSize: '14px'
  },
  editSelect: {
    padding: '8px 12px',
    backgroundColor: '#111827',
    border: '1px solid #374151',
    borderRadius: '6px',
    color: '#f3f4f6',
    fontSize: '14px'
  },
  doneButton: {
    padding: '8px 16px',
    backgroundColor: '#22c55e',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    cursor: 'pointer',
    alignSelf: 'flex-start'
  },
  addStepButton: {
    width: '100%',
    padding: '12px',
    backgroundColor: 'transparent',
    border: '2px dashed #374151',
    borderRadius: '8px',
    color: '#9ca3af',
    cursor: 'pointer',
    fontSize: '14px'
  },
  addStepForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '16px',
    backgroundColor: '#111827',
    borderRadius: '8px'
  },
  addStepButtons: {
    display: 'flex',
    gap: '8px'
  },
  verificationPanel: {
    marginTop: '20px',
    padding: '16px',
    backgroundColor: '#111827',
    borderRadius: '8px'
  },
  verificationTitle: {
    margin: '0 0 12px 0',
    fontSize: '14px'
  },
  verificationStatus: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 600,
    marginBottom: '12px'
  },
  verificationSection: {
    marginTop: '8px',
    fontSize: '12px'
  },
  verificationList: {
    margin: '4px 0 0 0',
    paddingLeft: '20px'
  },
  verificationItem: {
    marginBottom: '2px'
  }
};

export default EditablePlanUI;
