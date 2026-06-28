/* =========================================================
   DiviCuenta – Lógica de la aplicación con tiempo real
   =========================================================
   Requiere:
     · Supabase JS v2  (CDN, cargado antes de este script)
     · config.js       (SUPABASE_URL y SUPABASE_ANON_KEY)

   Flujo:
     1. DOMContentLoaded → initSupabase()
     2a. Sesión guardada en sessionStorage → mostrarApp()
     2b. Sin sesión → mostrar lobby (crear / unirse)
     3. App: CRUD asíncrono en Supabase + subscripciones en tiempo real
   ========================================================= */

'use strict';

// ─── Cliente Supabase ──────────────────────────────────────
let db = null;

function initSupabase() {
  if (window.__configMissing ||
      !window.SUPABASE_URL ||
      !window.SUPABASE_ANON_KEY ||
      window.SUPABASE_URL.includes('tu-proyecto') ||
      window.SUPABASE_ANON_KEY === 'tu-anon-key-aqui') {
    mostrarErrorConfig();
    return false;
  }
  try {
    const { createClient } = window.supabase;
    db = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    return true;
  } catch (_) {
    mostrarErrorConfig();
    return false;
  }
}

// ─── Estado de sesión ─────────────────────────────────────
let sessionId     = null;
let sessionCode   = null;
let miNickname    = null;
let participantId = null;
let realtimeChannel   = null;
let presenceChannel   = null;
let totalDebounceTimer = null;
let totalInputFocused  = false;

// ─── Estado local (espejo de la BD) ───────────────────────
let comensales = [];   // [{id, nombre, bebidas:[{id, producto, precioUnitario, cantidad}]}]
let comidaComun = [];  // [{id, concepto, precio}]
let totalCuentaIngresado = 0;

