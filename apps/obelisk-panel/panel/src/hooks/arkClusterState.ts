import { atom, getDefaultStore } from "jotai";
import type { ArkMap } from "@shared/arkTypes";
const configuredMaps = window.txConsts.arkCluster?.maps || [];
export const arkMapsAtom = atom<ArkMap[]>(configuredMaps);
let requested = new URLSearchParams(location.search).get("map");
try {
  requested ||= localStorage.getItem("obelisk.selectedMap");
} catch {
  /* browser storage is optional */
}
export const selectedMapIdAtom = atom(
  configuredMaps.some((map) => map.id === requested)
    ? requested!
    : configuredMaps[0]?.id || "",
);
export const selectedMapAtom = atom((get) =>
  get(arkMapsAtom).find((map) => map.id === get(selectedMapIdAtom)),
);
export const getSelectedMapId = () => getDefaultStore().get(selectedMapIdAtom);
