'use strict';
const {app, BrowserWindow, Menu, shell, session} = require('electron');
const {join} = require('node:path');
const {serverUrl} = require('./server-config.json');
let win;
let origin;
function validate(urlString) {
  const url = new URL(urlString);
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw Error('La dirección central debe ser una URL HTTPS sin rutas, parámetros ni claves.');
  }
  return url.origin;
}
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {if(win && !win.isDestroyed()) {if(win.isMinimized())win.restore();win.focus();}});
async function showError(cause) {
  if (win && !win.isDestroyed()) {
    await win.loadFile(join(__dirname,'error.html'),{query:{cause:String(cause||'Servidor no disponible')}});
  }
}
async function connect() {
  if (!win || win.isDestroyed()) return;
  try {await win.loadURL(origin);} catch (e) {await showError(e.message);}
}
app.whenReady().then(async ()=>{
  try {origin = validate(serverUrl);} catch (e) {
    origin = '';
  }
  win = new BrowserWindow({
    title:'Academia Pixel — El juego del saber', width:1100,height:820,
    minWidth:680,minHeight:600, backgroundColor:'#11051d',show:false,
    icon:join(__dirname,'icons','icon.ico'),
    webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,
      devTools:!app.isPackaged}
  });
  win.once('ready-to-show',()=>win?.show());
  await win.loadFile(join(__dirname,'loading.html'));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'Academia Pixel',submenu:[
      {label:'Reintentar conexión', click:()=>connect()},
      {label:'Abrir página del juego en navegador',enabled:!!origin,click:()=>shell.openExternal(origin)},
      {type:'separator'}, {role:'quit',label:'Salir'}
    ]}
  ]));
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,cb)=>cb(false));
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,destination)=>{
    try {if(new URL(destination).origin !== origin)event.preventDefault();}
    catch {event.preventDefault();}
  });
  if (!origin) {await showError('Falta configurar una dirección HTTPS al compilar la aplicación.');return;}
  // Avisar cuando falla el documento principal; las respuestas API/JS se manejan en el frontend.
  win.webContents.on('did-fail-load',(_event,code,description,_url,isMainFrame)=>{
    if(isMainFrame && code!==-3) showError(description);
  });
  await connect();
});
app.on('window-all-closed',()=>app.quit());