// ─── Helpers de formato ───────────────────────────────────
function fmt(n) {
  return n.toFixed(2) + ' €';
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ─── Seguridad ────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Validaciones ─────────────────────────────────────────
function invalido(input, mensaje) {
  input.setCustomValidity(mensaje);
  input.reportValidity();
  return false;
}

function limpiarValidacion(input) {
  input.setCustomValidity('');
}

// ─── Cálculos ─────────────────────────────────────────────
function totalBebidasComensal(comensal) {
  return comensal.bebidas.reduce((acc, b) => acc + round2(b.precioUnitario * b.cantidad), 0);
}

function totalComidaComunTotal() {
  return comidaComun.reduce((acc, c) => acc + c.precio, 0);
}

function calcularResumen() {
  const totalBebidas = round2(comensales.reduce((acc, c) => acc + totalBebidasComensal(c), 0));
  const totalComida  = round2(totalComidaComunTotal());
  const n = comensales.length;
  const repartoPorPersona = n > 0 ? round2(totalComida / n) : 0;

  const totalesPorComensal = comensales.map(c => ({
    comensal: c,
    bebidas:  round2(totalBebidasComensal(c)),
    comida:   repartoPorPersona,
    total:    round2(totalBebidasComensal(c) + repartoPorPersona),
  }));

  const totalCalculado = round2(totalesPorComensal.reduce((acc, t) => acc + t.total, 0));
  const totalCuenta    = round2(totalCuentaIngresado || 0);
  const diferencia     = round2(totalCuenta - totalCalculado);

  return { totalBebidas, totalComida, repartoPorPersona, totalesPorComensal,
           totalCalculado, totalCuenta, diferencia };
}

// ─── Renderizado ──────────────────────────────────────────

function renderComensales() {
  const contenedor = document.getElementById('lista-comensales');
  const badge      = document.getElementById('badge-comensales');
  badge.textContent = comensales.length;

  if (comensales.length === 0) {
    contenedor.innerHTML = '<p class="empty-msg">Aún no hay comensales. Añade el primero arriba.</p>';
    actualizarResumen();
    return;
  }

  contenedor.innerHTML = '';
  comensales.forEach(c => {
    const bloque = document.createElement('div');
    bloque.className  = 'comensal-block';
    bloque.dataset.id = c.id;

    // Cabecera
    const cabecera = document.createElement('div');
    cabecera.className = 'comensal-header';
    cabecera.innerHTML = `
      <span class="comensal-name">👤 ${escapeHtml(c.nombre)}</span>
      <button class="btn btn-ghost btn-sm" onclick="eliminarComensal('${c.id}')" title="Eliminar comensal">
        🗑 Eliminar
      </button>`;
    bloque.appendChild(cabecera);

    // Lista de bebidas
    const listaBebidas = document.createElement('div');
    listaBebidas.className = 'bebidas-list';

    if (c.bebidas.length === 0) {
      listaBebidas.innerHTML = '<p class="empty-msg">Sin bebidas registradas.</p>';
    } else {
      c.bebidas.forEach(b => {
        const fila = document.createElement('div');
        fila.className = 'bebida-row';
        const subtotal = round2(b.precioUnitario * b.cantidad);
        fila.innerHTML = `
          <span>${escapeHtml(b.producto)}</span>
          <span class="bebida-precio">${b.cantidad} × ${fmt(b.precioUnitario)} = ${fmt(subtotal)}</span>
          <button class="btn btn-ghost btn-sm" onclick="eliminarBebida('${b.id}')" title="Eliminar bebida">✕</button>`;
        listaBebidas.appendChild(fila);
      });
    }
    bloque.appendChild(listaBebidas);
    bloque.appendChild(crearFormBebida(c.id));
    contenedor.appendChild(bloque);
  });

  actualizarResumen();
}

function renderComidaComun() {
  const contenedor = document.getElementById('lista-comida-comun');
  const badge      = document.getElementById('badge-comida');
  badge.textContent = comidaComun.length;

  if (comidaComun.length === 0) {
    contenedor.innerHTML = '<p class="empty-msg">Sin conceptos de comida común. Añade el primero arriba.</p>';
    actualizarResumen();
    return;
  }

  contenedor.innerHTML = '';
  comidaComun.forEach(item => {
    const fila = document.createElement('div');
    fila.className = 'comida-row';
    fila.innerHTML = `
      <span>${escapeHtml(item.concepto)}</span>
      <span style="font-weight:600; white-space:nowrap;">${fmt(item.precio)}</span>
      <button class="btn btn-ghost btn-sm" onclick="eliminarComida('${item.id}')" title="Eliminar concepto">✕</button>`;
    contenedor.appendChild(fila);
  });

  actualizarResumen();
}

function actualizarResumen() {
  const seccion = document.getElementById('seccion-resumen');
  if (!seccion) return;

  if (comensales.length === 0) {
    seccion.style.display = 'none';
    return;
  }
  seccion.style.display = 'block';

  const r = calcularResumen();

  document.getElementById('res-bebidas').textContent    = fmt(r.totalBebidas);
  document.getElementById('res-comida').textContent     = fmt(r.totalComida);
  document.getElementById('res-total-calc').textContent = fmt(r.totalCalculado);
  document.getElementById('res-total-cuenta').textContent = fmt(r.totalCuenta);

  const difEl        = document.getElementById('res-diferencia');
  const difContenedor = document.getElementById('res-diferencia-bloque');
  const difLabel     = document.getElementById('res-diferencia-label');

  difEl.textContent = fmt(Math.abs(r.diferencia));

  if (r.totalCuenta === 0) {
    difEl.className = 'value';
    difLabel.textContent = 'DIFERENCIA';
  } else if (Math.abs(r.diferencia) < 0.02) {
    difEl.className = 'value diferencia-ok';
    difLabel.textContent = '✅ CUADRA';
  } else {
    difEl.className = 'value diferencia-mal';
    difLabel.textContent = r.diferencia > 0 ? '⚠️ FALTA' : '⚠️ SOBRA';
  }

  const tbody = document.getElementById('tabla-cuerpo');
  tbody.innerHTML = '';
  r.totalesPorComensal.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="nombre-persona">${escapeHtml(t.comensal.nombre)}</td>
      <td>${fmt(t.bebidas)}</td>
      <td>${fmt(t.comida)}</td>
      <td class="total-persona">${fmt(t.total)}</td>`;
    tbody.appendChild(tr);
  });
}

/** Mini-formulario para añadir bebida a un comensal. */
function crearFormBebida(comensalId) {
  const form = document.createElement('div');
  form.className = 'input-row';
  // comensalId es UUID (solo contiene [a-f0-9-]): seguro en atributo onclick con comillas simples
  form.innerHTML = `
    <div class="field">
      <label>Bebida</label>
      <input type="text" placeholder="Ej: Vino tinto" id="beb-prod-${comensalId}" maxlength="60">
    </div>
    <div class="field-sm">
      <label>Precio (€)</label>
      <input type="number" placeholder="0.00" id="beb-precio-${comensalId}" min="0" step="0.01">
    </div>
    <div class="field-sm">
      <label>Uds</label>
      <input type="number" placeholder="1" id="beb-cant-${comensalId}" min="1" step="1" value="1">
    </div>
    <button class="btn btn-primary btn-sm" style="margin-top:1.25rem"
            onclick="añadirBebida('${comensalId}')">+ Añadir</button>`;
  return form;
}

// ─── Presencia ────────────────────────────────────────────

function renderPresencia(state) {
  const seccion = document.getElementById('seccion-presencia');
  const lista   = document.getElementById('lista-presencia');
  if (!seccion || !lista) return;

  const presencias = Object.values(state).flat();

  if (presencias.length === 0) {
    seccion.style.display = 'none';
    return;
  }
  seccion.style.display = 'block';
  lista.innerHTML = presencias
    .map(p => `<span class="presencia-chip">🟢 ${escapeHtml(p.nickname || 'Anónimo')}</span>`)
    .join('');
}

// ─── Estado de conexión ───────────────────────────────────

function setConnectionStatus(status) {
  const el = document.getElementById('connection-status');
  if (!el) return;
  const dot  = el.querySelector('.status-dot');
  const text = el.querySelector('.status-text');
  if (status === 'online') {
    dot.className    = 'status-dot online';
    text.textContent = 'Conectado';
  } else if (status === 'connecting') {
    dot.className    = 'status-dot connecting';
    text.textContent = 'Conectando…';
  } else {
    dot.className    = 'status-dot offline';
    text.textContent = 'Sin conexión';
  }
}

// ─── Supabase: carga de datos ─────────────────────────────

async function fetchAllData() {
  if (!db || !sessionId) return;

  const [dinersRes, drinksRes, foodRes, billRes] = await Promise.all([
    db.from('diners').select('*').eq('session_id', sessionId).order('created_at'),
    db.from('drinks').select('*').eq('session_id', sessionId),
    db.from('shared_food_items').select('*').eq('session_id', sessionId).order('created_at'),
    db.from('bills').select('*').eq('session_id', sessionId).maybeSingle(),
  ]);

  const diners = dinersRes.data || [];
  const drinks = drinksRes.data || [];

  comensales = diners.map(d => ({
    id:     d.id,
    nombre: d.name,
    bebidas: drinks
      .filter(b => b.diner_id === d.id)
      .map(b => ({
        id:             b.id,
        producto:       b.product,
        precioUnitario: parseFloat(b.unit_price),
        cantidad:       b.quantity,
      })),
  }));

  comidaComun = (foodRes.data || []).map(f => ({
    id:       f.id,
    concepto: f.concept,
    precio:   parseFloat(f.price),
  }));

  const billTotal = billRes.data ? parseFloat(billRes.data.total_amount) : 0;
  totalCuentaIngresado = billTotal;

  // Solo actualizar el input si el usuario no está escribiendo en él
  if (!totalInputFocused) {
    const input = document.getElementById('total-cuenta');
    if (input) input.value = billTotal > 0 ? billTotal : '';
  }

  renderComensales();
  renderComidaComun();
}

// ─── Supabase: tiempo real ────────────────────────────────

function setupRealtime() {
  if (!db || !sessionId) return;

  // Canal de datos: escucha INSERT/UPDATE/DELETE en todas las tablas
  realtimeChannel = db
    .channel(`session-data:${sessionId}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'diners',
      filter: `session_id=eq.${sessionId}`,
    }, fetchAllData)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'drinks',
      filter: `session_id=eq.${sessionId}`,
    }, fetchAllData)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'shared_food_items',
      filter: `session_id=eq.${sessionId}`,
    }, fetchAllData)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'bills',
      filter: `session_id=eq.${sessionId}`,
    }, fetchAllData)
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        setConnectionStatus('online');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setConnectionStatus('offline');
      } else {
        setConnectionStatus('connecting');
      }
    });

  // Canal de presencia: muestra quién está conectado ahora
  presenceChannel = db.channel(`presence:${sessionId}`);
  presenceChannel
    .on('presence', { event: 'sync' }, () => {
      renderPresencia(presenceChannel.presenceState());
    })
    .subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        await presenceChannel.track({ nickname: miNickname });
      }
    });
}

