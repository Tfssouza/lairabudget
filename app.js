const supabaseUrl = "https://xsflmvqwqpvgjkutzccy.supabase.co";
const supabaseKey = "sb_publishable_O3lp590eVTKDBfvlpDR8jw_4ByiYYKl";

const supabaseClient = window.supabase
  ? window.supabase.createClient(supabaseUrl, supabaseKey)
  : null;

const STORAGE_KEY = "lairabudget_state";
const CLOUD_STATE_ID = "global";

let cloudSyncInProgress = false;
let cloudSaveTimeout = null;
let initialCloudLoadDone = false;

const defaultState = {
  settingsByMonth: {},
  transactions: [],
  tripEvents: [],
  tripExpenses: [],
  ui: {
    currentView: "overviewView",
    selectedCofre: "brasil",
    selectedMonthKey: "",
    selectedTripId: ""
  }
};

let overviewCategoryChartInstance = null;
let overviewMonthlyEvolutionChartInstance = null;
let poupancaChartInstance = null;
let cofreEvolutionChartInstance = null;
let categoryAnalysisChartInstance = null;

/* =========================
   CLOUD SYNC
========================= */

async function loadFromCloud() {
  if (!supabaseClient) return null;

  try {
    const { data, error } = await supabaseClient
      .from("lairabudget_state")
      .select("state_json, updated_at")
      .eq("id", CLOUD_STATE_ID)
      .maybeSingle();

    if (error) {
      console.error("Erro ao carregar da cloud:", error);
      return null;
    }

    return data?.state_json || null;
  } catch (err) {
    console.error("Erro geral ao carregar da cloud:", err);
    return null;
  }
}

async function saveToCloud(state) {
  if (!supabaseClient || !state || cloudSyncInProgress) return;

  try {
    cloudSyncInProgress = true;

    const safeState = sanitizeFullState(state);

    const { error } = await supabaseClient
      .from("lairabudget_state")
      .upsert({
        id: CLOUD_STATE_ID,
        state_json: safeState,
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error("Erro ao guardar na cloud:", error);
    }
  } catch (err) {
    console.error("Erro geral ao guardar na cloud:", err);
  } finally {
    cloudSyncInProgress = false;
  }
}

function scheduleCloudSave(state) {
  if (!supabaseClient || !initialCloudLoadDone) return;

  clearTimeout(cloudSaveTimeout);
  cloudSaveTimeout = setTimeout(() => {
    saveToCloud(state);
  }, 800);
}

async function initializeCloudState() {
  const localState = loadLocalStateOnly();
  const cloudState = await loadFromCloud();

  if (cloudState) {
    const safeCloudState = sanitizeFullState(cloudState);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeCloudState));
    initialCloudLoadDone = true;
    return safeCloudState;
  }

  const safeLocalState = sanitizeFullState(localState);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safeLocalState));
  initialCloudLoadDone = true;
  saveToCloud(safeLocalState);
  return safeLocalState;
}

/* =========================
   HELPERS
========================= */

function getTodayISO() {
  return new Date().toISOString().split("T")[0];
}

function getMonthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function getMonthNameFromKey(monthKey) {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
}

function getMonthShortName(monthKey) {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("pt-PT", { month: "long" });
}

function getPrevMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return getMonthKey(new Date(year, month - 2, 1));
}

function getNextMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return getMonthKey(new Date(year, month, 1));
}

function getCurrentYear() {
  return new Date().getFullYear();
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR"
  }).format(Number(value || 0));
}

function parseNumber(value) {
  const normalized = String(value ?? "").replace(",", ".");
  const num = parseFloat(normalized);
  return Number.isNaN(num) ? 0 : num;
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function capitalize(text = "") {
  const labels = {
    salario: "Ordenado",
    renda: "Renda fixa",
    cofrinho: "Cofrinho",
    conta_luz: "Conta de luz",
    conta_agua: "Conta de água",
    internet: "Internet",
    abastecimento: "Abastecimento",
    ginasio: "Ginásio",
    manutencao_carro: "Manutenção do carro",
    alimentacao: "Alimentação",
    transporte: "Transporte",
    seguro_carro: "Seguro do carro",
    saude: "Saúde",
    lazer: "Lazer",
    compras: "Compras",
    farmacia: "Farmácia",
    curso: "Curso",
    outros: "Outros",
    brasil: "Brasil",
    emergencia: "Emergência",
    poupanca: "Poupança",
    poupanca_lara: "Poupança Lara",
    viagem: "Viagem",
    passeio: "Passeio",
    saida: "Saída",
    alojamento: "Alojamento",
    voo: "Voo",
    combustivel: "Combustível",
    passeios: "Passeios"
  };
  return labels[text] || text;
}

function byId(id) {
  return document.getElementById(id);
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeText(value) {
  return String(value ?? "").trim();
}

function sanitizeMonthKey(value) {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}$/.test(text) ? text : getMonthKey();
}

function sanitizeDate(value, fallback = getTodayISO()) {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback;
}

function sanitizeUi(ui) {
  const allowedViews = [
    "overviewView",
    "registoView",
    "cofresView",
    "movimentosView",
    "previsoesView",
    "lazerView"
  ];

  const allowedCofres = [
    "brasil",
    "emergencia",
    "lazer",
    "poupanca",
    "poupanca_lara"
  ];

  const safeUi = isPlainObject(ui) ? ui : {};

  return {
    currentView: allowedViews.includes(safeUi.currentView)
      ? safeUi.currentView
      : defaultState.ui.currentView,
    selectedCofre: allowedCofres.includes(safeUi.selectedCofre)
      ? safeUi.selectedCofre
      : defaultState.ui.selectedCofre,
    selectedMonthKey: sanitizeMonthKey(safeUi.selectedMonthKey || getMonthKey()),
    selectedTripId: sanitizeText(safeUi.selectedTripId)
  };
}

function sanitizeMonthSettings(rawSettings) {
  const safe = isPlainObject(rawSettings) ? rawSettings : {};
  const bills = isPlainObject(safe.bills) ? safe.bills : {};
  const extras = isPlainObject(safe.extras) ? safe.extras : {};
  const cofrinhos = isPlainObject(safe.cofrinhos) ? safe.cofrinhos : {};
  const metas = isPlainObject(safe.metas) ? safe.metas : {};
  const carryover = isPlainObject(safe.carryover) ? safe.carryover : {};

  return {
    salary: parseNumber(safe.salary),
    rent: parseNumber(safe.rent),
    mealCard: parseNumber(safe.mealCard),
    freeMoney: parseNumber(safe.freeMoney),
    bills: {
      light: parseNumber(bills.light),
      water: parseNumber(bills.water),
      internet: parseNumber(bills.internet),
      fuel: parseNumber(bills.fuel),
      gym: parseNumber(bills.gym)
    },
    extras: {
      shopping: parseNumber(extras.shopping),
      pharmacy: parseNumber(extras.pharmacy),
      leisure: parseNumber(extras.leisure),
      course: parseNumber(extras.course),
      other: parseNumber(extras.other)
    },
    cofrinhos: {
      brasil: parseNumber(cofrinhos.brasil),
      emergencia: parseNumber(cofrinhos.emergencia),
      lazer: parseNumber(cofrinhos.lazer),
      poupanca: parseNumber(cofrinhos.poupanca),
      poupanca_lara: parseNumber(cofrinhos.poupanca_lara)
    },
    metas: {
      brasil: parseNumber(metas.brasil),
      emergencia: parseNumber(metas.emergencia),
      lazer: parseNumber(metas.lazer),
      poupanca: parseNumber(metas.poupanca),
      poupanca_lara: parseNumber(metas.poupanca_lara)
    },
    carryover: {
      freeMoney: parseNumber(carryover.freeMoney),
      mealCard: parseNumber(carryover.mealCard)
    }
  };
}

function sanitizeSettingsByMonth(settingsByMonth) {
  if (!isPlainObject(settingsByMonth)) return {};

  const safeEntries = Object.entries(settingsByMonth)
    .filter(([monthKey]) => /^\d{4}-\d{2}$/.test(monthKey))
    .map(([monthKey, settings]) => [monthKey, sanitizeMonthSettings(settings)]);

  return Object.fromEntries(safeEntries);
}

function sanitizeTransaction(tx) {
  if (!isPlainObject(tx)) return null;

  const safeType = tx.type === "entrada" || tx.type === "saida" ? tx.type : "saida";
  const safeOrigin = ["account", "meal", "save"].includes(tx.origin) ? tx.origin : "account";

  return {
    id: sanitizeText(tx.id) || generateId(),
    date: sanitizeDate(tx.date, `${sanitizeMonthKey(tx.monthKey || getMonthKey())}-01`),
    monthKey: sanitizeMonthKey(tx.monthKey || getMonthKey()),
    description: sanitizeText(tx.description) || "Movimento",
    type: safeType,
    origin: safeOrigin,
    category: sanitizeText(tx.category) || "outros",
    value: parseNumber(tx.value),
    autoGenerated: tx.autoGenerated === true,
    cofrinho: sanitizeText(tx.cofrinho)
  };
}

function sanitizeTransactions(list) {
  if (!Array.isArray(list)) return [];

  return list
    .map(sanitizeTransaction)
    .filter(Boolean);
}

function sanitizeTripEvent(event) {
  if (!isPlainObject(event)) return null;

  const safeType = ["viagem", "passeio", "saida"].includes(event.type)
    ? event.type
    : "viagem";

  return {
    id: sanitizeText(event.id) || generateId(),
    name: sanitizeText(event.name) || "Evento",
    type: safeType,
    location: sanitizeText(event.location),
    budget: parseNumber(event.budget),
    startDate: sanitizeDate(event.startDate),
    endDate: sanitizeText(event.endDate) ? sanitizeDate(event.endDate) : ""
  };
}

function sanitizeTripEvents(list) {
  if (!Array.isArray(list)) return [];

  return list
    .map(sanitizeTripEvent)
    .filter(Boolean);
}

function sanitizeTripExpense(expense, validTripIds = []) {
  if (!isPlainObject(expense)) return null;

  const tripId = sanitizeText(expense.tripId);
  if (!tripId || !validTripIds.includes(tripId)) return null;

  return {
    id: sanitizeText(expense.id) || generateId(),
    tripId,
    date: sanitizeDate(expense.date),
    description: sanitizeText(expense.description) || "Gasto",
    category: sanitizeText(expense.category) || "outros",
    value: parseNumber(expense.value)
  };
}

function sanitizeTripExpenses(list, validTripIds = []) {
  if (!Array.isArray(list)) return [];

  return list
    .map(exp => sanitizeTripExpense(exp, validTripIds))
    .filter(Boolean);
}

function sanitizeFullState(parsed) {
  const safeRoot = isPlainObject(parsed) ? parsed : {};

  const tripEvents = sanitizeTripEvents(safeRoot.tripEvents);
  const validTripIds = tripEvents.map(event => event.id);

  return {
    settingsByMonth: sanitizeSettingsByMonth(safeRoot.settingsByMonth),
    transactions: sanitizeTransactions(safeRoot.transactions),
    tripEvents,
    tripExpenses: sanitizeTripExpenses(safeRoot.tripExpenses, validTripIds),
    ui: sanitizeUi(safeRoot.ui)
  };
}

function isImportStructureValid(parsed) {
  if (!isPlainObject(parsed)) return false;

  const hasMainBlock =
    "settingsByMonth" in parsed ||
    "transactions" in parsed ||
    "tripEvents" in parsed ||
    "tripExpenses" in parsed ||
    "ui" in parsed;

  if (!hasMainBlock) return false;

  if ("settingsByMonth" in parsed && !isPlainObject(parsed.settingsByMonth)) return false;
  if ("transactions" in parsed && !Array.isArray(parsed.transactions)) return false;
  if ("tripEvents" in parsed && !Array.isArray(parsed.tripEvents)) return false;
  if ("tripExpenses" in parsed && !Array.isArray(parsed.tripExpenses)) return false;
  if ("ui" in parsed && !isPlainObject(parsed.ui)) return false;

  return true;
}

function runWithButtonLock(buttonId, callback) {
  const btn = byId(buttonId);
  if (!btn) {
    callback();
    return;
  }

  if (btn.dataset.busy === "true") return;

  const originalText = btn.textContent;
  btn.dataset.busy = "true";
  btn.disabled = true;
  btn.style.opacity = "0.7";
  btn.style.pointerEvents = "none";

  try {
    callback();
  } finally {
    setTimeout(() => {
      btn.dataset.busy = "false";
      btn.disabled = false;
      btn.style.opacity = "";
      btn.style.pointerEvents = "";
      btn.textContent = originalText;
    }, 350);
  }
}

/* =========================
   DEFAULT SETTINGS / STATE
========================= */

function getDefaultMonthSettings() {
  return {
    salary: 0,
    rent: 0,
    mealCard: 0,
    freeMoney: 0,
    bills: {
      light: 0,
      water: 0,
      internet: 0,
      fuel: 0,
      gym: 0
    },
    extras: {
      shopping: 0,
      pharmacy: 0,
      leisure: 0,
      course: 0,
      other: 0
    },
    cofrinhos: {
      brasil: 0,
      emergencia: 0,
      lazer: 0,
      poupanca: 0,
      poupanca_lara: 0
    },
    metas: {
      brasil: 0,
      emergencia: 0,
      lazer: 0,
      poupanca: 0,
      poupanca_lara: 0
    },
    carryover: {
      freeMoney: 0,
      mealCard: 0
    }
  };
}

function loadLocalStateOnly() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    const initial = structuredClone(defaultState);
    initial.ui.selectedMonthKey = getMonthKey();
    return initial;
  }

  try {
    const parsed = JSON.parse(raw);
    return sanitizeFullState(parsed);
  } catch {
    const initial = structuredClone(defaultState);
    initial.ui.selectedMonthKey = getMonthKey();
    return initial;
  }
}

