// Summary view for broker ledger reports. Two export formats are recognised:
//   Financial Date, Trade Date, Narration, Debit, Credit   and   Voucherdate, Type, Narration, Debited_amount, Credited_amount.
// All uploaded ledgers merge into one investor view; any other spreadsheet is only shown as a table.
// Needs auth.js (fmtDate) and, for Excel serial dates, SheetJS (XLSX).

const num = v => +String(v ?? 0).replace(/,/g, '') || 0;
const r2 = n => Math.round(n * 100) / 100;

function isoDate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`; }
  return String(v ?? '').trim().slice(0, 10); // ponytail: expects YYYY-MM-DD text; other text formats fall back to the table view
}

// One file → [{ date, amt, kind }] in booking order. kind 'pnl' = trading result or broker charges, 'cash' = money in/out
// (opening balance included). Returns null for anything that isn't one of the two broker ledger formats.
function txRows(rows) {
  const has = cols => rows.length && cols.every(k => k in rows[0]);
  let tx = null;
  if (has(['Financial Date', 'Narration', 'Debit', 'Credit'])) {
    // File is newest-first. ponytail: P&L is dated by booking date, not Trade Date, so each day's P&L and fund value line up.
    tx = rows.map(r => ({
      date: isoDate(r['Financial Date']),
      amt: num(r.Credit) - num(r.Debit),
      kind: /Obligation/i.test(r.Narration ?? '') ? 'pnl' : 'cash',
    })).reverse();
  } else if (has(['Voucherdate', 'Type', 'Debited_amount', 'Credited_amount'])) {
    // Oldest-first. Bill = day's trading P&L, JV = broker charges + GST, Receipt/Payment = funds in/out.
    tx = rows.map(r => ({
      date: isoDate(r.Voucherdate),
      amt: num(r.Credited_amount) - num(r.Debited_amount),
      kind: r.Type === 'Bill' || r.Type === 'JV' ? 'pnl' : 'cash',
    }));
  }
  if (!tx?.length || tx.some(t => !/^\d{4}-\d\d-\d\d$/.test(t.date))) return null;
  return tx;
}

// One timeline from several ledgers, passed oldest upload first. Each date comes from the newest upload that has it,
// so a re-exported or overlapping ledger is never double-counted.
function mergeLedgers(list) {
  const byDate = {};
  for (const tx of list) Object.assign(byDate, Object.groupBy(tx, t => t.date));
  return Object.keys(byDate).sort().flatMap(d => byDate[d]);
}

// Capital = net money invested (in − out); fund value = capital + cumulative P&L, i.e. the ledger balance.
// Returns are P&L as a % of capital invested at that point.
function analyzeLedger(tx) {
  if (!tx.length) return null;
  const days = [];
  let capital = 0, cum = 0;
  for (const t of tx) {
    if (days.at(-1)?.date !== t.date) days.push({ date: t.date, pnl: 0, traded: false });
    const d = days.at(-1);
    if (t.kind === 'cash') capital += t.amt; else { d.pnl += t.amt; cum += t.amt; d.traded = true; }
    d.capital = capital; d.cum = cum;
  }
  const pct = (v, base) => base > 0 ? v / base * 100 : null;
  for (const d of days) Object.assign(d, { pnl: r2(d.pnl), cum: r2(d.cum), capital: r2(d.capital), fund: r2(d.capital + d.cum), pct: pct(d.pnl, d.capital) });
  const traded = days.filter(d => d.traded);
  const months = Object.entries(Object.groupBy(traded, d => d.date.slice(0, 7))).map(([m, ds]) => {
    const value = r2(ds.reduce((s, d) => s + d.pnl, 0));
    return { date: m + '-01', value, pct: pct(value, ds.at(-1).capital) };
  });
  const last = days.at(-1);
  return {
    capital: last.capital, fund: last.fund, total: last.cum, totalPct: pct(last.cum, last.capital),
    today: traded.at(-1) ?? null, month: months.at(-1) ?? null,
    months, days: traded, growth: days.map(d => ({ date: d.date, value: d.fund })), asOf: last.date,
  };
}

const inr = (n, dp = 0) => (n < 0 ? '−' : '') + '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const inrAxis = n => n >= 1e5 ? '₹' + +(n / 1e5).toFixed(1) + 'L' : n >= 1e3 ? '₹' + +(n / 1e3).toFixed(1) + 'k' : '₹' + n;
const shortDate = d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const fmtDateTime = d => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const monthName = (d, month = 'long') => new Date(d).toLocaleDateString('en-IN', { month, year: 'numeric' });
const signed = (n, dp = 0) => (n > 0 ? '+' : '') + inr(n, dp);
const pctTxt = p => p == null ? '—' : (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p).toFixed(2) + '%';
const tone = n => n < 0 ? 'led__loss' : 'led__gain';
const arrow = n => n ? `<i class="${tone(n)}" aria-hidden="true">${n < 0 ? '▼' : '▲'}</i>` : '';
const niceMax = v => { const p = 10 ** Math.floor(Math.log10(v || 1)); return [1, 2, 2.5, 5, 10].find(m => m * p >= v) * p; };

// Chart frame shared by both charts (SVG user units; the SVG scales to its container).
const W = 800, H = 220, L = 56, R = 16, T = 16, B = 34;

// Bar with 4px rounded corners on the end away from the zero line.
function barPath(x, w, y0, y) {
  const r = Math.min(4, w / 2, Math.abs(y - y0)), s = y < y0 ? 1 : -1;
  return `M${x},${y0}V${y + s * r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + s * r}V${y0}Z`;
}

function tipAt(fig, svg, x, y, html) {
  const tip = fig.querySelector('.led__tip'), b = svg.getBoundingClientRect(), k = b.width / svg.viewBox.baseVal.width;
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
  fig.querySelector('.led__plot').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Fund value over time, from ${inr(pts[0].value)} to ${inr(pts.at(-1).value)}">
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

// Bars for items [{ date, value, pct }]; label(date) names each bar on the axis and in the tooltip.
function pnlChart(fig, days, label) {
  const W = Math.max(800, Math.round(fig.querySelector('.led__plot').clientWidth)); // full-width chart: 1 unit = 1px so text isn't blown up
  const ext = niceMax(Math.max(...days.map(d => Math.abs(d.value)), 1));
  const lo = days.some(d => d.value < 0) ? -ext : 0, hi = days.some(d => d.value > 0) ? ext : 0;
  // 15% headroom so the best/worst value labels clear the outer grid lines.
  const y = v => T + (H - T - B) * (1 - (v - lo * 1.15) / (((hi - lo) * 1.15) || 1));
  const slot = (W - L - R) / days.length, w = Math.min(44, slot * .6);
  const every = Math.ceil(days.length / 10); // at most ~10 axis labels so dates don't collide
  const cx = i => L + slot * i + slot / 2;
  const best = days.reduce((a, c) => c.value > a.value ? c : a), worst = days.reduce((a, c) => c.value < a.value ? c : a);
  const valLabel = (d, i) => (d === best && d.value > 0) || (d === worst && d.value < 0)
    ? `<text class="led__val" x="${cx(i)}" y="${d.value > 0 ? y(d.value) - 8 : y(d.value) + 16}" text-anchor="middle">${inr(d.value)}</text>` : '';
  const ticks = [...new Set([lo, 0, hi])];
  fig.querySelector('.led__plot').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Profit or loss per period; ${days.filter(d => d.value > 0).length} of ${days.length} profitable">
    ${ticks.map(v => `<line class="${v ? 'led__grid' : 'led__zero'}" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="led__ax" x="${L - 10}" y="${y(v) + 4}" text-anchor="end">${v < 0 ? '−' + inrAxis(-v) : inrAxis(v)}</text>`).join('')}
    ${days.map((d, i) => `<path class="${d.value >= 0 ? 'led__gain' : 'led__loss'}" d="${barPath(cx(i) - w / 2, w, y(0), y(d.value))}"/>
      <text class="led__ax" x="${cx(i)}" y="${H - 10}" text-anchor="middle">${i % every ? '' : label(d.date)}</text>${valLabel(d, i)}
      <rect class="led__hit" data-i="${i}" x="${cx(i) - slot / 2}" y="0" width="${slot}" height="${H - B}"/>`).join('')}
  </svg><div class="led__tip" hidden></div>`;
  const svg = fig.querySelector('svg');
  svg.querySelectorAll('.led__hit').forEach(h => {
    const i = +h.dataset.i, d = days[i];
    h.addEventListener('pointerenter', () => tipAt(fig, svg, cx(i), Math.min(y(d.value), y(0)), [['mono', label(d.date)], ['v', signed(d.value, 2) + (d.pct == null ? '' : '  ' + pctTxt(d.pct))]]));
    h.addEventListener('pointerleave', () => { fig.querySelector('.led__tip').hidden = true; });
  });
}

