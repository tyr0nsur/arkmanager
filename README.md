# Arkmanager

Arkmanager es un panel autohospedado para administrar clústeres de **ARK: Survival Evolved** en Linux. Incluye configuración por mapa, consola RCON, tareas programadas y monitorización. El Hub combina el catálogo de referencia ASE con recursos del SDK de [Obelisk](https://github.com/tyr0nsur/Obelisk).

## Probar en local

Requisitos: Node.js 24, npm y Python 3 para el cliente de control nativo opcional.

Desde la raíz del repositorio:

```sh
npm --prefix apps/flowark/client ci --ignore-scripts
npm --prefix apps/flowark/server ci --ignore-scripts
npm --prefix apps/flowark/client run build
cd apps/flowark/server
cp .env.example .env
```

Define un usuario y una contraseña propios en `.env` y ejecuta `node --env-file=.env server.js` desde ese directorio. Abre <http://127.0.0.1:3040>. El servidor crea su estado local al arrancar. Con un directorio de datos nuevo, puedes probar el acceso sin configurar un servidor de juego.

## Conectar un clúster

Copia [nodes.example.json](docs/nodes.example.json) como `nodes.json` dentro de `DASHBOARD_DATA_DIR` y sustituye los endpoints y rutas por los de tu instalación. Configura `ARK_ROOT` o define las rutas permitidas con `ARK_SCRIPT_ROOTS`, `ARK_CONFIG_ROOTS` y `ARK_LOG_ROOTS`. El backend exige al menos un mapa válido, bind local, un origen CORS HTTPS explícito y un secreto JWT propio cuando `NODE_ENV=production`.

El [port de txAdmin](apps/obelisk-panel/README.md) usa el mismo gateway y ofrece acceso mediante Discord con un proveedor OIDC configurado por el operador.

## Colaborar

Abre una issue para proponer un cambio o informar de un fallo. La [guía de contribución](CONTRIBUTING.md) incluye los comandos de validación y el flujo de pull requests. Consulta [SECURITY.md](SECURITY.md) para enviar avisos de seguridad.

Los ejemplos del SDK y el port de txAdmin incluyen sus propios avisos MIT.
