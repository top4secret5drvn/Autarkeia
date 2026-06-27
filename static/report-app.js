// report-app.js
// Полный реактивный генератор отчёта дисциплины на AIFrame.
// Это высокий уровень приложения: здесь происходят загрузка данных, рендер UI и
// связывание нескольких подсистем.
//
// Архитектурное направление:
//   - PROLOG: перенос правил бонусов, связей привычка↔биометрика/финансы и
//     вычислений `calculateFullStats` в `AIFrame.Rules` и чистые модули.
//   - LISP: UI уже описан в стиле S-выражений в `App()` и собирается `createElement`.
//     Это хорошее место для декларативного рендера, оставляем эту часть.
//   - SMALLTALK: `AIFrame.setState` и `Messenger` создают простую модель сообщений,
//     но пока её можно использовать аккуратно, не превращая всё в объектный хаос.
//   - REFAL: парсинг текстовых привычек должен сосредоточиться в `report-rules.js`.
//
// Что пока оставляем здесь:
//   - API-запросы и загрузку справочников из сервера
//   - управление состоянием экрана и побочные эффекты
//   - генерацию итогового текста отчёта из текущего состояния
//
// Что стоит перенести дальше:
//   - `calculateFullStats` → pure-статистика в `ReportRules` + Prolog-правила
//   - текстовые шаблоны отчёта → макросы / шаблонизатор уровня `App`
//   - правила разбора привычек → более чистую Refal-логику

// ========== Глобальные данные и утилиты ==========
let habitsCatalog = [];
let habitCombinations = [];
let habitBiometricLinks = [];
let habitFinanceLinks = [];
let autoBiometricBonuses = [];
let streaksData = {};
let allTimeTotals = null;

let currentBiometricData = { intakes: [], meals: [], measurements: [], activities: [], mental: [] };
let currentFinanceData = [];
let substancesCatalog = [];
let mealsCatalog = [];
let activitiesCatalog = [];
let measurementsCatalog = [];
let financeCategoriesMap = {};

async function fetchAPI(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!data || data.status !== 'success') throw new Error(data?.message || 'API Error');
  return data;
}

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

// ========== Загрузка справочников ==========
async function loadCatalogs() {
  const [habits, combos, hbLinks, hfLinks, autoBonuses, substances, meals, activities, measurements, categories] = 
    await Promise.all([
      fetchAPI('/api/habits/list').then(d => d.data),
      fetchAPI('/api/combinations/list').then(d => d.data),
      fetchAPI('/api/combinations/habit-biometric').then(d => d.data),
      fetchAPI('/api/combinations/habit-finance').then(d => d.data),
      fetchAPI('/api/combinations/biometric-characteristics').then(d => d.data),
      fetchAPI('/api/biometric_substances/list').then(d => d.data),
      fetchAPI('/api/biometric_meals/list?limit=500').then(d => d.data),
      fetchAPI('/api/biometric_physical_activity/list?limit=500').then(d => d.data),
      fetchAPI('/api/biometric_measurements/list?limit=500').then(d => d.data),
      fetchAPI('/api/finance_categories/list').then(d => d.data),
    ]);
  habitsCatalog = habits;
  habitCombinations = combos;
  habitBiometricLinks = hbLinks;
  habitFinanceLinks = hfLinks;
  autoBiometricBonuses = autoBonuses;
  substancesCatalog = substances;
  mealsCatalog = meals;
  activitiesCatalog = activities;
  measurementsCatalog = measurements;
  categories.forEach(c => { financeCategoriesMap[c.id] = c; });
}

async function loadStreaks() {
  try {
    const data = await fetchAPI('/api/stats/streaks');
    streaksData = {};
    Object.keys(data.streaks).forEach(habitId => {
      streaksData[habitId] = {
        current: data.streaks[habitId].current_streak,
        longest: data.streaks[habitId].max_streak
      };
    });
  } catch (e) { console.warn('loadStreaks', e); }
}

async function loadAllTimeTotals() {
  try {
    const resp = await fetchAPI('/api/stats/period?period=all');
    const stats = resp.stats || resp.data?.stats || resp;
    if (stats) {
      allTimeTotals = {
        I: Number(stats.sum_i || 0),
        S: Number(stats.sum_s || 0),
        W: Number(stats.sum_w || 0),
        E: Number(stats.sum_e || 0),
        C: Number(stats.sum_c || 0),
        H: Number(stats.sum_h || 0),
        ST: Number(stats.sum_st || 0),
        $: Number(stats.sum_money || 0)
      };
    }
  } catch (e) { console.warn('allTimeTotals', e); }
}

async function loadSkills() {
  try {
    const resp = await fetchAPI('/api/skills/with-levels');
    AIFrame.setState({ skills: resp.data ?? [] });
  } catch (e) {
    console.warn('loadSkills', e);
    AIFrame.setState({ skills: [] });
  }
}

async function loadPeriodStats(period) {
  try {
    const data = await fetchAPI(`/api/stats/period?period=${period}`);
    const state = AIFrame.state;
    AIFrame.setState({ periodStats: { ...state.periodStats, [period]: data } });
  } catch (e) { console.warn(`loadPeriodStats(${period})`, e); }
}

async function loadFinancePeriodStats(period) {
  try {
    const data = await fetchAPI(`/api/finance/stats?period=${period}`);
    const state = AIFrame.state;
    AIFrame.setState({ financePeriodStats: { ...state.financePeriodStats, [period]: data.data } });
  } catch (e) { console.warn(`loadFinancePeriodStats(${period})`, e); }
}

async function loadGoals(date) {
  try {
    const data = await fetchAPI(`/api/goals/progress?date=${date}`);
    AIFrame.setState({ goals: data.data ?? [] });
  } catch (e) { console.warn('loadGoals', e); }
}

// ========== Данные дня ==========
async function loadBiometricData(date) {
  currentBiometricData = { intakes: [], meals: [], measurements: [], activities: [], mental: [] };
  try {
    const [intakes, meals, measurements, activities, mental] = await Promise.all([
      fetchAPI(`/api/biometric_intake_log/list?date=${date}`).then(d => d.data),
      fetchAPI(`/api/biometric_meals/list?date=${date}`).then(d => d.data),
      fetchAPI(`/api/biometric_measurements/list?date=${date}`).then(d => d.data),
      fetchAPI(`/api/biometric_physical_activity/list?date=${date}`).then(d => d.data),
      fetchAPI(`/api/biometric_mental_daily/list?date=${date}`).then(d => d.data),
    ]);
    currentBiometricData = { intakes, meals, measurements, activities, mental };
  } catch (e) { console.warn('loadBiometricData', e); }
}

async function loadFinanceData(date) {
  currentFinanceData = [];
  try {
    const data = await fetchAPI(`/api/finance_transactions/list?date=${date}`);
    currentFinanceData = data.data;
  } catch (e) { console.warn('loadFinanceData', e); }
}


function getEvaluateContext() {
  return {
    friction: AIFrame.state.friction || 1,
    habitsCatalog,
    currentBiometricData,
    currentFinanceData,
    financeCategoriesMap
  };
}

// ========== Проверка активности связей ==========
function getHabitIdsFromParsed(parsed) {
  const map = {};
  parsed.forEach(item => {
    if (item.type === 'habit' && item.success) {
      const h = habitsCatalog.find(h => h.name === item.name && h.category === item.category);
      if (h) map[h.id] = true;
    }
  });
  return map;
}