// ─── Acciones: comensales ─────────────────────────────────

async function añadirComensal() {
  const input  = document.getElementById('nuevo-comensal');
  const nombre = input.value.trim();

  if (!nombre) {
    invalido(input, 'El nombre del comensal no puede estar vacío.');
    return;
  }
  limpiarValidacion(input);

  const { error } = await db.from('diners').insert({ session_id: sessionId, name: nombre });
  if (error) { console.error('Error añadiendo comensal:', error); return; }

  input.value = '';
  await fetchAllData();
}

async function eliminarComensal(id) {
  // Las bebidas asociadas se eliminan en cascada (ON DELETE CASCADE)
  const { error } = await db.from('diners').delete().eq('id', id);
  if (error) { console.error('Error eliminando comensal:', error); return; }
  await fetchAllData();
}

// ─── Acciones: bebidas ────────────────────────────────────

async function añadirBebida(comensalId) {
  const inputProd   = document.getElementById(`beb-prod-${comensalId}`);
  const inputPrecio = document.getElementById(`beb-precio-${comensalId}`);
  const inputCant   = document.getElementById(`beb-cant-${comensalId}`);

  const producto       = inputProd.value.trim();
  const precioUnitario = parseFloat(inputPrecio.value);
  const cantidad       = parseInt(inputCant.value, 10);

  if (!producto) {
    invalido(inputProd, 'Indica el nombre de la bebida.'); return;
  }
  limpiarValidacion(inputProd);

  if (isNaN(precioUnitario) || precioUnitario < 0) {
    invalido(inputPrecio, 'El precio debe ser un número mayor o igual a 0.'); return;
  }
  limpiarValidacion(inputPrecio);

  if (isNaN(cantidad) || cantidad < 1) {
    invalido(inputCant, 'La cantidad debe ser un número entero mayor o igual a 1.'); return;
  }
  limpiarValidacion(inputCant);

  const { error } = await db.from('drinks').insert({
    session_id: sessionId,
    diner_id:   comensalId,
    product:    producto,
    unit_price: round2(precioUnitario),
    quantity:   cantidad,
  });
  if (error) { console.error('Error añadiendo bebida:', error); return; }

  await fetchAllData();
}

