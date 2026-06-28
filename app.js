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
  // Bridge window.APP_CONFIG (object format) to flat globals
  if (window.APP_CONFIG) {
    if (window.APP_CONFIG.SUPABASE_URL)
      window.SUPABASE_URL = String(window.APP_CONFIG.SUPABASE_URL).trim();
    if (window.APP_CONFIG.SUPABASE_ANON_KEY)
      window.SUPABASE_ANON_KEY = String(window.APP_CONFIG.SUPABASE_ANON_KEY).trim();
  } else if (window.SUPABASE_URL) {
    window.SUPABASE_URL = String(window.SUPABASE_URL).trim();
    if (window.SUPABASE_ANON_KEY)
      window.SUPABASE_ANON_KEY = String(window.SUPABASE_ANON_KEY).trim();
  }

  // Normalize URL: strip accidental /rest/v1 suffix and trailing slash
  if (window.SUPABASE_URL) {
    window.SUPABASE_URL = window.SUPABASE_URL
      .replace(/\/rest\/v1\/?$/, '')
      .replace(/\/$/, '');
  }

  if (window.__configMissing) {
    mostrarErrorConfig('no-file');
    return false;
  }

  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY ||
      window.SUPABASE_URL.includes('tu-proyecto') ||
      window.SUPABASE_ANON_KEY === 'tu-anon-key-aqui') {
    mostrarErrorConfig('invalid-keys');
    return false;
  }

  try {
    const { createClient } = window.supabase;
    db = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    return true;
  } catch (_) {
    mostrarErrorConfig('client-error');
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
let taxDebounceTimer   = null;
let totalInputFocused  = false;
let taxInputFocused    = false;

// ─── Estado local (espejo de la BD) ───────────────────────
let comensales = [];   // [{id, nombre}]
let bebidas    = [];   // [{id, producto, precioUnitario, cantidad, participantes:[dinerId,...]}]
let comidaComun = [];  // [{id, concepto, precio}]
let totalCuentaIngresado = 0;
let taxTotalIngresado    = 0;  // IVA total del ticket

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
  // Suma la parte proporcional de cada bebida en que participa este comensal
  return bebidas.reduce((acc, b) => {
    const n = b.participantes.length;
    if (n > 0 && b.participantes.includes(comensal.id)) {
      return acc + round2(round2(b.precioUnitario * b.cantidad) / n);
    }
    return acc;
  }, 0);
}

function totalComidaComunTotal() {
  return comidaComun.reduce((acc, c) => acc + c.precio, 0);
}

