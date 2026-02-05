export function money(cents, { prefix = '', suffix = '', decimals = 2 } = {}) {
  const dec = Number.isFinite(decimals) ? decimals : 2;
  const value = (Number(cents || 0) / Math.pow(10, dec)).toFixed(dec);
  const spacedSuffix = suffix ? ` ${suffix}` : '';
  return `${prefix}${value}${spacedSuffix}`;
}
