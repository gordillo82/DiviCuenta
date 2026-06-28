/* =========================================================
   DiviCuenta – Lógica de la aplicación
   =========================================================
   Estructura de datos:
     comensales: [{ id, nombre, bebidas: [{producto, precioUnitario, cantidad}] }]
     comidaComun: [{ id, concepto, precio }]
     totalCuentaIngresado: number
   ========================================================= */

'use strict';

// ─── Estado ────────────────────────────────────────────────
let comensales = [];          // array de objetos comensal
let comidaComun = [];         // array de objetos comida común
let siguienteIdComensal = 1;  // contador de IDs únicos para comensales
let siguienteIdComida = 1;    // contador de IDs únicos para comida
let siguienteIdBebida = 1;    // contador de IDs únicos para bebidas

// ─── Helpers de formato ────────────────────────────────────
/**
 * Formatea un número como precio en euros con 2 decimales.
 * @param {number} n
 * @returns {string}
 */
function fmt(n) {
  return n.toFixed(2) + ' €';
}

/**
 * Redondea a 2 decimales de forma consistente.
 * @param {number} n
 * @returns {number}
 */
function round2(n) {
  return Math.round(n * 100) / 100;
}

// ─── Validaciones ──────────────────────────────────────────
/**
 * Muestra un mensaje de error nativo y devuelve false.
 * @param {HTMLInputElement} input
 * @param {string} mensaje
 * @returns {false}
 */
function invalido(input, mensaje) {
  input.setCustomValidity(mensaje);
  input.reportValidity();
  return false;
}

/** Limpia la validación personalizada de un input. */
function limpiarValidacion(input) {
  input.setCustomValidity('');
}

// ─── Cálculos ──────────────────────────────────────────────
/**
 * Calcula el total de bebidas de un comensal.
 * @param {{bebidas: Array}} comensal
 * @returns {number}
 */
function totalBebidasComensal(comensal) {
  return comensal.bebidas.reduce((acc, b) => {
    return acc + round2(b.precioUnitario * b.cantidad);
  }, 0);
}

/**
 * Calcula el total de la comida común.
 * @returns {number}
 */
function totalComidaComunTotal() {
  return comidaComun.reduce((acc, c) => acc + c.precio, 0);
}

/**
 * Calcula todos los totales para el resumen.
 * @returns {{totalBebidas, totalComida, repartoPorPersona, totalesPorComensal, totalCalculado, diferencia}}
 */
function calcularResumen() {
  const totalBebidas = round2(comensales.reduce((acc, c) => acc + totalBebidasComensal(c), 0));
  const totalComida = round2(totalComidaComunTotal());
  const n = comensales.length;
  const repartoPorPersona = n > 0 ? round2(totalComida / n) : 0;

  const totalesPorComensal = comensales.map(c => ({
    comensal: c,
    bebidas: round2(totalBebidasComensal(c)),
    comida: repartoPorPersona,
    total: round2(totalBebidasComensal(c) + repartoPorPersona),
  }));

  const totalCalculado = round2(totalesPorComensal.reduce((acc, t) => acc + t.total, 0));
  const totalCuenta = round2(parseFloat(document.getElementById('total-cuenta').value) || 0);
  const diferencia = round2(totalCuenta - totalCalculado);

  return { totalBebidas, totalComida, repartoPorPersona, totalesPorComensal, totalCalculado, totalCuenta, diferencia };
}

// ─── Renderizado ───────────────────────────────────────────

