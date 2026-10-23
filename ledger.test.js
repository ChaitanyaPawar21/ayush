// Run: node ledger.test.js — checks the ledger maths against the sample reports in xcel/.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = {};
vm.runInNewContext(fs.readFileSync(__dirname + '/ledger.js', 'utf8'), ctx);

// Old broker format (newest-first, opening balance rows).
const old = [
  ['2026-10-09', 'Obligation Of Derivative Market: FNO', 1231.25, 0],
  ['2026-10-05', 'Online Fund Received Ref# 726998822786', 0, 171194.15],
  ['2026-10-05', 'Obligation Of Derivative Market: FNO', 0, 1341.83],
  ['2026-04-13', 'NEFT - FDRL0007778', 2082.08, 0],
  ['2026-03-31', 'Op. Balance', 13493.4, 0],
  ['2026-03-31', 'Op. Balance', 0, 13547.42],
].map(([f, n, d, c]) => ({ 'Financial Date': f, 'Trade Date': f, Narration: n, Debit: d, Credit: c }));
const o = ctx.analyzeLedger(ctx.txRows(old));
assert.strictEqual(o.capital, 200000);                 // fixed investment; cash rows don't change it
assert.strictEqual(o.total, 110.58);
assert.strictEqual(o.fund, 200110.58);
assert.strictEqual(ctx.txRows([{ Name: 'x', Amount: 1 }]), null); // non-ledger → table only

// New broker format, condensed from the Sep 2026 ledger in xcel/ (Bill + JV = P&L after charges).
const row = (d, t, dr, cr) => ({ Voucherdate: d, Type: t, Segment: 'NSE_FNO', Narration: t, Debited_amount: dr, Credited_amount: cr });
const sep = [
  row('2026-09-01', 'Receipt', 0, 145000), row('2026-09-01', 'Bill', 4960.42, 0), row('2026-09-02', 'Bill', 0, 22386.98),
  row('2026-09-09', 'Payment', 40000, 0), row('2026-09-16', 'JV', 59, 0), row('2026-09-30', 'JV', 354, 0),
];
const oct = [row('2026-10-13', 'Receipt', 0, 50000), row('2026-10-14', 'Bill', 1696.19, 0)];
// Re-export of Sep 30 uploaded later replaces that day instead of adding to it.
const sep30 = [row('2026-09-30', 'JV', 354, 0)];
const s = ctx.analyzeLedger(ctx.mergeLedgers([sep, oct, sep30].map(ctx.txRows)));
assert.strictEqual(s.capital, 200000);
assert.strictEqual(s.total, 15317.37);                  // 17426.56 trading − 413 charges − 1696.19
assert.strictEqual(s.fund, 215317.37);
assert.strictEqual(s.today.date, '2026-10-14');
assert.strictEqual(s.today.pnl, -1696.19);
assert.strictEqual(s.month.value, -1696.19);
assert.strictEqual(s.months.map(m => m.value).join(), "17013.56,-1696.19");
assert.strictEqual(s.months[0].pct.toFixed(2), '8.51'); // of 2,00,000 invested
// A Bill-only daily ledger adds just that day's trading on top.
const day = ctx.analyzeLedger(ctx.mergeLedgers([sep, oct, [row('2026-10-19', 'Bill', 0, 1260.02)]].map(ctx.txRows)));
assert.strictEqual(day.fund, 216577.39);
assert.strictEqual(day.today.date, '2026-10-19');
assert.strictEqual(s.days.length, 5);
assert.strictEqual(s.days.at(-1).cum, s.total);
assert.strictEqual(s.growth.at(-1).value, s.fund);
console.log('ledger ok');
