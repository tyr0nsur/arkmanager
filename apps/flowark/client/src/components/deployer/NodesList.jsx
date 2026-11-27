import { useCallback, useEffect, useRef, useState } from 'react';
import { Database, Plus, RefreshCw, Server, Users } from 'lucide-react';
import axios from 'axios';
const API_BASE = '/api';

export function NodesList() {
    const [nodes, setNodes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const nodesRequestRef = useRef(null);

    const fetchNodes = useCallback(async () => {
        nodesRequestRef.current?.abort();
        const controller = new AbortController();
        nodesRequestRef.current = controller;
        setLoading(true);
        try {
            const res = await axios.get(`${API_BASE}/nodes`, { signal: controller.signal });
            if (nodesRequestRef.current !== controller) return;
            setNodes(res.data.nodes || []);
            setError('');
        } catch (err) {
            if (err.name === 'CanceledError' || axios.isCancel?.(err)) return;
            if (nodesRequestRef.current !== controller) return;
            const message = err.response?.data?.error || 'Error al obtener la lista de nodos';
            setError(message);
        } finally {
            if (nodesRequestRef.current === controller) {
                nodesRequestRef.current = null;
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        fetchNodes();
        // Auto-refresh every 30 seconds
        const interval = setInterval(fetchNodes, 30000);
        return () => {
            clearInterval(interval);
            nodesRequestRef.current?.abort();
            nodesRequestRef.current = null;
        };
    }, [fetchNodes]);

    return (
        <div className="space-y-6">
            <div className="bg-[#18181b] border border-zinc-800/50 rounded-xl overflow-hidden relative">
                <div className="p-5 border-b border-zinc-800/50 flex justify-between items-center">
                    <h3 className="font-bold text-white text-lg flex items-center gap-2">
                        <Database size={18} className="text-zinc-400"/>
                        Nodos Conectados
                    </h3>
	                    <button type="button" onClick={() => fetchNodes()} disabled={loading} className="p-1 text-zinc-500 hover:text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50" title={loading ? 'Actualizando nodos' : 'Actualizar nodos'} aria-label="Actualizar nodos">
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                <div className="p-0">
                    {error && (
                        <div className="flex items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
                            <span className="min-w-0 break-words">{error}</span>
	                            <button type="button" onClick={() => fetchNodes()} disabled={loading} className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-amber-400/30 px-3 font-semibold text-amber-200 transition-colors hover:bg-amber-400/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">
                                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                                {loading ? 'Reintentando...' : 'Reintentar'}
                            </button>
                        </div>
                    )}
                    {loading && nodes.length === 0 ? (
                        <div className="p-8 text-center text-zinc-500 text-sm">Cargando nodos...</div>
                    ) : nodes.length === 0 && !error ? (
                        <div className="p-8 text-center text-zinc-500 text-sm">No se encontraron nodos.</div>
                    ) : nodes.length === 0 ? (
                        <div className="p-8 text-center text-zinc-500 text-sm">Inventario de nodos no disponible.</div>
                    ) : (
                        nodes.map((node) => {
                            const isOnline = node.status === 'online';
                            return (
                                <div key={node.id} className={`p-4 border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors ${!isOnline ? 'opacity-60' : ''}`}>
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="flex items-center gap-2">
                                            <Server size={14} className={isOnline ? 'text-cyan-400' : 'text-zinc-500'} />
                                            <span className="font-semibold text-sm text-zinc-200">{node.name}</span>
                                        </div>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${isOnline ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                            {isOnline ? 'ONLINE' : 'OFFLINE'}
                                        </span>
                                    </div>
                                    <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-3 mb-1">
                                        <div
                                            className={`h-full rounded-full transition-all duration-700 ${isOnline ? 'bg-cyan-500' : 'bg-zinc-700'}`}
                                            style={{ width: `${Math.min(Math.max(Number(node.cpu) || 0, 0), 100)}%` }}
                                            role="progressbar"
                                            aria-valuenow={Math.round(Number(node.cpu) || 0)}
                                            aria-valuemin={0}
                                            aria-valuemax={100}
                                            aria-label={`CPU ${node.name}`}
                                        ></div>
                                    </div>
                                    <div className="flex justify-between items-center mt-1.5">
                                        <span className="text-[10px] text-zinc-500 block">
                                            {isOnline ? `CPU: ${node.cpu}% | RAM: ${node.memory}GB` : 'Sin conexión'}
                                        </span>
                                        {isOnline && (
                                            <span className="text-[10px] text-zinc-400 flex items-center gap-1 font-medium bg-zinc-800/80 px-1.5 py-0.5 rounded">
                                                <Users size={10} /> {node.players} / 70
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="p-4 bg-[#09090b]">
	                    <button type="button" disabled className="w-full bg-zinc-800 text-zinc-500 text-xs font-bold uppercase tracking-wider py-2 rounded border border-zinc-700 flex items-center justify-center gap-2 cursor-not-allowed opacity-70">
                        <Plus size={14} /> Vinculación de nodos no implementada
                    </button>
                    <p className="mt-2 text-center text-[11px] text-zinc-600">Pendiente de flujo seguro con API key y alta explícita de nodos.</p>
                </div>
            </div>
        </div>
    );
}
