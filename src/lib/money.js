'use strict';
 
 function formatMoney(cents, coin, coinsMap = {}) {
   const cfg = coinsMap[coin] || {};
   const prefix = cfg.prefix || '';
   const suffix = cfg.suffix || '';
   const decimals = Number.isFinite(cfg.decimals) ? cfg.decimals : 2;
   const amount = Number(cents || 0) / Math.pow(10, decimals);
   const value = amount.toFixed(decimals);
   const spacedSuffix = suffix ? ` ${suffix}` : '';
   return `${prefix}${value}${spacedSuffix}`;
 }
 
 module.exports = {
   formatMoney,
 };
