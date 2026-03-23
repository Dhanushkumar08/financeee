// ─── API COMMUNICATION ──────────────────────────
const API = {
    async getDB() { const r = await fetch('/api/db', { credentials: 'include' }); if (r.status === 401) { window.location = '/login'; throw new Error('Not authenticated'); } return r.json(); },
    async post(url, data) { return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(data) }); },
    async put(url, data) { return fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(data) }); },
    async del(url) { return fetch(url, { method: 'DELETE', credentials: 'include' }); },
    async fetchAdminUsers() { const r = await fetch('/api/admin/users', { credentials: 'include' }); return r.json(); }
};

// ─── DB & STATE ──────────────────────────────────
let db = { assets: [], liabilities: [], income: [], expenses: [], goals: [], snapshots: [], bills: [], sips: [], budgets: {}, settings: {} };
let curPage = 'dashboard';
let fxRates = { INR: 1, USD: 0.012, EUR: 0.011, GBP: 0.0094, SGD: 0.016, AED: 0.044, JPY: 1.8, CAD: 0.016, AUD: 0.018 }; // Fallback rates

const ASSET_CLASSES = [
    "Equity", "Mutual Funds", "Real Estate", "Gold & Silver", "FD & RD",
    "Bonds", "Debt Funds", "EPF / PPF / NPS", "SSY", "Crypto", "International",
    "Employer Stock", "Cash & Savings", "Liquid Funds", "Arbitrage Funds",
    "Commodities", "ULIP", "Moneyback Insurance", "Endowment Plans", "Other"
];


async function loadDB() {
    // Populate user info early
    try {
        const me = await fetch('/api/auth/me?t=' + Date.now(), { credentials: 'include' });
        const data = await me.json();
        if (data.loggedIn) {
            const dn = data.displayName || data.username || 'User';
            document.querySelectorAll('.tp-name').forEach(el => el.textContent = dn);
            document.querySelectorAll('.tp-avatar').forEach(el => {
                if (data.profilePicture) {
                    el.innerHTML = `<img src="${data.profilePicture}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
                } else {
                    el.textContent = dn.charAt(0).toUpperCase();
                }
            });
            const ddn = document.getElementById('tp-dd-name');
            if (ddn) ddn.textContent = dn;
            
            // Show Admin Dropdown item if admin
            console.log("DEBUG: User logged in, isAdmin:", data.isAdmin);
            if (data.isAdmin) {
                const ddAdmin = document.getElementById('dd-admin');
                if (ddAdmin) {
                    console.log("DEBUG: Found dd-admin, showing it");
                    ddAdmin.style.display = 'block';
                } else {
                    console.log("DEBUG: dd-admin NOT found in DOM!");
                }
            }
        }
    } catch (e) { console.warn("Failed to fetch user info", e); }

    try {
        db = await API.getDB();
        renderPage(curPage);
        updateSidebar();
    } catch (e) { console.error("Failed to load DB", e); }
}

async function refresh() { await loadDB(); }

async function doLogout() {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch (e) { }
    window.location.href = '/login';
}


// ─── UTILS ───────────────────────────────
let _i = Date.now();
const uid = () => 'i' + (++_i);
function fmt(n) {
    if (n == null || isNaN(n)) return '?0';
    const base = localStorage.getItem('ft_currency_base') || 'INR';
    const sym = localStorage.getItem('ft_currency_sym') || '₹';
    const rate = fxRates[base] || 1;
    const v_base = n * rate;
    const s = v_base < 0, v = Math.abs(v_base);
    let r;
    if (v >= 1e7) r = (v / 1e7).toFixed(2) + 'Cr';
    else if (v >= 1e5) r = (v / 1e5).toFixed(2) + 'L';
    else if (v >= 1e3) r = (v / 1e3).toFixed(1) + 'K';
    else r = v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    return (s ? '-' : '') + sym + r;
}
function fmtS(n) {
    const base = localStorage.getItem('ft_currency_base') || 'INR';
    const rate = fxRates[base] || 1;
    const v_base = n * rate;
    const v = Math.abs(v_base);
    if (v >= 1e7) return (v_base < 0 ? '-' : '') + (v / 1e7).toFixed(1) + 'Cr';
    if (v >= 1e5) return (v_base < 0 ? '-' : '') + (v / 1e5).toFixed(1) + 'L';
    if (v >= 1e3) return (v_base < 0 ? '-' : '') + (v / 1e3).toFixed(0) + 'K';
    return (v_base < 0 ? '-' : '') + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
const today = () => new Date().toISOString().split('T')[0];
const thisMonth = () => new Date().toISOString().slice(0, 7);
function prevM(m) { const [y, mo] = m.split('-'); return new Date(+y, +mo - 2, 1).toISOString().slice(0, 7); }
function mLabel(m) { return new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }); }
function toast(msg, type = 'success') { const t = document.getElementById('toast'); t.textContent = msg; t.className = 'show ' + type; clearTimeout(t._t); t._t = setTimeout(() => t.className = '', 2800); }

const CC = { 'Equity': '#7c5cfc', 'Mutual Funds': '#22d3a0', 'Real Estate': '#fbbf24', 'Gold & Silver': '#fb923c', 'EPF / PPF / NPS': '#a78bfa', 'Crypto': '#f87171', 'FD & RD': '#60a5fa', 'Other': '#94a3b8' };
const CT = { 'Equity': 'te', 'Mutual Funds': 'tm', 'Real Estate': 'tr', 'Gold & Silver': 'tg', 'EPF / PPF / NPS': 'tep', 'Crypto': 'tc', 'FD & RD': 'td2', 'Other': 'to' };
const CH = {};

function dc(id) { if (CH[id]) { try { CH[id].destroy(); } catch (e) { } delete CH[id]; } }
function co() {
    const dk = document.documentElement.getAttribute('data-theme') === 'dark';
    const gc = 'rgba(144,144,176,.7)';
    const bc = dk ? 'rgba(44,44,58,.5)' : 'rgba(200,200,222,.5)';
    return { plugins: { legend: { labels: { color: gc, font: { family: 'DM Mono', size: 10 } } } }, scales: { x: { ticks: { color: gc, font: { size: 9 } }, grid: { color: bc } }, y: { ticks: { color: gc, font: { size: 9 } }, grid: { color: bc } } } };
}

// ─── CALCS ────────────────────────────────
const TA = () => db.assets.reduce((s, a) => s + (+a.value || 0), 0);
const TL = () => db.liabilities.reduce((s, l) => s + (+l.amount || 0), 0);
const NW = () => TA() - TL();
const mInc = (m = thisMonth()) => db.income.filter(i => i.date?.startsWith(m)).reduce((s, i) => s + (+i.amount || 0), 0);
const mExp = (m = thisMonth()) => db.expenses.filter(e => e.date?.startsWith(m)).reduce((s, e) => s + (+e.amount || 0), 0);
const SR = (m = thisMonth()) => { const i = mInc(m), e = mExp(m); return i ? Math.round(((i - e) / i) * 100) : 0; };
function cagr(cost, val, yrs) { return (!cost || !val || !yrs || yrs <= 0) ? null : ((Math.pow(val / cost, 1 / yrs) - 1) * 100); }

// ─── HEALTH SCORE ─────────────────────────
function healthScore() {
    const sc = [];
    const me = mExp(); const eft = (db.settings.emergencyMonths || 6) * me;
    const ea = db.assets.filter(a => a.assetClass === 'Debt/FD' || a.notes?.toLowerCase().includes('emergency')).reduce((s, a) => s + (+a.value || 0), 0);
    sc.push({ n: 'Emergency Fund', s: eft ? Math.min(100, Math.round(ea / eft * 100)) : 0 });
    const sr = Math.max(0, SR()); sc.push({ n: 'Savings Rate', s: Math.min(100, Math.round(sr * 2.5)) });
    const ai = db.settings.annualIncome || 0, tc = db.settings.termInsurance || 0;
    sc.push({ n: 'Term Insurance', s: ai ? Math.min(100, Math.round(tc / (ai * 10) * 100)) : 0 });
    const dr = TA() ? TL() / TA() : 0; sc.push({ n: 'Debt Ratio', s: Math.round(Math.max(0, 100 - dr * 200)) });
    const cls = new Set(db.assets.map(a => a.assetClass)).size; sc.push({ n: 'Diversification', s: Math.min(100, Math.round(cls / 7 * 100)) });
    const gp = db.goals.length ? db.goals.reduce((s, g) => s + Math.min(1, (+g.current || 0) / (+g.target || 1)), 0) / db.goals.length : 0;
    sc.push({ n: 'Goal Progress', s: Math.round(gp * 100) });
    const total = Math.round(sc.reduce((s, x) => s + x.s, 0) / sc.length);
    return { total, items: sc.map(x => ({ ...x, c: x.s >= 70 ? '#22d3a0' : x.s >= 45 ? '#fbbf24' : '#f87171' })) };
}
function daysUntil(b) { const now = new Date(); let d = new Date(now.getFullYear(), now.getMonth(), b.dueDay || 1); if (d < now) d.setMonth(d.getMonth() + 1); return Math.floor((d - now) / 86400000); }

// ─── THEME ────────────────────────────────
function toggleTheme() { const h = document.documentElement; const dk = h.getAttribute('data-theme') === 'dark'; h.setAttribute('data-theme', dk ? 'light' : 'dark'); document.getElementById('tbtn').textContent = dk ? '🌙' : '☀️'; Object.keys(CH).forEach(k => { try { CH[k].destroy(); } catch (e) { } delete CH[k]; }); renderPage(curPage); }

// ─── PROFILE DROPDOWN ─────────────────────
function toggleProfileMenu() {
    const dd = document.getElementById('tp-dropdown');
    const pp = document.getElementById('topbar-profile');
    dd.classList.toggle('show');
    pp.classList.toggle('open');
}
function closeProfileMenu() {
    const dd = document.getElementById('tp-dropdown');
    const pp = document.getElementById('topbar-profile');
    if (dd) dd.classList.remove('show');
    if (pp) pp.classList.remove('open');
}
// Close profile dropdown on outside click
document.addEventListener('click', function (e) {
    const pr = document.getElementById('topbar-profile');
    const dd = document.getElementById('tp-dropdown');
    if (pr && dd && !pr.contains(e.target) && !dd.contains(e.target)) {
        dd.classList.remove('show');
        pr.classList.remove('open');
    }
});

// ─── NAVIGATION ───────────────────────────
const PTITLES = { dashboard: 'Dashboard', wealth: 'Wealth', cashflow: 'Cash Flow', plan: 'Plan', more: 'More', settings: 'Settings', admin: 'Admin Console' };
const PACTIONS = {
    assets: `<button id="btn-sync-prices" class="btn btn-ghost btn-sm" onclick="syncPrices()" style="margin-right:6px">🔄 Refresh Prices</button><button class="btn btn-ghost btn-sm" onclick="triggerImport('assets')" style="margin-right:6px">⬆ Import CSV</button><button class="btn btn-primary btn-sm" onclick="openModal('ov-asset');resetModal('asset')">+ Add Asset</button>`,
    liabilities: `<button class="btn btn-primary btn-sm" onclick="openModal('ov-liab');resetModal('liab')">+ Add Liability</button>`,
    income: `<button class="btn btn-ghost btn-sm" onclick="triggerImport('income')" style="margin-right:6px">⬆ Import CSV</button><button class="btn btn-primary btn-sm" onclick="openModal('ov-income');resetModal('income')">+ Add Income</button>`,
    expenses: `<button class="btn btn-ghost btn-sm" onclick="triggerImport('expenses')" style="margin-right:6px">⬆ Import CSV</button><button class="btn btn-primary btn-sm" onclick="openModal('ov-exp');resetModal('exp')">+ Add Expense</button>`,
    goals: `<button class="btn btn-primary btn-sm" onclick="openModal('ov-goal');resetModal('goal')">+ New Goal</button>`,
    bills: `<button class="btn btn-primary btn-sm" onclick="openModal('ov-bill');resetModal('bill')">+ Add Bill</button>`,
    networth: `<button class="btn btn-primary btn-sm" onclick="takeSnap()">📸 Take Snapshot</button>`,
    admin: `<button class="btn btn-ghost btn-sm" onclick="renderAdmin()">🔄 Refresh Data</button>`
};

function toggleSidebar() {
    const sb = document.querySelector('.sidebar');
    const ov = document.getElementById('sidebar-overlay');
    if (sb) sb.classList.toggle('show');
    if (ov) ov.classList.toggle('active');
}

function closeSidebar() {
    const sb = document.querySelector('.sidebar');
    const ov = document.getElementById('sidebar-overlay');
    if (sb) sb.classList.remove('show');
    if (ov) ov.classList.remove('active');
}

function go(p) {
    closeSidebar();
    document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.ni').forEach(x => x.classList.remove('active'));
    const pg = document.getElementById('page-' + p);
    if (!pg) { console.warn('No page:', p); return; }
    pg.classList.add('active');
    document.querySelectorAll('.ni').forEach(x => { if (x.getAttribute('onclick')?.includes("'" + p + "'")) x.classList.add('active'); });
    document.getElementById('ptitle').textContent = PTITLES[p] || p;
    document.getElementById('tbar-actions').innerHTML = PACTIONS[p] || '';
    curPage = p; renderPage(p);
}

function renderPage(p) { ({ dashboard: renderDash, wealth: renderWealth, cashflow: renderCashflow, plan: renderPlan, more: renderMore, settings: renderSett, admin: renderAdmin })[p]?.(); }

// ─── TAB CONTROLLERS ───────────────────────
let cfCurTab = 'income';
function cfTab(id, el) {
    document.querySelectorAll('#cf-tabs .wealth-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    ['cfp-income', 'cfp-expenses', 'cfp-insights'].forEach(p => {
        const _el = document.getElementById(p);
        if (_el) _el.style.display = p === 'cfp-' + id ? 'block' : 'none';
    });
    cfCurTab = id;
    const titles = { income: 'Income', expenses: 'Expenses', insights: 'Insights' };
    const titleEl = document.getElementById('cf-title-text');
    if (titleEl) titleEl.textContent = titles[id] || id;
    document.getElementById('tbar-actions').innerHTML = PACTIONS[id] || '';
    if (id === 'income') renderIncome();
    else if (id === 'expenses') renderExpenses();
    else if (id === 'insights') renderInsights();
}
function renderCashflow() {
    cfTab(cfCurTab, document.querySelector(`#cf-tabs .wealth-tab[onclick*="'${cfCurTab}'"]`));
}

let planCurTab = 'goals';
function planTab(id, el) {
    document.querySelectorAll('#plan-tabs .wealth-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    ['planp-goals'].forEach(p => {
        const _el = document.getElementById(p);
        if (_el) _el.style.display = p === 'planp-' + id ? 'block' : 'none';
    });
    planCurTab = id;
    const titles = { goals: 'Goals' };
    const titleEl = document.getElementById('plan-title-text');
    if (titleEl) titleEl.textContent = titles[id] || id;
    document.getElementById('tbar-actions').innerHTML = PACTIONS[id] || '';
    if (id === 'goals') renderGoals();
}
function renderPlan() {
    planTab(planCurTab, document.querySelector(`#plan-tabs .wealth-tab[onclick*="'${planCurTab}'"]`));
}

let moreCurTab = 'budget';
function moreTab(id, el) {
    document.querySelectorAll('#more-tabs .wealth-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    ['morep-budget', 'morep-tax', 'morep-bills', 'morep-snapshots'].forEach(p => {
        const _el = document.getElementById(p);
        if (_el) _el.style.display = p === 'morep-' + id ? 'block' : 'none';
    });
    moreCurTab = id;
    const titles = { budget: 'Budget Planner', tax: 'Tax Planning', bills: 'Bills & Subscriptions', snapshots: 'Snapshots' };
    const titleEl = document.getElementById('more-title-text');
    if (titleEl) titleEl.textContent = titles[id] || id;
    document.getElementById('tbar-actions').innerHTML = PACTIONS[id] || '';
    if (id === 'budget') renderBudget();
    else if (id === 'tax') renderTax();
    else if (id === 'bills') renderBills();
    else if (id === 'snapshots') renderSnaps();
}
function renderMore() {
    moreTab(moreCurTab, document.querySelector(`#more-tabs .wealth-tab[onclick*="'${moreCurTab}'"]`));
}


// ─── WEALTH TAB CONTROLLER ─────────────────
// Wealth variables
let wealthCurTab = 'assets';
let wAssetSortKey = 'value', wAssetSortDir = -1, wAssetFilterClass = 'all', wAssetPage = 1;
const W_PAGE_SIZE = 10;

function sortWAssets(key) {
    if (wAssetSortKey === key) wAssetSortDir *= -1; else { wAssetSortKey = key; wAssetSortDir = -1; }
    renderWealthAssets();
}

function renderWealth() {
    // Called when page-wealth becomes active
    const sub = document.getElementById('wealth-sub-text');
    if (wealthCurTab === 'assets') {
        if (sub) sub.textContent = db.assets.length + ' asset' + (db.assets.length !== 1 ? 's' : '');
        renderWealthAssets();
    } else if (wealthCurTab === 'liabilities') {
        if (sub) sub.textContent = db.liabilities.length + ' liabilit' + (db.liabilities.length !== 1 ? 'ies' : 'y');
        renderWealthLiabilities();
    } else if (wealthCurTab === 'networth') {
        if (sub) sub.textContent = 'Net Worth · ' + fmt(NW());
        renderWealthNetWorth();
    } else if (wealthCurTab === 'allocation') {
        if (sub) sub.textContent = db.assets.length + ' asset classes';
        renderWealthAllocation();
    }
    const titleEl = document.getElementById('wealth-title-text');
    const titles = { assets: 'Assets', liabilities: 'Liabilities', networth: 'Net Worth', allocation: 'Allocation' };
    if (titleEl) titleEl.textContent = titles[wealthCurTab] || wealthCurTab;
}

function renderWealthAssets() {
    const ta = TA();
    const sub = document.getElementById('wealth-sub-text');
    if (sub && wealthCurTab === 'assets') sub.textContent = db.assets.length + ' asset' + (db.assets.length !== 1 ? 's' : '');
    // Stats
    const pl = db.assets.reduce((s, a) => s + ((+a.value || 0) - (+a.cost || 0)), 0);
    const cost = db.assets.reduce((s, a) => s + (+a.cost || 0), 0);
    const plPct = cost ? ((pl / cost) * 100).toFixed(1) : 0;
    document.getElementById('w-a-stats').innerHTML = `
      <div class="stat"><div class="sl">Total Value</div><div class="sv tgn">${fmt(ta)}</div><div class="ss">${db.assets.length} assets</div></div>
      <div class="stat"><div class="sl">Total Invested</div><div class="sv">${fmt(cost)}</div></div>
      <div class="stat"><div class="sl">Total P&L</div><div class="sv ${pl >= 0 ? 'tgn' : 'trd'}">${pl >= 0 ? '+' : ''}${fmt(pl)}<div class="ss">${plPct}% overall</div></div></div>`;
    // Pills
    const pillsEl = document.getElementById('w-a-pills');
    const classes = [...new Set(db.assets.map(a => a.assetClass))].filter(Boolean);
    const counts = {}; db.assets.forEach(a => { counts[a.assetClass] = (counts[a.assetClass] || 0) + 1; });
    const allActive = wAssetFilterClass === 'all';
    pillsEl.innerHTML = `<button class="pill${allActive ? ' active' : ''}" onclick="wAssetFilter('all',this)">All (${db.assets.length})</button>` +
        classes.map(c => `<button class="pill${wAssetFilterClass === c ? ' active' : ''}" onclick="wAssetFilter('${c}',this)">${c} (${counts[c] || 0})</button>`).join('');
    // Filter + search
    const srch = (document.getElementById('w-a-srch')?.value || '').toLowerCase();
    let filtered = db.assets.filter(a => (wAssetFilterClass === 'all' || a.assetClass === wAssetFilterClass) &&
        (!srch || a.name?.toLowerCase().includes(srch) || a.assetClass?.toLowerCase().includes(srch)));
    filtered.sort((a, b) => {
        let av = wAssetSortKey === 'value' ? (+a.value || 0) : wAssetSortKey === 'invested' ? (+a.cost || 0) : (a[wAssetSortKey] || '').toString().toLowerCase();
        let bv = wAssetSortKey === 'value' ? (+b.value || 0) : wAssetSortKey === 'invested' ? (+b.cost || 0) : (b[wAssetSortKey] || '').toString().toLowerCase();
        return wAssetSortDir * (av < bv ? -1 : av > bv ? 1 : 0);
    });
    const total = filtered.length, pages = Math.ceil(total / W_PAGE_SIZE);
    if (wAssetPage > pages) wAssetPage = Math.max(1, pages);
    const paged = filtered.slice((wAssetPage - 1) * W_PAGE_SIZE, wAssetPage * W_PAGE_SIZE);
    const tb = document.getElementById('w-a-tbody');
    if (!paged.length) {
        tb.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">No assets found</td></tr>`;
    } else {
        tb.innerHTML = paged.map(a => {
            const pl = (+a.value || 0) - (+a.cost || 0), plp = a.cost ? ((pl / +a.cost) * 100).toFixed(1) : null;
            const hasLive = a.lastPrice && a.qty;
            const ltpBadge = a.lastPrice ? `<div style="font-size:9px;color:var(--text3)">LTP ${fmt(a.lastPrice)}</div>` : '';
            const tickerBadge = a.ticker ? `<code style="font-size:9px;background:var(--bg3);padding:2px 5px;border-radius:4px;color:var(--ac)">${a.ticker}</code>` : '';
            return `<tr onclick="editAsset('${a.id}')" style="cursor:pointer">
                <td><input type="checkbox" onclick="event.stopPropagation()"/></td>
                <td><div style="font-weight:600;font-size:12px">${a.name}</div>${tickerBadge}</td>
                <td><span class="tag ${CT[a.assetClass] || 'to'}" style="font-size:9px">${a.assetClass || '?'}</span></td>
                <td style="font-size:11px;color:var(--text3)">${a.notes || '—'}</td>
                <td style="text-align:right;font-size:12px">${a.cost ? fmt(+a.cost) : '—'}</td>
                <td style="text-align:right"><div style="font-weight:700;font-size:12px">${fmt(+a.value || 0)}</div>${ltpBadge}${plp != null ? `<div style="font-size:9px;color:${pl >= 0 ? 'var(--gn)' : 'var(--rd)'}">${pl >= 0 ? '+' : ''}${plp}%</div>` : ''}</td>
                <td style="text-align:right"><button class="btn btn-danger btn-xs" onclick="event.stopPropagation();delAsset('${a.id}')">Del</button></td>
            </tr>`;
        }).join('');
    }
    const pgEl = document.getElementById('w-a-pagination');
    if (pgEl) pgEl.innerHTML = `<span class="tsm" style="color:var(--text3)">Showing ${Math.min((wAssetPage - 1) * W_PAGE_SIZE + 1, total)}–${Math.min(wAssetPage * W_PAGE_SIZE, total)} of ${total}</span>
        <div style="display:flex;gap:4px;align-items:center">
            <button class="btn btn-ghost btn-xs" onclick="wAssetPage=Math.max(1,wAssetPage-1);renderWealthAssets()" ${wAssetPage <= 1 ? 'disabled' : ''}>Prev</button>
            <span style="font-size:11px;padding:0 6px">${wAssetPage}</span>
            <button class="btn btn-ghost btn-xs" onclick="wAssetPage=Math.min(${pages},wAssetPage+1);renderWealthAssets()" ${wAssetPage >= pages ? 'disabled' : ''}>Next</button>
        </div>`;
}

function wAssetFilter(cls, el) {
    wAssetFilterClass = cls; wAssetPage = 1;
    document.querySelectorAll('#w-a-pills .pill').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    renderWealthAssets();
}

function renderWealthLiabilities() {
    const sub = document.getElementById('wealth-sub-text');
    if (sub && wealthCurTab === 'liabilities') sub.textContent = db.liabilities.length + ' liabilit' + (db.liabilities.length !== 1 ? 'ies' : 'y');
    const tl = TL(), emi = db.liabilities.reduce((s, l) => s + (+l.emi || 0), 0), mi = mInc();
    const totalInterest = db.liabilities.reduce((s, l) => {
        const P = +l.originalPrincipal || +l.amount;
        const lEmi = +l.emi || calcEMI(P, +l.rate, +l.tenure);
        return s + Math.max(0, lEmi * (+l.tenure || 0) - P);
    }, 0);
    document.getElementById('w-l-stats').innerHTML = `
      <div class="stat"><div class="sl">Total Debt</div><div class="sv trd">${fmt(tl)}</div><div class="ss">${db.liabilities.length} loans</div></div>
      <div class="stat"><div class="sl">Monthly EMI</div><div class="sv">${fmt(emi)}</div><div class="ss">${mi ? ((emi / mi) * 100).toFixed(0) : '0'}% of income</div></div>
      <div class="stat"><div class="sl">Total Interest Payable</div><div class="sv trd">${fmt(totalInterest)}</div><div class="ss">across all loans</div></div>`;
    const tb = document.getElementById('w-l-tbody');
    if (!db.liabilities.length) { tb.innerHTML = '<tr><td colspan="8"><div class="empty"><div class="ei2">🎉</div><div class="et">No liabilities!</div></div></td></tr>'; return; }
    const now = new Date();
    tb.innerHTML = db.liabilities.map(l => {
        const P = +l.originalPrincipal || +l.amount;
        const lRate = +l.rate || 0;
        const lTenure = +l.tenure || 0;
        let lEmi = +l.emi || 0;
        if (!lEmi && P && lRate && lTenure) lEmi = calcEMI(P, lRate, lTenure);
        // Current month breakdown
        let curMonthHtml = '<span style="color:var(--text3);font-size:10px">—</span>';
        if (l.loanStartDate && lEmi && lRate) {
            const curIdx = getCurrentMonthIndex(l.loanStartDate);
            const r = lRate / 100 / 12;
            // Walk the schedule to find current balance
            let bal = P;
            for (let i = 0; i < curIdx && bal > 0.5; i++) {
                const int = bal * r;
                bal = Math.max(0, bal - (lEmi - int));
            }
            const curInt = bal * r;
            const curPrin = Math.min(bal, lEmi - curInt);
            curMonthHtml = `<div style="font-size:10px;line-height:1.6">
              <span style="color:#22d3a0;font-weight:600">P ₹${fmtN(curPrin)}</span>
              <span style="margin:0 3px;color:var(--text3)">+</span>
              <span style="color:#f87171;font-weight:600">I ₹${fmtN(curInt)}</span>
            </div>`;
        } else if (!l.loanStartDate) {
            curMonthHtml = '<span style="font-size:9px;color:var(--text3)">+ set start date</span>';
        }
        return `<tr>
          <td class="tdn">${l.name}</td>
          <td><span class="tag to">${l.type}</span></td>
          <td class="trd tbold">${fmt(+l.amount)}</td>
          <td>${lEmi ? fmt(lEmi) : '—'}</td>
          <td>${l.rate || 0}%</td>
          <td>${l.tenure || '—'} mo</td>
          <td>${curMonthHtml}</td>
          <td><div class="fg2">
            <button class="btn btn-ghost btn-sm" onclick="openEMIDetail('${l.id}')" title="View EMI Details" style="font-size:16px;padding:4px 10px">📊</button>
            <button class="btn btn-ghost btn-xs" onclick="editLiab('${l.id}')">Edit</button>
            <button class="btn btn-danger btn-xs" onclick="delLiab('${l.id}')">Del</button>
          </div></td>
        </tr>`;
    }).join('');
}

function renderWealthNetWorth() {
    const ta = TA(), tl = TL(), nw = NW();
    const sub = document.getElementById('wealth-sub-text');
    if (sub && wealthCurTab === 'networth') sub.textContent = 'Net Worth · ' + fmt(nw);
    
    const vEl = document.getElementById('w-nw-val');
    if (vEl) {
        vEl.textContent = fmt(nw);
        vEl.className = 'nw-hero-val ' + (nw >= 0 ? '' : 'neg');
    }
    const aEl = document.getElementById('w-nw-a'); if (aEl) aEl.textContent = fmt(ta);
    const lEl = document.getElementById('w-nw-l'); if (lEl) lEl.textContent = fmt(tl);
    
    const sc = db.snapshots.length;
    const msgEl = document.getElementById('w-nw-msg');
    if (msgEl) {
        msgEl.innerHTML = sc ? `${sc} snapshot${sc > 1 ? 's' : ''} taken` : 'Take a snapshot to track your wealth over time.';
    }

    // Chart
    renderWealthNWChart();

    // Smart Suggestions
    const sugCont = document.getElementById('w-nw-suggestions');
    const sugCard = document.getElementById('w-nw-suggestions-card');
    if (sugCont && sugCard) {
        const suggestions = [];
        const monthlyExp = typeof mExp === 'function' ? mExp() : 0;
        const liquidAssets = db.assets.filter(a => ['Cash/Bank', 'Debt/FD'].includes(a.assetClass)).reduce((s, a) => s + (+a.value || 0), 0);
        const eFundTarget = (db.settings.emergencyMonths || 6) * monthlyExp;

        if (liquidAssets < eFundTarget && eFundTarget > 0) {
            suggestions.push({ t: 'Emergency Fund', d: `You need ${fmt(eFundTarget - liquidAssets)} more to reach your ${db.settings.emergencyMonths || 6}-month safety net.`, ic: '🛡️', c: '#fbbf24' });
        }
        if (!db.settings.termInsurance) {
            suggestions.push({ t: 'Protection Gap', d: 'Your profile doesn\'t show Term Insurance. It\'s the foundation of a solid plan.', ic: '☂️', c: '#7c5cfc' });
        }
        if (tl > 0 && ta > 0 && (tl / ta) > 0.4) {
            suggestions.push({ t: 'Debt Watch', d: `Your debt-to-asset ratio is ${(tl / ta * 100).toFixed(0)}%. Consider reducing high-ROI loans first.`, ic: '⚠️', c: '#f87171' });
        }
        const bc = {}; db.assets.forEach(a => { bc[a.assetClass] = (bc[a.assetClass] || 0) + (+a.value || 0); });
        const equity = (bc['Equity'] || 0) + (bc['Mutual Funds'] || 0);
        if (ta > 0 && (equity / ta) < 0.2 && nw > 5e5) {
            suggestions.push({ t: 'Wealth Growth', d: 'Low equity exposure might slow down long-term compounding. Consider a Diversified Index SIP.', ic: '📈', c: '#22d3a0' });
        }

        if (suggestions.length > 0) {
            sugCard.style.display = 'block';
            sugCont.innerHTML = suggestions.map(s => `<div style="display:flex;gap:12px;padding:12px;background:var(--bg2);border-radius:10px;border-left:4px solid ${s.c}">
                <div style="font-size:18px">${s.ic}</div>
                <div>
                    <div style="font-weight:700;font-size:12px;margin-bottom:2px;color:var(--text);">${s.t}</div>
                    <div style="font-size:10px;color:var(--text3);line-height:1.4">${s.d}</div>
                </div>
            </div>`).join('');
        } else {
            sugCard.style.display = 'none';
        }
    }

    // Dynamic Milestones
    const allMs = [
        { n: '₹1L NW', t: 1e5, ic: '🌱' }, { n: '₹5L NW', t: 5e5, ic: '🌿' },
        { n: '₹10L NW', t: 1e6, ic: '☘️' }, { n: '₹25L NW', t: 25e5, ic: '🌳' },
        { n: '₹50L NW', t: 5e6, ic: '⛰️' }, { n: '₹75L NW', t: 75e5, ic: '🚀' },
        { n: '₹1Cr NW', t: 1e7, ic: '🏆' }, { n: '₹2.5Cr NW', t: 25e6, ic: '💎' },
        { n: '₹5Cr NW', t: 5e7, ic: '👑' }, { n: '₹10Cr NW', t: 1e8, ic: '🌌' }
    ];
    const doneIdx = allMs.map((m, i) => nw >= m.t ? i : -1).filter(i => i !== -1);
    const lastDone = doneIdx.length > 0 ? doneIdx[doneIdx.length - 1] : -1;
    const startIndex = Math.max(0, lastDone - 1);
    const nwMs = allMs.slice(startIndex, startIndex + 4);

    const msEl = document.getElementById('w-nw-ms');
    if (msEl) {
        msEl.innerHTML = nwMs.map(m => {
            const done = nw >= m.t, pp = Math.min(100, Math.round(nw / m.t * 100));
            return `<div class="ms">
                <div class="msic">${m.ic}</div>
                <div style="flex:1">
                    <div class="msn" style="${done ? 'text-decoration:line-through;color:var(--text3)' : ''}">${m.n}</div>
                    ${!done ? `<div class="pb mt8" style="height:3px"><div class="pf" style="width:${pp}%;background:${pp > 50 ? '#22d3a0' : '#7c5cfc'}"></div></div>` : ''}
                </div>
                <span class="bdg ${done ? 'bg' : 'by'}">${done ? '✓' : pp + '%'}</span>
            </div>`;
        }).join('');
    }

    // Snapshot history
    const sorted = [...db.snapshots].sort((a, b) => b.date - a.date);
    const snapsEl = document.getElementById('w-nw-snaps');
    if (snapsEl) {
        snapsEl.innerHTML = sorted.length
            ? sorted.map((s, i) => { 
                const prev = sorted[i + 1]; 
                const diff = prev ? s.netWorth - prev.netWorth : null; 
                return `<div class="snap-card">
                    <div class="snap-card-top">
                        <div>
                            <div class="snap-card-date">${new Date(s.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                            <div class="snap-card-sub">${s.assetCount || 0} assets · ${fmt(s.totalAssets || 0)}</div>
                        </div>
                        <div>
                            <div class="snap-card-nw ${s.netWorth >= 0 ? 'tgn' : 'trd'}">${fmt(s.netWorth)}</div>
                            ${diff != null ? `<div style="font-size:10px;color:${diff >= 0 ? 'var(--gn)' : 'var(--rd)'}">${diff >= 0 ? '▲ +' : '▼ '}${fmt(Math.abs(diff))}</div>` : ''}
                        </div>
                    </div>
                    <div style="text-align:right;margin-top:6px"><button class="btn btn-danger btn-xs" onclick="delSnap('${s.id}')">Delete</button></div>
                </div>`; 
            }).join('')
            : '<div class="empty"><div class="ei2">⊡</div><div class="et">No snapshots yet</div><button class="btn btn-primary btn-sm" onclick="takeSnap()">Take First Snapshot</button></div>';
    }
}

function renderWealthNWChart() {
    dc('w-nw'); const ctx = document.getElementById('w-ch-nw');
    const p = document.getElementById('w-nwp').value;
    let snaps = [...db.snapshots]; if (p !== 'all') { const cut = Date.now() - +p * 30 * 24 * 36e5; snaps = snaps.filter(s => s.date >= cut); }
    snaps.push({ date: Date.now(), netWorth: NW(), totalAssets: TA() }); snaps.sort((a, b) => a.date - b.date);
    CH['w-nw'] = new Chart(ctx, { type: 'line', data: { labels: snaps.map(s => new Date(s.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })), datasets: [{ label: 'Net Worth', data: snaps.map(s => s.netWorth), borderColor: '#7c5cfc', backgroundColor: 'rgba(124,92,252,.08)', fill: true, tension: .4, pointRadius: 3, pointBackgroundColor: '#7c5cfc' }, { label: 'Assets', data: snaps.map(s => s.totalAssets || s.netWorth), borderColor: 'rgba(34,211,160,.4)', backgroundColor: 'transparent', tension: .4, pointRadius: 0, borderDash: [4, 4] }] }, options: { ...co(), responsive: true, maintainAspectRatio: false, plugins: { ...co().plugins, tooltip: { callbacks: { label: c => fmt(c.raw) } } }, scales: { x: co().scales.x, y: { ...co().scales.y, ticks: { ...co().scales.y.ticks, callback: v => fmtS(v) } } } } });
}

function renderWealthAllocation() {
    renderAllocation();
}

// ─── INSIGHTS ─────────────────────────────
function renderInsights() {
    const period = parseInt(document.getElementById('ins-period')?.value || '12');
    const months = []; for (let i = period - 1; i >= 0; i--) { const d = new Date(); d.setMonth(d.getMonth() - i); months.push(d.toISOString().slice(0, 7)); }
    const totalInc = months.reduce((s, m) => s + mInc(m), 0);
    const totalExp = months.reduce((s, m) => s + mExp(m), 0);
    const avgSav = months.length ? (totalInc - totalExp) / months.length : 0;
    const curMonth = thisMonth(); const curSR = SR(curMonth);
    // Stats
    document.getElementById('ins-stats').innerHTML = `
      <div class="stat"><div class="sl">Avg Monthly Income</div><div class="sv tgn">${fmt(totalInc / period)}</div><div class="ss">Last ${period} months</div></div>
      <div class="stat"><div class="sl">Avg Monthly Spend</div><div class="sv trd">${fmt(totalExp / period)}</div><div class="ss">${totalInc > 0 ? ((totalExp / totalInc) * 100).toFixed(0) : 0}% of income</div></div>
      <div class="stat"><div class="sl">Avg Monthly Savings</div><div class="sv ${avgSav >= 0 ? 'tgn' : 'trd'}">${fmt(avgSav)}</div><div class="ss">Savings rate: ${curSR}%</div></div>`;
    // Income vs Expenses bar chart
    dc('ins-ie');
    CH['ins-ie'] = new Chart(document.getElementById('ch-ins-ie'), { type: 'bar', data: { labels: months.map(m => mLabel(m)), datasets: [{ label: 'Income', data: months.map(m => mInc(m)), backgroundColor: 'rgba(34,211,160,.7)', borderRadius: 4 }, { label: 'Expenses', data: months.map(m => mExp(m)), backgroundColor: 'rgba(248,113,113,.6)', borderRadius: 4 }] }, options: { ...co(), responsive: true, maintainAspectRatio: false, plugins: { ...co().plugins, tooltip: { callbacks: { label: c => fmt(c.raw) } } }, scales: { x: co().scales.x, y: { ...co().scales.y, ticks: { ...co().scales.y.ticks, callback: v => fmtS(v) } } } } });
    // Savings rate line chart
    dc('ins-sr');
    CH['ins-sr'] = new Chart(document.getElementById('ch-ins-sr'), { type: 'line', data: { labels: months.map(m => mLabel(m)), datasets: [{ label: 'Savings Rate %', data: months.map(m => Math.max(-100, SR(m))), borderColor: '#7c5cfc', backgroundColor: 'rgba(124,92,252,.07)', fill: true, tension: .4, pointRadius: 3, pointBackgroundColor: '#7c5cfc' }] }, options: { ...co(), responsive: true, maintainAspectRatio: false, plugins: { ...co().plugins, tooltip: { callbacks: { label: c => c.raw.toFixed(1) + '%' } } }, scales: { x: co().scales.x, y: { ...co().scales.y, ticks: { ...co().scales.y.ticks, callback: v => v + '%' } } } } });
    // Top categories horizontal bar
    const bc = {}; db.expenses.filter(e => e.date?.slice(0, 7) >= months[0]).forEach(e => { bc[e.category] = (bc[e.category] || 0) + (+e.amount || 0); });
    const cats = Object.keys(bc).sort((a, b) => bc[b] - bc[a]).slice(0, 7);
    const cols = ['#f87171', '#fb923c', '#fbbf24', '#7c5cfc', '#60a5fa', '#22d3a0', '#a78bfa'];
    dc('ins-cats');
    if (cats.length) CH['ins-cats'] = new Chart(document.getElementById('ch-ins-cats'), { type: 'bar', data: { labels: cats, datasets: [{ data: cats.map(c => bc[c]), backgroundColor: cats.map((_, i) => cols[i % cols.length]), borderRadius: 4 }] }, options: { ...co(), indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.raw) } } }, scales: { x: { ...co().scales.x, ticks: { callback: v => fmtS(v) } }, y: co().scales.y } } });
    // Monthly savings area chart
    dc('ins-sav');
    CH['ins-sav'] = new Chart(document.getElementById('ch-ins-sav'), { type: 'bar', data: { labels: months.map(m => mLabel(m)), datasets: [{ label: 'Savings', data: months.map(m => mInc(m) - mExp(m)), backgroundColor: months.map(m => (mInc(m) - mExp(m)) >= 0 ? 'rgba(34,211,160,.7)' : 'rgba(248,113,113,.6)'), borderRadius: 4 }] }, options: { ...co(), responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.raw) } } }, scales: { x: co().scales.x, y: { ...co().scales.y, ticks: { ...co().scales.y.ticks, callback: v => fmtS(v) } } } } });
    // Smart insights
    const insights = [];
    const srNow = SR(curMonth), prevM2 = prevM(curMonth), srPrev = SR(prevM2);
    if (srNow > 30) insights.push({ type: 'ins-positive', ic: '🌟', title: 'Excellent savings rate!', desc: `You saved ${srNow}% of your income this month. Keep it up!` });
    else if (srNow < 10) insights.push({ type: 'ins-danger', ic: '⚠️', title: 'Low savings rate', desc: `Only ${srNow}% saved this month. Try to cut unnecessary expenses.` });
    if (srNow > srPrev + 5) insights.push({ type: 'ins-positive', ic: '📈', title: 'Savings rate improving!', desc: `Up ${(srNow - srPrev).toFixed(0)} points from last month (${srPrev}% → ${srNow}%).` });
    else if (srNow < srPrev - 5) insights.push({ type: 'ins-warning', ic: '📉', title: 'Savings rate dropped', desc: `Down ${(srPrev - srNow).toFixed(0)} points from last month. Review your spending.` });
    const topCat = cats[0]; if (topCat) insights.push({ type: 'ins-tip', ic: '🔍', title: `Top spend: ${topCat}`, desc: `${fmt(bc[topCat])} spent in ${topCat} over ${period} months (${totalExp > 0 ? ((bc[topCat] / totalExp) * 100).toFixed(0) : 0}% of total expenses).` });
    const inc = mInc(curMonth), exp = mExp(curMonth); if (inc && exp > inc) insights.push({ type: 'ins-danger', ic: '🔴', title: 'Spending exceeds income!', desc: `You spent ${fmt(exp - inc)} more than you earned this month. Immediate action needed.` });
    if (db.assets.length && !db.goals.length) insights.push({ type: 'ins-tip', ic: '🎯', title: 'Set a financial goal', desc: 'You have assets but no goals. Setting goals helps you stay focused and motivated.' });
    if (!insights.length) insights.push({ type: 'ins-tip', ic: '💡', title: 'All looks good!', desc: 'Keep adding transactions to get personalised insights.' });
    document.getElementById('ins-smart-list').innerHTML = insights.slice(0, 5).map(i => `<div class="insight-card ${i.type}"><div class="ins-ic">${i.ic}</div><div><div class="ins-title">${i.title}</div><div class="ins-desc">${i.desc}</div></div></div>`).join('');
    // This month's expense breakdown
    const mExpenses = db.expenses.filter(e => e.date?.startsWith(curMonth));
    const mBc = {}; mExpenses.forEach(e => { mBc[e.category] = (mBc[e.category] || 0) + (+e.amount || 0); });
    const mTotal = mExp(curMonth);
    document.getElementById('ins-month-breakdown').innerHTML = Object.entries(mBc).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([cat, val]) => {
        const pct = mTotal ? ((val / mTotal) * 100).toFixed(0) : 0;
        return `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:12px;font-weight:600">${cat}</span><span style="font-size:11px;color:var(--text2)">${fmt(val)} · ${pct}%</span></div><div class="pb" style="height:4px"><div class="pf" style="width:${pct}%;background:var(--ac)"></div></div></div>`;
    }).join('') || '<div class="tsm" style="color:var(--text3)">No expenses this month</div>';
    // Daily spending (current month bar chart)
    const days = {}; mExpenses.forEach(e => { const d = new Date(e.date + 'T00:00:00').getDate(); days[d] = (days[d] || 0) + (+e.amount || 0); });
    const dayNums = Array.from({ length: new Date().getDate() }, (_, i) => i + 1);
    dc('ins-daily');
    CH['ins-daily'] = new Chart(document.getElementById('ch-ins-daily'), { type: 'bar', data: { labels: dayNums.map(d => d + ''), datasets: [{ label: 'Spend', data: dayNums.map(d => days[d] || 0), backgroundColor: 'rgba(248,113,113,.6)', borderRadius: 3 }] }, options: { ...co(), responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.raw) } } }, scales: { x: co().scales.x, y: { ...co().scales.y, ticks: { ...co().scales.y.ticks, callback: v => fmtS(v) } } } } });
}



