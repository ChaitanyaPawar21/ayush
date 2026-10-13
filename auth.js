// Supabase project settings (Dashboard → Project Settings → API Keys). Publishable key only — never the service_role key.
const SUPABASE_URL = 'https://qekhyeydmzgdbbfdfhgy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_LTHR1le5b7qgj-LXK8Giwg_JfQYbMHt';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Admin emails. Keep in sync with public.is_admin() (database) and the admin-users edge function — those enforce it; this only shows/hides UI.
const ADMINS = ['ayushtawary@gmail.com', 'chaitanya.claude21@gmail.com', 'chaitanya21pawar@gmail.com'];
const isAdmin = user => ADMINS.includes((user?.email || '').toLowerCase());

// Report files are stored as "<timestamp>__<original name>"; show the original name.
const reportName = path => path.replace(/^\d+__/, '');

const fmtDate = d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// All reports, newest first.
async function listReports() {
  const { data, error } = await sb.storage.from('reports').list('', { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) throw error;
  return data.filter(f => f.id); // skip folder placeholders
}

async function downloadReport(path) {
  const { data, error } = await sb.storage.from('reports').createSignedUrl(path, 60, { download: reportName(path) });
  if (error) throw error;
  location.href = data.signedUrl;
}

// One list row: label, date, then buttons [[text, onClick], ...]. Built with textContent so file names can't inject HTML.
function reportRow(label, date, buttons) {
  const li = document.createElement('li');
  const t = document.createElement('span'); t.textContent = label;
  const d = document.createElement('span'); d.className = 'mono'; d.textContent = date;
  li.append(t, d);
  for (const [text, fn] of buttons) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ulink'; b.textContent = text;
    b.addEventListener('click', fn); li.append(b);
  }
  return li;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 5000);
}