/** Renderiza la lista completa de comensales y sus bebidas. */
function renderComensales() {
  const contenedor = document.getElementById('lista-comensales');
  const badge = document.getElementById('badge-comensales');
  badge.textContent = comensales.length;

  if (comensales.length === 0) {
    contenedor.innerHTML = '<p class="empty-msg">Aún no hay comensales. Añade el primero arriba.</p>';
    return;
  }

  contenedor.innerHTML = '';
  comensales.forEach(c => {
    const bloque = document.createElement('div');
    bloque.className = 'comensal-block';
    bloque.dataset.id = c.id;

    // Cabecera del comensal
    const cabecera = document.createElement('div');
    cabecera.className = 'comensal-header';
    cabecera.innerHTML = `
      <span class="comensal-name">👤 ${escapeHtml(c.nombre)}</span>
      <button class="btn btn-ghost btn-sm" onclick="eliminarComensal(${c.id})" title="Eliminar comensal">
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
          <button class="btn btn-ghost btn-sm" onclick="eliminarBebida(${c.id}, ${b.id})" title="Eliminar bebida">✕</button>`;
        listaBebidas.appendChild(fila);
      });
    }
    bloque.appendChild(listaBebidas);

    // Formulario añadir bebida
    bloque.appendChild(crearFormBebida(c.id));

    contenedor.appendChild(bloque);
  });

  actualizarResumen();
}

/** Renderiza la lista de comida común. */
function renderComidaComun() {
  const contenedor = document.getElementById('lista-comida-comun');
  const badge = document.getElementById('badge-comida');
  badge.textContent = comidaComun.length;

  if (comidaComun.length === 0) {
    contenedor.innerHTML = '<p class="empty-msg">Sin conceptos de comida común. Añade el primero arriba.</p>';
    return;
  }

  contenedor.innerHTML = '';
  comidaComun.forEach(item => {
    const fila = document.createElement('div');
    fila.className = 'comida-row';
    fila.innerHTML = `
      <span>${escapeHtml(item.concepto)}</span>
      <span style="font-weight:600; white-space:nowrap;">${fmt(item.precio)}</span>
      <button class="btn btn-ghost btn-sm" onclick="eliminarComida(${item.id})" title="Eliminar concepto">✕</button>`;
    contenedor.appendChild(fila);
  });

  actualizarResumen();
}

