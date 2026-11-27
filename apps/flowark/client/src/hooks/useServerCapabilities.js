import { useEffect, useState } from 'react';
import axios from 'axios';

// Never reuse another map's permissions while the next request is in flight.
export function useServerCapabilities(mapId) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!mapId) return;
    const controller = new AbortController();
    axios.get(`/api/servers/${encodeURIComponent(mapId)}/capabilities`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setResult({ mapId, data }); })
      .catch(error => {
        if (!controller.signal.aborted) setResult({ mapId, error: error.response?.data?.error || 'No se pudieron consultar las capacidades.' });
      });
    return () => controller.abort();
  }, [mapId]);
  return result?.mapId === mapId ? result : { mapId, data: null, error: '', loading: Boolean(mapId) };
}
