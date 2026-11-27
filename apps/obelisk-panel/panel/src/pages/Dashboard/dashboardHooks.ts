import {arkDashboardAtom} from "@/hooks/arkCluster";
import {atom,useSetAtom} from "jotai";
import type {ArkContext} from "@shared/arkTypes";
export const dashDataTsAtom = atom(0);
export function useSetDashboardData() {
 const setArk = useSetAtom(arkDashboardAtom), setTime = useSetAtom(dashDataTsAtom);
 return (payload: {ark?: ArkContext}) => {setArk(payload.ark || null);setTime(Date.now());};
}
