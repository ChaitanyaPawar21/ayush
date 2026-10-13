// Summary view for broker ledger reports (columns: Financial Date, Trade Date, Narration, Debit, Credit).
// Any other spreadsheet returns null and the dashboard just shows the table.
// Needs auth.js (fmtDate) and, for Excel serial dates, SheetJS (XLSX).

const isOpening = r => /^Op\.?\s*Balance/i.test(r.Narration ?? '');
const num = v => +String(v ?? 0).replace(/,/g, '') || 0;
const r2 = n => Math.round(n * 100) / 100;

function isoDate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`; }
  return String(v ?? '').trim().slice(0, 10); // ponytail: expects YYYY-MM-DD text; other text formats fall back to the table view
}

function analyzeLedger(rows) {
  if (!rows.length || !['Financial Date', 'Narration', 'Debit', 'Credit'].every(k => k in rows[0])) return null;
  // File is newest-first; reversing before the (stable) sort keeps same-day entries in booking order.
  const tx = rows.filter(r => !isOpening(r)).map(r => ({
    date: isoDate(r['Financial Date']),
    trade: isoDate(r['Trade Date'] || r['Financial Date']),
    amt: num(r.Credit) - num(r.Debit),
    trading: /Obligation/i.test(r.Narration ?? ''),
  })).reverse().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  if (!tx.length || tx.some(t => !/^\d{4}-\d\d-\d\d$/.test(t.date) || !/^\d{4}-\d\d-\d\d$/.test(t.trade))) return null;

  const opening = r2(rows.filter(isOpening).reduce((s, r) => s + num(r.Credit) - num(r.Debit), 0));
  const total = f => r2(tx.filter(f).reduce((s, t) => s + t.amt, 0));
  const added = total(t => !t.trading && t.amt > 0);
  const withdrawn = -total(t => !t.trading && t.amt < 0);
  const trading = total(t => t.trading);

  let bal = opening;
  const balance = []; // end-of-day balance
  for (const t of tx) {
    bal += t.amt;
    if (balance.at(-1)?.date === t.date) balance.at(-1).value = r2(bal); else balance.push({ date: t.date, value: r2(bal) });
  }
  const byDay = {};
  for (const t of tx) if (t.trading) byDay[t.trade] = (byDay[t.trade] || 0) + t.amt;
  const pnl = Object.keys(byDay).sort().map(date => ({ date, value: r2(byDay[date]) }));

  return {
    opening, added, withdrawn, trading,
    closing: r2(opening + added - withdrawn + trading),
    asOf: tx.at(-1).date,
    balance, pnl,
    greenDays: pnl.filter(d => d.value > 0).length,
  };
}

const inr = (n, dp = 0) => (n < 0 ? '−' : '') + '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const inrAxis = n => n >= 1e5 ? '₹' + +(n / 1e5).toFixed(1) + 'L' : n >= 1e3 ? '₹' + +(n / 1e3).toFixed(1) + 'k' : '₹' + n;
const shortDate = d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const niceMax = v => { const p = 10 ** Math.floor(Math.log10(v || 1)); return [1, 2, 2.5, 5, 10].find(m => m * p >= v) * p; };

// Chart frame shared by both charts (SVG user units; the SVG scales to its container).
const W = 800, H = 220, L = 56, R = 16, T = 16, B = 34;

// Bar with 4px rounded corners on the end away from the zero line.
function barPath(x, w, y0, y) {
  const r = Math.min(4, w / 2, Math.abs(y - y0)), s = y < y0 ? 1 : -1;
  return `M${x},${y0}V${y + s * r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + s * r}V${y0}Z`;
}

function tipAt(fig, svg, x, y, html) {
  const tip = fig.querySelector('.led__tip'), b = svg.getBoundingClientRect(), k = b.width / W;
  tip.replaceChildren(...html.map(([cls, text]) => Object.assign(document.createElement('span'), { className: cls, textContent: text })));
  tip.hidden = false;
  tip.style.left = Math.min(Math.max(x * k, 70), b.width - 70) + 'px';
  tip.style.top = y * k + 'px';
}

function balanceChart(fig, pts) {
  const t0 = +new Date(pts[0].date), t1 = +new Date(pts.at(-1).date) || t0 + 1;
  const max = niceMax(Math.max(...pts.map(p => p.value), 1)), min = Math.min(0, ...pts.map(p => p.value));
  const x = d => L + (W - L - R) * ((+new Date(d) - t0) / (t1 - t0 || 1));
  const y = v => T + (H - T - B) * (1 - (v - min) / (max - min));
  // Step line: the balance holds until the next booking.
  const line = pts.map((p, i) => (i ? `H${x(p.date)}V${y(p.value)}` : `M${x(p.date)},${y(p.value)}`)).join('');
  const ticks = [0, max / 2, max];
  const xt = pts.length > 1 ? [pts[0], pts.at(-1)] : [pts[0]];
  fig.querySelector('.led__plot').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Account balance over time, from ${inr(pts[0].value)} to ${inr(pts.at(-1).value)}">
    <defs><linearGradient id="led-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ece8e1" stop-opacity=".16"/><stop offset="1" stop-color="#ece8e1" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map(v => `<line class="led__grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="led__ax" x="${L - 10}" y="${y(v) + 4}" text-anchor="end">${inrAxis(v)}</text>`).join('')}
    ${xt.map((p, i) => `<text class="led__ax" x="${x(p.date)}" y="${H - 10}" text-anchor="${i ? 'end' : 'start'}">${shortDate(p.date)}</text>`).join('')}
    <path d="${line}V${y(min)}H${x(pts[0].date)}Z" fill="url(#led-area)"/>
    <path class="led__line" d="${line}"/>
    <line class="led__cross" y1="${T}" y2="${H - B}" hidden/><circle class="led__dot" r="5" hidden/>
    <rect class="led__hit" x="${L}" y="0" width="${W - L - R}" height="${H}"/>
  </svg><div class="led__tip" hidden></div>`;
  const svg = fig.querySelector('svg'), cross = svg.querySelector('.led__cross'), dot = svg.querySelector('.led__dot');
  const hit = svg.querySelector('.led__hit');
  hit.addEventListener('pointermove', e => {
    const b = svg.getBoundingClientRect(), mx = (e.clientX - b.left) * W / b.width;
    const p = pts.reduce((a, c) => Math.abs(x(c.date) - mx) < Math.abs(x(a.date) - mx) ? c : a);
    cross.setAttribute('x1', x(p.date)); cross.setAttribute('x2', x(p.date)); cross.hidden = false;
    dot.setAttribute('cx', x(p.date)); dot.setAttribute('cy', y(p.value)); dot.hidden = false;
    tipAt(fig, svg, x(p.date), y(p.value), [['mono', fmtDate(p.date)], ['v', inr(p.value, 2)]]);
  });
  hit.addEventListener('pointerleave', () => { cross.hidden = dot.hidden = fig.querySelector('.led__tip').hidden = true; });
}

function pnlChart(fig, days) {
  const ext = niceMax(Math.max(...days.map(d => Math.abs(d.value)), 1));
  const lo = days.some(d => d.value < 0) ? -ext : 0, hi = days.some(d => d.value > 0) ? ext : 0;
  // 15% headroom so the best/worst value labels clear the outer grid lines.
  const y = v => T + (H - T - B) * (1 - (v - lo * 1.15) / (((hi - lo) * 1.15) || 1));
  const slot = (W - L - R) / days.length, w = Math.min(44, slot * .6);
  const cx = i => L + slot * i + slot / 2;
  const best = days.reduce((a, c) => c.value > a.value ? c : a), worst = days.reduce((a, c) => c.value < a.value ? c : a);
  const label = (d, i) => (d === best && d.value > 0) || (d === worst && d.value < 0)
    ? `<text class="led__val" x="${cx(i)}" y="${d.value > 0 ? y(d.value) - 8 : y(d.value) + 16}" text-anchor="middle">${inr(d.value)}</text>` : '';
  const ticks = [...new Set([lo, 0, hi])];
  fig.querySelector('.led__plot').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Trading profit or loss per day; ${days.filter(d => d.value > 0).length} of ${days.length} days profitable">
    ${ticks.map(v => `<line class="${v ? 'led__grid' : 'led__zero'}" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="led__ax" x="${L - 10}" y="${y(v) + 4}" text-anchor="end">${v < 0 ? '−' + inrAxis(-v) : inrAxis(v)}</text>`).join('')}
    ${days.map((d, i) => `<path class="${d.value >= 0 ? 'led__gain' : 'led__loss'}" d="${barPath(cx(i) - w / 2, w, y(0), y(d.value))}"/>
      <text class="led__ax" x="${cx(i)}" y="${H - 10}" text-anchor="middle">${shortDate(d.date)}</text>${label(d, i)}
      <rect class="led__hit" data-i="${i}" x="${cx(i) - slot / 2}" y="0" width="${slot}" height="${H - B}"/>`).join('')}
  </svg><div class="led__tip" hidden></div>`;
  const svg = fig.querySelector('svg');
  svg.querySelectorAll('.led__hit').forEach(h => {
    const i = +h.dataset.i, d = days[i];
    h.addEventListener('pointerenter', () => tipAt(fig, svg, cx(i), Math.min(y(d.value), y(0)), [['mono', 'Trade date ' + fmtDate(d.date)], ['v', (d.value > 0 ? '+' : '') + inr(d.value, 2)]]));
    h.addEventListener('pointerleave', () => { fig.querySelector('.led__tip').hidden = true; });
  });
}