function isCombinationActive(combo, parsedTasks = AIFrame.state?.parsedTasks || []) {
  const ids = getHabitIdsFromParsed(parsedTasks);
  return ids[combo.habit_a] && ids[combo.habit_b];
}

function biometricLinkMatches(link, biometricData) {
  if (!link || !biometricData) return false;
  const type = link.biometric_type;
  const id = link.biometric_id;
  const value = link.biometric_value;

  switch (type) {
    case 'substance': {
      const list = biometricData.intakes || [];
      if (id) return list.some(i => i.substance_id === id && i.taken);
      if (value) return list.some(i => (i.substance_name === value || String(i.substance_id) === String(value)) && i.taken);
      return list.some(i => i.taken);
    }
    case 'meal': {
      const list = biometricData.meals || [];
      if (id) return list.some(m => m.id === id);
      if (value) return list.some(m => m.meal_type === value || m.description === value);
      return list.length > 0;
    }
    case 'activity': {
      const list = biometricData.activities || [];
      if (id) return list.some(a => a.id === id);
      if (value) return list.some(a => a.activity_type === value || String(a.id) === String(value));
      return list.length > 0;
    }
    case 'measurement': {
      const list = biometricData.measurements || [];
      if (id) return list.some(m => m.id === id);
      if (value) return list.some(m => String(m.id) === String(value));
      return list.length > 0;
    }
    default:
      return false;
  }
}

function isBiometricLinkActive(link, parsedTasks = AIFrame.state?.parsedTasks || []) {
  const ids = getHabitIdsFromParsed(parsedTasks);
  if (!ids[link.habit_id]) return false;
  return biometricLinkMatches(link, currentBiometricData);
}

function isFinanceLinkActive(link, parsedTasks = AIFrame.state?.parsedTasks || []) {
  const ids = getHabitIdsFromParsed(parsedTasks);
  if (!ids[link.habit_id]) return false;
  let sum = 0;
  for (const tx of currentFinanceData) {
    const cat = financeCategoriesMap[tx.category_id];
    if (!cat) continue;
    if (link.finance_type === 'income_active' && cat.type === 'income' && cat.is_active) sum += tx.amount;
    else if (link.finance_type === 'income_passive' && cat.type === 'income' && !cat.is_active) sum += tx.amount;
    else if (link.finance_type === 'expense' && cat.type === 'expense') sum += tx.amount;
  }
  return sum >= (link.threshold || 0);
}

function isAutoBiometricBonusActive(bonus) {
  return biometricLinkMatches(bonus, currentBiometricData);
}

// ========== Сериализация ==========
function serializeParsed(parsed) {
  let text = '';
  let lastCat = null;
  for (const item of parsed) {
    if (item.type === 'category') {
      if (lastCat) text += '\n';
      text += item.text + '\n';
      text += '———————————————\n';
      lastCat = item.text;
    } else if (item.type === 'habit') {
      const sign = item.success ? '+' : '-';
      const qty = item.quantity ? ` — ${item.quantity} ${item.unit || ''}` : '';
      const stats = ReportRules.formatStats(item.stats);
      text += `${sign} ${item.name}${qty} ${stats}\n`;
    }
  }
  return text.trim();
}

function calculateStatSum(stats) {
  // Удобный хелпер для расчётов относительных долей и суммарного прогресса.
  // Это чистая функция, которая должна оставаться независимой от состояния UI.
  if (!stats) return 0;
  return ['I','S','W','E','C','H'].reduce((sum, key) => sum + (Number(stats[key]) || 0), 0);
}

function calculateImprovementPercent(daily, baseTotals) {
  const dailySum = calculateStatSum(daily);
  const baseSum = calculateStatSum(baseTotals);
  if (!baseSum) return dailySum;
  return (dailySum / baseSum) * 100;
}

// ========== Вычисления ==========
function computeDayNumber(state) {
  // Отдельная функция для вычисления номера дня отчёта на основе текущих
  // значений первого/последнего дня. Это важно, чтобы рендер и сохранение
  // использовали одну и ту же логику.
  const { reportDate, firstDate, firstDay, lastDate, lastDay } = state;
  const report = new Date(reportDate);
  const first = firstDate ? new Date(firstDate) : null;
  const fDay = parseInt(firstDay) || 1;
  if (first) return Math.max(1, fDay + daysBetween(first, report));
  const last = lastDate ? new Date(lastDate) : null;
  const lDay = parseInt(lastDay) || 1;
  if (last) return Math.max(1, lDay + daysBetween(last, report));
  return 1;
}

