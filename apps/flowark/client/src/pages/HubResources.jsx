import { useEffect, useState } from 'react';
import axios from 'axios';
import { Download, FileCode2, BookOpen, RefreshCw } from 'lucide-react';

export function HubResources() {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    axios.get('/api/hub/resources', { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) { setCatalog(data.resources); setError(''); } })
      .catch(err => { if (!controller.signal.aborted) setError(err.response?.data?.error || 'No se pudieron cargar los recursos del SDK.'); });
    return () => controller.abort();
  }, [attempt]);
  return <div>
    <div className="mb-6 max-w-3xl">
      <h2 className="text-xl font-semibold">Desarrolla un plugin nativo</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">Instala el SDK de una versión verificada del runtime, elige una plantilla y compílala para Linux. Empieza con comandos y respuestas para probar un recorrido dentro del juego.</p>
    </div>
    {error && <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 text-sm text-red-200">{error}<button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-zinc-700 px-3" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={14} />Reintentar</button></div>}
    {!catalog && !error && <p role="status" className="text-sm text-zinc-400">Cargando recursos del SDK…</p>}
    {catalog && <>
      <p className="mb-5 text-sm text-zinc-500">SDK {catalog.sdk_version} experimental para Linux x86_64. Las plantillas incluyen código, instrucciones y licencia.</p>
      <div className="divide-y divide-zinc-800 border-y border-zinc-800">
        {catalog.items.map(item => <article key={item.id} className="flex flex-wrap items-start gap-4 py-5">
          {item.kind === 'guide' ? <BookOpen className="mt-1 shrink-0 text-cyan-300" size={22} /> : <FileCode2 className="mt-1 shrink-0 text-zinc-400" size={22} />}
          <div className="min-w-0 flex-1 basis-56">
            <h3 className="font-semibold">{item.title}</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">{item.summary}</p>
            {item.commands.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{item.commands.map(command => <code key={command} className="rounded bg-zinc-800 px-2 py-1 text-xs text-cyan-100">{command}</code>)}</div>}
            <details className="mt-3 text-xs text-zinc-500"><summary className="w-fit cursor-pointer py-1 text-zinc-400">Archivos incluidos</summary><ul className="mt-2 space-y-2">{item.files.map(file => <li key={file.name}><span className="break-all text-zinc-300">{file.name}</span> <span>({file.size} bytes)</span><code className="mt-1 block break-all text-[11px]">SHA-256 {file.sha256}</code></li>)}</ul></details>
          </div>
          <a href={`/api/hub/resources/${encodeURIComponent(item.id)}/download`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-zinc-700 px-4 text-sm text-zinc-200 hover:border-cyan-400 focus-visible:outline-2 focus-visible:outline-cyan-400" aria-label={`Descargar ${item.title}`}><Download size={15} />Descargar .tar.gz</a>
        </article>)}
      </div>
      <p className="mt-5 max-w-3xl text-xs leading-6 text-amber-200/80">Las respuestas usan la invocación actual. Los IDs observados no autentican cuentas. La aceptación de cada recurso exige sus propias pruebas de gameplay.</p>
    </>}
  </div>;
}
