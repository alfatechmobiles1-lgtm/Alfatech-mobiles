/* Small QR encoder: byte mode, error correction M, versions 1-10. Returns an array of rows of 0/1. */
function qrMatrix(text){
  const data = Array.from(new TextEncoder().encode(text));
  // [ec codewords per block, blocks in group 1, data per block, blocks in group 2, data per block]
  const T = [null,[10,1,16,0,0],[16,1,28,0,0],[26,1,44,0,0],[18,2,32,0,0],[24,2,43,0,0],[16,4,27,0,0],[18,4,31,0,0],[22,2,38,2,39],[22,3,36,2,37],[26,4,43,1,44]];
  const AL = [null,[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];
  let v = 1;
  for (; v <= 10; v++) { const t = T[v]; if (4 + (v < 10 ? 8 : 16) + 8 * data.length <= 8 * (t[1]*t[2] + t[3]*t[4])) break; }
  if (v > 10) throw new Error('too long');
  const [ecn, n1, d1, n2, d2] = T[v], cap = n1*d1 + n2*d2, n = 17 + 4 * v;

  // bits
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(data.length, v < 10 ? 8 : 16); data.forEach(b => put(b, 8));
  for (let i = 0; i < 4 && bits.length < cap * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const cw = []; for (let i = 0; i < bits.length; i += 8) { let x = 0; for (let j = 0; j < 8; j++) x = (x << 1) | bits[i + j]; cw.push(x); }
  for (let p = 0; cw.length < cap; p ^= 1) cw.push(p ? 0x11 : 0xEC);

  // Reed-Solomon
  const EXP = new Array(512), LOG = new Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11D; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => a && b ? EXP[LOG[a] + LOG[b]] : 0;
  let gen = [1];
  for (let i = 0; i < ecn; i++) { const g = new Array(gen.length + 1).fill(0); gen.forEach((c, j) => { g[j] ^= c; g[j + 1] ^= mul(c, EXP[i]); }); gen = g; }
  const rs = blk => { const r = blk.concat(new Array(ecn).fill(0)); for (let i = 0; i < blk.length; i++) { const f = r[i]; if (f) for (let j = 0; j < gen.length; j++) r[i + j] ^= mul(gen[j], f); } return r.slice(blk.length); };
  const blocks = []; let pos = 0;
  for (let i = 0; i < n1 + n2; i++) { const len = i < n1 ? d1 : d2; blocks.push(cw.slice(pos, pos + len)); pos += len; }
  const ecs = blocks.map(rs), out = [];
  for (let i = 0; i < Math.max(d1, d2); i++) blocks.forEach(b => { if (i < b.length) out.push(b[i]); });
  for (let i = 0; i < ecn; i++) ecs.forEach(e => out.push(e[i]));

  // matrix
  const M = Array.from({ length: n }, () => new Array(n).fill(null));
  const finder = (r, c) => { for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) { const y = r + i, x = c + j; if (y < 0 || x < 0 || y >= n || x >= n) continue; M[y][x] = (i >= 0 && i <= 6 && (j === 0 || j === 6) || j >= 0 && j <= 6 && (i === 0 || i === 6) || i >= 2 && i <= 4 && j >= 2 && j <= 4) ? 1 : 0; } };
  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
  const ap = AL[v];
  ap.forEach(r => ap.forEach(c => { if (M[r][c] !== null && !(r === 6 || c === 6) || (r < 8 && c < 8) || (r < 8 && c > n - 9) || (r > n - 9 && c < 8)) return; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) M[r + i][c + j] = Math.max(Math.abs(i), Math.abs(j)) !== 1 ? 1 : 0; }));
  for (let i = 8; i < n - 8; i++) { if (M[6][i] === null) M[6][i] = i % 2 === 0 ? 1 : 0; if (M[i][6] === null) M[i][6] = i % 2 === 0 ? 1 : 0; }
  M[n - 8][8] = 1;
  const reserved = M.map(r => r.map(x => x !== null));
  for (let i = 0; i < 9; i++) { reserved[8][i] = reserved[i][8] = true; }
  for (let i = 0; i < 8; i++) { reserved[8][n - 1 - i] = true; reserved[n - 1 - i][8] = true; }
  if (v >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { reserved[i][n - 11 + j] = true; reserved[n - 11 + j][i] = true; }

  // data placement
  const dbits = []; out.forEach(b => put2(b)); function put2(b){ for (let i = 7; i >= 0; i--) dbits.push((b >> i) & 1); }
  const place = mask => {
    const G = M.map(r => r.slice()); let k = 0, up = true;
    for (let c = n - 1; c > 0; c -= 2) {
      if (c === 6) c--;
      for (let t = 0; t < n; t++) { const r = up ? n - 1 - t : t;
        for (let d = 0; d < 2; d++) { const x = c - d; if (reserved[r][x]) continue;
          let bit = k < dbits.length ? dbits[k] : 0; k++;
          const m = [(r + x) % 2 === 0, r % 2 === 0, x % 3 === 0, (r + x) % 3 === 0, (Math.floor(r / 2) + Math.floor(x / 3)) % 2 === 0, (r * x) % 2 + (r * x) % 3 === 0, ((r * x) % 2 + (r * x) % 3) % 2 === 0, ((r + x) % 2 + (r * x) % 3) % 2 === 0][mask];
          G[r][x] = bit ^ (m ? 1 : 0); } }
      up = !up;
    }
    // format info (EC level M = 00)
    let f = mask; let rem = f; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537); const fmt = ((f << 10) | (rem & 0x3FF)) ^ 0x5412;
    for (let i = 0; i < 15; i++) { const b = (fmt >> i) & 1;
      if (i < 6) G[i][8] = b; else if (i < 8) G[i + 1][8] = b; else G[n - 15 + i][8] = b;
      if (i < 8) G[8][n - 1 - i] = b; else if (i < 9) G[8][15 - i] = b; else G[8][14 - i] = b; }
    G[n - 8][8] = 1;
    if (v >= 7) { let r2 = v; for (let i = 0; i < 12; i++) r2 = (r2 << 1) ^ ((r2 >>> 11) * 0x1F25); const vi = (v << 12) | (r2 & 0xFFF);
      for (let i = 0; i < 18; i++) { const b = (vi >> i) & 1, a = Math.floor(i / 3), c = i % 3 + n - 11; G[a][c] = b; G[c][a] = b; } }
    return G;
  };
  const score = G => { let s = 0;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) { let run = 1;
      for (let j = 1; j < n; j++) { const a = pass ? G[j][i] : G[i][j], b = pass ? G[j - 1][i] : G[i][j - 1]; if (a === b) { run++; if (j === n - 1 && run >= 5) s += run - 2; } else { if (run >= 5) s += run - 2; run = 1; } } }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) { const c = G[i][j]; if (c === G[i][j + 1] && c === G[i + 1][j] && c === G[i + 1][j + 1]) s += 3; }
    const pat = [1,0,1,1,1,0,1,0,0,0,0], rp = pat.slice().reverse();
    const hit = (get) => { for (let i = 0; i < n; i++) for (let j = 0; j <= n - 11; j++) { let a = true, b = true; for (let k = 0; k < 11; k++) { const x = get(i, j + k); if (x !== pat[k]) a = false; if (x !== rp[k]) b = false; if (!a && !b) break; } if (a) s += 40; if (b) s += 40; } };
    hit((i, j) => G[i][j]); hit((i, j) => G[j][i]);
    let dark = 0; G.forEach(r => r.forEach(x => dark += x)); s += Math.floor(Math.abs(dark * 100 / (n * n) - 50) / 5) * 10; return s; };
  let best = null, bs = 1e9;
  for (let m = 0; m < 8; m++) { const G = place(m), sc = score(G); if (sc < bs) { bs = sc; best = G; } }
  return best;
}
if (typeof module !== 'undefined') module.exports = qrMatrix;
