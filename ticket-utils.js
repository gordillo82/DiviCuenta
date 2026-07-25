'use strict';

const PRICE_REGEX = /(\d+[\.,]\d{2})\s*€?$/;

const DRINK_KEYWORDS = [
  'agua', 'cerveza', 'vino', 'refresco', 'coca cola', 'coca', 'cola', 'fanta',
  'nestea', 'zumo', 'cafe', 'té', 'te', 'cana', 'caña', 'aquarius', 'sprite',
  'tinto', 'blanco', 'vermut', 'sidra', 'red bull', 'monster',
];
const SUMMARY_LINE_REGEX = /^(total|subtotal|iva|base|importe|cambio)\b/i;

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function parseTicketLines(text) {
  return String(text || '')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(PRICE_REGEX);
      if (!match) return null;

      const price = parseFloat(match[1].replace(',', '.'));
      const name = line.slice(0, match.index).trim();

      if (!name || SUMMARY_LINE_REGEX.test(name) || Number.isNaN(price)) return null;
      return { name, price };
    })
    .filter(Boolean);
}

function classifyItem(name) {
  const normalized = normalizeText(name);
  return DRINK_KEYWORDS.some(keyword => normalized.includes(normalizeText(keyword)))
    ? 'bebida'
    : 'comida';
}

const ticketUtils = {
  parseTicketLines,
  classifyItem,
};

if (typeof window !== 'undefined') {
  window.TicketUtils = ticketUtils;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ticketUtils;
}