function loadState() {
  return loadLocalStateOnly();
}

function saveState(state) {
  const safeState = sanitizeFullState(state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safeState));
  scheduleCloudSave(safeState);
}

function getSelectedMonthKey(state) {
  return state.ui.selectedMonthKey || getMonthKey();
}

function getMonthSettings(state, monthKey) {
  const base = getDefaultMonthSettings();
  const saved = state.settingsByMonth[monthKey] || {};

  return {
    ...base,
    ...saved,
    bills: {
      ...base.bills,
      ...(saved.bills || {})
    },
    extras: {
      ...base.extras,
      ...(saved.extras || {})
    },
    cofrinhos: {
      ...base.cofrinhos,
      ...(saved.cofrinhos || {})
    },
    metas: {
      ...base.metas,
      ...(saved.metas || {})
    },
    carryover: {
      ...base.carryover,
      ...(saved.carryover || {})
    }
  };
}

function setMonthSettings(state, monthKey, settings) {
  state.settingsByMonth[monthKey] = settings;
}

function getMonthTransactions(state, monthKey) {
  return state.transactions.filter(tx => tx.monthKey === monthKey);
}

function getCurrentMonthTransactions(state) {
  return getMonthTransactions(state, getSelectedMonthKey(state));
}

/* =========================
   DATE / MONTH CALCULATIONS
========================= */

function getDaysUntilNextSalary(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const now = new Date();
  const selectedDate = new Date(year, month - 1, 1);

  const isCurrentMonth =
    selectedDate.getFullYear() === now.getFullYear() &&
    selectedDate.getMonth() === now.getMonth();

  if (!isCurrentMonth) {
    return new Date(year, month, 0).getDate();
  }

  const nextSalary = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const diffMs = nextSalary - now;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays <= 0 ? 1 : diffDays;
}

function getDaysRemainingInMonth(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const now = new Date();
  const selectedDate = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();

  const isCurrentMonth =
    selectedDate.getFullYear() === now.getFullYear() &&
    selectedDate.getMonth() === now.getMonth();

  if (!isCurrentMonth) return 0;
  return Math.max(daysInMonth - now.getDate(), 0);
}

function getElapsedDaysInMonth(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const now = new Date();
  const selectedDate = new Date(year, month - 1, 1);

  const isCurrentMonth =
    selectedDate.getFullYear() === now.getFullYear() &&
    selectedDate.getMonth() === now.getMonth();

  if (!isCurrentMonth) {
    return new Date(year, month, 0).getDate();
  }

  return Math.max(now.getDate(), 1);
}

function getMonthCompletionPercent(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const now = new Date();
  const selectedDate = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();

  const isCurrentMonth =
    selectedDate.getFullYear() === now.getFullYear() &&
    selectedDate.getMonth() === now.getMonth();

  if (!isCurrentMonth) {
    if (selectedDate < new Date(now.getFullYear(), now.getMonth(), 1)) return 100;
    return 0;
  }

  return Math.min((now.getDate() / daysInMonth) * 100, 100);
}

/* =========================
   MONTH TOTALS / CARRYOVER
========================= */

function getFixedExpensesTotal(settings) {
  return (
    Number(settings.rent || 0) +
    Number(settings.bills.light || 0) +
    Number(settings.bills.water || 0) +
    Number(settings.bills.internet || 0) +
    Number(settings.bills.fuel || 0) +
    Number(settings.bills.gym || 0)
  );
}

function getExtraExpensesTotal(settings) {
  return (
    Number(settings.extras.shopping || 0) +
    Number(settings.extras.pharmacy || 0) +
    Number(settings.extras.leisure || 0) +
    Number(settings.extras.course || 0) +
    Number(settings.extras.other || 0)
  );
}

function getCofresTotal(settings) {
  return (
    Number(settings.cofrinhos.brasil || 0) +
    Number(settings.cofrinhos.emergencia || 0) +
    Number(settings.cofrinhos.lazer || 0) +
    Number(settings.cofrinhos.poupanca || 0) +
    Number(settings.cofrinhos.poupanca_lara || 0)
  );
}

function calculateMonthBalances(state, monthKey) {
  const settings = getMonthSettings(state, monthKey);
  const monthTransactions = getMonthTransactions(state, monthKey);

  const fixedCategories = ["renda", "conta_luz", "conta_agua", "internet", "abastecimento", "ginasio"];

  const accountExpenses = monthTransactions
    .filter(tx => tx.type === "saida" && tx.origin === "account" && !fixedCategories.includes(tx.category))
    .reduce((acc, tx) => acc + Number(tx.value || 0), 0);

  const mealExpenses = monthTransactions
    .filter(tx => tx.type === "saida" && tx.origin === "meal")
    .reduce((acc, tx) => acc + Number(tx.value || 0), 0);

  const currentMonthSaved = monthTransactions
    .filter(tx => tx.type === "saida" && tx.origin === "save")
    .reduce((acc, tx) => acc + Number(tx.value || 0), 0);

  const totalSavedAllMonths = state.transactions
    .filter(tx => tx.type === "saida" && tx.origin === "save")
    .reduce((acc, tx) => acc + Number(tx.value || 0), 0);

  const totalMonthSpent = monthTransactions
    .filter(tx => tx.type === "saida")
    .reduce((acc, tx) => acc + Number(tx.value || 0), 0);

  const fixedExpensesTotal = getFixedExpensesTotal(settings);
  const extraExpensesTotal = getExtraExpensesTotal(settings);
  const totalCofres = getCofresTotal(settings);

  const startingFreeMoney = Number(settings.freeMoney || 0) + Number(settings.carryover.freeMoney || 0);
  const startingMealMoney = Number(settings.mealCard || 0) + Number(settings.carryover.mealCard || 0);

  const saldoDisponivel = startingFreeMoney - accountExpenses;
  const saldoAlimentacao = startingMealMoney - mealExpenses;
  const progressoPercentual = settings.salary > 0 ? (currentMonthSaved / settings.salary) * 100 : 0;

  const daysUntilSalary = getDaysUntilNextSalary(monthKey);
  const gastoPorDia = saldoDisponivel / Math.max(daysUntilSalary, 1);

  const elapsedDays = getElapsedDaysInMonth(monthKey);
  const remainingDaysInMonth = getDaysRemainingInMonth(monthKey);
  const averageSpentPerDay = elapsedDays > 0 ? accountExpenses / elapsedDays : 0;
  const projectedAdditionalSpend = averageSpentPerDay * remainingDaysInMonth;
  const projectedFinalBalance = saldoDisponivel - projectedAdditionalSpend;
  const safeToSpend = Math.max(saldoDisponivel - projectedAdditionalSpend, 0);

  return {
    settings,
    monthTransactions,
    accountExpenses,
    mealExpenses,
    currentMonthSaved,
    totalSavedAllMonths,
    saldoDisponivel,
    saldoAlimentacao,
    progressoPercentual,
    daysUntilSalary,
    gastoPorDia,
    elapsedDays,
    remainingDaysInMonth,
    averageSpentPerDay,
    projectedAdditionalSpend,
    projectedFinalBalance,
    safeToSpend,
    totalMonthSpent,
    fixedExpensesTotal,
    extraExpensesTotal,
    totalCofres,
    monthLeft:
      Number(settings.salary || 0) -
      fixedExpensesTotal -
      extraExpensesTotal -
      totalCofres -
      Number(settings.freeMoney || 0),
    startingFreeMoney,
    startingMealMoney
  };
}

