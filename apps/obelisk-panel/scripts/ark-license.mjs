import {copyFile} from 'node:fs/promises';
await copyFile('LICENSE','dist/LICENSE.txAdmin');
await copyFile('UPSTREAM.md','dist/UPSTREAM.md');