async function eliminarBebida(bebidaId) {
  const { error } = await db.from('drinks').delete().eq('id', bebidaId);
  if (error) { console.error('Error eliminando bebida:', error); return; }
  await fetchAllData();
}

// ─── Acciones: comida común ───────────────────────────────

async function añadirComida() {
  const inputConcepto = document.getElementById('nuevo-concepto');
  const inputPrecio   = document.getElementById('nuevo-comida-precio');

  const concepto = inputConcepto.value.trim();
  const precio   = parseFloat(inputPrecio.value);

  if (!concepto) {
    invalido(inputConcepto, 'Indica el concepto de comida.'); return;
  }
  limpiarValidacion(inputConcepto);

  if (isNaN(precio) || precio < 0) {
    invalido(inputPrecio, 'El precio debe ser un número mayor o igual a 0.'); return;
  }
  limpiarValidacion(inputPrecio);

  const { error } = await db.from('shared_food_items').insert({
    session_id: sessionId,
    concept:    concepto,
    price:      round2(precio),
  });
  if (error) { console.error('Error añadiendo comida:', error); return; }

  inputConcepto.value = '';
  inputPrecio.value   = '';
  await fetchAllData();
}

async function eliminarComida(id) {
  const { error } = await db.from('shared_food_items').delete().eq('id', id);
  if (error) { console.error('Error eliminando comida:', error); return; }
  await fetchAllData();
}

// ─── Total de la cuenta ───────────────────────────────────

