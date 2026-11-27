import { useAuthedFetcher } from "@/hooks/fetch";
import { selectedMapIdAtom } from "@/hooks/arkClusterState";
import { useAtomValue } from "jotai";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
export function useArkData<T = any>(path: string, refreshInterval = 0) {
  const fetcher = useAuthedFetcher(),
    map = useAtomValue(selectedMapIdAtom);
  return useSWR<T>(
    [path, map],
    async () => {
      const data = await fetcher<any>(path);
      if (data?.error) throw Error(data.error);
      return data;
    },
    { refreshInterval, revalidateOnFocus: true, keepPreviousData: false },
  );
}
export function useArkMutation() {
  const fetcher = useAuthedFetcher();
  return async (
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body: unknown,
  ) => {
    const data = await fetcher<any>(path, { method, body });
    if (data?.error) throw Error(data.error);
    return data;
  };
}
export function ArkPage({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="w-full min-w-0 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}
export function ArkDataState({
  error,
  loading,
  retry,
}: {
  error?: Error;
  loading?: boolean;
  retry?: () => void;
}) {
  return error ? (
    <div
      role="alert"
      className="rounded-lg border border-destructive/40 bg-card p-4 text-sm"
    >
      <p className="text-destructive-inline">{error.message}</p>
      {retry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
          Reintentar
        </Button>
      )}
    </div>
  ) : loading ? (
    <div
      role="status"
      className="rounded-lg border bg-card p-6 text-sm text-muted-foreground"
    >
      Cargando datos de ARK…
    </div>
  ) : null;
}
