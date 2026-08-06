let transactions = [];
let savingsGoal = 500;
let currentMode = 'expense';
let editingId = null;
let deferredPrompt = null;

const catColors = {
  'Comida': '#3FA679', 'Transporte': '#C9A227', 'Servicios': '#7F9CF5',
  'Entretenimiento': '#D4537E', 'Salud': '#5DCAA5', 'Otros': '#8A9690'
};
const catIcons = {
  'Comida': '🍽', 'Transporte': '🚌', 'Servicios': '💡', 'Entretenimiento': '🎬',
  'Salud': '💊', 'Otros': '📦', 'Ingreso': '💰'
};

const balanceOut = document.getElementById('balanceOut');
const dialArc = document.getElementById('dialArc');
const goalPct = document.getElementById('goalPct');
const goalLabel = document.getElementById('goalLabel');
const catBarsEl = document.getElementById('catBars');
const ledgerEl = document.getElementById('ledger');
const weeklyChartEl = document.getElementById('weeklyChart');
const modalBg = document.getElementById('modalBg');
const goalModalBg = document.getElementById('goalModalBg');
const installBtn = document.getElementById('installBtn');

function money(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function showToast(msg) {
  const holder = document.getElementById('toastHolder');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  holder.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// Formatea un objeto Date al valor que necesita un input datetime-local (hora local, no UTC)
function toLocalInputValue(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// ---------- Modal de agregar / editar movimiento ----------

function openModal(mode) {
  editingId = null;
  currentMode = mode;
  document.getElementById('modalTitle').textContent = mode === 'expense' ? 'Registrar gasto' : 'Registrar ingreso';
  document.getElementById('catField').style.display = mode === 'expense' ? 'block' : 'none';
  document.getElementById('mAmount').value = '';
  document.getElementById('mDesc').value = '';
  document.getElementById('mCategory').value = 'Comida';
  document.getElementById('mDate').value = toLocalInputValue(new Date());
  modalBg.classList.add('open');
}

function openEditModal(tx) {
  editingId = tx.id;
  currentMode = tx.type;
  document.getElementById('modalTitle').textContent = tx.type === 'expense' ? 'Editar gasto' : 'Editar ingreso';
  document.getElementById('catField').style.display = tx.type === 'expense' ? 'block' : 'none';
  document.getElementById('mAmount').value = tx.amt;
  document.getElementById('mDesc').value = tx.desc;
  if (tx.type === 'expense') document.getElementById('mCategory').value = tx.cat;
  document.getElementById('mDate').value = toLocalInputValue(new Date(tx.date));
  modalBg.classList.add('open');
}

function closeModal() { modalBg.classList.remove('open'); }

async function saveTx() {
  const amt = parseFloat(document.getElementById('mAmount').value);
  const desc = document.getElementById('mDesc').value.trim() || (currentMode === 'expense' ? 'Gasto' : 'Ingreso');
  const dateVal = document.getElementById('mDate').value;
  if (!amt || amt <= 0) { showToast('Ingresa un monto válido'); return; }
  if (!dateVal) { showToast('Selecciona una fecha y hora'); return; }
  const cat = currentMode === 'expense' ? (document.getElementById('mCategory').value.trim() || 'Otros') : 'Ingreso';
  const isoDate = new Date(dateVal).toISOString();

  if (editingId) {
    await updateTransaction({ id: editingId, amt, desc, cat, type: currentMode, date: isoDate });
    showToast('Movimiento actualizado');
  } else {
    await addTransaction({ amt, desc, cat, type: currentMode, date: isoDate });
    showToast('Movimiento guardado');
  }
  closeModal();
  await loadAndRender();
}

async function removeTx(id) {
  await deleteTransaction(id);
  await loadAndRender();
}

// ---------- Meta de ahorro ----------

function openGoalModal() {
  document.getElementById('gAmount').value = savingsGoal;
  goalModalBg.classList.add('open');
}
function closeGoalModal() { goalModalBg.classList.remove('open'); }

async function saveGoal() {
  const val = parseFloat(document.getElementById('gAmount').value);
  if (!val || val <= 0) { showToast('Ingresa una meta válida'); return; }
  savingsGoal = val;
  await setSetting('savingsGoal', val);
  closeGoalModal();
  render();
}

// ---------- Gráfica (Ingresos vs Gastos) — vista semanal o mensual ----------

let chartView = 'week';

function renderBarChart(data) {
  const maxVal = Math.max(1, ...data.map(d => Math.max(d.income, d.expense)));
  const chartH = 110;
  const barW = 12;
  const gap = 14;
  const groupW = barW * 2 + 3;
  const totalW = data.length * (groupW + gap);

  let bars = '';
  data.forEach((d, i) => {
    const x = i * (groupW + gap) + gap / 2;
    const incH = Math.round((d.income / maxVal) * chartH);
    const expH = Math.round((d.expense / maxVal) * chartH);
    bars += `
      <rect x="${x}" y="${chartH - incH}" width="${barW}" height="${Math.max(incH,2)}" rx="3" fill="#3FA679"/>
      <rect x="${x + barW + 3}" y="${chartH - expH}" width="${barW}" height="${Math.max(expH,2)}" rx="3" fill="#C9A227"/>
      <text x="${x + barW + 1.5}" y="${chartH + 18}" font-size="10" fill="#8A9690" text-anchor="middle" font-family="Inter, sans-serif">${d.label}</text>
    `;
  });

  weeklyChartEl.innerHTML = `
    <div class="chart-legend">
      <span><i style="background:#3FA679"></i>Ingresos</span>
      <span><i style="background:#C9A227"></i>Gastos</span>
    </div>
    <svg viewBox="0 0 ${totalW} ${chartH + 30}" width="100%" height="150" preserveAspectRatio="xMidYMid meet">
      ${bars}
    </svg>
  `;
}

function renderWeeklyChart() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  const data = days.map(d => {
    const key = d.toDateString();
    const dayTx = transactions.filter(t => new Date(t.date).toDateString() === key);
    const income = dayTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amt, 0);
    const expense = dayTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amt, 0);
    return { label: d.toLocaleDateString('es', { weekday: 'short' }).replace('.', ''), income, expense };
  });
  renderBarChart(data);
}

