import { useAtomValue } from "jotai";
import { arkMapsAtom, selectedMapIdAtom } from "@/hooks/arkClusterState";
import { useSelectArkMap } from "@/hooks/arkCluster";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
export default function ArkMapSelector() {
  const maps = useAtomValue(arkMapsAtom),
    selected = useAtomValue(selectedMapIdAtom),
    choose = useSelectArkMap();
  return (
    <div className="mb-4">
      <label
        className="mb-2 block text-xs text-muted-foreground"
        htmlFor="ark-map-selector"
      >
        Mapa del clúster
      </label>
      <Select value={selected} onValueChange={choose}>
        <SelectTrigger id="ark-map-selector" aria-label="Mapa del clúster">
          <SelectValue placeholder="Selecciona un mapa" />
        </SelectTrigger>
        <SelectContent>
          {maps.map((map) => (
            <SelectItem key={map.id} value={map.id}>
              {map.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