// ========== Действия с БД ==========
// Здесь находится transactional-уровень сохранения текущего отчёта и привычек.
// В идеале эта функция должна вызвать чистый command-объект или сервис,
// чтобы сам UI-код не заботился о том, как формируются API-пейлоады.
async function saveToDatabase(state) {
  const friction = state.friction;
  const parsed = state.parsedTasks;
  const totals = ReportRules.evaluate(parsed, getEvaluateContext());
  const dayNumber = computeDayNumber(state);
  
  const completionData = {
    date: state.reportDate,
    day_number: dayNumber,
    state: state.dayState,
    thoughts: state.thoughts,
    friction_index: friction,
    totals: totals
  };

  const existing = await fetchAPI(`/api/completions/list?date=${state.reportDate}`);
  let completionId;
  if (existing.data && existing.data.length > 0) {
    completionId = existing.data[0].id;
    await fetchAPI(`/api/completions/update/${completionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(completionData)
    });
  } else {
    const created = await fetchAPI('/api/completions/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(completionData)
    });
    completionId = created.data.id;
  }

  const oldHabits = await fetchAPI(`/api/completion_habits/list?completion_id=${completionId}`);
  for (const h of oldHabits.data) {
    await fetchAPI(`/api/completion_habits/delete/${h.id}`, { method: 'DELETE' });
  }

  for (const habit of parsed.filter(p => p.type === 'habit')) {
    const catalogHabit = habitsCatalog.find(h => h.name === habit.name && h.category === habit.category);
    const payload = {
      completion_id: completionId,
      habit_id: catalogHabit ? catalogHabit.id : null,
      name: habit.name,
      category: habit.category,
      success: habit.success ? 1 : 0,
      quantity: habit.quantity || null,
      unit: habit.unit || null,
      i: habit.stats.I, s: habit.stats.S, w: habit.stats.W,
      e: habit.stats.E, c: habit.stats.C, hh: habit.stats.H,
      st: habit.stats.ST, money: habit.stats.$
    };
    await fetchAPI('/api/completion_habits/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  const newState = { ...state };
  if (!state.firstDate) newState.firstDate = state.reportDate;
  if (!state.firstDay) newState.firstDay = dayNumber;
  newState.lastDate = state.reportDate;
  newState.lastDay = dayNumber;
  AIFrame.setState(newState);
  alert('✅ Сохранено в БД');

  fetchAPI(`/api/cognitive/hypotheses?date=${state.reportDate}`).then(data => {
    if (data.data && data.data.length > 0) {
      console.log('💡 Вердикт выдвинул гипотезы:', data.data);
      AIFrame.setState({ showAuditToast: true, auditHypotheses: data.data });
    }
  }).catch(e => console.warn('cognitive hypotheses', e));

  await loadDatesList();
  await loadAllTimeTotals();
}

// ========== Загрузка дат ==========
let availableDates = [];
async function loadDatesList() {
  try {
    const response = await fetchAPI('/api/completions/list');
    const dates = [...new Set(response.data.map(c => c.date))].sort().reverse();
    availableDates = dates;
    if (dates.length > 0 && !AIFrame.state.reportDate) {
      AIFrame.setState({ reportDate: dates[0] });
      await loadDayData(dates[0]);
    }
    AIFrame.setState({});
  } catch (e) { console.error('loadDatesList', e); }
}

async function loadDayData(date) {
  // Загрузка данных конкретного дня из бекенда и восстановление текста привычек.
  // Это важный узел, где данные приходят из разных API и собираются в одно состояние.
  try {
    const dayResp = await fetchAPI(`/api/completions/list?date=${date}`);
    if (!dayResp.data || !dayResp.data.length) return;
    const day = dayResp.data[0];
    const habitsResp = await fetchAPI(`/api/completion_habits/list?completion_id=${day.id}`);
    const habits = habitsResp.data || [];

    let text = '';
    let currentCategory = null;
    for (const h of habits) {
      if (h.category !== currentCategory) {
        currentCategory = h.category;
        text += `${h.category}\n———————————————\n`;
      }
      const sign = h.success ? '+' : '-';
      const qty = h.quantity ? ` — ${h.quantity} ${h.unit || ''}` : '';
      const statsStr = `I[${h.i || 0}] S[${h.s || 0}] W[${h.w || 0}] E[${h.e || 0}] C[${h.c || 0}] H[${h.hh || 0}] ST[${h.st || 0}] $[${h.money || 0}]`;
      text += `${sign} ${h.name}${qty} ${statsStr}\n`;
    }

    await loadBiometricData(date);
    await loadFinanceData(date);

    const newState = {
      tasksText: text,
      parsedTasks: ReportRules.parseText(text),
      reportDate: date,
      friction: day.friction_index || 1,
      thoughts: day.thoughts || '',
      dayState: day.state || 'WORK',
      lastDate: date,
      lastDay: String(day.day_number || '')
    };
    AIFrame.setState(newState);
    loadGoals(date);
    loadPeriodStats('week');
    loadPeriodStats('month');
    loadPeriodStats('all');
    loadFinancePeriodStats('week');
    loadFinancePeriodStats('month');
    loadFinancePeriodStats('all');
  } catch (e) { console.error('loadDayData', e); }
}

function applyReportStyle(rawReport) {
  // Локальные правила форматирования — не трогают глобальный AIFrame.Refal.rules
  const localRules = [
    { pattern: /^ХАРАКТЕРИСТИКИ:/gm,  replacement: '\n=== ХАРАКТЕРИСТИКИ ===' },
    { pattern: /^ПРИВЫЧКИ:/gm,        replacement: '\n=== ПРИВЫЧКИ ===' },
    { pattern: /^ФИНАНСЫ:/gm,         replacement: '\n=== ФИНАНСЫ (сегодня) ===' },
    { pattern: /^КАЛОРИИ:/gm,          replacement: '\n=== КАЛОРИИ ===' },
    { pattern: /^НАВЫКИ:/gm,           replacement: '\n=== НАВЫКИ ===' },
    { pattern: /^ЦЕЛИ:/gm,             replacement: '\n=== ЦЕЛИ ===' },
    { pattern: /^ВЕЩЕСТВА:/gm,         replacement: '\n=== ПРИНЯТЫЕ ВЕЩЕСТВА ===' },
    { pattern: /^РАЦИОН:/gm,           replacement: '\n=== РАЦИОН ===' },
    { pattern: /^ИЗМЕРЕНИЯ:/gm,        replacement: '\n=== ИЗМЕРЕНИЯ ===' },
    { pattern: /^АКТИВНОСТЬ:/gm,       replacement: '\n=== ФИЗ. АКТИВНОСТЬ ===' },
    { pattern: /^МЕНТАЛЬНЫЕ:/gm,       replacement: '\n=== МЕНТАЛЬНЫЕ ПОКАЗАТЕЛИ ===' },
    { pattern: /^📅/gm,                replacement: '📅 Дата: ' },
    { pattern: /^📈/gm,                replacement: '📈 День: ' },
    { pattern: /^ТРЕНИЕ:/gm,          replacement: '⚙️ Трение: ' },
    { pattern: /^СТАТУС:/gm,          replacement: '🧾 Статус: ' },
    { pattern: /^ВЫПОЛНЕНО:/gm,       replacement: '✅ Выполнено: ' },
    { pattern: /^КОММЕНТАРИЙ:/gm,     replacement: '\n=== КОММЕНТАРИЙ ===\n' },
    { pattern: /^Доход:/gm,            replacement: 'Доход: ' },
    { pattern: /^Расход:/gm,           replacement: 'Расход: ' },
    { pattern: /^Net:/gm,              replacement: 'Чистая прибыль: ' },
    { pattern: /(\d+(?:\.\d+)?) ккал/g, replacement: '🔥 $1 ккал' },
    { pattern: /Сожжено:/gm,           replacement: '🔥 Потрачено: ' },
    { pattern: /Получено:/gm,          replacement: '🍽 Получено: ' },
    { pattern: /Баланс:/gm,            replacement: '⚖️ Баланс: ' },
    { pattern: /---/g,                 replacement: '━━━━━━' }
  ];

  return AIFrame.Refal.applyWith(rawReport, localRules);
}

// ========== Генерация отчёта ==========
// Здесь собираются все данные отчёта в один сырой текст, а затем он
// форматируется через Refal-правила. Это чисто вычислительная часть,
// которую легко отделить от рендера UI.
function generateFullReport(state) {
  const { parsedTasks, friction, thoughts, reportDate, dayState, skills, goals } = state;
  const dayNumber = computeDayNumber(state);
  const context = getEvaluateContext();
  const totals = ReportRules.evaluate(parsedTasks, context);
  const habitsList = parsedTasks.filter(t => t.type === 'habit');
  const completed = habitsList.filter(t => t.success).length;
  const total = habitsList.length;
  const percent = total ? Math.round((completed / total) * 100) : 0;

  // ---------- сырой текст с метками ----------
  let raw = `📅${reportDate}\n📈День:${dayNumber}\n`;
  raw += `ТРЕНИЕ:${friction}\n`;
  raw += `СТАТУС:${dayState}\n`;
  raw += `ВЫПОЛНЕНО:${completed}/${total} ${percent}%\n`;

  // Стрики
  const streaksActive = [];
  for (const [id, s] of Object.entries(streaksData)) {
    if (s.current > 0) {
      const habit = habitsCatalog.find(h => h.id == id);
      streaksActive.push(`${habit?.name || id} 🔥${s.current}`);
    }
  }
  raw += `СТРИКИ:${streaksActive.length ? streaksActive.join(', ') : 'нет'}\n`;

  // Характеристики
  raw += `ХАРАКТЕРИСТИКИ:\n`;
  for (const k of ['I','S','W','E','C','H','ST','$']) {
    const val = totals[k].toFixed(2);
    const allTimeVal = allTimeTotals ? allTimeTotals[k].toFixed(2) : '—';
    raw += `${k}:${val}|${allTimeVal}\n`;
  }

  const daySum = ReportRules.calculateStatSum(totals);
  const allTimeSum = allTimeTotals ? ReportRules.calculateStatSum(allTimeTotals) : null;
  const totalProgressLabel = daySum.toFixed(2);
  raw += `УЛУЧШЕНИЕ:+%${totalProgressLabel}\n`;
  if (allTimeSum !== null) {
    raw += `ДОЛЯ В ОБЩЕМ ПРОГРЕССЕ:${allTimeSum > 0 ? (daySum / allTimeSum * 100).toFixed(2) : '—'}%\n`;
  }

  // Комментарий
  if (thoughts) {
    raw += `КОММЕНТАРИЙ:\n${thoughts}\n`;
  }

  // Привычки по категориям
  raw += `ПРИВЫЧКИ:\n`;
  for (const item of parsedTasks) {
    if (item.type === 'category') {
      raw += `КАТЕГОРИЯ:${item.text}\n`;
    } else if (item.type === 'habit') {
      const sign = item.success ? '✅ +' : '❌ -';
      const qty = item.quantity ? ` — ${item.quantity} ${item.unit || ''}` : '';
      const streak = (() => {
        const h = habitsCatalog.find(x => x.name === item.name && x.category === item.category);
        return h && streaksData[h.id] ? streaksData[h.id].current : 0;
      })();
      raw += `${sign} ${item.name}${qty}${streak ? ' 🔥'+streak : ''}\n`;
    }
  }

  // === СВЯЗИ МЕЖДУ МОДУЛЯМИ ===
  const activeCombos = habitCombinations.filter(combo => isCombinationActive(combo, parsedTasks));
  const activeBioLinks = habitBiometricLinks.filter(link => isBiometricLinkActive(link, parsedTasks));
  const activeFinanceLinks = habitFinanceLinks.filter(link => isFinanceLinkActive(link, parsedTasks));
  const activeAutoBonuses = autoBiometricBonuses.filter(isAutoBiometricBonusActive);

  if (activeCombos.length || activeBioLinks.length || activeFinanceLinks.length || activeAutoBonuses.length) {
    raw += `СВЯЗИ:\n`;
    if (activeCombos.length) {
      raw += `Сочетания привычек:\n`;
      activeCombos.forEach(c => {
        const a = habitsCatalog.find(h => h.id === c.habit_a);
        const b = habitsCatalog.find(h => h.id === c.habit_b);
        raw += `${c.name || 'Без названия'}: ${a?.name || '?'} + ${b?.name || '?'} → I[${c.i.toFixed(2)}] S[${c.s.toFixed(2)}] W[${c.w.toFixed(2)}] E[${c.e.toFixed(2)}] C[${c.c.toFixed(2)}] H[${c.h.toFixed(2)}] ST[${c.st.toFixed(2)}] $[${c.money.toFixed(2)}]\n`;
      });
    }
  if (activeBioLinks.length) {
    raw += `Привычка ↔ биометрика:\n`;
    activeBioLinks.forEach(link => {
      const habit = habitsCatalog.find(h => h.id === link.habit_id);
      let bioName = link.biometric_type; // на случай, если тип неизвестен

      switch (link.biometric_type) {
        case 'substance':
          if (link.biometric_id) {
            const sub = substancesCatalog.find(s => s.id === link.biometric_id);
            bioName = sub ? sub.name : `Вещество #${link.biometric_id}`;
          } else if (link.biometric_value) {
            bioName = link.biometric_value;
          } else {
            bioName = 'все вещества';
          }
          break;
        case 'meal':
          if (link.biometric_id) {
            const meal = mealsCatalog.find(m => m.id === link.biometric_id);
            bioName = meal ? `${meal.date} ${meal.meal_type}` : `Приём #${link.biometric_id}`;
          } else if (link.biometric_value) {
            bioName = link.biometric_value;
          } else {
            bioName = 'все приёмы пищи';
          }
          break;
        case 'activity':
          if (link.biometric_id) {
            const act = activitiesCatalog.find(a => a.id === link.biometric_id);
            bioName = act ? `${act.date} ${act.activity_type}` : `Активность #${link.biometric_id}`;
          } else if (link.biometric_value) {
            bioName = link.biometric_value;
          } else {
            bioName = 'все активности';
          }
          break;
        case 'measurement':
          if (link.biometric_id) {
            const meas = measurementsCatalog.find(m => m.id === link.biometric_id);
            bioName = meas ? meas.date : `Измерение #${link.biometric_id}`;
          } else if (link.biometric_value) {
            bioName = link.biometric_value;
          } else {
            bioName = 'все измерения';
          }
          break;
        default:
          bioName = link.biometric_type || 'биометрика';
      }

      const bonusStr = `I[${link.bonus_i.toFixed(2)}] S[${link.bonus_s.toFixed(2)}] W[${link.bonus_w.toFixed(2)}] E[${link.bonus_e.toFixed(2)}] C[${link.bonus_c.toFixed(2)}] H[${link.bonus_h.toFixed(2)}] ST[${link.bonus_st.toFixed(2)}] $[${link.bonus_money.toFixed(2)}]`;
      raw += `${habit?.name || '?'} ↔ ${bioName} → ${bonusStr}\n`;
    });
  }
    if (activeFinanceLinks.length) {
      raw += `Привычка ↔ финансы:\n`;
      activeFinanceLinks.forEach(link => {
        const habit = habitsCatalog.find(h => h.id === link.habit_id);
        raw += `${habit?.name || '?'} ↔ ${link.finance_type}, порог ${link.threshold} → I[${link.bonus_i.toFixed(2)}] S[${link.bonus_s.toFixed(2)}] W[${link.bonus_w.toFixed(2)}] E[${link.bonus_e.toFixed(2)}] C[${link.bonus_c.toFixed(2)}] H[${link.bonus_h.toFixed(2)}] ST[${link.bonus_st.toFixed(2)}] $[${link.bonus_money.toFixed(2)}]\n`;
      });
    }
    if (activeAutoBonuses.length) {
      raw += `Автобонусы биометрики:\n`;
      activeAutoBonuses.forEach(bonus => {
        raw += `${bonus.biometric_type} → I[${bonus.bonus_i.toFixed(2)}] S[${bonus.bonus_s.toFixed(2)}] W[${bonus.bonus_w.toFixed(2)}] E[${bonus.bonus_e.toFixed(2)}] C[${bonus.bonus_c.toFixed(2)}] H[${bonus.bonus_h.toFixed(2)}] ST[${bonus.bonus_st.toFixed(2)}] $[${bonus.bonus_money.toFixed(2)}]\n`;
      });
    }
  }

  // Финансы (сегодня)
  if (currentFinanceData.length > 0) {
    let income = 0, expense = 0;
    currentFinanceData.forEach(tx => {
      const cat = financeCategoriesMap[tx.category_id];
      if (cat?.type === 'income') income += tx.amount;
      else expense += tx.amount;
    });
    raw += `ФИНАНСЫ:\n`;
    raw += `Доход:${income.toFixed(2)}\n`;
    raw += `Расход:${expense.toFixed(2)}\n`;
    raw += `Net:${(income - expense).toFixed(2)}\n`;
  }

  // Калории
  let calsBurned = 0, calsIntake = 0;
  currentBiometricData.activities?.forEach(a => calsBurned += a.quantity * (a.calories_per_unit || 0));
  currentBiometricData.meals?.forEach(m => calsIntake += m.calories || 0);
  raw += `КАЛОРИИ:\n`;
  raw += `Сожжено:${calsBurned.toFixed(0)} ккал\n`;
  raw += `Получено:${calsIntake.toFixed(0)} ккал\n`;
  raw += `Баланс:${(calsIntake - calsBurned).toFixed(0)} ккал\n`;

  // Навыки
  if (skills && skills.length > 0) {
    raw += `НАВЫКИ:\n`;
    for (const s of skills) {
      raw += `📖 ${s.name}: уровень ${s.level} (${s.level_name}), всего ${s.total_hours.toFixed(1)} ч, прогресс ${s.progress_percent.toFixed(1)}%\n`;
      if (s.description) raw += `   Описание: ${s.description}\n`;
    }
  }

  // Цели
  if (goals && goals.length > 0) {
    raw += `ЦЕЛИ:\n`;
    for (const g of goals) {
      raw += `🎯 ${g.name}: ${g.current}/${g.target} (${g.percent}%)\n`;
      raw += `   Период: ${g.start_date} – ${g.end_date}\n`;
      if (g.description) raw += `   Описание: ${g.description}\n`;
    }
  }

  // Принятые вещества
  if (currentBiometricData.intakes?.length) {
    raw += `ВЕЩЕСТВА:\n`;
    currentBiometricData.intakes.forEach(i => {
      const sub = substancesCatalog.find(s => s.id === i.substance_id);
      const status = i.taken ? '✓' : '✗';
      raw += `${sub ? sub.name : `Вещество #${i.substance_id}`}: ${status}\n`;
    });
  }

  // Рацион
  if (currentBiometricData.meals?.length) {
    raw += `РАЦИОН:\n`;
    currentBiometricData.meals.forEach(m => {
      const mealType = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' }[m.meal_type] || m.meal_type;
      raw += `${mealType}: ${m.description || ''}${m.calories ? ` (${m.calories} ккал)` : ''}\n`;
      if (m.notes) raw += `  Примечание: ${m.notes}\n`;
    });
  }

  // Измерения
  if (currentBiometricData.measurements?.length) {
    raw += `ИЗМЕРЕНИЯ:\n`;
    currentBiometricData.measurements.forEach(m => {
      const parts = [];
      if (m.weight) parts.push(`Вес: ${m.weight} кг`);
      if (m.body_fat_percent) parts.push(`% жира: ${m.body_fat_percent}`);
      if (m.muscle_mass) parts.push(`Мышечная масса: ${m.muscle_mass} кг`);
      if (m.heart_rate) parts.push(`Пульс: ${m.heart_rate}`);
      if (m.blood_pressure_systolic && m.blood_pressure_diastolic) parts.push(`Давление: ${m.blood_pressure_systolic}/${m.blood_pressure_diastolic}`);
      if (parts.length) raw += parts.join(', ') + '\n';
      if (m.notes) raw += `  Примечание: ${m.notes}\n`;
    });
  }

  // Физическая активность
  if (currentBiometricData.activities?.length) {
    raw += `АКТИВНОСТЬ:\n`;
    currentBiometricData.activities.forEach(a => {
      raw += `${a.activity_type}: ${a.quantity}${a.intensity ? ` (интенсивность ${a.intensity}/10)` : ''}\n`;
      if (a.notes) raw += `  Примечание: ${a.notes}\n`;
    });
  }

  // Ментальные показатели
  if (currentBiometricData.mental?.length) {
    raw += `МЕНТАЛЬНЫЕ:\n`;
    currentBiometricData.mental.forEach(m => {
      const fields = [];
      if (m.focus) fields.push(`Фокус: ${m.focus}/10`);
      if (m.attention) fields.push(`Внимание: ${m.attention}/10`);
      if (m.thinking_speed) fields.push(`Быстрота мышления: ${m.thinking_speed}/10`);
      if (m.energy) fields.push(`Энергия: ${m.energy}/10`);
      if (m.mood) fields.push(`Настроение: ${m.mood}/10`);
      if (m.thinking_type) fields.push(`Тип мышления: ${m.thinking_type}`);
      raw += fields.join(', ') + '\n';
      if (m.notes) raw += `  Примечание: ${m.notes}\n`;
    });
  }

  // Периодная статистика (можно добавить при желании, но обычно она рендерится в UI)
  // В отчёте, как в старом, была только "За всё время". Оставим только её.
  // Уже выведено в характеристиках через allTimeTotals.

  // Применяем стили через Рефал
  return applyReportStyle(raw);
}

