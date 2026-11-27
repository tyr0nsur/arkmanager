import { useEffect, useState } from 'react';
import axios from 'axios';
import { ExternalLink, X, RefreshCw } from 'lucide-react';

const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm text-zinc-200 hover:border-cyan-400 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-cyan-400';
const errorText = error => error.response?.data?.error || 'No se pudo cargar el contrato. Reintenta la consulta.';
const dimensions = { command_syntax: 'Sintaxis y comandos', default_limits: 'Límites y valores por defecto', persistence: 'Persistencia', visible_output: 'Resultado visible', client_mod_or_gui: 'Interfaz y mods del cliente', failure_lifecycle: 'Fallos y ciclo de vida', steam_epic_gameplay: 'Gameplay en Steam y Epic' };
const stages = { Pending: 'Pendiente', DependencyDocumented: 'Dependencia documentada', Accepted: 'Aceptado' };

function ReferenceDetail({ id, close }) {
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    axios.get(`/api/hub/references/${id}`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) { setItem(data.reference); setError(''); } })
      .catch(err => { if (!controller.signal.aborted) setError(errorText(err)); });
    return () => controller.abort();
  }, [id, attempt]);
  const contract = item?.selected_contract;
  return <article aria-label="Contrato del recurso" className="mb-6 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-5">
    <div className="flex items-start justify-between gap-4"><h2 className="min-w-0 break-words text-xl font-semibold">{item?.name || 'Cargando contrato…'}</h2><button onClick={close} className={button} aria-label="Cerrar ficha"><X size={16} /></button></div>
    {error && <p role="alert" className="mt-4 text-sm text-red-200">{error} <button className={button} onClick={() => setAttempt(value => value + 1)}>Reintentar</button></p>}
    {item && <>
      <p className="mt-2 text-xs text-zinc-400">Referencia {item.resource_id}, versión {item.version}. Snapshot {item.snapshot_date}.</p>
      <p className="mt-3 text-sm text-amber-200">{item.gameplay_parity_accepted ? 'Paridad aceptada para este perfil de referencia.' : 'Paridad pendiente de aceptación.'} {item.related_native_modules.length > 0 && `Implementación relacionada: ${item.related_native_modules.join(', ')}.`}</p>
      {contract?.gap && <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">{contract.gap}</p>}
      <div className="mt-5 grid gap-6 xl:grid-cols-2">
        <div>
          <h3 className="mb-3 font-medium">Contrato observable</h3>
          {contract?.requirements.length > 0 ? <ul className="list-disc space-y-2 pl-4 text-sm leading-6 text-zinc-300">{contract.requirements.map(text => <li key={text}>{text}</li>)}</ul> : <p className="text-sm text-zinc-400">Falta concretar el comportamiento público y su configuración para esta versión.</p>}
          <h4 className="mt-4 text-sm font-medium text-zinc-300">Comandos documentados</h4>
          <div className="mt-2 flex flex-wrap gap-2">{(contract?.commands.length ? contract.commands : item.commands).map(command => <code key={command} className="max-w-full break-words rounded bg-zinc-900 px-2 py-1 text-xs text-cyan-100">{command}</code>)}</div>
          {!item.commands.length && !contract?.commands.length && <p className="mt-2 text-xs text-zinc-500">Sin sintaxis de comandos especificada.</p>}
          <p className="mt-3 text-xs leading-5 text-zinc-500">La sintaxis documentada debe contrastarse con la configuración y los escenarios seleccionados.</p>
          {item.dependencies.length > 0 && <p className="mt-4 break-words text-sm text-zinc-400">Dependencias e integraciones mencionadas: {item.dependencies.join(', ')}.</p>}
        </div>
        <div>
          <h3 className="mb-3 font-medium">Aceptación por comportamiento</h3>
          <dl className="divide-y divide-zinc-800">{Object.entries(dimensions).map(([key, label]) => <div key={key} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><dt className="text-zinc-300">{label}</dt><dd className={item.behavior_matrix?.[key]?.stage === 'Accepted' ? 'text-emerald-300' : 'text-amber-200'}>{stages[item.behavior_matrix?.[key]?.stage] || 'Pendiente'}</dd></div>)}</dl>
          {item.required_primitives.length > 0 && <details className="mt-4 text-xs text-zinc-400"><summary className="cursor-pointer py-1">Primitivas que necesita el SDK</summary><ul className="mt-2 space-y-2">{item.required_primitives.map(primitive => <li key={primitive} className="break-words font-mono">{primitive}</li>)}</ul></details>}
        </div>
      </div>
      {/^https:\/\//.test(item.source_url) && <a href={item.source_url} target="_blank" rel="noreferrer" className={`${button} mt-5`}><ExternalLink size={14} />Consultar referencia pública</a>}
    </>}
  </article>;
}

export function HubParityView() {
  const [overview, setOverview] = useState(null);
  const [references, setReferences] = useState(null);
  const [search, setSearch] = useState('');
  const [family, setFamily] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [overviewError, setOverviewError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    axios.get('/api/hub/parity', { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) { setOverview(data.parity); setOverviewError(''); } })
      .catch(err => { if (!controller.signal.aborted) setOverviewError(errorText(err)); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ search, family, page, pageSize: 15 });
      axios.get(`/api/hub/references?${params}`, { signal: controller.signal })
        .then(({ data }) => { if (!controller.signal.aborted) { setReferences(data.references); setError(''); setLoading(false); } })
        .catch(err => { if (!controller.signal.aborted) { setError(errorText(err)); setLoading(false); } });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, family, page, attempt]);
  function filter(setter, value) { setter(value); setPage(1); setLoading(true); }
  return <div>
    <h2 className="text-xl font-semibold">Paridad funcional de ArkApi</h2>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Seguimos el comportamiento de cada recurso: comandos, límites, persistencia, salida, interfaz, fallos y pruebas reales en Steam y Epic.</p>
    {overview && <div className="my-5 border-l-2 border-cyan-400 pl-4"><p className="font-medium text-zinc-200">{overview.accepted} de {overview.total} recursos aceptados</p><p className="mt-1 text-sm text-zinc-400">{overview.selected_contracts} contratos públicos seleccionados. Catálogo fijado al {overview.snapshot_date}.</p><p className="mt-2 text-xs leading-5 text-amber-200/80">Los módulos de prototipo y las referencias pendientes requieren aceptación por separado. Las referencias todavía no se instalan desde el Hub.</p></div>}
    {overviewError && <p role="alert" className="my-3 text-sm text-red-200">Resumen no disponible: {overviewError} <button className={button} onClick={() => { setLoading(true); setAttempt(value => value + 1); }}>Reintentar</button></p>}
    <div className="my-5 flex flex-wrap gap-4">
      <label className="min-w-0 flex-1 basis-64 text-sm text-zinc-400">Buscar recurso<input value={search} maxLength={128} onChange={event => filter(setSearch, event.target.value)} className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-white" placeholder="Nombre o función" /></label>
      <label className="min-w-0 flex-1 basis-56 text-sm text-zinc-400">Familia funcional<select value={family} onChange={event => filter(setFamily, event.target.value)} className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-white"><option value="">Todas las familias</option>{(references?.families || []).map(id => <option key={id} value={id}>{id.replaceAll('_', ' ')}</option>)}</select></label>
    </div>
    {selected && <ReferenceDetail key={selected} id={selected} close={() => setSelected(null)} />}
    {error && <p role="alert" className="mb-4 text-sm text-red-200">{error} <button className={button} onClick={() => { setLoading(true); setAttempt(value => value + 1); }}>Reintentar</button></p>}
    {loading && <p role="status" className="mb-3 text-sm text-zinc-400">Consultando referencias…</p>}
    {!loading && !error && references?.items.length === 0 && <p className="py-6 text-sm text-zinc-400">No hay recursos que coincidan. Cambia la búsqueda o la familia.</p>}
    <div aria-busy={loading} className={`divide-y divide-zinc-800 rounded-xl border border-zinc-800 ${loading || error ? 'hidden' : ''}`}>
      {references?.items.map(item => <article key={item.resource_id} className="flex flex-wrap items-start justify-between gap-4 p-4"><div className="min-w-0 flex-1 basis-52"><h3 className="break-words font-medium">{item.name}</h3><p className="mt-1 text-xs text-zinc-500">Versión {item.version} · referencia {item.resource_id}</p>{item.summary && <p className="mt-2 text-sm leading-6 text-zinc-400">{item.summary}</p>}</div><button className={button} aria-label={`Ver contrato de ${item.name}`} onClick={() => setSelected(item.resource_id)}>Ver contrato</button></article>)}
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-4"><button className={button} disabled={page <= 1 || loading} onClick={() => { setLoading(true); setPage(value => value - 1); }}>Anterior</button><span className="text-sm text-zinc-400">Página {page} · {references?.total ?? '…'} referencias</span><button className={button} disabled={loading || Boolean(error) || !references || page * references.pageSize >= references.total} onClick={() => { setLoading(true); setPage(value => value + 1); }}>Siguiente</button><button className={button} aria-label="Actualizar catálogo de paridad" onClick={() => { setLoading(true); setAttempt(value => value + 1); }}><RefreshCw size={14} /></button></div>
    {overview && <details className="mt-6 border-t border-zinc-800 pt-4"><summary className="cursor-pointer py-2 text-sm text-zinc-300">Dominios del SDK necesarios para la paridad</summary><div className="mt-3 divide-y divide-zinc-800">{overview.sdk_domains.map(domain => <article key={domain.id} className="py-4"><h3 className="break-words font-mono text-sm text-cyan-100">{domain.id}</h3><ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-6 text-zinc-400">{domain.requirements.map(text => <li key={text}>{text}</li>)}</ul></article>)}</div></details>}
  </div>;
}
