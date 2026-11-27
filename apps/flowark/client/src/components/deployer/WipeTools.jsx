import { Lock, ShieldAlert, Trash2 } from 'lucide-react';

const WIPE_LABELS = {
  characters: 'Personajes',
  dinos: 'Dinos',
  structures: 'Estructuras',
  full: 'Wipe completo',
};

export function WipeTools({ capabilities, userPermissions = [] }) {
  const modes = capabilities?.wipe?.modes || {};
  const entries = Object.entries(modes);
  const canExecuteWipe = userPermissions.includes('wipe.execute');

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800/50 bg-[#18181b]/70">
      <div className="flex items-center gap-3 border-b border-zinc-800/50 p-5">
        <div className="rounded-lg bg-red-500/10 p-2 text-red-300">
          <ShieldAlert size={20} />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-white">Wipe</h3>
          <p className="text-xs text-zinc-400">Modos separados por alcance, permisos y confirmación explícita.</p>
        </div>
      </div>

      <div className="grid gap-3 p-5 md:grid-cols-2">
        {entries.map(([mode, capability]) => {
          const available = capability?.available === true && canExecuteWipe;
          return (
            <button
              key={mode}
              type="button"
              disabled
              className="flex min-h-[128px] flex-col items-start justify-between rounded-xl border border-zinc-800 bg-[#09090b] p-4 text-left opacity-70"
              title={capability?.reason || 'Wipe no disponible'}
              aria-label={`${WIPE_LABELS[mode] || mode} no disponible`}
            >
              <div className="flex w-full items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-200">{WIPE_LABELS[mode] || mode}</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">{capability?.reason || 'No implementado desde el panel.'}</p>
                </div>
                {available ? <Trash2 size={16} className="text-red-300" /> : <Lock size={16} className="shrink-0 text-zinc-600" />}
              </div>
              <span className="mt-3 rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-red-200">
                {capability?.confirmation || 'Confirmación requerida'}
              </span>
            </button>
          );
        })}

        {entries.length === 0 && (
          <div className="rounded-xl border border-zinc-800 bg-[#09090b] p-6 text-center text-sm text-zinc-500 md:col-span-2">
            No hay modos de wipe declarados por el backend.
          </div>
        )}
      </div>
    </div>
  );
}
