import { useEffect, useState } from 'react';

export function useClusterMonitor() {
  const [snapshot, setSnapshot] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [generation, setGeneration] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const stream = new EventSource('/api/monitor/stream');
    const update = event => {
      try {
        const value = JSON.parse(event.data);
        if (value.schema !== 'obelisk.panel.monitor.v1' || !Array.isArray(value.maps)) throw Error('invalid_stream');
        setSnapshot(value); setConnection('connected'); setNow(Date.now());
      } catch { setConnection('error'); }
    };
    stream.addEventListener('snapshot', update);
    stream.onerror = () => setConnection('reconnecting');
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(timer); stream.removeEventListener('snapshot', update); stream.close(); };
  }, [generation]);
  return { snapshot, connection, now, reconnect: () => { setConnection('connecting'); setGeneration(current => current + 1); } };
}
