const path = require('node:path');
const { gzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');

const ROOT = path.resolve(__dirname, '../../..');
// Source distribution is restricted to these reviewed creator-facing files.
// Neither request parameters nor filesystem discovery can add a file.
const RESOURCES = [
    { id: 'sdk-guide', kind: 'guide', title: 'Primer plugin con el SDK', summary: 'Instalar el SDK, compilar un plugin nativo y comprobar su ciclo de vida.', files: { 'README.md': 'docs/SDK_QUICKSTART.md' } },
    { id: 'command-starter', kind: 'template', title: 'Comandos y respuestas', summary: 'Plugin C11 con comandos exactos, argumentos, respuestas dirigidas y descarga cooperativa.', commands: ['/sdkhello', '/sdkecho <texto>'], files: { 'README.md': 'examples/sdk_command_plugin/README.md', 'CMakeLists.txt': 'examples/sdk_command_plugin/CMakeLists.txt', 'command_plugin.c': 'examples/sdk_command_plugin/command_plugin.c' } },
    { id: 'minimal-starter', kind: 'template', title: 'Plugin mínimo', summary: 'Punto de partida para metadatos, configuración y logging.', files: { 'README.md': 'examples/sdk_minimal_plugin/README.md', 'CMakeLists.txt': 'examples/sdk_minimal_plugin/CMakeLists.txt', 'minimal_plugin.c': 'examples/sdk_minimal_plugin/minimal_plugin.c' } },
    { id: 'timer-starter', kind: 'template', title: 'Timers con propietario', summary: 'Registro y cancelación de timers de trabajo. Las acciones del juego necesitan el hilo del juego.', files: { 'README.md': 'examples/sdk_timer_plugin/README.md', 'CMakeLists.txt': 'examples/sdk_timer_plugin/CMakeLists.txt', 'timer_plugin.c': 'examples/sdk_timer_plugin/timer_plugin.c' } },
    { id: 'descriptor-starter', kind: 'template', title: 'Catálogo de descriptores', summary: 'Consultar metadatos de categorías y eventos de la API instalada.', files: { 'README.md': 'examples/sdk_descriptor_catalog/README.md', 'CMakeLists.txt': 'examples/sdk_descriptor_catalog/CMakeLists.txt', 'descriptor_catalog_plugin.c': 'examples/sdk_descriptor_catalog/descriptor_catalog_plugin.c' } },
];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Deterministic POSIX ustar, regular files only, with normalized ownership/time.
function archive(id, files) {
    const chunks = [];
    for (const file of files) {
        const name = `${id}/${file.name}`;
        if (!/^[a-zA-Z0-9_.\/-]+$/.test(name) || Buffer.byteLength(name) > 99 || name.includes('..')) throw new Error('Invalid resource archive entry');
        const header = Buffer.alloc(512);
        header.write(name, 0, 100, 'ascii');
        for (const [offset, width, value] of [[100, 8, 0o644], [108, 8, 0], [116, 8, 0], [124, 12, file.bytes.length], [136, 12, 0]]) {
            header.write(value.toString(8).padStart(width - 1, '0') + '\0', offset, width, 'ascii');
        }
        header.fill(32, 148, 156);
        header.write('0', 156);
        header.write('ustar\0', 257, 6);
        header.write('00', 263);
        const checksum = header.reduce((sum, byte) => sum + byte, 0);
        header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
        chunks.push(header, file.bytes, Buffer.alloc((512 - file.bytes.length % 512) % 512));
    }
    chunks.push(Buffer.alloc(1024));
    return gzipSync(Buffer.concat(chunks), { level: 9 });
}

function createResourceService(openTrustedFile, fail) {
    async function load(resource) {
        const files = [];
        for (const [name, relative] of Object.entries({ ...resource.files, LICENSE: 'examples/LICENSE' })) {
            const { handle } = await openTrustedFile(path.join(ROOT, relative), 256 * 1024);
            try {
                const bytes = await handle.readFile();
                if (bytes.length > 256 * 1024) fail(503, 'Un recurso supera el tamaño permitido', 'resource_too_large');
                files.push({ name, bytes });
            } finally { await handle.close(); }
        }
        return files;
    }
    async function catalog() {
        const items = [];
        for (const resource of RESOURCES) {
            const files = await load(resource);
            items.push({ id: resource.id, kind: resource.kind, title: resource.title, summary: resource.summary,
                commands: resource.commands || [], stage: 'experimental',
                files: files.map(file => ({ name: file.name, size: file.bytes.length, sha256: sha256(file.bytes) })),
                download_url: `/api/hub/resources/${resource.id}/download`,
            });
        }
        return { schema_version: 1, sdk_version: '0.1.0', platform: 'linux-x86_64', stage: 'experimental',
            gameplay_parity_accepted: false, items };
    }
    async function download(id) {
        const resource = RESOURCES.find(item => item.id === id);
        if (!resource) fail(404, 'Recurso no disponible', 'resource_not_found');
        const bytes = archive(resource.id, await load(resource));
        return { bytes, filename: `obelisknative-${resource.id}.tar.gz`, sha256: sha256(bytes) };
    }
    return { catalog, download };
}

module.exports = { createResourceService };
