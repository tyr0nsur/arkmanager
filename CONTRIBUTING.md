# Contribuir a Arkmanager

Abre una issue para describir el problema o la propuesta. Usa las etiquetas `good first issue` para tareas acotadas y `help wanted` para buscar colaboradores. Trabaja en una rama desde `main` y abre una pull request con el cambio y las pruebas realizadas.

Desde la raíz del repositorio, instala las dependencias según el [README](README.md) y ejecuta:

```sh
npm --prefix apps/flowark/client run lint
npm --prefix apps/flowark/client test
npm --prefix apps/flowark/client run build
npm --prefix apps/flowark/server test
npm --prefix apps/obelisk-panel ci --ignore-scripts
npm --prefix apps/obelisk-panel run build
npm --prefix apps/obelisk-panel test
git diff --check
```

Usa mapas, cuentas y credenciales sintéticos en los ejemplos. Para cambios en autenticación, RCON o configuración, describe las pruebas que cubren los permisos y los errores. Consulta [SECURITY.md](SECURITY.md) para informar de una vulnerabilidad.
