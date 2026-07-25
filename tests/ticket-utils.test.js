const test = require('node:test');
const assert = require('node:assert/strict');

const { parseTicketLines, classifyItem } = require('../ticket-utils.js');

test('parseTicketLines extrae líneas de producto y precio con coma, punto y euro opcional', () => {
  const text = `
    AGUA 1,50 €
    PAELLA 12.00
    TOTAL 13,50 €
    TEXTO SUELTO
  `;

  assert.deepEqual(parseTicketLines(text), [
    { name: 'AGUA', price: 1.5 },
    { name: 'PAELLA', price: 12 },
  ]);
});

test('classifyItem clasifica bebidas con diccionario local y resto como comida', () => {
  assert.equal(classifyItem('Cerveza doble'), 'bebida');
  assert.equal(classifyItem('Café solo'), 'bebida');
  assert.equal(classifyItem('Hamburguesa completa'), 'comida');
});
