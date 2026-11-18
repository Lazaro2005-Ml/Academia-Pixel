# ACADEMIA PIXEL — Versión 8.2 · Servidor central + EXE + APK

**Objetivo:** distribuir **dos archivos instalables** a los estudiantes: `AcademiaPixel-Setup.exe` para Windows y `AcademiaPixel.apk` para Android. Ambos usan un solo servidor HTTPS, con **usuarios, puntajes, materiales, IA y duelos compartidos**. Los archivos instalables se generan una vez; quien los recibe **no instala Python, Node.js, Android Studio ni configura la URL**.

> **Estado del paquete:** se entrega el **código fuente preparado para compilar**, más scripts, Docker y pasos. No contiene un `.exe` o `.apk` final ya compilado ni firmado: hay que proporcionar la URL real y ejecutar la compilación en Windows y Android Studio. La prueba automática del servidor verifica las funciones API y WebSocket, pero no sustituye probar las apps en dispositivos reales.

## 1. Qué va dentro de cada componente

```text
          Windows                     Android
   AcademiaPixel-Setup.exe        AcademiaPixel.apk
          Electron                    Capacitor
                \                      /
                 \     HTTPS / WSS    /
                  \                  /
                 https://juego.tudominio.com
                       Caddy (TLS)
                            |
                    FastAPI (Python)
                            |
               SQLite compartido + archivos
```

- El EXE es **cliente remoto**: ejecuta Electron en una ventana propia y muestra `https://juego.tudominio.com`. **No incluye** servidor Python ni base de datos local; necesita Internet.
- El APK instala el **frontend pixel art dentro de la aplicación** y consume la API del servidor central por HTTPS con token. El dominio queda fijado en el momento de compilar.
- Caddy ofrece **HTTPS y WebSockets (WSS)**. FastAPI ejecuta las reglas del juego, subida de PDF/Word/TXT, el inicio de sesión y el multijugador. **SQLite solo está en el servidor** y persiste en un volumen Docker.
- El modo IA externa solo funciona si configurás `AI_API_KEY` en el servidor. Sin clave se utiliza un generador básico de preguntas, no IA real.
- Las salas online son temporales y viven en memoria del proceso: **no ejecutar varias réplicas del backend** ni prometer que las salas sobreviven a reinicios. Para una facultad/TFI con pocos jugadores puede bastar una instancia; para alta concurrencia, migrar a PostgreSQL/Redis y salas compartidas.

## 2. PRIMERO: publicar el servidor central

**Necesitás** un VPS Linux con Docker + Docker Compose, IP pública, dominio DNS (por ejemplo `juego.tudominio.com`), y puertos TCP 80 y 443 abiertos. El dominio debe resolver a la IP del VPS. El servidor debe quedar prendido para jugar.

En la carpeta del proyecto, copiá el `.env` de ejemplo:

```bash
cd Academia_Pixel_v8/deployment
cp .env.example .env
nano .env
```

Editá al menos `ACADEMIA_DOMAIN` con tu dominio (sin `https://`, sin rutas):

```dotenv
ACADEMIA_DOMAIN=juego.tudominio.com
AI_PROVIDER=anthropic
AI_API_KEY=
AI_MODEL=claude-sonnet-5
```

Para IA real, colocá una clave válida y el modelo correspondiente. No compartas `.env`, no lo subas a GitHub, no pongas claves en Electron o Android.

Iniciá el servidor en el VPS:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f --tail=80
```

Probá en un navegador **real**, desde otra red, estas dos URL:

```text
https://juego.tudominio.com/
https://juego.tudominio.com/api/health
```

La segunda debe responder algo parecido a `{"ok":true,"name":"Academia Pixel","version":"8.1"}`. Eso es **el número de versión del backend original**, no el de los nuevos clientes. Caddy obtendrá y renovará TLS automáticamente cuando el dominio y los puertos estén bien configurados. Para administrar docente, primero registrá el usuario en la aplicación y luego ejecutá:

```bash
docker compose exec api python crear_docente.py NombreDeUsuario
```

**Datos importantes:** guardados en volumen Docker `academia_data` (SQLite, secret.key). **Hacé copias de seguridad** del volumen; para una copia consistente, detené temporalmente el servicio API y copiá tanto SQLite como `secret.key`. Un cambio o pérdida de `secret.key` invalidará las sesiones existentes. **Nunca** recrees el volumen con `docker compose down -v` si querés conservar usuarios y resultados. Si necesitás ampliar usuarios concurrentes o disponibilidad, deberás mejorar la arquitectura de datos y salas.

## 3. Generar un único instalador de Windows (.exe)

Usá **Windows 10/11 x64**, Node.js 22 o superior y PowerShell. Necesitarás Internet en la computadora que compila; el usuario final no necesita Node. El script **comprueba que el servidor esté online** antes de compilar.

Abrí PowerShell en la carpeta raíz `Academia_Pixel_v8`, y ejecutá:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\compilar_windows_central.ps1 -ServerUrl "https://juego.tudominio.com"
```

También podés hacer doble clic en `COMPILAR_WINDOWS.bat` y escribir la URL cuando la solicite.

Resultado esperado:

```text
Academia_Pixel_v8\dist-windows\AcademiaPixel-Setup.exe
```

- Ese **único EXE es el instalador**, no un EXE portable. Luego aparece el acceso directo en el escritorio.
- Ya incluye la URL y usa el servidor central; al abrirse requiere Internet.
- Para distribuir profesionalmente y evitar advertencias de Windows SmartScreen, conviene **firmar el EXE con un certificado de firma de código**. Sin firma puede mostrar advertencias, aunque la compilación funcione.

