import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Package, RefreshCw, Download, AlertTriangle } from 'lucide-react';
import { useDashboard } from '../context/DashboardContext.jsx';
import { HubResources } from './HubResources.jsx';
import { HubParityView } from './HubParityView.jsx';

const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm text-zinc-200 hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-40';
const errorText = error => error.response?.data?.error || 'No se pudo completar la consulta.';
const actionNames = { start: 'Iniciar', pause: 'Pausar', resume: 'Reanudar', stop: 'Detener', reload: 'Recargar' };

export function HubView() {
  const { userRole, userPermissions, setModal } = useDashboard();
  const [tab, setTab] = useState('native');
  const [catalog, setCatalog] = useState(null);
  const [instances, setInstances] = useState([]);
  const [instance, setInstance] = useState('');
  const [status, setStatus] = useState(null);
  const [artifacts, setArtifacts] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const operation = useRef(false);
  const selected = useRef(instance);
  useEffect(() => { selected.current = instance; }, [instance]);
  const canManage = ['owner', 'operator'].includes(userRole) && userPermissions.includes('obelisk.plugins.manage');

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      axios.get('/api/hub/catalog', { signal: controller.signal }),
      axios.get('/api/hub/instances', { signal: controller.signal }),
      axios.get('/api/hub/artifacts', { signal: controller.signal }),
    ]).then(([native, registered, releases]) => {
      if (controller.signal.aborted) return;
      if (native.status === 'fulfilled') setCatalog(native.value.data.catalog);
      if (registered.status === 'fulfilled') setInstances(registered.value.data.instances || []);
      if (releases.status === 'fulfilled') setArtifacts(releases.value.data.artifacts || []);
      const failed = [native, registered, releases].filter(result => result.status === 'rejected');
      if (failed.length) setError(failed.map(result => errorText(result.reason)).join(' '));
    }).catch(err => { if (!controller.signal.aborted) setError(errorText(err)); });
    return () => controller.abort();
  }, []);

  async function refreshStatus() {
    if (!instance || operation.current) return;
    const target = instance;
    operation.current = true; setBusy(true); setError('');
    try {
      const { data } = await axios.get(`/api/hub/instances/${encodeURIComponent(target)}/plugins`);
      if (selected.current !== target) return;
      setStatus({ instance: target, ...data });
      setUncertain(data.ok !== true || data.outcome !== 'confirmed');
      setNotice(data.ok === true && data.outcome === 'confirmed' ? 'Estado consultado. Esta lectura no certifica el funcionamiento dentro del juego.' : 'El runtime todavía no confirma el estado. Vuelve a consultar antes de otra operación.');
    } catch (err) { if (selected.current === target) setError(errorText(err)); }
    finally { operation.current = false; setBusy(false); }
  }

  async function execute(plugin, action, target) {
    if (operation.current || selected.current !== target) return;
    operation.current = true; setBusy(true); setError(''); setModal(null);
    // Mark unknown before sending: a lost response must never trigger a retry.
    setUncertain(true);
    try {
      const { data } = await axios.post(`/api/hub/instances/${encodeURIComponent(target)}/plugins/${encodeURIComponent(plugin.id)}/${action}`);
      if (selected.current !== target) return;
      setUncertain(data.outcome !== 'confirmed');
      setNotice(data.outcome === 'confirmed'
        ? `${plugin.id}: ${data.state}. Consulta el estado antes de otra operación.`
        : 'Resultado pendiente. Consulta el estado antes de repetir o ejecutar otra acción.');
      // Require an explicit fresh status even after a confirmed transition.
      setStatus(null);
    } catch (err) {
      if (selected.current === target) {
        setError(`${errorText(err)} Consulta el estado antes de repetir.`);
        setStatus(null);
      }
    } finally { operation.current = false; setBusy(false); }
  }

  function requestAction(plugin, action) {
    const target = instance;
    setModal({ title: `${actionNames[action]} ${plugin.id}`, color: 'amber',
      message: `Instancia: ${instances.find(item => item.id === target)?.name || target}. ${action === 'reload' || action === 'stop' ? 'Detener o recargar puede perder el estado de sesión del plugin, incluidos homes.' : 'El runtime comprobará si esta transición es segura.'}`,
      confirmText: actionNames[action], onConfirm: () => execute(plugin, action, target) });
  }

  const current = instances.find(item => item.id === instance);
  const freshStatus = status?.instance === instance ? status : null;
  return <section className="h-full w-full overflow-y-auto pr-1 pb-6 custom-scrollbar">
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs uppercase tracking-widest text-cyan-400">Ecosistema ObeliskNative</p><h1 className="mt-2 text-3xl font-semibold">Hub</h1><p className="mt-2 max-w-2xl text-sm text-zinc-400">Módulos nativos, SDK, recursos y paridad funcional de ArkApi.</p></div>
      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">Acceso experimental</span>
    </header>
    <nav aria-label="Secciones del Hub" className="mb-5 flex flex-wrap gap-2">
      {[['native', 'Módulos nativos'], ['resources', 'SDK y recursos'], ['artifacts', 'Artifacts'], ['references', 'Paridad de ArkApi']].map(([id, name]) => <button key={id} onClick={() => setTab(id)} aria-pressed={tab === id} className={`${button} ${tab === id ? 'border-cyan-500 bg-cyan-500/10 text-cyan-200' : ''}`}>{name}</button>)}
    </nav>
    {error && <p role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-sm text-cyan-100">{notice}</p>}
    {tab === 'native' && <>
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <label className="flex min-w-52 flex-1 flex-col gap-2 text-xs text-zinc-400">Instancia registrada
          <select value={instance} disabled={busy} onChange={event => { setInstance(event.target.value); setStatus(null); setUncertain(false); setNotice(''); setError(''); }} className="min-h-11 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-white">
            <option value="">Seleccionar instancia</option>{instances.map(item => <option key={item.id} value={item.id}>{item.name}{item.available ? '' : ' · sin conexión'}</option>)}
          </select>
        </label>
        <button className={button} disabled={!instance || busy} onClick={refreshStatus}><RefreshCw size={15} className={busy ? 'animate-spin' : ''} />Consultar estado</button>
        <p className="w-full text-xs text-zinc-500">{!instances.length ? 'No hay instancias locales registradas. El operador debe registrar el socket privado del runtime.' : 'El control en caliente requiere un runtime conectado y plugins cooperativos.'} {uncertain && 'Hay una operación pendiente de confirmar.'}</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">{(catalog?.plugins || []).map(plugin => {
        const runtime = freshStatus?.plugins?.find(item => item.plugin_id === plugin.id);
        const enabled = canManage && current?.available && current?.plugins?.includes(plugin.id) && freshStatus?.ok === true && freshStatus?.outcome === 'confirmed' && !busy && !uncertain;
        return <article key={plugin.id} className="rounded-xl border border-zinc-800 bg-[#131316] p-5">
          <div className="flex items-start justify-between gap-3"><div className="flex gap-3"><Package className="mt-1 shrink-0 text-cyan-400" size={20} /><div><h2 className="font-semibold">{plugin.name}</h2><p className="mt-1 font-mono text-xs text-zinc-500">{plugin.id} · {plugin.version}</p></div></div><span className="text-xs text-cyan-300">Community</span></div>
          <p className="mt-4 text-sm text-zinc-300">{plugin.summary}</p>
          <div className="my-4 flex flex-wrap gap-1.5">{plugin.commands.map(command => <code key={command} className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">{command}</code>)}</div>
          <ul className="space-y-1 text-xs leading-5 text-amber-200/80">{plugin.limitations.map(text => <li key={text}>{text}</li>)}</ul>
          <div className="mt-4 border-t border-zinc-800 pt-3"><p className="mb-3 text-xs text-zinc-500">Estado: <span className="text-zinc-200">{runtime?.state || 'sin consultar'}</span>{runtime?.faulted ? ' · fallo detectado' : ''}</p><div className="flex flex-wrap gap-2">{Object.entries(actionNames).map(([action, name]) => <button key={action} className={button} disabled={!enabled || (action !== 'start' && !runtime)} onClick={() => requestAction(plugin, action)}>{name}</button>)}</div></div>
        </article>;
      })}</div>
      {!catalog && !error && <p className="text-zinc-400">Cargando catálogo…</p>}
    </>}
    {tab === 'artifacts' && <>
      <div className="mb-5 flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100"><AlertTriangle size={19} className="shrink-0" /><p>Descarga la versión y verifica su firma con la clave pública de confianza antes de usarla. La actualización del runtime requiere detener el servidor. El Hub todavía no activa versiones.</p></div>
      {!artifacts.length && <p className="rounded-xl border border-zinc-800 p-6 text-zinc-400">Todavía no hay artifacts publicados en este panel.</p>}
      {artifacts.map(item => <article key={item.id} className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"><h2 className="text-xl font-semibold">{item.version}</h2><p className="mt-2 text-sm text-zinc-400">{item.platform} · ASE build {item.game_build} · API {item.api_bytes} · {item.stability}</p><p className="mt-3 text-xs text-amber-200">{item.runtime_ready ? 'Revisa las condiciones de aceptación de esta versión.' : 'Aceptación para producción pendiente.'}</p><p className="my-4 break-all font-mono text-xs text-zinc-500">SHA-256: {item.archive_sha256}</p><div className="flex flex-wrap gap-2">{[['archive', 'Descargar artifact'], ['manifest', 'Manifiesto'], ['signature', 'Firma']].map(([file, name]) => <a key={file} href={`/api/hub/artifacts/${encodeURIComponent(item.id)}/download?file=${file}`} className={button}><Download size={14} />{name}</a>)}</div></article>)}
    </>}
    {tab === 'resources' && <HubResources />}
    {tab === 'references' && <HubParityView />}
  </section>;
}