function renderMonthlyChart() {
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    months.push(d);
  }
  const data = months.map(d => {
    const m = d.getMonth(), y = d.getFullYear();
    const monthTx = transactions.filter(t => {
      const td = new Date(t.date);
      return td.getMonth() === m && td.getFullYear() === y;
    });
    const income = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amt, 0);
    const expense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amt, 0);
    return { label: d.toLocaleDateString('es', { month: 'short' }).replace('.', ''), income, expense };
  });
  renderBarChart(data);
}

function renderChart() {
  if (chartView === 'month') renderMonthlyChart();
  else renderWeeklyChart();
}

// ---------- Render principal ----------

function render() {
  const balance = transactions.reduce((s, t) => s + (t.type === 'income' ? t.amt : -t.amt), 0);
  balanceOut.textContent = money(balance);

  const pct = Math.max(0, Math.min(1, balance / savingsGoal));
  const circumference = 477.5;
  dialArc.setAttribute('stroke-dashoffset', circumference * (1 - pct));
  goalPct.textContent = Math.round(pct * 100) + '%';
  goalLabel.textContent = 'Meta: ' + money(savingsGoal);

  if (transactions.length === 0) {
    ledgerEl.innerHTML = '<div class="empty">Agrega tu primer movimiento arriba</div>';
  } else {
    ledgerEl.innerHTML = transactions.slice(0, 15).map(t => `
      <div class="tx">
        <div class="tx-left" data-id="${t.id}" role="button">
          <div class="tx-icon">${catIcons[t.cat] || '🏷️'}</div>
          <div>
            <div class="tx-name">${escapeHtml(t.desc)}</div>
            <div class="tx-date">${t.cat} · ${new Date(t.date).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })} · ${new Date(t.date).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <div class="tx-amt ${t.type === 'income' ? 'pos' : 'neg'}">${t.type === 'income' ? '+' : '-'}${money(t.amt)}</div>
          <button class="tx-del" data-id="${t.id}" aria-label="Eliminar">×</button>
        </div>
      </div>
    `).join('');

    ledgerEl.querySelectorAll('.tx-left').forEach(el => {
      el.addEventListener('click', () => {
        const tx = transactions.find(t => t.id === Number(el.dataset.id));
        if (tx) openEditModal(tx);
      });
    });
    ledgerEl.querySelectorAll('.tx-del').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeTx(Number(btn.dataset.id));
      });
    });
  }

  const expenses = transactions.filter(t => t.type === 'expense');
  if (expenses.length === 0) {
    catBarsEl.innerHTML = '<div class="empty">Aún no hay gastos registrados</div>';
  } else {
    const totals = {};
    expenses.forEach(t => totals[t.cat] = (totals[t.cat] || 0) + t.amt);
    const maxVal = Math.max(...Object.values(totals));
    catBarsEl.innerHTML = Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([cat, val]) => `
      <div class="cat-bar-row">
        <div class="cat-bar-top">
          <span class="cat-bar-name">${cat}</span>
          <span class="cat-bar-amt">${money(val)}</span>
        </div>
        <div class="cat-bar-track">
          <div class="cat-bar-fill" style="width:${(val / maxVal * 100).toFixed(0)}%; background:${catColors[cat] || '#7F9CF5'}"></div>
        </div>
      </div>
    `).join('');
  }

  renderChart();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Cierre de mes ----------

