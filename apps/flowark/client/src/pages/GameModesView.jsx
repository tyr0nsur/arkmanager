import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Shield, Swords, RefreshCw } from 'lucide-react';
import { useDashboard } from '../context/DashboardContext.jsx';

export function GameModesView() {
  const { selectedMap, clusterMaps, setModal } = useDashboard();
  const [profiles, setProfiles] = useState([]);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const currentMap = useRef(selectedMap);
  useEffect(() => { currentMap.current = selectedMap; }, [selectedMap]);
  useEffect(() => {
    const controller = new AbortController();
    axios.get('/api/game-modes', { signal: controller.signal }).then(({ data }) => setProfiles(data.profiles))
      .catch(err => { if (!controller.signal.aborted) setError(err.response?.data?.error || 'No se pudieron consultar los modos.'); });
    return () => controller.abort();
  }, []);

  async function prepare(profile) {
    if (pending.current || !selectedMap) return;
    const target = selectedMap;
    pending.current = true; setBusy(true); setPreview(null); setError(''); setMessage('');
    try {
      const { data } = await axios.post('/api/game-modes/preview', { mapId: target, modeId: profile.id });
      if (currentMap.current === target) setPreview(data);
    } catch (err) { setError(err.response?.data?.error || 'No se pudo preparar el cambio.'); }
    finally { pending.current = false; setBusy(false); }
  }

  function confirm() {
    const proposal = preview;
    const target = selectedMap;
    setModal({ title: `Guardar ${proposal.profile.name || proposal.profile.label || proposal.profile.id}`, color: 'amber',
      message: `Mapa: ${clusterMaps.find(map => map.id === target)?.name || target}. Se guardará la configuración en disco. Para aplicar el modo tendrás que reiniciar el servidor. Revisa antes los backups, especialmente si eliges Hardcore.`,
      hasInput: true, inputLabel: `Escribe ${target}`, expectedInput: target, confirmText: 'Guardar configuración',
      onConfirm: async () => {
        if (pending.current || currentMap.current !== target) { setModal(null); return; }
        pending.current = true; setBusy(true); setError('');
        try {
          const { data } = await axios.post('/api/game-modes/apply', { preview_token: proposal.preview_token, confirmation: target });
          if (currentMap.current === target) { setMessage(data.message || 'Configuración guardada. Reinicio pendiente.'); setPreview(null); }
        } catch (err) { if (currentMap.current === target) { setError(err.response?.data?.error || 'Resultado sin confirmar. Revisa los archivos antes de repetir.'); setPreview(null); } }
        finally { pending.current = false; setBusy(false); setModal(null); }
      } });
  }

  const visiblePreview = preview?.mapId === selectedMap ? preview : null;
  return <section className="h-full w-full overflow-y-auto pb-6 pr-1 custom-scrollbar">
    <p className="text-xs uppercase tracking-widest text-cyan-400">Configuración del servidor</p><h1 className="mt-2 text-3xl font-semibold">Modos de juego</h1>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">Prepara PvE, PvP o Hardcore para el mapa seleccionado. Revisa los cambios antes de guardar. Se conservan los multiplicadores; el servidor seguirá con su modo actual hasta reiniciarlo.</p>
    <p className="my-5 rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm">Mapa: <strong>{clusterMaps.find(map => map.id === selectedMap)?.name || selectedMap || 'Selecciona un mapa'}</strong></p>
    {error && <p role="alert" className="mb-4 text-sm text-red-300">{error}</p>}{message && <p role="status" className="mb-4 text-sm text-cyan-200">{message}</p>}
    <div className="grid gap-4 sm:grid-cols-2">{profiles.map(profile => <article key={profile.id} className="rounded-xl border border-zinc-800 bg-[#131316] p-5">{profile.id.includes('pvp') ? <Swords size={23} className="text-cyan-400" /> : <Shield size={23} className="text-cyan-400" />}<h2 className="mt-3 text-lg font-semibold">{profile.name || profile.label || profile.id}</h2><p className="mt-2 text-sm leading-6 text-zinc-400">{profile.description}</p><button disabled={!selectedMap || busy} onClick={() => prepare(profile)} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border border-zinc-700 px-4 text-sm hover:border-cyan-400 disabled:opacity-40">{busy && <RefreshCw size={14} className="animate-spin" />}Revisar cambios</button></article>)}</div>
    {visiblePreview && <article className="mt-5 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-5"><h2 className="font-semibold">Cambios propuestos · {visiblePreview.profile.name || visiblePreview.profile.id}</h2><p className="my-3 text-xs text-zinc-400">La revisión caduca a los 5 minutos. La programación automática de PvE quedará desactivada.</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-zinc-500"><tr><th className="p-2">Ajuste</th><th className="p-2">Actual</th><th className="p-2">Nuevo</th></tr></thead><tbody>{visiblePreview.changes.map(change => <tr key={`${change.file}-${change.key}`} className="border-t border-zinc-800"><td className="p-2 font-mono text-xs">{change.key}</td><td className="p-2">{String(change.previous ?? 'sin definir')}</td><td className="p-2 text-cyan-200">{String(change.to ?? change.after ?? change.value)}</td></tr>)}</tbody></table></div>{!visiblePreview.changes.length && <p className="my-3 text-sm text-zinc-400">Los ajustes ya coinciden con este perfil.</p>}<button disabled={busy} onClick={confirm} className="mt-4 min-h-11 rounded-lg bg-cyan-400 px-4 text-sm font-semibold text-zinc-950 disabled:opacity-40">Confirmar guardado…</button></article>}
  </section>;
}