const kpi = (label, value, note) => `<div><dt class="mono">${label}</dt><dd>${value}</dd>${note ? `<p class="mono">${note}</p>` : ''}</div>`;

// Fills `el` with the investor view of a ledger timeline; returns false (el untouched) if there's nothing to show.
// daily: bar chart shows each day's P&L instead of each month's (for a single month's ledger).
function renderLedger(el, tx, updatedAt, daily = false) {
  const s = analyzeLedger(tx);
  if (!s) return false;
  const big = inr(s.fund, 2).split('.');
  const bars = daily ? s.days.map(d => ({ date: d.date, value: d.pnl, pct: d.pct })) : s.months;
  el.innerHTML = `
    <div class="led__top"><div class="led__hero">
      <p class="mono">Current Fund Value</p>
      <p class="led__big">${big[0]}<span>.${big[1]}</span></p>
      <p class="led__bridge mono">Last updated ${fmtDateTime(updatedAt)} · ledger to ${fmtDate(s.asOf)}</p>
    </div>
    <figure class="led__fig" id="led-bal"><figcaption class="mono">Fund Growth</figcaption><div class="led__plot"></div></figure>
    <dl class="led__kpis">
      ${kpi('Total P&amp;L', arrow(s.total) + signed(s.total), 'Since inception')}
      ${kpi('Overall Return', arrow(s.total) + pctTxt(s.totalPct), 'Of capital invested')}
      ${s.today ? kpi('Today’s P&amp;L', arrow(s.today.pnl) + signed(s.today.pnl), `${pctTxt(s.today.pct)} · ${fmtDate(s.today.date)}`) : ''}
      ${s.month ? kpi('Monthly P&amp;L', arrow(s.month.value) + signed(s.month.value), `${pctTxt(s.month.pct)} · ${monthName(s.month.date)}`) : ''}
    </dl></div>
    <div class="led__charts">
      ${bars.length ? `<figure class="led__fig" id="led-pnl"><figcaption class="mono">${daily ? 'Daily' : 'Monthly'} Performance
        <span class="led__key"><i class="led__gain"></i>Gain</span><span class="led__key"><i class="led__loss"></i>Loss</span></figcaption><div class="led__plot"></div></figure>` : ''}
    </div>
    ${s.days.length ? `<figure class="led__fig led__daily"><figcaption class="mono">Daily Performance</figcaption><div class="sheet"><table>
      <thead><tr><th>Date</th><th>Daily P&amp;L</th><th>Daily return</th><th>Cumulative P&amp;L</th><th>Fund value</th></tr></thead>
      <tbody>${s.days.toReversed().map(d => `<tr><td>${fmtDate(d.date)}</td><td class="${tone(d.pnl)}">${signed(d.pnl, 2)}</td><td class="${tone(d.pnl)}">${pctTxt(d.pct)}</td><td>${signed(d.cum, 2)}</td><td>${inr(d.fund, 2)}</td></tr>`).join('')}</tbody>
    </table></div></figure>` : ''}`;
  balanceChart(el.querySelector('#led-bal'), s.growth);
  if (bars.length) pnlChart(el.querySelector('#led-pnl'), bars, daily ? shortDate : d => monthName(d, 'short'));
  return true;
}
