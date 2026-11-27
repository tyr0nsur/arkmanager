export const ROLE_OPTIONS = [
  {
    value: 'viewer',
    label: 'Lectura',
    shortLabel: 'Lectura',
    description: 'Solo consulta del estado visible.',
  },
  {
    value: 'operator',
    label: 'Operador',
    shortLabel: 'Operador',
    description: 'Gestiona jugadores, bans y tareas permitidas.',
  },
  {
    value: 'owner',
    label: 'Propietario',
    shortLabel: 'Owner',
    description: 'Acceso completo a seguridad, archivos, plugins y sistema.',
  },
];

export function roleInfo(role) {
  return ROLE_OPTIONS.find(option => option.value === role) || ROLE_OPTIONS[0];
}
