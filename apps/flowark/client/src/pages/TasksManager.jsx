import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CalendarClock, CheckCircle, CircleDot, Edit3, Lock, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useDashboard } from '../context/DashboardContext.jsx';
import { getNextCronExecutions, parseCronExpression } from '../utils/cronPreview.js';
import { TASK_MIN_INTERVAL_MINUTES, cronMinuteInterval, deriveTaskCronDraft, taskCronDraftSummary } from '../utils/taskCron.js';

const BROADCAST_PAYLOAD_MAX_LENGTH = 500;
const TASK_MODAL_FOCUSABLE_SELECTOR = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

function hasControlCharacters(value) {
  return Array.from(String(value || '')).some(character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

export function TasksManager() {
  const {
    tasks,
    tasksLoading,
    taskMutationLoading,
    tasksError,
    taskScheduleContext,
    newTaskAction,
    setNewTaskAction,
    newTaskCronMode,
    setNewTaskCronMode,
    newTaskCronValue,
    setNewTaskCronValue,
    newTaskCronTime,
    setNewTaskCronTime,
    newTaskCron,
    setNewTaskCron,
    newTaskPayload,
    setNewTaskPayload,
    newTaskMapId,
    setNewTaskMapId,
    clusterMaps,
    handleCreateTask,
    handleUpdateTask,
    handleToggleTask,
    handleDeleteTask,
    fetchTasks,
    setModal,
    userRole,
  } = useDashboard();

  const canOwn = userRole === 'owner';
  const [taskModalMode, setTaskModalMode] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [cronDraftNotice, setCronDraftNotice] = useState('');
  const [cronChangeAcknowledged, setCronChangeAcknowledged] = useState(false);
  const [cronDraftTouched, setCronDraftTouched] = useState(false);
  const [cronDraftPreserveOriginal, setCronDraftPreserveOriginal] = useState(true);
  const [pendingTaskId, setPendingTaskId] = useState(null);
  const lastTaskModalTriggerRef = useRef(null);
  const taskDialogRef = useRef(null);
  const taskFirstFieldRef = useRef(null);
  const isDoExitTask = newTaskAction === 'DoExit';
  const firstMapId = clusterMaps[0]?.id || '';
  const selectedTaskMapId = newTaskMapId || 'all';
  const normalizeIntervalValue = (value, fallback, min, max) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  };

  function buildCronFromGuidedInputs() {
    if (newTaskCronMode === 'hours') return `0 */${normalizeIntervalValue(newTaskCronValue, 1, 1, 23)} * * *`;
    if (newTaskCronMode === 'minutes') return `*/${normalizeIntervalValue(newTaskCronValue, 10, 5, 59)} * * * *`;
    if (newTaskCronMode === 'daily') {
      const [hour, minute] = newTaskCronTime.split(':');
      return `${Number.parseInt(minute || 0, 10)} ${Number.parseInt(hour || 0, 10)} * * *`;
    }
    return newTaskCron;
  }

  function computeFinalCron() {
    if (taskModalMode === 'edit' && editingTask && !cronDraftTouched && cronDraftPreserveOriginal) {
      return String(editingTask.cron || '').trim();
    }
    return buildCronFromGuidedInputs();
  }

  const finalCronDraft = computeFinalCron();
  const guidedCronDraft = buildCronFromGuidedInputs();
  const finalPayloadDraft = newTaskAction === 'Broadcast' ? newTaskPayload.trim() : '';
  const previewCron = finalCronDraft || 'Cron personalizado pendiente';
  const broadcastPayloadLength = newTaskPayload.length;
  const broadcastPayloadHasControlChars = hasControlCharacters(newTaskPayload);
  const customCronFieldCount = newTaskCron.trim() ? newTaskCron.trim().split(/\s+/).length : 0;
  const customCronInvalid = newTaskCronMode === 'custom' && customCronFieldCount === 5 && !parseCronExpression(newTaskCron);
  const cronValueIsInteger = /^\d+$/.test(String(newTaskCronValue || '').trim());
  const cronValueNumber = Number.parseInt(newTaskCronValue, 10);
  const dailyTimeMatch = String(newTaskCronTime || '').match(/^(\d{2}):(\d{2})$/);
  const dailyTimeIsValid = Boolean(dailyTimeMatch)
    && Number.parseInt(dailyTimeMatch[1], 10) >= 0
    && Number.parseInt(dailyTimeMatch[1], 10) <= 23
    && Number.parseInt(dailyTimeMatch[2], 10) >= 0
    && Number.parseInt(dailyTimeMatch[2], 10) <= 59;
  const selectedActionMinInterval = TASK_MIN_INTERVAL_MINUTES[newTaskAction] || 5;
  const selectedCronMinuteInterval = newTaskCronMode === 'minutes'
    ? normalizeIntervalValue(newTaskCronValue, 10, 5, 59)
    : (newTaskCronMode === 'custom' ? cronMinuteInterval(newTaskCron) : null);
  const cronInputStyleSummary = taskCronDraftSummary({
    mode: newTaskCronMode,
    value: newTaskCronValue,
    time: newTaskCronTime,
  });
  const editingOriginalCron = String(editingTask?.cron || '').trim();
  const editingPreviewCron = String(previewCron || '').trim();
  const editingOriginalPayload = String(editingTask?.payload || '');
  const editingOriginalMapId = editingTask?.mapId || 'all';
  const canNormalizeConvertedCron = taskModalMode === 'edit'
    && Boolean(editingTask)
    && newTaskCronMode !== 'custom'
    && !cronDraftTouched
    && cronDraftPreserveOriginal
    && Boolean(editingOriginalCron)
    && guidedCronDraft !== editingOriginalCron;
  const editCronUsesGuidedInputs = taskModalMode === 'edit' && Boolean(editingTask) && newTaskCronMode !== 'custom';
  const editingCronUsesPreservedOriginal = editCronUsesGuidedInputs && !cronDraftTouched && cronDraftPreserveOriginal;
  const guidedCronDiffersFromOriginal = editCronUsesGuidedInputs && Boolean(editingOriginalCron) && guidedCronDraft !== editingOriginalCron;
  const editCronStatusLabel = editingCronUsesPreservedOriginal
    ? 'Cron exacto conservado'
    : (editCronUsesGuidedInputs ? 'Cron desde inputs' : 'Cron avanzado');
  const editingHasChanges = taskModalMode !== 'edit' || !editingTask || (
    newTaskAction !== editingTask.action
    || editingPreviewCron !== editingOriginalCron
    || finalPayloadDraft !== editingOriginalPayload
    || selectedTaskMapId !== editingOriginalMapId
  );
  const editingCronWillChange = taskModalMode === 'edit' && Boolean(editingTask) && Boolean(editingOriginalCron) && editingPreviewCron !== editingOriginalCron;
  const requiresCronChangeAcknowledgement = editingCronWillChange && !cronChangeAcknowledged;
  const serverTimeZone = taskScheduleContext?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const serverTime = useMemo(
    () => (taskScheduleContext?.serverTime ? new Date(taskScheduleContext.serverTime) : new Date()),
    [taskScheduleContext],
  );
  const nextCronRuns = useMemo(
    () => getNextCronExecutions(previewCron, { count: 3, from: serverTime, timeZone: serverTimeZone }),
    [previewCron, serverTime, serverTimeZone],
  );
  const formattedNextCronRuns = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('es-ES', {
      timeZone: serverTimeZone,
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    return nextCronRuns.map(run => formatter.format(run));
  }, [nextCronRuns, serverTimeZone]);
  const nextCronRunLabel = formattedNextCronRuns[0] || 'No calculable';
  const formatNextCronRun = useCallback((cronExpr) => {
    const [nextRun] = getNextCronExecutions(cronExpr, { count: 1, from: serverTime, timeZone: serverTimeZone });
    if (!nextRun) return 'No calculable';
    return new Intl.DateTimeFormat('es-ES', {
      timeZone: serverTimeZone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(nextRun);
  }, [serverTime, serverTimeZone]);
  const createBlockedReason = (() => {
    if (taskMutationLoading) return 'Hay una operación de tarea en curso.';
    if (requiresCronChangeAcknowledgement) return 'Acepta el cambio de Cron detectado antes de guardar la tarea.';
    if (taskModalMode === 'edit' && !editingHasChanges) return 'No hay cambios pendientes para guardar en esta tarea.';
    if (isDoExitTask && !canOwn) return 'DoExit programado requiere owner.';
    if (isDoExitTask && !firstMapId) return 'No hay mapas gestionados para programar DoExit.';
    if (isDoExitTask && selectedTaskMapId === 'all') return 'DoExit debe apuntar a un único mapa.';
    if (isDoExitTask && newTaskCronMode === 'minutes') return 'DoExit debe usar una frecuencia de al menos una hora.';
    if (selectedCronMinuteInterval !== null && selectedCronMinuteInterval < selectedActionMinInterval) return `${newTaskAction} debe ejecutarse al menos cada ${selectedActionMinInterval} minutos.`;
    if (newTaskAction === 'Broadcast' && !newTaskPayload.trim()) return 'Escribe el mensaje del anuncio antes de guardar la tarea.';
    if (newTaskAction === 'Broadcast' && broadcastPayloadLength > BROADCAST_PAYLOAD_MAX_LENGTH) return `El anuncio no puede superar ${BROADCAST_PAYLOAD_MAX_LENGTH} caracteres.`;
    if (newTaskAction === 'Broadcast' && broadcastPayloadHasControlChars) return 'El anuncio contiene caracteres de control no permitidos.';
    if (newTaskCronMode === 'hours' && (!cronValueIsInteger || cronValueNumber < 1 || cronValueNumber > 23)) return 'Introduce un intervalo entre 1 y 23 horas.';
    if (newTaskCronMode === 'minutes' && (!cronValueIsInteger || cronValueNumber < selectedActionMinInterval || cronValueNumber > 59)) return `Introduce un intervalo entre ${selectedActionMinInterval} y 59 minutos.`;
    if (newTaskCronMode === 'daily' && !dailyTimeIsValid) return 'Introduce una hora diaria válida.';
    if (newTaskCronMode === 'custom' && !newTaskCron.trim()) return 'Completa una expresión Cron personalizada.';
    if (newTaskCronMode === 'custom' && customCronFieldCount !== 5) return 'Cron personalizado debe tener 5 campos: minuto hora día-del-mes mes día-semana.';
    if (customCronInvalid) return 'Cron personalizado inválido: minuto 0-59, hora 0-23, día 1-31, mes 1-12 o JAN-DEC y semana 0-7 o SUN-SAT.';
    return '';
  })();
  const canCreateTask = !createBlockedReason;
  const canSubmitTask = canCreateTask;
  const canMutateTask = task => !taskMutationLoading && (task.action !== 'DoExit' || canOwn);
  const canEditTask = task => canMutateTask(task);
  const isInitialLoading = tasksLoading && tasks.length === 0 && !tasksError;
  const activeTaskCount = tasks.filter(task => task.active).length;
  const inactiveTaskCount = tasks.length - activeTaskCount;
  const restartTaskCount = tasks.filter(task => task.action === 'DoExit').length;

  const taskActionTitle = (task, activeLabel, inactiveLabel = activeLabel) => {
    if (taskMutationLoading) return 'Operación de tarea en curso';
    if (task.action === 'DoExit' && !canOwn) return 'DoExit requiere owner';
    return task.active ? activeLabel : inactiveLabel;
  };

  const taskStatusMeta = (task) => {
    if (pendingTaskId === task.id) {
      return {
        label: 'Procesando',
        className: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
      };
    }
    if (task.action === 'DoExit' && !canOwn) {
      return {
        label: 'Bloqueada',
        className: 'border-zinc-600 bg-zinc-800/80 text-zinc-300',
      };
    }
    return task.active
      ? { label: 'Activa', className: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200' }
      : { label: 'Pausada', className: 'border-zinc-600 bg-zinc-900 text-zinc-300' };
  };

  const handleTaskActionChange = (action) => {
    setCronChangeAcknowledged(false);
    if (taskModalMode === 'edit') setCronDraftPreserveOriginal(true);
    setNewTaskAction(action);
    if (action !== 'Broadcast' && newTaskPayload) {
      setNewTaskPayload('');
    }
    if (action === 'DoExit') {
      if (!newTaskMapId || newTaskMapId === 'all') setNewTaskMapId(firstMapId);
      if (newTaskCronMode === 'minutes') {
        setCronDraftTouched(true);
        setCronDraftPreserveOriginal(false);
        setNewTaskCronMode('hours');
        setNewTaskCronValue('1');
        setCronDraftNotice('DoExit no permite intervalos en minutos. Se ha cambiado a cada 1 hora.');
      }
      return;
    }
    if (action === 'SaveWorld' && newTaskCronMode === 'minutes') {
      const minutes = normalizeIntervalValue(newTaskCronValue, 10, 5, 59);
      if (minutes < TASK_MIN_INTERVAL_MINUTES.SaveWorld) {
        setCronDraftTouched(true);
        setCronDraftPreserveOriginal(false);
        setNewTaskCronValue(String(TASK_MIN_INTERVAL_MINUTES.SaveWorld));
        setCronDraftNotice('SaveWorld debe ejecutarse al menos cada 15 minutos. Se ha ajustado la frecuencia.');
        return;
      }
    }
    setCronDraftNotice('');
  };

  const handleCronModeChange = (mode) => {
    setCronChangeAcknowledged(false);
    setCronDraftTouched(true);
    setCronDraftPreserveOriginal(false);
    if (isDoExitTask && mode === 'minutes') {
      setNewTaskCronMode('hours');
      setNewTaskCronValue('1');
      setCronDraftNotice('DoExit no permite intervalos en minutos. Se ha cambiado a cada 1 hora.');
      return;
    }

    setNewTaskCronMode(mode);
    setCronDraftNotice('');
    if (mode === 'hours' && !newTaskCronValue) setNewTaskCronValue('4');
    if (mode === 'minutes') setNewTaskCronValue(String(normalizeIntervalValue(newTaskCronValue, Math.max(10, selectedActionMinInterval), selectedActionMinInterval, 59)));
    if (mode === 'daily' && !newTaskCronTime) setNewTaskCronTime('04:00');
  };

  const handleCronCustomConvert = () => {
    setCronChangeAcknowledged(false);
    setCronDraftTouched(true);
    setCronDraftPreserveOriginal(false);
    applyCronDraft(newTaskCron, newTaskAction);
  };

  const handleUseGuidedCronForEdit = () => {
    setCronChangeAcknowledged(false);
    setCronDraftTouched(true);
    setCronDraftPreserveOriginal(false);
    setNewTaskCron(guidedCronDraft);
    setCronDraftNotice('Se usará el Cron generado por los controles guiados. Revisa la diferencia antes de guardar.');
  };

  const resetTaskDraft = () => {
    setNewTaskAction('Broadcast');
    setNewTaskCronMode('hours');
    setNewTaskCronValue('4');
    setNewTaskCronTime('04:00');
    setNewTaskCron('0 */4 * * *');
    setNewTaskPayload('');
    setNewTaskMapId('all');
    setCronDraftNotice('');
    setCronChangeAcknowledged(false);
    setCronDraftTouched(false);
    setCronDraftPreserveOriginal(true);
  };

  const openDoExitConfirmation = ({ title, confirmText, expectedInput, cronExpr, mapId, nextRunLabel, onConfirm }) => {
    const mapName = mapId === 'all'
      ? 'Todos los servidores del cluster'
      : (clusterMaps.find(map => map.id === mapId)?.name || mapId || 'Sin mapa');
    setModal({
      type: 'danger',
      title,
      message: `Vas a programar o activar un DoExit. Mapa objetivo: ${mapName} (${mapId}). Cron: ${cronExpr}. Próxima ejecución: ${nextRunLabel || 'No calculable'} (${serverTimeZone}). Esta automatización reiniciará la instancia cuando se ejecute.`,
      Icon: AlertTriangle,
      color: 'amber',
      hasInput: true,
      inputLabel: `Escribe ${expectedInput}`,
      expectedInput,
      confirmText,
      onConfirm,
    });
  };

  const applyCronDraft = (cronExpression, action = newTaskAction) => {
    const draft = deriveTaskCronDraft(cronExpression, action);
    setNewTaskCronMode(draft.mode);
    setNewTaskCronValue(draft.value);
    setNewTaskCronTime(draft.time);
    setNewTaskCron(draft.cron);
    setCronDraftNotice(draft.notice);
    setCronDraftPreserveOriginal(draft.preserveOriginal);
    return draft;
  };

  const openCreateTaskModal = () => {
    lastTaskModalTriggerRef.current = document.activeElement;
    resetTaskDraft();
    setEditingTask(null);
    setTaskModalMode('create');
  };

  const openEditTaskModal = (task) => {
    lastTaskModalTriggerRef.current = document.activeElement;
    resetTaskDraft();
    setEditingTask(task);
    setNewTaskAction(task.action);
    const draft = applyCronDraft(task.cron, task.action);
    setNewTaskPayload(task.payload || '');
    setNewTaskMapId(task.mapId || 'all');
    setCronChangeAcknowledged(false);
    setCronDraftTouched(!draft.preserveOriginal);
    setTaskModalMode('edit');
  };

  const closeTaskModal = useCallback(() => {
    if (taskMutationLoading) return;
    setTaskModalMode(null);
    setEditingTask(null);
    window.setTimeout(() => lastTaskModalTriggerRef.current?.focus?.(), 0);
  }, [taskMutationLoading]);

  const handleTaskModalSubmit = async event => {
    event.preventDefault();
    const finalCron = finalCronDraft;
    const finalPayload = finalPayloadDraft;

    if (taskModalMode === 'edit' && editingTask) {
      const updateTask = async () => {
        const saved = await handleUpdateTask(editingTask.id, {
          action: newTaskAction,
          cronExpr: finalCron,
          payload: finalPayload,
          mapId: selectedTaskMapId,
          active: editingTask.active,
        });
        if (saved) {
          setModal(null);
          setTaskModalMode(null);
          setEditingTask(null);
        }
        return saved;
      };

      if (newTaskAction === 'DoExit') {
        openDoExitConfirmation({
          title: 'Confirmar DoExit programado',
          confirmText: 'Guardar DoExit',
          expectedInput: `DOEXIT ${selectedTaskMapId}`,
          cronExpr: finalCron,
          mapId: selectedTaskMapId,
          nextRunLabel: nextCronRunLabel,
          onConfirm: updateTask,
        });
        return;
      }

      const saved = await handleUpdateTask(editingTask.id, {
        action: newTaskAction,
        cronExpr: finalCron,
        payload: finalPayload,
        mapId: selectedTaskMapId,
        active: editingTask.active,
      });
      if (saved) {
        setTaskModalMode(null);
        setEditingTask(null);
      }
      return;
    }

    if (newTaskAction === 'DoExit') {
      openDoExitConfirmation({
        title: 'Confirmar DoExit programado',
        confirmText: 'Crear DoExit',
        expectedInput: `DOEXIT ${selectedTaskMapId}`,
        cronExpr: finalCron,
        mapId: selectedTaskMapId,
        nextRunLabel: nextCronRunLabel,
        onConfirm: async () => {
          const created = await handleCreateTask({ action: newTaskAction, cronExpr: finalCron, payload: finalPayload, mapId: selectedTaskMapId });
          if (created) {
            setModal(null);
            setTaskModalMode(null);
            setEditingTask(null);
          }
          return created;
        },
      });
      return;
    }

    const created = await handleCreateTask({ action: newTaskAction, cronExpr: finalCron, payload: finalPayload, mapId: selectedTaskMapId });
    if (created) {
      setTaskModalMode(null);
      setEditingTask(null);
    }
  };

  const handleTaskToggleClick = (task) => {
    if (task.action === 'DoExit' && !task.active) {
      const targetMapId = task.mapId || 'all';
      openDoExitConfirmation({
        title: 'Confirmar activación de DoExit',
        confirmText: 'Activar DoExit',
        expectedInput: `ACTIVAR DOEXIT ${targetMapId}`,
	        cronExpr: task.cron,
	        mapId: targetMapId,
	        nextRunLabel: formatNextCronRun(task.cron),
	        onConfirm: async () => {
	          setPendingTaskId(task.id);
	          try {
	            const toggled = await handleToggleTask(task.id, task.active);
	            if (toggled) setModal(null);
	            return toggled;
	          } finally {
	            setPendingTaskId(null);
	          }
	        },
	      });
	      return;
	    }
	    setPendingTaskId(task.id);
	    handleToggleTask(task.id, task.active).finally(() => setPendingTaskId(null));
	  };

  useEffect(() => {
    if (isDoExitTask && firstMapId && (!newTaskMapId || newTaskMapId === 'all')) {
      setNewTaskMapId(firstMapId);
    }
  }, [firstMapId, isDoExitTask, newTaskMapId, setNewTaskMapId]);

  useEffect(() => {
    if (!taskModalMode) return undefined;

    taskFirstFieldRef.current?.focus?.({ preventScroll: true });

    const handleModalKeyDown = event => {
      const modalDialogs = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]'));
      const topmostDialog = modalDialogs[modalDialogs.length - 1];
      if (topmostDialog !== taskDialogRef.current) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        closeTaskModal();
        return;
      }

      if (event.key === 'Tab') {
        const focusableElements = Array.from(taskDialogRef.current?.querySelectorAll(TASK_MODAL_FOCUSABLE_SELECTOR) || [])
          .filter(element => element.offsetParent !== null);
        if (focusableElements.length === 0) return;
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleModalKeyDown);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener('keydown', handleModalKeyDown);
    };
  }, [closeTaskModal, taskModalMode]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-4"
    >
        <div className="flex flex-col gap-4 sm:flex-row shrink-0 sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold">Tareas Programadas</h2>
            <p className="text-sm text-zinc-500 mt-1">Programa comandos automáticos usando expresiones Cron</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={openCreateTaskModal}
              disabled={taskMutationLoading}
              className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={15} />
              Nueva tarea
            </button>
            <button
              onClick={fetchTasks}
              disabled={tasksLoading || taskMutationLoading}
              className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-indigo-500/20 bg-indigo-500/[0.08] px-3.5 py-2 text-sm text-indigo-300 transition-all hover:bg-indigo-500/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Refrescar tareas programadas"
            >
              <RefreshCw size={13} className={tasksLoading ? 'animate-spin' : ''} />
              Refrescar
            </button>
          </div>
        </div>

        {taskModalMode && (
          <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 px-3 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:py-4">
            <div
              ref={taskDialogRef}
              className="dashboard-card flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-zinc-800 bg-[#18181b] shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="task-modal-title"
              aria-describedby="task-modal-description"
            >
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-800 px-4 py-4 sm:px-5">
                <div>
                  <h3 id="task-modal-title" className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                    <CalendarClock size={15} className="text-indigo-400" />
                    {taskModalMode === 'edit' ? 'Editar tarea programada' : 'Crear nueva tarea'}
                  </h3>
                  <p id="task-modal-description" className="mt-1 text-xs text-zinc-500">
                    {taskModalMode === 'edit' ? 'Actualiza la tarea sin cambiar si queda activa o pausada.' : 'Define una automatización sin ocupar espacio permanente en la cola.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeTaskModal}
                  disabled={taskMutationLoading}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-50"
                  aria-label="Cerrar modal de tarea"
                >
                  <X size={17} />
                </button>
              </div>

          <form onSubmit={handleTaskModalSubmit} className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar sm:p-5">
            <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="task-action" className="text-xs text-zinc-400">Acción</label>
                <select
                  id="task-action"
                  ref={taskFirstFieldRef}
                  value={newTaskAction}
                  onChange={e => handleTaskActionChange(e.target.value)}
                  disabled={taskMutationLoading}
                  className="w-full min-w-0 bg-[#09090b] border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="Broadcast">Anuncio (Broadcast)</option>
                  <option value="SaveWorld">Guardar Mundo (SaveWorld)</option>
                  {canOwn && <option value="DoExit">Reiniciar Servidor (DoExit)</option>}
                </select>
              </div>

              <div className="flex flex-col gap-1">
	                <label htmlFor="task-map" className="text-xs text-zinc-400">Servidor objetivo</label>
                <select
                  id="task-map"
                  value={newTaskMapId || 'all'}
                  onChange={e => setNewTaskMapId(e.target.value)}
                  disabled={taskMutationLoading}
                  className="w-full min-w-0 bg-[#09090b] border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
	                  <option value="all" disabled={isDoExitTask}>Todos los servidores (clúster)</option>
                  {clusterMaps.map(map => (
                    <option key={map.id} value={map.id}>{map.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1 md:col-span-2">
	                <label htmlFor="task-payload" className="text-xs text-zinc-400">Mensaje del anuncio</label>
	                <textarea
	                  id="task-payload"
	                  rows={3}
	                  placeholder="Mensaje del anuncio..."
	                  value={newTaskPayload}
	                  onChange={e => setNewTaskPayload(e.target.value)}
	                  disabled={newTaskAction !== 'Broadcast' || taskMutationLoading}
	                  required={newTaskAction === 'Broadcast'}
	                  maxLength={BROADCAST_PAYLOAD_MAX_LENGTH}
	                  aria-invalid={newTaskAction === 'Broadcast' && (!newTaskPayload.trim() || broadcastPayloadHasControlChars || broadcastPayloadLength > BROADCAST_PAYLOAD_MAX_LENGTH) ? 'true' : undefined}
	                  aria-describedby="task-payload-help task-payload-error"
	                  className="min-h-24 w-full min-w-0 resize-y bg-[#09090b] border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
	                />
	                <p id="task-payload-help" className="text-[11px] text-zinc-500">
	                  {newTaskAction === 'Broadcast' ? `Mensaje que recibirán los jugadores conectados. ${broadcastPayloadLength}/${BROADCAST_PAYLOAD_MAX_LENGTH}` : 'Esta acción no necesita parámetro; cualquier mensaje anterior se descartará al guardar.'}
	                </p>
	                {newTaskAction === 'Broadcast' && (broadcastPayloadHasControlChars || broadcastPayloadLength > BROADCAST_PAYLOAD_MAX_LENGTH) && (
	                  <p id="task-payload-error" className="text-[11px] text-amber-200">
	                    {broadcastPayloadHasControlChars ? 'El mensaje contiene caracteres de control no permitidos.' : `El mensaje supera ${BROADCAST_PAYLOAD_MAX_LENGTH} caracteres.`}
	                  </p>
	                )}
	              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label htmlFor="task-frequency" className="text-xs text-zinc-400">Frecuencia</label>
                <select
                  id="task-frequency"
                  value={newTaskCronMode}
                  onChange={e => handleCronModeChange(e.target.value)}
                  disabled={taskMutationLoading}
                  className="w-full min-w-0 bg-[#09090b] border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="hours">Cada X horas</option>
                  <option value="minutes" disabled={isDoExitTask}>Cada X minutos</option>
                  <option value="daily">Todos los días a una hora</option>
                  <option value="custom">Personalizado (Cron avanzado)</option>
                </select>
                <div id="task-cron-mode-help" className="flex flex-col gap-1 text-[11px] text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    {taskModalMode === 'edit'
                      ? `Cron existente convertido a input: ${cronInputStyleSummary}.`
                      : cronInputStyleSummary}
                  </span>
                  {taskModalMode === 'edit' && (
                    <span className="w-fit rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-medium text-zinc-300">
                      {editCronStatusLabel}
                    </span>
                  )}
                </div>
                {taskModalMode === 'edit' && newTaskCronMode !== 'custom' && !cronDraftTouched && cronDraftPreserveOriginal && (
                  <p className="text-[11px] text-zinc-500">
                    Edita con controles guiados; si no cambias la frecuencia se conserva el Cron guardado exacto.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1">
                {newTaskCronMode === 'hours' && (
                  <>
	                    <label htmlFor="task-cron-hours" className="text-xs text-zinc-400">Cada cuántas horas</label>
                    <input
                      id="task-cron-hours"
                      type="number"
                      min="1"
                      max="23"
                      value={newTaskCronValue}
                      onChange={e => {
                        setCronChangeAcknowledged(false);
                        setCronDraftTouched(true);
                        setCronDraftPreserveOriginal(false);
                        setNewTaskCronValue(e.target.value);
                      }}
                      disabled={taskMutationLoading}
                      className="w-full min-w-0 bg-[#09090b] border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                      required
                    />
                  </>
                )}

                {newTaskCronMode === 'minutes' && (
                  <>
	                    <label htmlFor="task-cron-minutes" className="text-xs text-zinc-400">Cada cuántos minutos</label>
                    <input
                      id="task-cron-minutes"
                      type="number"
                      min={selectedActionMinInterval}
                      max="59"
                      value={newTaskCronValue}
                      onChange={e => {
                        setCronChangeAcknowledged(false);
                        setCronDraftTouched(true);
                        setCronDraftPreserveOriginal(false);
                        setNewTaskCronValue(e.target.value);
                      }}
                      disabled={taskMutationLoading}
                      className="w-full min-w-0 bg-[#09090b] border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                      required
                    />
                  </>
                )}

                {newTaskCronMode === 'daily' && (
                  <>
	                    <label htmlFor="task-cron-time" className="text-xs text-zinc-400">Hora del día</label>
                    <input
                      id="task-cron-time"
                      type="time"
                      value={newTaskCronTime}
                      onChange={e => {
                        setCronChangeAcknowledged(false);
                        setCronDraftTouched(true);
                        setCronDraftPreserveOriginal(false);
                        setNewTaskCronTime(e.target.value);
                      }}
                      disabled={taskMutationLoading}
                      className="w-full min-w-0 bg-[#09090b] border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                      required
                    />
                  </>
                )}

                {newTaskCronMode === 'custom' && (
                  <>
                    <label htmlFor="task-cron-custom" className="text-xs text-zinc-400">Expresión Cron</label>
                    <input
                      id="task-cron-custom"
                      type="text"
                      placeholder="0 4 * * *"
                      value={newTaskCron}
                      onChange={e => {
                        setCronChangeAcknowledged(false);
                        setCronDraftTouched(true);
                        setCronDraftPreserveOriginal(false);
                        setNewTaskCron(e.target.value);
                      }}
                      disabled={taskMutationLoading}
                      className="w-full min-w-0 bg-[#09090b] border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white outline-none focus:border-blue-500 font-mono disabled:cursor-not-allowed disabled:opacity-50"
                      required
                    />
                    <button
                      type="button"
                      onClick={handleCronCustomConvert}
                      disabled={taskMutationLoading || !newTaskCron.trim()}
                      className="mt-2 inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-indigo-500/25 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-200 transition-colors hover:bg-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-50 sm:w-fit"
                    >
                      Convertir a controles guiados
                    </button>
                  </>
                )}
              </div>
            </div>

            <div id="task-submit-feedback" aria-live="polite" className="min-h-5">
              {createBlockedReason && (
                <p className="flex items-start gap-2 text-xs text-amber-100">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" />
                  <span>{createBlockedReason}</span>
                </p>
              )}
            </div>

            {canNormalizeConvertedCron && (
              <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-3 py-3 text-xs text-indigo-100">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-indigo-50">El Cron se puede editar como inputs sin tocar el guardado.</p>
                    <p className="mt-1 text-indigo-100/80">
                      Cron desde inputs: <span className="font-mono text-indigo-50">{guidedCronDraft}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleUseGuidedCronForEdit}
                    disabled={taskMutationLoading}
                    className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-indigo-300/30 bg-indigo-300/10 px-3 py-2 text-xs font-semibold text-indigo-50 transition-colors hover:bg-indigo-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Usar Cron de inputs
                  </button>
                </div>
              </div>
            )}

            {taskModalMode === 'edit' && editingTask && editCronUsesGuidedInputs && (
              <div className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-xs sm:grid-cols-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Cron guardado exacto</p>
                  <p className="mt-1 break-all font-mono text-zinc-200">{editingOriginalCron || '-'}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Cron de los inputs</p>
                  <p className={`mt-1 break-all font-mono ${guidedCronDiffersFromOriginal ? 'text-indigo-200' : 'text-zinc-200'}`}>
                    {guidedCronDraft || '-'}
                  </p>
                </div>
              </div>
            )}

            {cronDraftNotice && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" />
                  <span>
                    {cronDraftNotice}
                    {taskModalMode === 'edit' && !cronDraftTouched ? ' El cron guardado se conservará hasta que cambies la frecuencia.' : ''}
                  </span>
                </div>
              </div>
            )}

            {editingCronWillChange && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs text-amber-100">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-amber-50">El Cron guardado cambiará al guardar esta edición.</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-md bg-[#09090b] p-2">
                        <p className="text-[10px] uppercase tracking-wide text-zinc-600">Cron actual</p>
                        <p className="mt-1 break-all font-mono text-zinc-200">{editingOriginalCron}</p>
                      </div>
                      <div className="rounded-md bg-[#09090b] p-2">
                        <p className="text-[10px] uppercase tracking-wide text-zinc-600">Cron al guardar</p>
                        <p className="mt-1 break-all font-mono text-zinc-200">{editingPreviewCron}</p>
                      </div>
                    </div>
                    {editingTask?.active && (
                      <p className="mt-2 text-amber-100">Esta tarea está activa: el cambio se aplicará inmediatamente al guardar.</p>
                    )}
                    <label className="mt-3 flex items-start gap-2 text-amber-50">
                      <input
                        type="checkbox"
                        checked={cronChangeAcknowledged}
                        onChange={event => setCronChangeAcknowledged(event.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-zinc-700 bg-[#09090b] text-indigo-500 focus:ring-indigo-500"
                      />
                      <span>Acepto guardar la tarea con el nuevo Cron mostrado.</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {taskModalMode === 'edit' && editingTask && !editingTask.active && (
              <div className="rounded-lg border border-zinc-700/70 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-300">
                Esta tarea está pausada. Los cambios se guardarán sin reactivarla.
              </div>
            )}

            <div id="task-run-preview" className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-3 text-xs">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Próximas ejecuciones</p>
                <p className="text-[11px] text-zinc-500">Zona del servidor: {serverTimeZone}</p>
              </div>
              {formattedNextCronRuns.length > 0 ? (
                <ol className="mt-2 grid gap-1 text-zinc-200 sm:grid-cols-3">
                  {formattedNextCronRuns.map((runLabel, index) => (
                    <li key={`${runLabel}-${index}`} className="rounded-md border border-zinc-800 bg-[#18181b] px-2 py-1.5">
                      <span className="mr-1 text-zinc-500">{index + 1}.</span>
                      {runLabel}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-amber-100">No se pudieron calcular próximas ejecuciones para esta expresión Cron.</p>
              )}
            </div>

            <p className="text-xs text-zinc-500">
              Nota: Las tareas se ejecutan siguiendo la hora local del servidor (Sistema). DoExit requiere owner, un único mapa y al menos 60 minutos entre ejecuciones.
            </p>

            <div className="sticky bottom-0 -mx-4 -mb-4 flex justify-end border-t border-zinc-800 bg-[#18181b]/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:-mb-5 sm:px-5">
              <button
                type="submit"
                disabled={!canSubmitTask}
                aria-describedby="task-submit-feedback task-run-preview"
                className="min-h-10 w-full rounded-lg bg-indigo-500 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#638cff]/20 transition-colors hover:bg-[#4f7aff] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {taskMutationLoading ? 'Guardando...' : (taskModalMode === 'edit' ? 'Guardar cambios' : 'Crear tarea')}
              </button>
            </div>
            </div>
          </form>
            </div>
          </div>
        )}

        <div className="dashboard-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-[#18181b]">
          <div className="flex shrink-0 flex-col gap-3 border-b border-zinc-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-200">Cola operativa</h3>
              <p className="mt-0.5 text-xs text-zinc-500">
                {tasksLoading && tasks.length > 0 ? 'Actualizando tareas...' : 'Estado actual de automatizaciones del clúster'}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center sm:flex sm:text-left">
              <div className="rounded-lg bg-[#09090b] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-zinc-600">Activas</p>
                <p className="text-sm font-semibold text-cyan-300">{activeTaskCount}</p>
              </div>
              <div className="rounded-lg bg-[#09090b] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-zinc-600">Pausadas</p>
                <p className="text-sm font-semibold text-zinc-300">{inactiveTaskCount}</p>
              </div>
              <div className="rounded-lg bg-[#09090b] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-zinc-600">Reinicios</p>
                <p className="text-sm font-semibold text-amber-300">{restartTaskCount}</p>
              </div>
            </div>
          </div>

          {tasksError && (
            <div className="flex shrink-0 flex-col gap-3 border-b border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <AlertTriangle size={16} className="shrink-0 text-amber-300" />
                <span className="break-words">{tasksError}</span>
              </div>
              <button
                onClick={fetchTasks}
                disabled={tasksLoading}
                className="inline-flex min-w-[8.5rem] shrink-0 items-center justify-center gap-1.5 rounded-md border border-amber-400/30 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={13} className={tasksLoading ? 'animate-spin' : ''} />
                {tasksLoading ? 'Reintentando...' : 'Reintentar'}
              </button>
            </div>
          )}

          {isInitialLoading && (
            <div className="flex min-h-[260px] flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center text-zinc-500">
              <RefreshCw size={22} className="animate-spin text-indigo-400" />
              <div>
                <p className="text-sm font-medium text-zinc-400">Cargando tareas programadas...</p>
                <p className="mt-1 text-xs text-zinc-600">La lista se mostrará cuando el backend devuelva la cola actual.</p>
              </div>
            </div>
          )}

          {tasks.length > 0 && (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 custom-scrollbar md:hidden">
              {tasks.map(task => {
                const status = taskStatusMeta(task);
                return (
	                  <div key={task.id} className={`rounded-lg border border-zinc-800 bg-[#101014] p-4 ${!task.active ? 'opacity-80' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-indigo-300">{task.action}</p>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${status.className}`}>
                            {status.label}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-zinc-400">
                          {task.mapId === 'all' ? 'Todos (Clúster)' : (clusterMaps.find(m => m.id === task.mapId)?.name || task.mapId)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleTaskToggleClick(task)}
                        disabled={!canMutateTask(task)}
                        className={`shrink-0 rounded-full border p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${task.active ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20' : 'border-gray-500/50 bg-gray-500/10 text-zinc-400 hover:bg-gray-500/20'}`}
                        title={taskActionTitle(task, 'Desactivar', 'Activar')}
                        aria-label={`${taskActionTitle(task, 'Desactivar', 'Activar')} tarea ${task.action}`}
                      >
                        {!canMutateTask(task) ? <Lock size={15} /> : (task.active ? <CheckCircle size={15} /> : <CircleDot size={15} />)}
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-[#09090b] p-2">
                        <p className="text-[10px] uppercase tracking-wide text-zinc-600">Cron</p>
                        <p className="mt-1 break-all font-mono text-zinc-300">{task.cron}</p>
                      </div>
                      <div className="rounded-lg bg-[#09090b] p-2">
                        <p className="text-[10px] uppercase tracking-wide text-zinc-600">Creada</p>
                        <p className="mt-1 text-zinc-400">{new Date(task.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>

                    <p className="mt-3 break-words rounded-lg bg-[#09090b] p-2 text-xs text-zinc-400">{task.payload || '-'}</p>

                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        onClick={() => openEditTaskModal(task)}
                        disabled={!canEditTask(task)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 px-3 py-2 text-xs text-indigo-300 transition-colors hover:bg-indigo-500/20 hover:text-indigo-200 disabled:cursor-not-allowed disabled:opacity-45"
                        title={taskActionTitle(task, 'Editar')}
                        aria-label={`Editar tarea ${task.action}`}
                      >
                        {!canEditTask(task) ? <Lock size={14} /> : <Edit3 size={14} />}
                        <span>Editar</span>
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task)}
                        disabled={!canMutateTask(task)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-45"
                        title={taskActionTitle(task, 'Borrar')}
                        aria-label={`${taskActionTitle(task, 'Borrar')} tarea ${task.action}`}
                      >
                        {!canMutateTask(task) ? <Lock size={14} /> : <Trash2 size={14} />}
                        <span>Borrar</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tasks.length > 0 && (
            <div className="hidden min-h-0 flex-1 overflow-y-auto overflow-x-auto custom-scrollbar md:block">
              <table className="min-w-[960px] w-full table-fixed text-left">
                <thead className="sticky top-0 z-10 bg-[#18181b] text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                  <tr className="border-b border-zinc-800">
                    <th scope="col" className="w-36 px-5 py-3">Estado</th>
                    <th scope="col" className="w-40 px-3 py-3">Objetivo</th>
                    <th scope="col" className="w-36 px-3 py-3">Acción</th>
                    <th scope="col" className="w-44 px-3 py-3">Cron</th>
                    <th scope="col" className="px-3 py-3">Parámetro</th>
                    <th scope="col" className="w-32 px-3 py-3">Creada</th>
                    <th scope="col" className="w-20 px-3 py-3 text-right">Editar</th>
                    <th scope="col" className="w-20 px-5 py-3 text-right">Borrar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {tasks.map(task => {
                    const status = taskStatusMeta(task);
                    return (
	                    <tr key={task.id} className={`transition-colors hover:bg-[#27272a] ${!task.active ? 'bg-zinc-950/25' : ''}`}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleTaskToggleClick(task)}
                              disabled={!canMutateTask(task)}
                              className={`rounded-full border p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${task.active ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20' : 'border-gray-500/50 bg-gray-500/10 text-zinc-400 hover:bg-gray-500/20'}`}
                              title={taskActionTitle(task, 'Desactivar', 'Activar')}
                              aria-label={`${taskActionTitle(task, 'Desactivar', 'Activar')} tarea ${task.action}`}
                            >
                              {!canMutateTask(task) ? <Lock size={14} /> : (task.active ? <CheckCircle size={14} /> : <CircleDot size={14} />)}
                            </button>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${status.className}`}>
                              {status.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-xs font-medium text-white">
                          <span className="block truncate">
                            {task.mapId === 'all' ? 'Todos (Clúster)' : (clusterMaps.find(m => m.id === task.mapId)?.name || task.mapId)}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-sm font-medium text-indigo-400">{task.action}</td>
                        <td className="px-3 py-3.5">
                          <span className="block w-max max-w-full rounded border border-zinc-800 bg-[#09090b] px-2 py-1 font-mono text-xs text-zinc-300">{task.cron}</span>
                        </td>
                        <td className="px-3 py-3.5 text-xs text-zinc-400">
                          <span className="block truncate">{task.payload || '-'}</span>
                        </td>
                        <td className="px-3 py-3.5 text-xs text-zinc-500">{new Date(task.createdAt).toLocaleDateString()}</td>
                        <td className="px-3 py-3.5 text-right">
                          <button
                            onClick={() => openEditTaskModal(task)}
                            disabled={!canEditTask(task)}
                            className="rounded p-1.5 text-xs text-indigo-300 transition-colors hover:bg-indigo-500/10 hover:text-indigo-200 disabled:cursor-not-allowed disabled:opacity-45"
                            title={taskActionTitle(task, 'Editar')}
                            aria-label={`Editar tarea ${task.action}`}
                          >
                            {!canEditTask(task) ? <Lock size={14} /> : <Edit3 size={14} />}
                          </button>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            onClick={() => handleDeleteTask(task)}
                            disabled={!canMutateTask(task)}
                            className="rounded p-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-45"
                            title={taskActionTitle(task, 'Borrar')}
                            aria-label={`${taskActionTitle(task, 'Borrar')} tarea ${task.action}`}
                          >
                            {!canMutateTask(task) ? <Lock size={14} /> : <Trash2 size={14} />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {tasks.length === 0 && !tasksError && !isInitialLoading && (
            <div className="flex min-h-[260px] flex-1 flex-col items-center justify-center px-6 py-10 text-center">
              <CalendarClock size={30} className="mx-auto mb-3 text-zinc-700" />
              <p className="text-sm font-medium text-zinc-500">No hay tareas programadas</p>
              <p className="mt-1 text-xs text-zinc-600">Crea una tarea para automatizar anuncios, guardados o reinicios controlados.</p>
            </div>
          )}
        </div>
    </motion.div>
  );
}
