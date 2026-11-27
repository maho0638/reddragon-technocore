export const MINERS = Object.freeze([
  Object.freeze({ id: 'm2', miner: '5GdiJAZLRpB4Ps3N8XsXCALwLgyrsSb5beV9xuZQsKevZmA3', endpoint: 'https://m2.138-201-203-184.sslip.io', model: 'qwen/qwen3-8b' }),
  Object.freeze({ id: 'm6', miner: '5GRfksJMFfh6SmpWVY42BczDgbp1aFP2FifcyhMy5W4SVZLb', endpoint: 'https://m6.138-201-203-184.sslip.io', model: 'qwen/qwen3-8b' }),
  Object.freeze({ id: 'm7', miner: '5FhWcieMmxQTPShrMwvirtjgDzYL8KSYg9bfimcgZG17RPkp', endpoint: 'https://m7.138-201-203-184.sslip.io', model: 'qwen/qwen3-8b' }),
  Object.freeze({ id: 'm16', miner: '5GHMyjJepG8u31p5GfMTV4sTLtixSFuoRCuPF9XNzeyVtQ1m', endpoint: 'https://m16.138-201-203-184.sslip.io', model: 'qwen/qwen3-8b' }),
  Object.freeze({ id: 'm4', miner: '5DnQ7rKgG5GBEVcsMArsRWet2e87fWpk6SqjxFzkCKFKqzr7', endpoint: 'https://m4.138-201-203-184.sslip.io', model: 'qwen/qwen3-1.7b' }),
  Object.freeze({ id: 'm5', miner: '5DA5TttecqBwGuC5Pg3A8q4t75WUpBWG3YA8SxcZnPG2phGQ', endpoint: 'https://m5.138-201-203-184.sslip.io', model: 'qwen/qwen3-1.7b' }),
  Object.freeze({ id: 'm8', miner: '5E4oVh671nX3nNrETJgFE7ducwJGrMwtApjwCxxpVxFmYz4e', endpoint: 'https://m8.138-201-203-184.sslip.io', model: 'qwen/qwen3-1.7b' }),
  Object.freeze({ id: 'm9', miner: '5HEcct9aVtd6yY5WXH5QGYhaziKJJxFqTYe74d8Hg9ngUJih', endpoint: 'https://m9.138-201-203-184.sslip.io', model: 'qwen/qwen3-1.7b' }),
  Object.freeze({ id: 'm11', miner: '5CXoZ2p3igZqQgTnTV4WGZ6raVqqEkoD8W94AfuRpeLPjMmY', endpoint: 'https://m11.138-201-203-184.sslip.io', model: 'qwen/qwen3-1.7b' }),
  Object.freeze({ id: 'm12', miner: '5EXEoYuofvyav88PC1GY9oSWk3jpyQSSze3zvsQznz5Xc9No', endpoint: 'https://m12.138-201-203-184.sslip.io', model: 'qwen/qwen3-1.7b' }),
  Object.freeze({ id: 'm13', miner: '5FHGhPxN2nKtEK4JWSq51wapY8gCpk8Gu6VthHXSEtnvdfLv', endpoint: 'https://m13.138-201-203-184.sslip.io', model: 'qwen/qwen3-1.7b' }),
  Object.freeze({ id: 'm14', miner: '5FEQkKrDWbr6hXbYDgotTC8UafT1h2ahb3EjK1tNgnLox4ki', endpoint: 'https://m14.138-201-203-184.sslip.io', model: 'qwen/qwen3-1.7b' }),
]);

export function selectMiner(candidates) {
  const eligible = candidates.filter(candidate => candidate.verified && candidate.budgetOk &&
    candidate.paidChannel && typeof candidate.total === 'bigint');
  eligible.sort((a, b) => a.total === b.total ? a.id.localeCompare(b.id) : a.total < b.total ? -1 : 1);
  return eligible[0];
}
