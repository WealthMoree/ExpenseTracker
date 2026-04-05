/* ===================================================
   FinanceWise – script.js
   Offline Personal Finance Tracker
   All data stored in IndexedDB (fallback: localStorage)
   =================================================== */

'use strict';

/* ==================== INDEXEDDB SETUP ==================== */
const DB_NAME    = 'FinanceWiseDB';
const DB_VERSION = 2;

let db = null;

const STORES = {
  accounts  : 'accounts',
  income    : 'income',
  expenses  : 'expenses',
  assets    : 'assets',
  insurance : 'insurance',
  loans     : 'loans',
  emis      : 'emis',
  transfers : 'transfers',
  settings  : 'settings',
};

function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      Object.values(STORES).forEach(name => {
        if (!d.objectStoreNames.contains(name)) {
          d.createObjectStore(name, { keyPath: 'id' });
        }
      });
    };

    req.onsuccess  = (e) => { db = e.target.result; resolve(); };
    req.onerror    = (e) => { console.error('IndexedDB error', e); reject(e); };
  });
}

/* Generic CRUD helpers */
function dbGetAll(store) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

function dbPut(store, item) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(item);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

function dbDelete(store, id) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

function dbGet(store, id) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/* ==================== APP STATE ==================== */
const state = {
  accounts  : [],
  income    : [],
  expenses  : [],
  assets    : [],
  insurance : [],
  loans     : [],
  emis      : [],
  transfers : [],
  settings  : {
    id         : 'app_settings',
    categories : ['Food','Travel','Medical','Household','Clothing','Education',
                  'Entertainment','Utilities','Transport','Groceries','Health',
                  'Shopping','Dining','Personal Care','Gifts','Other'],
    sources    : ['Salary','Business','Freelance','Rental','Dividend',
                  'Pension','Interest','Gift','Other'],
    darkMode   : false,
  },
};

/* ==================== UTILITIES ==================== */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function fmt(amount) {
  const n = parseFloat(amount) || 0;
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function monthYear(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentMonthYear() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentYear() { return new Date().getFullYear(); }

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent  = msg;
  t.className    = `toast ${type}`;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function confirmAction(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent   = title;
  document.getElementById('confirmMessage').textContent = message;
  const btn = document.getElementById('confirmOkBtn');
  btn.onclick = () => { closeModal('confirmModal'); onConfirm(); };
  openModal('confirmModal');
}

function getAccountById(id) {
  return state.accounts.find(a => a.id === id);
}

function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

function addYears(dateStr, years) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split('T')[0];
}

function daysBetween(d1, d2) {
  const ms = new Date(d2) - new Date(d1);
  return Math.round(ms / 86400000);
}

function calcEMI(principal, annualRate, months) {
  if (annualRate === 0) return principal / months;
  const r = annualRate / 12 / 100;
  return principal * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1);
}

/* ==================== NAVIGATION ==================== */
const SECTION_TITLES = {
  dashboard : 'Dashboard',
  accounts  : 'Bank Accounts',
  income    : 'Income Tracker',
  expenses  : 'Expense Tracker',
  assets    : 'Asset Tracker',
  insurance : 'Insurance Tracker',
  loans     : 'Loans & EMI',
  reports   : 'Reports & Analytics',
  settings  : 'Settings',
};

let currentSection = 'dashboard';

function navigateTo(section) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById(section).classList.add('active');
  document.querySelector(`.nav-btn[data-section="${section}"]`).classList.add('active');
  document.getElementById('pageTitle').textContent = SECTION_TITLES[section] || section;

  currentSection = section;
  renderSection(section);
  closeSidebar();
}

function renderSection(section) {
  switch (section) {
    case 'dashboard' : renderDashboard(); break;
    case 'accounts'  : renderAccounts();  break;
    case 'income'    : renderIncome();    break;
    case 'expenses'  : renderExpenses();  break;
    case 'assets'    : renderAssets();    break;
    case 'insurance' : renderInsurance(); break;
    case 'loans'     : renderLoans();     break;
    case 'reports'   : initReportFilters(); break;
    case 'settings'  : renderSettings(); break;
  }
}