async function syncTotalCuenta(valor) {
  if (!db || !sessionId) return;
  const total = round2(parseFloat(valor) || 0);
  totalCuentaIngresado = total;
  actualizarResumen();

  const { error } = await db.from('bills').upsert(
    { session_id: sessionId, total_amount: total },
    { onConflict: 'session_id' }
  );
  if (error) console.error('Error sincronizando total:', error);
}

// ─── Código de sesión ─────────────────────────────────────

function generarCodigoSesion() {
  // Sin caracteres ambiguos (0/O, 1/I/l)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── Crear sesión ─────────────────────────────────────────

async function accionCrearSesion() {
  const nicknameInput = document.getElementById('nickname-crear');
  const nick = nicknameInput.value.trim();

  if (!nick) {
    invalido(nicknameInput, 'Introduce tu nombre para continuar.'); return;
  }
  limpiarValidacion(nicknameInput);

  ocultarLobbyError();
  setLobbyLoading(true);

  // Intenta insertar con código único (hasta 5 intentos por colisión)
  let session = null;
  for (let i = 0; i < 5 && !session; i++) {
    const code = generarCodigoSesion();
    const { data, error } = await db.from('sessions').insert({ code }).select().single();
    if (!error && data) session = data;
  }

  if (!session) {
    mostrarLobbyError('No se pudo crear la sesión. Inténtalo de nuevo.');
    setLobbyLoading(false);
    return;
  }

  const { data: participant, error: pErr } = await db
    .from('participants')
    .insert({ session_id: session.id, nickname: nick })
    .select().single();

  if (pErr) {
    mostrarLobbyError('Error al registrar participante. Inténtalo de nuevo.');
    setLobbyLoading(false);
    return;
  }

  sessionId     = session.id;
  sessionCode   = session.code;
  miNickname    = nick;
  participantId = participant.id;

  guardarSesionLocal();
  mostrarApp();
}

// ─── Unirse a sesión ──────────────────────────────────────

async function accionUnirseASesion() {
  const codigoInput   = document.getElementById('codigo-unirse');
  const nicknameInput = document.getElementById('nickname-unirse');

  const code = codigoInput.value.trim().toUpperCase();
  const nick = nicknameInput.value.trim();

  if (!code) {
    invalido(codigoInput, 'Introduce el código de sesión.'); return;
  }
  limpiarValidacion(codigoInput);

  if (!nick) {
    invalido(nicknameInput, 'Introduce tu nombre para continuar.'); return;
  }
  limpiarValidacion(nicknameInput);

  ocultarLobbyError();
  setLobbyLoading(true);

  const { data: session, error } = await db
    .from('sessions').select('*').eq('code', code).maybeSingle();

  if (error || !session) {
    mostrarLobbyError(`No se encontró ninguna sesión con el código "${escapeHtml(code)}".`);
    setLobbyLoading(false);
    return;
  }

  const { data: participant, error: pErr } = await db
    .from('participants')
    .insert({ session_id: session.id, nickname: nick })
    .select().single();

  if (pErr) {
    mostrarLobbyError('Error al registrar participante. Inténtalo de nuevo.');
    setLobbyLoading(false);
    return;
  }

  sessionId     = session.id;
  sessionCode   = session.code;
  miNickname    = nick;
  participantId = participant.id;

  guardarSesionLocal();
  mostrarApp();
}

// ─── Persistencia de sesión ───────────────────────────────

function guardarSesionLocal() {
  sessionStorage.setItem('dc_session', JSON.stringify({
    sessionId, sessionCode, miNickname, participantId,
  }));
}

function cargarSesionLocal() {
  try {
    const raw = sessionStorage.getItem('dc_session');
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data && data.sessionId) {
      sessionId     = data.sessionId;
      sessionCode   = data.sessionCode;
      miNickname    = data.miNickname;
      participantId = data.participantId;
      return true;
    }
  } catch (_) { /* ignore */ }
  return false;
}

// ─── UI: lobby helpers ────────────────────────────────────

function setLobbyLoading(loading) {
  document.querySelectorAll('#lobby button').forEach(btn => { btn.disabled = loading; });
}

