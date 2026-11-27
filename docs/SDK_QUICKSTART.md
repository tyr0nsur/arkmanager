# Desarrollar plugins con ObeliskNative

El SDK experimental expone una ABI C para plugins Linux x86_64 de ARK: Survival
Evolved. El runtime fija su compatibilidad a un ejecutable concreto. Los plugins
se compilan como `.so`; los contratos de ArkApi se adaptan a esta API.

## Instalar y compilar

Compila el [runtime de Obelisk](https://github.com/tyr0nsur/Obelisk) e instala el componente CMake `SDK` en un prefijo local. También puedes usar el SDK de un paquete firmado que hayas verificado con una clave pública obtenida por un canal de confianza. Usa el prefijo del SDK en la compilación del ejemplo.

Descarga y extrae la plantilla «Comandos y respuestas» del Hub:

```bash
tar -xzf obelisknative-command-starter.tar.gz
cd command-starter
cmake -S . -B build -DCMAKE_PREFIX_PATH=/ruta/al/artifact/sdk
cmake --build build
nm -D --defined-only build/obelisk_sdk_command_plugin.so
```

La compilación sólo necesita los headers públicos y `Obelisk::obelisk_sdk`.
No enlaza la biblioteca del runtime. La plantilla requiere las capacidades de
comandos, respuestas y opciones de matching; rechaza Init si no están disponibles.

## Activar y probar

El operador instala el `.so` con el procedimiento de plugins. El runtime prepara
una configuración desactivada. En su `config.json`, activa el plugin para el ID
de una instancia concreta:

```json
{"enabled": true, "allow_all_instances": false, "instance_allowlist": ["theisland"]}
```

Prueba `/sdkhello` y `/sdkecho Hola`. `/sdkhello extra` no coincide con el comando
exacto. `/SDKECHO Hola` admite argumentos y mayúsculas porque su registro las
habilita expresamente. Comprueba el destinatario con dos jugadores, luego pausa,
reanuda, recarga y verifica que no queden callbacks duplicados.

El control de plugins del panel mantiene una lista autorizada de los seis módulos
propios. Esta plantilla se opera con las herramientas locales del runtime; su
descarga no la registra como producto instalable del Hub.

## Contratos que debe respetar el plugin

- Comprueba ABI, tamaño de cada slot, capacidades, punteros y propietario.
- Copia la parte anunciada de la tabla API; las vistas de texto sólo duran su callback.
- Responde dentro del callback del comando. El token de invocación caduca al retornar.
- Mantén los timers de trabajo separados de las operaciones del juego.
- Libera registros adquiridos durante un Init parcial y usa shutdown idempotente.
- Declara descarga cooperativa sólo si todo el código pendiente pertenece a callbacks gestionados.

La API también tiene observaciones de jugador, sesiones de chat y consultas del
origen del comando. Una observación de ID nativo no autentica una cuenta Steam o
Epic ni concede permisos. La enumeración de sesiones observadas no es un censo
autoritativo. Los homes actuales duran la sesión. Compras, kits y entregas de
inventario requieren identidad autorizada y recibos nativos verificados.

## Paridad de ArkApi

El Hub mantiene los 157 recursos de la referencia congelada del 14 de octubre
de 2026. Cada ficha debe cerrar sintaxis, límites, persistencia, salida visible,
dependencias de cliente, fallos/ciclo de vida y pruebas Steam/Epic. Las funciones
originales se implementan por contrato observable. Una plantilla compilada,
una firma válida o una prueba aislada no acepta todo el comportamiento de un recurso.
