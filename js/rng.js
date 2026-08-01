// rng.js — 确定性随机数（mulberry32 + Box-Muller），浏览器/Node 双端
// 与 Python 侧 numpy default_rng 无语义对应（分布对等、非逐值对等）；
// 同一被试 id 哈希种子 → 同一排程（断点续做安全）。

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 字符串 → 32 位哈希（FNV-1a）
function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

class RNG {
  constructor(seed) {
    this.uniform = mulberry32(typeof seed === "string" ? hashSeed(seed) : seed);
    this._spare = null;
  }
  random() { return this.uniform(); }
  // 标准正态（Box-Muller，带缓存）
  normal() {
    if (this._spare !== null) { const v = this._spare; this._spare = null; return v; }
    let u = 0, v = 0;
    while (u === 0) u = this.uniform();
    v = this.uniform();
    const r = Math.sqrt(-2.0 * Math.log(u)), th = 2.0 * Math.PI * v;
    this._spare = r * Math.sin(th);
    return r * Math.cos(th);
  }
  // [0, n) 整数
  int(n) { return Math.floor(this.uniform() * n); }
  // Fisher-Yates 洗牌（就地）
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  // 无放回抽 k 个（返回新数组）
  sample(arr, k) {
    const cp = arr.slice();
    this.shuffle(cp);
    return cp.slice(0, k);
  }
  // Bernoulli(q)
  bernoulli(q) { return this.uniform() < q; }
}

if (typeof module !== "undefined") module.exports = { RNG, mulberry32, hashSeed };