function ensureMonthExists(state, monthKey) {
  const current = getMonthSettings(state, monthKey);
  const prevMonthKey = getPrevMonthKey(monthKey);

  if (!state.settingsByMonth[monthKey]) {
    state.settingsByMonth[monthKey] = current;
  }

  if (!state.settingsByMonth[prevMonthKey]) {
    setMonthSettings(state, monthKey, current);
    return;
  }

  const prevBalances = calculateMonthBalances(state, prevMonthKey);

  current.carryover.freeMoney = Math.max(prevBalances.saldoDisponivel, 0);
  current.carryover.mealCard = Math.max(prevBalances.saldoAlimentacao, 0);

  setMonthSettings(state, monthKey, current);
}

function initializeCurrentMonth(state) {
  const currentMonthKey = getMonthKey();

  if (!state.ui.selectedMonthKey) {
    state.ui.selectedMonthKey = currentMonthKey;
  }

  ensureMonthExists(state, currentMonthKey);
  ensureMonthExists(state, state.ui.selectedMonthKey);
}

/* =========================
   UI BASICS
========================= */

function setTodayBadge() {
  const el = byId("todayBadge");
  if (!el) return;

  el.textContent = new Date().toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function renderActiveMonthLabel(state) {
  const el = byId("activeMonthLabel");
  if (el) el.textContent = getMonthNameFromKey(getSelectedMonthKey(state));
}

function setTopbarForView(viewId) {
  const titles = {
    overviewView: ["Visão Geral", "Resumo visual premium do teu orçamento"],
    registoView: ["Registo do mês", "Configura o mês, distribui cofres, extras e gere os movimentos automáticos"],
    cofresView: ["Cofres", "Metas e evolução dos teus objetivos"],
    movimentosView: ["Movimentos", "Filtra, acompanha e analisa os lançamentos do mês"],
    previsoesView: ["Previsões", "Projeção do fim do mês e evolução da poupança"],
    lazerView: ["Lazer / Viagens", "Acompanha eventos, gastos e saldo disponível do cofre lazer"]
  };

  const current = titles[viewId] || titles.overviewView;
  const titleEl = byId("topbarTitle");
  const subtitleEl = byId("topbarSubtitle");

  if (titleEl) titleEl.textContent = current[0];
  if (subtitleEl) subtitleEl.textContent = current[1];
}

function showToast(message, type = "success") {
  const wrap = byId("toastWrap");
  if (!wrap) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  wrap.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-8px)";
    toast.style.transition = "all .2s ease";
    setTimeout(() => toast.remove(), 220);
  }, 2600);
}

/* =========================
   VIEW NAVIGATION
========================= */

function activateView(viewId) {
  const views = document.querySelectorAll(".view");
  const navBtns = document.querySelectorAll(".nav-btn");

  views.forEach(view => {
    view.classList.toggle("active", view.id === viewId);
  });

  navBtns.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === viewId);
  });

  setTopbarForView(viewId);

  const state = loadState();
  state.ui.currentView = viewId;
  saveState(state);

  if (viewId === "overviewView") renderOverview(state);
  if (viewId === "registoView") renderRegistoView(state);
  if (viewId === "cofresView") renderCofreSection(state);
  if (viewId === "movimentosView") {
    renderTransactions(state);
    renderCategoryAnalysis(state);
  }
  if (viewId === "previsoesView") {
    renderForecast(calculateMonthBalances(state, getSelectedMonthKey(state)));
    renderPoupancaChart(state);
  }
  if (viewId === "lazerView") renderLazerView(state);
}

function goToMonth(offset) {
  const state = loadState();
  const currentKey = getSelectedMonthKey(state);
  const newKey = offset < 0 ? getPrevMonthKey(currentKey) : getNextMonthKey(currentKey);

  state.ui.selectedMonthKey = newKey;
  ensureMonthExists(state, newKey);
  saveState(state);

  renderAll();
  activateView(state.ui.currentView || "overviewView");
}

function bindMonthNavigation() {
  byId("prevMonthBtn")?.addEventListener("click", () => goToMonth(-1));
  byId("nextMonthBtn")?.addEventListener("click", () => goToMonth(1));
}

function bindSidebarNavigation() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.onclick = () => activateView(btn.dataset.view);
  });
}

/* =========================
   REGISTO DO MÊS
========================= */

function setFieldValue(id, value) {
  const el = byId(id);
  if (!el) return;
  el.value = Number(value || 0) === 0 ? "" : Number(value || 0);
}

function readMonthForm() {
  return {
    salary: parseNumber(byId("monthSalary")?.value),
    mealCard: parseNumber(byId("monthMealCard")?.value),
    freeMoney: parseNumber(byId("monthFreeMoney")?.value),
    rent: parseNumber(byId("monthRent")?.value),
    bills: {
      light: parseNumber(byId("billLight")?.value),
      water: parseNumber(byId("billWater")?.value),
      internet: parseNumber(byId("billInternet")?.value),
      fuel: parseNumber(byId("billFuel")?.value),
      gym: parseNumber(byId("billGym")?.value)
    },
    extras: {
      shopping: parseNumber(byId("extraShopping")?.value),
      pharmacy: parseNumber(byId("extraPharmacy")?.value),
      leisure: parseNumber(byId("extraLeisure")?.value),
      course: parseNumber(byId("extraCourse")?.value),
      other: parseNumber(byId("extraOther")?.value)
    },
    cofrinhos: {
      brasil: parseNumber(byId("cofreBrasil")?.value),
      emergencia: parseNumber(byId("cofreEmergencia")?.value),
      lazer: parseNumber(byId("cofreLazer")?.value),
      poupanca: parseNumber(byId("cofrePoupanca")?.value),
      poupanca_lara: parseNumber(byId("cofrePoupancaLara")?.value)
    },
    metas: {
      brasil: parseNumber(byId("metaBrasil")?.value),
      emergencia: parseNumber(byId("metaEmergencia")?.value),
      lazer: parseNumber(byId("metaLazer")?.value),
      poupanca: parseNumber(byId("metaPoupanca")?.value),
      poupanca_lara: parseNumber(byId("metaPoupancaLara")?.value)
    }
  };
}

function applyDraftToCurrentMonth() {
  const state = loadState();
  const monthKey = getSelectedMonthKey(state);
  const current = getMonthSettings(state, monthKey);
  const form = readMonthForm();

  current.salary = form.salary;
  current.mealCard = form.mealCard;
  current.freeMoney = form.freeMoney;
  current.rent = form.rent;
  current.bills = { ...current.bills, ...form.bills };
  current.extras = { ...current.extras, ...form.extras };
  current.cofrinhos = { ...current.cofrinhos, ...form.cofrinhos };
  current.metas = { ...current.metas, ...form.metas };

  setMonthSettings(state, monthKey, current);
  saveState(state);
  return state;
}

function renderRegistoForm(state) {
  const monthKey = getSelectedMonthKey(state);
  const settings = getMonthSettings(state, monthKey);

  setFieldValue("monthSalary", settings.salary);
  setFieldValue("monthMealCard", settings.mealCard);
  setFieldValue("monthFreeMoney", settings.freeMoney);

  setFieldValue("monthRent", settings.rent);
  setFieldValue("billLight", settings.bills.light);
  setFieldValue("billWater", settings.bills.water);
  setFieldValue("billInternet", settings.bills.internet);
  setFieldValue("billFuel", settings.bills.fuel);
  setFieldValue("billGym", settings.bills.gym);

  setFieldValue("extraShopping", settings.extras.shopping);
  setFieldValue("extraPharmacy", settings.extras.pharmacy);
  setFieldValue("extraLeisure", settings.extras.leisure);
  setFieldValue("extraCourse", settings.extras.course);
  setFieldValue("extraOther", settings.extras.other);

  setFieldValue("cofreBrasil", settings.cofrinhos.brasil);
  setFieldValue("cofreEmergencia", settings.cofrinhos.emergencia);
  setFieldValue("cofreLazer", settings.cofrinhos.lazer);
  setFieldValue("cofrePoupanca", settings.cofrinhos.poupanca);
  setFieldValue("cofrePoupancaLara", settings.cofrinhos.poupanca_lara);

  setFieldValue("metaBrasil", settings.metas.brasil);
  setFieldValue("metaEmergencia", settings.metas.emergencia);
  setFieldValue("metaLazer", settings.metas.lazer);
  setFieldValue("metaPoupanca", settings.metas.poupanca);
  setFieldValue("metaPoupancaLara", settings.metas.poupanca_lara);
}

