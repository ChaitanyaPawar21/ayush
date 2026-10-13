// Run: node ledger.test.js — checks the ledger maths against the sample report in xcel/.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = {};
vm.runInNewContext(fs.readFileSync(__dirname + '/ledger.js', 'utf8'), ctx);

const rows = [
  ['2026-10-09', '2026-10-08', 'Obligation Of Derivative Market: FNO', 1231.25, 0],
  ['2026-10-08', '2026-10-07', 'Obligation Of Derivative Market: FNO', 1009.76, 0],
  ['2026-10-07', '2026-10-06', 'Obligation Of Derivative Market: FNO', 2359.77, 0],
  ['2026-10-06', '2026-10-05', 'Obligation Of Derivative Market: FNO', 4349.78, 0],
  ['2026-10-05', '2026-10-05', 'Online Fund Received Ref# 726998822786', 0, 171194.15],
  ['2026-10-05', '2026-10-01', 'Obligation Of Derivative Market: FNO', 0, 1341.83],
  ['2026-10-01', '2026-09-30', 'Obligation Of Derivative Market: FNO', 2535.98, 0],
  ['2026-09-30', '2026-09-30', 'Online Fund Received Ref# 327264922736', 0, 29900],
  ['2026-09-23', '2026-09-23', 'Online Fund Received Ref# 577934312666', 0, 100],
  ['2026-09-05', '2026-09-05', 'MONTHLY SETTLEMENT(A/c Settoff)', 7.86, 0],
  ['2026-07-28', '2026-07-27', 'Obligation Of Settlement: 2026139(NORMAL T+1)', 0.24, 0],
  ['2026-07-21', '2026-07-20', 'Obligation Of Settlement: 2026134(NORMAL T+1)', 1.9, 0],
  ['2026-07-20', '2026-07-20', 'Online Fund Received Ref# 261767662016', 0, 10],
  ['2026-04-13', '2026-04-13', 'NEFT - FDRL0007778', 2082.08, 0],
  ['2026-04-13', '2026-04-10', 'Obligation Of Derivative Market: MCX/COM', 17.92, 0],
  ['2026-04-10', '2026-04-10', 'Online Fund Received Ref# 373753991006', 0, 2100],
  ['2026-03-31', '2026-03-31', 'Op. Balance', 13493.4, 0],
  ['2026-03-31', '2026-03-31', 'Op. Balance', 54.02, 0],
  ['2026-03-31', '2026-03-31', 'Op. Balance', 0, 13547.42],
  ['2026-03-31', '2026-03-31', 'Op. Balance', 0, 0],
].map(([f, t, n, d, c]) => ({ 'Financial Date': f, 'Trade Date': t, Narration: n, Debit: d, Credit: c }));

const s = ctx.analyzeLedger(rows);
assert.strictEqual(s.opening, 0);
assert.strictEqual(s.added, 203304.15);
assert.strictEqual(s.withdrawn, 2089.94);
assert.strictEqual(s.trading, -10164.77);
assert.strictEqual(s.closing, 191049.44);              // matches the ledger's own Running Balance
assert.strictEqual(s.balance.at(-1).value, s.closing);
assert.strictEqual(s.asOf, '2026-10-09');
assert.strictEqual(s.pnl.length, 9);
assert.strictEqual(s.greenDays, 1);
assert.strictEqual(s.pnl.find(d => d.date === '2026-10-01').value, 1341.83);
assert.strictEqual(ctx.analyzeLedger([{ Name: 'x', Amount: 1 }]), null); // non-ledger → table only
console.log('ledger ok');