// ─── DASHBOARD ────────────────────────────
function renderDash() {
    const ta = TA(), tl = TL(), nw = NW();
    // Hero banner
    const hero = document.getElementById('dash-hero');
    const nwEl = document.getElementById('d-nw');
    nwEl.textContent = fmt(nw);
    nwEl.style.color = nw >= 0 ? 'var(--gn)' : 'var(--rd)';
    hero.style.background = nw >= 0 ? 'linear-gradient(135deg,rgba(34,211,160,.12),rgba(34,211,160,.04))' : 'linear-gradient(135deg,rgba(248,113,113,.12),rgba(248,113,113,.04))';
    hero.style.borderColor = nw >= 0 ? 'rgba(34,211,160,.25)' : 'rgba(248,113,113,.25)';
    // Snapshot sub-label
    const lastSnap = db.snapshots.length ? db.snapshots[db.snapshots.length - 1] : null;
    const nwSub = document.getElementById('d-nwsub');
    if (lastSnap) { const d = nw - lastSnap.netWorth; nwSub.innerHTML = `<span style="color:${d >= 0 ? 'var(--gn)' : 'var(--rd)'};font-weight:600">${d >= 0 ? '▲ +' : '▼ '}${fmt(Math.abs(d))}</span> <span style="color:var(--text3)">since last snapshot</span>`; }
    else nwSub.innerHTML = `<span style="color:var(--text3)">No snapshots yet</span>`;
    // Stat cards
    document.getElementById('d-ta').textContent = fmt(ta);
    document.getElementById('d-tac').textContent = db.assets.length + ' assets';
    document.getElementById('d-tl').textContent = fmt(tl);
    document.getElementById('d-tlc').textContent = db.liabilities.length + (db.liabilities.length === 1 ? ' active loan' : ' active loans');
    const dr = ta ? ((tl / ta) * 100) : 0;
    document.getElementById('d-dr').textContent = dr.toFixed(1) + '%';
    document.getElementById('d-dr').style.color = dr > 50 ? 'var(--rd)' : dr > 30 ? 'var(--yw)' : 'var(--gn)';
    document.getElementById('d-drs').textContent = dr > 50 ? 'High debt load' : dr > 30 ? 'Moderate' : 'Healthy';
    // Info banner if no cashflow data
    const hasIncome = db.income.length > 0, hasExp = db.expenses.length > 0;
    const banner = document.getElementById('dash-info-banner');
    if (!hasIncome && !hasExp) banner.style.display = 'flex';
    // NW Chart
    renderNWChart();
    // Show snapshot empty state or chart
    const hasSnaps = db.snapshots.length > 0;
    document.getElementById('d-nw-empty').style.display = hasSnaps ? 'none' : 'block';
    document.getElementById('d-nw-chart-wrap').style.display = hasSnaps ? 'block' : 'none';
    document.getElementById('d-nw-snap-sub').textContent = hasSnaps ? db.snapshots.length + ' snapshot' + (db.snapshots.length > 1 ? 's' : '') + ' taken' : 'No snapshots yet';
    // Snapshot CTA
    document.getElementById('d-snap-cta').style.display = !hasSnaps ? 'block' : 'none';
    // Asset Allocation donut
    const bc = {}; db.assets.forEach(a => { bc[a.assetClass] = (bc[a.assetClass] || 0) + (+a.value || 0); });
    const labels = Object.keys(bc), vals = Object.values(bc);
    dc('alloc');
    if (labels.length) {
        CH['alloc'] = new Chart(document.getElementById('ch-alloc'), { type: 'doughnut', data: { labels, datasets: [{ data: vals, backgroundColor: labels.map(l => CC[l] || '#94a3b8'), borderWidth: 0 }] }, options: { ...co(), cutout: '68%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.label}: ${fmt(c.raw)}` } } } } });
        // Centered total
        const ctx = document.getElementById('ch-alloc').getContext('2d');
        document.getElementById('alloc-legend').innerHTML = labels.map((l, i) => `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px"><span style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:2px;background:${CC[l] || '#94a3b8'};display:inline-block"></span><span style="font-size:11px">${l}</span></span><span style="font-size:11px;font-weight:700">${ta ? (vals[i] / ta * 100).toFixed(0) : 0}%</span></div>`).join('');
    }
    // Top Holdings
    const top5 = [...db.assets].sort((a, b) => (+b.value || 0) - (+a.value || 0)).slice(0, 5);
    document.getElementById('d-holdings-body').innerHTML = top5.length
        ? top5.map(a => `<tr><td style="font-weight:600">${a.name}</td><td><span class="tag ${CT[a.assetClass] || 'to'}" style="font-size:9px">${a.assetClass || '?'}</span></td><td style="text-align:right;font-weight:700">${fmt(+a.value || 0)}</td></tr>`).join('')
        : '<tr><td colspan="3" style="text-align:center;color:var(--text3);font-size:11px;padding:12px">No assets yet</td></tr>';
    // Cashflow
    const now = new Date();
    const mKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const mName = now.toLocaleDateString('en-IN', { month: 'long' });
    document.getElementById('d-cf-title').textContent = mName + ' Cashflow';
    const mi = mInc(mKey), me = mExp(mKey);
    const cfEl = document.getElementById('d-cashflow');
    if (mi || me) {
        cfEl.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">
            <div class="fb"><span style="font-size:11px;color:var(--text3)">Income</span><span style="font-size:13px;font-weight:700;color:var(--gn)">${fmt(mi)}</span></div>
            <div class="fb"><span style="font-size:11px;color:var(--text3)">Expenses</span><span style="font-size:13px;font-weight:700;color:var(--rd)">${fmt(me)}</span></div>
            <div style="height:1px;background:var(--border);margin:2px 0"></div>
            <div class="fb"><span style="font-size:11px;font-weight:600">Savings</span><span style="font-size:13px;font-weight:700;color:${mi - me >= 0 ? 'var(--gn)' : 'var(--rd)'}">${fmt(mi - me)}</span></div>
        </div>`;
    } else {
        cfEl.innerHTML = `<div class="empty" style="padding:12px 0"><div class="et" style="font-size:12px">No transactions recorded this month</div><div style="margin-top:8px"><button class="btn btn-primary btn-xs" onclick="go('income')">+ Add income &amp; expenses</button></div></div>`;
    }
    // Goals
    const goalsEl = document.getElementById('d-goals');
    if (db.goals.length) {
        goalsEl.innerHTML = db.goals.slice(0, 3).map(g => { const p = Math.min(100, Math.round((+g.current || 0) / (+g.target || 1) * 100)); return `<div style="margin-bottom:10px"><div class="fb mb4"><span style="font-size:11px;font-weight:600">${g.name}</span><span style="font-size:10px;color:var(--text3)">${p}%</span></div><div class="pb" style="height:4px"><div class="pf" style="width:${p}%;background:var(--ac)"></div></div></div>`; }).join('');
    } else {
        goalsEl.innerHTML = `<div class="empty" style="padding:12px 0"><div class="et" style="font-size:12px">Set goals to track your progress</div></div>`;
    }
    updateSidebar();
}
function renderSnaps() {
    const el = document.getElementById('snaps-list'); if (!db.snapshots.length) { el.innerHTML = '<div class="card"><div class="empty"><div class="ei2">⊡</div><div class="et">No snapshots yet</div></div></div>'; return; }
    const sorted = [...db.snapshots].sort((a, b) => b.date - a.date);
    el.innerHTML = sorted.map((s, i) => { const prev = sorted[i + 1]; const diff = prev ? s.netWorth - prev.netWorth : null; return `<div class="card mb12"><div class="fb"><div><div class="tbold" style="font-size:13px">${new Date(s.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div><div class="tsm mt8">${s.assetCount || 0} assets · ${fmt(s.totalAssets || 0)} · ${fmt(s.totalLiabilities || 0)} liabilities</div></div><div style="text-align:right"><div class="tbold" style="font-size:18px">${fmt(s.netWorth)}</div>${diff != null ? `<div style="font-size:10px;color:${diff >= 0 ? 'var(--gn)' : 'var(--rd)'}">${diff >= 0 ? '▲' : '▼'} ${fmt(Math.abs(diff))} vs prev</div>` : '<div class="tsm">first snapshot</div>'}</div></div><div class="fw mt8">${Object.entries(s.byClass || {}).map(([c, v]) => `<span class="tag ${CT[c] || 'to'}">${c}: ${fmt(v)}</span>`).join('')}</div><div style="text-align:right;margin-top:9px"><button class="btn btn-danger btn-xs" onclick="delSnap('${s.id}')">Delete</button></div></div>`; }).join('');
}

function renderNetWorth() {
    const ta = TA(), tl = TL(), nw = NW();
    // Hero card
    const hv = document.getElementById('nw-hero-val');
    if (hv) {
        hv.textContent = fmt(nw);
        hv.className = 'nw-hero-val ' + (nw >= 0 ? 'pos' : 'neg');
    }
    const ha = document.getElementById('nw-hero-a'); if (ha) ha.textContent = fmt(ta);
    const hl = document.getElementById('nw-hero-l'); if (hl) hl.textContent = fmt(tl);
    
    const sc = db.snapshots.length;
    const hm = document.getElementById('nw-hero-msg');
    if (hm) {
        hm.innerHTML = sc
            ? `<span style="color:var(--text2)">${sc} snapshot${sc > 1 ? 's' : ''} taken</span> — Snapshots record your net worth at a point in time.`
            : `Snapshots record your net worth at a point in time so you can track growth over months. <button class="btn btn-primary btn-sm" onclick="takeSnap()" style="margin-left:8px;vertical-align:middle">📸 Take Your First Snapshot</button>`;
    }

    // Charts (NW tab panel)
    dc('nw2'); const ctx2 = document.getElementById('ch-nw2');
    if (ctx2) {
        const p2 = document.getElementById('nwp2').value || '12';
        let snaps2 = [...db.snapshots]; if (p2 !== 'all') { const cut = Date.now() - +p2 * 30 * 24 * 36e5; snaps2 = snaps2.filter(s => s.date >= cut); }
        snaps2.push({ date: Date.now(), netWorth: nw, totalAssets: ta, totalLiabilities: tl }); snaps2.sort((a, b) => a.date - b.date);
        CH['nw2'] = new Chart(ctx2, { type: 'line', data: { labels: snaps2.map(s => new Date(s.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })), datasets: [{ label: 'Net Worth', data: snaps2.map(s => s.netWorth), borderColor: '#22d3a0', backgroundColor: 'rgba(34,211,160,.08)', fill: true, tension: .4, pointRadius: 3, pointBackgroundColor: '#22d3a0' }, { label: 'Assets', data: snaps2.map(s => s.totalAssets || s.netWorth), borderColor: 'rgba(96,165,250,.6)', backgroundColor: 'transparent', tension: .4, pointRadius: 0, borderDash: [4, 4] }, { label: 'Liabilities', data: snaps2.map(s => s.totalLiabilities || 0), borderColor: 'rgba(248,113,113,.5)', backgroundColor: 'transparent', tension: .4, pointRadius: 0, borderDash: [4, 4] }] }, options: { ...co(), responsive: true, maintainAspectRatio: false, plugins: { ...co().plugins, tooltip: { callbacks: { label: c => fmt(c.raw) } } }, scales: { x: co().scales.x, y: { ...co().scales.y, ticks: { ...co().scales.y.ticks, callback: v => fmtS(v) } } } } });
    }

    dc('avl'); const ctxAvl = document.getElementById('ch-avl');
    if (ctxAvl) {
        const snaps2 = [...db.snapshots];
        snaps2.push({ date: Date.now(), netWorth: nw, totalAssets: ta, totalLiabilities: tl }); snaps2.sort((a, b) => a.date - b.date);
        CH['avl'] = new Chart(ctxAvl, { type: 'bar', data: { labels: snaps2.map(s => new Date(s.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })), datasets: [{ label: 'Assets', data: snaps2.map(s => s.totalAssets || s.netWorth), backgroundColor: 'rgba(34,211,160,.65)', borderRadius: 4 }, { label: 'Liabilities', data: snaps2.map(s => s.totalLiabilities || 0), backgroundColor: 'rgba(248,113,113,.5)', borderRadius: 4 }] }, options: { ...co(), responsive: true, maintainAspectRatio: false, plugins: { ...co().plugins, tooltip: { callbacks: { label: c => fmt(c.raw) } } }, scales: { x: co().scales.x, y: { ...co().scales.y, ticks: { ...co().scales.y.ticks, callback: v => fmtS(v) } } } } });
    }

    // Dynamic Milestones
    const allMs = [
        { n: '₹1L NW', t: 1e5, ic: '🌱' }, { n: '₹5L NW', t: 5e5, ic: '🌿' },
        { n: '₹10L NW', t: 1e6, ic: '☘️' }, { n: '₹25L NW', t: 25e5, ic: '🌳' },
        { n: '₹50L NW', t: 5e6, ic: '⛰️' }, { n: '₹75L NW', t: 75e5, ic: '🚀' },
        { n: '₹1Cr NW', t: 1e7, ic: '🏆' }, { n: '₹2.5Cr NW', t: 25e6, ic: '💎' },
        { n: '₹5Cr NW', t: 5e7, ic: '👑' }, { n: '₹10Cr NW', t: 1e8, ic: '🌌' }
    ];
    const doneIdx = allMs.map((m, i) => nw >= m.t ? i : -1).filter(i => i !== -1);
    const lastDone = doneIdx.length > 0 ? doneIdx[doneIdx.length - 1] : -1;
    const startIndex = Math.max(0, lastDone - 1);
    const nwMs = allMs.slice(startIndex, startIndex + 4);

    const msEl = document.getElementById('nw-ms');
    if (msEl) {
        msEl.innerHTML = nwMs.map(m => {
            const done = nw >= m.t, pp = Math.min(100, Math.round(nw / m.t * 100));
            return `<div class="ms">
                <div class="msic">${m.ic}</div>
                <div style="flex:1">
                    <div class="msn" style="${done ? 'text-decoration:line-through;color:var(--text3)' : ''}">${m.n}</div>
                    ${!done ? `<div class="pb mt8" style="height:3px"><div class="pf" style="width:${pp}%;background:${pp > 50 ? '#22d3a0' : '#7c5cfc'}"></div></div>` : ''}
                </div>
                <span class="bdg ${done ? 'bg' : 'by'}">${done ? '✓' : pp + '%'}</span>
            </div>`;
        }).join('');
    }

    // Smart Suggestions
    const sugCont = document.getElementById('w-nw-suggestions');
    const sugCard = document.getElementById('w-nw-suggestions-card');
    if (sugCont && sugCard) {
        const suggestions = [];
        const monthlyExp = typeof mExp === 'function' ? mExp() : 0;
        const liquidAssets = db.assets.filter(a => ['Cash/Bank', 'Debt/FD'].includes(a.assetClass)).reduce((s, a) => s + (+a.value || 0), 0);
        const eFundTarget = (db.settings.emergencyMonths || 6) * monthlyExp;

        if (liquidAssets < eFundTarget && eFundTarget > 0) {
            suggestions.push({ t: 'Emergency Fund', d: `You need ${fmt(eFundTarget - liquidAssets)} more to reach your ${db.settings.emergencyMonths || 6}-month safety net.`, ic: '🛡️', c: 'var(--yw)' });
        }
        if (!db.settings.termInsurance) {
            suggestions.push({ t: 'Protection Gap', d: 'Your profile doesn\'t show Term Insurance. It\'s the foundation of a solid plan.', ic: '☂️', c: 'var(--ac2)' });
        }
        if (tl > 0 && ta > 0 && (tl / ta) > 0.4) {
            suggestions.push({ t: 'Debt Watch', d: `Your debt-to-asset ratio is ${(tl / ta * 100).toFixed(0)}%. Consider reducing high-ROI loans first.`, ic: '⚠️', c: 'var(--rd)' });
        }
        const bc = {}; db.assets.forEach(a => { bc[a.assetClass] = (bc[a.assetClass] || 0) + (+a.value || 0); });
        const equity = (bc['Equity'] || 0) + (bc['Mutual Funds'] || 0);
        if (ta > 0 && (equity / ta) < 0.2 && nw > 5e5) {
            suggestions.push({ t: 'Wealth Growth', d: 'Low equity exposure might slow down long-term compounding. Consider a Diversified Index SIP.', ic: '📈', c: 'var(--gn)' });
        }

        if (suggestions.length > 0) {
            sugCard.style.display = 'block';
            sugCont.innerHTML = suggestions.map(s => `<div style="display:flex;gap:12px;padding:12px;background:var(--bg2);border-radius:10px;border-left:4px solid ${s.c}">
                <div style="font-size:18px">${s.ic}</div>
                <div>
                    <div style="font-weight:700;font-size:12px;margin-bottom:2px;color:var(--text);">${s.t}</div>
                    <div style="font-size:10px;color:var(--text3);line-height:1.4">${s.d}</div>
                </div>
            </div>`).join('');
        } else {
            sugCard.style.display = 'none';
        }
    }

    // Rich snapshot history cards
    const sorted2 = [...db.snapshots].sort((a, b) => b.date - a.date);
    const snapsEl = document.getElementById('nw-snaps');
    if (snapsEl) {
        snapsEl.innerHTML = sorted2.length
            ? sorted2.map((s, i) => { 
                const prev = sorted2[i + 1]; 
                const diff = prev ? s.netWorth - prev.netWorth : null; 
                return `<div class="snap-card">
                    <div class="snap-card-top">
                        <div>
                            <div class="snap-card-date">${new Date(s.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                            <div class="snap-card-sub">${s.assetCount || 0} assets &middot; ${fmt(s.totalAssets || 0)} &middot; ${fmt(s.totalLiabilities || 0)} liabilities</div>
                        </div>
                        <div>
                            <div class="snap-card-nw ${s.netWorth >= 0 ? 'tgn' : 'trd'}">${fmt(s.netWorth)}</div>
                            ${diff != null ? `<div class="snap-card-diff" style="color:${diff >= 0 ? 'var(--gn)' : 'var(--rd)'}">${diff >= 0 ? '▲ +' : '▼ '}${fmt(Math.abs(diff))} vs prev</div>` : '<div class="snap-card-diff tsm">first snapshot</div>'}
                        </div>
                    </div>
                    <div class="snap-card-classes">${Object.entries(s.byClass || {}).map(([c, v]) => `<span class="tag ${CT[c] || 'to'}">${c}: ${fmt(v)}</span>`).join('')}</div>
                    <div style="text-align:right;margin-top:8px"><button class="btn btn-danger btn-xs" onclick="delSnap('${s.id}')">Delete</button></div>
                </div>`; 
            }).join('')
            : '<div class="empty"><div class="ei2">&block;</div><div class="et">No snapshots yet</div><div class="es">Take a snapshot to track your wealth over time</div></div>';
    }

    // Assets tab
    const bc2 = {}; db.assets.forEach(a => { bc2[a.assetClass] = (bc2[a.assetClass] || 0) + (+a.value || 0); });
    const nwaEl = document.getElementById('nw-alloc');
    if (nwaEl) {
        nwaEl.innerHTML = Object.entries(bc2).sort((a, b) => b[1] - a[1]).map(([c, v]) => { 
            const pct = ta ? ((v / ta) * 100) : 0; 
            return `<div style="padding:10px 0;border-bottom:1px solid rgba(44,44,58,.3)">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                    <div style="display:flex;align-items:center;gap:8px">
                        <div style="width:8px;height:8px;border-radius:50%;background:${CC[c] || '#94a3b8'}"></div>
                        <span style="font-size:12px;font-weight:600">${c}</span>
                    </div>
                    <div style="text-align:right">
                        <span style="font-size:12px;font-weight:700">${fmt(v)}</span>
                        <span style="font-size:10px;color:var(--text3);margin-left:6px">${pct.toFixed(1)}%</span>
                    </div>
                </div>
                <div class="pb" style="height:4px"><div class="pf" style="width:${pct}%;background:${CC[c] || '#94a3b8'}"></div></div>
            </div>`; 
        }).join('') || '<div class="tsm mt8">No assets yet</div>';
    }

    const nwasEl = document.getElementById('nw-asset-snaps');
    if (nwasEl) {
        nwasEl.innerHTML = sorted2.length
            ? sorted2.map(s => `<div class="ai"><div><div class="an">${new Date(s.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div></div><div style="text-align:right"><div style="font-size:12px;font-weight:700;color:var(--gn)">${fmt(s.totalAssets || 0)}</div></div></div>`).join('')
            : '<div class="tsm mt8">No snapshots yet</div>';
    }

    // Liabilities tab
    const nwllEl = document.getElementById('nw-liab-list');
    if (nwllEl) {
        nwllEl.innerHTML = db.liabilities.length
            ? db.liabilities.map(l => `<div class="ai"><div><div class="an">${l.name}</div><div class="ap">${l.type} &middot; ${l.tenure || '?'} months left</div></div><div style="text-align:right"><div style="font-size:12px;font-weight:700;color:var(--rd)">${fmt(+l.amount)}</div><div class="ap">${l.rate || 0}% &middot; EMI ${fmt(+l.emi || 0)}</div></div></div>`).join('')
            : '<div class="empty"><div class="ei2">🎉</div><div class="et">No liabilities!</div></div>';
    }
}
function nwTab(id, el) {
    document.querySelectorAll('#nw-tabs .tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    ['networth', 'assets', 'liabilities'].forEach(p => { document.getElementById('nw-panel-' + p).style.display = p === id ? 'block' : 'none'; });
}
function renderNWChart() {
    dc('nw'); const ctx = document.getElementById('ch-nw');
    const p = document.getElementById('nwp').value;
    let snaps = [...db.snapshots]; if (p !== 'all') { const cut = Date.now() - +p * 30 * 24 * 36e5; snaps = snaps.filter(s => s.date >= cut); }
    snaps.push({ date: Date.now(), netWorth: NW(), totalAssets: TA() }); snaps.sort((a, b) => a.date - b.date);
    const dk = document.documentElement.getAttribute('data-theme') === 'dark';
    CH['nw'] = new Chart(ctx, {
        type: 'line', data: {
            labels: snaps.map(s => new Date(s.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })), datasets: [
                { label: 'Net Worth', data: snaps.map(s => s.netWorth), borderColor: '#7c5cfc', backgroundColor: 'rgba(124,92,252,.08)', fill: true, tension: .4, pointRadius: 3, pointBackgroundColor: '#7c5cfc', pointBorderColor: dk ? '#090910' : '#f2f2f8', pointBorderWidth: 2 },
                { label: 'Assets', data: snaps.map(s => s.totalAssets || s.netWorth), borderColor: 'rgba(34,211,160,.4)', backgroundColor: 'transparent', tension: .4, pointRadius: 0, borderDash: [4, 4] }
            ]
        }, options: { ...co(), responsive: true, maintainAspectRatio: false, plugins: { ...co().plugins, tooltip: { callbacks: { label: c => fmt(c.raw) } } }, scales: { x: co().scales.x, y: { ...co().scales.y, ticks: { ...co().scales.y.ticks, callback: v => fmtS(v) } } } }
    });
}
function renderHS() {
    dc('health'); const { total, items } = healthScore();
    document.getElementById('hnum').textContent = total;
    const col = total >= 70 ? '#22d3a0' : total >= 50 ? '#fbbf24' : '#f87171';
    document.getElementById('hnum').style.color = col;
    const ctx = document.getElementById('ch-health');
    CH['health'] = new Chart(ctx, { type: 'doughnut', data: { datasets: [{ data: [total, 100 - total], backgroundColor: [col, 'rgba(44,44,58,.4)'], borderWidth: 0, circumference: 270, rotation: 225 }] }, options: { responsive: false, cutout: '80%', plugins: { legend: { display: false }, tooltip: { enabled: false } } } });
    document.getElementById('hitems').innerHTML = items.map(x => `<div class="hi"><div class="hil"><div class="hd" style="background:${x.c}"></div>${x.n}</div><span style="color:${x.c};font-size:11px;font-weight:600">${x.s}/100</span></div>`).join('');
}
function renderEss() {
    const me = mExp(); const eft = (db.settings.emergencyMonths || 6) * me;
    const ea = db.assets.filter(a => a.assetClass === 'Debt/FD').reduce((s, a) => s + (+a.value || 0), 0);
    const ai = db.settings.annualIncome || 0, tc = db.settings.termInsurance || 0, hc = db.settings.healthInsurance || 0;
    document.getElementById('ess-list').innerHTML = `
    <div class="ec"><div class="el"><div class="ei">🛡️</div><div><div class="en">Term Insurance</div><div class="ed">${tc ? fmt(tc) + ' cover' : ' Not configured'} · Rec: ${ai ? fmt(ai * 10) : 'Set income first'}</div></div></div><span>${tc >= ai * 10 && ai ? '✅' : '⚠️'}</span></div>
    <div class="ec"><div class="el"><div class="ei">🏥</div><div><div class="en">Health Insurance</div><div class="ed">${hc ? fmt(hc) + ' cover' : 'Not configured'} · Rec: ₹5L+</div></div></div><span>${hc >= 500000 ? '✅' : '⚠️'}</span></div>
    <div class="ec"><div class="el"><div class="ei">💰</div><div><div class="en">Emergency Fund</div><div class="ed">${fmt(ea)} / ${fmt(eft)} (${db.settings.emergencyMonths || 6} months)</div></div></div><span>${ea >= eft && eft > 0 ? '✅' : '❌'}</span></div>`;
}
function renderIEChart() {
    dc('ie'); const ctx = document.getElementById('ch-ie');
    const months = []; for (let i = 5; i >= 0; i--) { const d = new Date(); d.setMonth(d.getMonth() - i); months.push(d.toISOString().slice(0, 7)); }
    CH['ie'] = new Chart(ctx, { type: 'bar', data: { labels: months.map(m => mLabel(m)), datasets: [{ label: 'Income', data: months.map(m => mInc(m)), backgroundColor: 'rgba(34,211,160,.7)', borderRadius: 4 }, { label: 'Expenses', data: months.map(m => mExp(m)), backgroundColor: 'rgba(248,113,113,.6)', borderRadius: 4 }] }, options: { ...co(), responsive: true, maintainAspectRatio: false, plugins: { ...co().plugins, tooltip: { callbacks: { label: c => fmt(c.raw) } } }, scales: { x: co().scales.x, y: { ...co().scales.y, ticks: { ...co().scales.y.ticks, callback: v => fmtS(v) } } } } });
}
function renderAllocChart() {
    dc('alloc'); const ctx = document.getElementById('ch-alloc');
    const bc = {}; db.assets.forEach(a => { bc[a.assetClass] = (bc[a.assetClass] || 0) + (+a.value || 0); });
    const cls = Object.keys(bc).filter(c => bc[c] > 0); if (!cls.length) { document.getElementById('alloc-legend').innerHTML = ''; return; }
    const total = TA() || 1; const dk = document.documentElement.getAttribute('data-theme') === 'dark';
    CH['alloc'] = new Chart(ctx, { type: 'doughnut', data: { labels: cls, datasets: [{ data: cls.map(c => bc[c]), backgroundColor: cls.map(c => CC[c] || '#94a3b8'), borderWidth: 2, borderColor: dk ? '#090910' : '#f2f2f8' }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.label + ': ' + fmt(c.raw) + ' (' + ((c.raw / total) * 100).toFixed(1) + '%)' } } } } });
    document.getElementById('alloc-legend').innerHTML = cls.slice(0, 5).map(c => `<div class="ai"><div class="ail"><div class="ad" style="background:${CC[c] || '#94a3b8'}"></div><div><div class="an">${c}</div><div class="ap">${((bc[c] / total) * 100).toFixed(1)}%</div></div></div><span style="font-size:11px">${fmt(bc[c])}</span></div>`).join('');
}
function renderMilestones() {
    const n = NW();
    const ms = [{ n: '₹10 Lakh NW', t: 1e6, ic: '🌱' }, { n: '₹25 Lakh NW', t: 25e5, ic: '🌿' }, { n: '₹50 Lakh NW', t: 5e6, ic: '🌳' }, { n: '₹1 Crore NW', t: 1e7, ic: '🏆' }, { n: '₹2 Crore NW', t: 2e7, ic: '💎' }, { n: '₹5 Crore NW', t: 5e7, ic: '👑' }];
    document.getElementById('milestones').innerHTML = ms.map(m => { const done = n >= m.t, pct = Math.min(100, Math.round(n / m.t * 100)); return `<div class="ms"><div class="msic">${m.ic}</div><div style="flex:1"><div class="msn" style="${done ? 'text-decoration:line-through;color:var(--text3)' : ''}">${m.n}</div>${!done ? `<div class="pb mt8" style="height:3px"><div class="pf" style="width:${pct}%;background:${pct > 50 ? '#22d3a0' : '#7c5cfc'}"></div></div>` : ''}</div><span class="bdg ${done ? 'bg' : 'by'}">${done ? '✓' : pct + '%'}</span></div>`; }).join('');
}
function renderDGoals() {
    const el = document.getElementById('d-goals');
    if (!db.goals.length) { el.innerHTML = '<div class="empty"><div class="ei2">◎</div><div class="et">No goals yet</div><button class="btn btn-primary btn-sm" onclick="go(\'goals\')">Add Goal</button></div>'; return; }
    el.innerHTML = db.goals.slice(0, 4).map(g => { const pct = Math.min(100, Math.round((+g.current || 0) / (+g.target || 1) * 100)); const c = pct >= 80 ? '#22d3a0' : pct >= 50 ? '#fbbf24' : '#7c5cfc'; return `<div class="gc"><div class="fb mb8"><span style="font-family:Syne,sans-serif;font-weight:700;font-size:12px">${g.name}</span><span style="color:${c};font-weight:700;font-size:12px">${pct}%</span></div><div class="pb"><div class="pf" style="width:${pct}%;background:${c}"></div></div><div class="pm"><span>${fmt(+g.current || 0)}</span><span>${fmt(+g.target || 0)}</span></div></div>`; }).join('');
}
function updateSidebar() {
    const n = NW();
    const snw = document.getElementById('snw');
    if (snw) snw.textContent = fmt(n);
    const ch = document.getElementById('snwc');
    if (ch && db.snapshots && db.snapshots.length) {
        const p = db.snapshots[db.snapshots.length - 1].netWorth;
        const d = n - p;
        ch.textContent = (d >= 0 ? '▲ +' : '▼ ') + fmt(Math.abs(d));
        ch.style.color = d >= 0 ? 'var(--gn)' : 'var(--rd)';
    }
    const ub = (db.bills || []).filter(b => {
        if (typeof daysUntil !== 'function') return false;
        const d = daysUntil(b);
        return d >= 0 && d <= 3;
    }).length;
    const nb = document.getElementById('nbdg');
    if (nb) {
        if (ub > 0) {
            nb.style.display = 'inline';
            nb.textContent = ub;
        } else {
            nb.style.display = 'none';
        }
    }
}




// ─── LIABILITIES ──────────────────────────
function renderLiab() {
    const tl = TL(), emi = db.liabilities.reduce((s, l) => s + (+l.emi || 0), 0), mi = mInc();
    document.getElementById('l-stats').innerHTML = `<div class="stat"><div class="sl">Total Debt</div><div class="sv trd">${fmt(tl)}</div><div class="ss">${db.liabilities.length} loans</div></div><div class="stat"><div class="sl">Monthly EMI</div><div class="sv">${fmt(emi)}</div><div class="ss">${mi ? ((emi / mi) * 100).toFixed(0) : '0'}% of income</div></div><div class="stat"><div class="sl">Debt-to-Asset</div><div class="sv">${TA() ? ((tl / TA()) * 100).toFixed(1) + '%' : 'N/A'}</div></div>`;
    const tb = document.getElementById('l-tbody');
    if (!db.liabilities.length) { tb.innerHTML = '<tr><td colspan="7"><div class="empty"><div class="ei2">🎉</div><div class="et">No liabilities!</div></div></td></tr>'; return; }
    tb.innerHTML = db.liabilities.map(l => `<tr><td class="tdn">${l.name}</td><td><span class="tag to">${l.type}</span></td><td class="trd tbold">${fmt(+l.amount)}</td><td>${fmt(+l.emi || 0)}</td><td>${l.rate || 0}%</td><td>${l.tenure || '—'} mo</td><td><div class="fg2"><button class="btn btn-ghost btn-xs" onclick="editLiab('${l.id}')">Edit</button><button class="btn btn-danger btn-xs" onclick="delLiab('${l.id}')">Del</button></div></td></tr>`).join('');
}

// ─── INCOME ───────────────────────────────
function popMonthSel(id) { const ms = new Set([thisMonth()]); db.income.forEach(i => { if (i.date) ms.add(i.date.slice(0, 7)); }); db.expenses.forEach(e => { if (e.date) ms.add(e.date.slice(0, 7)); }); const sel = document.getElementById(id), cur = sel.value; sel.innerHTML = [...ms].sort().reverse().map(m => `<option value="${m}">${mLabel(m)}</option>`).join(''); if (cur && [...sel.options].find(o => o.value === cur)) sel.value = cur; }
function renderIncome() {
    popMonthSel('i-month'); const m = document.getElementById('i-month').value;
    const f = db.income.filter(i => i.date?.startsWith(m)); const tot = f.reduce((s, i) => s + (+i.amount || 0), 0);
    const prev = db.income.filter(i => i.date?.startsWith(prevM(m))).reduce((s, i) => s + (+i.amount || 0), 0); const diff = tot - prev;
    document.getElementById('i-stats').innerHTML = `<div class="stat"><div class="sl">Total Income</div><div class="sv tgn">${fmt(tot)}</div><div class="ss">${f.length} entries</div></div><div class="stat"><div class="sl">vs Prev Month</div><div class="sv ${diff >= 0 ? 'tgn' : 'trd'}">${diff >= 0 ? '+' : ''}${fmt(diff)}</div></div><div class="stat"><div class="sl">Avg Entry</div><div class="sv">${fmt(f.length ? tot / f.length : 0)}</div></div>`;
    const tb = document.getElementById('i-tbody');
    if (!f.length) {
        tb.innerHTML = '<tr><td colspan="6"><div class="empty"><div class="et">No income this month</div></div></td></tr>';
    } else tb.innerHTML = [...f].sort((a, b) => b.date.localeCompare(a.date)).map(i => `<tr><td class="tdn">${i.source}</td><td><span class="tag tm">${i.category}</span></td><td>${new Date(i.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td><td class="tgn tbold">+${fmt(+i.amount)}</td><td>${i.recurring ? '<span class="bdg bp">⟳</span>' : '—'}</td><td><button class="btn btn-danger btn-xs" onclick="delInc('${i.id}')">Del</button></td></tr>`).join('');
    dc('icat'); const bc = {}; f.forEach(i => { bc[i.category] = (bc[i.category] || 0) + (+i.amount || 0); }); const cats = Object.keys(bc);
    if (cats.length) {
        const cols = ['#22d3a0', '#7c5cfc', '#fbbf24', '#60a5fa', '#fb923c', '#f87171']; const dk = document.documentElement.getAttribute('data-theme') === 'dark';
        CH['icat'] = new Chart(document.getElementById('ch-icat'), { type: 'doughnut', data: { labels: cats, datasets: [{ data: cats.map(c => bc[c]), backgroundColor: cats.map((_, i) => cols[i % cols.length]), borderWidth: 2, borderColor: dk ? '#090910' : '#f2f2f8' }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'right', labels: { color: 'rgba(144,144,176,.8)', font: { family: 'DM Mono', size: 10 } } }, tooltip: { callbacks: { label: c => fmt(c.raw) } } } } });
    }
    dc('itrend'); const ms = []; for (let i = 5; i >= 0; i--) { const d = new Date(); d.setMonth(d.getMonth() - i); ms.push(d.toISOString().slice(0, 7)); }
    CH['itrend'] = new Chart(document.getElementById('ch-itrend'), { type: 'line', data: { labels: ms.map(m => mLabel(m)), datasets: [{ label: 'Income', data: ms.map(m => mInc(m)), borderColor: '#22d3a0', backgroundColor: 'rgba(34,211,160,.08)', fill: true, tension: .4, pointRadius: 3 }] }, options: { ...co(), responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.raw) } } }, scales: { x: co().scales.x, y: { ...co().scales.y, ticks: { ...co().scales.y.ticks, callback: v => fmtS(v) } } } } });
}

// ─── EXPENSES ─────────────────────────────
function renderExpenses() {
    popMonthSel('e-month'); const m = document.getElementById('e-month').value, srch = (document.getElementById('e-srch').value || '').toLowerCase();
    let f = db.expenses.filter(e => e.date?.startsWith(m)); if (srch) f = f.filter(e => e.description.toLowerCase().includes(srch) || e.category.toLowerCase().includes(srch));
    const tot = f.reduce((s, e) => s + (+e.amount || 0), 0), sr = SR(m);
    document.getElementById('e-stats').innerHTML = `<div class="stat"><div class="sl">Total Expenses</div><div class="sv trd">${fmt(tot)}</div><div class="ss">${f.length} entries</div></div><div class="stat"><div class="sl">Savings Rate</div><div class="sv ${sr >= 0 ? 'tgn' : 'trd'}">${sr}%</div></div><div class="stat"><div class="sl">Largest Expense</div><div class="sv">${fmt(f.length ? Math.max(...f.map(e => +e.amount)) : 0)}</div></div>`;
    const tb = document.getElementById('e-tbody');
    if (!f.length) {
        tb.innerHTML = '<tr><td colspan="5"><div class="empty"><div class="et">No expenses</div></div></td></tr>';
    } else tb.innerHTML = [...f].sort((a, b) => b.date.localeCompare(a.date)).map(e => `<tr><td class="tdn">${e.description}</td><td><span class="tag to">${e.category}</span></td><td>${new Date(e.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td><td class="trd tbold">−${fmt(+e.amount)}</td><td><button class="btn btn-danger btn-xs" onclick="delExp('${e.id}')">Del</button></td></tr>`).join('');
    dc('ecat'); const bc = {}; f.forEach(e => { bc[e.category] = (bc[e.category] || 0) + (+e.amount || 0); }); const cats = Object.keys(bc).sort((a, b) => bc[b] - bc[a]);
    if (cats.length) {
        const cols = ['#f87171', '#fb923c', '#fbbf24', '#7c5cfc', '#60a5fa', '#22d3a0', '#a78bfa', '#34d399', '#f43f5e', '#e879f9'];
        CH['ecat'] = new Chart(document.getElementById('ch-ecat'), { type: 'bar', data: { labels: cats, datasets: [{ data: cats.map(c => bc[c]), backgroundColor: cats.map((_, i) => cols[i % cols.length]), borderRadius: 4 }] }, options: { ...co(), indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.raw) } } }, scales: { x: { ...co().scales.x, ticks: { ...co().scales.x.ticks, callback: v => fmtS(v) } }, y: co().scales.y } } });
    }
}

// ─── BUDGET ───────────────────────────────
const BCATS = ['Rent/Housing', 'EMI', 'Groceries', 'Utilities', 'Transport', 'Food & Dining', 'Entertainment', 'Healthcare', 'Insurance', 'Education', 'Shopping', 'Travel', 'Other'];
function renderBudget() {
    popMonthSel('b-month'); const m = document.getElementById('b-month').value;
    const tb = Object.values(db.budgets).reduce((s, v) => s + (+v || 0), 0), ta = mExp(m), rem = tb - ta;
    document.getElementById('b-stats').innerHTML = `<div class="stat"><div class="sl">Total Budget</div><div class="sv">${fmt(tb)}</div></div><div class="stat"><div class="sl">Total Spent</div><div class="sv trd">${fmt(ta)}</div></div><div class="stat"><div class="sl">Remaining</div><div class="sv ${rem >= 0 ? 'tgn' : 'trd'}">${fmt(rem)}</div></div>`;
    const ebc = {}; db.expenses.filter(e => e.date?.startsWith(m)).forEach(e => { ebc[e.category] = (ebc[e.category] || 0) + (+e.amount || 0); });
    const cats = BCATS.filter(c => db.budgets[c] || ebc[c]);
    document.getElementById('b-rows').innerHTML = cats.map(c => { const bgt = +db.budgets[c] || 0, act = ebc[c] || 0, pct = bgt ? Math.min(100, Math.round(act / bgt * 100)) : 0, over = act > bgt && bgt > 0; return `<div class="bdr"><div class="bdh"><div class="bdn">${c}</div><div class="bdv">${fmt(act)} / ${bgt ? fmt(bgt) : 'No budget'}</div></div>${bgt ? `<div class="pb"><div class="pf" style="width:${pct}%;background:${over ? '#f87171' : pct > 80 ? '#fbbf24' : '#22d3a0'}"></div></div><div class="pm"><span>${pct}% used</span><span class="${over ? 'trd' : 'tgn'}">${over ? 'Over by ' + fmt(act - bgt) : fmt(bgt - act) + ' left'}</span></div>` : ''}</div>`; }).join('') || '<div class="empty"><div class="et">Set budgets in Settings</div></div>';
    dc('budget'); const acs = BCATS.filter(c => db.budgets[c] || ebc[c]).slice(0, 8);
    if (acs.length) CH['budget'] = new Chart(document.getElementById('ch-budget'), { type: 'bar', data: { labels: acs, datasets: [{ label: 'Budget', data: acs.map(c => +db.budgets[c] || 0), backgroundColor: 'rgba(124,92,252,.4)', borderRadius: 4 }, { label: 'Actual', data: acs.map(c => ebc[c] || 0), backgroundColor: 'rgba(248,113,113,.6)', borderRadius: 4 }] }, options: { ...co(), responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { ...co().plugins, tooltip: { callbacks: { label: c => fmt(c.raw) } } }, scales: { x: { ...co().scales.x, ticks: { ...co().scales.x.ticks, callback: v => fmtS(v) } }, y: co().scales.y } } });
}

// ─── SETTINGS ACTIONS ──────────────────────
function exportCSV(type) {
    let arr = type === 'assets' ? db.assets : type === 'income' ? db.income : db.expenses;
    if (!arr.length) return toast('No ' + type + ' to export', 'error');
    const cols = Object.keys(arr[0]).filter(k => k !== 'id');
    const csv = [cols.join(',')].concat(arr.map(r => cols.map(c => `"${(r[c] || '').toString().replace(/"/g, '""')}"`).join(','))).join('\n');
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `fintrack_${type}_${today()}.csv`; a.click();
}
function exportData() {
    const a = document.createElement('a'); a.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(db));
    a.download = `fintrack_backup_${today()}.json`; a.click();
}
function importJSON(el) {
    const f = el.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.assets || !data.settings) throw new Error('Invalid FinTrack JSON');
            await API.post('/api/clear-all', {});
            for (const a of data.assets) await API.post('/api/assets', a);
            for (const l of data.liabilities) await API.post('/api/liabilities', l);
            for (const i of data.income) await API.post('/api/income', i);
            for (const x of data.expenses) await API.post('/api/expenses', x);
            for (const g of data.goals) await API.post('/api/goals', g);
            for (const b of data.bills) await API.post('/api/bills', b);
            for (const s of data.snapshots) await API.post('/api/snapshots', s);
            await API.post('/api/settings', data.settings);
            await API.post('/api/budgets', data.settings.budgets || {});
            await refresh(); go('dashboard'); toast('Backup Restored');
        } catch (err) { toast('Error parsing JSON backup', 'error'); }
    };
    r.readAsText(f);
}

async function importCSV(type, el) {
    const f = el.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async (e) => {
        try {
            const text = e.target.result;
            const rows = text.split(/\r?\n/).filter(l => l.trim());
            if (rows.length < 2) throw new Error('CSV file is empty');

            const delimiter = (rows[0].split('\t').length > rows[0].split(',').length) ? '\t' : ',';
            const normalize = h => h.toLowerCase().replace(/[^a-z0-9]/g, '');
            const parseRow = (row) => {
                if (delimiter === '\t') return row.split('\t').map(c => c.trim());
                const cols = []; let cur = '', inQ = false;
                for (let i = 0; i < row.length; i++) {
                    const c = row[i];
                    if (c === '"') inQ = !inQ;
                    else if (c === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
                    else cur += c;
                }
                cols.push(cur.trim());
                return cols;
            };

            // Find header row (check first 20 rows)
            const keywords = ['name', 'stock', 'qty', 'amount', 'value', 'price', 'date', 'category'];
            let headerIdx = 0, maxScore = -1;
            for (let i = 0; i < Math.min(rows.length, 20); i++) {
                const cells = parseRow(rows[i]).map(normalize);
                const score = keywords.filter(k => cells.some(c => c.includes(k))).length;
                if (score > maxScore) { maxScore = score; headerIdx = i; }
            }

            const headers = parseRow(rows[headerIdx]).map(normalize);
            const dataRows = rows.slice(headerIdx + 1);
            const col = (...aliases) => {
                for (const a of aliases) {
                    const idx = headers.findIndex(h => h.includes(a));
                    if (idx !== -1) return idx;
                }
                return -1;
            };

            let count = 0;
            for (const rowText of dataRows) {
                const cells = parseRow(rowText);
                if (cells.length < 1) continue;

                if (type === 'assets') {
                    const nameI = col('name', 'stock', 'asset', 'title', 'security', 'scrip');
                    const valueI = col('value', 'amount', 'currentvalue', 'balance', 'price');
                    const costI = col('cost', 'purchase', 'buyprice', 'invested');
                    const classI = col('class', 'type', 'category');
                    const dateI = col('date', 'purchase date', 'acquired');
                    const qtyI = col('qty', 'quantity', 'units');
                    const tickerI = col('ticker', 'symbol', 'code');

                    if (nameI === -1 || !cells[nameI]) continue;
                    const cleanNum = s => s ? parseFloat(s.toString().replace(/[^0-9.-]/g, '')) || 0 : 0;

                    const item = {
                        name: cells[nameI],
                        assetClass: classI !== -1 ? cells[classI] : 'Other',
                        value: valueI !== -1 ? cleanNum(cells[valueI]) : 0,
                        cost: costI !== -1 ? cleanNum(cells[costI]) : 0,
                        purchaseDate: dateI !== -1 ? cells[dateI] : today(),
                        quantity: qtyI !== -1 ? cleanNum(cells[qtyI]) : 0,
                        ticker: tickerI !== -1 ? cells[tickerI] : '',
                        notes: 'Imported via CSV'
                    };
                    await API.post('/api/assets', item);
                } else if (type === 'expenses') {
                    const titleI = col('description', 'title', 'name', 'payee', 'memo');
                    const amountI = col('amount', 'value', 'price', 'cost');
                    const catI = col('category', 'type', 'class');
                    const dateI = col('date', 'time', 'added');

                    if (amountI === -1 || !cells[amountI]) continue;
                    const cleanNum = s => s ? Math.abs(parseFloat(s.toString().replace(/[^0-9.-]/g, ''))) || 0 : 0;
                    
                    const amt = cleanNum(cells[amountI]);
                    if (!amt) continue;

                    const item = {
                        title: titleI !== -1 ? cells[titleI] : 'Expense',
                        amount: amt,
                        category: catI !== -1 ? cells[catI] : 'Miscellaneous',
                        date: dateI !== -1 ? cells[dateI] : today(),
                        recurring: false
                    };
                    await API.post('/api/expenses', item);
                }
                count++;
            }

            await refresh();
            toast(`Imported ${count} ${type} successfully`, 'success');
            el.value = ''; 
        } catch (err) {
            console.error(err);
            toast('Failed to parse CSV: ' + err.message, 'error');
        }
    };
    r.readAsText(f);
}

async function clearAll() {
    await API.post('/api/clear-all', {});
    const rInp = document.getElementById('reset-confirm-input');
    if (rInp) { rInp.value = ''; checkReset(''); }
    await refresh();
    toast('All data reset');
    switchSettingsTab('finprofile', document.querySelector('.st-item'));
}

function switchSettingsTab(tabId, mnu) {
    document.querySelectorAll('.settings-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.st-item').forEach(i => i.classList.remove('active'));
    document.getElementById('st-' + tabId).classList.add('active');
    mnu.classList.add('active');
}

function checkReset(val) {
    const btn = document.getElementById('btn-reset-data');
    if (btn) btn.disabled = (val !== 'RESET');
}

function checkDeleteAccount(val) {
    const btn = document.getElementById('btn-delete-account');
    if (btn) {
        btn.disabled = (val !== 'DELETE');
        btn.style.opacity = val === 'DELETE' ? '1' : '0.6';
    }
}

async function deleteAccount() {
    if (!confirm('This will permanently delete your account and ALL data. Are you absolutely sure?')) return;
    try {
        await API.post('/api/auth/delete-account', {});
        window.location.href = '/login';
    } catch (e) {
        toast('Failed to delete account. Please try again.', 'error');
    }
}

async function saveProfile() {
    const display = document.getElementById('p-display').value.trim();
    const email = document.getElementById('p-email').value.trim();
    const photo = document.getElementById('p-photo').value.trim();
    try {
        const r = await API.post('/api/auth/update-profile', { displayName: display, email, profilePicture: photo });
        const data = await r.json();
        if (data.success) {
            toast('Profile saved!');
            await loadDB();
        } else { toast(data.error || 'Failed to save profile', 'error'); }
    } catch (e) { toast('Error saving profile', 'error'); }
}

async function syncGoogleProfile() {
    try {
        const r = await API.post('/api/auth/sync-google-profile', {});
        const data = await r.json();
        if (data.success) {
            toast('Synced from Google!');
            await loadDB();
            renderSett();
        } else {
            toast(data.message || 'Could not sync from Google', 'info');
        }
    } catch (e) { toast('Error syncing from Google', 'error'); }
}

async function changePassword() {
    const oldP = document.getElementById('sec-old').value;
    const newP = document.getElementById('sec-new').value;
    const conf = document.getElementById('sec-confirm').value;
    const msg = document.getElementById('sec-msg');
    msg.style.display = 'block';
    if (!oldP || !newP) { msg.style.color = 'var(--rd)'; msg.textContent = 'All fields required.'; return; }
    if (newP !== conf) { msg.style.color = 'var(--rd)'; msg.textContent = 'Passwords do not match.'; return; }
    if (newP.length < 6) { msg.style.color = 'var(--rd)'; msg.textContent = 'Password must be at least 6 characters.'; return; }
    try {
        const r = await API.post('/api/auth/change-password', { oldPassword: oldP, newPassword: newP });
        const data = await r.json();
        if (data.success) {
            msg.style.color = 'var(--gn)'; msg.textContent = '✓ Password updated successfully!';
            document.getElementById('sec-old').value = '';
            document.getElementById('sec-new').value = '';
            document.getElementById('sec-confirm').value = '';
        } else { msg.style.color = 'var(--rd)'; msg.textContent = data.error || 'Failed to update password.'; }
    } catch (e) { msg.style.color = 'var(--rd)'; msg.textContent = 'Error updating password.'; }
}

function saveCurrency() {
    const base = document.getElementById('fx-base').value;
    const sym = document.getElementById('fx-symbol').value || '₹';
    localStorage.setItem('ft_currency_base', base);
    localStorage.setItem('ft_currency_sym', sym);
    toast('Currency settings saved!');
    renderPage(curPage);
}

async function fetchFXRates() {
    try {
        const r = await fetch('/api/auth/fx-rates');
        const data = await r.json();
        if (data.rates) {
            fxRates = data.rates;
            console.log('FX rates updated:', new Date().toLocaleTimeString());
            if (curPage === 'settings') renderSett();
            // Re-render current page if it affects totals
            if (['dashboard', 'wealth', 'cashflow'].includes(curPage)) renderPage(curPage);
        }
    } catch (e) { console.warn('Failed to fetch FX rates:', e); }
}

function sendSharedInvite() {
    const email = document.getElementById('share-email').value.trim();
    const role = document.getElementById('share-role').value;
    if (!email || !email.includes('@')) { toast('Enter a valid email', 'error'); return; }
    toast(`Invite sent to ${email} as ${role}! (Coming soon — shared access feature in development)`);
    document.getElementById('share-email').value = '';
}


// ─── GOALS ────────────────────────────────
function renderGoals() {
    const onT = db.goals.filter(g => (+g.current || 0) / (+g.target || 1) >= 0.5).length;
    document.getElementById('g-stats').innerHTML = `<div class="stat"><div class="sl">Total Goals</div><div class="sv">${db.goals.length}</div></div><div class="stat"><div class="sl">On Track</div><div class="sv tgn">${onT}</div></div><div class="stat"><div class="sl">Total Target</div><div class="sv">${fmt(db.goals.reduce((s, g) => s + (+g.target || 0), 0))}</div></div>`;
    const el = document.getElementById('g-list');
    if (!db.goals.length) { el.innerHTML = '<div class="card" style="grid-column:1/-1"><div class="empty"><div class="ei2">◎</div><div class="et">No goals yet</div><button class="btn btn-primary" onclick="openModal(\'ov-goal\');resetModal(\'goal\')">+ Add Goal</button></div></div>'; return; }
    el.innerHTML = db.goals.map(g => {
        const pct = Math.min(100, Math.round((+g.current || 0) / (+g.target || 1) * 100)), rem = Math.max(0, (+g.target || 0) - (+g.current || 0));
        const col = pct >= 80 ? '#22d3a0' : pct >= 50 ? '#fbbf24' : '#7c5cfc'; const pc = { High: 'br', Medium: 'by', Low: 'bg' }[g.priority] || 'by';
        const months = g.targetDate ? Math.max(1, Math.round((new Date(g.targetDate) - Date.now()) / 2592e6)) : null;
        const sipN = months && rem > 0 ? rem / months : null;
        return `<div class="card"><div class="fb mb12"><div><div style="font-family:Syne,sans-serif;font-weight:700;font-size:15px">${g.name}</div><div class="mt8 fw"><span class="tag to">${g.category}</span><span class="bdg ${pc}">${g.priority}</span></div></div><span style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;color:${col}">${pct}%</span></div><div class="pb" style="height:7px"><div class="pf" style="width:${pct}%;background:${col}"></div></div><div class="pm"><span>${fmt(+g.current || 0)}</span><span>${fmt(+g.target || 0)}</span></div>${sipN ? `<div class="tsm mt8">Need ≈ ${fmt(sipN)}/mo to reach goal</div>` : ''}<div class="div"></div><div class="fb tsm mb8"><span>Still needed: <strong style="color:var(--text)">${fmt(rem)}</strong></span><span>${g.targetDate ? 'By ' + new Date(g.targetDate + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'No deadline'}</span></div><div class="fg2"><input type="number" id="gu-${g.id}" value="${g.current || 0}" style="flex:1;padding:5px 9px;font-size:11px"/><button class="btn btn-success btn-sm" onclick="updGoal('${g.id}')">Update</button><button class="btn btn-ghost btn-sm" onclick="editGoal('${g.id}')">Edit</button><button class="btn btn-danger btn-sm" onclick="delGoal('${g.id}')">Del</button></div></div>`;
    }).join('');
}

// ─── TAX ──────────────────────────────────
function renderTax() {
    const ai = db.settings.annualIncome || 0;
    const cls80c = ['EPF/PPF', 'NPS']; const c80 = Math.min(150000, db.assets.filter(a => cls80c.includes(a.assetClass)).reduce((s, a) => s + (+a.cost || 0), 0));
    const c80p = Math.min(100, Math.round(c80 / 150000 * 100)), c80r = Math.max(0, 150000 - c80);
    document.getElementById('t-stats').innerHTML = `<div class="stat"><div class="sl">Annual Income</div><div class="sv">${fmt(ai)}</div><div class="ss">Set in Settings</div></div><div class="stat"><div class="sl">80C Used</div><div class="sv tgn">${fmt(c80)}</div><div class="ss">of ₹1.5L limit</div></div><div class="stat"><div class="sl">80C Remaining</div><div class="sv ${c80r > 0 ? 'tyw' : 'tgn'}">${fmt(c80r)}</div></div>`;
    document.getElementById('t-80c').innerHTML = `<div class="fb mb8"><span class="tsm">80C Utilization: ${c80p}%</span><span class="tsm ${c80r > 0 ? 'tyw' : 'tgn'}">${c80r > 0 ? fmt(c80r) + ' remaining' : 'Fully utilized ✓'}</span></div><div class="pb mb12" style="height:7px"><div class="pf" style="width:${c80p}%;background:${c80p >= 100 ? '#22d3a0' : c80p > 50 ? '#fbbf24' : '#f87171'}"></div></div>${db.assets.filter(a => cls80c.includes(a.assetClass)).map(a => `<div class="ai"><div><div class="an">${a.name}</div><div class="ap">${a.assetClass}</div></div><span style="font-size:11px;font-weight:600">${fmt(+a.cost || 0)}</span></div>`).join('') || '<div class="tsm">Add EPF/PPF/NPS assets to track 80C</div>'}${c80r > 0 ? `<div class="wbox mt12">💡 Invest ${fmt(c80r)} more in ELSS/PPF/NPS to maximise 80C</div>` : ''}`;
    const now = Date.now(); const cgas = db.assets.filter(a => a.purchaseDate && a.cost && a.value).map(a => { const days = (now - new Date(a.purchaseDate + 'T00:00:00')) / 864e5; const gain = (+a.value || 0) - (+a.cost || 0); const isL = ((a.assetClass === 'Equity' || a.assetClass === 'Mutual Funds') && days > 365) || (a.assetClass === 'Real Estate' && days > 730) || days > 1095; return { ...a, gain, isL, days, tr: isL ? ((a.assetClass === 'Equity' || a.assetClass === 'Mutual Funds') ? 10 : 20) : (a.assetClass === 'Equity' || a.assetClass === 'Mutual Funds' ? 15 : 30) }; });
    const stcg = cgas.filter(a => !a.isL && a.gain > 0).reduce((s, a) => s + a.gain, 0), ltcg = cgas.filter(a => a.isL && a.gain > 0).reduce((s, a) => s + a.gain, 0);
    document.getElementById('t-cg').innerHTML = `<div class="fr mb12"><div class="stat" style="padding:11px"><div class="sl">STCG</div><div class="sv tyw">${fmt(stcg)}</div></div><div class="stat" style="padding:11px"><div class="sl">LTCG</div><div class="sv tgn">${fmt(ltcg)}</div></div></div><div class="tw"><table><thead><tr><th>Asset</th><th>Days Held</th><th>Type</th><th>Gain/Loss</th><th>Tax Rate</th></tr></thead><tbody>${cgas.map(a => `<tr><td class="tdn">${a.name}</td><td>${Math.floor(a.days)}</td><td><span class="bdg ${a.isL ? 'bg' : 'by'}">${a.isL ? 'LTCG' : 'STCG'}</span></td><td class="${a.gain >= 0 ? 'tgn' : 'trd'}">${a.gain >= 0 ? '+' : ''}${fmt(a.gain)}</td><td>${a.tr}%</td></tr>`).join('') || '<tr><td colspan="5" class="tsm" style="text-align:center;padding:12px">Add purchase dates to assets for CG analysis</td></tr>'}</tbody></table></div>`;
    const npsA = db.assets.filter(a => a.assetClass === 'NPS').reduce((s, a) => s + (+a.cost || 0), 0);
    const hlI = db.liabilities.filter(l => l.type === 'Home Loan').reduce((s, l) => s + (+l.amount || 0) * (+l.rate || 0) / 100, 0);
    const totalDed = c80 + Math.min(50000, npsA) + Math.min(200000, hlI);
    document.getElementById('t-ded').innerHTML = `<div class="ai"><div>80C (EPF/PPF/ELSS)</div><div class="tbold tgn">${fmt(c80)}</div></div><div class="ai"><div>80CCD(1B) — NPS</div><div class="tbold tgn">${fmt(Math.min(50000, npsA))}</div></div><div class="ai"><div>24(b) — Home Loan Interest</div><div class="tbold tgn">${fmt(Math.min(200000, hlI))}</div></div><div class="ai"><div class="tbold">Total Deductions</div><div class="tbold tac">${fmt(totalDed)}</div></div>`;
    const txbl = Math.max(0, ai - totalDed); let tax = 0; if (txbl > 1500000) tax = 150000 + (txbl - 1500000) * .3; else if (txbl > 1200000) tax = 90000 + (txbl - 1200000) * .2; else if (txbl > 900000) tax = 45000 + (txbl - 900000) * .15; else if (txbl > 600000) tax = 15000 + (txbl - 600000) * .1; else if (txbl > 300000) tax = (txbl - 300000) * .05;
    const cess = tax * .04;
    document.getElementById('t-est').innerHTML = `<div class="ai"><div>Taxable Income</div><div class="tbold">${fmt(txbl)}</div></div><div class="ai"><div>Income Tax</div><div class="tbold trd">${fmt(tax)}</div></div><div class="ai"><div>Health & Ed. Cess (4%)</div><div class="tbold trd">${fmt(cess)}</div></div><div class="ai"><div class="tbold">Total Tax Liability</div><div class="tbold trd" style="font-size:15px">${fmt(tax + cess)}</div></div><div class="ibox mt12">Simplified estimate (Old Regime). Consult a CA for precise planning.</div>`;
}

// ─── ANALYTICS ────────────────────────────
function switchTab(t, el) { document.querySelectorAll('#page-analytics .tab').forEach(x => x.classList.remove('active')); el.classList.add('active');['portfolio', 'performance', 'sip'].forEach(x => document.getElementById('tab-' + x).style.display = x === t ? 'block' : 'none'); if (t === 'portfolio') renderPortfolio(); else if (t === 'performance') renderPerf(); else { calcSIP(); calcLS(); calcGR(); } }
function renderPortfolio() {
    const ta = TA(), pl = db.assets.reduce((s, a) => s + ((+a.value || 0) - (+a.cost || 0)), 0), cost = db.assets.reduce((s, a) => s + (+a.cost || 0), 0);
    document.getElementById('an-stats').innerHTML = `<div class="stat"><div class="sl">Invested</div><div class="sv">${fmt(cost)}</div></div><div class="stat"><div class="sl">Current</div><div class="sv">${fmt(ta)}</div></div><div class="stat"><div class="sl">Total P&L</div><div class="sv ${pl >= 0 ? 'tgn' : 'trd'}">${fmt(pl)}</div></div><div class="stat"><div class="sl">Overall Return</div><div class="sv ${pl >= 0 ? 'tgn' : 'trd'}">${cost ? ((pl / cost) * 100).toFixed(1) + '%' : '—'}</div></div>`;
    const tb = document.getElementById('an-tbody');
    if (!db.assets.length) { tb.innerHTML = '<tr><td colspan="6"><div class="empty"><div class="et">No assets</div></div></td></tr>'; return; }
    tb.innerHTML = [...db.assets].sort((a, b) => (+b.value) - (+a.value)).map(a => { const pl = (+a.value || 0) - (+a.cost || 0); const yrs = a.purchaseDate ? ((Date.now() - new Date(a.purchaseDate + 'T00:00:00')) / 315576e5) : null; const cg = cagr(+a.cost, +a.value, yrs); return `<tr><td class="tdn">${a.name}</td><td><span class="tag ${CT[a.assetClass] || 'to'}">${a.assetClass}</span></td><td>${a.cost ? fmt(+a.cost) : '—'}</td><td class="tbold">${fmt(+a.value)}</td><td class="${pl >= 0 ? 'tgn' : 'trd'}">${a.cost ? (pl >= 0 ? '+' : '') + fmt(pl) + ' (' + ((pl / +a.cost) * 100).toFixed(1) + '%)' : '—'}</td><td>${cg != null ? `<span class="bdg ${cg >= 0 ? 'bg' : 'br'}">${cg.toFixed(1)}% CAGR</span>` : '—'}</td></tr>`; }).join('');
    dc('comp'); const bc = {}; db.assets.forEach(a => { bc[a.assetClass] = (bc[a.assetClass] || 0) + (+a.value || 0); }); const cls = Object.keys(bc);
    if (cls.length) CH['comp'] = new Chart(document.getElementById('ch-comp'), { type: 'polarArea', data: { labels: cls, datasets: [{ data: cls.map(c => bc[c]), backgroundColor: cls.map(c => (CC[c] || '#94a3b8') + '99'), borderColor: cls.map(c => CC[c] || '#94a3b8'), borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { r: { ticks: { color: 'rgba(144,144,176,.6)', font: { size: 8 } }, grid: { color: 'rgba(44,44,58,.4)' } } }, plugins: { legend: { labels: { color: 'rgba(144,144,176,.8)', font: { family: 'DM Mono', size: 10 } } }, tooltip: { callbacks: { label: c => fmt(c.raw) } } } } });
}
function renderPerf() {
    dc('pnw'); let snaps = [...db.snapshots, { date: Date.now(), netWorth: NW(), totalAssets: TA() }].sort((a, b) => a.date - b.date);
    CH['pnw'] = new Chart(document.getElementById('ch-pnw'), { type: 'line', data: { labels: snaps.map(s => new Date(s.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })), datasets: [{ label: 'Net Worth', data: snaps.map(s => s.netWorth), borderColor: '#7c5cfc', backgroundColor: 'rgba(124,92,252,.07)', fill: true, tension: .4, pointRadius: 3 }] }, options: { ...co(), responsive: true, maintainAspectRatio: false, plugins: { ...co().plugins, tooltip: { callbacks: { label: c => fmt(c.raw) } } }, scales: { x: co().scales.x, y: { ...co().scales.y, ticks: { ...co().scales.y.ticks, callback: v => fmtS(v) } } } } });
    dc('sav'); const ms = []; for (let i = 11; i >= 0; i--) { const d = new Date(); d.setMonth(d.getMonth() - i); ms.push(d.toISOString().slice(0, 7)); }
    CH['sav'] = new Chart(document.getElementById('ch-sav'), { type: 'bar', data: { labels: ms.map(m => mLabel(m)), datasets: [{ label: 'Savings', data: ms.map(m => Math.max(0, mInc(m) - mExp(m))), backgroundColor: ms.map(m => (mInc(m) - mExp(m)) >= 0 ? 'rgba(34,211,160,.7)' : 'rgba(248,113,113,.6)'), borderRadius: 4 }] }, options: { ...co(), responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.raw) } } }, scales: { x: co().scales.x, y: { ...co().scales.y, ticks: { ...co().scales.y.ticks, callback: v => fmtS(v) } } } } });
    dc('estack'); const cats = ['Rent/Housing', 'EMI', 'Groceries', 'Utilities', 'Food & Dining', 'Transport'].slice(0, 4); const last6 = ms.slice(-6); const cols = ['#7c5cfc', '#22d3a0', '#fbbf24', '#f87171'];
    CH['estack'] = new Chart(document.getElementById('ch-estack'), { type: 'bar', data: { labels: last6.map(m => mLabel(m)), datasets: cats.map((cat, i) => ({ label: cat, data: last6.map(m => db.expenses.filter(e => e.date?.startsWith(m) && e.category === cat).reduce((s, e) => s + (+e.amount || 0), 0)), backgroundColor: cols[i] + 'aa', borderRadius: 2 })) }, options: { ...co(), responsive: true, maintainAspectRatio: false, scales: { x: { ...co().scales.x, stacked: true }, y: { ...co().scales.y, stacked: true, ticks: { ...co().scales.y.ticks, callback: v => fmtS(v) } } } } });
}
function calcSIP() {
    const m = +document.getElementById('sip-a').value || 0, r = (+document.getElementById('sip-r').value || 12) / 100 / 12, y = +document.getElementById('sip-y').value || 0, su = (+document.getElementById('sip-s').value || 0) / 100; const n = y * 12; let fv = 0, inv = 0, mi = m; const yly = []; for (let yr = 1; yr <= y; yr++) { for (let mo = 0; mo < 12; mo++) { fv = (fv + mi) * (1 + r); inv += mi; } yly.push(fv); mi *= (1 + su); } const ret = fv - inv; document.getElementById('sip-res').innerHTML = `<div class="siprw"><span>Total Invested</span><span class="tbold">${fmt(inv)}</span></div><div class="siprw"><span>Returns</span><span class="tbold tgn">+${fmt(ret)}</span></div><div class="siprw"><span>Future Value</span><span class="tbold tac" style="font-size:15px">${fmt(fv)}</span></div><div class="siprw"><span>Multiplier</span><span class="tbold">${inv ? (fv / inv).toFixed(2) + 'x' : '—'}</span></div>`;
    dc('sip'); if (yly.length) { const ivA = []; let ia = m * 12; for (let i = 0; i < y; i++) { ivA.push(ia); ia += m * 12 * (1 + su) ** i; } CH['sip'] = new Chart(document.getElementById('ch-sip'), { type: 'line', data: { labels: yly.map((_, i) => 'Yr ' + (i + 1)), datasets: [{ label: 'Future Value', data: yly, borderColor: '#7c5cfc', backgroundColor: 'rgba(124,92,252,.09)', fill: true, tension: .4, pointRadius: 0 }, { label: 'Invested', data: ivA, borderColor: 'rgba(34,211,160,.5)', backgroundColor: 'transparent', borderDash: [4, 4], pointRadius: 0 }] }, options: { ...co(), responsive: true, maintainAspectRatio: false, plugins: { ...co().plugins, tooltip: { callbacks: { label: c => fmt(c.raw) } } }, scales: { x: co().scales.x, y: { ...co().scales.y, ticks: { ...co().scales.y.ticks, callback: v => fmtS(v) } } } } }); }
}
function calcLS() { const a = +document.getElementById('ls-a').value || 0, r = +document.getElementById('ls-r').value || 12, y = +document.getElementById('ls-y').value || 10, inf = +document.getElementById('ls-i').value || 6; const fv = a * Math.pow(1 + r / 100, y), rfv = a * Math.pow(1 + (r - inf) / 100, y); document.getElementById('ls-res').innerHTML = `<div class="siprw"><span>Initial</span><span class="tbold">${fmt(a)}</span></div><div class="siprw"><span>Nominal FV</span><span class="tbold tac">${fmt(fv)}</span></div><div class="siprw"><span>Real Value (Inflation adj.)</span><span class="tbold tgn">${fmt(rfv)}</span></div><div class="siprw"><span>Total Return</span><span class="tbold tgn">+${fmt(fv - a)} (${((fv / a - 1) * 100).toFixed(1)}%)</span></div>`; }
function calcGR() { const t = +document.getElementById('gr-t').value || 0, y = +document.getElementById('gr-y').value || 10, r = (+document.getElementById('gr-r').value || 12) / 100 / 12, sv = +document.getElementById('gr-s').value || 0; const n = y * 12, rem = Math.max(0, t - sv * Math.pow(1 + r, n)); const mp = r ? rem * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : rem / n; document.getElementById('gr-res').innerHTML = `<div class="siprw"><span>Target</span><span class="tbold">${fmt(t)}</span></div><div class="siprw"><span>Savings FV at Goal Date</span><span class="tbold tgn">${fmt(sv * Math.pow(1 + r, n))}</span></div><div class="siprw"><span>Monthly SIP Needed</span><span class="tbold tac" style="font-size:15px">${fmt(mp)}/mo</span></div><div class="siprw"><span>Total to Invest</span><span class="tbold">${fmt(mp * n)}</span></div>`; }

// ─── BILLS ────────────────────────────────
function renderBills() {
    const tot = db.bills.reduce((s, b) => { const f = { Monthly: 1, Quarterly: 3, 'Half-Yearly': 6, Yearly: 12 }[b.frequency] || 1; return s + (+b.amount || 0) * 12 / f; }, 0) / 12;
    const urg = db.bills.filter(b => { const d = daysUntil(b); return d >= 0 && d <= 3; }).length;
    const w7 = db.bills.filter(b => { const d = daysUntil(b); return d >= 0 && d <= 7; }).length;
    document.getElementById('bl-stats').innerHTML = `<div class="stat"><div class="sl">Monthly Bills</div><div class="sv">${fmt(tot)}</div><div class="ss">${db.bills.length} bills</div></div><div class="stat"><div class="sl">Due This Week</div><div class="sv ${urg > 0 ? 'trd' : 'tgn'}">${w7}</div><div class="ss">${urg} urgent</div></div><div class="stat"><div class="sl">Annual Cost</div><div class="sv">${fmt(tot * 12)}</div></div>`;
    const el = document.getElementById('bl-list');
    if (!db.bills.length) { el.innerHTML = '<div class="empty"><div class="ei2">🔔</div><div class="et">No bills added</div><div class="es">Track recurring bills & subscriptions</div></div>'; }
    else el.innerHTML = db.bills.map(b => { const d = daysUntil(b); const dc2 = d <= 0 ? 'urg' : d <= 3 ? 'urg' : d <= 7 ? 'soon' : ''; const dt = d <= 0 ? 'Due today!' : d === 1 ? 'Tomorrow' : 'In ' + d + ' days'; return `<div class="br2"><div class="bl2"><div class="bi">${b.icon || '💳'}</div><div><div class="bn">${b.name}</div><div class="bd ${dc2}">${dt} · ${b.frequency}</div></div></div><div class="fg2"><span style="font-family:Syne,sans-serif;font-weight:700;font-size:13px">${fmt(+b.amount)}</span><button class="btn btn-ghost btn-xs" onclick="editBill('${b.id}')">Edit</button><button class="btn btn-danger btn-xs" onclick="delBill('${b.id}')">Del</button></div></div>`; }).join('');
    const upc = db.bills.map(b => ({ ...b, dl: daysUntil(b) })).filter(b => b.dl >= 0 && b.dl <= 7).sort((a, b) => a.dl - b.dl);
    document.getElementById('bl-due').innerHTML = upc.length ? upc.map(b => `<div class="fb" style="padding:7px 0;border-bottom:1px solid rgba(44,44,58,-3)"><div class="fg2"><span>${b.icon || '💳'}</span><div><div style="font-size:11px;font-weight:600">${b.name}</div><div class="tsm ${b.dl <= 3 ? 'trd' : 'tyw'}">${b.dl <= 0 ? 'Due today!' : b.dl === 1 ? 'Tomorrow' : 'In ' + b.dl + ' days'}</div></div></div><span style="font-size:12px;font-weight:700">${fmt(+b.amount)}</span></div>`).join('') : '<div class="tsm mt8">No bills due in next 7 days 🎉</div>';
    dc('bcat'); const bc = {}; db.bills.forEach(b => { bc[b.category] = (bc[b.category] || 0) + (+b.amount || 0); }); const cats = Object.keys(bc);
    if (cats.length) { const cols = ['#7c5cfc', '#22d3a0', '#fbbf24', '#60a5fa', '#fb923c', '#f87171']; const dk = document.documentElement.getAttribute('data-theme') === 'dark'; CH['bcat'] = new Chart(document.getElementById('ch-bcat'), { type: 'doughnut', data: { labels: cats, datasets: [{ data: cats.map(c => bc[c]), backgroundColor: cats.map((_, i) => cols[i % cols.length]), borderWidth: 2, borderColor: dk ? '#090910' : '#f2f2f8' }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'right', labels: { color: 'rgba(144,144,176,.8)', font: { family: 'DM Mono', size: 10 } } }, tooltip: { callbacks: { label: c => fmt(c.raw) } } } } }); }
}

// ─── SNAPSHOTS ────────────────────────────
async function takeSnap() { const snap = { id: uid(), date: Date.now(), netWorth: NW(), totalAssets: TA(), totalLiabilities: TL(), assetCount: db.assets.length, byClass: {} }; db.assets.forEach(a => { snap.byClass[a.assetClass] = (snap.byClass[a.assetClass] || 0) + (+a.value || 0); }); await API.post('/api/snapshots', snap); await loadDB(); toast('Snapshot saved!'); }
async function delSnap(id) { if (confirm('Delete snap?')) { await API.del(`/api/snapshots/${id}`); await loadDB(); toast('Deleted'); } }

// ─── SETTINGS ─────────────────────────────
function renderAdmin() {
    console.log("renderAdmin called");
    API.fetchAdminUsers().then(users => {
        console.log("Admin users fetched:", users);
        let h = '';
        let ta = 0, tl = 0;
        users.forEach(u => {
            ta += u.totalAssets || 0;
            tl += u.totalLiabilities || 0;
            const nw = u.netWorth || 0;
            const pic = u.profilePicture || '';
            const avatar = pic ? `<img src="${pic}" style="width:24px;height:24px;border-radius:50%;margin-right:8px;object-fit:cover;">` : `<div class="tp-avatar" style="width:24px;height:24px;font-size:10px;margin-right:8px;display:flex;align-items:center;justify-content:center;background:var(--bg3);border-radius:50%;">${(u.displayName||u.username||'?')[0].toUpperCase()}</div>`;
            
            h += `<tr>
                <td style="padding:12px;display:flex;align-items:center;border-bottom:1px solid var(--border);">
                    ${avatar}
                    <div>
                        <div style="font-weight:600;color:var(--text1)">${u.displayName || u.username}</div>
                        <div style="font-size:10px;color:var(--text3)">@${u.username}</div>
                    </div>
                </td>
                <td style="padding:12px;border-bottom:1px solid var(--border);">
                    <div style="font-size:11px;">${u.email || '<span style="color:var(--text3)">No Email</span>'}</div>
                    <div style="margin-top:4px;">${u.isAdmin ? '<span class="bdg gn" style="font-size:9px;">Admin</span>' : '<span class="bdg bg" style="font-size:9px;">User</span>'}</div>
                </td>
                <td style="padding:12px;text-align:right;font-family:'DM Mono',monospace;border-bottom:1px solid var(--border);">${fmt(u.totalAssets)}</td>
                <td style="padding:12px;text-align:right;font-family:'DM Mono',monospace;border-bottom:1px solid var(--border);">${fmt(u.totalLiabilities)}</td>
                <td style="padding:12px;text-align:right;font-weight:700;color:${nw>=0?'var(--gn)':'var(--rd)'};font-family:'DM Mono',monospace;border-bottom:1px solid var(--border);">${fmt(nw)}</td>
                <td style="padding:12px;text-align:center;border-bottom:1px solid var(--border);">
                    <button class="btn btn-ghost btn-sm" onclick="alert('User: ${u.username}')" style="padding:2px 8px;font-size:10px;">Details</button>
                </td>
            </tr>`;
        });
        document.getElementById('adm-user-list').innerHTML = h || '<tr><td colspan="6" class="empty">No users found</td></tr>';
        document.getElementById('adm-total-users').textContent = users.length;
        document.getElementById('adm-total-assets').textContent = fmt(ta);
        document.getElementById('adm-total-liabilities').textContent = fmt(tl);
    }).catch(err => {
        console.error("Admin fetch failed", err);
        toast("Admin access denied or server error", "error");
    });
}

function renderSett() {
    const s = db.settings || {};
    document.getElementById('s-inc').value = s.annualIncome || 0;
    document.getElementById('s-term').value = s.termInsurance || 0;
    document.getElementById('s-health').value = s.healthInsurance || 0;
    document.getElementById('s-em').value = s.emergencyMonths || 6;
    document.getElementById('bsetup').innerHTML = BCATS.map(c => `<div class="ai"><span>${c}</span><input type="number" class="b-inp" data-cat="${c}" value="${db.budgets[c] || 0}" style="width:100px;text-align:right"/></div>`).join('');
    // Populate Profile tab
    fetch('/api/auth/me', { credentials: 'include' }).then(r => r.json()).then(data => {
        if (data.loggedIn) {
            const dn = data.displayName || data.username || 'User';
            const el = document.getElementById('profile-display-name');
            const un = document.getElementById('profile-username');
            const av = document.getElementById('profile-avatar-big');
            const pd = document.getElementById('p-display');
            const pe = document.getElementById('p-email');
            const pp = document.getElementById('p-photo');
            const sgb = document.getElementById('btn-sync-google');

            if (el) el.textContent = dn;
            if (un) un.textContent = '@' + (data.username || '');
            if (av) {
                if (data.profilePicture) {
                    av.innerHTML = '<img src="' + data.profilePicture + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">';
                } else {
                    av.textContent = dn.charAt(0).toUpperCase();
                }
            }
            if (pd) pd.value = dn;
            if (pe) pe.value = data.email || '';
            if (pp) pp.value = data.profilePicture || '';
            if (sgb) sgb.style.display = data.googlePicture ? 'block' : 'none';
        }
    }).catch(() => { });
    // Populate Currency tab from localStorage
    const savedBase = localStorage.getItem('ft_currency_base') || 'INR';
    const savedSym = localStorage.getItem('ft_currency_sym') || '₹';
    const fxBase = document.getElementById('fx-base');
    const fxSym = document.getElementById('fx-symbol');
    if (fxBase) fxBase.value = savedBase;
    if (fxSym) fxSym.value = savedSym;

    // Update FX Table with live rates
    const fxTable = document.getElementById('fx-table-body');
    if (fxTable) {
        const currencies = [
            { code: 'USD', flag: '🇺🇸', name: 'US Dollar' },
            { code: 'EUR', flag: '🇪🇺', name: 'Euro' },
            { code: 'GBP', flag: '🇬🇧', name: 'British Pound' },
            { code: 'SGD', flag: '🇸🇬', name: 'Singapore Dollar' },
            { code: 'AED', flag: '🇦🇪', name: 'UAE Dirham' },
            { code: 'JPY', flag: '🇯🇵', name: 'Japanese Yen' },
            { code: 'CAD', flag: '🇨🇦', name: 'Canadian Dollar' },
            { code: 'AUD', flag: '🇦🇺', name: 'Australian Dollar' }
        ];

        // Rates relative to INR (current market rates)
        // Since fxRates are INR-based (1 INR = X USD), 1 USD = 1/X INR
        fxTable.innerHTML = currencies.map(c => {
            const rateVsINR = fxRates[c.code] ? (1 / fxRates[c.code]).toFixed(2) : '—';
            const rateVsUSD = (fxRates[c.code] / fxRates['USD']).toFixed(4);
            return `<tr>
                <td>${c.flag} ${c.code}</td>
                <td>${rateVsINR}</td>
                <td>${rateVsUSD}</td>
            </tr>`;
        }).join('');
    }
}

async function saveSett() {
    const s = { annualIncome: +document.getElementById('s-inc').value, termInsurance: +document.getElementById('s-term').value, healthInsurance: +document.getElementById('s-health').value, emergencyMonths: +document.getElementById('s-em').value, budgets: {} };
    document.querySelectorAll('.b-inp').forEach(i => { const v = +i.value; if (v > 0) s.budgets[i.getAttribute('data-cat')] = v; });
    await API.post('/api/settings', s); await loadDB(); toast('Settings saved');
}
const saveBudgets = saveSett;

// ─── MODALS ───────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function resetModal(t) {
    if (t === 'asset') { ['am-id', 'am-n', 'am-v', 'am-cost', 'am-d', 'am-q', 'am-ticker', 'am-note'].forEach(id => document.getElementById(id).value = ''); document.getElementById('am-c').selectedIndex = 0; }
    if (t === 'liab') { ['lm-id', 'lm-n', 'lm-a', 'lm-e', 'lm-r', 'lm-ten', 'lm-orig', 'lm-sd'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; }); document.getElementById('lm-t2').selectedIndex = 0; const h=document.getElementById('lm-emi-hint'); if(h) h.style.display='none'; }
    if (t === 'income') { ['im-id', 'im-src', 'im-a', 'im-d'].forEach(id => document.getElementById(id).value = ''); document.getElementById('im-cat').selectedIndex = 0; document.getElementById('im-rec').checked = false; }
    if (t === 'exp') { ['em-id', 'em-d', 'em-a', 'em-dt'].forEach(id => document.getElementById(id).value = ''); document.getElementById('em-cat').selectedIndex = 0; document.getElementById('em-rec').checked = false; }
    if (t === 'goal') { ['gm-id', 'gm-n', 'gm-target', 'gm-cur', 'gm-date'].forEach(id => document.getElementById(id).value = ''); document.getElementById('gm-pri').value = 'Medium'; }
    if (t === 'bill') { ['bm-id', 'bm-n', 'bm-a', 'bm-day'].forEach(id => document.getElementById(id).value = ''); document.getElementById('bm-cat').selectedIndex = 0; document.getElementById('bm-freq').value = 'Monthly'; }
}

// ─── CRUD OPS ─────────────────────────────
async function saveAsset() {
    const n = document.getElementById('am-n').value.trim(), v = +document.getElementById('am-v').value; if (!n || !v) { toast('Name/Value req', 'error'); return; }
    const id = document.getElementById('am-id').value, o = { name: n, assetClass: document.getElementById('am-c').value, value: v, cost: +document.getElementById('am-cost').value, purchaseDate: document.getElementById('am-d').value, qty: +document.getElementById('am-q').value || null, ticker: document.getElementById('am-ticker')?.value.trim() || null, notes: document.getElementById('am-note').value };
    if (id) await API.put(`/api/assets/${id}`, o); else await API.post('/api/assets', { id: uid(), ...o });
    closeModal('ov-asset'); await loadDB(); toast('Asset saved');
}
async function editAsset(id) { const a = db.assets.find(x => x.id === id); if (!a) return; document.getElementById('am-id').value = a.id; document.getElementById('am-n').value = a.name; document.getElementById('am-v').value = a.value; document.getElementById('am-c').value = a.assetClass; document.getElementById('am-cost').value = a.cost || ''; document.getElementById('am-d').value = a.purchaseDate || ''; document.getElementById('am-q').value = a.qty || ''; if (document.getElementById('am-ticker')) document.getElementById('am-ticker').value = a.ticker || ''; document.getElementById('am-note').value = a.notes || ''; openModal('ov-asset'); }
async function delAsset(id) { if (confirm('Delete?')) { await API.del(`/api/assets/${id}`); await loadDB(); toast('Deleted'); } }

async function syncPrices() {
    const btn = document.getElementById('btn-sync-prices');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Syncing…'; }
    try {
        const r = await API.post('/api/assets/sync-prices', {});
        const data = await r.json();
        await loadDB();
        if (curPage === 'wealth') renderWealth();
        toast(`✅ Synced ${data.updated || 0} prices` + (data.errors ? `, ${data.errors} errors` : ''));
    } catch (e) {
        toast('Price sync failed', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🔄 Refresh Prices'; }
    }
}

async function saveLiab() {
    const n = document.getElementById('lm-n').value.trim(), a = +document.getElementById('lm-a').value; if (!n || !a) { toast('Loan name and outstanding balance required', 'error'); return; }
    const orig = +document.getElementById('lm-orig').value || a;
    const id = document.getElementById('lm-id').value, o = {
        name: n, type: document.getElementById('lm-t2').value,
        amount: a, emi: +document.getElementById('lm-e').value,
        rate: +document.getElementById('lm-r').value, tenure: +document.getElementById('lm-ten').value,
        loanStartDate: document.getElementById('lm-sd').value || null,
        originalPrincipal: orig
    };
    if (id) await API.put(`/api/liabilities/${id}`, o); else await API.post('/api/liabilities', { id: uid(), ...o });
    closeModal('ov-liab'); await loadDB(); toast('Liability saved');
}
async function editLiab(id) {
    const l = db.liabilities.find(x => x.id === id); if (!l) return;
    document.getElementById('lm-id').value = l.id;
    document.getElementById('lm-n').value = l.name;
    document.getElementById('lm-a').value = l.amount;
    document.getElementById('lm-t2').value = l.type;
    document.getElementById('lm-e').value = l.emi || '';
    document.getElementById('lm-r').value = l.rate || '';
    document.getElementById('lm-ten').value = l.tenure || '';
    const origEl = document.getElementById('lm-orig'); if (origEl) origEl.value = l.originalPrincipal || l.amount || '';
    const sdEl = document.getElementById('lm-sd'); if (sdEl) sdEl.value = l.loanStartDate || '';
    document.getElementById('lm-t').textContent = 'Edit Liability';
    const h=document.getElementById('lm-emi-hint'); if(h) h.style.display='none';
    openModal('ov-liab');
}
async function delLiab(id) { if (confirm('Delete?')) { await API.del(`/api/liabilities/${id}`); await loadDB(); } }

// ─── EMI HELPERS ──────────────────────────
function calcEMI(principal, annualRate, tenureMonths) {
    if (!principal || !annualRate || !tenureMonths) return 0;
    const r = annualRate / 100 / 12;
    return principal * r * Math.pow(1 + r, tenureMonths) / (Math.pow(1 + r, tenureMonths) - 1);
}

function buildAmortizationSchedule(principal, annualRate, emi, tenureMonths, startDate) {
    const r = annualRate / 100 / 12;
    let balance = principal;
    const schedule = [];
    let date = startDate ? new Date(startDate + 'T00:00:00') : null;
    for (let m = 1; m <= tenureMonths && balance > 0.5; m++) {
        const interest = balance * r;
        const principalPaid = Math.min(balance, emi - interest);
        balance = Math.max(0, balance - principalPaid);
        const monthDate = date ? new Date(date.getFullYear(), date.getMonth() + m - 1, 1) : null;
        schedule.push({
            month: m,
            date: monthDate ? monthDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : `Month ${m}`,
            emi: emi,
            principal: principalPaid,
            interest: interest,
            balance: balance
        });
    }
    return schedule;
}

function getCurrentMonthIndex(loanStartDate) {
    if (!loanStartDate) return null;
    const start = new Date(loanStartDate + 'T00:00:00');
    const now = new Date();
    const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    return Math.max(0, months); // 0-indexed
}

function fmtN(n) {
    // Format as plain Indian number with commas (no abbreviation)
    if (n == null || isNaN(n)) return '0';
    return Math.round(n).toLocaleString('en-IN');
}

function openEMIDetail(loanId) {
    const l = db.liabilities.find(x => x.id === loanId);
    if (!l) return;
    const P = +l.originalPrincipal || +l.amount;
    const outstanding = +l.amount;
    const annualRate = +l.rate || 0;
    const tenure = +l.tenure || 0;
    let emi = +l.emi || 0;
    if (!emi && P && annualRate && tenure) emi = calcEMI(P, annualRate, tenure);
    if (!emi || !annualRate) {
        toast('Add EMI, rate & start date for full schedule', 'info'); return;
    }

    document.getElementById('emi-detail-title').textContent = l.name + ' — Loan Details';

    // Build schedule from original principal (full original tenure)
    const originalTenure = tenure + (l.loanStartDate ? getCurrentMonthIndex(l.loanStartDate) : 0);
    const schedule = buildAmortizationSchedule(P, annualRate, emi, originalTenure, l.loanStartDate);

    // Current month index
    const curIdx = l.loanStartDate ? getCurrentMonthIndex(l.loanStartDate) : null;
    const curRow = curIdx != null && schedule[curIdx] ? schedule[curIdx] : null;

    // ── Aggregate stats ──
    const totalPayment = emi * schedule.length;        // Total amount to pay (full loan)
    const totalInterest = totalPayment - P;             // Total interest on full loan
    const paidSoFar = P - outstanding;                  // Principal repaid so far
    const repaidPct = P > 0 ? Math.min(100, Math.round(paidSoFar / P * 100)) : 0;
    const pendingPct = 100 - repaidPct;

    // Pending interest = sum of interest from current row onwards
    const futureRows = curIdx != null ? schedule.slice(curIdx) : schedule;
    const pendingInterest = futureRows.reduce((s, r) => s + r.interest, 0);
    const totalPending = outstanding + pendingInterest;  // Outstanding principal + pending interest
    const monthsRemaining = tenure;

    // ── OVERVIEW STATS ──
    document.getElementById('emi-overview-stats').innerHTML = `
      <div class="stat"><div class="sl">Monthly EMI</div><div class="sv" style="color:var(--ac)">₹${fmtN(emi)}</div><div class="ss">${monthsRemaining} months left</div></div>
      <div class="stat"><div class="sl">Original Loan</div><div class="sv">₹${fmtN(P)}</div><div class="ss">at ${l.rate}% p.a.</div></div>
      <div class="stat"><div class="sl">Total Interest</div><div class="sv trd">₹${fmtN(Math.max(0,totalInterest))}</div><div class="ss">${P>0?((totalInterest/P)*100).toFixed(1):0}% of principal</div></div>`;

    // ── PENDING SUMMARY CARD ──
    const pendingCard = document.getElementById('emi-curmonth-card');
    pendingCard.innerHTML = `

      <!-- Section title -->
      <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:14px">
        ⏳ &nbsp;What's Still Pending
      </div>

      <!-- Row 1: % Pending + Months Remaining -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div style="background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.2);border-radius:12px;padding:14px 16px">
          <div style="font-size:10px;color:#f87171;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px">Loan Pending</div>
          <div style="font-size:30px;font-weight:800;color:#f87171;line-height:1">${pendingPct}%</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">${repaidPct}% already repaid</div>
        </div>
        <div style="background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);border-radius:12px;padding:14px 16px">
          <div style="font-size:10px;color:#fbbf24;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px">Months Remaining</div>
          <div style="font-size:30px;font-weight:800;color:#fbbf24;line-height:1">${monthsRemaining}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">of ${schedule.length} total months</div>
        </div>
      </div>

      <!-- Row 2: Outstanding Principal + Interest Pending -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div style="background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.2);border-radius:12px;padding:14px 16px">
          <div style="font-size:10px;color:#60a5fa;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px">Outstanding Principal</div>
          <div style="font-size:20px;font-weight:800;color:#60a5fa;line-height:1">₹${fmtN(outstanding)}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">₹${fmtN(paidSoFar)} repaid so far</div>
        </div>
        <div style="background:rgba(248,113,113,.07);border:1px solid rgba(248,113,113,.15);border-radius:12px;padding:14px 16px">
          <div style="font-size:10px;color:#f87171;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px">Interest Still Due</div>
          <div style="font-size:20px;font-weight:800;color:#f87171;line-height:1">₹${fmtN(pendingInterest)}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">${totalInterest>0?((pendingInterest/totalInterest)*100).toFixed(0):0}% of total interest</div>
        </div>
      </div>

      <!-- Row 3: Total Pending (full width) -->
      <div style="background:linear-gradient(135deg,rgba(124,92,252,.18),rgba(34,211,160,.08));border:1px solid rgba(124,92,252,.3);border-radius:12px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:10px;color:var(--ac);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px">Total Still Payable &nbsp;(Principal + Interest)</div>
          <div style="font-size:24px;font-weight:800;color:var(--ac);line-height:1">₹${fmtN(totalPending)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;color:var(--text3)">${monthsRemaining} more EMIs</div>
          <div style="font-size:13px;font-weight:600;color:var(--text2);margin-top:2px">× ₹${fmtN(emi)} / mo</div>
        </div>
      </div>

      <!-- Progress bar -->
      <div style="margin-top:14px">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-bottom:5px">
          <span>Repayment Progress</span><span>${repaidPct}% complete</span>
        </div>
        <div style="height:7px;border-radius:4px;background:var(--bg3);overflow:hidden">
          <div style="height:100%;width:${repaidPct}%;background:linear-gradient(90deg,#22d3a0,#7c5cfc);border-radius:4px"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;margin-top:5px">
          <span style="color:#22d3a0">₹${fmtN(paidSoFar)} paid</span>
          <span style="color:#f87171">₹${fmtN(outstanding)} remaining</span>
        </div>
      </div>

      ${curRow ? `
      <!-- This month breakdown -->
      <div style="margin-top:14px;padding-top:13px;border-top:1px solid rgba(255,255,255,0.07)">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">📅 This Month &nbsp;— &nbsp;EMI #${curRow.month} &nbsp;(${curRow.date})</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
          <div style="background:rgba(255,255,255,.04);border-radius:8px;padding:10px 12px">
            <div style="font-size:9px;color:var(--text3);margin-bottom:4px">Total EMI</div>
            <div style="font-size:14px;font-weight:700;color:var(--ac)">₹${fmtN(curRow.emi)}</div>
          </div>
          <div style="background:rgba(34,211,160,.07);border:1px solid rgba(34,211,160,.15);border-radius:8px;padding:10px 12px">
            <div style="font-size:9px;color:#22d3a0;margin-bottom:4px">Principal</div>
            <div style="font-size:14px;font-weight:700;color:#22d3a0">₹${fmtN(curRow.principal)}</div>
            <div style="font-size:9px;color:var(--text3);margin-top:2px">${curRow.emi>0?((curRow.principal/curRow.emi)*100).toFixed(1):0}% of EMI</div>
          </div>
          <div style="background:rgba(248,113,113,.07);border:1px solid rgba(248,113,113,.15);border-radius:8px;padding:10px 12px">
            <div style="font-size:9px;color:#f87171;margin-bottom:4px">Interest</div>
            <div style="font-size:14px;font-weight:700;color:#f87171">₹${fmtN(curRow.interest)}</div>
            <div style="font-size:9px;color:var(--text3);margin-top:2px">${curRow.emi>0?((curRow.interest/curRow.emi)*100).toFixed(1):0}% of EMI</div>
          </div>
          <div style="background:rgba(255,255,255,.04);border-radius:8px;padding:10px 12px">
            <div style="font-size:9px;color:var(--text3);margin-bottom:4px">Balance After</div>
            <div style="font-size:14px;font-weight:700;color:var(--text1)">₹${fmtN(curRow.balance)}</div>
          </div>
        </div>
      </div>` : `<div style="margin-top:12px;font-size:11px;color:var(--text3)">💡 Add a Loan Start Date to see the current month breakdown</div>`}`;

    // ── HIDE old standalone progress section ──
    const progSection = document.getElementById('emi-prog-bar')?.closest('div[style*="flex-shrink"]');
    if (progSection) progSection.style.display = 'none';


    // ── AMORTIZATION SCHEDULE ──
    const tbody = document.getElementById('emi-schedule-tbody');
    tbody.innerHTML = schedule.map((row, i) => {
        const isCur = i === curIdx;
        const isPast = curIdx != null && i < curIdx;
        const rowStyle = isCur
            ? 'background:rgba(124,92,252,.18);font-weight:600'
            : isPast ? 'opacity:0.45' : i % 2 === 0 ? 'background:rgba(255,255,255,.015)' : '';
        const curBadge = isCur ? `<span style="background:var(--ac);color:#000;font-size:8px;padding:1px 6px;border-radius:3px;margin-left:6px;font-weight:700">NOW</span>` : '';
        const pastTag = isPast ? `<span style="font-size:8px;color:var(--text3);margin-left:4px">✓</span>` : '';
        return `<tr style="${rowStyle};border-bottom:1px solid rgba(255,255,255,0.03)">
          <td style="padding:7px 12px">${row.month}${curBadge}${pastTag}</td>
          <td style="padding:7px 12px;color:var(--text3)">${row.date}</td>
          <td style="padding:7px 12px;text-align:right">₹${fmtN(row.emi)}</td>
          <td style="padding:7px 12px;text-align:right;color:#22d3a0">₹${fmtN(row.principal)}</td>
          <td style="padding:7px 12px;text-align:right;color:#f87171">₹${fmtN(row.interest)}</td>
          <td style="padding:7px 12px;text-align:right">${row.balance < 1 ? '<span style="color:#22d3a0;font-weight:600">✓ Paid Off</span>' : '₹'+fmtN(row.balance)}</td>
        </tr>`;
    }).join('');

    openModal('ov-emi-detail');
}


function lmAutoCalc() {
    const r = +document.getElementById('lm-r').value;
    const ten = +document.getElementById('lm-ten').value;
    const emi = +document.getElementById('lm-e').value;
    const orig = +document.getElementById('lm-orig').value;
    const hint = document.getElementById('lm-emi-hint');
    if (!hint) return;
    if (orig && r && ten && !emi) {
        const computed = calcEMI(orig, r, ten);
        hint.style.display = 'block';
        hint.innerHTML = `💡 Computed EMI: <strong>₹${fmtN(computed)}</strong>`;
        document.getElementById('lm-e').value = Math.round(computed);
    } else if (orig && r && ten) {
        const computed = calcEMI(orig, r, ten);
        hint.style.display = 'block';
        hint.innerHTML = `💡 Computed EMI: <strong>₹${fmtN(computed)}</strong>`;
    } else {
        hint.style.display = 'none';
    }
}

function calcEMICalc() {
    const P = +document.getElementById('ec-principal').value;
    const rate = +document.getElementById('ec-rate').value;
    const tenure = +document.getElementById('ec-tenure').value;
    const startDate = document.getElementById('ec-start').value;
    const resultsEl = document.getElementById('ec-results');
    if (!P || !rate || !tenure) { resultsEl.style.display = 'none'; return; }
    resultsEl.style.display = 'block';
    const emi = calcEMI(P, rate, tenure);
    const totalPayment = emi * tenure;
    const totalInterest = totalPayment - P;
    const prinPct = Math.round((P / totalPayment) * 100);
    const intPct = 100 - prinPct;
    document.getElementById('ec-stats').innerHTML = `
      <div class="stat"><div class="sl">Monthly EMI</div><div class="sv" style="color:var(--ac)">₹${fmtN(emi)}</div></div>
      <div class="stat"><div class="sl">Total Interest</div><div class="sv trd">₹${fmtN(totalInterest)}</div></div>
      <div class="stat"><div class="sl">Total Payment</div><div class="sv">₹${fmtN(totalPayment)}</div></div>`;
    document.getElementById('ec-bar-prin').style.width = prinPct + '%';
    document.getElementById('ec-bar-int').style.width = intPct + '%';
    const schedule = buildAmortizationSchedule(P, rate, emi, tenure, startDate || null);
    document.getElementById('ec-schedule-tbody').innerHTML = schedule.map(row => `
      <tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
        <td style="padding:7px 10px">${row.month}</td>
        <td style="padding:7px 10px;text-align:right">₹${fmtN(row.emi)}</td>
        <td style="padding:7px 10px;text-align:right;color:#22d3a0">₹${fmtN(row.principal)}</td>
        <td style="padding:7px 10px;text-align:right;color:#f87171">₹${fmtN(row.interest)}</td>
        <td style="padding:7px 10px;text-align:right">${row.balance<1?'<span style="color:#22d3a0">✓</span>':'₹'+fmtN(row.balance)}</td>
      </tr>`).join('');
}

async function saveIncome() {
    const s = document.getElementById('im-src').value.trim(), a = +document.getElementById('im-a').value; if (!s || !a) return;
    await API.post('/api/income', { id: uid(), source: s, category: document.getElementById('im-cat').value, amount: a, date: document.getElementById('im-d').value || today(), recurring: document.getElementById('im-rec').checked });
    closeModal('ov-income'); await loadDB();
}
async function delInc(id) { if (confirm('Delete?')) { await API.del(`/api/income/${id}`); await loadDB(); } }

async function saveExpense() {
    const s = document.getElementById('em-d').value.trim(), a = +document.getElementById('em-a').value; if (!s || !a) return;
    await API.post('/api/expenses', { id: uid(), description: s, category: document.getElementById('em-cat').value, amount: a, date: document.getElementById('em-dt').value || today(), recurring: document.getElementById('em-rec').checked });
    closeModal('ov-exp'); await loadDB();
}
async function delExp(id) { if (confirm('Delete?')) { await API.del(`/api/expenses/${id}`); await loadDB(); } }

async function saveGoal() {
    const n = document.getElementById('gm-n').value.trim(), t = +document.getElementById('gm-target').value; if (!n || !t) return;
    const id = document.getElementById('gm-id').value, o = { name: n, target: t, current: +document.getElementById('gm-cur').value, category: document.getElementById('gm-cat').value, targetDate: document.getElementById('gm-date').value, priority: document.getElementById('gm-pri').value };
    if (id) await API.put(`/api/goals/${id}`, o); else await API.post('/api/goals', { id: uid(), ...o });
    closeModal('ov-goal'); await loadDB();
}
async function editGoal(id) { const g = db.goals.find(x => x.id === id); if (!g) return; document.getElementById('gm-id').value = g.id; document.getElementById('gm-n').value = g.name; document.getElementById('gm-target').value = g.target; document.getElementById('gm-cur').value = g.current; document.getElementById('gm-cat').value = g.category; document.getElementById('gm-date').value = g.targetDate || ''; document.getElementById('gm-pri').value = g.priority; openModal('ov-goal'); }
async function updGoal(id) { const v = +document.getElementById('gu-' + id).value; await API.put(`/api/goals/${id}`, { current: v }); await loadDB(); toast('Goal updated'); }
async function delGoal(id) { if (confirm('Delete?')) { await API.del(`/api/goals/${id}`); await loadDB(); } }

async function saveBill() {
    const n = document.getElementById('bm-n').value.trim(), a = +document.getElementById('bm-a').value; if (!n || !a) return;
    const id = document.getElementById('bm-id').value, o = { name: n, amount: a, category: document.getElementById('bm-cat').value, dueDay: +document.getElementById('bm-day').value, frequency: document.getElementById('bm-freq').value, icon: document.getElementById('bm-icon').value || '💳' };
    if (id) await API.put(`/api/bills/${id}`, o); else await API.post('/api/bills', { id: uid(), ...o });
    closeModal('ov-bill'); await loadDB();
}
async function editBill(id) { const b = db.bills.find(x => x.id === id); if (!b) return; document.getElementById('bm-id').value = b.id; document.getElementById('bm-n').value = b.name; document.getElementById('bm-a').value = b.amount; document.getElementById('bm-cat').value = b.category; document.getElementById('bm-day').value = b.dueDay; document.getElementById('bm-freq').value = b.frequency; document.getElementById('bm-icon').value = b.icon || '💳'; openModal('ov-bill'); }
async function delBill(id) { if (confirm('Delete?')) { await API.del(`/api/bills/${id}`); await loadDB(); } }

// ─── ESSENTIALS ──────────────────────────────
function renderEssentials() {
    const el = document.getElementById('ess-page-content'); if (!el) return;
    const me = mExp(), ta = TA(), tl = TL(), nw = NW();
    const ai = db.settings.annualIncome || 0;
    const tc = db.settings.termInsurance || 0;
    const hc = db.settings.healthInsurance || 0;
    const efMonths = db.settings.emergencyMonths || 6;
    const efTarget = efMonths * me;
    const efActual = db.assets.filter(a => a.assetClass === 'Debt/FD' || a.notes?.toLowerCase().includes('emergency')).reduce((s, a) => s + (+a.value || 0), 0);
    // If no monthly expense data, show setup prompt
    if (!me && !ai) {
        el.innerHTML = `<div class="essentials-warning"><div style="font-size:28px;margin-bottom:12px">⚠️</div>
            <div style="font-weight:700;font-size:14px;margin-bottom:8px">Monthly Expense Data Required</div>
            <div style="color:var(--text3);font-size:12px;max-width:400px;text-align:center;margin-bottom:16px">To calculate your financial health scores, we need your monthly expense amount. This helps us evaluate your emergency fund, insurance needs, and overall preparedness.</div>
            <button class="btn btn-primary" onclick="go('expenses')">Set Up Financial Profile</button></div>`;
        return;
    }
    const scores = [
        { ic: '🛡️', name: 'Security', label: 'Emergency Fund', value: efActual, target: efTarget, unit: 'months', desc: `${efActual >= efTarget && efTarget > 0 ? 'Covered ✓' : 'Shortfall'} — ${fmt(efActual)} saved of ${fmt(efTarget)} target (${efMonths}mo)`, status: efTarget > 0 && efActual >= efTarget ? 'good' : efActual >= efTarget * .5 ? 'warn' : 'bad' },
        { ic: '🏥', name: 'Emergency', label: 'Health Insurance', value: hc, target: 500000, unit: '₹', desc: hc ? `${fmt(hc)} cover${hc >= 500000 ? ' ✓' : ' — Rec: ₹5L+'}` : 'Not configured — Rec: ₹5L+', status: hc >= 500000 ? 'good' : hc > 0 ? 'warn' : 'bad' },
        { ic: '🛡️', name: 'Family', label: 'Term Insurance', value: tc, target: ai * 10, unit: '₹', desc: ai && tc ? `${fmt(tc)} cover${tc >= ai * 10 ? ' ✓' : ` — Rec: ${fmt(ai * 10)}`}` : 'Not configured — Set annual income first', status: ai && tc >= ai * 10 ? 'good' : tc > 0 ? 'warn' : 'bad' },
        { ic: '🏖️', name: 'Lifestyle', label: 'Lifestyle Coverage', value: me ? Math.round(nw / me) : 0, target: 120, unit: 'months', desc: me ? `Your net worth can sustain ${me ? Math.round(nw / me) : 0} months of lifestyle (${fmt(me)}/mo)` : 'Add monthly expenses first', status: me && nw / me >= 120 ? 'good' : me && nw / me >= 24 ? 'warn' : 'bad' },
        { ic: '🕊️', name: 'Freedom', label: 'Financial Independence', value: ai ? Math.round((nw / (ai * 25)) * 100) : 0, target: 100, unit: '%', desc: ai ? `${Math.round((nw / (ai * 25)) * 100)}% toward FI (target: ${fmt(ai * 25)} = 25× annual income)` : 'Set annual income in Settings', status: ai && nw >= ai * 25 ? 'good' : ai && nw >= ai * 5 ? 'warn' : 'bad' }
    ];
    el.innerHTML = `<div class="essentials-grid">${scores.map(s => {
        const pct = s.target > 0 ? Math.min(100, Math.round(s.value / s.target * 100)) : 0;
        const col = s.status === 'good' ? 'var(--gn)' : s.status === 'warn' ? 'var(--yw)' : 'var(--rd)';
        return `<div class="ess-health-card"><div class="ess-card-top"><div style="display:flex;align-items:center;gap:10px"><div class="ess-icon">${s.ic}</div><div><div class="ess-card-name">${s.name}</div><div class="ess-card-label">${s.label}</div></div></div><div class="ess-card-score" style="color:${col}">${pct}%</div></div><div class="pb mt8" style="height:5px"><div class="pf" style="width:${pct}%;background:${col};transition:width .6s"></div></div><div class="ess-card-desc">${s.desc}</div></div>`;
    }).join('')}</div>`;
}

// ─── ALLOCATION ──────────────────────────────
// Default target allocation
let allocTargets = { 'Equity': 55, 'FD & RD': 20, 'Gold & Silver': 10, 'Cash & Savings': 5, 'Real Estate': 10 };
function allocTab(id, el) {
    document.querySelectorAll('#alloc-tabs .tab').forEach(t => t.classList.remove('active'));
    el?.classList.add('active');
    ['allocation', 'sip'].forEach(p => { const panel = document.getElementById('alloc-panel-' + p); if (panel) panel.style.display = p === id ? 'block' : 'none'; });
    if (id === 'sip') calcSIP2();
}
function allocSubTab(id, el) {
    document.querySelectorAll('#alloc-sub-tabs .wealth-tab').forEach(t => {
        t.style.background = 'var(--bg3)';
        t.style.color = 'var(--text)';
        t.classList.remove('active');
    });
    el.classList.add('active');
    el.style.background = 'var(--gn)';
    el.style.color = '#fff';

    document.getElementById('w-alloc-sub-asset').style.display = id === 'asset' ? 'block' : 'none';
    document.getElementById('w-alloc-sub-sip').style.display = id === 'sip' ? 'block' : 'none';

    if (id === 'asset') renderAllocation();
    if (id === 'sip') renderSIP();
}
function renderSIP() {
    const budget = db.settings.monthlySipBudget || 0;
    const sips = db.sips || [];
    const bDisp = document.getElementById('w-sip-budget-display');
    if (bDisp) bDisp.textContent = fmt(budget);

    const emptyId = document.getElementById('w-sip-empty');
    const contentId = document.getElementById('w-sip-content');

    if (sips.length === 0 && budget === 0) {
        if (emptyId) emptyId.style.display = 'block';
        if (contentId) contentId.style.display = 'none';
    } else {
        if (emptyId) emptyId.style.display = 'none';
        if (contentId) contentId.style.display = 'block';

        const tb = document.getElementById('w-sip-tbody');
        if (tb) {
            tb.innerHTML = sips.sort((a, b) => b.percentage - a.percentage).map(s => {
                const amt = budget * (s.percentage / 100);
                return `<tr>
                    <td style="font-weight:600">${s.name}</td>
                    <td style="text-align:right">${s.percentage}%</td>
                    <td style="text-align:right;font-weight:700;color:var(--gn)">${fmt(amt)}</td>
                    <td style="text-align:right"><button class="btn btn-danger btn-xs" onclick="delSIP('${s.id}')">Del</button></td>
                </tr>`;
            }).join('');
        }
    }
}
async function saveSIPBudget() {
    const v = +document.getElementById('sip-budget-in').value || 0;
    await API.post('/api/sip/budget', { monthlySipBudget: v });
    closeModal('ov-sip-budget');
    await loadDB();
    toast('Budget saved');
    renderSIP();
}
async function saveSIPInstrument() {
    const n = document.getElementById('sip-inst-name').value.trim();
    const p = +document.getElementById('sip-inst-pct').value || 0;
    if (!n || p <= 0) { toast('Valid name and percentage required', 'error'); return; }

    const currentTotalPct = (db.sips || []).reduce((sum, s) => sum + (+s.percentage || 0), 0);
    if (currentTotalPct + p > 100) {
        toast(`Cannot exceed 100%. Available: ${100 - currentTotalPct}%`, 'error'); return;
    }

    await API.post('/api/sip/instrument', { id: uid(), name: n, percentage: p });
    closeModal('ov-sip-instrument');
    await loadDB();
    toast('Instrument added');
    renderSIP();
}
async function delSIP(id) {
    if (!confirm('Delete SIP instrument?')) return;
    await API.del(`/api/sip/instrument/${id}`);
    await loadDB();
    renderSIP();
}

function listenSIPHint() {
    const pctInp = document.getElementById('sip-inst-pct');
    const hint = document.getElementById('sip-inst-hint');
    if (pctInp && hint) {
        pctInp.addEventListener('input', () => {
            const b = db.settings?.monthlySipBudget || 0;
            const p = +pctInp.value || 0;
            hint.textContent = `Amount: ${fmt(b * (p / 100))}`;
        });
    }
}
setTimeout(listenSIPHint, 1000);

let isAllocEditing = false;
let tempAllocTargets = {};

function editAllocTargets() {
    isAllocEditing = true;
    tempAllocTargets = { ...allocTargets };
    const container = document.getElementById('w-alloc-target-inputs');
    if (!container) return;

    // Sort keys to keep consistent order
    const keys = ['Equity', 'Debt/FD', 'Gold & SGBs', 'Cash', 'Real Estate', 'Other'];
    const allClasses = [...new Set([...keys, ...Object.keys(allocTargets)])];

    container.innerHTML = allClasses.map(c => `
        <div>
            <div class="tsm mb4" style="color:var(--text3);font-weight:600">${c.toUpperCase()}</div>
            <input type="number" class="alloc-edit-input" data-cat="${c}" value="${allocTargets[c] || 0}" 
                oninput="updateAllocTotal()" min="0" max="100">
        </div>
    `).join('');

    document.getElementById('w-alloc-target-bar-wrap').style.display = 'none';
    document.getElementById('w-alloc-target-edit').style.display = 'block';
    document.getElementById('w-alloc-target-actions').style.display = 'none';
    updateAllocTotal();
}

function updateAllocTotal() {
    let total = 0;
    document.querySelectorAll('.alloc-edit-input').forEach(inp => {
        total += (+inp.value || 0);
    });
    document.getElementById('w-alloc-total-val').textContent = total;
    const saveBtn = document.getElementById('w-alloc-save-btn');
    if (saveBtn) saveBtn.disabled = Math.abs(total - 100) > 0.1;
    document.getElementById('w-alloc-target-total').style.color = Math.abs(total - 100) > 0.1 ? 'var(--rd)' : 'var(--gn)';
}

function cancelAllocEdit() {
    isAllocEditing = false;
    document.getElementById('w-alloc-target-bar-wrap').style.display = 'block';
    document.getElementById('w-alloc-target-edit').style.display = 'none';
    document.getElementById('w-alloc-target-actions').style.display = 'block';
}

async function saveAllocTargets() {
    const newTargets = {};
    document.querySelectorAll('.alloc-edit-input').forEach(inp => {
        const cat = inp.getAttribute('data-cat');
        const val = +inp.value || 0;
        if (val > 0) newTargets[cat] = val;
    });

    allocTargets = newTargets;
    // Save to settings
    if (!db.settings) db.settings = {};
    db.settings.allocTargets = allocTargets;
    await API.post('/api/settings', db.settings);

    cancelAllocEdit();
    renderAllocation();
    toast('Allocation targets saved');
}

function renderAllocation() {
    const ta = TA();
    const nw = NW();
    const totalValDisplay = document.getElementById('w-alloc-total-val-display');
    if (totalValDisplay) totalValDisplay.textContent = fmt(ta);

    const tbody = document.getElementById('w-alloc-tbody');
    if (!tbody) return;

    if (!ta && Object.keys(db.assets).length === 0) {
        document.getElementById('w-alloc-target-bar').innerHTML = '';
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text3)">Add assets to view allocation details</td></tr>';
        document.getElementById('w-alloc-insights').innerHTML = '<div class="tsm" style="color:var(--text3)">Add assets to see allocation insights.</div>';
        return;
    }

    // Target bar
    const cats = Object.keys(allocTargets).filter(k => allocTargets[k] > 0);
    const catColors = { 'Equity': '#3b82f6', 'Debt/FD': '#22d3a0', 'Gold & SGBs': '#fbbf24', 'Cash': '#94a3b8', 'Real Estate': '#f97316' };

    document.getElementById('w-alloc-target-bar').innerHTML = cats.map(c => `
        <div style="flex:${allocTargets[c]};background:${catColors[c] || CC[c] || '#888'};display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-weight:700;min-width:0;border-right:1px solid rgba(255,255,255,0.1)">
            ${allocTargets[c] > 5 ? allocTargets[c] + '%' : ''}
        </div>
    `).join('');

    // Current allocation and P&L
    const bc = {};
    const plByClass = {};
    db.assets.forEach(a => {
        bc[a.assetClass] = (bc[a.assetClass] || 0) + (+a.value || 0);
        const gain = (+a.value || 0) - (+a.cost || 0);
        plByClass[a.assetClass] = (plByClass[a.assetClass] || 0) + gain;
    });

    const allClasses = [...new Set([...Object.keys(allocTargets), ...Object.keys(bc)])].sort();

    // Donut chart
    const cLabels = Object.keys(bc).filter(c => bc[c] > 0);
    dc('alloc2');
    if (cLabels.length) {
        CH['alloc2'] = new Chart(document.getElementById('w-ch-alloc2'), {
            type: 'doughnut',
            data: {
                labels: cLabels,
                datasets: [{ data: cLabels.map(c => bc[c]), backgroundColor: cLabels.map(c => CC[c] || catColors[c] || '#888'), borderWidth: 0 }]
            },
            options: { ...co(), cutout: '75%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.label}: ${fmt(c.raw)} (${(c.raw / ta * 100).toFixed(1)}%)` } } } }
        });
    }

    document.getElementById('w-alloc-current-legend').innerHTML = cLabels.map(c => `
        <div class="fb" style="padding:4px 0">
            <span style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:var(--text2)">
                <span style="width:10px;height:10px;background:${CC[c] || catColors[c] || '#888'};border-radius:3px;display:inline-block"></span>
                ${c}
            </span>
            <span style="font-size:12px;font-weight:700;color:var(--text1)">${((bc[c] / ta) * 100).toFixed(1)}%</span>
        </div>
    `).join('');

    // Rebalancing threshold (5%)
    let rebalanceNeededCount = 0;
    const rebalanceActions = [];

    // Target vs Actual table
    tbody.innerHTML = allClasses.map(c => {
        const curVal = bc[c] || 0;
        const curPct = ta ? ((curVal / ta) * 100) : 0;
        const tgtPct = allocTargets[c] || 0;
        const tgtVal = ta * (tgtPct / 100);
        const diff = curPct - tgtPct;
        const gapVal = curVal - tgtVal;

        if (Math.abs(diff) > 5) rebalanceNeededCount++;
        if (Math.abs(diff) > 2) {
            rebalanceActions.push({ class: c, diff, gapVal });
        }

        let action = '';
        if (Math.abs(diff) < 2) action = '<span style="color:var(--text3)">✓ On target</span>';
        else if (diff > 0) action = `<span style="color:var(--rd);font-weight:600">Sell ₹${fmtN(Math.abs(gapVal))}</span>`;
        else action = `<span style="color:var(--gn);font-weight:600">Buy ₹${fmtN(Math.abs(gapVal))}</span>`;

        const pl = plByClass[c] || 0;

        return `
            <tr>
                <td>
                    <div style="display:flex;flex-direction:column;gap:2px">
                        <div style="display:flex;align-items:center;gap:8px">
                            <span style="width:8px;height:8px;background:${CC[c] || catColors[c] || '#888'};border-radius:2px"></span>
                            <span style="font-weight:600;font-size:12px">${c}</span>
                        </div>
                        <div style="font-size:10px;color:${pl >= 0 ? 'var(--gn)' : 'var(--rd)'};margin-left:16px">
                            ${pl >= 0 ? '▲' : '▼'} ${fmt(pl)} P&L
                        </div>
                    </div>
                </td>
                <td style="text-align:right;font-weight:600">${curPct.toFixed(1)}%</td>
                <td style="text-align:right;color:var(--text3)">${tgtPct}%</td>
                <td style="text-align:right;font-weight:700;color:${Math.abs(diff) < 2 ? 'var(--text3)' : diff > 0 ? 'var(--rd)' : 'var(--gn)'}">
                    ${diff > 0 ? '+' : ''}${diff.toFixed(1)}%
                </td>
                <td style="text-align:right;font-family:'DM Mono'">${fmt(curVal)}</td>
                <td style="text-align:right;font-family:'DM Mono';color:${gapVal > 0 ? 'var(--rd)' : 'var(--gn)'}">
                    ${gapVal > 0 ? '+' : ''}${fmt(gapVal)}
                </td>
                <td style="text-align:center;font-size:11px">${action}</td>
            </tr>
        `;
    }).join('');

    // Rebalancing alert
    const alertEl = document.getElementById('w-alloc-rebalance-alert');
    if (rebalanceNeededCount > 0) {
        document.getElementById('w-alloc-rebalance-count').textContent = rebalanceNeededCount;
        alertEl.style.display = 'flex';
        alertEl.style.background = 'rgba(248,113,113,.1)';
        alertEl.style.color = '#f87171';
    } else {
        alertEl.style.display = 'none';
    }

    // Insights Generation
    const insights = [];
    const lastSnap = db.snapshots.length ? db.snapshots[db.snapshots.length - 1] : null;
    const nwChange = lastSnap ? nw - lastSnap.netWorth : 0;

    // Performance context
    if (nwChange > 0) {
        insights.push({
            type: 'positive',
            icon: '🚀',
            title: 'Growth Momentum',
            desc: `Your net worth grown by ${fmt(nwChange)} since last snapshot. Rebalancing now secures these gains.`
        });
    }

    // Specific Action Suggestions
    const overweights = rebalanceActions.filter(a => a.diff > 5).sort((a, b) => b.diff - a.diff);
    const underweights = rebalanceActions.filter(a => a.diff < -5).sort((a, b) => a.diff - b.diff);

    if (overweights.length && underweights.length) {
        const topOver = overweights[0];
        const topUnder = underweights[0];
        insights.push({
            type: 'tip',
            icon: '⚖️',
            title: 'Rebalance Move',
            desc: `Shift ₹${fmtN(Math.min(Math.abs(topOver.gapVal), Math.abs(topUnder.gapVal)))} from ${topOver.class} into ${topUnder.class} to align with your targets.`
        });
    }

    // Risk analysis
    allClasses.forEach(c => {
        const curPct = ta ? ((bc[c] || 0) / ta * 100) : 0;
        const tgtPct = allocTargets[c] || 0;
        const pl = plByClass[c] || 0;

        if (curPct - tgtPct > 15 && pl > 0) {
            insights.push({
                type: 'danger',
                icon: '🛡️',
                title: `${c} Concentration`,
                desc: `Profits in ${c} have pushed it to ${curPct.toFixed(1)}%. Consider profit-booking to reduce risk.`
            });
        }
        if (tgtPct > 0 && curPct < 1) {
            insights.push({
                type: 'warn',
                icon: '🧩',
                title: `Missing ${c}`,
                desc: `Zero allocation in ${c}. You're missing out on ${tgtPct}% target diversification.`
            });
        }
    });

    // Strategy tip
    const biggestUnder = underweights[0];
    if (biggestUnder) {
        insights.push({
            type: 'tip',
            icon: '💡',
            title: 'Optimization Tip',
            desc: `Route your next investible surplus into ${biggestUnder.class}. You need ₹${fmtN(Math.abs(biggestUnder.gapVal))} to reach the target.`
        });
    } else {
        insights.push({
            type: 'positive',
            icon: '✨',
            title: 'Perfectly Balanced',
            desc: 'Your portfolio is within 5% of all targets. Great job maintaining your strategy!'
        });
    }

    document.getElementById('w-alloc-insights').innerHTML = insights.slice(0, 4).map(i => `
        <div class="alloc-insight ${i.type || 'tip'}">
            <div class="alloc-insight-icon">${i.icon}</div>
            <div class="alloc-insight-content">
                <div class="alloc-insight-title">${i.title}</div>
                <div class="alloc-insight-desc">${i.desc}</div>
            </div>
        </div>
    `).join('');
}
function calcSIP2() {
    const a = +document.getElementById('sip-a2')?.value || 0, r = +document.getElementById('sip-r2')?.value / 1200 || 0, y = +document.getElementById('sip-y2')?.value || 0, s = +document.getElementById('sip-s2')?.value / 100 || 0;
    if (!a || !y) { const r = document.getElementById('sip-res2'); if (r) r.innerHTML = ''; return; }
    let fv = 0, inv = 0; for (let m = 0; m < y * 12; m++) { const stepMo = a * (1 + s) ** Math.floor(m / 12); inv += stepMo; fv = (fv + stepMo) * (1 + (r || .01)); }
    const g = fv - inv, res = document.getElementById('sip-res2');
    if (res) res.innerHTML = `<div class="g3 mt12"><div style="text-align:center"><div class="sl">Invested</div><div style="font-size:18px;font-weight:700">${fmt(inv)}</div></div><div style="text-align:center"><div class="sl">Est. Returns</div><div style="font-size:18px;font-weight:700;color:var(--gn)">${fmt(g)}</div></div><div style="text-align:center"><div class="sl">Future Value</div><div style="font-size:22px;font-weight:800;color:var(--ac)">${fmt(fv)}</div></div></div>`;
}

// ─── MONTH NAVIGATOR (Income & Expenses) ──────────────────────────────
let incomeMonthOffset = 0, expMonthOffset = 0;
function incomeMonthNav(dir) { incomeMonthOffset += dir; renderIncome(); }
function expMonthNav(dir) { expMonthOffset += dir; renderExpenses(); }
function getNavMonth(offset) {
    const d = new Date(); d.setMonth(d.getMonth() + offset);
    return { key: d.toISOString().slice(0, 7), label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) };
}
function renderIncome() {
    const { key, label } = getNavMonth(incomeMonthOffset);
    const lbl = document.getElementById('i-month-label'); if (lbl) lbl.textContent = label;
    const entries = db.income.filter(i => i.date?.startsWith(key));
    const cnt = document.getElementById('i-entries-count'); if (cnt) cnt.textContent = entries.length + ' entr' + (entries.length === 1 ? 'y' : 'ies');
    const tb = document.getElementById('i-tbody');
    if (!tb) return;
    if (!entries.length) {
        tb.innerHTML = '';
        const empty = document.getElementById('i-empty'); if (empty) empty.style.display = 'block';
    } else {
        const empty = document.getElementById('i-empty'); if (empty) empty.style.display = 'none';
        tb.innerHTML = entries.sort((a, b) => b.date.localeCompare(a.date)).map(i => `<tr><td style="font-weight:600">${i.source || i.description || '—'}</td><td><span class="tag to" style="font-size:9px">${i.category || 'Other'}</span></td><td style="font-size:11px">${i.date || '—'}</td><td style="text-align:right;font-weight:700;color:var(--gn)">${fmt(+i.amount)}</td><td style="text-align:center;font-size:11px">${i.recurring ? '🔄 Yes' : '—'}</td><td><button class="btn btn-danger btn-xs" onclick="delInc('${i.id}')">Del</button></td></tr>`).join('');
    }
}
function renderExpenses() {
    const { key, label } = getNavMonth(expMonthOffset);
    const lbl = document.getElementById('e-month-label'); if (lbl) lbl.textContent = label;
    const srch = (document.getElementById('e-srch')?.value || '').toLowerCase();
    let entries = db.expenses.filter(e => e.date?.startsWith(key));
    if (srch) entries = entries.filter(e => (e.description || '').toLowerCase().includes(srch) || (e.category || '').toLowerCase().includes(srch));
    const cnt = document.getElementById('e-entries-count'); if (cnt) cnt.textContent = entries.length + ' entr' + (entries.length === 1 ? 'y' : 'ies');
    const tb = document.getElementById('e-tbody');
    if (!tb) return;
    if (!entries.length) {
        tb.innerHTML = '';
        const empty = document.getElementById('e-empty'); if (empty) empty.style.display = 'block';
    } else {
        const empty = document.getElementById('e-empty'); if (empty) empty.style.display = 'none';
        tb.innerHTML = entries.sort((a, b) => b.date.localeCompare(a.date)).map(e => `<tr><td style="font-weight:600">${e.description || '—'}</td><td><span class="tag tc" style="font-size:9px">${e.category || 'Other'}</span></td><td style="font-size:11px">${e.date || '—'}</td><td style="text-align:right;font-weight:700;color:var(--rd)">${fmt(+e.amount)}</td><td><button class="btn btn-danger btn-xs" onclick="delExp('${e.id}')">Del</button></td></tr>`).join('');
    }
}

// ─── CSV IMPORT ────────────────────────────────────────
let importType = 'assets'; // 'assets' or 'income_expenses'
let importSource = 'standard'; // 'standard' or 'broker'
let importBroker = 'zerodha';
let pendingImport = [];

function showImportUpload() {
    document.getElementById('import-upload-view').style.display = 'block';
    document.getElementById('import-preview-view').style.display = 'none';
    pendingImport = [];
}

function showImportPreview(filename) {
    document.getElementById('import-upload-view').style.display = 'none';
    document.getElementById('import-preview-view').style.display = 'block';
    document.getElementById('import-filename').textContent = filename;
    renderImportPreview();
}

function renderImportPreview() {
    const tb = document.getElementById('import-preview-tbody');
    const rowCount = document.getElementById('import-row-count');
    const validCount = document.getElementById('import-valid-count');
    if (!tb) return;

    rowCount.textContent = `${pendingImport.length} rows`;
    const valid = pendingImport.filter(p => p.data.name || p.data.description).length;
    validCount.textContent = `${valid} valid`;

    if (!pendingImport.length) {
        tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text3)">No data to preview. Back to upload.</td></tr>';
        return;
    }

    tb.innerHTML = pendingImport.map((p, i) => {
        const d = p.data;
        const isAsset = p.url === '/api/assets';
        const name = isAsset ? d.name : d.description;
        const isValid = name && (isAsset ? d.value !== undefined : d.amount !== undefined);

        return `<tr style="border-top:1px solid var(--border)">
            <td style="text-align:center;padding:12px">
                <div class="tag ${isValid ? 'tgn' : 'trd'}" style="font-size:9px">${isValid ? 'OK' : 'ERR'}</div>
            </td>
            <td style="padding:12px">
                <input class="w100" style="background:transparent;border:none;color:var(--text);font-size:12px;font-weight:600" 
                    value="${name || ''}" onchange="updatePendingRow(${i}, '${isAsset ? 'name' : 'description'}', this.value)">
            </td>
            <td style="padding:12px">
                ${isAsset ? `<select class="w100" style="background:transparent;border:1px solid var(--border);color:var(--text);font-size:11px;padding:4px;border-radius:6px"
                    onchange="updatePendingRow(${i}, 'assetClass', this.value)">
                    ${ASSET_CLASSES.map(c => `<option value="${c}" ${d.assetClass === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>` : `<span class="tag to" style="font-size:10px">${d.category || 'Other'}</span>`}
            </td>
            <td style="padding:12px;text-align:right">
                <input type="number" step="0.01" style="background:transparent;border:none;color:var(--text);font-size:12px;font-weight:700;text-align:right;width:90px" 
                    value="${isAsset ? d.value : d.amount}" onchange="updatePendingRow(${i}, '${isAsset ? 'value' : 'amount'}', this.value)">
            </td>
            <td style="padding:12px;text-align:center">
                <select style="background:transparent;border:1px solid var(--border);color:var(--text);font-size:11px;padding:4px;border-radius:6px"
                    onchange="updatePendingRow(${i}, 'currency', this.value)">
                    <option value="INR" ${d.currency === 'INR' || !d.currency ? 'selected' : ''}>₹ INR</option>
                    <option value="USD" ${d.currency === 'USD' ? 'selected' : ''}>$ USD</option>
                    <option value="EUR" ${d.currency === 'EUR' ? 'selected' : ''}>€ EUR</option>
                </select>
            </td>
            <td style="padding:12px">
                <input class="w100" style="background:transparent;border:none;color:var(--text);font-size:11px" 
                    value="${d.geography || 'INDIA'}" onchange="updatePendingRow(${i}, 'geography', this.value)">
            </td>
            <td style="text-align:center;padding:12px">
                <button class="btn btn-ghost btn-xs" style="color:var(--text3);min-width:auto" onclick="removePendingRow(${i})">×</button>
            </td>
        </tr>`;
    }).join('');
}

function updatePendingRow(idx, field, val) {
    if (field === 'value' || field === 'amount') val = parseFloat(val) || 0;
    pendingImport[idx].data[field] = val;
    renderImportPreview();
}

function removePendingRow(idx) {
    pendingImport.splice(idx, 1);
    renderImportPreview();
}

async function confirmBulkImport() {
    const btn = document.getElementById('btn-confirm-import');
    const oldTxt = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Importing...';

    let imported = 0, errors = 0;
    for (const p of pendingImport) {
        try {
            const r = await API.post(p.url, p.data);
            if (r.ok) imported++; else errors++;
        } catch (e) { errors++; }
    }

    await loadDB();
    showImportUpload();
    btn.disabled = false;
    btn.textContent = oldTxt;
    toast(imported > 0 ? `✅ Imported ${imported} rows` : `❌ Import failed`);
    if (curPage === 'wealth') renderWealth();
}

function wealthTab(id, el) {
    if (!el) el = Array.from(document.querySelectorAll('#wealth-tabs .wealth-tab')).find(t => t.textContent.toLowerCase().includes(id.toLowerCase()));
    document.querySelectorAll('#wealth-tabs .wealth-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    ['wp-assets', 'wp-liabilities', 'wp-networth', 'wp-allocation', 'wp-import'].forEach(p => {
        const _el = document.getElementById(p);
        if (_el) _el.style.display = p === 'wp-' + id ? 'block' : 'none';
    });
    wealthCurTab = id;
    const titles = { assets: 'Assets', liabilities: 'Liabilities', networth: 'Net Worth', allocation: 'Allocation', import: 'Import' };
    const titleEl = document.getElementById('wealth-title-text');
    if (titleEl) titleEl.textContent = titles[id] || id;
    document.getElementById('tbar-actions').innerHTML = PACTIONS[id] || '';

    if (id === 'assets') renderWealthAssets();
    else if (id === 'liabilities') renderWealthLiabilities();
    else if (id === 'networth') renderWealthNetWorth();
    else if (id === 'allocation') renderWealthAllocation();
    else if (id === 'import') {
        // Import tab is mostly static, but we can ensure sub-text is clear
        const sub = document.getElementById('wealth-sub-text');
        if (sub) sub.textContent = 'Bulk Data Operations';
    }
}

function importPageTab(type, el) {
    importType = type;
    document.querySelectorAll('#import-cat-tabs .wealth-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    const assetFields = document.getElementById('import-asset-fields');
    const cfSteps = document.getElementById('import-cashflow-steps');

    if (type === 'income_expenses') {
        if (assetFields) assetFields.style.display = 'none';
        if (cfSteps) cfSteps.style.display = 'block';
    } else {
        if (assetFields) assetFields.style.display = 'block';
        if (cfSteps) cfSteps.style.display = 'none';
    }
}

function importSourceTab(source, el) {
    importSource = source;
    el.parentElement.querySelectorAll('.wealth-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('import-broker-selection').style.display = source === 'broker' ? 'block' : 'none';
}

function setImportBroker(broker, el) {
    importBroker = broker;
    document.querySelectorAll('.import-opt-card').forEach(c => c.style.borderColor = '');
    el.style.borderColor = 'var(--ac)';
}

function triggerFileInput() {
    document.getElementById('import-file-inp').click();
}

function handleImportFile(inp) {
    if (inp.files[0]) {
        importCSV(inp.files[0], importType === 'assets' ? 'assets' : 'expenses', importSource === 'broker' ? importBroker : 'standard');
        // File input is NOT reset here because we might need its name in showImportPreview
    }
}

function downloadCurrentTemplate() {
    let csv = '';
    let name = '';
    if (importType === 'assets') {
        csv = 'Name,Class,Current Value,Purchase Value,Purchase Date,Quantity,Notes\nReliance Industries,Equity,2500,2000,2023-01-01,1,HDFC Demat';
        name = 'fintrack_asset_template.csv';
    } else {
        csv = 'date,description,amount,currency,type,category,notes\n2026-02-15,Amazon Prime,450,INR,OUT,Entertainment,Annual subscription';
        name = 'fintrack_cashflow_template.csv';
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
}

function triggerImport(type) {
    // Create a hidden file input and trigger it directly
    let inp = document.getElementById('_csv_import_inp');
    if (!inp) {
        inp = document.createElement('input');
        inp.type = 'file';
        inp.id = '_csv_import_inp';
        inp.accept = '.csv,.xlsx,.xls,.xlsb,.xlsm';
        inp.style.display = 'none';
        document.body.appendChild(inp);
    }
    inp.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) await importCSV(file, type, 'standard');
        inp.value = '';
    };
    inp.click();
}

async function importCSV(file, type, source = 'standard') {
    if (!file) return;
    let rawLines = [];
    const ext = file.name.split('.').pop().toLowerCase();
    const isExcel = ['xlsx', 'xls', 'xlsb', 'xlsm'].includes(ext);
    try {
        if (isExcel) {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            rawLines = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' });
        } else {
            const text = await file.text();
            rawLines = text.split(/\r?\n/).filter(l => l.trim());
        }
    } catch (e) { toast("Failed to read file.", "error"); return; }
    if (rawLines.length < 1) { toast('File is empty', 'error'); return; }

    const normalize = h => typeof h === 'string' ? h.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    const HEADER_KEYWORDS = ['name', 'stock', 'isin', 'quantity', 'qty', 'units', 'amount', 'price', 'value', 'description', 'source', 'date', 'category', 'scheme', 'folio', 'nav', 'balance', 'closing'];
    let headerLineIdx = 0, bestScore = -1, detectedDelimiter = ',';
    for (let i = 0; i < Math.min(rawLines.length, 30); i++) {
        const lineData = rawLines[i]; if (!lineData) continue;
        if (isExcel) {
            const cells = lineData.map(normalize);
            const score = HEADER_KEYWORDS.filter(kw => cells.some(c => c.includes(kw))).length;
            if (score > bestScore) { bestScore = score; headerLineIdx = i; }
        } else {
            for (const delim of [',', '\t']) {
                const cells = lineData.split(delim).map(c => normalize(c.replace(/^"|"$/g, '')));
                const score = HEADER_KEYWORDS.filter(kw => cells.some(c => c.includes(kw))).length;
                if (score > bestScore) { bestScore = score; headerLineIdx = i; detectedDelimiter = delim; }
            }
        }
    }
    const delimiter = detectedDelimiter;
    const parseRow = row => {
        if (isExcel) return row;
        if (delimiter === '\t') return row.split('\t').map(c => c.trim());
        const cols = []; let cur = '', inQ = false;
        for (let i = 0; i < row.length; i++) {
            const c = row[i];
            if (c === '"') inQ = !inQ;
            else if (c === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
            else cur += c;
        }
        cols.push(cur.trim());
        return cols;
    };
    const lines = isExcel ? rawLines.slice(headerLineIdx) : rawLines.slice(headerLineIdx).filter(l => l.trim());
    const headers = (isExcel ? lines[0] : parseRow(lines[0])).map(normalize);
    const dataRows = lines.slice(1).map(l => parseRow(l));
    const col = (...aliases) => {
        for (const a of aliases) {
            const idx = headers.findIndex(h => h.includes(a));
            if (idx !== -1) return idx;
        }
        return -1;
    };
    const categoryMap = {
        'food': ['swiggy', 'zomato', 'restaurant', 'cafe', 'mcdonald', 'starbucks', 'blinkit', 'zepto'],
        'transport': ['uber', 'ola', 'rapido', 'petrol', 'shell', 'fuel', 'metro', 'irctc'],
        'shopping': ['amazon', 'flipkart', 'myntra', 'ajio', 'nykaa', 'retail'],
        'utilities': ['bescom', 'jio', 'airtel', 'recharge', 'ebill', 'electricity', 'water'],
        'entertainment': ['netflix', 'hotstar', 'prime video', 'pvr', 'inox', 'bookmyshow'],
        'investment': ['zerodha', 'groww', 'indmoney', 'sip', 'mutual fund', 'stocks']
    };
    const detectCategory = (desc, currentCat) => {
        if (currentCat && currentCat !== 'Other') return currentCat;
        const lowDesc = (desc || '').toLowerCase();
        for (const [cat, keywords] of Object.entries(categoryMap)) {
            if (keywords.some(kw => lowDesc.includes(kw))) return cat.charAt(0).toUpperCase() + cat.slice(1);
        }
        return 'Other';
    };
    const get = (row, idx) => (idx < 0 || idx >= row.length) ? '' : String(row[idx] || '').replace(/^"|"$/g, '').trim();
    const getNum = (row, idx) => parseFloat(get(row, idx).replace(/[₹,\s]/g, '')) || 0;

    let imported = 0, errors = 0;
    const allRowsArr = [];
    if (type === 'assets') {
        let nameI = col('schemename', 'stockname', 'name', 'asset', 'title', 'security', 'scrip', 'symbol');
        let classI = col('class', 'category', 'assetclass');
        let valueI = col('closingvalue', 'marketvalue', 'currentvalue', 'value', 'price', 'nav');
        let costI = col('buyvalue', 'averagebuy', 'invested', 'cost', 'avgprice', 'averageprice');
        let dateI = col('date', 'purchasedate');
        let qtyI = col('quantity', 'units', 'qty');
        let notesI = col('isin', 'folio', 'notes', 'remarks');
        let currI = col('currency', 'curr');
        let geoI = col('geography', 'geo', 'location', 'country');

        if (source === 'zerodha') { nameI = col('symbol'); costI = col('averageprice'); qtyI = col('quantity'); valueI = col('lastprice'); }
        if (nameI === -1) { toast('Missing "Name" or "Symbol" column', 'error'); return; }
        for (const row of dataRows) {
            const name = get(row, nameI); if (!name || name.toLowerCase().includes('total')) continue;
            let assetClass = get(row, classI) || '';
            if (!assetClass) {
                const ln = name.toLowerCase();
                if (source === 'zerodha') {
                    if (ln.includes('fund') || ln.includes('mf') || ln.includes('growth') || ln.includes('nifty') || ln.includes('sensex')) assetClass = 'Mutual Funds';
                    else if (ln.includes('gold') || ln.includes('sgb')) assetClass = 'Gold & Silver';
                    else assetClass = 'Equity';
                }
                else if (source === 'groww') assetClass = 'Mutual Funds';
                else assetClass = document.getElementById('import-default-class')?.value || 'Other';
            }
            // Standardize class string
            if (assetClass === 'Stocks & Equity') assetClass = 'Equity';
            if (assetClass === 'Gold & SGBs') assetClass = 'Gold & Silver';
            if (assetClass === 'Debt/FD') assetClass = 'FD & RD';

            const currency = get(row, currI) || 'INR';
            const geography = get(row, geoI) || 'INDIA';

            allRowsArr.push({
                url: '/api/assets',
                data: {
                    id: uid(),
                    name,
                    assetClass,
                    value: getNum(row, valueI) || (getNum(row, costI) * (parseFloat(get(row, qtyI)) || 1)),
                    cost: getNum(row, costI),
                    purchaseDate: get(row, dateI) || null,
                    qty: parseFloat(get(row, qtyI)) || null,
                    currency,
                    geography,
                    notes: get(row, notesI) || (source !== 'standard' ? `Import from ${source}` : '')
                }
            });
        }
    } else {
        const descI = col('description', 'source', 'name', 'title', 'narration', 'particulars');
        const amtI = col('amount', 'value', 'spent', 'debit', 'withdrawal', 'income');
        const catI = col('category', 'cat'), dateI = col('date'), recI = col('recurring', 'repeat');
        if (descI === -1 || amtI === -1) { toast('Missing required columns', 'error'); return; }
        for (const row of dataRows) {
            const desc = get(row, descI); if (!desc) continue;
            let date = today(); const dateRaw = get(row, dateI); if (dateRaw) { try { date = new Date(dateRaw).toISOString().split('T')[0]; } catch (e) { } }
            allRowsArr.push({ url: type === 'income' ? '/api/income' : '/api/expenses', data: { id: uid(), [type === 'income' ? 'source' : 'description']: desc, category: detectCategory(desc, get(row, catI)), amount: getNum(row, amtI), date, recurring: ['yes', 'true', '1'].includes(get(row, recI).toLowerCase()) } });
        }
    }

    // Show preview modal
    if (!allRowsArr.length) { toast('No valid rows found in file. Check column names match expected format.', 'error'); return; }
    showImportPreview(file.name, type, allRowsArr);
}

let _pendingImportRows = [];

function showImportPreview(fileName, type, rows) {
    _pendingImportRows = rows;
    const titleEl = document.getElementById('imp-prev-title');
    if (titleEl) titleEl.textContent = `Import Preview — ${fileName}`;
    const metaEl = document.getElementById('imp-prev-meta');
    if (metaEl) metaEl.innerHTML = `<span style="font-size:12px;color:var(--text3)">${rows.length} row${rows.length !== 1 ? 's' : ''} detected. Review &amp; adjust the <strong style="color:var(--text2)">Class</strong> column if needed, then click <strong style="color:var(--text2)">Import All</strong>.</span>`;

    // Build preview table based on type
    const theadEl = document.getElementById('imp-prev-thead');
    const tbodyEl = document.getElementById('imp-prev-tbody');
    if (!theadEl || !tbodyEl) return;

    const thStyle = 'padding:8px 10px;text-align:left;font-size:10px;color:var(--text3);border-bottom:1px solid rgba(255,255,255,0.06);white-space:nowrap';
    const tdStyle = 'padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.04);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';

    const clsSelectStyle = 'width:100%;min-width:130px;font-size:10px;padding:3px 5px;background:var(--bg3);color:var(--text);border:1px solid rgba(255,255,255,0.1);border-radius:5px;cursor:pointer';

    const allClasses = ["Equity", "Mutual Funds", "Real Estate", "Gold & Silver", "FD & RD", "Bonds", "Debt Funds", "EPF / PPF / NPS", "SSY", "Crypto", "International", "Employer Stock", "Cash & Savings", "Liquid Funds", "Arbitrage Funds", "Commodities", "ULIP", "Moneyback Insurance", "Endowment Plans", "Other"];

    if (type === 'assets') {
        // Header with bulk-set dropdown
        const bulkOptions = allClasses.map(c => `<option value="${c}">${c}</option>`).join('');
        theadEl.innerHTML = `<tr>
            <th style="${thStyle}">#</th>
            <th style="${thStyle}">Name</th>
            <th style="${thStyle}">
                Class
                <select id="imp-cls-bulk" style="${clsSelectStyle};margin-left:6px;font-size:9px;" onchange="setAllImportClass(this.value)" title="Set class for all rows">
                    <option value="">Set all to…</option>
                    ${bulkOptions}
                </select>
            </th>
            <th style="${thStyle}">Value (₹)</th>
            <th style="${thStyle}">Invested (₹)</th>
            <th style="${thStyle}">Qty</th>
            <th style="${thStyle}">Notes</th>
        </tr>`;

        tbodyEl.innerHTML = rows.map((r, i) => {
            const d = r.data;
            const options = allClasses.map(c => `<option value="${c}" ${c === d.assetClass ? 'selected' : ''}>${c}</option>`).join('');
            return `<tr style="font-size:11px">
                <td style="${tdStyle};color:var(--text3)">${i + 1}</td>
                <td style="${tdStyle};font-weight:600">${d.name || '—'}</td>
                <td style="${tdStyle}"><select id="imp-cls-${i}" style="${clsSelectStyle}">${options}</select></td>
                <td style="${tdStyle}">${d.value ? '₹' + (+d.value).toLocaleString('en-IN') : '—'}</td>
                <td style="${tdStyle}">${d.cost ? '₹' + (+d.cost).toLocaleString('en-IN') : '—'}</td>
                <td style="${tdStyle}">${d.qty || '—'}</td>
                <td style="${tdStyle};color:var(--text3)">${d.notes || '—'}</td>
            </tr>`;
        }).join('');
    } else {
        const isIncome = type === 'income';
        theadEl.innerHTML = `<tr><th style="${thStyle}">#</th><th style="${thStyle}">${isIncome ? 'Source' : 'Description'}</th><th style="${thStyle}">Category</th><th style="${thStyle}">Amount (₹)</th><th style="${thStyle}">Date</th></tr>`;
        tbodyEl.innerHTML = rows.map((r, i) => {
            const d = r.data;
            const desc = d.source || d.description || '—';
            return `<tr style="font-size:11px">
                <td style="${tdStyle};color:var(--text3)">${i + 1}</td>
                <td style="${tdStyle};font-weight:600">${desc}</td>
                <td style="${tdStyle}">${d.category || '—'}</td>
                <td style="${tdStyle}">${d.amount ? '₹' + (+d.amount).toLocaleString('en-IN') : '—'}</td>
                <td style="${tdStyle}">${d.date || '—'}</td>
            </tr>`;
        }).join('');
    }
    openModal('ov-import-preview');
}

function setAllImportClass(cls) {
    if (!cls) return;
    _pendingImportRows.forEach((_, i) => {
        const sel = document.getElementById('imp-cls-' + i);
        if (sel) sel.value = cls;
    });
}

async function confirmImportData() {
    const rows = _pendingImportRows;
    if (!rows || !rows.length) { closeModal('ov-import-preview'); return; }
    const btn = document.getElementById('imp-prev-confirm');
    if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }
    // Read current dropdown selections before saving
    rows.forEach((r, i) => {
        const sel = document.getElementById('imp-cls-' + i);
        if (sel) r.data.assetClass = sel.value;
    });
    let saved = 0, failed = 0;
    for (const row of rows) {
        try {
            const r = await API.post(row.url, row.data);
            if (r.ok) saved++; else failed++;
        } catch (e) { failed++; }
    }
    closeModal('ov-import-preview');
    _pendingImportRows = [];
    await refresh();
    if (saved > 0) toast(`✅ Imported ${saved} row${saved !== 1 ? 's' : ''}${failed ? ` (${failed} skipped)` : ''}`);
    else toast('No rows could be imported. Check the data format.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = '✅ Import All'; }
}


async function applyRecurring() {
    try { await API.post('/api/apply-recurring', {}); toast('Recurring items applied'); await loadDB(); } catch (e) { toast('Error', 'error'); }
}

// ─── INIT ─────────────────────────────────
window.onload = () => {
    loadDB();
    fetchFXRates();
    setInterval(fetchFXRates, 2000); // High frequency sync (2s)
};