function renderRegistoPreview(state) {
  const monthKey = getSelectedMonthKey(state);
  const summary = calculateMonthBalances(state, monthKey);

  if (byId("previewSalary")) byId("previewSalary").textContent = formatCurrency(summary.settings.salary);
  if (byId("previewFixedExpenses")) byId("previewFixedExpenses").textContent = formatCurrency(summary.fixedExpensesTotal);
  if (byId("previewExtraExpenses")) byId("previewExtraExpenses").textContent = formatCurrency(summary.extraExpensesTotal);
  if (byId("previewFreeMoney")) byId("previewFreeMoney").textContent = formatCurrency(summary.settings.freeMoney);
  if (byId("previewTotalCofres")) byId("previewTotalCofres").textContent = formatCurrency(summary.totalCofres);
  if (byId("previewMonthLeft")) byId("previewMonthLeft").textContent = formatCurrency(summary.monthLeft);

  if (byId("previewShopping")) byId("previewShopping").textContent = formatCurrency(summary.settings.extras.shopping);
  if (byId("previewPharmacy")) byId("previewPharmacy").textContent = formatCurrency(summary.settings.extras.pharmacy);
  if (byId("previewLeisure")) byId("previewLeisure").textContent = formatCurrency(summary.settings.extras.leisure);
  if (byId("previewCourse")) byId("previewCourse").textContent = formatCurrency(summary.settings.extras.course);
  if (byId("previewOther")) byId("previewOther").textContent = formatCurrency(summary.settings.extras.other);

  if (byId("planningSalary")) byId("planningSalary").textContent = formatCurrency(summary.settings.salary);
  if (byId("planningFixed")) byId("planningFixed").textContent = formatCurrency(summary.fixedExpensesTotal);
  if (byId("planningExtras")) byId("planningExtras").textContent = formatCurrency(summary.extraExpensesTotal);
  if (byId("planningCofres")) byId("planningCofres").textContent = formatCurrency(summary.totalCofres);
  if (byId("planningAvailable")) byId("planningAvailable").textContent = formatCurrency(summary.monthLeft);
  if (byId("planningAvailableMirror")) byId("planningAvailableMirror").textContent = formatCurrency(summary.monthLeft);

  const planningAlert = byId("planningAlert");
  if (planningAlert) {
    if (summary.settings.salary <= 0) {
      planningAlert.className = "planning-alert safe";
      planningAlert.textContent = "Preenche o ordenado do mês para veres a prévia automática.";
    } else if (summary.monthLeft < 0) {
      planningAlert.className = "planning-alert danger";
      planningAlert.textContent = "⚠️ Estás a planear mais do que o teu ordenado permite neste mês.";
    } else if (summary.monthLeft < 50) {
      planningAlert.className = "planning-alert warn";
      planningAlert.textContent = "⚠️ A sobra do mês está muito apertada depois dos fixos, extras, cofres e dinheiro livre.";
    } else {
      planningAlert.className = "planning-alert safe";
      planningAlert.textContent = "✅ O planeamento do mês parece equilibrado.";
    }
  }
}

function renderRegistoView(state) {
  renderRegistoForm(state);
  renderRegistoPreview(state);
}

function saveMonthConfig() {
  applyDraftToCurrentMonth();
  renderAll();
  showToast("Configuração do mês salva com sucesso.", "success");
}

function saveCofresConfig() {
  applyDraftToCurrentMonth();
  renderAll();
  showToast("Cofres e metas salvos com sucesso.", "success");
}

/* =========================
   MOVIMENTOS AUTOMÁTICOS
========================= */

function monthAlreadyGenerated(state, monthKey) {
  return state.transactions.some(tx => tx.monthKey === monthKey && tx.autoGenerated === true);
}

function addTransaction(state, tx) {
  state.transactions.push({
    id: generateId(),
    ...tx
  });
}

function generateMonthMovements() {
  const state = loadState();
  const monthKey = getSelectedMonthKey(state);
  const settings = getMonthSettings(state, monthKey);

  if (monthAlreadyGenerated(state, monthKey)) {
    showToast("Movimentos deste mês já foram gerados. Exclui primeiro os automáticos antes de gerar novamente.", "warning");
    return;
  }

  if (Number(settings.salary || 0) <= 0) {
    showToast("Define o ordenado do mês antes de gerar os movimentos.", "error");
    return;
  }

  addTransaction(state, {
    date: `${monthKey}-01`,
    monthKey,
    description: "Ordenado do mês",
    type: "entrada",
    origin: "account",
    category: "salario",
    value: Number(settings.salary || 0),
    autoGenerated: true
  });

  if (Number(settings.rent || 0) > 0) {
    addTransaction(state, {
      date: `${monthKey}-02`,
      monthKey,
      description: "Renda fixa",
      type: "saida",
      origin: "account",
      category: "renda",
      value: Number(settings.rent || 0),
      autoGenerated: true
    });
  }

  const billMap = [
    ["light", "conta_luz", "Conta de luz", 3],
    ["water", "conta_agua", "Conta de água", 4],
    ["internet", "internet", "Internet", 5],
    ["fuel", "abastecimento", "Abastecimento", 6],
    ["gym", "ginasio", "Ginásio", 7]
  ];

  billMap.forEach(([key, category, description, day]) => {
    const value = Number(settings.bills[key] || 0);
    if (value > 0) {
      addTransaction(state, {
        date: `${monthKey}-${String(day).padStart(2, "0")}`,
        monthKey,
        description,
        type: "saida",
        origin: "account",
        category,
        value,
        autoGenerated: true
      });
    }
  });

  const extraMap = [
    ["shopping", "compras", "Compras planeadas", 8],
    ["pharmacy", "farmacia", "Farmácia planeada", 9],
    ["leisure", "lazer", "Lazer planeado", 10],
    ["course", "curso", "Curso / prestação", 11],
    ["other", "outros", "Outros planeados", 12]
  ];

  extraMap.forEach(([key, category, description, day]) => {
    const value = Number(settings.extras[key] || 0);
    if (value > 0) {
      addTransaction(state, {
        date: `${monthKey}-${String(day).padStart(2, "0")}`,
        monthKey,
        description,
        type: "saida",
        origin: "account",
        category,
        value,
        autoGenerated: true
      });
    }
  });

  const cofreMap = [
    ["brasil", "Brasil", 13],
    ["emergencia", "Emergência", 14],
    ["lazer", "Lazer", 15],
    ["poupanca", "Poupança", 16],
    ["poupanca_lara", "Poupança Lara", 17]
  ];

  cofreMap.forEach(([key, label, day]) => {
    const value = Number(settings.cofrinhos[key] || 0);
    if (value > 0) {
      addTransaction(state, {
        date: `${monthKey}-${String(day).padStart(2, "0")}`,
        monthKey,
        description: `Cofrinho ${label}`,
        type: "saida",
        origin: "save",
        category: "cofrinho",
        cofrinho: key,
        value,
        autoGenerated: true
      });
    }
  });

  saveState(state);

  const reloadedState = loadState();
  if (!monthAlreadyGenerated(reloadedState, monthKey)) {
    showToast("Ocorreu um problema ao gerar os movimentos do mês.", "error");
    return;
  }

  renderAll();
  showToast("Movimentos do mês gerados com sucesso.", "success");
}

function deleteMonthMovements() {
  const state = loadState();
  const monthKey = getSelectedMonthKey(state);

  const before = state.transactions.length;
  state.transactions = state.transactions.filter(tx => !(tx.monthKey === monthKey && tx.autoGenerated === true));
  const removed = before - state.transactions.length;

  saveState(state);
  renderAll();

  if (removed > 0) {
    showToast("Movimentos automáticos do mês excluídos com sucesso.", "success");
  } else {
    showToast("Não havia movimentos automáticos para excluir neste mês.", "warning");
  }
}

/* =========================
   IMPORT / EXPORT
========================= */