function mostrarLobbyError(msg) {
  const el = document.getElementById('lobby-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function ocultarLobbyError() {
  const el = document.getElementById('lobby-error');
  if (el) el.style.display = 'none';
}

function mostrarErrorConfig() {
  const lobby = document.getElementById('lobby');
  if (!lobby) return;
  lobby.innerHTML = `
    <div class="lobby-card">
      <div class="lobby-logo">⚙️</div>
      <h2 class="lobby-title">Configuración requerida</h2>
      <p class="lobby-subtitle">Para usar DiviCuenta necesitas configurar un proyecto Supabase.</p>
      <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:0.5rem;
                  padding:1rem;margin-top:1rem;font-size:0.88rem;text-align:left;line-height:1.7;">
        <strong>Pasos:</strong><br>
        1. Copia <code>config.example.js</code> → <code>config.js</code><br>
        2. Rellena <code>SUPABASE_URL</code> y <code>SUPABASE_ANON_KEY</code><br>
        3. Ejecuta el SQL de <code>supabase/schema.sql</code> en tu proyecto<br>
        4. Recarga esta página
      </div>
      <p style="margin-top:1rem;font-size:0.82rem;color:#64748b;text-align:center;">
        Consulta el <strong>README</strong> para instrucciones detalladas.
      </p>
    </div>`;
  lobby.style.display = 'flex';
}

// ─── UI: transición lobby ↔ app ───────────────────────────

function mostrarApp() {
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('app').style.display   = 'block';

  const sessionInfo = document.getElementById('session-info');
  sessionInfo.style.display = 'flex';
  document.getElementById('session-code-display').textContent = sessionCode;

  setConnectionStatus('connecting');
  setupRealtime();
  fetchAllData();
}

// ─── Copiar código de sesión ──────────────────────────────

function copiarCodigo() {
  if (!sessionCode) return;
  const fallback = () => { prompt('Código de sesión (cópialo manualmente):', sessionCode); };
  if (navigator.clipboard) {
    navigator.clipboard.writeText(sessionCode)
      .then(() => {
        const btn = document.querySelector('.btn-copy');
        if (!btn) return;
        btn.textContent = '✅';
        setTimeout(() => { btn.textContent = '📋'; }, 1500);
      })
      .catch(fallback);
  } else {
    fallback();
  }
}

// ─── Salir de sesión ──────────────────────────────────────

function salirSesion() {
  if (!confirm('¿Salir de la sesión actual?\n\nPuedes volver a unirte con el mismo código.')) return;

  // Desconectar canales de tiempo real
  if (realtimeChannel) db.removeChannel(realtimeChannel);
  if (presenceChannel) db.removeChannel(presenceChannel);

  sessionStorage.removeItem('dc_session');
  window.location.reload();
}

// ─── Inicialización ───────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // Listeners de la sección app (los elementos existen en el DOM aunque estén ocultos)
  document.getElementById('nuevo-comensal').addEventListener('keydown', e => {
    if (e.key === 'Enter') añadirComensal();
  });

  ['nuevo-concepto', 'nuevo-comida-precio'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') añadirComida();
    });
  });

  const totalInput = document.getElementById('total-cuenta');
  totalInput.addEventListener('focus', () => { totalInputFocused = true; });
  totalInput.addEventListener('blur',  () => {
    totalInputFocused = false;
    if (db && sessionId) syncTotalCuenta(totalInput.value);
  });
  totalInput.addEventListener('input', () => {
    clearTimeout(totalDebounceTimer);
    totalCuentaIngresado = round2(parseFloat(totalInput.value) || 0);
    actualizarResumen();
    if (db && sessionId) {
      totalDebounceTimer = setTimeout(() => syncTotalCuenta(totalInput.value), 800);
    }
  });

  // Inicializar Supabase
  if (!initSupabase()) return;

  // Sesión guardada → ir directamente a la app
  if (cargarSesionLocal()) {
    mostrarApp();
    return;
  }

  // Mostrar lobby
  document.getElementById('lobby').style.display = 'flex';

  // Listeners del lobby
  document.getElementById('nickname-crear').addEventListener('keydown', e => {
    if (e.key === 'Enter') accionCrearSesion();
  });

  ['codigo-unirse', 'nickname-unirse'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') accionUnirseASesion();
    });
  });

  // Código de sesión siempre en mayúsculas
  document.getElementById('codigo-unirse').addEventListener('input', function () {
    const pos = this.selectionStart;
    this.value = this.value.toUpperCase();
    this.setSelectionRange(pos, pos);
  });
});
