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
window.SUPABASE_URL      = 'https://xxxxxxxxxxx.supabase.co';
window.SUPABASE_ANON_KEY = '******';
```

> ⚠️ `config.js` está en `.gitignore` para que **no subas tus credenciales** al repositorio.

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
Sube el repositorio (sin `config.js`) y configura las variables de entorno como variables de build si usas un bundler, o edita `config.js` directamente en el servidor.

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
2. **Registra las bebidas**: dentro del bloque de cada comensal, introduce la bebida, el precio unitario y la cantidad.
3. **Añade la comida común**: en la sección _Comida común_, introduce cada plato con su precio.
4. **Introduce el total del ticket**: escribe el importe total que aparece en la cuenta.
5. **Consulta el resumen**: muestra lo que debe pagar cada persona y si el cálculo cuadra con el ticket.

> Todos los cambios se sincronizan automáticamente en los demás móviles conectados.

---

## Reglas de reparto

| Concepto | Cálculo |
|---|---|
| **Bebidas** | Cada comensal paga exactamente sus propias bebidas: `Σ (precio unitario × cantidad)` |
| **Comida común** | Se divide a partes **iguales** entre todos los comensales: `total comida ÷ número de comensales` |
| **Total por persona** | `bebidas propias + parte de comida` |
| **Validación** | `diferencia = total ticket − total calculado`; si la diferencia es inferior a 0,02 € se considera que **cuadra** |

> Los importes se redondean a 2 decimales en cada operación para minimizar errores de coma flotante.

---

## Estructura de ficheros

```
DiviCuenta/
├── index.html          # Estructura HTML de la app
├── styles.css          # Estilos mobile-first
├── app.js              # Lógica de la aplicación (vanilla JS + Supabase)
├── config.example.js   # Plantilla de configuración (copiar a config.js)
├── config.js           # ← Crear a partir del ejemplo (NO subir al repo)
├── .gitignore          # Excluye config.js
├── supabase/
│   └── schema.sql      # Schema de BD + políticas RLS
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