function exportHistory() {
  const state = loadState();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `lairabudget-backup-${getMonthKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  showToast("Histórico exportado com sucesso.", "success");
}

function importHistoryFromFile(file) {
  if (!file) return;

  const isJsonFile =
    file.type === "application/json" ||
    file.name.toLowerCase().endsWith(".json");

  if (!isJsonFile) {
    showToast("Seleciona um ficheiro JSON válido.", "error");
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const rawText = String(reader.result || "").trim();

      if (!rawText) {
        showToast("O ficheiro está vazio.", "error");
        return;
      }

      const parsed = JSON.parse(rawText);

      if (!isImportStructureValid(parsed)) {
        showToast("O ficheiro não tem uma estrutura válida do LairaBudget.", "error");
        return;
      }

      const safeState = sanitizeFullState(parsed);

      saveState(safeState);
      renderAll();
      activateView(safeState.ui.currentView || "overviewView");
      showToast("Histórico importado com sucesso.", "success");
    } catch {
      showToast("Não foi possível importar este ficheiro.", "error");
    }
  };

  reader.onerror = () => {
    showToast("Ocorreu um erro ao ler o ficheiro.", "error");
  };

  reader.readAsText(file);
}

/* =========================
   OVERVIEW
========================= */

function calculateGlobalGoalProgress(state) {
  let totalSaved = 0;
  let totalGoals = 0;

  state.transactions
    .filter(tx => tx.type === "saida" && tx.origin === "save" && tx.category === "cofrinho")
    .forEach(tx => {
      totalSaved += Number(tx.value || 0);
    });

  Object.values(state.settingsByMonth || {}).forEach(settingsRaw => {
    const settings = {
      ...getDefaultMonthSettings(),
      ...settingsRaw,
      metas: {
        ...getDefaultMonthSettings().metas,
        ...(settingsRaw.metas || {})
      }
    };

    totalGoals += Number(settings.metas.brasil || 0);
    totalGoals += Number(settings.metas.emergencia || 0);
    totalGoals += Number(settings.metas.lazer || 0);
    totalGoals += Number(settings.metas.poupanca || 0);
    totalGoals += Number(settings.metas.poupanca_lara || 0);
  });

  if (totalGoals <= 0) return 0;
  return Math.min((totalSaved / totalGoals) * 100, 100);
}

function buildCalendarGrid(monthKey, highlightToday = false) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();

  let startDay = firstDay.getDay();
  startDay = startDay === 0 ? 6 : startDay - 1;

  const items = [];
  for (let i = 0; i < startDay; i++) {
    items.push({ empty: true, label: "" });
  }

  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year &&
    today.getMonth() === month - 1;

  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = highlightToday && isCurrentMonth && today.getDate() === day;
    items.push({ empty: false, label: String(day), marked: isToday });
  }

  while (items.length < 35) {
    items.push({ empty: true, label: "" });
  }

  return items.slice(0, 35);
}

function renderCalendarInto(containerId, monthKey, highlightToday = false) {
  const container = byId(containerId);
  if (!container) return;

  const items = buildCalendarGrid(monthKey, highlightToday);

  container.innerHTML = items.map(item => {
    if (item.empty) return `<div class="hero-day empty"></div>`;
    return `<div class="hero-day ${item.marked ? "marked" : ""}">${item.label}</div>`;
  }).join("");
}

function renderOverviewCategoryChart(state, monthKey) {
  const canvas = byId("overviewCategoryChart");
  if (!canvas) return;

  const transactions = getMonthTransactions(state, monthKey);
  const categoryTotals = {};

  transactions
    .filter(tx => tx.type === "saida" && tx.origin !== "save")
    .forEach(tx => {
      const category = tx.category || "outros";
      categoryTotals[category] = (categoryTotals[category] || 0) + Number(tx.value || 0);
    });

  const labels = Object.keys(categoryTotals).length
    ? Object.keys(categoryTotals).map(capitalize)
    : ["Sem dados"];

  const data = Object.keys(categoryTotals).length
    ? Object.values(categoryTotals)
    : [1];

  if (overviewCategoryChartInstance) overviewCategoryChartInstance.destroy();

  overviewCategoryChartInstance = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: ["#22C55E", "#0EA5E9", "#38BDF8", "#34D399", "#F59E0B", "#F97316", "#A78BFA", "#818CF8", "#FB7185", "#60A5FA"],
        borderWidth: 0,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "64%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#94A3B8",
            boxWidth: 14,
            padding: 14
          }
        }
      }
    }
  });
}

function renderOverviewMonthlyEvolutionChart(state) {
  const canvas = byId("overviewMonthlyEvolutionChart");
  if (!canvas) return;

  const monthKeys = Object.keys(state.settingsByMonth).sort();

  const labels = [];
  const spentValues = [];
  const savedValues = [];

  monthKeys.forEach(monthKey => {
    const monthTransactions = getMonthTransactions(state, monthKey);

    const spent = monthTransactions
      .filter(tx => tx.type === "saida" && tx.origin !== "save")
      .reduce((acc, tx) => acc + Number(tx.value || 0), 0);

    const saved = monthTransactions
      .filter(tx => tx.type === "saida" && tx.origin === "save")
      .reduce((acc, tx) => acc + Number(tx.value || 0), 0);

    labels.push(capitalize(getMonthShortName(monthKey)));
    spentValues.push(spent);
    savedValues.push(saved);
  });

  if (!labels.length) {
    labels.push("Sem dados");
    spentValues.push(0);
    savedValues.push(0);
  }

  if (overviewMonthlyEvolutionChartInstance) overviewMonthlyEvolutionChartInstance.destroy();

  overviewMonthlyEvolutionChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Gasto",
          data: spentValues,
          borderColor: "#0EA5E9",
          backgroundColor: "rgba(14,165,233,.10)",
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 5,
          pointBackgroundColor: "#0EA5E9",
          pointBorderWidth: 0
        },
        {
          label: "Guardado",
          data: savedValues,
          borderColor: "#22C55E",
          backgroundColor: "rgba(34,197,94,.10)",
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 5,
          pointBackgroundColor: "#22C55E",
          pointBorderWidth: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          labels: { color: "#94A3B8" }
        }
      },
      scales: {
        x: {
          ticks: { color: "#94A3B8" },
          grid: { color: "rgba(255,255,255,.04)" }
        },
        y: {
          ticks: { color: "#94A3B8" },
          grid: { color: "rgba(255,255,255,.04)" }
        }
      }
    }
  });
}

function renderOverview(state) {
  const monthKey = getSelectedMonthKey(state);
  const nextMonthKey = getNextMonthKey(monthKey);
  const summary = calculateMonthBalances(state, monthKey);
  const monthCompletion = getMonthCompletionPercent(monthKey);
  const goalProgress = calculateGlobalGoalProgress(state);

  const currentMonthDate = new Date(`${monthKey}-01T00:00:00`);
  const now = new Date();
  const isCurrentDisplayedMonth =
    currentMonthDate.getFullYear() === now.getFullYear() &&
    currentMonthDate.getMonth() === now.getMonth();

  const currentDay = isCurrentDisplayedMonth ? String(now.getDate()).padStart(2, "0") : "01";

  if (byId("overviewTotalSaved")) byId("overviewTotalSaved").textContent = formatCurrency(summary.totalSavedAllMonths);
  if (byId("overviewMonthProgress")) byId("overviewMonthProgress").textContent = `${monthCompletion.toFixed(0)}%`;
  if (byId("overviewGoalProgress")) byId("overviewGoalProgress").textContent = `${goalProgress.toFixed(0)}%`;

  if (byId("overviewCurrentMonthName")) byId("overviewCurrentMonthName").textContent = capitalize(getMonthShortName(monthKey));
  if (byId("overviewCurrentMonthBadge")) byId("overviewCurrentMonthBadge").textContent = currentDay;
  if (byId("overviewNextMonthName")) byId("overviewNextMonthName").textContent = capitalize(getMonthShortName(nextMonthKey));
  if (byId("overviewNextMonthBadge")) byId("overviewNextMonthBadge").textContent = "01";

  renderCalendarInto("overviewCurrentMonthDays", monthKey, true);
  renderCalendarInto("overviewNextMonthDays", nextMonthKey, false);

  if (byId("overviewMonthSpent")) byId("overviewMonthSpent").textContent = formatCurrency(summary.totalMonthSpent);
  if (byId("overviewAvailableToSpend")) byId("overviewAvailableToSpend").textContent = formatCurrency(summary.saldoDisponivel);
  if (byId("overviewSavedThisMonth")) byId("overviewSavedThisMonth").textContent = formatCurrency(summary.currentMonthSaved);
  if (byId("overviewMealBalance")) byId("overviewMealBalance").textContent = formatCurrency(summary.saldoAlimentacao);
  if (byId("overviewDaysToSalary")) byId("overviewDaysToSalary").textContent = `${summary.daysUntilSalary} dias`;
  if (byId("overviewDailyLimit")) byId("overviewDailyLimit").textContent = formatCurrency(summary.gastoPorDia);

  if (byId("overviewCardSaldo")) byId("overviewCardSaldo").textContent = formatCurrency(summary.saldoDisponivel);
  if (byId("overviewCardTotalSaved")) byId("overviewCardTotalSaved").textContent = formatCurrency(summary.totalSavedAllMonths);
  if (byId("overviewCardSavedMonth")) byId("overviewCardSavedMonth").textContent = formatCurrency(summary.currentMonthSaved);
  if (byId("overviewCardMeal")) byId("overviewCardMeal").textContent = formatCurrency(summary.saldoAlimentacao);

  const monthBalanceValue = summary.saldoDisponivel + summary.saldoAlimentacao;
  if (byId("overviewMonthBalance")) byId("overviewMonthBalance").textContent = formatCurrency(monthBalanceValue);

  const spentBar = byId("overviewSpentBar");
  if (spentBar) {
    const base = Math.max(Number(summary.settings.salary || 0), 1);
    const percent = Math.min((summary.totalMonthSpent / base) * 100, 100);
    spentBar.style.width = `${percent}%`;
  }

  renderOverviewCategoryChart(state, monthKey);
  renderOverviewMonthlyEvolutionChart(state);
}

/* =========================
   COFRES / PREVISÕES / CHARTS
========================= */

function calculateCofrinhoProgress(state, key) {
  const current = state.transactions
    .filter(tx => tx.type === "saida" && tx.origin === "save" && tx.category === "cofrinho" && tx.cofrinho === key)
    .reduce((acc, tx) => acc + Number(tx.value || 0), 0);

  const currentMonthSettings = getMonthSettings(state, getSelectedMonthKey(state));
  const goal = Number(currentMonthSettings.metas[key] || 0);
  const percent = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  const remaining = Math.max(goal - current, 0);

  return { current, goal, percent, remaining };
}

function renderGoalCard(prefix, progress) {
  const values = byId(`${prefix}Values`);
  const fill = byId(`${prefix}Fill`);
  const status = byId(`${prefix}Status`);
  const remaining = byId(`${prefix}Remaining`);
  const current = byId(`${prefix}Current`);

  if (values) {
    values.textContent = `${formatCurrency(progress.current)} / ${formatCurrency(progress.goal)}`;
  }

  if (current) {
    current.textContent = formatCurrency(progress.current);
  }

  if (fill) {
    fill.style.width = `${progress.percent}%`;
  }

  if (status) {
    status.textContent = `${progress.percent.toFixed(0)}%`;
  }

  if (remaining) {
    remaining.textContent =
      progress.goal <= 0
        ? "Define uma meta"
        : progress.remaining <= 0
          ? "Meta atingida 🎉"
          : `Faltam ${formatCurrency(progress.remaining)}`;
  }
}

function renderGoals(state) {
  renderGoalCard("goalBrasil", calculateCofrinhoProgress(state, "brasil"));
  renderGoalCard("goalEmergencia", calculateCofrinhoProgress(state, "emergencia"));
  renderGoalCard("goalLazer", calculateCofrinhoProgress(state, "lazer"));
  renderGoalCard("goalPoupanca", calculateCofrinhoProgress(state, "poupanca"));
  renderGoalCard("goalPoupancaLara", calculateCofrinhoProgress(state, "poupanca_lara"));
}

function renderCofresHero(state) {
  const monthKey = getSelectedMonthKey(state);
  const settings = getMonthSettings(state, monthKey);
  const cofreKeys = ["brasil", "emergencia", "lazer", "poupanca", "poupanca_lara"];

  let totalGuardado = 0;
  let totalMeta = 0;
  let totalFalta = 0;
  let cofresAtivos = 0;

  cofreKeys.forEach((key) => {
    const progress = calculateCofrinhoProgress(state, key);

    totalGuardado += Number(progress.current || 0);
    totalMeta += Number(progress.goal || 0);
    totalFalta += Number(progress.remaining || 0);

    const hasConfiguredValue = Number(settings.cofrinhos[key] || 0) > 0;
    const hasGoal = Number(settings.metas[key] || 0) > 0;
    const hasSaved = Number(progress.current || 0) > 0;

    if (hasConfiguredValue || hasGoal || hasSaved) {
      cofresAtivos++;
    }
  });

  const progressoGlobal = totalMeta > 0 ? Math.min((totalGuardado / totalMeta) * 100, 100) : 0;

  if (byId("cofresTotalSavedHero")) byId("cofresTotalSavedHero").textContent = formatCurrency(totalGuardado);
  if (byId("cofresActiveCount")) byId("cofresActiveCount").textContent = String(cofresAtivos);
  if (byId("cofresTotalTarget")) byId("cofresTotalTarget").textContent = formatCurrency(totalMeta);
  if (byId("cofresTotalRemaining")) byId("cofresTotalRemaining").textContent = formatCurrency(totalFalta);
  if (byId("cofresGlobalProgress")) byId("cofresGlobalProgress").textContent = `${progressoGlobal.toFixed(0)}%`;

  const mirror = byId("cofresGlobalProgressMirror");
  if (mirror) {
    mirror.textContent = `${progressoGlobal.toFixed(0)}% global`;
  }
}

function renderPoupancaChart(state) {
  const canvas = byId("poupancaChart");
  if (!canvas) return;

  const savedByMonth = {};
  state.transactions
    .filter(tx => tx.type === "saida" && tx.origin === "save")
    .forEach(tx => {
      savedByMonth[tx.monthKey] = (savedByMonth[tx.monthKey] || 0) + Number(tx.value || 0);
    });

  const monthKeys = Object.keys(savedByMonth).sort();
  let acumulado = 0;
  const labels = [];
  const values = [];

  monthKeys.forEach(key => {
    acumulado += savedByMonth[key];
    labels.push(getMonthNameFromKey(key));
    values.push(acumulado);
  });

  if (!labels.length) {
    labels.push("Sem dados");
    values.push(0);
  }

  if (poupancaChartInstance) poupancaChartInstance.destroy();

  poupancaChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Total guardado",
        data: values,
        borderColor: "#22C55E",
        backgroundColor: "rgba(34,197,94,.12)",
        fill: true,
        tension: 0.35,
        pointRadius: 4,
        pointBackgroundColor: "#0EA5E9",
        pointBorderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#94A3B8" } } },
      scales: {
        x: { ticks: { color: "#94A3B8" }, grid: { color: "rgba(255,255,255,.04)" } },
        y: { ticks: { color: "#94A3B8" }, grid: { color: "rgba(255,255,255,.04)" } }
      }
    }
  });
}

function renderCategoryAnalysis(state) {
  const category = byId("analysisCategory")?.value || "renda";
  const monthKey = getSelectedMonthKey(state);
  const year = monthKey.split("-")[0];

  const monthTotal = state.transactions
    .filter(tx => tx.type === "saida" && tx.category === category && tx.monthKey === monthKey)
    .reduce((acc, tx) => acc + Number(tx.value || 0), 0);

  const yearTotal = state.transactions
    .filter(tx => tx.type === "saida" && tx.category === category && tx.monthKey.startsWith(year))
    .reduce((acc, tx) => acc + Number(tx.value || 0), 0);

  const settings = getMonthSettings(state, monthKey);
  const salary = Number(settings.salary || 0);
  const salaryPercent = salary > 0 ? (monthTotal / salary) * 100 : 0;

  if (byId("analysisMonthTotal")) byId("analysisMonthTotal").textContent = formatCurrency(monthTotal);
  if (byId("analysisYearTotal")) byId("analysisYearTotal").textContent = formatCurrency(yearTotal);
  if (byId("analysisSalaryPercent")) byId("analysisSalaryPercent").textContent = `${salaryPercent.toFixed(0)}%`;

  const analysisSalaryPercentMirror = byId("analysisSalaryPercentMirror");
  if (analysisSalaryPercentMirror) {
    analysisSalaryPercentMirror.textContent = `${salaryPercent.toFixed(0)}%`;
  }

  const monthlyTotals = {};
  state.transactions
    .filter(tx => tx.type === "saida" && tx.category === category && tx.monthKey.startsWith(year))
    .forEach(tx => {
      monthlyTotals[tx.monthKey] = (monthlyTotals[tx.monthKey] || 0) + Number(tx.value || 0);
    });

  const labels = Object.keys(monthlyTotals).sort();
  const values = labels.map(label => monthlyTotals[label]);

  const canvas = byId("categoryAnalysisChart");
  if (!canvas) return;

  if (categoryAnalysisChartInstance) categoryAnalysisChartInstance.destroy();

  categoryAnalysisChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels: labels.length ? labels.map(getMonthNameFromKey) : ["Sem dados"],
      datasets: [{
        label: capitalize(category),
        data: values.length ? values : [0],
        borderColor: "#22C55E",
        backgroundColor: "rgba(14,165,233,.10)",
        fill: true,
        tension: 0.35,
        pointRadius: 4,
        pointBackgroundColor: "#22C55E",
        pointBorderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#94A3B8" } } },
      scales: {
        x: { ticks: { color: "#94A3B8" }, grid: { color: "rgba(255,255,255,.04)" } },
        y: { ticks: { color: "#94A3B8" }, grid: { color: "rgba(255,255,255,.04)" } }
      }
    }
  });
}

function applyForecastToElements(prefix = "") {
  return {
    finalBalance: byId(`forecastFinalBalance${prefix}`),
    dailyAverage: byId(`forecastDailyAverage${prefix}`),
    safeToSpend: byId(`forecastSafeToSpend${prefix}`),
    status: byId(`forecastStatus${prefix}`)
  };
}

function renderForecast(summary) {
  const groups = [applyForecastToElements(""), applyForecastToElements("Mirror")];

  let text = "Tudo parece controlado neste mês.";
  let className = "forecast-status safe";

  if (summary.projectedFinalBalance < 0) {
    text = "⚠️ Pelo ritmo atual, podes fechar o mês no vermelho. Convém reduzir gastos para recuperar margem.";
    className = "forecast-status danger";
  } else if (summary.projectedFinalBalance < 100) {
    text = "⚠️ Estás a caminho de fechar o mês com pouca folga. Convém ter atenção aos próximos gastos.";
    className = "forecast-status warn";
  } else {
    text = "✅ A previsão do mês está saudável. Mantendo este ritmo, deves fechar com margem positiva.";
    className = "forecast-status safe";
  }

  groups.forEach(refs => {
    if (refs.finalBalance) refs.finalBalance.textContent = formatCurrency(summary.projectedFinalBalance);
    if (refs.dailyAverage) refs.dailyAverage.textContent = formatCurrency(summary.averageSpentPerDay);
    if (refs.safeToSpend) refs.safeToSpend.textContent = formatCurrency(summary.safeToSpend);
    if (refs.status) {
      refs.status.className = className;
      refs.status.textContent = text;
    }
  });
}

function renderCofreSection(state) {
  const selectedCofre = state.ui.selectedCofre || "brasil";

  renderCofresHero(state);

  document.querySelectorAll(".cofre-tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.cofre === selectedCofre);
  });

  renderGoals(state);

  const history = state.transactions
    .filter(tx => tx.type === "saida" && tx.origin === "save" && tx.cofrinho === selectedCofre)
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  const byMonth = {};
  history.forEach(tx => {
    byMonth[tx.monthKey] = (byMonth[tx.monthKey] || 0) + Number(tx.value || 0);
  });

  const labels = Object.keys(byMonth);
  const values = Object.values(byMonth);

  const tableBody = byId("cofreHistoryTableBody");
  if (tableBody) {
    tableBody.innerHTML = !labels.length
      ? `<tr><td colspan="3" style="text-align:center;color:#94A3B8;padding:22px;">Nenhum registo encontrado para este cofre.</td></tr>`
      : labels.map(monthKey => `
        <tr>
          <td>${getMonthNameFromKey(monthKey)}</td>
          <td>${capitalize(selectedCofre)}</td>
          <td>${formatCurrency(byMonth[monthKey])}</td>
        </tr>
      `).join("");
  }

  const canvas = byId("cofreEvolutionChart");
  if (!canvas) return;

  if (cofreEvolutionChartInstance) cofreEvolutionChartInstance.destroy();

  cofreEvolutionChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels: labels.length ? labels.map(getMonthNameFromKey) : ["Sem dados"],
      datasets: [{
        label: `Evolução ${capitalize(selectedCofre)}`,
        data: values.length ? values : [0],
        borderColor: "#0EA5E9",
        backgroundColor: "rgba(14,165,233,.10)",
        fill: true,
        tension: 0.35,
        pointRadius: 4,
        pointHoverRadius: 5,
        pointBackgroundColor: "#22C55E",
        pointBorderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#94A3B8" } } },
      scales: {
        x: { ticks: { color: "#94A3B8" }, grid: { color: "rgba(255,255,255,.04)" } },
        y: { ticks: { color: "#94A3B8" }, grid: { color: "rgba(255,255,255,.04)" } }
      }
    }
  });
}

/* =========================
   MOVIMENTOS
========================= */

function getOriginTag(origin) {
  if (origin === "meal") return `<span class="tag meal">◌ Alimentação</span>`;
  if (origin === "save") return `<span class="tag save">◎ Cofrinho</span>`;
  return `<span class="tag account">◉ Conta</span>`;
}

function deleteTransaction(transactionId) {
  if (!confirm("Tens a certeza que queres apagar este movimento?")) return;

  const state = loadState();
  state.transactions = state.transactions.filter(tx => tx.id !== transactionId);
  saveState(state);
  renderAll();
  showToast("Movimento apagado com sucesso.", "success");
}

function renderTransactions(state) {
  const tbody = byId("transactionsTableBody");
  if (!tbody) return;

  const typeFilter = byId("filterType")?.value || "all";
  const originFilter = byId("filterOrigin")?.value || "all";
  const categoryFilter = byId("filterCategory")?.value || "all";

  let transactions = [...getCurrentMonthTransactions(state)].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (typeFilter !== "all") transactions = transactions.filter(tx => tx.type === typeFilter);
  if (originFilter !== "all") transactions = transactions.filter(tx => tx.origin === originFilter);
  if (categoryFilter !== "all") transactions = transactions.filter(tx => tx.category === categoryFilter);

  if (!transactions.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#94A3B8;padding:22px;">Nenhum movimento encontrado neste mês.</td></tr>`;
    return;
  }

  tbody.innerHTML = transactions.map(tx => `
    <tr>
      <td>${new Date(tx.date).toLocaleDateString("pt-PT")}</td>
      <td>${tx.description}</td>
      <td>${tx.type === "entrada" ? "Entrada" : "Saída"}</td>
      <td>${getOriginTag(tx.origin)}</td>
      <td>${capitalize(tx.category)}</td>
      <td>${tx.type === "saida" ? "-" : "+"}${formatCurrency(tx.value)}</td>
      <td><button class="delete-btn" data-id="${tx.id}">Apagar</button></td>
    </tr>
  `).join("");

  document.querySelectorAll("[data-id]").forEach(btn => {
    btn.addEventListener("click", () => deleteTransaction(btn.dataset.id));
  });
}

