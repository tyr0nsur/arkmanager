import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAccountModal } from "@/hooks/dialogs";
import { useAuth } from "@/hooks/auth";
import { Button } from "@/components/ui/button";
export default function AccountDialog() {
  const { isAccountModalOpen, setAccountModalOpen } = useAccountModal(),
    { authData, logout } = useAuth();
  return (
    <Dialog open={isAccountModalOpen} onOpenChange={setAccountModalOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tu cuenta de Discord</DialogTitle>
          <DialogDescription>
            Acceso a ObeliskPanel mediante el proveedor dedicado del clúster.
          </DialogDescription>
        </DialogHeader>
        {authData && (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Cuenta del panel</dt>
              <dd>{authData.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">ID de Discord</dt>
              <dd className="font-mono">
                {authData.discordId || "No disponible"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Rol</dt>
              <dd>
                {authData.role === "owner"
                  ? "Propietario"
                  : authData.role === "operator"
                    ? "Operador"
                    : "Solo lectura"}
              </dd>
            </div>
          </dl>
        )}
        <Button variant="outline" onClick={logout}>
          Cerrar sesión
        </Button>
      </DialogContent>
    </Dialog>
  );
}