/* Sidebar toggle */
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('overlay').classList.add('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

/* ==================== DASHBOARD ==================== */
function renderDashboard() {
  const totalBalance = state.accounts.reduce((s, a) => s + (a.balance || 0), 0);
  const cm = currentMonthYear();
  const cy = currentYear();

  const monthIncome  = state.income.filter(i => monthYear(i.date) === cm).reduce((s, i) => s + i.amount, 0);
  const monthExpense = state.expenses.filter(e => monthYear(e.date) === cm).reduce((s, e) => s + e.amount, 0);
  const totalAssets  = state.assets.reduce((s, a) => s + (a.currentValue || 0), 0);
  const totalLoans   = state.loans.reduce((s, l) => s + ((l.amount - l.paid) || 0), 0);
  const netWorth     = totalBalance + totalAssets - totalLoans;

  document.getElementById('dashTotalBalance').textContent  = fmt(totalBalance);
  document.getElementById('dashMonthIncome').textContent   = fmt(monthIncome);
  document.getElementById('dashMonthExpense').textContent  = fmt(monthExpense);
  document.getElementById('dashTotalAssets').textContent   = fmt(totalAssets);
  document.getElementById('dashTotalLoans').textContent    = fmt(totalLoans);
  document.getElementById('dashInsuranceCount').textContent = state.insurance.length;
  document.getElementById('dashNetWorth').textContent      = fmt(netWorth);

  /* Account list */
  const accEl = document.getElementById('dashAccountsList');
  if (state.accounts.length === 0) {
    accEl.innerHTML = '<p class="dash-empty">No bank accounts added yet.</p>';
  } else {
    accEl.innerHTML = state.accounts.map(a => `
      <div class="dash-item">
        <span>${a.bankName} — ${a.accountType}</span>
        <strong class="text-green">${fmt(a.balance)}</strong>
      </div>`).join('');
  }

  /* Upcoming premiums (within 30 days) */
  const premEl = document.getElementById('dashUpcomingPremiums');
  const upcoming = getUpcomingPremiums(30);
  if (upcoming.length === 0) {
    premEl.innerHTML = '<p class="dash-empty">No premiums due in next 30 days.</p>';
  } else {
    premEl.innerHTML = upcoming.map(p => `
      <div class="dash-item">
        <span>${p.name}</span>
        <span>${fmtDate(p.nextDate)} — <strong>${fmt(p.premium)}</strong></span>
      </div>`).join('');
  }

  /* Recent Transactions (last 10) */
  const txEl = document.getElementById('dashRecentTxn');
  const allTxn = [
    ...state.income.map(i => ({ ...i, _type: 'income' })),
    ...state.expenses.map(e => ({ ...e, _type: 'expense' })),
    ...state.transfers.map(t => ({ ...t, _type: 'transfer' })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

  if (allTxn.length === 0) {
    txEl.innerHTML = '<p class="dash-empty">No transactions yet.</p>';
  } else {
    txEl.innerHTML = allTxn.map(t => {
      if (t._type === 'income') return `
        <div class="dash-item">
          <span>💰 ${t.source} — ${fmtDate(t.date)}</span>
          <strong class="text-green">+${fmt(t.amount)}</strong>
        </div>`;
      if (t._type === 'expense') return `
        <div class="dash-item">
          <span>💸 ${t.category} — ${fmtDate(t.date)}</span>
          <strong class="text-red">-${fmt(t.amount)}</strong>
        </div>`;
      return `
        <div class="dash-item">
          <span>🔄 Transfer — ${fmtDate(t.date)}</span>
          <strong>${fmt(t.amount)}</strong>
        </div>`;
    }).join('');
  }
}

function getUpcomingPremiums(days) {
  const result = [];
  const now = new Date();
  const future = new Date(now); future.setDate(future.getDate() + days);

  state.insurance.forEach(ins => {
    const next = nextPremiumDate(ins);
    if (!next) return;
    const nd = new Date(next);
    if (nd >= now && nd <= future) {
      result.push({ name: ins.name, nextDate: next, premium: ins.premium });
    }
  });
  return result.sort((a, b) => new Date(a.nextDate) - new Date(b.nextDate));
}

function nextPremiumDate(ins) {
  if (!ins.startDate) return null;
  const freqMonths = { Monthly: 1, Quarterly: 3, 'Half-Yearly': 6, Yearly: 12, Single: 0 };
  const freq = freqMonths[ins.frequency] || 12;
  if (freq === 0) return null;

  let d = new Date(ins.startDate + 'T00:00:00');
  const now = new Date();
  while (d < now) d.setMonth(d.getMonth() + freq);
  return d.toISOString().split('T')[0];
}

/* ==================== BANK ACCOUNTS ==================== */
async function addAccount() {
  const bankName    = document.getElementById('accBankName').value.trim();
  const accountType = document.getElementById('accType').value;
  const balance     = parseFloat(document.getElementById('accBalance').value);
  const accNumber   = document.getElementById('accNumber').value.trim();
  const color       = document.getElementById('accColor').value;

  if (!bankName)        return showToast('Enter bank name.', 'error');
  if (isNaN(balance))   return showToast('Enter valid balance.', 'error');

  const account = { id: uid(), bankName, accountType, balance, accNumber, color, createdAt: today() };
  state.accounts.push(account);
  await dbPut(STORES.accounts, account);

  closeModal('addAccountModal');
  clearForm('addAccountModal');
  renderSection('accounts');
  showToast('Account added successfully!');
}

function renderAccounts() {
  const el = document.getElementById('accountsList');

  if (state.accounts.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🏦</div><p>No bank accounts added yet.<br>Click "+ Add Account" to start.</p></div>';
  } else {
    el.innerHTML = state.accounts.map(a => `
      <div class="account-card color-${a.color || 'green'}">
        <div class="account-bank">${escHtml(a.bankName)}</div>
        <div class="account-type">${a.accountType}${a.accNumber ? ' ••••' + a.accNumber : ''}</div>
        <div class="account-balance">${fmt(a.balance)}</div>
        <div class="account-actions">
          <button class="btn btn-sm btn-outline" onclick="openEditAccount('${a.id}')">✏️ Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteAccount('${a.id}')">🗑️ Delete</button>
        </div>
      </div>`).join('');
  }

  /* Populate transfer dropdowns */
  populateAccountDropdowns(['transferFrom','transferTo','incAccount','expAccount','payLoanAccount','emiAccount']);
}

function openEditAccount(id) {
  const a = getAccountById(id);
  if (!a) return;
  document.getElementById('editAccId').value       = id;
  document.getElementById('editAccBankName').value = a.bankName;
  document.getElementById('editAccType').value     = a.accountType;
  document.getElementById('editAccBalance').value  = a.balance;
  openModal('editAccountModal');
}

async function saveEditAccount() {
  const id      = document.getElementById('editAccId').value;
  const bankName = document.getElementById('editAccBankName').value.trim();
  const accType  = document.getElementById('editAccType').value;
  const balance  = parseFloat(document.getElementById('editAccBalance').value);

  if (!bankName || isNaN(balance)) return showToast('Fill in all fields.', 'error');

  const idx = state.accounts.findIndex(a => a.id === id);
  if (idx === -1) return;
  state.accounts[idx] = { ...state.accounts[idx], bankName, accountType: accType, balance };
  await dbPut(STORES.accounts, state.accounts[idx]);

  closeModal('editAccountModal');
  renderAccounts();
  renderDashboard();
  showToast('Account updated!');
}

async function deleteAccount(id) {
  confirmAction('Delete Account', 'Are you sure? This will NOT undo past transactions.', async () => {
    state.accounts = state.accounts.filter(a => a.id !== id);
    await dbDelete(STORES.accounts, id);
    renderAccounts();
    renderDashboard();
    showToast('Account deleted.', 'info');
  });
}

async function doTransfer() {
  const fromId = document.getElementById('transferFrom').value;
  const toId   = document.getElementById('transferTo').value;
  const amount = parseFloat(document.getElementById('transferAmount').value);
  const date   = document.getElementById('transferDate').value || today();
  const note   = document.getElementById('transferNote').value.trim();

  if (!fromId || !toId)     return showToast('Select both accounts.', 'error');
  if (fromId === toId)      return showToast('Cannot transfer to same account.', 'error');
  if (!amount || amount<=0) return showToast('Enter valid amount.', 'error');

  const from = getAccountById(fromId);
  const to   = getAccountById(toId);
  if (from.balance < amount) return showToast(`Insufficient balance in ${from.bankName}.`, 'error');

  from.balance -= amount;
  to.balance   += amount;
  await dbPut(STORES.accounts, from);
  await dbPut(STORES.accounts, to);

  const transfer = { id: uid(), fromId, toId, amount, date, note };
  state.transfers.push(transfer);
  await dbPut(STORES.transfers, transfer);

  document.getElementById('transferAmount').value = '';
  document.getElementById('transferNote').value   = '';
  renderAccounts();
  renderDashboard();
  showToast(`Transferred ${fmt(amount)} from ${from.bankName} to ${to.bankName}`);
}

function populateAccountDropdowns(ids) {
  ids.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = state.accounts.length === 0
      ? '<option value="">No accounts</option>'
      : state.accounts.map(a => `<option value="${a.id}">${escHtml(a.bankName)} (${a.accountType}) — ${fmt(a.balance)}</option>`).join('');
    if (prev) sel.value = prev;
  });
}

/* ==================== INCOME ==================== */
async function addIncome() {
  const amount  = parseFloat(document.getElementById('incAmount').value);
  const source  = document.getElementById('incSource').value;
  const accId   = document.getElementById('incAccount').value;
  const date    = document.getElementById('incDate').value;
  const note    = document.getElementById('incNote').value.trim();

  if (!amount || amount <= 0) return showToast('Enter valid amount.', 'error');
  if (!source)                return showToast('Select a source.', 'error');
  if (!accId)                 return showToast('Select a bank account.', 'error');
  if (!date)                  return showToast('Select a date.', 'error');

  const acc = getAccountById(accId);
  acc.balance += amount;
  await dbPut(STORES.accounts, acc);

  const entry = { id: uid(), amount, source, accId, date, note };
  state.income.push(entry);
  await dbPut(STORES.income, entry);

  closeModal('addIncomeModal');
  clearForm('addIncomeModal');
  renderSection('income');
  renderDashboard();
  showToast(`Income of ${fmt(amount)} added!`);
}

function renderIncome() {
  populateSourceSelect('incSource');
  populateAccountDropdowns(['incAccount']);

  const cm = currentMonthYear();
  const cy = currentYear().toString();
  const thisMonth = state.income.filter(i => monthYear(i.date) === cm).reduce((s,i) => s + i.amount, 0);
  const thisYear  = state.income.filter(i => i.date && i.date.startsWith(cy)).reduce((s,i) => s + i.amount, 0);
  const allTime   = state.income.reduce((s,i) => s + i.amount, 0);

  document.getElementById('incomeThisMonth').textContent = fmt(thisMonth);
  document.getElementById('incomeThisYear').textContent  = fmt(thisYear);
  document.getElementById('incomeAllTime').textContent   = fmt(allTime);

  populateFilterDropdowns('incomeFilterMonth', 'incomeFilterYear', state.income.map(i => i.date));
  populateSelect('incomeFilterSource', ['', ...new Set(state.income.map(i => i.source))]);

  renderIncomeList(state.income);
}

function filterIncome() {
  const month  = document.getElementById('incomeFilterMonth').value;
  const year   = document.getElementById('incomeFilterYear').value;
  const source = document.getElementById('incomeFilterSource').value;

  let list = [...state.income];
  if (month) list = list.filter(i => i.date && i.date.slice(5, 7) === month);
  if (year)  list = list.filter(i => i.date && i.date.startsWith(year));
  if (source) list = list.filter(i => i.source === source);
  renderIncomeList(list);
}

function clearIncomeFilter() {
  document.getElementById('incomeFilterMonth').value  = '';
  document.getElementById('incomeFilterYear').value   = '';
  document.getElementById('incomeFilterSource').value = '';
  renderIncomeList(state.income);
}

function renderIncomeList(list) {
  const el = document.getElementById('incomeList');
  if (!list.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">💰</div><p>No income entries found.</p></div>';
    return;
  }
  const sorted = [...list].sort((a,b) => new Date(b.date) - new Date(a.date));
  el.innerHTML = sorted.map(i => {
    const acc = getAccountById(i.accId);
    return `
      <div class="txn-item income-item">
        <div class="txn-icon">💰</div>
        <div class="txn-info">
          <div class="txn-title">${escHtml(i.source)}${i.note ? ' — ' + escHtml(i.note) : ''}</div>
          <div class="txn-sub">${fmtDate(i.date)} | ${acc ? escHtml(acc.bankName) : 'Unknown account'}</div>
        </div>
        <div class="txn-amount positive">${fmt(i.amount)}</div>
        <button class="btn-icon del" onclick="deleteIncome('${i.id}')" title="Delete">🗑️</button>
      </div>`;
  }).join('');
}

async function deleteIncome(id) {
  confirmAction('Delete Income', 'This will reverse the balance. Continue?', async () => {
    const entry = state.income.find(i => i.id === id);
    if (!entry) return;
    const acc = getAccountById(entry.accId);
    if (acc) {
      acc.balance -= entry.amount;
      await dbPut(STORES.accounts, acc);
    }
    state.income = state.income.filter(i => i.id !== id);
    await dbDelete(STORES.income, id);
    renderIncome();
    renderDashboard();
    showToast('Income entry deleted.', 'info');
  });
}

/* ==================== EXPENSES ==================== */
async function addExpense() {
  const amount   = parseFloat(document.getElementById('expAmount').value);
  const category = document.getElementById('expCategory').value;
  const accId    = document.getElementById('expAccount').value;
  const date     = document.getElementById('expDate').value;
  const note     = document.getElementById('expNote').value.trim();
  const payMode  = document.getElementById('expPayMode').value;

  if (!amount || amount <= 0) return showToast('Enter valid amount.', 'error');
  if (!category)              return showToast('Select a category.', 'error');
  if (!accId)                 return showToast('Select a bank account.', 'error');
  if (!date)                  return showToast('Select a date.', 'error');

  const acc = getAccountById(accId);
  if (acc.balance < amount) return showToast(`Insufficient balance in ${acc.bankName}.`, 'error');

  acc.balance -= amount;
  await dbPut(STORES.accounts, acc);

  const entry = { id: uid(), amount, category, accId, date, note, payMode };
  state.expenses.push(entry);
  await dbPut(STORES.expenses, entry);

  closeModal('addExpenseModal');
  clearForm('addExpenseModal');
  renderSection('expenses');
  renderDashboard();
  showToast(`Expense of ${fmt(amount)} recorded!`);
}

function renderExpenses() {
  populateCategorySelect('expCategory');
  populateAccountDropdowns(['expAccount']);

  const cm = currentMonthYear();
  const cy = currentYear().toString();
  const thisMonth = state.expenses.filter(e => monthYear(e.date) === cm).reduce((s,e) => s + e.amount, 0);
  const thisYear  = state.expenses.filter(e => e.date && e.date.startsWith(cy)).reduce((s,e) => s + e.amount, 0);
  const allTime   = state.expenses.reduce((s,e) => s + e.amount, 0);

  document.getElementById('expenseThisMonth').textContent = fmt(thisMonth);
  document.getElementById('expenseThisYear').textContent  = fmt(thisYear);
  document.getElementById('expenseAllTime').textContent   = fmt(allTime);

  /* Category summary for current month */
  const catSummary = {};
  state.expenses.filter(e => monthYear(e.date) === cm).forEach(e => {
    catSummary[e.category] = (catSummary[e.category] || { total: 0, count: 0 });
    catSummary[e.category].total += e.amount;
    catSummary[e.category].count++;
  });

  const catEl = document.getElementById('categorySummary');
  const cats  = Object.entries(catSummary).sort((a,b) => b[1].total - a[1].total);
  catEl.innerHTML = cats.length === 0
    ? '<p class="text-muted">No expenses this month.</p>'
    : cats.map(([cat, info]) => `
        <div class="cat-pill">
          <div class="cat-name">${escHtml(cat)}</div>
          <div class="cat-amount">${fmt(info.total)}</div>
          <div class="cat-count">${info.count} transaction${info.count > 1 ? 's' : ''}</div>
        </div>`).join('');

  populateFilterDropdowns('expenseFilterMonth', 'expenseFilterYear', state.expenses.map(e => e.date));
  populateSelect('expenseFilterCategory', ['', ...new Set(state.expenses.map(e => e.category))]);
  /* Account filter */
  const accSel = document.getElementById('expenseFilterAccount');
  if (accSel) {
    accSel.innerHTML = '<option value="">All Accounts</option>' +
      state.accounts.map(a => `<option value="${a.id}">${escHtml(a.bankName)}</option>`).join('');
  }

  renderExpenseList(state.expenses);
}

function filterExpenses() {
  const month    = document.getElementById('expenseFilterMonth').value;
  const year     = document.getElementById('expenseFilterYear').value;
  const category = document.getElementById('expenseFilterCategory').value;
  const account  = document.getElementById('expenseFilterAccount').value;

  let list = [...state.expenses];
  if (month)    list = list.filter(e => e.date && e.date.slice(5,7) === month);
  if (year)     list = list.filter(e => e.date && e.date.startsWith(year));
  if (category) list = list.filter(e => e.category === category);
  if (account)  list = list.filter(e => e.accId === account);
  renderExpenseList(list);
}

function clearExpenseFilter() {
  ['expenseFilterMonth','expenseFilterYear','expenseFilterCategory','expenseFilterAccount']
    .forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  renderExpenseList(state.expenses);
}

function renderExpenseList(list) {
  const el = document.getElementById('expenseList');
  if (!list.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">💸</div><p>No expenses found.</p></div>';
    return;
  }
  const sorted = [...list].sort((a,b) => new Date(b.date) - new Date(a.date));
  el.innerHTML = sorted.map(e => {
    const acc = getAccountById(e.accId);
    return `
      <div class="txn-item expense-item">
        <div class="txn-icon">💸</div>
        <div class="txn-info">
          <div class="txn-title">${escHtml(e.category)}${e.note ? ' — ' + escHtml(e.note) : ''}</div>
          <div class="txn-sub">${fmtDate(e.date)} | ${acc ? escHtml(acc.bankName) : 'Unknown'} | ${e.payMode || ''}</div>
        </div>
        <div class="txn-amount negative">-${fmt(e.amount)}</div>
        <button class="btn-icon del" onclick="deleteExpense('${e.id}')" title="Delete">🗑️</button>
      </div>`;
  }).join('');
}

async function deleteExpense(id) {
  confirmAction('Delete Expense', 'This will reverse the account balance. Continue?', async () => {
    const entry = state.expenses.find(e => e.id === id);
    if (!entry) return;
    const acc = getAccountById(entry.accId);
    if (acc) {
      acc.balance += entry.amount;
      await dbPut(STORES.accounts, acc);
    }
    state.expenses = state.expenses.filter(e => e.id !== id);
    await dbDelete(STORES.expenses, id);
    renderExpenses();
    renderDashboard();
    showToast('Expense deleted.', 'info');
  });
}

/* ==================== ASSETS ==================== */
async function addAsset() {
  const type         = document.getElementById('assetType').value;
  const name         = document.getElementById('assetName').value.trim();
  const invested     = parseFloat(document.getElementById('assetInvested').value);
  const currentValue = parseFloat(document.getElementById('assetCurrent').value);
  const date         = document.getElementById('assetDate').value;
  const notes        = document.getElementById('assetNotes').value.trim();

  if (!name)               return showToast('Enter asset name.', 'error');
  if (isNaN(invested))     return showToast('Enter valid invested amount.', 'error');
  if (isNaN(currentValue)) return showToast('Enter valid current value.', 'error');

  const asset = { id: uid(), type, name, invested, currentValue, date, notes };
  state.assets.push(asset);
  await dbPut(STORES.assets, asset);

  closeModal('addAssetModal');
  clearForm('addAssetModal');
  renderSection('assets');
  renderDashboard();
  showToast('Asset added!');
}

let assetFilter = 'all';

function filterAssets(type, btn) {
  assetFilter = type;
  document.querySelectorAll('#assets .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderAssetsList();
}

function renderAssets() {
  renderAssetsSummary();
  renderAssetsList();
}

function renderAssetsSummary() {
  const totalInvested = state.assets.reduce((s,a) => s + a.invested, 0);
  const totalCurrent  = state.assets.reduce((s,a) => s + a.currentValue, 0);
  const gain          = totalCurrent - totalInvested;
  document.getElementById('assetTotalInvested').textContent = fmt(totalInvested);
  document.getElementById('assetTotalCurrent').textContent  = fmt(totalCurrent);
  document.getElementById('assetTotalGain').textContent     = fmt(gain);
  document.getElementById('assetTotalGain').style.color = gain >= 0 ? 'var(--green)' : 'var(--red)';
}

function renderAssetsList() {
  const el   = document.getElementById('assetsList');
  const list = assetFilter === 'all' ? state.assets : state.assets.filter(a => a.type === assetFilter);

  if (!list.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📈</div><p>No assets found.</p></div>';
    return;
  }

  el.innerHTML = list.map(a => {
    const gain    = a.currentValue - a.invested;
    const gainPct = a.invested > 0 ? ((gain / a.invested) * 100).toFixed(1) : 0;
    const gainCls = gain >= 0 ? 'asset-gain' : 'asset-loss';
    return `
      <div class="asset-card">
        <span class="asset-type-badge">${escHtml(a.type)}</span>
        <div class="asset-name">${escHtml(a.name)}</div>
        <div class="asset-values">
          <div class="asset-val-box">
            <span class="asset-val-label">Invested</span>
            <span class="asset-val-num">${fmt(a.invested)}</span>
          </div>
          <div class="asset-val-box">
            <span class="asset-val-label">Current Value</span>
            <span class="asset-val-num">${fmt(a.currentValue)}</span>
          </div>
          <div class="asset-val-box">
            <span class="asset-val-label">Gain/Loss</span>
            <span class="asset-val-num ${gainCls}">${gain >= 0 ? '+' : ''}${fmt(gain)} (${gainPct}%)</span>
          </div>
        </div>
        ${a.date ? `<div class="text-muted" style="font-size:0.8rem;margin-top:8px;">Since ${fmtDate(a.date)}</div>` : ''}
        ${a.notes ? `<div class="text-muted" style="font-size:0.82rem;margin-top:4px;">${escHtml(a.notes)}</div>` : ''}
        <div class="asset-actions">
          <button class="btn btn-sm btn-outline" onclick="openEditAsset('${a.id}')">✏️ Update Value</button>
          <button class="btn btn-sm btn-danger"  onclick="deleteAsset('${a.id}')">🗑️</button>
        </div>
      </div>`;
  }).join('');
}

function openEditAsset(id) {
  const a = state.assets.find(x => x.id === id);
  if (!a) return;
  document.getElementById('editAssetId').value    = id;
  document.getElementById('editAssetValue').value = a.currentValue;
  document.getElementById('editAssetNotes').value = a.notes || '';
  openModal('editAssetModal');
}

async function updateAsset() {
  const id    = document.getElementById('editAssetId').value;
  const val   = parseFloat(document.getElementById('editAssetValue').value);
  const notes = document.getElementById('editAssetNotes').value.trim();

  if (isNaN(val)) return showToast('Enter valid value.', 'error');

  const idx = state.assets.findIndex(a => a.id === id);
  state.assets[idx] = { ...state.assets[idx], currentValue: val, notes };
  await dbPut(STORES.assets, state.assets[idx]);

  closeModal('editAssetModal');
  renderAssets();
  renderDashboard();
  showToast('Asset updated!');
}

async function deleteAsset(id) {
  confirmAction('Delete Asset', 'Delete this asset record?', async () => {
    state.assets = state.assets.filter(a => a.id !== id);
    await dbDelete(STORES.assets, id);
    renderAssets();
    renderDashboard();
    showToast('Asset deleted.', 'info');
  });
}

/* ==================== INSURANCE ==================== */
async function addInsurance() {
  const name          = document.getElementById('insName').value.trim();
  const type          = document.getElementById('insType').value;
  const company       = document.getElementById('insCompany').value.trim();
  const sumAssured    = parseFloat(document.getElementById('insSumAssured').value) || 0;
  const premium       = parseFloat(document.getElementById('insPremium').value);
  const frequency     = document.getElementById('insFrequency').value;
  const startDate     = document.getElementById('insStartDate').value;
  const payingYears   = parseInt(document.getElementById('insPayingYears').value) || 0;
  const lockIn        = parseInt(document.getElementById('insLockIn').value) || 0;
  const policyTerm    = parseInt(document.getElementById('insPolicyTerm').value) || 0;
  const payoutType    = document.getElementById('insPayoutType').value;
  const maturityAmount= parseFloat(document.getElementById('insMaturityAmount').value) || 0;
  const nominee       = document.getElementById('insNominee').value.trim();
  const notes         = document.getElementById('insNotes').value.trim();

  if (!name)             return showToast('Enter policy name.', 'error');
  if (!premium || premium<=0) return showToast('Enter valid premium amount.', 'error');
  if (!startDate)        return showToast('Select start date.', 'error');

  const policy = { id: uid(), name, type, company, sumAssured, premium, frequency,
                   startDate, payingYears, lockIn, policyTerm, payoutType,
                   maturityAmount, nominee, notes };
  state.insurance.push(policy);
  await dbPut(STORES.insurance, policy);

  closeModal('addInsuranceModal');
  clearForm('addInsuranceModal');
  renderSection('insurance');
  renderDashboard();
  showToast('Insurance policy added!');
}

function renderInsurance() {
  const annualPremium = state.insurance.reduce((s, ins) => {
    const freqMult = { Monthly: 12, Quarterly: 4, 'Half-Yearly': 2, Yearly: 1, Single: 0 };
    return s + (ins.premium * (freqMult[ins.frequency] || 1));
  }, 0);

  document.getElementById('insTotalPremium').textContent = fmt(annualPremium);
  document.getElementById('insActiveCount').textContent  = state.insurance.length;

  const el = document.getElementById('insuranceList');
  if (!state.insurance.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🛡️</div><p>No insurance policies added yet.</p></div>';
    return;
  }

  el.innerHTML = state.insurance.map(ins => {
    const maturityDate = ins.startDate && ins.policyTerm
      ? addYears(ins.startDate, ins.policyTerm) : null;
    const premiumEndDate = ins.startDate && ins.payingYears
      ? addYears(ins.startDate, ins.payingYears) : null;
    const nextPrem = nextPremiumDate(ins);
    const lockEndDate = ins.startDate && ins.lockIn
      ? addYears(ins.startDate, ins.lockIn) : null;
    const now = new Date();
    const isPremiumActive = premiumEndDate ? new Date(premiumEndDate) > now : true;

    return `
      <div class="ins-card">
        <span class="ins-type-badge">${ins.type}</span>
        <div class="ins-name">${escHtml(ins.name)}</div>
        <div class="ins-company">${ins.company ? escHtml(ins.company) : '—'}</div>
        <div class="ins-detail-grid">
          <div class="ins-detail">
            <span class="ins-detail-label">Premium</span>
            <span class="ins-detail-val">${fmt(ins.premium)} / ${ins.frequency}</span>
          </div>
          <div class="ins-detail">
            <span class="ins-detail-label">Sum Assured</span>
            <span class="ins-detail-val">${ins.sumAssured ? fmt(ins.sumAssured) : '—'}</span>
          </div>
          <div class="ins-detail">
            <span class="ins-detail-label">Start Date</span>
            <span class="ins-detail-val">${fmtDate(ins.startDate)}</span>
          </div>
          <div class="ins-detail">
            <span class="ins-detail-label">Next Premium</span>
            <span class="ins-detail-val" style="color:var(--orange)">${nextPrem ? fmtDate(nextPrem) : '—'}</span>
          </div>
          ${premiumEndDate ? `
          <div class="ins-detail">
            <span class="ins-detail-label">Premiums End</span>
            <span class="ins-detail-val">${fmtDate(premiumEndDate)} (${ins.payingYears} yrs)</span>
          </div>` : ''}
          ${lockEndDate ? `
          <div class="ins-detail">
            <span class="ins-detail-label">Lock-in Ends</span>
            <span class="ins-detail-val">${fmtDate(lockEndDate)}</span>
          </div>` : ''}
          ${maturityDate ? `
          <div class="ins-detail">
            <span class="ins-detail-label">Maturity</span>
            <span class="ins-detail-val text-green">${fmtDate(maturityDate)}</span>
          </div>` : ''}
          ${ins.maturityAmount ? `
          <div class="ins-detail">
            <span class="ins-detail-label">Maturity Amount</span>
            <span class="ins-detail-val text-green">${fmt(ins.maturityAmount)} (${ins.payoutType})</span>
          </div>` : ''}
          ${ins.nominee ? `
          <div class="ins-detail">
            <span class="ins-detail-label">Nominee</span>
            <span class="ins-detail-val">${escHtml(ins.nominee)}</span>
          </div>` : ''}
        </div>
        ${ins.notes ? `<div class="ins-timeline">${escHtml(ins.notes)}</div>` : ''}
        <div class="ins-actions">
          <button class="btn btn-sm btn-danger" onclick="deleteInsurance('${ins.id}')">🗑️ Delete</button>
        </div>
      </div>`;
  }).join('');
}

async function deleteInsurance(id) {
  confirmAction('Delete Policy', 'Delete this insurance policy?', async () => {
    state.insurance = state.insurance.filter(i => i.id !== id);
    await dbDelete(STORES.insurance, id);
    renderInsurance();
    renderDashboard();
    showToast('Policy deleted.', 'info');
  });
}

/* ==================== LOANS ==================== */
async function addLoan() {
  const name      = document.getElementById('loanName').value.trim();
  const type      = document.getElementById('loanType').value;
  const amount    = parseFloat(document.getElementById('loanAmount').value);
  const rate      = parseFloat(document.getElementById('loanRate').value);
  const duration  = parseInt(document.getElementById('loanDuration').value);
  const startDate = document.getElementById('loanStartDate').value;
  const lender    = document.getElementById('loanLender').value.trim();
  const paid      = parseFloat(document.getElementById('loanPaid').value) || 0;

  if (!name)                 return showToast('Enter loan name.', 'error');
  if (!amount || amount <= 0) return showToast('Enter valid loan amount.', 'error');
  if (isNaN(rate))           return showToast('Enter interest rate.', 'error');
  if (!duration || duration<1) return showToast('Enter loan duration.', 'error');
  if (!startDate)            return showToast('Select start date.', 'error');

  const emi = calcEMI(amount, rate, duration);

  const loan = { id: uid(), name, type, amount, rate, duration, startDate, lender, paid, emi };
  state.loans.push(loan);
  await dbPut(STORES.loans, loan);

  closeModal('addLoanModal');
  clearForm('addLoanModal');
  renderSection('loans');
  renderDashboard();
  showToast('Loan added!');
}

function renderLoans() {
  const totalOutstanding = state.loans.reduce((s,l) => s + Math.max(l.amount - l.paid, 0), 0);
  const totalPaid        = state.loans.reduce((s,l) => s + l.paid, 0);
  document.getElementById('loanTotalOutstanding').textContent = fmt(totalOutstanding);
  document.getElementById('loanTotalPaid').textContent        = fmt(totalPaid);

  const el = document.getElementById('loansList');
  if (!state.loans.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🏠</div><p>No loans added yet.</p></div>';
    return;
  }

  el.innerHTML = state.loans.map(l => {
    const outstanding = Math.max(l.amount - l.paid, 0);
    const paidPct     = l.amount > 0 ? Math.min((l.paid / l.amount) * 100, 100).toFixed(1) : 0;
    const endDate     = addMonths(l.startDate, l.duration);
    const totalInterest = (l.emi * l.duration) - l.amount;
    const emisPaid    = l.paid > 0 ? Math.round(l.paid / l.emi) : 0;
    const emisLeft    = Math.max(l.duration - emisPaid, 0);

    return `
      <div class="loan-card">
        <span class="loan-type-badge">${l.type}</span>
        <div class="loan-name">${escHtml(l.name)}${l.lender ? ' — ' + escHtml(l.lender) : ''}</div>
        <div class="loan-detail-grid">
          <div class="loan-detail">
            <span class="loan-detail-label">Loan Amount</span>
            <span class="loan-detail-val">${fmt(l.amount)}</span>
          </div>
          <div class="loan-detail">
            <span class="loan-detail-label">Outstanding</span>
            <span class="loan-detail-val text-red">${fmt(outstanding)}</span>
          </div>
          <div class="loan-detail">
            <span class="loan-detail-label">EMI</span>
            <span class="loan-detail-val">${fmt(l.emi)} /mo</span>
          </div>
          <div class="loan-detail">
            <span class="loan-detail-label">Interest Rate</span>
            <span class="loan-detail-val">${l.rate}% p.a.</span>
          </div>
          <div class="loan-detail">
            <span class="loan-detail-label">EMIs Remaining</span>
            <span class="loan-detail-val">${emisLeft} of ${l.duration}</span>
          </div>
          <div class="loan-detail">
            <span class="loan-detail-label">Loan Ends</span>
            <span class="loan-detail-val">${fmtDate(endDate)}</span>
          </div>
        </div>
        <div class="loan-progress-wrap">
          <div class="loan-progress-label">
            <span>Paid: ${fmt(l.paid)} (${paidPct}%)</span>
            <span>Left: ${fmt(outstanding)}</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width:${paidPct}%"></div>
          </div>
        </div>
        <div class="loan-actions">
          <button class="btn btn-sm btn-primary" onclick="openLoanLedger('${l.id}')">📋 Loan Ledger</button>
          <button class="btn btn-sm btn-secondary" onclick="openLoanPayment('${l.id}')">💳 Pay EMI</button>
          <button class="btn btn-sm btn-danger" onclick="deleteLoan('${l.id}')">🗑️</button>
        </div>
      </div>`;
  }).join('');

  /* EMIs */
  renderEMIs();
  populateAccountDropdowns(['payLoanAccount','emiAccount']);
}

function renderEMIs() {
  const el = document.getElementById('emisList');
  if (!state.emis.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><p>No EMIs tracked yet.</p></div>';
    return;
  }

  el.innerHTML = state.emis.map(e => {
    const remaining  = Math.max(e.total - e.paid, 0);
    const paidPct    = e.total > 0 ? ((e.paid / e.total) * 100).toFixed(1) : 0;
    const nextDate   = addMonths(e.startDate, e.paid);
    const endDate    = addMonths(e.startDate, e.total);
    const acc        = getAccountById(e.accId);

    return `
      <div class="loan-card" style="border-left-color:var(--purple)">
        <span class="loan-type-badge" style="background:var(--purple-light);color:var(--purple)">EMI</span>
        <div class="loan-name">${escHtml(e.name)}</div>
        <div class="loan-detail-grid">
          <div class="loan-detail">
            <span class="loan-detail-label">EMI Amount</span>
            <span class="loan-detail-val">${fmt(e.amount)} /mo</span>
          </div>
          <div class="loan-detail">
            <span class="loan-detail-label">Paid / Total</span>
            <span class="loan-detail-val">${e.paid} / ${e.total} EMIs</span>
          </div>
          <div class="loan-detail">
            <span class="loan-detail-label">Remaining</span>
            <span class="loan-detail-val text-red">${remaining} EMIs (${fmt(remaining * e.amount)})</span>
          </div>
          <div class="loan-detail">
            <span class="loan-detail-label">Next EMI Due</span>
            <span class="loan-detail-val" style="color:var(--orange)">${fmtDate(nextDate)}</span>
          </div>
          <div class="loan-detail">
            <span class="loan-detail-label">Final EMI</span>
            <span class="loan-detail-val">${fmtDate(endDate)}</span>
          </div>
          <div class="loan-detail">
            <span class="loan-detail-label">Debit Account</span>
            <span class="loan-detail-val">${acc ? escHtml(acc.bankName) : '—'}</span>
          </div>
        </div>
        <div class="loan-progress-wrap">
          <div class="loan-progress-label">
            <span>Progress: ${paidPct}% paid</span>
            <span>${remaining} left</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width:${paidPct}%;background:var(--purple)"></div>
          </div>
        </div>
        <div class="loan-actions">
          <button class="btn btn-sm btn-secondary" onclick="markEmiPaid('${e.id}')">✅ Mark Paid (+1)</button>
          <button class="btn btn-sm btn-danger"    onclick="deleteEmi('${e.id}')">🗑️</button>
        </div>
        ${e.notes ? `<div class="text-muted" style="font-size:0.82rem;margin-top:8px;">${escHtml(e.notes)}</div>` : ''}
      </div>`;
  }).join('');
}

async function addEmi() {
  const name      = document.getElementById('emiName').value.trim();
  const amount    = parseFloat(document.getElementById('emiAmount').value);
  const total     = parseInt(document.getElementById('emiTotal').value);
  const paid      = parseInt(document.getElementById('emiPaid').value) || 0;
  const startDate = document.getElementById('emiStartDate').value;
  const accId     = document.getElementById('emiAccount').value;
  const notes     = document.getElementById('emiNotes').value.trim();

  if (!name)              return showToast('Enter EMI description.', 'error');
  if (!amount||amount<=0) return showToast('Enter valid EMI amount.', 'error');
  if (!total||total<1)    return showToast('Enter total number of EMIs.', 'error');
  if (!startDate)         return showToast('Select start date.', 'error');

  const emi = { id: uid(), name, amount, total, paid, startDate, accId, notes };
  state.emis.push(emi);
  await dbPut(STORES.emis, emi);

  closeModal('addEmiModal');
  clearForm('addEmiModal');
  renderLoans();
  showToast('EMI added!');
}

async function markEmiPaid(id) {
  const idx = state.emis.findIndex(e => e.id === id);
  if (idx === -1) return;
  if (state.emis[idx].paid >= state.emis[idx].total) return showToast('All EMIs already paid!', 'info');
  state.emis[idx].paid++;

  const emi = state.emis[idx];
  const acc = getAccountById(emi.accId);
  if (acc) {
    if (acc.balance < emi.amount) {
      showToast(`Warning: Insufficient balance in ${acc.bankName}!`, 'error');
    } else {
      acc.balance -= emi.amount;
      await dbPut(STORES.accounts, acc);
      /* Also record as expense */
      const entry = { id: uid(), amount: emi.amount, category: 'EMI', accId: emi.accId,
                      date: today(), note: emi.name, payMode: 'Auto Debit' };
      state.expenses.push(entry);
      await dbPut(STORES.expenses, entry);
    }
  }

  await dbPut(STORES.emis, state.emis[idx]);
  renderLoans();
  renderDashboard();
  showToast('EMI marked as paid!');
}

async function deleteEmi(id) {
  confirmAction('Delete EMI', 'Delete this EMI tracker?', async () => {
    state.emis = state.emis.filter(e => e.id !== id);
    await dbDelete(STORES.emis, id);
    renderLoans();
    showToast('EMI deleted.', 'info');
  });
}

function switchLoanTab(tabId, btn) {
  document.querySelectorAll('.loan-tab-content').forEach(t => t.style.display = 'none');
  document.getElementById(tabId).style.display = 'block';
  document.querySelectorAll('#loans .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function openLoanPayment(id) {
  const l = state.loans.find(x => x.id === id);
  if (!l) return;
  document.getElementById('payLoanId').value     = id;
  document.getElementById('payLoanAmount').value = l.emi.toFixed(2);
  document.getElementById('payLoanDate').value   = today();
  populateAccountDropdowns(['payLoanAccount']);
  openModal('loanPaymentModal');
}

async function recordLoanPayment() {
  const id     = document.getElementById('payLoanId').value;
  const amount = parseFloat(document.getElementById('payLoanAmount').value);
  const date   = document.getElementById('payLoanDate').value || today();
  const accId  = document.getElementById('payLoanAccount').value;

  if (!amount || amount <= 0) return showToast('Enter valid amount.', 'error');

  const idx = state.loans.findIndex(l => l.id === id);
  if (idx === -1) return;

  if (accId) {
    const acc = getAccountById(accId);
    if (acc) {
      if (acc.balance < amount) return showToast('Insufficient balance.', 'error');
      acc.balance -= amount;
      await dbPut(STORES.accounts, acc);
      /* Record as expense */
      const entry = { id: uid(), amount, category: 'Loan EMI', accId,
                      date, note: state.loans[idx].name, payMode: 'Bank Transfer' };
      state.expenses.push(entry);
      await dbPut(STORES.expenses, entry);
    }
  }

  state.loans[idx].paid = Math.min(state.loans[idx].paid + amount, state.loans[idx].amount);
  await dbPut(STORES.loans, state.loans[idx]);

  closeModal('loanPaymentModal');
  renderLoans();
  renderDashboard();
  showToast('Loan payment recorded!');
}

async function deleteLoan(id) {
  confirmAction('Delete Loan', 'Delete this loan record?', async () => {
    state.loans = state.loans.filter(l => l.id !== id);
    await dbDelete(STORES.loans, id);
    renderLoans();
    renderDashboard();
    showToast('Loan deleted.', 'info');
  });
}

/* ==================== LOAN LEDGER ==================== */
function openLoanLedger(id) {
  const l = state.loans.find(x => x.id === id);
  if (!l) return;

  /* Build full amortisation schedule */
  let balance   = l.amount;
  const r       = l.rate / 12 / 100;
  const emi     = l.emi;
  const rows    = [];
  let totalInterest = 0;
  let totalPrincipal = 0;
  const startD  = new Date(l.startDate + 'T00:00:00');

  for (let i = 1; i <= l.duration; i++) {
    const interest   = balance * r;
    const principal  = emi - interest;
    balance          = Math.max(balance - principal, 0);
    totalInterest   += interest;
    totalPrincipal  += principal;

    const dueDate = new Date(startD);
    dueDate.setMonth(dueDate.getMonth() + i);
    rows.push({ no: i, dueDate: dueDate.toISOString().split('T')[0],
                emi, principal, interest, balance });
  }

  /* Estimated paid rows based on l.paid */
  const emisPaidCount = emi > 0 ? Math.floor(l.paid / emi) : 0;

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html lang="en"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Loan Ledger — ${escHtml(l.name)}</title>
    <style>
      body{font-family:Georgia,serif;background:#f4f6f4;color:#1a2a1a;padding:20px;max-width:1000px;margin:0 auto}
      h1{color:#2d6035;margin-bottom:4px} h2{color:#4a5c4a;margin-top:24px;margin-bottom:12px}
      .meta{display:flex;flex-wrap:wrap;gap:16px;background:#fff;padding:16px;border-radius:8px;
            margin-bottom:24px;box-shadow:0 2px 8px rgba(0,0,0,.07)}
      .meta-item{display:flex;flex-direction:column;gap:2px;min-width:130px}
      .meta-label{font-size:0.78rem;color:#7a8f7a;font-weight:600}
      .meta-val{font-size:1.1rem;font-weight:700}
      table{width:100%;border-collapse:collapse;font-size:0.9rem}
      th{background:#2d6035;color:#fff;padding:10px 12px;text-align:left}
      td{padding:9px 12px;border-bottom:1px solid #d4e0d4}
      tr:nth-child(even) td{background:#f9fbf9}
      tr.paid td{color:#aaa} tr.current td{background:#fffde7;font-weight:700}
      .text-red{color:#c62828} .text-green{color:#3a7d44}
      .summary{display:flex;flex-wrap:wrap;gap:16px;background:#fff;padding:16px;
               border-radius:8px;margin-bottom:24px;box-shadow:0 2px 8px rgba(0,0,0,.07)}
      @media(max-width:600px){table{font-size:0.78rem} th,td{padding:7px 6px}}
      @media print{.no-print{display:none}}
    </style></head><body>
    <button class="no-print" onclick="window.print()" style="padding:10px 20px;background:#3a7d44;color:#fff;
      border:none;border-radius:6px;font-size:1rem;cursor:pointer;margin-bottom:16px">🖨️ Print / Save PDF</button>
    <h1>Loan Ledger</h1>
    <p style="color:#7a8f7a;margin-bottom:16px">${escHtml(l.name)}${l.lender ? ' — ' + escHtml(l.lender) : ''}</p>
    <div class="meta">
      <div class="meta-item"><span class="meta-label">Loan Amount</span><span class="meta-val">₹${l.amount.toLocaleString('en-IN')}</span></div>
      <div class="meta-item"><span class="meta-label">Interest Rate</span><span class="meta-val">${l.rate}% p.a.</span></div>
      <div class="meta-item"><span class="meta-label">Duration</span><span class="meta-val">${l.duration} months</span></div>
      <div class="meta-item"><span class="meta-label">Monthly EMI</span><span class="meta-val">₹${emi.toFixed(2)}</span></div>
      <div class="meta-item"><span class="meta-label">Start Date</span><span class="meta-val">${fmtDate(l.startDate)}</span></div>
      <div class="meta-item"><span class="meta-label">End Date</span><span class="meta-val">${fmtDate(addMonths(l.startDate, l.duration))}</span></div>
    </div>
    <h2>Summary</h2>
    <div class="summary">
      <div class="meta-item"><span class="meta-label">Total Amount Payable</span><span class="meta-val">₹${(emi * l.duration).toLocaleString('en-IN', {minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
      <div class="meta-item"><span class="meta-label">Total Interest</span><span class="meta-val text-red">₹${totalInterest.toLocaleString('en-IN', {minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
      <div class="meta-item"><span class="meta-label">Principal</span><span class="meta-val text-green">₹${l.amount.toLocaleString('en-IN')}</span></div>
      <div class="meta-item"><span class="meta-label">EMIs Paid (est.)</span><span class="meta-val">${emisPaidCount} of ${l.duration}</span></div>
      <div class="meta-item"><span class="meta-label">Amount Paid</span><span class="meta-val text-green">₹${l.paid.toLocaleString('en-IN', {minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
      <div class="meta-item"><span class="meta-label">Outstanding</span><span class="meta-val text-red">₹${Math.max(l.amount - l.paid, 0).toLocaleString('en-IN', {minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
    </div>
    <h2>Amortisation Schedule</h2>
    <table>
      <thead><tr>
        <th>#</th><th>Due Date</th><th>EMI (₹)</th>
        <th>Principal (₹)</th><th>Interest (₹)</th><th>Balance (₹)</th><th>Status</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `<tr class="${r.no <= emisPaidCount ? 'paid' : r.no === emisPaidCount + 1 ? 'current' : ''}">
          <td>${r.no}</td>
          <td>${fmtDate(r.dueDate)}</td>
          <td>${emi.toFixed(2)}</td>
          <td>${r.principal.toFixed(2)}</td>
          <td class="text-red">${r.interest.toFixed(2)}</td>
          <td>${r.balance.toFixed(2)}</td>
          <td>${r.no <= emisPaidCount ? '✅ Paid' : r.no === emisPaidCount + 1 ? '🔔 Current' : '⏳ Pending'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    </body></html>`);
  win.document.close();
}

/* ==================== REPORTS ==================== */
function initReportFilters() {
  const months = [
    ['01','January'],['02','February'],['03','March'],['04','April'],
    ['05','May'],['06','June'],['07','July'],['08','August'],
    ['09','September'],['10','October'],['11','November'],['12','December'],
  ];
  const yr = currentYear();

  document.getElementById('reportMonth').innerHTML =
    months.map(([v,l]) => `<option value="${v}" ${v === String(new Date().getMonth()+1).padStart(2,'0') ? 'selected' : ''}>${l}</option>`).join('');

  document.getElementById('reportYear').innerHTML =
    [yr, yr-1, yr-2, yr-3, yr-4].map(y => `<option value="${y}">${y}</option>`).join('');
}

function generateReport() {
  const month = document.getElementById('reportMonth').value;
  const year  = document.getElementById('reportYear').value;
  const prefix = `${year}-${month}`;

  const incomeList  = state.income.filter(i => i.date && i.date.startsWith(prefix));
  const expList     = state.expenses.filter(e => e.date && e.date.startsWith(prefix));

  const totalIncome   = incomeList.reduce((s,i) => s + i.amount, 0);
  const totalExpenses = expList.reduce((s,e) => s + e.amount, 0);
  const savings       = totalIncome - totalExpenses;

  /* Category breakdown */
  const catBreakdown = {};
  expList.forEach(e => {
    catBreakdown[e.category] = (catBreakdown[e.category] || 0) + e.amount;
  });

  /* Source breakdown */
  const srcBreakdown = {};
  incomeList.forEach(i => { srcBreakdown[i.source] = (srcBreakdown[i.source] || 0) + i.amount; });

  const monthName = document.getElementById('reportMonth').options[document.getElementById('reportMonth').selectedIndex].text;

  document.getElementById('reportOutput').innerHTML = `
    <div class="report-card">
      <h3>Summary — ${monthName} ${year}</h3>
      <div style="display:flex;flex-wrap:wrap;gap:20px;margin-bottom:8px">
        <div><div style="font-size:.85rem;color:var(--text-muted)">Total Income</div><div style="font-size:1.4rem;font-weight:700;color:var(--green)">${fmt(totalIncome)}</div></div>
        <div><div style="font-size:.85rem;color:var(--text-muted)">Total Expenses</div><div style="font-size:1.4rem;font-weight:700;color:var(--red)">${fmt(totalExpenses)}</div></div>
        <div><div style="font-size:.85rem;color:var(--text-muted)">Net Savings</div><div style="font-size:1.4rem;font-weight:700;color:${savings>=0?'var(--green)':'var(--red)'}">${fmt(savings)}</div></div>
        <div><div style="font-size:.85rem;color:var(--text-muted)">Savings Rate</div><div style="font-size:1.4rem;font-weight:700">${totalIncome>0?((savings/totalIncome)*100).toFixed(1):0}%</div></div>
      </div>
    </div>

    <div class="report-card">
      <h3>Income by Source</h3>
      ${Object.keys(srcBreakdown).length === 0 ? '<p class="text-muted">No income this period.</p>' : `
      <table class="report-table">
        <thead><tr><th>Source</th><th>Amount</th><th>% of Total</th></tr></thead>
        <tbody>
          ${Object.entries(srcBreakdown).sort((a,b)=>b[1]-a[1]).map(([src,amt]) =>
            `<tr><td>${escHtml(src)}</td><td>${fmt(amt)}</td><td>${totalIncome>0?((amt/totalIncome)*100).toFixed(1):0}%</td></tr>`
          ).join('')}
        </tbody>
      </table>`}
    </div>

    <div class="report-card">
      <h3>Expenses by Category</h3>
      ${Object.keys(catBreakdown).length === 0 ? '<p class="text-muted">No expenses this period.</p>' : `
      <table class="report-table">
        <thead><tr><th>Category</th><th>Amount</th><th>% of Total</th><th>Transactions</th></tr></thead>
        <tbody>
          ${Object.entries(catBreakdown).sort((a,b)=>b[1]-a[1]).map(([cat,amt]) => {
            const cnt = expList.filter(e => e.category === cat).length;
            return `<tr><td>${escHtml(cat)}</td><td>${fmt(amt)}</td><td>${totalExpenses>0?((amt/totalExpenses)*100).toFixed(1):0}%</td><td>${cnt}</td></tr>`;
          }).join('')}
        </tbody>
      </table>`}
    </div>

    <div class="report-card">
      <h3>All Transactions — ${monthName} ${year}</h3>
      <table class="report-table">
        <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Account</th><th>Amount</th></tr></thead>
        <tbody>
          ${[
            ...incomeList.map(i => ({date:i.date, type:'Income', desc: i.source + (i.note?' — '+i.note:''), acc: i.accId, amt: i.amount, sign:1})),
            ...expList.map(e => ({date:e.date, type:'Expense', desc: e.category + (e.note?' — '+e.note:''), acc: e.accId, amt: e.amount, sign:-1})),
          ].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(t => {
            const acc = getAccountById(t.acc);
            return `<tr>
              <td>${fmtDate(t.date)}</td>
              <td><span style="color:${t.sign>0?'var(--green)':'var(--red)'}">${t.type}</span></td>
              <td>${escHtml(t.desc)}</td>
              <td>${acc ? escHtml(acc.bankName) : '—'}</td>
              <td style="color:${t.sign>0?'var(--green)':'var(--red)'};">${t.sign>0?'+':'-'}${fmt(t.amt)}</td>
            </tr>`;
          }).join('') || '<tr><td colspan="5" class="text-muted" style="text-align:center">No transactions</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

function exportCSV() {
  const month = document.getElementById('reportMonth').value;
  const year  = document.getElementById('reportYear').value;
  const prefix = `${year}-${month}`;

  const rows = [['Date','Type','Description','Category/Source','Account','Amount','Mode']];

  state.income.filter(i => i.date && i.date.startsWith(prefix)).forEach(i => {
    const acc = getAccountById(i.accId);
    rows.push([i.date,'Income',i.note||'',i.source,acc?acc.bankName:'',i.amount,'']);
  });

  state.expenses.filter(e => e.date && e.date.startsWith(prefix)).forEach(e => {
    const acc = getAccountById(e.accId);
    rows.push([e.date,'Expense',e.note||'',e.category,acc?acc.bankName:'',-e.amount,e.payMode||'']);
  });

  rows.sort((a,b) => a[0] > b[0] ? -1 : 1);

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `FinanceWise_${year}_${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported!');
}

/* ==================== SETTINGS ==================== */
function renderSettings() {
  renderCategoryTags();
  renderSourceTags();
}

function renderCategoryTags() {
  const el = document.getElementById('categoryList');
  el.innerHTML = state.settings.categories.map((c,i) =>
    `<span class="tag">${escHtml(c)}<button class="tag-del" onclick="deleteCategory(${i})">✕</button></span>`
  ).join('');
}

function renderSourceTags() {
  const el = document.getElementById('sourceList');
  el.innerHTML = state.settings.sources.map((s,i) =>
    `<span class="tag">${escHtml(s)}<button class="tag-del" onclick="deleteSource(${i})">✕</button></span>`
  ).join('');
}

async function addCategory() {
  const val = document.getElementById('newCategoryInput').value.trim();
  if (!val) return;
  if (state.settings.categories.includes(val)) return showToast('Category already exists.', 'info');
  state.settings.categories.push(val);
  await saveSettings();
  document.getElementById('newCategoryInput').value = '';
  renderCategoryTags();
  showToast('Category added!');
}

async function deleteCategory(idx) {
  state.settings.categories.splice(idx, 1);
  await saveSettings();
  renderCategoryTags();
}

async function addSource() {
  const val = document.getElementById('newSourceInput').value.trim();
  if (!val) return;
  if (state.settings.sources.includes(val)) return showToast('Source already exists.', 'info');
  state.settings.sources.push(val);
  await saveSettings();
  document.getElementById('newSourceInput').value = '';
  renderSourceTags();
  showToast('Source added!');
}

async function deleteSource(idx) {
  state.settings.sources.splice(idx, 1);
  await saveSettings();
  renderSourceTags();
}

async function saveSettings() {
  await dbPut(STORES.settings, state.settings);
}

/* ==================== EXPORT / IMPORT ==================== */
function exportAllData() {
  const data = {
    exportedAt : new Date().toISOString(),
    accounts   : state.accounts,
    income     : state.income,
    expenses   : state.expenses,
    assets     : state.assets,
    insurance  : state.insurance,
    loans      : state.loans,
    emis       : state.emis,
    transfers  : state.transfers,
    settings   : state.settings,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `FinanceWise_backup_${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data exported!');
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    confirmAction('Import Data', 'This will REPLACE all existing data. Are you sure?', async () => {
      const storeMap = {
        accounts: STORES.accounts, income: STORES.income, expenses: STORES.expenses,
        assets: STORES.assets, insurance: STORES.insurance, loans: STORES.loans,
        emis: STORES.emis, transfers: STORES.transfers,
      };

      for (const [key, store] of Object.entries(storeMap)) {
        if (data[key]) {
          state[key] = data[key];
          for (const item of data[key]) await dbPut(store, item);
        }
      }

      if (data.settings) {
        state.settings = { ...state.settings, ...data.settings };
        await saveSettings();
      }

      renderSection(currentSection);
      showToast('Data imported successfully!');
    });
  } catch (err) {
    showToast('Invalid file. Import failed.', 'error');
  }

  event.target.value = '';
}

function confirmClearData() {
  confirmAction('Clear All Data',
    'This will permanently delete ALL your financial data. This cannot be undone!',
    async () => {
      for (const store of Object.values(STORES)) {
        const items = await dbGetAll(store);
        for (const item of items) await dbDelete(store, item.id);
      }
      Object.assign(state, {
        accounts:[], income:[], expenses:[], assets:[],
        insurance:[], loans:[], emis:[], transfers:[],
      });
      state.settings.categories = ['Food','Travel','Medical','Household','Clothing','Education',
        'Entertainment','Utilities','Transport','Groceries','Health','Shopping','Other'];
      state.settings.sources = ['Salary','Business','Freelance','Rental','Dividend','Pension','Interest','Other'];
      await saveSettings();
      navigateTo('dashboard');
      showToast('All data cleared.', 'info');
    });
}

/* ==================== HELPERS ==================== */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function populateCategorySelect(id) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = state.settings.categories.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
}

function populateSourceSelect(id) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = state.settings.sources.map(s => `<option value="${escHtml(s)}">${escHtml(s)}</option>`).join('');
}

function populateSelect(id, options) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const first = sel.options[0] ? sel.options[0].text : '';
  sel.innerHTML = options.map(v =>
    `<option value="${v}">${v || first}</option>`
  ).join('');
}

function populateFilterDropdowns(monthId, yearId, dates) {
  const years  = [...new Set(dates.filter(Boolean).map(d => d.slice(0,4)))].sort((a,b) => b-a);
  const months = [
    ['','All Months'],['01','January'],['02','February'],['03','March'],['04','April'],
    ['05','May'],['06','June'],['07','July'],['08','August'],
    ['09','September'],['10','October'],['11','November'],['12','December'],
  ];

  const mEl = document.getElementById(monthId);
  if (mEl) mEl.innerHTML = months.map(([v,l]) => `<option value="${v}">${l}</option>`).join('');

  const yEl = document.getElementById(yearId);
  if (yEl) yEl.innerHTML = `<option value="">All Years</option>` +
    years.map(y => `<option value="${y}">${y}</option>`).join('');
}

function clearForm(modalId) {
  const el = document.getElementById(modalId);
  if (!el) return;
  el.querySelectorAll('input[type="text"], input[type="number"], input[type="date"], textarea')
    .forEach(inp => { inp.value = ''; });
  el.querySelectorAll('select').forEach(sel => { sel.selectedIndex = 0; });
}

/* ==================== THEME ==================== */
function applyTheme(dark) {
  document.body.classList.toggle('dark-mode', dark);
  document.getElementById('themeIcon').textContent  = dark ? '☀️' : '🌙';
  document.getElementById('themeLabel').textContent = dark ? 'Light Mode' : 'Dark Mode';
}

async function toggleTheme() {
  state.settings.darkMode = !state.settings.darkMode;
  applyTheme(state.settings.darkMode);
  await saveSettings();
}

/* ==================== INIT ==================== */
async function init() {
  /* Set today's date in topbar */
  document.getElementById('currentDate').textContent =
    new Date().toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'long', year:'numeric' });

  /* Default dates in modals */
  ['incDate','expDate','transferDate','assetDate','insStartDate','loanStartDate','emiStartDate','payLoanDate']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = today(); });

  try {
    await initDB();

    /* Load all data */
    const [accounts, income, expenses, assets, insurance, loans, emis, transfers, settings] =
      await Promise.all([
        dbGetAll(STORES.accounts), dbGetAll(STORES.income),   dbGetAll(STORES.expenses),
        dbGetAll(STORES.assets),   dbGetAll(STORES.insurance), dbGetAll(STORES.loans),
        dbGetAll(STORES.emis),     dbGetAll(STORES.transfers), dbGetAll(STORES.settings),
      ]);

    state.accounts  = accounts;
    state.income    = income;
    state.expenses  = expenses;
    state.assets    = assets;
    state.insurance = insurance;
    state.loans     = loans;
    state.emis      = emis;
    state.transfers = transfers;

    const savedSettings = settings.find(s => s.id === 'app_settings');
    if (savedSettings) {
      state.settings = { ...state.settings, ...savedSettings };
    } else {
      await saveSettings();
    }

    applyTheme(state.settings.darkMode);

  } catch (err) {
    console.error('DB init failed, using memory store', err);
    showToast('Storage init failed. Data may not persist.', 'error');
  }

  /* ---- Event Listeners ---- */
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.section));
  });

  document.getElementById('hamburger').addEventListener('click', openSidebar);
  document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
  document.getElementById('overlay').addEventListener('click', closeSidebar);
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  /* Close modals on backdrop click */
  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', e => {
      if (e.target === m) m.classList.remove('open');
    });
  });

  /* Keyboard: Escape closes modals */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
    }
  });

  /* Enter key in add-category/source inputs */
  document.getElementById('newCategoryInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addCategory();
  });
  document.getElementById('newSourceInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addSource();
  });

  /* Render initial dashboard */
  renderDashboard();
}

/* Start */
document.addEventListener('DOMContentLoaded', init);