/* =========================
   LAZER / VIAGENS
========================= */

function getTripEventsByYear(state, year) {
  return state.tripEvents.filter(event => (event.startDate || "").slice(0, 4) === String(year));
}

function getTripExpensesForEvent(state, tripId) {
  return state.tripExpenses.filter(exp => exp.tripId === tripId);
}

function getTripTotalSpent(state, tripId) {
  return getTripExpensesForEvent(state, tripId).reduce((acc, exp) => acc + Number(exp.value || 0), 0);
}

function getTripBudgetRemaining(state, tripId) {
  const event = state.tripEvents.find(item => item.id === tripId);
  if (!event) return 0;
  return Number(event.budget || 0) - getTripTotalSpent(state, tripId);
}

function getTripBudgetPercent(state, tripId) {
  const event = state.tripEvents.find(item => item.id === tripId);
  if (!event) return 0;
  const budget = Number(event.budget || 0);
  const totalSpent = getTripTotalSpent(state, tripId);
  if (budget <= 0) return totalSpent > 0 ? 100 : 0;
  return (totalSpent / budget) * 100;
}

function getTripBudgetStatus(state, tripId) {
  const percent = getTripBudgetPercent(state, tripId);
  if (percent >= 100) return "danger";
  if (percent >= 80) return "warn";
  return "safe";
}