// ========== Вспомогательные действия ==========
function addHabitFromCatalog(habit) {
  // Добавление привычки из справочника в текущий день.
  // ECS-подход здесь не нужен, но это образец операции "action -> state".
  const state = AIFrame.state;
  const category = habit.category || 'Без категории';
  const stats = {
    I: habit.i || 0, S: habit.s || 0, W: habit.w || 0,
    E: habit.e || 0, C: habit.c || 0, H: habit.h || 0,
    ST: habit.st || 0, $: habit.money || 0
  };
  const newHabit = {
    type: 'habit',
    name: habit.name,
    category,
    success: true,
    quantity: habit.default_quantity || null,
    unit: habit.unit || null,
    stats
  };

  let parsed = [...state.parsedTasks];
  let catIdx = parsed.findIndex(p => p.type === 'category' && p.text === category);
  if (catIdx === -1) {
    parsed.push({ type: 'category', text: category });
    catIdx = parsed.length - 1;
  }
  let insertPos = catIdx + 1;
  while (insertPos < parsed.length && parsed[insertPos].type === 'habit') insertPos++;
  parsed.splice(insertPos, 0, newHabit);

  AIFrame.setState({ parsedTasks: parsed, tasksText: serializeParsed(parsed), showCatalogModal: false });
}

