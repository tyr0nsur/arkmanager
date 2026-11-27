import { motion } from 'framer-motion';
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, FileText, RefreshCw, ScrollText } from 'lucide-react';
import { AUDIT_ACTION_META } from '../constants/dashboard.js';
import { useDashboard } from '../context/DashboardContext.jsx';

export function AuditLogView() {
  const {
    auditFilterAction,
    setAuditFilterAction,
    auditPage,
    setAuditPage,
    auditTotalPages,
    auditTotal,
    auditLoading,
    auditLoaded,
    auditError,
    auditLogs,
    fetchAuditLog
  } = useDashboard();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-4"
    >
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar md:flex md:flex-col md:overflow-hidden">
        <div className="flex flex-col gap-4 sm:flex-row md:shrink-0 sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold">Registro de Auditoría</h2>
            <p className="mt-1 text-sm text-zinc-500">Rastrea todas las acciones administrativas</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <label htmlFor="audit-action-filter" className="sr-only">Filtrar auditoría por acción</label>
            <select
              id="audit-action-filter"
              value={auditFilterAction}
              onChange={e => { setAuditFilterAction(e.target.value); setAuditPage(1); }}
              disabled={auditLoading}
              className="min-h-11 w-full rounded-lg border border-zinc-800 bg-[#18181b] px-3 text-sm text-white outline-none transition-colors focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-10 sm:w-auto"
            >
              <option value="">Todas las Acciones</option>
              <option value="LOGIN">Inicios de Sesión</option>
              <option value="LOGIN_FAILED">Fallos de Login</option>
              <option value="RCON_COMMAND">Comandos RCON</option>
              <option value="PLAYER_KICK">Expulsiones</option>
              <option value="PLAYER_BAN">Baneos</option>
              <option value="PLAYER_UNBAN">Desbaneos</option>
              <option value="SERVER_ACTION">Acciones de Servidor</option>
              <option value="CONFIG_CHANGE">Cambios de Configuración</option>
              <option value="CONFIG_EDIT">Edición de Configuración</option>
              <option value="FILE_EDIT">Edición de Archivos</option>
              <option value="BROADCAST">Anuncios</option>
              <option value="PLAYER_MAKE_ADMIN">Dar Permisos Admin</option>
              <option value="ADMIN_CREATED">Admin del Panel</option>
            </select>
            <button
              type="button"
              onClick={fetchAuditLog}
              disabled={auditLoading}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-indigo-500/20 bg-indigo-500/[0.08] px-3.5 text-sm text-indigo-400 transition-all hover:bg-indigo-500/[0.12] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-10"
              aria-label="Actualizar registro de auditoría"
            >
              <RefreshCw size={13} className={auditLoading ? 'animate-spin' : ''} />
              {auditLoading ? 'Actualizando...' : 'Refrescar'}
            </button>
          </div>
        </div>

      <div className="dashboard-card mt-4 flex flex-col overflow-hidden rounded-lg border border-zinc-800 bg-[#18181b] md:min-h-0 md:flex-1">
        {auditError && (
          <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-5 py-3 text-sm text-amber-300">
            <AlertTriangle size={15} />
            <span className="flex-1">{auditError}</span>
            <button
              type="button"
              onClick={fetchAuditLog}
              disabled={auditLoading}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-amber-400/30 px-3 py-1.5 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-400/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={13} className={auditLoading ? 'animate-spin' : ''} />
              {auditLoading ? 'Reintentando...' : 'Reintentar'}
            </button>
          </div>
        )}

        {auditLogs.length > 0 ? (
          <div className="divide-y divide-zinc-800/50 md:min-h-0 md:flex-1 md:overflow-y-auto md:custom-scrollbar">
            {auditLogs.map((log, i) => {
              const meta = AUDIT_ACTION_META[log.action] || { Icon: FileText, color: 'text-zinc-400', bg: 'bg-gray-500/10' };
              const ActionIcon = meta.Icon;
              const timestamp = new Date(log.timestamp).toLocaleString();

              return (
                <div key={i} className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-[#27272a] sm:flex-row sm:items-start sm:gap-3.5 sm:px-5 sm:py-3.5">
                  <div className="flex min-w-0 gap-3.5 sm:flex-1">
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.bg}`}>
                      <ActionIcon size={14} className={meta.color} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={`text-xs font-semibold ${meta.color}`}>{log.action.replace(/_/g, ' ')}</span>
                        <span className="text-[10px] text-zinc-600">por</span>
                        <span className="min-w-0 truncate text-xs font-medium text-white" title={log.admin}>{log.admin}</span>
                      </div>
                      <p className="break-words text-xs text-zinc-500">{log.details}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 pt-1 text-[10px] text-zinc-600 sm:justify-end">
                    <Clock size={10} />
                    <span title={timestamp}>{timestamp}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : !auditLoaded ? (
          <div className="flex min-h-[260px] flex-1 flex-col items-center justify-center p-8 text-center text-zinc-600">
            <RefreshCw size={32} className="mx-auto mb-3 animate-spin opacity-30" />
            <p className="mb-1 text-sm font-medium">Cargando auditoría...</p>
            <p className="text-xs text-zinc-600">Consultando acciones administrativas registradas</p>
          </div>
        ) : auditError ? (
          <div className="flex min-h-[260px] flex-1 flex-col items-center justify-center p-8 text-center text-zinc-600">
            <AlertTriangle size={36} className="mx-auto mb-3 opacity-20" />
            <p className="mb-1 text-sm font-medium">Registro no disponible</p>
            <p className="text-xs text-zinc-600">Reintenta la consulta para recuperar la auditoría.</p>
          </div>
        ) : (
          <div className="flex min-h-[260px] flex-1 flex-col items-center justify-center p-8 text-center text-zinc-600">
            <ScrollText size={36} className="mx-auto mb-3 opacity-20" />
            <p className="mb-1 text-sm font-medium">No hay registros</p>
            <p className="text-xs text-zinc-600">Las acciones administrativas se registrarán aquí</p>
          </div>
        )}
      </div>

      {auditTotalPages > 1 && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row md:shrink-0 sm:items-center sm:justify-between">
          <p className="text-xs text-zinc-500">Página {auditPage} de {auditTotalPages} ({auditTotal} total)</p>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              type="button"
              onClick={() => setAuditPage(p => Math.max(1, p - 1))}
              disabled={auditPage <= 1}
              className="flex min-h-10 items-center justify-center gap-1 rounded-lg border border-zinc-800 bg-[#18181b] px-3 text-xs text-zinc-400 transition-colors hover:text-white disabled:opacity-30"
            >
              <ChevronLeft size={12} /> Anterior
            </button>
            <button
              type="button"
              onClick={() => setAuditPage(p => Math.min(auditTotalPages, p + 1))}
              disabled={auditPage >= auditTotalPages}
              className="flex min-h-10 items-center justify-center gap-1 rounded-lg border border-zinc-800 bg-[#18181b] px-3 text-xs text-zinc-400 transition-colors hover:text-white disabled:opacity-30"
            >
              Siguiente <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}
      </div>
    </motion.div>
  );
}
