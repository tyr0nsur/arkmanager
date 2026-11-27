# ObeliskNative Panel — frontend

React 19, Vite 8 y Tailwind 4. La guía del panel, configuración y límites están
[en el README principal](../../../../README.md). El backend Express sirve la compilación
`dist` junto con la API autenticada.

```bash
npm ci --ignore-scripts
npm test
npm run lint
npm run build
```

`npm run dev` abre el servidor de desarrollo Vite; consulta `vite.config.js`
para el proxy local de API. No publiques el modo de desarrollo en Internet.
Los usuarios y secretos se configuran en el backend, fuera de Git.
