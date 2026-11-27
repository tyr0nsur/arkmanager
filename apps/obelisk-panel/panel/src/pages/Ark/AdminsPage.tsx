import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/auth";
import { useOpenPromptDialog } from "@/hooks/dialogs";
import { ArkPage, ArkDataState, useArkData, useArkMutation } from "./ArkPage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
const roles = [
  ["viewer", "Solo lectura"],
  ["operator", "Operador"],
  ["owner", "Propietario"],
];
function RoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label="Rol del administrador">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function PermissionEditor({
  admin,
  busy,
  save,
}: {
  admin: any;
  busy: boolean;
  save: (permissions: { allow: string[]; deny: string[] }) => Promise<boolean>;
}) {
  const catalog = useArkData("/api/permissions"),
    [allow, setAllow] = useState<string[]>(admin.permissions?.allow || []),
    [deny, setDeny] = useState<string[]>(admin.permissions?.deny || []);
  useEffect(() => {
    setAllow(admin.permissions?.allow || []);
    setDeny(admin.permissions?.deny || []);
  }, [admin]);
  return (
    <details className="w-full border-t pt-3">
      <summary className="cursor-pointer text-xs text-muted-foreground">
        Permisos específicos de {admin.username}
      </summary>
      <div className="mt-3 space-y-3">
        <ArkDataState
          error={catalog.error}
          loading={catalog.isLoading}
          retry={() => catalog.mutate()}
        />
        {Object.entries(catalog.data?.permissions || {}).map(
          ([key, metadata]: [string, any]) => (
            <label
              key={key}
              className="flex flex-wrap items-center justify-between gap-3 text-sm"
            >
              <span>{metadata.label}</span>
              <select
                aria-label={metadata.label + " para " + admin.username}
                className="h-9 rounded-md border bg-background px-2 text-xs"
                disabled={busy}
                value={
                  allow.includes(key)
                    ? "allow"
                    : deny.includes(key)
                      ? "deny"
                      : "inherit"
                }
                onChange={(event) => {
                  setAllow((current) => [
                    ...current.filter((value) => value !== key),
                    ...(event.target.value === "allow" ? [key] : []),
                  ]);
                  setDeny((current) => [
                    ...current.filter((value) => value !== key),
                    ...(event.target.value === "deny" ? [key] : []),
                  ]);
                }}
              >
                <option value="inherit">Heredar del rol</option>
                <option value="allow">Permitir</option>
                <option value="deny">Denegar</option>
              </select>
            </label>
          ),
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !catalog.data}
          onClick={() => save({ allow, deny })}
        >
          Guardar permisos
        </Button>
        <p className="text-xs text-muted-foreground">
          Los cambios invalidan la sesión anterior. El rol mínimo de cada
          operación sigue siendo obligatorio.
        </p>
      </div>
    </details>
  );
}
export default function AdminsPage() {
  const { data, error, isLoading, mutate } = useArkData<any[]>("/api/admins"),
    send = useArkMutation(),
    { authData } = useAuth(),
    prompt = useOpenPromptDialog();
  const [username, setUsername] = useState(""),
    [discordId, setDiscordId] = useState(""),
    [role, setRole] = useState("operator"),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const request = async (
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body: unknown,
  ) => {
    setBusy(true);
    setNotice("");
    try {
      const result = await send(path, method, body);
      setNotice(result.message || "Acceso actualizado");
      await mutate();
      return true;
    } catch (e) {
      setNotice((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const confirmed = (
    title: string,
    expected: string,
    action: (confirmation: string) => void,
  ) =>
    prompt({
      title,
      message: `Escribe ${expected} para confirmar.`,
      required: true,
      placeholder: expected,
      submitLabel: "Confirmar",
      onSubmit: (input) => {
        if (input.trim() !== expected) {
          setNotice("La confirmación no coincide.");
          return;
        }
        action(expected);
      },
    });
  const invite = () => {
    const body = { username: username.trim(), discordId, role };
    const save = async (confirmation?: string) => {
      if (
        await request("/api/admins", "POST", {
          ...body,
          ...(confirmation ? { confirmation } : {}),
        })
      ) {
        setUsername("");
        setDiscordId("");
        setRole("operator");
      }
    };
    if (role === "owner")
      confirmed("Autorizar propietario", `OWNER ${body.username}`, save);
    else save();
  };
  const owners = data?.filter((admin) => admin.role === "owner").length || 0;
  return (
    <ArkPage
      title="Administradores"
      description="Autoriza cuentas de Discord y asigna el acceso a todo el clúster."
    >
      <ArkDataState error={error} loading={isLoading} retry={() => mutate()} />
      {notice && (
        <p role="status" className="rounded-lg border bg-card p-4 text-sm">
          {notice}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Añadir administrador con Discord
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="admin-alias" className="mb-2 block text-sm">
                Alias del panel
              </label>
              <Input
                id="admin-alias"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Alias de 3 a 32 caracteres"
                maxLength={32}
              />
            </div>
            <div>
              <label htmlFor="admin-discord" className="mb-2 block text-sm">
                ID de usuario de Discord
              </label>
              <Input
                id="admin-discord"
                inputMode="numeric"
                value={discordId}
                onChange={(e) => setDiscordId(e.target.value)}
                placeholder="17–20 dígitos"
                maxLength={20}
              />
            </div>
            <RoleSelect value={role} onChange={setRole} />
            <Button
              onClick={invite}
              disabled={
                busy ||
                !data ||
                !/^\d{17,20}$/.test(discordId) ||
                !/^[A-Za-z0-9_.-]{3,32}$/.test(username.trim())
              }
            >
              Autorizar cuenta
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Discord → Ajustes → Avanzado → Modo desarrollador. Copia el ID del
            usuario. La cuenta se vinculará en su primer acceso.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0 divide-y">
          {data?.map((admin) => {
            const self = authData && admin.username === authData.name,
              protectedOwner = admin.role === "owner" && owners < 2;
            return (
              <div
                key={admin.id}
                className="flex flex-wrap items-center justify-between gap-4 p-4"
              >
                <div>
                  <p className="font-medium">
                    {admin.username}
                    {self ? " · Tú" : ""}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    Discord: {admin.discordId || "Sin vincular"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {admin.status === "active"
                      ? "Cuenta vinculada"
                      : "Pendiente del primer acceso"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="w-40">
                    <RoleSelect
                      value={admin.role}
                      disabled={busy || !!self}
                      onChange={(next) => {
                        if (protectedOwner && next !== "owner") {
                          setNotice(
                            "No puedes degradar al último propietario.",
                          );
                          return;
                        }
                        confirmed(
                          "Cambiar rol",
                          `ROL ${admin.username}`,
                          (confirmation) =>
                            request(
                              "/api/admins/" + encodeURIComponent(admin.id),
                              "PATCH",
                              { role: next, confirmation },
                            ),
                        );
                      }}
                    />
                  </div>
                  <Button
                    variant="outline"
                    disabled={busy || !!self || protectedOwner}
                    onClick={() =>
                      confirmed(
                        "Revocar acceso",
                        admin.username,
                        (confirmation) =>
                          request(
                            "/api/admins/" + encodeURIComponent(admin.id),
                            "DELETE",
                            { confirmation },
                          ),
                      )
                    }
                  >
                    Revocar
                  </Button>
                </div>
                <PermissionEditor
                  admin={admin}
                  busy={busy}
                  save={(permissions) =>
                    request(
                      "/api/admins/" + encodeURIComponent(admin.id),
                      "PATCH",
                      { permissions },
                    )
                  }
                />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </ArkPage>
  );
}