// Fills `el` and returns true for a ledger; returns false (el untouched) for anything else.
function renderLedger(el, rows) {
  const s = analyzeLedger(rows);
  if (!s) return false;
  const capital = s.opening + s.added - s.withdrawn;
  const pct = capital > 0 ? `${s.trading > 0 ? '+' : s.trading < 0 ? '−' : ''}${Math.abs(s.trading / capital * 100).toFixed(1)}% of capital` : '';
  const big = inr(s.closing, 2).split('.');
  const bridge = [
    s.opening && `Opening ${inr(s.opening)}`,
    `${inr(s.added)} added`,
    s.withdrawn && `− ${inr(s.withdrawn)} withdrawn`,
    `${s.trading < 0 ? '−' : '+'} ${inr(Math.abs(s.trading))} trading`,
    `= ${inr(s.closing)}`,
  ].filter(Boolean).join('  ');
  el.innerHTML = `
    <div class="led__top"><div class="led__hero">
      <p class="mono">Account balance · as of ${fmtDate(s.asOf)}</p>
      <p class="led__big">${big[0]}<span>.${big[1]}</span></p>
      <p class="led__bridge mono">${bridge}</p>
    </div>
    <dl class="led__kpis">
      <div><dt class="mono">Capital added</dt><dd>${inr(s.added)}</dd></div>
      <div><dt class="mono">Withdrawn</dt><dd>${inr(s.withdrawn)}</dd></div>
      <div><dt class="mono">Trading P&amp;L</dt><dd><i class="${s.trading < 0 ? 'led__loss' : 'led__gain'}" aria-hidden="true">${s.trading < 0 ? '▼' : '▲'}</i>${s.trading > 0 ? '+' : ''}${inr(s.trading)}</dd><p class="mono">${pct}</p></div>
      <div><dt class="mono">Profitable days</dt><dd>${s.greenDays} <small>of ${s.pnl.length}</small></dd></div>
    </dl></div>
    <div class="led__charts">
      <figure class="led__fig" id="led-bal"><figcaption class="mono">Account balance</figcaption><div class="led__plot"></div></figure>
      ${s.pnl.length ? `<figure class="led__fig" id="led-pnl"><figcaption class="mono">Trading P&amp;L by day
        <span class="led__key"><i class="led__gain"></i>Gain</span><span class="led__key"><i class="led__loss"></i>Loss</span></figcaption><div class="led__plot"></div></figure>` : ''}
    </div>`;
  balanceChart(el.querySelector('#led-bal'), s.balance);
  if (s.pnl.length) pnlChart(el.querySelector('#led-pnl'), s.pnl);
  return true;
}