/** Actualiza la sección de resumen con los cálculos actuales. */
function actualizarResumen() {
  const seccion = document.getElementById('seccion-resumen');

  if (comensales.length === 0) {
    seccion.style.display = 'none';
    return;
  }

  seccion.style.display = 'block';

  const r = calcularResumen();

  // Totales globales
  document.getElementById('res-bebidas').textContent = fmt(r.totalBebidas);
  document.getElementById('res-comida').textContent = fmt(r.totalComida);
  document.getElementById('res-total-calc').textContent = fmt(r.totalCalculado);
  document.getElementById('res-total-cuenta').textContent = fmt(r.totalCuenta);

  const difEl = document.getElementById('res-diferencia');
  difEl.textContent = fmt(Math.abs(r.diferencia));
  const difContenedor = document.getElementById('res-diferencia-bloque');
  const difLabel = document.getElementById('res-diferencia-label');

  if (r.totalCuenta === 0) {
    difContenedor.className = 'resumen-stat';
    difEl.className = '';
    difLabel.textContent = 'DIFERENCIA';
  } else if (Math.abs(r.diferencia) < 0.02) {
    difContenedor.className = 'resumen-stat';
    difEl.className = 'value diferencia-ok';
    difLabel.textContent = '✅ CUADRA';
  } else {
    difContenedor.className = 'resumen-stat';
    difEl.className = 'value diferencia-mal';
    difLabel.textContent = r.diferencia > 0 ? '⚠️ FALTA' : '⚠️ SOBRA';
  }

  // Tabla por persona
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

/**
 * Crea el mini-formulario para añadir una bebida a un comensal.
 * @param {number} comensalId
 * @returns {HTMLElement}
 */
function crearFormBebida(comensalId) {
  const form = document.createElement('div');
  form.className = 'input-row';
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
    <button class="btn btn-primary btn-sm" style="margin-top:1.25rem" onclick="añadirBebida(${comensalId})">+ Añadir</button>`;
  return form;
}

// ─── Acciones de comensales ────────────────────────────────

/** Añade un nuevo comensal a partir del campo de nombre. */
function añadirComensal() {
  const input = document.getElementById('nuevo-comensal');
  const nombre = input.value.trim();

  if (!nombre) {
    invalido(input, 'El nombre del comensal no puede estar vacío.');
    return;
  }
  limpiarValidacion(input);

  comensales.push({
    id: siguienteIdComensal++,
    nombre,
    bebidas: [],
  });

  input.value = '';
  renderComensales();
}

/**
 * Elimina un comensal por su ID.
 * @param {number} id
 */
function eliminarComensal(id) {
  comensales = comensales.filter(c => c.id !== id);
  renderComensales();
  renderComidaComun(); // badge + resumen
}

// ─── Acciones de bebidas ────────────────────────────────────

/**
 * Añade una bebida al comensal indicado.
 * @param {number} comensalId
 */
function añadirBebida(comensalId) {
  const inputProd   = document.getElementById(`beb-prod-${comensalId}`);
  const inputPrecio = document.getElementById(`beb-precio-${comensalId}`);
  const inputCant   = document.getElementById(`beb-cant-${comensalId}`);

  const producto = inputProd.value.trim();
  const precioUnitario = parseFloat(inputPrecio.value);
  const cantidad = parseInt(inputCant.value, 10);

  if (!producto) {
    invalido(inputProd, 'Indica el nombre de la bebida.');
    return;
  }
  limpiarValidacion(inputProd);

  if (isNaN(precioUnitario) || precioUnitario < 0) {
    invalido(inputPrecio, 'El precio debe ser un número mayor o igual a 0.');
    return;
  }
  limpiarValidacion(inputPrecio);

  if (isNaN(cantidad) || cantidad < 1) {
    invalido(inputCant, 'La cantidad debe ser un número entero mayor o igual a 1.');
    return;
  }
  limpiarValidacion(inputCant);

  const comensal = comensales.find(c => c.id === comensalId);
  if (!comensal) return;

  comensal.bebidas.push({
    id: siguienteIdBebida++,
    producto,
    precioUnitario: round2(precioUnitario),
    cantidad,
  });

  renderComensales();
}

/**
 * Elimina una bebida de un comensal.
 * @param {number} comensalId
 * @param {number} bebidaId
 */
function eliminarBebida(comensalId, bebidaId) {
  const comensal = comensales.find(c => c.id === comensalId);
  if (!comensal) return;
  comensal.bebidas = comensal.bebidas.filter(b => b.id !== bebidaId);
  renderComensales();
}

// ─── Acciones de comida común ───────────────────────────────

/** Añade un concepto de comida común. */
function añadirComida() {
  const inputConcepto = document.getElementById('nuevo-concepto');
  const inputPrecio   = document.getElementById('nuevo-comida-precio');

  const concepto = inputConcepto.value.trim();
  const precio   = parseFloat(inputPrecio.value);

  if (!concepto) {
    invalido(inputConcepto, 'Indica el concepto de comida.');
    return;
  }
  limpiarValidacion(inputConcepto);

  if (isNaN(precio) || precio < 0) {
    invalido(inputPrecio, 'El precio debe ser un número mayor o igual a 0.');
    return;
  }
  limpiarValidacion(inputPrecio);

  comidaComun.push({
    id: siguienteIdComida++,
    concepto,
    precio: round2(precio),
  });

  inputConcepto.value = '';
  inputPrecio.value   = '';
  renderComidaComun();
  actualizarResumen();
}

/**
 * Elimina un concepto de comida común.
 * @param {number} id
 */
function eliminarComida(id) {
  comidaComun = comidaComun.filter(c => c.id !== id);
  renderComidaComun();
  actualizarResumen();
}

// ─── Seguridad ─────────────────────────────────────────────
/**
 * Escapa caracteres HTML para evitar XSS al insertar texto de usuario en el DOM.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Eventos ───────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Añadir comensal con Enter
  document.getElementById('nuevo-comensal').addEventListener('keydown', e => {
    if (e.key === 'Enter') añadirComensal();
  });

  // Añadir comida con Enter en cualquiera de los dos campos
  ['nuevo-concepto', 'nuevo-comida-precio'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') añadirComida();
    });
  });

  // Recalcular al cambiar el total de la cuenta
  document.getElementById('total-cuenta').addEventListener('input', actualizarResumen);

  // Render inicial
  renderComensales();
  renderComidaComun();
});
