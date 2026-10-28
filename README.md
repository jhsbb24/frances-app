# Mi francés

App web personal para estudiar francés con los libros **Édito B1 y B2** y practicar conversación con **ChatGPT Voice**.
Funciona en Safari del iPhone, el iPad y el Mac, y se puede agregar a la pantalla de inicio como si fuera una app.

- La app (este repositorio, **público**) son solo archivos HTML, CSS y JavaScript. No hay servidor ni paso de compilación.
- **Tus datos NO están aquí.** Se guardan en tu repositorio **privado** `jhsbb24/frances-datos`, en el archivo `data.json`.
- Cada guardado es un *commit* en ese repositorio, así que el historial de GitHub es tu copia de seguridad.
- La app no incluye contenido de los libros Édito, ni IA integrada, ni grabaciones, ni notificaciones.

---

## Índice

1. [Crear el repositorio privado de datos](#1-crear-el-repositorio-privado-de-datos)
2. [Activar GitHub Pages](#2-activar-github-pages)
3. [Crear el token fine-grained paso a paso](#3-crear-el-token-fine-grained-paso-a-paso)
4. [Poner el token en la app](#4-poner-el-token-en-la-app)
5. [Agregar la app a la pantalla de inicio](#5-agregar-la-app-a-la-pantalla-de-inicio)
6. [Cómo se usa cada pantalla](#6-cómo-se-usa-cada-pantalla)
7. [Cómo funciona el guardado](#7-cómo-funciona-el-guardado)
8. [Seguridad](#8-seguridad)
9. [Si algo sale mal](#9-si-algo-sale-mal)
10. [Para curiosos: archivos y pruebas](#10-para-curiosos-archivos-y-pruebas)

---

## 1. Crear el repositorio privado de datos

Si ya existe `jhsbb24/frances-datos`, salta este paso.

1. Entra en <https://github.com/new>.
2. **Repository name:** `frances-datos`.
3. Marca **Private** (¡importante!).
4. Marca **Add a README file** (así el repositorio no queda vacío).
5. Pulsa **Create repository**.

No hace falta crear `data.json`: **la app lo crea sola** la primera vez que se conecta.

## 2. Activar GitHub Pages

GitHub Pages publica esta app en una dirección web. Los archivos tienen que estar en la rama **`main`** de este repositorio (`frances-app`).

1. Abre <https://github.com/jhsbb24/frances-app>.
2. Arriba, entra en **Settings** (Configuración).
3. En el menú de la izquierda, entra en **Pages**.
4. En **Build and deployment → Source**, elige **Deploy from a branch**.
5. En **Branch**, elige **`main`** y la carpeta **`/ (root)`**. Pulsa **Save**.
6. Espera uno o dos minutos y recarga la página de Settings → Pages. Aparecerá: *«Your site is live at…»*.

Tu app estará en:

**<https://jhsbb24.github.io/frances-app/>**

> Cada vez que cambie algo en la rama `main`, GitHub Pages publica la versión nueva sola (tarda 1 o 2 minutos).

## 3. Crear el token fine-grained paso a paso

El token es como una llave que permite a la app leer y escribir **solo** en `frances-datos`. Lo creas una vez y lo pegas en cada dispositivo.

1. En GitHub, toca tu **foto de perfil** (arriba a la derecha) → **Settings**.
2. En el menú de la izquierda, baja hasta el final → **Developer settings**.
3. **Personal access tokens** → **Fine-grained tokens**.
4. Pulsa **Generate new token**. (GitHub puede pedirte tu contraseña o un código.)
5. Rellena así:
   - **Token name:** `Mi francés`
   - **Expiration:** elige una fecha, por ejemplo **1 año** (*Custom* → una fecha dentro de un año). Apúntala en tu calendario: ese día tendrás que crear uno nuevo.
   - **Resource owner:** `jhsbb24`
   - **Repository access:** **Only select repositories** → elige **`jhsbb24/frances-datos`** (solo ese).
   - **Permissions → Repository permissions → Contents:** cambia *No access* por **Read and write**.
     (GitHub añade sola la línea *Metadata: Read-only*. Es normal y obligatoria.)
   - No toques nada más.
6. Pulsa **Generate token** (y confirma).
7. **Copia el token** (empieza por `github_pat_…`). GitHub solo lo enseña **una vez**. Si lo pierdes, no pasa nada: borras ese y creas otro.

> Consejo: no lo guardes en notas ni lo envíes por correo o mensajes. Pégalo directamente en la app (paso 4).

## 4. Poner el token en la app

Hazlo en **cada dispositivo** (iPhone, iPad y Mac), porque el token se guarda solo en el navegador de ese dispositivo.

> **Importante en iPhone e iPad:** la app que agregas a la pantalla de inicio guarda sus datos aparte de Safari.
> Por eso, **primero agrégala a la pantalla de inicio (paso 5)** y pega el token **dentro** de la app abierta desde el icono.

1. Abre la app.
2. Ve a **Ajustes**. (En el iPhone en vertical: **Más → Ajustes**.)
3. Comprueba que **Repositorio privado de datos** dice `jhsbb24/frances-datos`.
4. Pega el token en **Token de GitHub (fine-grained)** y pulsa **Guardar token**.
5. Pulsa **Probar conexión**. Debe decir **«✓ Conectado a jhsbb24/frances-datos.»**
6. Arriba, el indicador pasará a **«Guardado en GitHub · hora»**.

Desde ese momento la app enseña el token así: `github_pat_…AB12` (nunca completo).
Para cambiarlo: **Ajustes → Cambiar token**. Para quitarlo de un dispositivo: **Quitar de este dispositivo**.

## 5. Agregar la app a la pantalla de inicio

### iPhone y iPad (Safari)

1. Abre **Safari** y entra en <https://jhsbb24.github.io/frances-app/>.
2. Toca el botón **Compartir** (el cuadrado con una flecha hacia arriba).
3. Baja y toca **Agregar a inicio** (o *Añadir a pantalla de inicio*).
4. Deja el nombre **Mi francés** y toca **Agregar**.
5. Abre la app desde el nuevo icono y haz el **paso 4** (pegar el token).

### Mac (Safari)

1. Abre la dirección en **Safari**.
2. Menú **Archivo → Añadir al Dock…** → **Añadir**.
3. Abre la app desde el Dock y haz el **paso 4**.

(También puedes usarla en una pestaña normal de Safari; entonces pega el token en esa pestaña.)

## 6. Cómo se usa cada pantalla

En el iPhone en vertical, la barra de abajo tiene **Hoy, Sesión, Conversar, Repaso y Más** (Biblioteca, Objetivos, Progreso y Ajustes están en *Más*). En el iPad, en el Mac y en el iPhone en horizontal aparecen todas en el menú de la izquierda.

| Pantalla | Para qué sirve |
| --- | --- |
| **Hoy** | Continuar la sesión abierta, empezar una nueva, ver tu «siguiente paso», la conversación que espera su REGISTRO y los repasos de hoy. |
| **Sesión** | Eliges **15, 30 o 40 minutos** y un **objetivo**; anotas la **referencia de Édito** (libro, unidad, página, nota). Escribes **borrador, primer intento y segundo intento**. Puedes crear **tarjetas** con expresiones o errores. Al final, un **cierre** de 3 campos: logro, dificultad y siguiente paso. **Pausar y salir** guarda todo aunque no hayas terminado. |
| **Conversación** | Arma la **consigna para ChatGPT** con una plantilla (objetivo, rol, dificultad, referencia, dos expresiones y errores a repasar). Puedes editarla antes de **Copiar consigna** y **Abrir ChatGPT**. Al volver, pega el **REGISTRO**: se guarda tal cual. La app te **propone** cambiar el estado del objetivo o crear tarjetas, pero **no cambia nada hasta que confirmas**. |
| **Biblioteca** | Tus referencias de Édito B1 y B2: edición, unidad, página, enlace de audio y notas. Con buscador. |
| **Objetivos** | Cada objetivo tiene una **habilidad** (lectura, escucha, escritura, interacción oral) y un **estado**: Pendiente de observar → En práctica → Logrado con apoyo → Logrado de forma autónoma → Transferido. Cambiar de estado **pide un motivo** y queda en el historial. |
| **Repaso** | Tarjetas con intervalos de **1, 3, 7 y 14 días**. *Sin ayuda* pasa al siguiente intervalo; *Con ayuda* no avanza y vuelve a salir hoy (si otra vez necesitas ayuda, vuelve mañana); *No lo logré* vuelve mañana desde el principio. Si vuelves después de una pausa, **Reprogramar** reparte las atrasadas en varios días (máximo por día que tú eliges) en vez de acumularlas. |
| **Progreso** | Objetivos por habilidad y estado, y tus últimas evidencias, con filtro por habilidad. No convierte minutos ni rachas en niveles MCER. |
| **Ajustes** | Token, nombre del dispositivo, plantilla de la consigna, **Exportar JSON** e **Importar JSON** (con resumen antes de aplicar) y copias de seguridad. |

**Los días de repaso** se cuentan siempre con la hora de **Vancouver** (`America/Vancouver`), aunque viajes o el dispositivo tenga otra zona horaria. Para cambiarla, edita `TIME_ZONE` en `js/config.js`.

### La plantilla del REGISTRO

La consigna pide a ChatGPT que, al terminar, escriba el registro con este formato (la app lo reconoce aunque lleve negritas o viñetas):

```
REGISTRO
Fecha y sesión:
Material y objetivo:
Habilidad:
Evidencia:
Apoyos durante el intento:
Logro:
Prioridad:
Segundo intento:
Estado sugerido:
Expresiones para recuperar:   (una por línea: expresión en francés = significado)
Siguiente práctica:
```

Puedes cambiar la plantilla en **Ajustes → Plantilla de la consigna** (y volver a la original con un botón).

## 7. Cómo funciona el guardado

El **indicador de arriba** siempre dice en qué estado están tus datos:

| Indicador | Qué significa |
| --- | --- |
| **Guardado en GitHub · 10:32** | Todo está en GitHub. La hora es la última vez que se comprobó. |
| **Guardando…** | Hay cambios que se suben en unos segundos. |
| **Pendiente (sin conexión)** | No hay internet. Tus cambios están guardados **en este dispositivo** y se suben **una sola vez** cuando vuelve la conexión. |
| **Pendiente (falta el token)** | Todavía no pusiste el token en este dispositivo. |
| **Conflicto** | Se guardó algo desde otro dispositivo mientras tenías cambios sin subir. Tócalo para decidir. |
| **Error** | Algo falló (por ejemplo, el token caducó). Tócalo para ver qué pasa. |

- La app **descarga** `data.json` al abrirse y cada vez que vuelves a ella.
- **Guarda sola** unos 3 segundos después de que dejas de escribir, y también al cambiar de pantalla.
- Cada guardado es un commit con un mensaje claro, por ejemplo:
  `Sesión del 28 oct: primer intento; Repaso: nueva tarjeta «réserver une table» (iPhone)`.
  El nombre del dispositivo se puede cambiar en Ajustes.

### Si aparece «Esto cambió en otro dispositivo»

La app usa el **sha** (la «huella») de `data.json`. Si GitHub dice que el archivo cambió desde otro dispositivo, **la app no sobrescribe nada** y te pregunta:

- **Usar la versión de la nube:** te quedas con lo que hay en GitHub. Antes, la app guarda una copia de lo tuyo en *Ajustes → Copias de seguridad en este dispositivo*.
- **Mantener la mía:** sube tu versión. La de la nube no se pierde: queda en el historial de GitHub.
- **Ver ambas:** compara las dos versiones elemento por elemento y eliges qué conservar. Si cada dispositivo cambió una parte distinta (por ejemplo, el borrador en uno y el segundo intento en otro), te propone **juntar los dos cambios**.

Si cierras la ventana, el indicador sigue en **Conflicto** y no se sube nada hasta que decidas.

### Exportar e importar

- **Exportar JSON** descarga un archivo con todos tus datos (en el iPhone va a la app *Archivos*).
- **Importar JSON** te enseña antes un **resumen** (cuántas sesiones, tarjetas, etc. hay ahora y en el archivo). Solo al pulsar **Reemplazar mis datos** se aplica; antes se guarda una copia de lo actual.

## 8. Seguridad

- El token se guarda **solo en el navegador de cada dispositivo** y **solo se envía a `api.github.com`**. La página tiene una regla de seguridad (*Content-Security-Policy*) que impide que la app se conecte a cualquier otro sitio.
- La app nunca muestra el token completo.
- Todo texto que pegas (por ejemplo, el REGISTRO) se trata como **texto plano**, nunca como HTML.
- El token solo puede tocar `frances-datos`, y solo su contenido.
- **Si pierdes un dispositivo:** entra en GitHub → Settings → Developer settings → Fine-grained tokens, abre el token y pulsa **Delete**. Luego crea otro y pégalo en tus otros dispositivos.

## 9. Si algo sale mal

**El indicador dice «Error» y habla del token.** El token caducó o se borró. Crea uno nuevo (paso 3) y pégalo en Ajustes → Cambiar token.

**«No encuentro el repositorio, o el token no tiene acceso a él».** Revisa que el token tenga acceso a `frances-datos` (*Only select repositories*) y que el nombre en Ajustes sea `jhsbb24/frances-datos`.

**«El token no tiene permiso para escribir».** En el token, *Contents* debe ser **Read and write**. Puedes editar el token en GitHub sin crear otro.

**Quiero recuperar una versión anterior.**
1. En Ajustes, toca **Ver el historial de guardados en GitHub** (o abre `https://github.com/jhsbb24/frances-datos/commits/main/data.json`).
2. Abre el commit que quieras → menú **⋯** del archivo → **View file** → botón **Raw** → guarda la página como `data.json` (en el Mac: Archivo → Guardar como).
3. En la app: **Ajustes → Importar JSON** → elige ese archivo → revisa el resumen → **Reemplazar mis datos**.

**Safari borró los datos de la app.** Si usas la app desde una pestaña de Safari y pasan muchos días sin abrirla, Safari puede borrar lo guardado en el navegador (también el token). Tus datos siguen en GitHub: solo vuelve a pegar el token. Desde la pantalla de inicio esto no pasa.

**La app no se actualiza después de un cambio.** Cierra la app del todo y vuelve a abrirla. (Con conexión, siempre carga la versión más nueva; sin conexión, usa la última copia guardada.)

## 10. Para curiosos: archivos y pruebas

```
index.html            la página (estructura y reglas de seguridad)
styles.css            colores, tamaños y diseño para iPhone, iPad y Mac
manifest.webmanifest  nombre e iconos para la pantalla de inicio
sw.js                 copia de la app para abrirla sin internet
icons/                iconos
js/app.js             arranque, navegación e indicador de guardado
js/config.js          valores fijos (repositorio, zona horaria, intervalos…)
js/sync.js            guardado automático, sha, conflictos y modo sin conexión
js/github.js          conversación con la API de GitHub (Contents API)
js/model.js           estructura de tus datos
js/review.js          cálculo de los repasos
js/registro.js        plantilla de la consigna y lectura del REGISTRO
js/diff.js            comparación de versiones («Ver ambas»)
js/dates.js           fechas en la zona horaria de Vancouver
js/dom.js             piezas de interfaz (sin innerHTML)
js/components.js      piezas que comparten varias pantallas
js/views/             una pantalla por archivo
tests/                pruebas automáticas (no las usa la app)
```

### Pruebas automáticas (opcional)

Las pruebas usan un **GitHub falso** (`tests/fake-github.js`) que imita la API en memoria, así que no tocan tus datos reales. Comprueban, entre otras cosas:

- guardar y cargar desde otro dispositivo, con commits claros;
- que un sha distinto muestra el conflicto **sin perder texto** y sin sobrescribir GitHub;
- que sin conexión queda **«Pendiente»** y al reconectar se sube **una sola vez**, sin duplicados;
- que los repasos se programan con el día de **Vancouver** (incluso con el dispositivo en otra zona y en los cambios de hora);
- que el REGISTRO pegado se guarda como texto y no cambia nada sin confirmar;
- que el token nunca se muestra completo y solo se habla con `api.github.com`;
- que las pantallas caben sin desbordes en iPhone (vertical y horizontal), iPad (vertical y horizontal) y Mac.

Para ejecutarlas en tu Mac necesitas [Node.js](https://nodejs.org) 20 o más nuevo:

```bash
npm install
```

```bash
npx playwright install chromium
```

```bash
npm test
```

Para probar la app en tu Mac sin publicarla: `npm run serve` y abre <http://localhost:8080>.