function openCierreModal() {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  const monthTx = transactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const incomes = monthTx.filter(t => t.type === 'income');
  const expenses = monthTx.filter(t => t.type === 'expense');
  const totalIncome = incomes.reduce((s, t) => s + t.amt, 0);
  const totalExpense = expenses.reduce((s, t) => s + t.amt, 0);
  const net = totalIncome - totalExpense;
  const monthName = now.toLocaleDateString('es', { month: 'long', year: 'numeric' });

  document.getElementById('cierreContent').innerHTML = `
    <div class="cierre-month">${monthName}</div>
    <div class="cierre-stat-row">
      <span class="cierre-stat-label">Ingresos registrados</span>
      <span class="cierre-stat-value">${incomes.length}</span>
    </div>
    <div class="cierre-stat-row">
      <span class="cierre-stat-label">Total ingresos</span>
      <span class="cierre-stat-value pos">${money(totalIncome)}</span>
    </div>
    <div class="cierre-stat-row">
      <span class="cierre-stat-label">Gastos registrados</span>
      <span class="cierre-stat-value">${expenses.length}</span>
    </div>
    <div class="cierre-stat-row">
      <span class="cierre-stat-label">Total gastos</span>
      <span class="cierre-stat-value">${money(totalExpense)}</span>
    </div>
    <div class="cierre-stat-row">
      <span class="cierre-stat-label">Balance neto del mes</span>
      <span class="cierre-stat-value ${net >= 0 ? 'pos' : 'neg-strong'}">${money(net)}</span>
    </div>
  `;
  document.getElementById('cierreModalBg').classList.add('open');
}
function closeCierreModal() {
  document.getElementById('cierreModalBg').classList.remove('open');
}

async function loadAndRender() {
  transactions = await getAllTransactions();
  savingsGoal = await getSetting('savingsGoal', 500);
  render();
}

document.getElementById('btnIncome').addEventListener('click', () => openModal('income'));
document.getElementById('btnExpense').addEventListener('click', () => openModal('expense'));
document.getElementById('mCancel').addEventListener('click', closeModal);
document.getElementById('mSave').addEventListener('click', saveTx);
document.getElementById('editGoalBtn').addEventListener('click', openGoalModal);
document.getElementById('gCancel').addEventListener('click', closeGoalModal);
document.getElementById('gSave').addEventListener('click', saveGoal);
document.getElementById('btnCierre').addEventListener('click', openCierreModal);
document.getElementById('cierreClose').addEventListener('click', closeCierreModal);
document.querySelectorAll('.chart-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    chartView = tab.dataset.view;
    document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    renderChart();
  });
});

// Si la app ya se está ejecutando instalada (modo standalone), no mostramos el botón
function isRunningStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

if (isRunningStandalone()) {
  installBtn.hidden = true;
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!isRunningStandalone()) installBtn.hidden = false;
});

installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) {
    showToast('Para instalar, usa el menú del navegador (⋮) y elige "Instalar app"');
    return;
  }
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') {
    showToast('Instalando Finanzas Claras…');
    installBtn.hidden = true;
  } else {
    showToast('Instalación cancelada');
  }
  deferredPrompt = null;
});

window.addEventListener('appinstalled', () => {
  installBtn.hidden = true;
  deferredPrompt = null;
  showToast('¡Instalada! Ya la tienes en tu pantalla de inicio');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(err => {
      console.error('Error registrando el service worker:', err);
    });
  });
}

loadAndRender();
