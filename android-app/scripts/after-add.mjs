import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
const manifest=resolve('android','app','src','main','AndroidManifest.xml');
if (!existsSync(manifest)) throw Error('Generá primero el proyecto nativo con: npx cap add android');
let source=readFileSync(manifest,'utf8');
// El WebView carga recursos internos vía localhost; los servicios remotos van por HTTPS.
source=source.replace(/ android:usesCleartextTraffic="true"/g,'');
writeFileSync(manifest,source);
console.log('Android configurado sin tráfico HTTP externo no cifrado.');