function getTripBudgetStatusLabel(state, tripId) {
  const status = getTripBudgetStatus(state, tripId);
  if (status === "danger") return "Estourado";
  if (status === "warn") return "Atenção";
  return "Controlado";
}

function getLazerCofrinhoTotal(state) {
  return state.transactions
    .filter(tx => tx.type === "saida" && tx.origin === "save" && tx.category === "cofrinho" && tx.cofrinho === "lazer")
    .reduce((acc, tx) => acc + Number(tx.value || 0), 0);
}

function getTripCommittedValue(state) {
  return state.tripEvents.reduce((acc, event) => {
    const remaining = getTripBudgetRemaining(state, event.id);
    return acc + Math.max(remaining, 0);
  }, 0);
}

function getTripFreeAfterCommitted(state) {
  const lazerGuardado = getLazerCofrinhoTotal(state);
  const committed = getTripCommittedValue(state);
  return lazerGuardado - committed;
}

function getNextUpcomingTrip(state) {
  const today = getTodayISO();
  const upcoming = [...state.tripEvents]
    .filter(event => (event.startDate || "") >= today)
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

  return upcoming[0] || null;
}

function getSelectedTrip(state) {
  return state.tripEvents.find(event => event.id === state.ui.selectedTripId);
}

function clearFieldError(fieldId, errorId) {
  const field = byId(fieldId);
  const error = byId(errorId);
  if (field) field.classList.remove("input-error");
  if (error) error.classList.remove("show");
}

function setFieldError(fieldId, errorId, message = "") {
  const field = byId(fieldId);
  const error = byId(errorId);
  if (field) field.classList.add("input-error");
  if (error) {
    if (message) error.textContent = message;
    error.classList.add("show");
  }
}

function clearFormErrors() {
  [
    ["tripName", "tripNameError"],
    ["tripLocation", "tripLocationError"],
    ["tripBudget", "tripBudgetError"],
    ["tripStartDate", "tripStartDateError"],
    ["tripExpenseEvent", "tripExpenseEventError"],
    ["tripExpenseDescription", "tripExpenseDescriptionError"],
    ["tripExpenseValue", "tripExpenseValueError"]
  ].forEach(([fieldId, errorId]) => clearFieldError(fieldId, errorId));
}

function createTripEvent() {
  clearFormErrors();

  const state = loadState();

  const name = byId("tripName")?.value.trim() || "";
  const type = byId("tripType")?.value || "viagem";
  const location = byId("tripLocation")?.value.trim() || "";
  const budget = parseNumber(byId("tripBudget")?.value);
  const startDate = byId("tripStartDate")?.value || "";
  const endDate = byId("tripEndDate")?.value || "";

  let hasError = false;

  if (!name) {
    setFieldError("tripName", "tripNameError", "Escreve o nome do evento.");
    hasError = true;
  }
  if (!location) {
    setFieldError("tripLocation", "tripLocationError", "Escreve o local do evento.");
    hasError = true;
  }
  if (budget <= 0) {
    setFieldError("tripBudget", "tripBudgetError", "Preenche um orçamento válido.");
    hasError = true;
  }
  if (!startDate) {
    setFieldError("tripStartDate", "tripStartDateError", "Escolhe a data inicial.");
    hasError = true;
  }

  if (hasError) {
    showToast("Corrige os campos do evento antes de continuar.", "error");
    return;
  }

  const trip = { id: generateId(), name, type, location, budget, startDate, endDate };
  state.tripEvents.push(trip);

  if (!state.ui.selectedTripId) state.ui.selectedTripId = trip.id;

  saveState(state);

  if (byId("tripName")) byId("tripName").value = "";
  if (byId("tripType")) byId("tripType").value = "viagem";
  if (byId("tripLocation")) byId("tripLocation").value = "";
  if (byId("tripBudget")) byId("tripBudget").value = "";
  if (byId("tripStartDate")) byId("tripStartDate").value = "";
  if (byId("tripEndDate")) byId("tripEndDate").value = "";

  renderAll();
  showToast("Evento criado com sucesso.", "success");
}

function addTripExpense() {
  clearFormErrors();

  const state = loadState();

  const tripId = byId("tripExpenseEvent")?.value || "";
  const date = byId("tripExpenseDate")?.value || getTodayISO();
  const description = byId("tripExpenseDescription")?.value.trim() || "";
  const category = byId("tripExpenseCategory")?.value || "outros";
  const value = parseNumber(byId("tripExpenseValue")?.value);

  let hasError = false;

  if (!tripId) {
    setFieldError("tripExpenseEvent", "tripExpenseEventError", "Escolhe um evento.");
    hasError = true;
  }
  if (!description) {
    setFieldError("tripExpenseDescription", "tripExpenseDescriptionError", "Escreve uma descrição.");
    hasError = true;
  }
  if (value <= 0) {
    setFieldError("tripExpenseValue", "tripExpenseValueError", "Preenche um valor válido.");
    hasError = true;
  }

  if (hasError) {
    showToast("Corrige os campos do gasto antes de continuar.", "error");
    return;
  }

  state.tripExpenses.push({
    id: generateId(),
    tripId,
    date,
    description,
    category,
    value
  });

  state.ui.selectedTripId = tripId;
  saveState(state);

  if (byId("tripExpenseDate")) byId("tripExpenseDate").value = getTodayISO();
  if (byId("tripExpenseDescription")) byId("tripExpenseDescription").value = "";
  if (byId("tripExpenseCategory")) byId("tripExpenseCategory").value = "alojamento";
  if (byId("tripExpenseValue")) byId("tripExpenseValue").value = "";

  renderAll();

  const percent = getTripBudgetPercent(loadState(), tripId);
  if (percent >= 100) {
    showToast("Gasto adicionado. Atenção: este evento já estourou o orçamento.", "warning");
  } else if (percent >= 80) {
    showToast("Gasto adicionado. Atenção: este evento está perto do limite.", "warning");
  } else {
    showToast("Gasto do evento adicionado com sucesso.", "success");
  }
}

function selectTrip(tripId) {
  const state = loadState();
  state.ui.selectedTripId = tripId;
  saveState(state);
  renderAll();
}

function deleteTripEvent(tripId) {
  if (!confirm("Tens a certeza que queres apagar este evento e todos os gastos dele?")) return;

  const state = loadState();
  state.tripEvents = state.tripEvents.filter(event => event.id !== tripId);
  state.tripExpenses = state.tripExpenses.filter(exp => exp.tripId !== tripId);

  if (state.ui.selectedTripId === tripId) {
    state.ui.selectedTripId = state.tripEvents[0]?.id || "";
  }

  saveState(state);
  renderAll();
  showToast("Evento apagado com sucesso.", "success");
}

function deleteTripExpense(expenseId) {
  if (!confirm("Tens a certeza que queres apagar este gasto?")) return;

  const state = loadState();
  state.tripExpenses = state.tripExpenses.filter(exp => exp.id !== expenseId);
  saveState(state);
  renderAll();
  showToast("Gasto apagado com sucesso.", "success");
}

function renderTripExpenseEventOptions(state) {
  const select = byId("tripExpenseEvent");
  if (!select) return;

  const selected = state.ui.selectedTripId || "";
  const events = [...state.tripEvents].sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

  if (!events.length) {
    select.innerHTML = `<option value="">Sem eventos criados</option>`;
    return;
  }

  select.innerHTML = events.map(event => `
    <option value="${event.id}" ${event.id === selected ? "selected" : ""}>${event.name}</option>
  `).join("");
}

function renderTripSummaryCards(state) {
  const currentYear = getCurrentYear();
  const yearEvents = getTripEventsByYear(state, currentYear);
  const yearEventIds = yearEvents.map(event => event.id);

  const yearExpenses = state.tripExpenses.filter(exp =>
    (exp.date || "").slice(0, 4) === String(currentYear) &&
    yearEventIds.includes(exp.tripId)
  );

  const totalYear = yearExpenses.reduce((acc, exp) => acc + Number(exp.value || 0), 0);
  const tripCount = yearEvents.length;
  const average = tripCount > 0 ? totalYear / tripCount : 0;

  let highestValue = 0;
  let highestName = "Sem dados";

  yearEvents.forEach(event => {
    const total = getTripTotalSpent(state, event.id);
    if (total > highestValue) {
      highestValue = total;
      highestName = event.name;
    }
  });

  const lazerGuardado = getLazerCofrinhoTotal(state);
  const committed = getTripCommittedValue(state);
  const freeAfterCommitted = getTripFreeAfterCommitted(state);
  const nextTrip = getNextUpcomingTrip(state);

  if (byId("tripAvailable")) byId("tripAvailable").textContent = formatCurrency(freeAfterCommitted);
  if (byId("tripLazerSaved")) byId("tripLazerSaved").textContent = formatCurrency(lazerGuardado);
  if (byId("tripYearTotal")) byId("tripYearTotal").textContent = formatCurrency(totalYear);
  if (byId("tripCount")) byId("tripCount").textContent = String(tripCount);
  if (byId("tripAverage")) byId("tripAverage").textContent = formatCurrency(average);
  if (byId("tripHighest")) byId("tripHighest").textContent = formatCurrency(highestValue);
  if (byId("tripHighestName")) byId("tripHighestName").textContent = highestName;
  if (byId("tripCommitted")) byId("tripCommitted").textContent = formatCurrency(committed);

  if (byId("tripCommittedSub")) {
    byId("tripCommittedSub").textContent =
      committed > 0
        ? `Dos ${formatCurrency(lazerGuardado)}, ${formatCurrency(committed)} já estão comprometidos em eventos.`
        : "Não há valor reservado pendente nos eventos.";
  }

  if (byId("tripNextEvent")) byId("tripNextEvent").textContent = nextTrip ? nextTrip.name : "Sem dados";
  if (byId("tripNextEventSub")) {
    byId("tripNextEventSub").textContent =
      !nextTrip
        ? "Quando houver um próximo evento, aparece aqui."
        : `${new Date(nextTrip.startDate).toLocaleDateString("pt-PT")} • ${nextTrip.location}`;
  }

  if (byId("tripAvailableSub")) {
    if (freeAfterCommitted < 0) {
      byId("tripAvailableSub").textContent = `⚠️ Défice no lazer: faltam ${formatCurrency(Math.abs(freeAfterCommitted))} para cobrir os eventos.`;
    } else if (freeAfterCommitted === 0 && lazerGuardado > 0) {
      byId("tripAvailableSub").textContent = "Todo o saldo do cofre lazer já está reservado para os eventos.";
    } else if (lazerGuardado === 0 && committed > 0) {
      byId("tripAvailableSub").textContent = `Ainda não tens saldo no cofre lazer, mas já tens ${formatCurrency(committed)} planeados em eventos.`;
    } else {
      byId("tripAvailableSub").textContent = `Depois de reservar os eventos, ainda tens ${formatCurrency(freeAfterCommitted)} livres no cofre lazer.`;
    }
  }
}

