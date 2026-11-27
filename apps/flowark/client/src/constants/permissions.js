export const PERMISSION_OPTIONS = [
  { value: 'obelisk.plugins.manage', label: 'Gestionar plugins nativos', description: 'Permite iniciar, pausar, reanudar, detener y recargar plugins cooperativos desde el Hub.' },
  { value: 'deploy.view', label: 'Ver deployer', description: 'Permite abrir el apartado de despliegue y mantenimiento.' },
  { value: 'deploy.future', label: 'Preparar despliegues', description: 'Permite usar futuros asistentes de alta cuando existan.' },
  { value: 'orchestrator.view', label: 'Ver orquestador', description: 'Permite abrir la preparacion del orquestador nativo.' },
  { value: 'orchestrator.configure', label: 'Configurar orquestador', description: 'Permite guardar la preparacion del orquestador nativo.' },
  { value: 'maintenance.logs.clear', label: 'Truncar logs', description: 'Permite limpiar logs ARK gestionados.' },
  { value: 'wipe.plan', label: 'Ver Wipe', description: 'Permite consultar planes de wipe.' },
  { value: 'wipe.execute', label: 'Ejecutar Wipe', description: 'Permite ejecutar wipes cuando el backend lo habilite.' },
];

export const ROLE_PERMISSION_DEFAULTS = {
  viewer: [],
  operator: [],
  owner: PERMISSION_OPTIONS.map(permission => permission.value),
};

export function normalizePermissionOverrides(permissions) {
  return {
    allow: Array.isArray(permissions?.allow) ? permissions.allow : [],
    deny: Array.isArray(permissions?.deny) ? permissions.deny : [],
  };
}
