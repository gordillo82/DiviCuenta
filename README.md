# 🍽 DiviCuenta

**DiviCuenta** es una aplicación web mobile-first para dividir la cuenta del restaurante de forma justa entre un grupo de amigos, diferenciando lo que ha consumido cada uno en bebidas del reparto equitativo de la comida.

Desde la versión 2 incluye **sincronización en tiempo real**: varios amigos pueden conectarse a la misma sesión desde sus móviles y ver los cambios al instante.

## ¿Para qué sirve?

Cuando sales a comer con amigos y unos han bebido agua y otros vino caro, no es justo pagar a partes iguales. DiviCuenta permite:

- Crear una sesión compartida con un **código corto** (ej. `AB3X7K`).
- Conectar varios móviles a la misma sesión en **tiempo real**.
- Registrar a cada comensal con sus bebidas y cantidades.
- Anotar los platos de comida común que se reparten entre todos.
- Calcular automáticamente lo que debe pagar cada persona.
- Validar que el total calculado coincide con el ticket real.

---

## Configuración (primera vez)

DiviCuenta usa **Supabase** como backend (base de datos Postgres + sincronización en tiempo real).

### 1. Crear un proyecto en Supabase

1. Ve a [https://app.supabase.com](https://app.supabase.com) y crea una cuenta gratuita.
2. Crea un nuevo proyecto (elige la región más cercana).
3. Espera a que el proyecto esté listo (~1 minuto).

### 2. Ejecutar el schema de base de datos

1. En el panel de Supabase, ve a **SQL Editor → New query**.
2. Copia y pega el contenido de [`supabase/schema.sql`](supabase/schema.sql).
3. Pulsa **Run** (▶). Esto crea las tablas y las políticas de seguridad.

> **Si ya tenías el schema anterior aplicado**, el archivo incluye al final bloques de migración que puedes ejecutar de forma independiente:
> - `MIGRACIÓN: IVA por sesión`: añade la columna `tax_total` a la tabla `bills`.
> - `MIGRACIÓN: Bebidas compartidas`: hace el campo `diner_id` opcional y crea la tabla `drink_participants`.

### 3. Obtener las credenciales

1. En Supabase, ve a **Settings → API**.
2. Copia:
   - **Project URL** → `https://xxxxxxxxxxx.supabase.co`
   - **anon public key** → clave larga que empieza por `eyJ…`

### 4. Configurar el archivo `config.js`

```bash
cp config.example.js config.js
```

Edita `config.js` y rellena tus valores:

```js
window.APP_CONFIG = {
  SUPABASE_URL:      'https://xxxxxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJ…tu-anon-key…',
};
```

> **Importante:** `SUPABASE_URL` debe ser la URL base del proyecto Supabase, **sin** `/rest/v1` ni barra final.
> - ✅ Correcto: `https://abcdefghij.supabase.co`
> - ❌ Incorrecto: `https://abcdefghij.supabase.co/rest/v1/`

> **GitHub Pages:** la `anon key` de Supabase es una clave pública diseñada para usarse en el navegador. Si publicas la app en GitHub Pages, debes incluir `config.js` en el repositorio para que esté disponible online.

### 5. Ejecutar la aplicación

Dado que la app usa un CDN para cargar Supabase, necesita ejecutarse sobre HTTP (no directamente como fichero local `file://`). Opciones:

**Opción A – Extensión VS Code "Live Server"**
Abre el proyecto en VS Code y pulsa *Go Live* en la barra de estado.

**Opción B – Python (cualquier sistema)**
```bash
python3 -m http.server 8080
# Abre http://localhost:8080 en el navegador
```

**Opción C – Node.js**
```bash
npx serve .
# Abre la URL que muestra en pantalla
```

**Opción D – GitHub Pages / Netlify / Vercel**
Sube el repositorio incluyendo `config.js` (con tus claves Supabase) y activa GitHub Pages desde _Settings → Pages_.

---

## Cómo usar la app

### Pantalla inicial (lobby)

Al abrir la app verás dos opciones:

| Acción | Cuándo |
|---|---|
| **Crear nueva sesión** | La primera persona en llegar al restaurante crea la sesión. Se genera un código de 6 caracteres (ej. `AB3X7K`). |
| **Unirse a sesión** | Los demás compañeros introducen el código y su nombre. |

El código de sesión aparece en la cabecera. Pulsa 📋 para copiarlo y compartirlo por WhatsApp o mensaje.

### Dentro de la sesión

1. **Añade comensales**: escribe el nombre de cada persona y pulsa _+ Añadir_.
2. **(Opcional) Importa una foto del ticket**: en _Importar ticket (OCR)_ selecciona una imagen, pulsa _Procesar imagen_ y revisa la tabla editable (producto, precio y categoría bebida/comida).
3. **Añade al reparto lo detectado**: pulsa _Añadir al reparto_ para convertir los ítems revisados en bebidas/comida dentro del flujo actual.
4. **Registra/ajusta las bebidas**: en la sección _Bebidas_, indica la bebida, precio, cantidad y selecciona quién la tomó (uno o varios comensales). Si la comparten, el coste se divide a partes iguales entre los seleccionados.
5. **Elige los participantes de cada bebida**: en la lista de bebidas se muestra quién participa en cada una.
6. **Añade/ajusta la comida común**: en la sección _Comida común_, introduce cada plato con su precio. Debajo de cada plato aparecen los comensales con casillas de selección para indicar quién come ese plato. Puedes usar los atajos _Todos_ / _Ninguno_ por ítem.
7. **Introduce el total del ticket**: escribe el importe total que aparece en la cuenta.
8. **IVA (opcional)**: si el ticket desglosa el IVA al final, introdúcelo en el campo _IVA total (€)_. Se repartirá proporcionalmente según el consumo de cada persona.
9. **Consulta el resumen**: muestra lo que debe pagar cada persona (subtotal, IVA asignado y total final) y si el cálculo cuadra con el ticket.

> Todos los cambios se sincronizan automáticamente en los demás móviles conectados.

### Borrado masivo de bebidas y comidas

En la cabecera de las secciones _Bebidas_ y _Comida común_ encontrarás el botón **🗑 Borrar todas / Borrar todos**. Al pulsarlo se te pedirá confirmación antes de eliminar todos los ítems del tipo correspondiente. Esto resulta útil si importaste ítems incorrectos desde el OCR y quieres empezar de nuevo.

### Participantes por producto

Cada ítem (tanto bebida como plato de comida) permite elegir qué comensales participan en ese consumo concreto:

- **Bebidas**: al registrar una bebida, marca los comensales que la tomaron con las casillas de selección.
- **Comida**: debajo de cada plato en la lista aparecen las mismas casillas. Puedes usar _Todos_ o _Ninguno_ para marcar o desmarcar a todos de golpe.

El coste del ítem se divide **exclusivamente** entre los comensales marcados. Si nadie está marcado, el ítem no se reparte (0 € asignado a todos).

> **Tip móvil**: las casillas son suficientemente grandes para pulsarlas cómodamente con el dedo, siguiendo el diseño mobile-first de la app.

### OCR del ticket: notas y limitaciones

- El OCR usa **tesseract.js** en el navegador (sin servicios de pago ni claves externas).
- La precisión depende de la calidad de la foto: mejor con buena luz, ticket plano y texto nítido.
- Se detectan líneas con formato `producto + precio` (precio con coma o punto decimal y `€` opcional).
- Las categorías se asignan con reglas locales (`bebida`/`comida`) y se pueden corregir manualmente.
- Al añadir ítems OCR al reparto, las bebidas se crean como compartidas entre los comensales actuales para no romper el flujo colaborativo; puedes ajustarlas después manualmente.

---

## Reglas de reparto

| Concepto | Cálculo |
|---|---|
| **Bebidas (exclusivas)** | El comensal seleccionado paga el total de esa bebida: `precio × cantidad` |
| **Bebidas (compartidas)** | Cada participante paga su parte proporcional: `(precio × cantidad) ÷ nº participantes` |
| **Comida común** | Cada plato se divide entre los comensales marcados en ese plato: `precio ÷ nº participantes del plato`. Si no hay participantes marcados, el plato no se reparte (0 €). Si el plato no tiene participantes registrados (datos previos), se divide entre todos como antes. |
| **IVA** | Se reparte proporcionalmente al subtotal pre-IVA de cada persona: `IVA × (subtotal_i ÷ total_subtotales)`. Los céntimos sobrantes van a quien más consume (método _largest remainder_). |
| **Total por persona** | `subtotal (bebidas + comida) + IVA asignado` |
| **Validación** | `diferencia = total ticket − total calculado`; si la diferencia es inferior a 0,02 € se considera que **cuadra** |

> Los importes se redondean a 2 decimales en cada operación para minimizar errores de coma flotante.

### Ejemplo: botella de vino entre 2 de 3 comensales

Ana, Luis y Marta van a cenar. Piden una botella de vino tinto de 12 €, pero Marta no bebe.
En la sección _Bebidas_ introduces:
- Bebida: «Vino tinto»
- Precio: 12,00 €
- Cantidad: 1
- ¿Quién la tomó? → ☑ Ana  ☑ Luis  ☐ Marta

DiviCuenta asignará **6,00 €** a Ana y **6,00 €** a Luis. Marta pagará 0 € por el vino.

Además, si el plato de paella (18 €) solo lo comen Ana y Luis (Marta pidió algo por separado):
- En la lista de _Comida_, bajo «Paella», desmarca a Marta.

DiviCuenta repartirá los 18 € solo entre Ana y Luis: **9,00 €** cada uno.

---

## Estructura de ficheros

```
DiviCuenta/
├── index.html          # Estructura HTML de la app
├── styles.css          # Estilos mobile-first
├── app.js              # Lógica de la aplicación (vanilla JS + Supabase)
├── config.example.js   # Plantilla de configuración (copiar a config.js)
├── config.js           # ← Crear a partir del ejemplo (necesario en GitHub Pages)
├── .gitignore          # Excluye config.js
├── supabase/
│   └── schema.sql      # Schema de BD + políticas RLS (incluye migración food_participants)
└── README.md           # Este documento
```

---

## Seguridad y limitaciones

- **Sin login obligatorio**: el acceso a una sesión se protege únicamente por el código de 6 caracteres. Para un restaurante entre amigos, esto es más que suficiente.
- **Protección por opacidad**: los IDs de sesión son UUIDs de 128 bits, prácticamente imposibles de adivinar por fuerza bruta.
- **RLS habilitado**: las tablas tienen Row Level Security activada. Las políticas actuales permiten acceso anónimo, lo que es adecuado para una app colaborativa sin auth.
- **Para mayor seguridad** en producción, considera integrar Supabase Auth y restringir las políticas RLS por `auth.uid()`.

---

## Variables necesarias

| Variable | Dónde obtenerla |
|---|---|
| `SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public key |

---

## Resolución de problemas (GitHub Pages)

### La app muestra "Configuración requerida" aunque `config.js` existe

1. **Verifica que `config.js` está publicado.** Abre en el navegador:  
   `https://<usuario>.github.io/<repo>/config.js`  
   Debe mostrarse el contenido del archivo. Si da 404, asegúrate de que el archivo está en `main` y de que GitHub Pages lo está sirviendo desde esa rama.

2. **Espera a que termine el deploy.** Tras hacer commit, GitHub Pages puede tardar 1-2 minutos. Comprueba el estado en: _Actions_ → _pages-build-and-deployment_.

3. **Fuerza la recarga sin caché.** El navegador puede mostrar una versión antigua:
   - Escritorio: `Ctrl+F5` (Windows/Linux) o `Cmd+Shift+R` (Mac)
   - Móvil: cierra completamente la pestaña y vuelve a abrirla, o usa modo incógnito.

4. **Comprueba el formato de `config.js`.** Debe ser:
   ```js
   window.APP_CONFIG = {
     SUPABASE_URL:      'https://xxxxxxxxxxx.supabase.co',
     SUPABASE_ANON_KEY: 'eyJ…',
   };
   ```
   La `SUPABASE_URL` debe ser la URL base sin `/rest/v1` ni barra final.

5. **Abre la consola del navegador** (F12 → Console). Cualquier error de red o de JavaScript aparecerá allí y te indicará la causa exacta.