function renderTripEventsTable(state) {
  const tbody = byId("tripEventsTableBody");
  if (!tbody) return;

  const events = [...state.tripEvents].sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

  if (!events.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#94A3B8;padding:22px;">Ainda não criaste nenhum evento.</td></tr>`;
    return;
  }

  tbody.innerHTML = events.map(event => {
    const totalSpent = getTripTotalSpent(state, event.id);
    const percentUsed = getTripBudgetPercent(state, event.id);
    const remaining = getTripBudgetRemaining(state, event.id);
    const status = getTripBudgetStatus(state, event.id);
    const statusLabel = getTripBudgetStatusLabel(state, event.id);
    const width = Math.min(percentUsed, 100);

    return `
      <tr>
        <td>${event.name}</td>
        <td>${capitalize(event.type)}</td>
        <td>${event.location}</td>
        <td>${formatCurrency(event.budget)}</td>
        <td>${formatCurrency(totalSpent)}</td>
        <td class="progress-cell">
          <div class="mini-progress">
            <div class="mini-progress-fill progress-${status}" style="width:${width}%;"></div>
          </div>
          <span class="budget-status ${status}">
            ${percentUsed.toFixed(0)}% • ${statusLabel}
          </span>
        </td>
        <td style="font-weight:800;color:${remaining < 0 ? "#FF8A8A" : "#F8FAFC"};">${formatCurrency(remaining)}</td>
        <td style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="select-btn" data-trip-select="${event.id}">Ver</button>
          <button class="delete-btn" data-trip-delete="${event.id}">Apagar</button>
        </td>
      </tr>
    `;
  }).join("");

  document.querySelectorAll("[data-trip-select]").forEach(btn => {
    btn.addEventListener("click", () => selectTrip(btn.dataset.tripSelect));
  });
  document.querySelectorAll("[data-trip-delete]").forEach(btn => {
    btn.addEventListener("click", () => deleteTripEvent(btn.dataset.tripDelete));
  });
}

function renderSelectedTripWarning(state) {
  const warningEl = byId("selectedTripWarning");
  if (!warningEl) return;

  const selectedTrip = getSelectedTrip(state);
  if (!selectedTrip) {
    warningEl.className = "event-warning-box";
    warningEl.textContent = "";
    return;
  }

  const percentUsed = getTripBudgetPercent(state, selectedTrip.id);
  const remaining = getTripBudgetRemaining(state, selectedTrip.id);
  const status = getTripBudgetStatus(state, selectedTrip.id);

  if (status === "danger") {
    warningEl.className = "event-warning-box danger";
    warningEl.textContent = `⚠️ Este evento estourou o orçamento. Já passaste ${formatCurrency(Math.abs(remaining))} do valor previsto.`;
  } else if (status === "warn") {
    warningEl.className = "event-warning-box warn";
    warningEl.textContent = `⚠️ Atenção: este evento já usou ${percentUsed.toFixed(0)}% do orçamento. Restam ${formatCurrency(remaining)}.`;
  } else {
    warningEl.className = "event-warning-box safe";
    warningEl.textContent = `✅ Evento controlado. Já usaste ${percentUsed.toFixed(0)}% do orçamento e ainda restam ${formatCurrency(remaining)}.`;
  }
}

function renderTripExpensesTable(state) {
  const tbody = byId("tripExpensesTableBody");
  const title = byId("selectedTripTitle");
  if (!tbody || !title) return;

  const selectedTrip = getSelectedTrip(state);

  if (!selectedTrip) {
    title.textContent = "Seleciona um evento para ver os gastos";
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#94A3B8;padding:22px;">Nenhum evento selecionado.</td></tr>`;
    renderSelectedTripWarning(state);
    return;
  }

  const remaining = getTripBudgetRemaining(state, selectedTrip.id);
  const percentUsed = getTripBudgetPercent(state, selectedTrip.id);
  const statusLabel = getTripBudgetStatusLabel(state, selectedTrip.id);

  title.textContent = `${selectedTrip.name} • ${selectedTrip.location} • ${percentUsed.toFixed(0)}% usado • Restante ${formatCurrency(remaining)} • ${statusLabel}`;

  const expenses = getTripExpensesForEvent(state, selectedTrip.id).sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!expenses.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#94A3B8;padding:22px;">Ainda não há gastos neste evento.</td></tr>`;
    renderSelectedTripWarning(state);
    return;
  }

  tbody.innerHTML = expenses.map(exp => `
    <tr>
      <td>${new Date(exp.date).toLocaleDateString("pt-PT")}</td>
      <td>${exp.description}</td>
      <td>${capitalize(exp.category)}</td>
      <td>${formatCurrency(exp.value)}</td>
      <td style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="delete-btn" data-expense-delete="${exp.id}">Apagar</button>
      </td>
    </tr>
  `).join("");

  document.querySelectorAll("[data-expense-delete]").forEach(btn => {
    btn.addEventListener("click", () => deleteTripExpense(btn.dataset.expenseDelete));
  });

  renderSelectedTripWarning(state);
}

function renderLazerView(state) {
  renderTripExpenseEventOptions(state);
  renderTripSummaryCards(state);
  renderTripEventsTable(state);
  renderTripExpensesTable(state);
}

/* =========================
   EVENTS
========================= */

function bindCofreTabs() {
  document.querySelectorAll(".cofre-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const state = loadState();
      state.ui.selectedCofre = btn.dataset.cofre;
      saveState(state);
      renderCofreSection(state);
    });
  });
}

function bindAnalysisCategory() {
  byId("analysisCategory")?.addEventListener("change", () => {
    renderCategoryAnalysis(loadState());
  });
}

function bindFieldValidationReset() {
  [
    ["tripName", "tripNameError"],
    ["tripLocation", "tripLocationError"],
    ["tripBudget", "tripBudgetError"],
    ["tripStartDate", "tripStartDateError"],
    ["tripExpenseEvent", "tripExpenseEventError"],
    ["tripExpenseDescription", "tripExpenseDescriptionError"],
    ["tripExpenseValue", "tripExpenseValueError"]
  ].forEach(([fieldId, errorId]) => {
    const field = byId(fieldId);
    field?.addEventListener("input", () => clearFieldError(fieldId, errorId));
    field?.addEventListener("change", () => clearFieldError(fieldId, errorId));
  });
}

function bindRegistoPreviewLive() {
  [
    "monthSalary", "monthMealCard", "monthFreeMoney", "monthRent",
    "billLight", "billWater", "billInternet", "billFuel", "billGym",
    "extraShopping", "extraPharmacy", "extraLeisure", "extraCourse", "extraOther",
    "cofreBrasil", "cofreEmergencia", "cofreLazer", "cofrePoupanca", "cofrePoupancaLara",
    "metaBrasil", "metaEmergencia", "metaLazer", "metaPoupanca", "metaPoupancaLara"
  ].forEach(id => {
    byId(id)?.addEventListener("input", () => {
      const state = applyDraftToCurrentMonth();
      renderRegistoPreview(state);
      renderOverview(state);
      renderCofreSection(state);
    });
  });
}

function bindRegistoActions() {
  byId("saveMonthBtn")?.addEventListener("click", saveMonthConfig);
  byId("saveCofresBtn")?.addEventListener("click", saveCofresConfig);

  byId("generateMonthMovementsBtn")?.addEventListener("click", () => {
    runWithButtonLock("generateMonthMovementsBtn", generateMonthMovements);
  });

  byId("deleteMonthMovementsBtn")?.addEventListener("click", () => {
    runWithButtonLock("deleteMonthMovementsBtn", deleteMonthMovements);
  });

  byId("exportHistoryBtn")?.addEventListener("click", exportHistory);

  byId("importHistoryBtn")?.addEventListener("click", () => {
    byId("importHistoryInput")?.click();
  });

  byId("importHistoryInput")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    importHistoryFromFile(file);
    event.target.value = "";
  });
}

function bindEvents() {
  byId("createTripBtn")?.addEventListener("click", () => {
    runWithButtonLock("createTripBtn", createTripEvent);
  });

  byId("addTripExpenseBtn")?.addEventListener("click", () => {
    runWithButtonLock("addTripExpenseBtn", addTripExpense);
  });

  byId("filterType")?.addEventListener("change", renderAll);
  byId("filterOrigin")?.addEventListener("change", renderAll);
  byId("filterCategory")?.addEventListener("change", renderAll);

  bindSidebarNavigation();
  bindMonthNavigation();
  bindCofreTabs();
  bindAnalysisCategory();
  bindFieldValidationReset();
  bindRegistoActions();
  bindRegistoPreviewLive();
}

/* =========================
   RENDER ALL
========================= */

function renderAll() {
  const state = loadState();
  initializeCurrentMonth(state);
  saveState(state);

  renderActiveMonthLabel(state);
  renderOverview(state);
  renderRegistoView(state);
  renderTransactions(state);
  renderCofreSection(state);
  renderCategoryAnalysis(state);
  renderForecast(calculateMonthBalances(state, getSelectedMonthKey(state)));
  renderPoupancaChart(state);
  renderLazerView(state);
}

/* =========================
   INIT
========================= */

async function init() {
  const state = await initializeCloudState();
  initializeCurrentMonth(state);
  saveState(state);

  setTodayBadge();
  bindEvents();
  renderAll();

  setTimeout(() => {
    activateView(state.ui.currentView || "overviewView");
  }, 0);
}

init();