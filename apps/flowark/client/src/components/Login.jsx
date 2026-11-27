import { useEffect, useState } from 'react';
import axios from 'axios';
import { Server, ArrowRight, ShieldCheck } from 'lucide-react';

export default function Login() {
    const [provider, setProvider] = useState('loading');
    useEffect(() => {
        const controller = new AbortController();
        axios.get('/api/auth/providers', { signal: controller.signal })
            .then(({ data }) => { if (!controller.signal.aborted) setProvider(data.discord === true ? 'ready' : 'unavailable'); })
            .catch(() => { if (!controller.signal.aborted) setProvider('unavailable'); });
        return () => controller.abort();
    }, []);
    const ssoError = new URLSearchParams(window.location.search).has('sso_error');
    return (
        <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050505] p-5 font-sans text-white">
            <div aria-hidden="true" className="pointer-events-none absolute h-96 w-96 rounded-full bg-cyan-600/15 blur-[120px]" />
            <section className="relative w-full max-w-[420px] overflow-hidden rounded-3xl border border-zinc-800 bg-[#0f0f13] p-8 shadow-2xl sm:p-10" aria-labelledby="login-title">
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400" />
                <div className="mb-8 flex flex-col items-center text-center">
                    <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-400 text-[#09090b]"><Server size={28} /></div>
                    <h1 id="login-title" className="text-3xl font-extrabold tracking-tight">Obelisk<span className="text-cyan-400">Native</span></h1>
                    <p className="mt-2 text-sm text-zinc-400">Administración de servidores ARK</p>
                </div>
                {ssoError && <p role="alert" className="mb-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-200">No se ha completado el acceso. Vuelve a intentarlo con la cuenta de Discord autorizada por un propietario del panel.</p>}
                {provider === 'ready' ? (
                    <a href="/api/auth/oidc/start" className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-cyan-400 px-4 py-4 font-bold text-[#09090b] transition-colors hover:bg-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400">Acceder con Discord <ArrowRight size={18} /></a>
                ) : <button disabled className="min-h-12 w-full rounded-xl bg-zinc-800 px-4 py-4 text-sm text-zinc-400">{provider === 'loading' ? 'Preparando acceso…' : 'Acceso temporalmente no disponible'}</button>}
                {provider === 'unavailable' && <p role="alert" className="mt-3 text-sm text-amber-200">No se pudo preparar la conexión con Discord. Recarga la página para volver a intentarlo.</p>}
                <div className="mt-7 border-t border-zinc-800 pt-6 text-center">
                    <ShieldCheck size={20} className="mx-auto mb-2 text-zinc-500" />
                    <p className="text-xs leading-5 text-zinc-500">Tu cuenta se vincula automáticamente al acceder.<br />Un propietario debe autorizar tu ID de Discord.</p>
                </div>
            </section>
        </main>
    );
}
