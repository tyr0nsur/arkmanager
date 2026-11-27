import { atom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import type { ArkClusterSnapshot, ArkContext } from "@shared/arkTypes";
import { getSocket } from "@/lib/utils";
import {confirmDialogOpenAtom,promptDialogOpenAtom} from "./dialogs";
import { selectedMapIdAtom, arkMapsAtom } from "./arkClusterState";
export const arkDashboardAtom = atom<ArkContext | null>(null);
export function useArkContext() {
  const context = useAtomValue(arkDashboardAtom),
    selected = useAtomValue(selectedMapIdAtom);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const data = context?.instance.id === selected ? context : null;
  const fresh =
    data?.native?.status === "connected" &&
    Number.isFinite(data.native.lastSeenAt) &&
    now - (data.native.lastSeenAt || 0) <= 6500;
  return {
    context: data,
    native: data?.native,
    game: data?.game,
    fresh,
    metrics: fresh ? data?.native?.metrics : null,
    now,
  };
}
export function useArkCluster(enabled = true) {
  const [data, setData] = useState<ArkClusterSnapshot | null>(null),
    [connected, setConnected] = useState(false);
  const selected = useAtomValue(selectedMapIdAtom);
  useEffect(() => {
    if (!selected || !enabled) return;
    const socket = getSocket(["ark-cluster"]);
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));
    socket.on("arkCluster", (value) => setData(value));
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [selected, enabled]);
  return { data, connected };
}
export function useSelectArkMap() {
  const closeConfirm = useSetAtom(confirmDialogOpenAtom), closePrompt = useSetAtom(promptDialogOpenAtom);
  const setSelected = useSetAtom(selectedMapIdAtom),
    maps = useAtomValue(arkMapsAtom);
  return (id: string) => {
    if (!maps.some((map) => map.id === id)) return;
    closeConfirm(false);closePrompt(false);
    setSelected(id);
    try {
      localStorage.setItem("obelisk.selectedMap", id);
    } catch {}
    const url = new URL(location.href);
    url.searchParams.set("map", id);
    history.replaceState(null, "", url);
  };
}