## 4. Generar un único APK firmado de Android

Usá **Windows**, Node.js 22 o superior y **Android Studio con SDK/JDK configurados**. Ejecutá desde la raíz:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\compilar_android_central.ps1 -ServerUrl "https://juego.tudominio.com"
```

O hacé doble clic en `COMPILAR_ANDROID.bat` y escribí la URL. El script:

1. Instala las dependencias de Capacitor.
2. Copia **HTML, CSS, JavaScript, imágenes, audio** a la app, con `serverOrigin` definido y bloqueado en HTTPS.
3. Genera el proyecto Android nativo la primera vez (`npx cap add android`) y lo sincroniza (`npx cap sync android`).
4. Abre Android Studio.

Dentro de Android Studio, esperá a que Gradle termine de sincronizar. Seleccioná **Build → Generate Signed Bundle / APK → APK → Next**. Creá o seleccioná un archivo de firma `.jks` (fuera del proyecto), elegí **release**, completá contraseñas y generá el APK. **Guardá la clave `.jks` y sus contraseñas** en lugar seguro: la necesitás para actualizar la aplicación sin desinstalarla. Nunca las subas al repositorio.

El archivo generado suele estar en una de estas rutas, según la versión de Android Studio:

```text
android-app\android\app\release\app-release.apk
android-app\android\app\build\outputs\apk\release\app-release.apk
```

Copialo y renombralo **`AcademiaPixel.apk`**. Es el único archivo que compartirás con los estudiantes. Para instalarlo manualmente, Android puede pedir habilitar la instalación desde la app que abre el archivo. No requiere Android Studio en el dispositivo final.

**Solo para pruebas:** `Build APK(s)` o `assembleDebug` generan un APK de depuración, **no** un release firmado con tu clave. Si una prueba requiere firma de producción, usá el asistente anterior.

## 5. Qué reciben los estudiantes

| Windows | Android |
|---|---|
| `AcademiaPixel-Setup.exe` | `AcademiaPixel.apk` |
| Doble clic e instalar | Abrir APK y autorizar instalación |
| Acceso directo del juego | Ícono en el celular |
| Sin Node/Python/SQLite local | Sin Python/Android Studio local |
| Cuenta y puntajes en servidor HTTPS | Misma cuenta y puntajes en servidor HTTPS |

**No hay que entregar** el código fuente, archivos `.env`, ni base de datos con información de usuarios a los estudiantes. La base de datos vive **únicamente en el VPS**.

## 6. Pruebas antes de distribuir

1. Iniciar sesión en Windows y luego en Android con la misma cuenta.
2. Comprobar que el ranking y el historial se ven desde ambos equipos.
3. Crear una sala 1 contra 1 en Windows; entrar con el código desde otro usuario en Android.
4. Responder las mismas preguntas y confirmar que ambos ven el resultado.
5. Subir un PDF y un DOCX con texto seleccionable, generar preguntas y validar que se guardan.
6. Apagar Internet: ambos clientes deben **avisar que no pueden conectarse** (no funcionar offline).
7. Revisar que el servidor HTTPS no tenga advertencias de certificado y que `wss://` conecte.
8. Instalar el EXE en otro Windows limpio y el APK en un Android físico antes de entregar.

**Limitaciones actuales:** servicio de IA externo dependiente de API y cuota; SQLite + una réplica son aptos para prototipo, no escalado horizontal; la sala WebSocket no persiste si el servidor se reinicia; PDF escaneado como imagen puede no tener texto extraíble. Para un sitio público masivo, agregá limitación de intentos de login, monitoreo, respaldos automatizados y controles adicionales de seguridad.

## 7. Errores frecuentes

- **“El servidor no responde”**: verificá DNS, VPS encendido, puertos 80/443, TLS válido y `https://.../api/health`.
- **Android funciona pero no entra al duelo**: revisá que Caddy permita el WebSocket y que el servidor conserve una sola instancia/worker.
- **El APK pide firma**: para distribuir elegí `Generate Signed Bundle / APK`, no `Build APK(s)`.
- **Al compilar Android aparece error Gradle/SDK**: dejá que Android Studio descargue los componentes recomendados y sincronizá de nuevo.
- **El instalador Windows abre página vacía**: revisá la URL insertada al compilar y la disponibilidad de Internet; usá el menú de la app para reintentar.
- **Cambié el dominio**: tendrás que **recompilar ambos clientes** con la nueva URL. No ingreses claves ni dominios en el código del juego.

## 8. Archivos relevantes del proyecto

- `deployment/` — servidor HTTPS con Docker Compose + Caddy.
- `app.py` — FastAPI, SQLite, preguntas, autenticación y duelos WebSocket.
- `web/` — frontend original completo y diseño pixel art.
- `desktop/main.cjs`, `desktop/package.json` — Electron para Windows sin servidor local.
- `android-app/scripts/prepare-web.mjs` — incorpora la URL HTTPS al APK durante la compilación.
- `scripts/compilar_windows_central.ps1` — generador del instalador EXE.
- `scripts/compilar_android_central.ps1` — generador del proyecto APK listo para firmar.
- `tests/` — prueba del backend y prueba estática del empaquetado.

**Aviso:** las URLs `juego.tudominio.com` y `academia-pixel.example.com` son ejemplos, **no son servidores publicados**. Necesitás un dominio real, HTTPS y un VPS. El `.exe` y `.apk` finales no se pueden generar válidamente para ese servidor sin conocer su URL real.