async function addHabitToCatalog(habit) {
  const data = {
    name: habit.name,
    category: habit.category || 'Без категории',
    default_quantity: habit.quantity,
    unit: habit.unit,
    i: habit.stats.I, s: habit.stats.S, w: habit.stats.W,
    e: habit.stats.E, c: habit.stats.C, h: habit.stats.H,
    st: habit.stats.ST, money: habit.stats.$
  };
  await fetchAPI('/api/habits/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  // Перезагружаем каталог и обновляем состояние
  const habits = await fetchAPI('/api/habits/list').then(d => d.data);
  habitsCatalog = habits;
  AIFrame.setState({}); // перерисовка
  alert('✓ Добавлено в справочник');
}


// ========== Рендеринг приложения ==========
// Функция возвращает дерево S-выражений. Это уже LISP-подход к UI,
// который хорошо сочетается с `AIFrame.createElement`.
// ========== Вспомогательные компоненты для UI ==========
function StatCard(key, value) {
  return ['div', { className: 'stat-tile' },
    ['div', { className: 'stat-tile__label' }, key],
    ['div', { className: 'stat-tile__value' }, Number(value).toFixed(2)]
  ];
}

function SectionHeader(title, actions = null) {
  return ['div', { className: 'section-header' },
    ['h3', { className: 'section-header__title' }, title],
    actions ? ['div', { className: 'section-header__actions' }, actions] : null
  ];
}

function PillButton(label, onClick, primary = false) {
  return ['button', {
    className: `pill-btn ${primary ? 'pill-btn--primary' : ''}`,
    onClick
  }, label];
}

// ========== Основной рендер ==========
async function loadCognitiveAudit(date = AIFrame.state.reportDate) {
  try {
    const [analysis, synergies, hypotheses] = await Promise.all([
      fetchAPI(`/api/cognitive/analyze?date=${date}`),
      fetchAPI(`/api/cognitive/synergies?date=${date}&days=30`),
      fetchAPI(`/api/cognitive/hypotheses?date=${date}`)
    ]);
    AIFrame.setState({
      auditAnalysis: analysis.data || null,
      auditSynergies: synergies.data || [],
      auditHypotheses: hypotheses.data || [],
      activeReportTab: 'audit',
      showReport: false
    });
  } catch (e) {
    console.warn('loadCognitiveAudit', e);
    AIFrame.setState({
      auditError: e.message || String(e),
      auditAnalysis: null,
      auditSynergies: [],
      auditHypotheses: [],
      activeReportTab: 'audit',
      showReport: false
    });
  }
}

async function applyAuditSynergy(synergy) {
  try {
    await fetchAPI('/api/cognitive/apply_synergy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `MDL: ${(synergy.pattern || []).join(' + ')}`,
        proposal: synergy.proposal,
        habit_ids: synergy.habit_ids || []
      })
    });
    alert('✅ Синергия отправлена в сочетания');
  } catch (e) {
    alert(`⚠️ Не удалось применить синергию: ${e.message}`);
  }
}

