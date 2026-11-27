import path from 'node:path';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {licenseBanner} from '../scripts/build/utils';
export default defineConfig({plugins:[react()],resolve:{alias:{'@':path.resolve(__dirname,'src'),'@shared':path.resolve(__dirname,'../shared')}},
 build:{outDir:'../dist/panel',emptyOutDir:true,sourcemap:false,manifest:true,rollupOptions:{output:{banner:licenseBanner('..',true),entryFileNames:'assets/[name]-[hash].js',chunkFileNames:'assets/[name]-[hash].js',assetFileNames:'assets/[name]-[hash][extname]'}}},
 server:{host:'127.0.0.1',port:40122}});
