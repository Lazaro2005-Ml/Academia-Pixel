import {cpSync, existsSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..', import.meta.url)));
const source=resolve(root,'..','web');
const target=join(root,'www');
if(!existsSync(join(source,'index.html'))) throw Error('Falta web/index.html');
const raw=process.env.ACADEMIA_SERVER_URL || '';
const url=new URL(raw);
if(url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
   url.pathname !== '/' || url.search || url.hash) {
  throw Error('Definí ACADEMIA_SERVER_URL con una URL HTTPS, sin rutas, parámetros ni claves.');
}
rmSync(target,{recursive:true,force:true});
cpSync(source,target,{recursive:true});
mkdirSync(join(target,'js'),{recursive:true});
writeFileSync(join(target,'js','runtime-config.js'),
  'window.ACADEMIA_RUNTIME = ' + JSON.stringify({native:true,serverLocked:true,serverOrigin:url.origin}) + ';\n');
console.log('Recursos del juego copiados; Android conectado a',url.origin);
