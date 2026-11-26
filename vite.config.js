import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dataSourceProxy } from './server/devDataSourceProxy.js';
import { intimationProxy } from './server/devIntimationProxy.js';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig(({mode})=>{
 const env={
  ...loadEnv(mode,projectRoot,'VITE_'),
  ...loadEnv(mode,projectRoot,'DATA_SOURCE_'),
  ...loadEnv(mode,projectRoot,'NOTIFICATION_'),
  ...process.env
 };
 const mockMode = mode==='mock' || env.VITE_DATA_MODE==='mock';
 return {plugins:mockMode?[react(),dataSourceProxy(env),intimationProxy(env)]:[react()],server:{port:5173,strictPort:true,proxy:{'/api':{target:env.VITE_API_TARGET||'http://127.0.0.1:5080',changeOrigin:true}}}};
});