function calcularResumen() {
  const totalBebidas = round2(comensales.reduce((acc, c) => acc + totalBebidasComensal(c), 0));
  const totalComida  = round2(totalComidaComunTotal());
  const n = comensales.length;
  const repartoPorPersona = n > 0 ? round2(totalComida / n) : 0;
  const taxTotal = round2(taxTotalIngresado || 0);

  // Subtotal pre-IVA por comensal
  const subtotalesPorComensal = comensales.map(c => {
    const bebidas  = round2(totalBebidasComensal(c));
    const comida   = repartoPorPersona;
    const subtotal = round2(bebidas + comida);
    return { comensal: c, bebidas, comida, subtotal };
  });

  // Reparto de IVA proporcional al subtotal pre-IVA (método largest remainder)
  const totalSubtotal = Math.round(
    subtotalesPorComensal.reduce((acc, t) => acc + t.subtotal, 0) * 100
  );
  const taxCents = Math.round(taxTotal * 100);

  let ivasPorComensal;
  if (totalSubtotal === 0 || taxCents === 0) {
    ivasPorComensal = subtotalesPorComensal.map(() => 0);
  } else {
    // Valor exacto (en céntimos) para cada comensal
    const ivasExactos = subtotalesPorComensal.map(t =>
      taxCents * (Math.round(t.subtotal * 100) / totalSubtotal)
    );
    // Floor en céntimos
    const ivasFloorCents = ivasExactos.map(v => Math.floor(v));
    // Céntimos restantes por repartir (largest remainder)
    const sumFloor = ivasFloorCents.reduce((a, b) => a + b, 0);
    const remainder = taxCents - sumFloor;
    // Ordenar por mayor parte fraccionaria para distribuir los céntimos sobrantes
    const indexed = ivasExactos.map((v, i) => ({ i, frac: v - Math.floor(v) }));
    indexed.sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < remainder; k++) {
      ivasFloorCents[indexed[k].i] += 1;
    }
    ivasPorComensal = ivasFloorCents.map(c => c / 100);
  }

  const totalesPorComensal = subtotalesPorComensal.map((t, i) => ({
    comensal: t.comensal,
    bebidas:  t.bebidas,
    comida:   t.comida,
    subtotal: t.subtotal,
    iva:      ivasPorComensal[i],
    total:    round2(t.subtotal + ivasPorComensal[i]),
  }));

  const totalCalculado = round2(totalesPorComensal.reduce((acc, t) => acc + t.total, 0));
  const totalCuenta    = round2(totalCuentaIngresado || 0);
  const diferencia     = round2(totalCuenta - totalCalculado);

  return { totalBebidas, totalComida, taxTotal, repartoPorPersona, totalesPorComensal,
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

    const cabecera = document.createElement('div');
    cabecera.className = 'comensal-header';
    cabecera.innerHTML = `
      <span class="comensal-name">👤 ${escapeHtml(c.nombre)}</span>
      <button class="btn btn-ghost btn-sm" onclick="eliminarComensal('${c.id}')" title="Eliminar comensal">
        🗑 Eliminar
      </button>`;
    bloque.appendChild(cabecera);
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

  document.getElementById('res-bebidas').textContent      = fmt(r.totalBebidas);
  document.getElementById('res-comida').textContent       = fmt(r.totalComida);
  document.getElementById('res-iva').textContent          = fmt(r.taxTotal);
  document.getElementById('res-total-calc').textContent   = fmt(r.totalCalculado);
  document.getElementById('res-total-cuenta').textContent = fmt(r.totalCuenta);

  const difEl         = document.getElementById('res-diferencia');
  const difLabel      = document.getElementById('res-diferencia-label');

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

  // Mostrar u ocultar la columna IVA según si hay IVA ingresado
  const thIva = document.getElementById('th-iva');
  if (thIva) thIva.style.display = r.taxTotal > 0 ? '' : 'none';

  const tbody = document.getElementById('tabla-cuerpo');
  tbody.innerHTML = '';
  r.totalesPorComensal.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="nombre-persona">${escapeHtml(t.comensal.nombre)}</td>
      <td>${fmt(t.subtotal)}</td>
      <td style="display:${r.taxTotal > 0 ? '' : 'none'}">${fmt(t.iva)}</td>
      <td class="total-persona">${fmt(t.total)}</td>`;
    tbody.appendChild(tr);
  });
}

/** Formulario global para añadir bebida con selección de participantes. */
function crearFormBebidaCompartida() {
  const form = document.createElement('div');
  form.className = 'bebida-compartida-form';

  const checkboxesHtml = comensales.map(c => `
    <label class="participante-chip">
      <input type="checkbox" id="beb-part-${c.id}" value="${c.id}">
      ${escapeHtml(c.nombre)}
    </label>`).join('');

  form.innerHTML = `
    <div class="input-row">
      <div class="field">
        <label>Bebida</label>
        <input type="text" placeholder="Ej: Vino tinto" id="beb-global-prod" maxlength="60"
               autocomplete="off" autocorrect="off">
      </div>
      <div class="field-sm">
        <label>Precio (€)</label>
        <input type="number" placeholder="0.00" id="beb-global-precio" min="0" step="0.01">
      </div>
      <div class="field-sm">
        <label>Uds</label>
        <input type="number" placeholder="1" id="beb-global-cant" min="1" step="1" value="1">
      </div>
    </div>
    <div class="participantes-selector">
      <span class="participantes-label">¿Quién la tomó?</span>
      <div class="participantes-chips">${checkboxesHtml}</div>
      <p class="field-error" id="beb-part-error" style="display:none">
        Selecciona al menos un comensal.
      </p>
    </div>
    <button class="btn btn-primary btn-sm" style="margin-top:0.75rem"
            onclick="añadirBebidaCompartida()">+ Añadir bebida</button>`;
  return form;
}

function renderBebidas() {
  const badge = document.getElementById('badge-bebidas');
  if (badge) badge.textContent = bebidas.length;

  // Formulario: se actualiza cuando cambian los comensales
  const formContainer = document.getElementById('bebidas-form-container');
  if (formContainer) {
    if (comensales.length === 0) {
      formContainer.innerHTML = '<p class="empty-msg">Añade comensales primero para registrar bebidas.</p>';
    } else {
      formContainer.innerHTML = '';
      formContainer.appendChild(crearFormBebidaCompartida());
    }
  }

  // Lista de bebidas
  const lista = document.getElementById('lista-bebidas');
  if (!lista) return;

  if (bebidas.length === 0) {
    lista.innerHTML = '<p class="empty-msg">Sin bebidas registradas.</p>';
    return;
  }

  lista.innerHTML = '';
  bebidas.forEach(b => {
    const subtotal = round2(b.precioUnitario * b.cantidad);
    const n = b.participantes.length || 1;
    const porCada = round2(subtotal / n);

    const nombresParticipantes = b.participantes
      .map(pid => {
        const c = comensales.find(x => x.id === pid);
        return c ? escapeHtml(c.nombre) : '?';
      })
      .join(', ');

    const fila = document.createElement('div');
    fila.className = 'bebida-compartida-row';
    fila.innerHTML = `
      <div class="bebida-info">
        <span class="bebida-nombre">${escapeHtml(b.producto)}</span>
        <span class="bebida-precio">${b.cantidad} × ${fmt(b.precioUnitario)} = ${fmt(subtotal)}</span>
        <span class="bebida-participantes">👥 ${nombresParticipantes}${n > 1 ? ` · ${fmt(porCada)} c/u` : ''}</span>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="eliminarBebida('${b.id}')" title="Eliminar bebida">✕</button>`;
    lista.appendChild(fila);
  });
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

  const [dinersRes, drinksRes, drinkPartsRes, foodRes, billRes] = await Promise.all([
    db.from('diners').select('*').eq('session_id', sessionId).order('created_at'),
    db.from('drinks').select('*').eq('session_id', sessionId).order('created_at'),
    db.from('drink_participants').select('*').eq('session_id', sessionId),
    db.from('shared_food_items').select('*').eq('session_id', sessionId).order('created_at'),
    db.from('bills').select('*').eq('session_id', sessionId).maybeSingle(),
  ]);

  const diners    = dinersRes.data    || [];
  const drinks    = drinksRes.data    || [];
  const drinkParts = drinkPartsRes.data || [];

  comensales = diners.map(d => ({ id: d.id, nombre: d.name }));

  bebidas = drinks.map(b => {
    const parts = drinkParts.filter(p => p.drink_id === b.id).map(p => p.diner_id);
    // Compatibilidad hacia atrás: si no hay participantes en drink_participants,
    // usar diner_id como participante único
    const participantes = parts.length > 0 ? parts : (b.diner_id ? [b.diner_id] : []);
    return {
      id:             b.id,
      producto:       b.product,
      precioUnitario: parseFloat(b.unit_price),
      cantidad:       b.quantity,
      participantes,
    };
  });

  comidaComun = (foodRes.data || []).map(f => ({
    id:       f.id,
    concepto: f.concept,
    precio:   parseFloat(f.price),
  }));

  const billTotal = billRes.data ? parseFloat(billRes.data.total_amount) : 0;
  const taxTotal  = billRes.data ? parseFloat(billRes.data.tax_total || 0) : 0;
  totalCuentaIngresado = billTotal;
  taxTotalIngresado    = taxTotal;

  // Solo actualizar el input si el usuario no está escribiendo en él
  if (!totalInputFocused) {
    const input = document.getElementById('total-cuenta');
    if (input) input.value = billTotal > 0 ? billTotal : '';
  }
  if (!taxInputFocused) {
    const ivaInput = document.getElementById('iva-total');
    if (ivaInput) ivaInput.value = taxTotal > 0 ? taxTotal : '';
  }

  renderComensales();
  renderBebidas();
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
      event: '*', schema: 'public', table: 'drink_participants',
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

async function añadirBebidaCompartida() {
  const inputProd   = document.getElementById('beb-global-prod');
  const inputPrecio = document.getElementById('beb-global-precio');
  const inputCant   = document.getElementById('beb-global-cant');

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

  const participantes = comensales
    .filter(c => {
      const cb = document.getElementById(`beb-part-${c.id}`);
      return cb && cb.checked;
    })
    .map(c => c.id);

  const errMsg = document.getElementById('beb-part-error');
  if (participantes.length === 0) {
    if (errMsg) errMsg.style.display = 'block';
    return;
  }
  if (errMsg) errMsg.style.display = 'none';

  const { data: drink, error } = await db.from('drinks').insert({
    session_id: sessionId,
    product:    producto,
    unit_price: round2(precioUnitario),
    quantity:   cantidad,
  }).select().single();

  if (error) { console.error('Error añadiendo bebida:', error); return; }

  const participantRows = participantes.map(dinerId => ({
    drink_id:   drink.id,
    diner_id:   dinerId,
    session_id: sessionId,
  }));

  const { error: partError } = await db.from('drink_participants').insert(participantRows);
  if (partError) { console.error('Error añadiendo participantes de bebida:', partError); return; }

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

async function syncTaxTotal(valor) {
  if (!db || !sessionId) return;
  const tax = round2(parseFloat(valor) || 0);
  taxTotalIngresado = tax;
  actualizarResumen();

  const { error } = await db.from('bills').upsert(
    { session_id: sessionId, tax_total: tax },
    { onConflict: 'session_id' }
  );
  if (error) console.error('Error sincronizando IVA:', error);
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

function mostrarErrorConfig(razon) {
  const lobby = document.getElementById('lobby');
  if (!lobby) return;

  let detalle;
  if (razon === 'no-file') {
    detalle = `<strong>Problema:</strong> <code>config.js</code> no se pudo cargar.<br>
      Asegúrate de que el archivo existe en la raíz del repositorio y está publicado en GitHub Pages.<br>
      Compruébalo abriendo <code>…/DiviCuenta/config.js</code> directamente en el navegador.`;
  } else if (razon === 'invalid-keys') {
    detalle = `<strong>Problema:</strong> Las claves en <code>config.js</code> son inválidas o siguen siendo las de ejemplo.<br>
      Revisa que <code>SUPABASE_URL</code> sea la URL base de tu proyecto (sin <code>/rest/v1</code>)<br>
      y que <code>SUPABASE_ANON_KEY</code> contenga tu clave anon pública real.`;
  } else {
    detalle = `Error al crear el cliente Supabase. Verifica que las claves en <code>config.js</code> sean correctas.`;
  }

  lobby.innerHTML = `
    <div class="lobby-card">
      <div class="lobby-logo">⚙️</div>
      <h2 class="lobby-title">Configuración requerida</h2>
      <p class="lobby-subtitle">Para usar DiviCuenta necesitas configurar un proyecto Supabase.</p>
      <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:0.5rem;
                  padding:1rem;margin-top:1rem;font-size:0.88rem;text-align:left;line-height:1.7;">
        ${detalle}
      </div>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:0.5rem;
                  padding:1rem;margin-top:0.75rem;font-size:0.85rem;text-align:left;line-height:1.7;">
        <strong>Pasos:</strong><br>
        1. Crea o edita <code>config.js</code> en la raíz del repo<br>
        2. Rellena <code>SUPABASE_URL</code> y <code>SUPABASE_ANON_KEY</code><br>
        3. Haz commit en <code>main</code> y espera 1–2 min a que se publique<br>
        4. Recarga la página (Ctrl+F5 · Cmd+Shift+R · en móvil cierra y reabre)
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

  const ivaInput = document.getElementById('iva-total');
  ivaInput.addEventListener('focus', () => { taxInputFocused = true; });
  ivaInput.addEventListener('blur',  () => {
    taxInputFocused = false;
    if (db && sessionId) syncTaxTotal(ivaInput.value);
  });
  ivaInput.addEventListener('input', () => {
    clearTimeout(taxDebounceTimer);
    taxTotalIngresado = round2(parseFloat(ivaInput.value) || 0);
    actualizarResumen();
    if (db && sessionId) {
      taxDebounceTimer = setTimeout(() => syncTaxTotal(ivaInput.value), 800);
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