async function confirmAuditHypothesis(hypothesis, confirmed) {
  try {
    await fetchAPI('/api/cognitive/confirm_hypothesis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hypothesis_id: hypothesis.id, confirmed })
    });
    AIFrame.setState({
      auditHypotheses: (AIFrame.state.auditHypotheses || []).filter(h => h.id !== hypothesis.id)
    });
  } catch (e) {
    alert(`⚠️ Не удалось сохранить ответ: ${e.message}`);
  }
}

function App(state) {
  const {
    tasksText, parsedTasks, friction, thoughts, reportDate, dayState,
    firstDay, firstDate, lastDay, lastDate,
    showReport, showCatalogModal, showEditModal, editHabitIndex,
    activeReportTab, habitSearch, skills, periodStats, financePeriodStats, goals,
    auditAnalysis, auditSynergies, auditHypotheses, auditError, showAuditToast
  } = state;

  const activeTab = activeReportTab || 'plan';
  const showReportPanel = activeTab === 'report' || showReport;

  const dayNumber = computeDayNumber(state);
  const habitsList = parsedTasks.filter(t => t.type === 'habit');
  const completed = habitsList.filter(t => t.success).length;
  const total = habitsList.length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  const totals = ReportRules.evaluate(parsedTasks, getEvaluateContext());
  const totalProgress = allTimeTotals ? calculateStatSum(allTimeTotals) : null;
  const reportOutputText = showReportPanel ? generateFullReport(state) : '';

  const dateOptions = availableDates.map(d => ['option', { value: d }, d]);
  const filteredCatalog = habitsCatalog.filter(h => {
    if (!habitSearch) return true;
    return h.name.toLowerCase().includes(habitSearch.toLowerCase()) || h.category.toLowerCase().includes(habitSearch.toLowerCase());
  });

  return ['div', { id: 'app', className: 'dashboard' },
    // Верхняя панель (день, дата, состояние) – компактная строка
    ['div', { className: 'top-bar' },
      ['div', { className: 'top-bar__item' },
        ['label', { className: 'top-bar__label' }, 'Отчёт за'],
        ['input', {
          type: 'date', value: reportDate,
          className: 'top-bar__date-input',
          onChange: async (e) => {
            const newDate = e.target.value;
            await loadDayData(newDate);
          }
        }]
      ],
      ['div', { className: 'top-bar__item' },
        ['label', { className: 'top-bar__label' }, 'День №'],
        ['span', { className: 'top-bar__value' }, dayNumber]
      ],
      ['div', { className: 'top-bar__item' },
        ['label', { className: 'top-bar__label' }, 'Состояние'],
        ['select', {
          value: dayState, className: 'top-bar__select',
          onChange: (e) => AIFrame.setState({ dayState: e.target.value })
        },
          ['option', { value: 'WORK' }, 'WORK'],
          ['option', { value: 'VAC' }, 'VAC'],
          ['option', { value: 'SICK' }, 'SICK'],
          ['option', { value: 'OTHER' }, 'OTHER']
        ]
      ],
      ['div', { className: 'top-bar__item' },
        ['label', { className: 'top-bar__label' }, 'Трение'],
        ['input', {
          type: 'range', min: '1', max: '10', value: friction,
          className: 'top-bar__range',
          onChange: (e) => AIFrame.setState({ friction: parseInt(e.target.value, 10) })
        }],
        ['span', { className: 'top-bar__range-val' }, friction]
      ],
      ['div', { className: 'top-bar__item top-bar__progress' },
        ['span', { className: 'top-bar__done' }, `✅ ${completed}/${total}`],
        ['div', { className: 'mini-progress' },
          ['div', { className: 'mini-progress__fill', style: `width:${percent}%` }]
        ],
        ['span', { className: 'top-bar__pct' }, `${percent}%`]
      ]
    ],

    ['div', { className: 'retro-tab-bar' },
      ['button', { className: `retro-tab ${activeTab === 'plan' ? 'active' : ''}`, onClick: () => AIFrame.setState({ activeReportTab: 'plan', showReport: false }) }, 'План'],
      ['button', { className: `retro-tab ${activeTab === 'stats' ? 'active' : ''}`, onClick: () => AIFrame.setState({ activeReportTab: 'stats' }) }, 'Характеристики'],
      ['button', { className: `retro-tab ${activeTab === 'report' ? 'active' : ''}`, onClick: () => AIFrame.setState({ activeReportTab: 'report', showReport: true }) }, 'Отчёт'],
      ['button', { className: `retro-tab ${activeTab === 'audit' ? 'active' : ''}`, onClick: () => loadCognitiveAudit(reportDate) }, '🧠 Аудит']
    ],

    ['div', { className: 'retro-panel' },
      (activeTab === 'plan' || activeTab === 'stats') ? ['div', { className: 'main-panels' },
        ['div', { className: 'panel panel--left' },
          SectionHeader('Привычки', PillButton('📋 Пример', () => {
            const sample = `Здоровье
———————————————
+ Упражнения — 30 мин I[0.01] S[0.02] W[0.03] E[0] C[0] H[0.05] ST[1] $[0]
+ Пить воду — 2л I[0] S[0] W[0.01] E[0] C[0] H[0.02] ST[1] $[0]

Развитие
———————————————
+ Чтение — 30 страниц I[0.02] S[0] W[0] E[0.01] C[0.01] H[0] ST[1] $[0]`;
            AIFrame.setState({ tasksText: sample, parsedTasks: ReportRules.parseText(sample), thoughts: 'Продуктивный день!' });
          })),
          ['textarea', {
            id: 'tasksTextarea', value: tasksText,
            className: 'habit-textarea',
            placeholder: 'Вставьте список привычек (формат: Категория / +Привычка — 30 мин I[0.1]...)',
            onInput: (e) => {
              const newText = e.target.value;
              AIFrame.setState({ tasksText: newText, parsedTasks: ReportRules.parseText(newText) });
            }
          }],

          ['label', { className: 'thoughts-label' }, '💭 Комментарий дня'],
          ['textarea', {
            id: 'thoughtsTextarea', value: thoughts,
            className: 'thoughts-area',
            placeholder: 'Как прошёл день...',
            onInput: (e) => AIFrame.setState({ thoughts: e.target.value })
          }],

          ['div', { className: 'habit-list' },
            ...parsedTasks.map((task, idx) => {
              if (task.type === 'category') {
                return ['div', { className: 'habit-category' }, task.text];
              }
              const catalogHabit = habitsCatalog.find(h => h.name === task.name && h.category === task.category);
              const streak = catalogHabit && streaksData[catalogHabit.id]?.current;
              return ['div', {
                className: `habit-row ${task.success ? 'habit-row--done' : ''}`
              },
                ['button', {
                  className: 'habit-toggle',
                  onClick: () => {
                    const newTasks = [...parsedTasks];
                    newTasks[idx].success = !newTasks[idx].success;
                    AIFrame.setState({ parsedTasks: newTasks, tasksText: serializeParsed(newTasks) });
                  }
                }, task.success ? '[+]' : '[-]'],
                ['span', { className: 'habit-name' }, task.name],
                task.quantity ? ['span', { className: 'habit-quantity' }, `${task.quantity}${task.unit || ''}`] : null,
                streak ? ['span', { className: 'habit-streak' }, `🔥${streak}`] : null,
                ['div', { className: 'habit-actions' },
                  !catalogHabit ? ['button', { className: 'icon-btn', title: 'Добавить в справочник', onClick: () => addHabitToCatalog(task) }, '+BD'] : null,
                  ['button', { className: 'icon-btn', onClick: () => AIFrame.setState({ showEditModal: true, editHabitIndex: idx }) }, '✎'],
                  ['button', { className: 'icon-btn', onClick: () => {
                    const newTasks = [...parsedTasks];
                    newTasks.splice(idx, 1);
                    AIFrame.setState({ parsedTasks: newTasks, tasksText: serializeParsed(newTasks) });
                  }}, '×']
                ]
              ];
            })
          ]
        ],

      ['div', { className: 'panel panel--right' },
        // Карточка текущих характеристик
        ['div', { className: 'card stats-card' },
          SectionHeader('Характеристики дня'),
          ['div', { className: 'stats-grid' },
            ...Object.keys(totals).map(key => StatCard(key, totals[key]))
          ]
        ],

        // Кнопки действий (плитки)
        ['div', { className: 'actions-grid' },
          PillButton('📋 Сформировать отчёт', () => AIFrame.setState({ showReport: true, activeReportTab: 'report' }), true),
          PillButton('💾 Сохранить в БД', () => saveToDatabase(state)),
          PillButton('💾 В local storage', () => {
            const data = { tasksText, firstDay, firstDate, lastDay, lastDate, reportDate, dayState, thoughts, friction };
            localStorage.setItem('disciplineReport', JSON.stringify(data));
            alert('✅ Сохранено в localStorage');
          }),
          PillButton('📂 Загрузить из LS', () => {
            const saved = JSON.parse(localStorage.getItem('disciplineReport') || '{}');
            if (saved.tasksText) AIFrame.setState({
              tasksText: saved.tasksText,
              parsedTasks: ReportRules.parseText(saved.tasksText),
              firstDay: saved.firstDay || '1',
              firstDate: saved.firstDate || '',
              lastDay: saved.lastDay || '',
              lastDate: saved.lastDate || '',
              reportDate: saved.reportDate || toISODate(new Date()),
              dayState: saved.state || 'WORK',
              thoughts: saved.thoughts || '',
              friction: saved.friction || 1
            });
          }),
          PillButton('➕ Из справочника', () => AIFrame.setState({ showCatalogModal: true })),
          PillButton('🗑 Очистить', () => AIFrame.setState({ tasksText: '', parsedTasks: [], thoughts: '' }))
        ],

        // Загрузка дня из БД
        ['div', { className: 'card load-day-card' },
          ['label', null, '📅 Загрузить сохранённый день'],
          ['select', {
            className: 'load-day-select',
            onChange: (e) => { if (e.target.value) loadDayData(e.target.value); }
          },
            ['option', { value: '' }, 'Выберите дату'],
            ...dateOptions
          ]
        ],

        // Навыки (если есть)
        (skills && skills.length > 0) ? ['div', { className: 'card skills-card' },
          SectionHeader('🧠 Навыки'),
          ...skills.map(s => ['div', { className: 'skill-row' },
            ['div', { className: 'skill-row__name' }, s.name],
            ['div', { className: 'skill-row__level' }, `Ур. ${s.level} (${s.level_name})`],
            ['progress', { className: 'skill-progress', value: s.progress_percent, max: 100 }],
            ['span', { className: 'skill-row__pct' }, `${s.progress_percent.toFixed(1)}%`]
          ])
        ] : null,

        // Цели
        (goals && goals.length > 0) ? ['div', { className: 'card goals-card' },
          SectionHeader('🎯 Цели'),
          ...goals.map(g => ['div', { className: 'goal-row' },
            ['div', { className: 'goal-row__name' }, g.name],
            ['progress', { className: 'goal-progress', value: g.current, max: g.target }],
            ['span', { className: 'goal-row__value' }, `${g.current}/${g.target}`]
          ])
        ] : null,

        // Статистика за период
        (() => {
          if (periodStats && (periodStats.week || periodStats.month)) {
            return ['div', { className: 'card period-card' },
              SectionHeader('📊 Статистика за периоды',
                ['div', { className: 'period-btns' },
                  ['button', { onClick: () => loadPeriodStats('week') }, '7д'],
                  ['button', { onClick: () => loadPeriodStats('month') }, '30д'],
                  ['button', { onClick: () => loadPeriodStats('all') }, 'Все']
                ]
              ),
              periodStats.week ? ['div', { className: 'period-stat' }, `Неделя: дней ${periodStats.week.stats?.days_count || 0}, I ${Number(periodStats.week.stats?.avg_i || 0).toFixed(2)}`] : null,
              periodStats.month ? ['div', { className: 'period-stat' }, `Месяц: дней ${periodStats.month.stats?.days_count || 0}, I ${Number(periodStats.month.stats?.avg_i || 0).toFixed(2)}`] : null
            ];
          }
          return null;
        })()
      ], // конец панели panel--right

    ] : null, // конец main-panels

    // Сгенерированный отчёт (раскрывается внизу)
    showReportPanel ? ['div', { className: 'report-panel card' },
      ['div', { className: 'report-panel__header' },
        ['h2', null, '📄 Сформированный отчёт'],
        ['div', null,
          ['button', { className: 'pill-btn', onClick: () => navigator.clipboard.writeText(reportOutputText) }, '📋 Копировать'],
          ['button', { className: 'pill-btn', onClick: () => {
            const blob = new Blob([reportOutputText], {type: 'text/plain'});
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `report_${reportDate}.txt`;
            a.click();
          }}, '📥 Скачать TXT']
        ]
      ],
      ['pre', { className: 'report-body' }, reportOutputText]
    ] : null,


    activeTab === 'audit' ? ['div', { className: 'audit-panel card' },
      SectionHeader('🧠 Когнитивный Аудит',
        ['button', { className: 'pill-btn', onClick: () => loadCognitiveAudit(reportDate) }, '↻ Обновить']
      ),
      auditError ? ['div', { className: 'audit-error' }, `⚠️ ${auditError}`] : null,
      ['div', { className: 'audit-grid' },
        ['div', { className: 'card audit-card' },
          ['h3', null, '🧬 Синергии MDL'],
          ...(auditSynergies && auditSynergies.length ? auditSynergies.map(synergy =>
            ['div', { className: 'audit-item' },
              ['strong', null, (synergy.pattern || []).join(' + ') || 'Паттерн'],
              ['div', null, `→ ${synergy.consequent || 'обобщение'} · поддержка ${synergy.support || 0} · уверенность ${Math.round((synergy.confidence || 0) * 100)}%`],
              ['button', { className: 'pill-btn', onClick: () => applyAuditSynergy(synergy) }, 'Применить как Сочетание']
            ]
          ) : [['div', { className: 'muted' }, 'Пока нет обнаруженных синергий.']])
        ],
        ['div', { className: 'card audit-card' },
          ['h3', null, '🕵️ Гипотезы'],
          ...(auditHypotheses && auditHypotheses.length ? auditHypotheses.map(hypothesis =>
            ['div', { className: 'audit-item' },
              ['strong', null, hypothesis.question || hypothesis.missing_fact],
              ['div', null, `Уверенность ${Math.round((hypothesis.confidence || 0.5) * 100)}%`],
              ['button', { className: 'pill-btn', onClick: () => confirmAuditHypothesis(hypothesis, true) }, 'Да, это так'],
              ['button', { className: 'pill-btn', onClick: () => confirmAuditHypothesis(hypothesis, false) }, 'Нет']
            ]
          ) : [['div', { className: 'muted' }, 'Нет гипотез для выбранного дня.']])
        ]
      ],
      ['pre', {
        className: 'retro-terminal',
        style: 'background:#050805;color:#7CFF7C;padding:12px;border:1px solid #7CFF7C;white-space:pre-wrap;overflow:auto;max-height:320px;'
      }, auditAnalysis?.xai_report || 'XAI-отчёт появится после обновления аудита.']
    ] : null,

    showAuditToast ? ['div', {
      className: 'audit-toast card',
      style: 'position:fixed;right:24px;bottom:24px;z-index:50;max-width:320px;'
    },
      ['strong', null, '💡 Вердикт выдвинул гипотезы'],
      ['div', null, 'Загляните во вкладку «Аудит».'],
      ['button', { className: 'pill-btn', onClick: () => AIFrame.setState({ activeReportTab: 'audit', showAuditToast: false }) }, 'Открыть аудит']
    ] : null,

    // Модалка справочника
    showCatalogModal ? ['div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) AIFrame.setState({ showCatalogModal: false }); } },
      ['div', { className: 'modal-card' },
        ['h3', null, '📚 Справочник привычек'],
        ['input', { type: 'text', value: habitSearch, placeholder: 'Поиск...', className: 'modal-search', onInput: (e) => AIFrame.setState({ habitSearch: e.target.value }) }],
        ['div', { className: 'modal-list' },
          ...filteredCatalog.map(h => ['div', { className: 'modal-item', onClick: () => addHabitFromCatalog(h) },
            h.default_quantity ? `${h.name} — ${h.default_quantity} ${h.unit || ''}` : h.name
          ])
        ],
        ['button', { className: 'pill-btn', onClick: () => AIFrame.setState({ showCatalogModal: false }) }, 'Закрыть']
      ]
    ] : null,

    // Модалка редактирования привычки
    (() => {
      if (showEditModal && editHabitIndex >= 0) {
        const habit = parsedTasks[editHabitIndex];
        if (!habit) return null;
        return ['div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) AIFrame.setState({ showEditModal: false }); } },
          ['div', { className: 'modal-card' },
            ['h3', null, '✏️ Редактировать привычку'],
            ['input', { className: 'modal-input', id: 'editName', value: habit.name, placeholder: 'Название' }],
            ['input', { className: 'modal-input', id: 'editCategory', value: habit.category, placeholder: 'Категория' }],
            ['input', { className: 'modal-input', id: 'editQuantity', value: habit.quantity || '', placeholder: 'Кол-во' }],
            ['input', { className: 'modal-input', id: 'editUnit', value: habit.unit || '', placeholder: 'Единица' }],
            ['select', { className: 'modal-select', id: 'editSuccess' },
              ['option', { value: '1', selected: habit.success }, '✓ Выполнено'],
              ['option', { value: '0', selected: !habit.success }, '✗ Не выполнено']
            ],
            ['div', { className: 'modal-actions' },
              ['button', { className: 'pill-btn', onClick: () => AIFrame.setState({ showEditModal: false }) }, 'Отмена'],
              ['button', { className: 'pill-btn pill-btn--primary', onClick: () => {
                const newTasks = [...parsedTasks];
                newTasks[editHabitIndex] = {
                  ...newTasks[editHabitIndex],
                  name: document.getElementById('editName').value,
                  category: document.getElementById('editCategory').value,
                  quantity: parseFloat(document.getElementById('editQuantity').value) || null,
                  unit: document.getElementById('editUnit').value,
                  success: document.getElementById('editSuccess').value === '1'
                };
                AIFrame.setState({ parsedTasks: newTasks, tasksText: serializeParsed(newTasks), showEditModal: false });
              }}, 'Сохранить']
            ]
          ]
        ];
      }
      return null;
    })()
  ] // конец retro-panel
];  // конец dashboard (возвращаемый массив App)
}
// ========== Инициализация ==========
async function init() {

  let initialState = {
    tasksText: '',
    parsedTasks: [],
    friction: 1,
    reportDate: toISODate(new Date()),
    thoughts: '',
    dayState: 'WORK',
    firstDay: '1',
    firstDate: '',
    lastDay: '1',
    lastDate: '',
    showReport: false,
    activeReportTab: 'plan',
    showCatalogModal: false,
    showEditModal: false,
    editHabitIndex: -1,
    habitSearch: '',
    skills: [],
    goals: [],
    periodStats: {},
    financePeriodStats: {},
    auditAnalysis: null,
    auditSynergies: [],
    auditHypotheses: [],
    auditError: '',
    showAuditToast: false
  };    

  AIFrame.mount('app', initialState, App);

  await loadCatalogs();

  // После загрузки каталогов
  ReportRules.loadRules(
    habitCombinations,
    habitBiometricLinks,
    habitFinanceLinks,
    autoBiometricBonuses
  );


  await loadStreaks();
  await loadAllTimeTotals();

  await loadDatesList();
  await loadSkills();

  loadPeriodStats('week');
  loadPeriodStats('month');
  loadPeriodStats('all');
  loadFinancePeriodStats('week');
  loadFinancePeriodStats('month');
  loadFinancePeriodStats('all');
  loadGoals(toISODate(new Date()));


  const saved = localStorage.getItem('disciplineReport');

  if (saved) {
    const data = JSON.parse(saved);
    initialState = {
      ...initialState,
      tasksText: data.tasksText || '',
      parsedTasks: ReportRules.parseText(data.tasksText || ''),
      friction: data.friction || 1,
      reportDate: data.reportDate || toISODate(new Date()),
      thoughts: data.thoughts || '',
      dayState: data.state || 'WORK',
      firstDay: data.firstDay || '1',
      firstDate: data.firstDate || '',
      lastDay: data.lastDay || '1',
      lastDate: data.lastDate || ''
    };
  }
}

document.addEventListener('DOMContentLoaded', init);