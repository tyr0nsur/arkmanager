import { ArkPage } from "./ArkPage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/auth";
export default function SettingsPage() {
  const navigate = useLocation()[1],
    { authData } = useAuth();
  return (
    <ArkPage
      title="Configuración de ObeliskPanel"
      description="Acceso, contexto del clúster y ajustes nativos de ARK."
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acceso con Discord</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            El panel utiliza su propio Keycloak. Tu cuenta se vincula por su ID
            de Discord.
          </p>
          <dl className="text-sm space-y-2">
            <div>
              <dt className="text-muted-foreground">Cuenta</dt>
              <dd>{authData && authData.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                Zona horaria del servidor
              </dt>
              <dd>{window.txConsts.serverTimezone}</dd>
            </div>
          </dl>
          <Button variant="outline" onClick={() => navigate("/admins")}>
            Gestionar administradores
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuración del juego</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Selecciona un mapa en el menú del servidor para editar sus archivos
            Game.ini y GameUserSettings.ini. El mundo se conserva al reiniciar.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate("/server/cfg-editor")}>
              Abrir editor INI
            </Button>
            <Button variant="outline" onClick={() => navigate("/tasks")}>
              Programación
            </Button>
            <Button variant="outline" onClick={() => navigate("/hub")}>
              SDK y recursos
            </Button>
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">ObeliskPanel para ARK · Basado en <a className="underline" href="https://github.com/citizenfx/txAdmin" target="_blank" rel="noopener noreferrer">txAdmin</a>, licencia MIT.</p>
    </ArkPage>
  );
}
