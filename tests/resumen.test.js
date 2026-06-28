const test = require('node:test');
const assert = require('node:assert/strict');

const { calcularResumenDetallado } = require('../app.js');

test('reparte los céntimos residuales y cuadra exactamente el total global', () => {
  const resumen = calcularResumenDetallado({
    comensales: [
      { id: 'a', nombre: 'Ana' },
      { id: 'b', nombre: 'Beto' },
      { id: 'c', nombre: 'Cora' },
    ],
    bebidas: [
      { producto: 'Botella', precioUnitario: 10, cantidad: 1, participantes: ['a', 'b', 'c'] },
    ],
    comidaComun: [
      { concepto: 'Ración', precio: 10 },
    ],
    totalCuentaIngresado: 21.99,
    taxTotalIngresado: 1.99,
  });

  assert.deepEqual(
    resumen.totalesPorComensal.map(t => t.bebidas),
    [3.34, 3.33, 3.33]
  );
  assert.deepEqual(
    resumen.totalesPorComensal.map(t => t.comida),
    [3.34, 3.33, 3.33]
  );
  assert.deepEqual(
    resumen.totalesPorComensal.map(t => t.iva),
    [0.67, 0.66, 0.66]
  );
  assert.deepEqual(
    resumen.totalesPorComensal.map(t => t.total),
    [7.35, 7.32, 7.32]
  );
  assert.equal(resumen.totalCalculado, 21.99);
  assert.equal(resumen.diferencia, 0);
});

test('mantiene separadas las columnas de bebidas, comida e IVA y valida sumas por concepto', () => {
  const resumen = calcularResumenDetallado({
    comensales: [
      { id: 'a', nombre: 'Ana' },
      { id: 'b', nombre: 'Beto' },
      { id: 'c', nombre: 'Cora' },
    ],
    bebidas: [
      { producto: 'Vino', precioUnitario: 9.99, cantidad: 1, participantes: ['a', 'b', 'c'] },
      { producto: 'Agua', precioUnitario: 2.5, cantidad: 1, participantes: ['a'] },
    ],
    comidaComun: [
      { concepto: 'Paella', precio: 14 },
    ],
    totalCuentaIngresado: 28.49,
    taxTotalIngresado: 1.99,
  });

  const bebidas = resumen.totalesPorComensal.map(t => t.bebidas);
  const comida = resumen.totalesPorComensal.map(t => t.comida);
  const iva = resumen.totalesPorComensal.map(t => t.iva);
  const total = resumen.totalesPorComensal.map(t => t.total);

  assert.notDeepEqual(iva, comida);
  assert.deepEqual(bebidas, [5.83, 3.33, 3.33]);
  assert.deepEqual(comida, [4.67, 4.67, 4.66]);
  assert.deepEqual(iva, [0.79, 0.6, 0.6]);
  assert.deepEqual(total, [11.29, 8.6, 8.59]);

  assert.equal(resumen.totalBebidas, 12.49);
  assert.equal(resumen.totalComida, 14);
  assert.equal(resumen.taxTotal, 1.99);
  assert.equal(resumen.totalCalculado, 28.48);
  assert.equal(
    Number(bebidas.reduce((acc, amount) => acc + amount, 0).toFixed(2)),
    resumen.totalBebidas
  );
  assert.equal(
    Number(comida.reduce((acc, amount) => acc + amount, 0).toFixed(2)),
    resumen.totalComida
  );
  assert.equal(
    Number(iva.reduce((acc, amount) => acc + amount, 0).toFixed(2)),
    resumen.taxTotal
  );
  assert.equal(
    Number(total.reduce((acc, amount) => acc + amount, 0).toFixed(2)),
    resumen.totalCalculado
  );
});
