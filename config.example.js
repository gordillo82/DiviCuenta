// ============================================================
// DiviCuenta – Configuración de Supabase
// ============================================================
// Instrucciones:
//   1. Copia este archivo a config.js  (cp config.example.js config.js)
//   2. Rellena los valores con los de tu proyecto Supabase:
//      https://app.supabase.com → Settings → API
//   3. SUPABASE_URL debe ser la URL base del proyecto (sin /rest/v1 ni barra final)
//      Ejemplo correcto:   https://abcdefghij.supabase.co
//      Ejemplo incorrecto: https://abcdefghij.supabase.co/rest/v1/
//
// Para GitHub Pages: este archivo SÍ debe estar en el repo (la anon key es pública).
// Para desarrollo local: añádelo a .gitignore si prefieres no subirlo.

window.APP_CONFIG = {
  SUPABASE_URL:      'https://tu-proyecto.supabase.co',
  SUPABASE_ANON_KEY: 'tu-anon-key-aqui',
};
