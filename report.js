// Report Generator JavaScript - Migrated to new architecture
// Uses new API endpoints: /api/completions, /api/completion_habits, /api/habits, /api/combinations, /api/stats/*

// ========== Utility Functions ==========
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(dateA, dateB) {
  const a = new Date(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
  const b = new Date(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());
  return Math.round((b - a) / 86400000);
}

function parseCharacteristics(text) {
  const stats = { I: 0, S: 0, W: 0, E: 0, C: 0, H: 0, ST: 0, $: 0 };
  const regex = /([ISWEHC]|ST|\$)\[([-\d.]+)\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const key = match[1];
    const value = parseFloat(match[2]);
    if (!isNaN(value)) stats[key] = value;
  }
  return stats;
}

function formatStats(stats) {
  return `I[${ stats.I.toFixed(2)}] S[${ stats.S.toFixed(2)}] W[${ stats.W.toFixed(2)}] E[${ stats.E.toFixed(2)}] C[${ stats.C.toFixed(2)}] H[${ stats.H.toFixed(2)}] ST[${ Number(stats.ST).toFixed(2)}] $[${ stats.$}]`;
}

// Helper: проверка, попадает ли биометрическая запись в связь
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

// +++ NEW: Глобальные переменные для справочников биометрики и финансов
let mealsCatalog = [];
let activitiesCatalog = [];
let measurementsCatalog = [];
let financeCategories = [];
let categoriesMap = {};

// +++ NEW: Загрузка справочников биометрики
async function loadBiometricCatalogs() {
  try {
    mealsCatalog = (await fetchAPI("/api/biometric_meals/list")).data;
    activitiesCatalog = (await fetchAPI("/api/biometric_physical_activity/list")).data;
    measurementsCatalog = (await fetchAPI("/api/biometric_measurements/list")).data;
  } catch (e) {
    console.warn("Failed to load biometric catalogs", e);
  }
}

// +++ NEW: Загрузка категорий финансов
async function loadFinanceCategories() {
  try {
    const data = await fetchAPI("/api/finance_categories/list");
    financeCategories = data.data;
    categoriesMap = {};
    financeCategories.forEach(c => { categoriesMap[c.id] = c; });
  } catch (e) {
    console.warn("Failed to load finance categories", e);
  }
}

// +++ NEW: Функция учёта связей (биометрика, финансы) в характеристиках
function calculateTotalStatsWithLinks(parsed, friction, biometricData, financeData) {
    const mult = 1 + (friction - 1) / 9;
    // Сначала базовые бонусы (привычки и их комбинации)
    const totals = calculateTotalStats(parsed, friction);

    // Построение map id привычки -> выполнена ли она
    const habitNameToId = {};
    habitsCatalog.forEach(h => {
        const key = `${h.name}|${h.category}`;
        habitNameToId[key] = h.id;
    });
    const habitIds = {};
    parsed.forEach(item => {
        if (item.type === "habit") {
            const key = `${item.name}|${item.category}`;
            const id = habitNameToId[key];
            if (id) habitIds[id] = item.success;
        }
    });

    // 1. Связи привычка ↔ биометрика
    for (const link of habitBiometricLinks) {
        const habitDone = habitIds[link.habit_id] || false;
        if (!habitDone) continue;

        const found = biometricLinkMatches(link, biometricData);

        if (found) {
            totals.I += (link.bonus_i || 0) * mult;
            totals.S += (link.bonus_s || 0) * mult;
            totals.W += (link.bonus_w || 0) * mult;
            totals.E += (link.bonus_e || 0) * mult;
            totals.C += (link.bonus_c || 0) * mult;
            totals.H += (link.bonus_h || 0) * mult;
            totals.ST += (link.bonus_st || 0) * mult;
            totals.$ += (link.bonus_money || 0) * mult;
        }
    }

    // 2. Связи привычка ↔ финансы
    for (const link of habitFinanceLinks) {
        const habitDone = habitIds[link.habit_id] || false;
        if (!habitDone) continue;

        let found = false;
        if (link.finance_type === 'income_active') {
            const incomes = financeData.filter(t => {
                const cat = categoriesMap[t.category_id];
                return cat && cat.type === 'income' && cat.is_active;
            });
            const totalIncome = incomes.reduce((sum, t) => sum + t.amount, 0);
            if (totalIncome >= link.threshold) found = true;
        } else if (link.finance_type === 'income_passive') {
            const incomes = financeData.filter(t => {
                const cat = categoriesMap[t.category_id];
                return cat && cat.type === 'income' && !cat.is_active;
            });
            const totalIncome = incomes.reduce((sum, t) => sum + t.amount, 0);
            if (totalIncome >= link.threshold) found = true;
        } else if (link.finance_type === 'expense') {
            const expenses = financeData.filter(t => {
                const cat = categoriesMap[t.category_id];
                return cat && cat.type === 'expense';
            });
            const totalExpense = expenses.reduce((sum, t) => sum + t.amount, 0);
            if (totalExpense >= link.threshold) found = true;
        }

        if (found) {
            totals.I += (link.bonus_i || 0) * mult;
            totals.S += (link.bonus_s || 0) * mult;
            totals.W += (link.bonus_w || 0) * mult;
            totals.E += (link.bonus_e || 0) * mult;
            totals.C += (link.bonus_c || 0) * mult;
            totals.H += (link.bonus_h || 0) * mult;
            totals.ST += (link.bonus_st || 0) * mult;
            totals.$ += (link.bonus_money || 0) * mult;
        }
    }

    // 3. Автоматические бонусы от биометрики (без привязки к привычке)
    for (const bonus of autoBiometricBonuses) {
        let found = false;
        if (bonus.biometric_type === 'substance' && bonus.biometric_id) {
            found = biometricData.intakes?.some(i => i.substance_id === bonus.biometric_id && i.taken);
        } else if (bonus.biometric_type === 'meal' && bonus.biometric_id) {
            found = biometricData.meals?.some(m => m.id === bonus.biometric_id);
        } else if (bonus.biometric_type === 'activity' && bonus.biometric_id) {
            found = biometricData.activities?.some(a => a.id === bonus.biometric_id);
        } else if (bonus.biometric_type === 'measurement' && bonus.biometric_id) {
            found = biometricData.measurements?.some(m => m.id === bonus.biometric_id);
        } else if (!bonus.biometric_id) {
            if (bonus.biometric_type === 'substance') found = biometricData.intakes?.some(i => i.taken);
            else if (bonus.biometric_type === 'meal') found = biometricData.meals?.length > 0;
            else if (bonus.biometric_type === 'activity') found = biometricData.activities?.length > 0;
            else if (bonus.biometric_type === 'measurement') found = biometricData.measurements?.length > 0;
        }

        if (found) {
            totals.I += (bonus.bonus_i || 0) * mult;
            totals.S += (bonus.bonus_s || 0) * mult;
            totals.W += (bonus.bonus_w || 0) * mult;
            totals.E += (bonus.bonus_e || 0) * mult;
            totals.C += (bonus.bonus_c || 0) * mult;
            totals.H += (bonus.bonus_h || 0) * mult;
            totals.ST += (bonus.bonus_st || 0) * mult;
            totals.$ += (bonus.bonus_money || 0) * mult;
        }
    }

    return totals;
}

async function loadAndRenderSkills() {
  try {
    const response = await fetchAPI("/api/skills/with-levels");
    const skills = response.data;
    const container = document.getElementById("skillsReportContent");
    if (!container) return;

    if (!skills || skills.length === 0) {
      container.innerHTML = "Нет данных о навыках. Добавьте навыки в справочник.";
      return;
    }

    let html = `<div style="display: flex; flex-direction: column; gap: 12px;">`;
    for (const skill of skills) {
      html += `
        <div style="border-left: 4px solid #4caf50; padding-left: 12px;">
          <strong>${escapeHtml(skill.name)}</strong> 
          <span style="color: #888;">(уровень ${skill.level} – ${skill.level_name})</span><br>
          <span>⏱ Всего часов: ${skill.total_hours.toFixed(1)} ч</span><br>
          <progress value="${skill.progress_percent}" max="100" style="width: 100%; height: 8px; border-radius: 4px;"></progress>
          <span style="font-size: 12px;">${skill.progress_percent.toFixed(1)}% до следующего уровня</span>
          ${skill.next_level_minutes ? `<br><span style="font-size: 11px;">Осталось минут: ${Math.ceil(skill.next_level_minutes)}</span>` : ''}
          ${skill.description ? `<br><span style="font-size: 12px;">📝 ${escapeHtml(skill.description)}</span>` : ''}
        </div>
      `;
    }
    html += `</div>`;
    container.innerHTML = html;
  } catch (e) {
    console.error("Failed to load skills", e);
    const container = document.getElementById("skillsReportContent");
    if (container) container.innerHTML = "❌ Ошибка загрузки навыков";
  }
}

// вспомогательная функция для экранирования HTML
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// Модифицируем calculateTotalStats
function calculateTotalStats(parsed, friction = 1) {
    const totals = { I: 0, S: 0, W: 0, E: 0, C: 0, H: 0, ST: 0, $: 0 };
    const mult = 1 + (friction - 1) / 9;

    // --- 1. Характеристики от самих привычек (уже было) ---
    parsed.forEach(item => {
        if (item.type === "habit" && item.success) {
            for (const k in totals) {
                totals[k] += (item.stats[k] || 0) * mult;
            }
        }
    });

    // --- 2. Бонусы от сочетаний привычек (уже было) ---
    const habitNameToId = {};
    habitsCatalog.forEach(h => {
        const key = `${h.name}|${h.category}`;
        habitNameToId[key] = h.id;
    });
    const habitIds = {};
    parsed.forEach(item => {
        if (item.type === "habit") {
            const key = `${item.name}|${item.category}`;
            const id = habitNameToId[key];
            if (id) habitIds[id] = item.success;
        }
    });
    for (const combo of habitCombinations) {
        const aDone = habitIds[combo.habit_a] || false;
        const bDone = habitIds[combo.habit_b] || false;
        if (aDone && bDone) {
            totals.I += (combo.i || 0) * mult;
            totals.S += (combo.s || 0) * mult;
            totals.W += (combo.w || 0) * mult;
            totals.E += (combo.e || 0) * mult;
            totals.C += (combo.c || 0) * mult;
            totals.H += (combo.h || 0) * mult;
            totals.ST += (combo.st || 0) * mult;
            totals.$ += (combo.money || 0) * mult;
        }
    }

    console.group("DEBUG: calculateTotalStats");
    console.log("HabitIds:", habitIds);
    console.log("Combinations count:", habitCombinations.length);
    habitCombinations.forEach((combo, idx) => {
        console.log(`Combo ${idx}: habit_a=${combo.habit_a}, habit_b=${combo.habit_b}, done? a=${habitIds[combo.habit_a]} b=${habitIds[combo.habit_b]}`);
    });
    console.groupEnd();

    // --- 3. Бонусы от связей привычка ↔ биометрика ---
    for (const link of habitBiometricLinks) {
        // Проверяем, выполнена ли привычка
        const habitId = link.habit_id;
        const habitDone = habitIds[habitId] || false;
        if (!habitDone) continue;

        // Проверяем, есть ли биометрическая запись
        const hasEntry = hasBiometricEntry(link.biometric_type, link.biometric_id);
        if (!hasEntry) continue;

        // Добавляем бонусы
        for (const k in totals) {
            totals[k] += (link[`bonus_${k.toLowerCase()}`] || 0) * mult;
        }
    }

    // --- 4. Бонусы от связей привычка ↔ финансы ---
    for (const link of habitFinanceLinks) {
        const habitId = link.habit_id;
        const habitDone = habitIds[habitId] || false;
        if (!habitDone) continue;

        const hasTx = hasFinanceTransaction(link.finance_type, link.category_id, link.threshold);
        if (!hasTx) continue;

        for (const k in totals) {
            totals[k] += (link[`bonus_${k.toLowerCase()}`] || 0) * mult;
        }
    }

    // --- 5. Автоматические бонусы от биометрики (без привязки к привычкам) ---
    if (autoBiometricBonuses && autoBiometricBonuses.length) {
        for (const bonus of autoBiometricBonuses) {
            // Проверяем, есть ли запись данного типа (и ID)
            const hasEntry = hasBiometricEntry(bonus.biometric_type, bonus.biometric_id);
            if (!hasEntry) continue;

            for (const k in totals) {
                totals[k] += (bonus[`bonus_${k.toLowerCase()}`] || 0) * mult;
            }
        }
    }

    return totals;
}
function calculateStatSum(stats) {
  if (!stats) return 0;
  const keys = ["I", "S", "W", "E", "C", "H"];
  return keys.reduce((acc, k) => acc + (Number(stats[k]) || 0), 0);
}

function calculateImprovementPercent(totals, baseTotals) {
  const dailySum = calculateStatSum(totals);
  if (!baseTotals) return dailySum;
  const baseSum = calculateStatSum(baseTotals);
  if (baseSum === 0) return dailySum;
  return (dailySum / baseSum) * 100;
}

function calculateCumulativeImprovement(currentTotals, baselineTotals) {
  if (!currentTotals || !baselineTotals) return null;
  const cur = calculateStatSum(currentTotals);
  const base = calculateStatSum(baselineTotals);
  if (base === 0) return null;
  return ((cur - base) / base) * 100;
}

function formatStreaksSummary() {
  const active = Object.entries(streaksData)
    .filter(([_id, s]) => s.current > 0)
    .map(([id, s]) => {
      const habit = habitsCatalog.find(h => Number(h.id) === Number(id));
      const name = habit ? habit.name : `habit#${id}`;
      return `${name} 🔥${s.current}`;
    });

  return active.length ? active.join(', ') : 'нет активных стриков';
}

function renderTotalStats(totals) {
  const el = document.getElementById("totalStats");
  if (!el) return;
  const order = ["I", "S", "W", "E", "C", "H", "ST", "$"];
  el.innerHTML = order.map(k => `<div class="stat-item"><strong>${k}:</strong> ${totals[k].toFixed(2)}</div>`).join("");
}

let habitsCatalog = [];
let combosCatalog = [];
let streaksData = {};
let parsed = [];
let allTimeTotals = null;
let startTotals = null;

let habitCombinations = [];   // привычка ↔ привычка
let habitBiometricLinks = []; // привычка ↔ биометрика
let habitFinanceLinks = [];   // привычка ↔ финансы
let autoBiometricBonuses = []; // автобонусы от биометрики

let currentFinanceData = [];
let currentBiometricData = { intakes: [], meals: [], measurements: [], activities: [], mental: [] };
let financePeriodStats = { week: null, month: null, all: null };
let substancesCatalog = []; // для подстановки названий веществ

let elements = {}; // Инициализируется в DOMContentLoaded

function initializeElements() {
  console.log("🔵 Инициализация элементов...");
  elements = {
    todayDisplay: document.getElementById("todayDisplay"),
    currentDayDisplay: document.getElementById("currentDayDisplay"),
    reportDateEl: document.getElementById("reportDate"),
    tasksInput: document.getElementById("tasksInput"),
    parseBtn: document.getElementById("parseBtn"),
    saveBtn: document.getElementById("saveBtn"),
    loadBtn: document.getElementById("loadBtn"),
    clearBtn: document.getElementById("clearBtn"),
    sampleBtn: document.getElementById("sampleBtn"),
    saveToDBBtn: document.getElementById("saveToDBBtn"),
    dbDateSelect: document.getElementById("dbDateSelect"),
    addFromCatalogBtn: document.getElementById("addFromCatalogBtn"),
    tasksList: document.getElementById("tasksList"),
    makeReportBtn: document.getElementById("makeReport"),
    reportOutput: document.getElementById("reportOutput"),
    copyReport: document.getElementById("copyReport"),
    downloadReport: document.getElementById("downloadReport"),
    completedCount: document.getElementById("completedCount"),
    totalCount: document.getElementById("totalCount"),
    percentDone: document.getElementById("percentDone"),
    stateSelect: document.getElementById("stateSelect"),
    thoughtsInput: document.getElementById("thoughtsInput"),
    frictionIndex: document.getElementById("frictionIndex"),
    frictionValue: document.getElementById("frictionValue"),
    firstDayEl: document.getElementById("firstDay"),
    firstDateEl: document.getElementById("firstDate"),
    lastDayEl: document.getElementById("lastDay"),
    lastDateEl: document.getElementById("lastDate"),
    diffDaysEl: document.getElementById("diffDays"),
  };
  
  // Проверим есть ли все элементы
  const missingElements = Object.entries(elements)
    .filter(([key, el]) => el === null)
    .map(([key]) => key);
  
  if (missingElements.length > 0) {
    console.error("🔴 КРИТИЧНО! Отсутствуют элементы:", missingElements);
    alert("❌ КРИТИЧНАЯ ОШИБКА: Отсутствуют элементы HTML: " + missingElements.join(", "));
    return false;
  } else {
    console.log("✅ Все элементы инициализированы успешно!");
  }
  
  return true;
}

async function fetchAPI(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!data || data.status !== "success") throw new Error(data?.message || "API Error");
  return data;
}

async function loadHabitsCatalog() {
  try {
    const data = await fetchAPI("/api/habits/list");
    habitsCatalog = data.data;
  } catch (e) { console.error("loadHabitsCatalog", e); }
}

async function loadCombinations() {
  try {
    const data = await fetchAPI("/api/combinations/list");
    combosCatalog = data.data;
  } catch (e) { console.error("loadCombinations", e); }
}

async function loadStreaks() {
  try {
    const data = await fetchAPI("/api/stats/streaks");
    streaksData = {};
    Object.keys(data.streaks).forEach(habitId => {
      streaksData[habitId] = {
        current: data.streaks[habitId].current_streak,
        longest: data.streaks[habitId].max_streak
      };
    });
    renderTasks();
  } catch (e) { console.error("loadStreaks", e); }
}

async function loadDatesFromDB() {
  try {
    console.log("🔵 loadDatesFromDB: STEP 1 - checking dbDateSelect element");
    if (!elements.dbDateSelect) {
      console.error("🔴 loadDatesFromDB: dbDateSelect not found!");
      alert("Ошибка: элемент dbDateSelect не найден");
      return;
    }

    console.log("🔵 loadDatesFromDB: STEP 2 - fetching /api/completions/list");
    const response = await fetchAPI("/api/completions/list");
    console.log("🔵 loadDatesFromDB: STEP 3 - completions response:", response);

    const completions = response.data || [];
    console.log("🔵 loadDatesFromDB: STEP 4 - total completions:", completions.length);

    // Логируем каждую дату для диагностики
    if (completions.length > 0) {
      console.log("🔵 loadDatesFromDB: Dates in completions:");
      completions.forEach((c, idx) => {
        console.log(`  [${idx}] date="${c.date}" id=${c.id}`);
      });
    }

    // Извлекаем уникальные даты и сортируем
    const dates = new Set();
    completions.forEach(c => {
      if (c.date) {
        dates.add(c.date);
      } else {
        console.warn("⚠️ loadDatesFromDB: completion without date found! ID:", c.id);
      }
    });

    const sortedDates = Array.from(dates).sort().reverse();
    const oldestDate = Array.from(dates).sort()[0];
    const newestDate = sortedDates[0];
    console.log("🔵 loadDatesFromDB: STEP 5 - unique dates:", sortedDates);
    
    if (sortedDates.length === 0) {
      console.warn("⚠️ loadDatesFromDB: WARNING - no dates found!");
      alert("ℹ️ Нет данных в базе. Сначала сохраните день.");
      elements.dbDateSelect.innerHTML = "<option value=\"\">Выберите дату</option>";
      return;
    }

    // Заполняем автополя первого и последнего дня
    if (elements.firstDateEl) {
      elements.firstDateEl.value = oldestDate;
    }
    if (elements.lastDateEl) {
      elements.lastDateEl.value = newestDate;
    }
    if (elements.firstDayEl || elements.lastDayEl) {
      const minDay = Math.min(...completions.map(c => c.day_number || 1));
      const maxDay = Math.max(...completions.map(c => c.day_number || 1));
      if (elements.firstDayEl) {
        elements.firstDayEl.value = minDay || 1;
      }
      if (elements.lastDayEl) {
        elements.lastDayEl.value = maxDay || 1;
      }
    }

    // Также загружаем статистику за всё время
    try {
      const statsResponse = await fetchAPI("/api/stats/period?period=all");
      if (statsResponse.stats) {
        allTimeTotals = {
          I: Number(statsResponse.stats.sum_i || 0),
          S: Number(statsResponse.stats.sum_s || 0),
          W: Number(statsResponse.stats.sum_w || 0),
          E: Number(statsResponse.stats.sum_e || 0),
          C: Number(statsResponse.stats.sum_c || 0),
          H: Number(statsResponse.stats.sum_h || 0),
          ST: Number(statsResponse.stats.sum_st || 0),
          $: Number(statsResponse.stats.sum_money || 0)
        };
        console.log("🔵 loadDatesFromDB: allTimeTotals loaded");
        // Загружаем статистику на самый первый (oldest) день как базу для накопительного процента
        try {
          const baseResp = await fetchAPI(`/api/stats/period?period=all&date=${oldestDate}`);
          if (baseResp.stats) {
            startTotals = {
              I: Number(baseResp.stats.sum_i || 0),
              S: Number(baseResp.stats.sum_s || 0),
              W: Number(baseResp.stats.sum_w || 0),
              E: Number(baseResp.stats.sum_e || 0),
              C: Number(baseResp.stats.sum_c || 0),
              H: Number(baseResp.stats.sum_h || 0),
              ST: Number(baseResp.stats.sum_st || 0),
              $: Number(baseResp.stats.sum_money || 0)
            };
            console.log("🔵 loadDatesFromDB: startTotals loaded for", oldestDate);
          }
        } catch (e) { console.warn('loadDatesFromDB: could not load startTotals', e); }
      }
    } catch (e) {
      console.warn("⚠️ loadDatesFromDB: could not load all-time stats:", e);
    }
    
    elements.dbDateSelect.innerHTML = "<option value=\"\">Выберите дату</option>" +
      sortedDates.map(d => `<option value="${d}">${d}</option>`).join("");
    console.log("✅ loadDatesFromDB: STEP 6 - select populated with", sortedDates.length, "dates");

    // Автоматически подгружаем последний (последний заполненный) день
    if (sortedDates.length > 0) {
      elements.dbDateSelect.value = sortedDates[0];
      await loadDayFromDB();
    }

    updateReportOutput();
    alert("✅ Дат загружено: " + sortedDates.length);
  } catch (e) { 
    console.error("🔴 loadDatesFromDB: ERROR:", e);
    console.error("🔴 loadDatesFromDB: stack:", e.stack);
    alert("❌ Ошибка при загрузке дат: " + e.message);
  }
}

async function loadPeriodStats(period) {
  try {
    const data = await fetchAPI(`/api/stats/period?period=${period}`);
    displayPeriodStats(data, period);
    if (period === 'all' && data.stats) {
      allTimeTotals = {
        I: Number(data.stats.sum_i || 0),
        S: Number(data.stats.sum_s || 0),
        W: Number(data.stats.sum_w || 0),
        E: Number(data.stats.sum_e || 0),
        C: Number(data.stats.sum_c || 0),
        H: Number(data.stats.sum_h || 0),
        ST: Number(data.stats.sum_st || 0),
        $: Number(data.stats.sum_money || 0)
      };
      updateReportOutput();
    }
  } catch (e) {
    console.error('loadPeriodStats', e);
  }
}

async function loadFinancePeriodStats(period) {
    try {
        const data = await fetchAPI(`/api/finance/stats?period=${period}`);
        if (data.data) {
            financePeriodStats[period] = data.data;
        }
    } catch (e) {
        console.warn(`loadFinancePeriodStats(${period})`, e);
    }
}

function displayPeriodStats(data, period) {
  const container = document.getElementById('periodStatsDisplay');
  if (!container) return;
  const periodNames = { week: 'неделю', month: 'месяц', all: 'все время' };
  let html = `<strong>За ${periodNames[period]}:</strong> `;
  if (data.stats) {
    html += `${data.stats.days_count || 0} дней, `;
    html += `I:${Number(data.stats.avg_i || 0).toFixed(2)} `;
    html += `S:${Number(data.stats.avg_s || 0).toFixed(2)} `;
    html += `W:${Number(data.stats.avg_w || 0).toFixed(2)}`;
  } else {
    html += 'нет данных';
  }
  if (data.comparison) {
    html += '<br>Сравнение: ';
    const changes = [];
    Object.keys(data.comparison).forEach(key => {
      if (data.comparison[key] !== '→') {
        changes.push(`${key}${data.comparison[key]}`);
      }
    });
    html += changes.length > 0 ? changes.join(' ') : 'без изменений';
  }
  container.innerHTML = html;
}

async function loadDayFromDB() {
  const date = elements.dbDateSelect.value;
  if (!date) {
    console.warn("⚠️ loadDayFromDB: WARNING - no date selected!");
    return;
  }
  try {
    console.log("🔵 loadDayFromDB: STEP 1 - loading date:", date);
    const completion = await fetchAPI(`/api/completions/list?date=${date}`);
    console.log("🔵 loadDayFromDB: STEP 2 - completion response:", completion);
    
    if (!completion.data || !completion.data.length) {
      console.error("🔴 loadDayFromDB: ERROR - День не найден for date:", date);
      alert("❌ Данные за этот день не найдены");
      return;
    }
    
    const day = completion.data[0];
    console.log("🔵 loadDayFromDB: STEP 3 - day data:", day);
    
    const habits = await fetchAPI(`/api/completion_habits/list?completion_id=${day.id}`);
    console.log("🔵 loadDayFromDB: STEP 4 - habits response, count:", habits.data ? habits.data.length : 0);
    
    let text = "";
    let currentCategory = null;
    const friction = day.friction_index || 1;
    
    if (habits.data && habits.data.length > 0) {
      for (const h of habits.data) {
        if (h.category !== currentCategory) {
          if (currentCategory) text += "\n";
          currentCategory = h.category;
          text += `${h.category}\n———————————————\n`;
        }
        const sign = h.success ? "+" : "-";
        const quantity = h.quantity ? ` — ${h.quantity} ${h.unit || ""}` : "";
        const stats = formatStats({ I: h.i, S: h.s, W: h.w, E: h.e, C: h.c, H: h.hh, ST: h.st, $: h.money });
        text += `${sign} ${h.name}${quantity} ${stats}\n`;
      }
    }
    
    currentFinanceData = await loadFinanceData(date);
    currentBiometricData = await loadBiometricData(date);
    await loadSubstancesCatalog();

    elements.tasksInput.value = text;
    elements.reportDateEl.value = date;
    elements.lastDateEl.value = date;
    elements.lastDayEl.value = day.day_number || elements.lastDayEl.value || "0";
    if (!elements.firstDateEl.value) {
      elements.firstDateEl.value = date;
      try {
        const baseResp = await fetchAPI(`/api/stats/period?period=all&date=${date}`);
        if (baseResp.stats) {
          startTotals = {
            I: Number(baseResp.stats.sum_i || 0),
            S: Number(baseResp.stats.sum_s || 0),
            W: Number(baseResp.stats.sum_w || 0),
            E: Number(baseResp.stats.sum_e || 0),
            C: Number(baseResp.stats.sum_c || 0),
            H: Number(baseResp.stats.sum_h || 0),
            ST: Number(baseResp.stats.sum_st || 0),
            $: Number(baseResp.stats.sum_money || 0)
          };
        }
      } catch (e) { console.warn('loadDayFromDB: could not load startTotals for firstDate', e); }
    }
    if (!elements.firstDayEl.value) elements.firstDayEl.value = day.day_number || "1";
    elements.frictionIndex.value = friction;
    elements.frictionValue.textContent = friction;
    elements.thoughtsInput.value = day.thoughts || "";
    elements.stateSelect.value = day.state || "WORK";

    parseTextInput();
    renderMeta();
    await updateReportOutput();
    console.log("✅ loadDayFromDB: day loaded successfully");
  } catch (e) { 
    console.error("🔴 loadDayFromDB:", e);
    console.error("🔴 loadDayFromDB stack:", e.stack);
    alert("❌ Ошибка при загрузке дня: " + e.message); 
  }
}

function parseTextToStructure(text) {
  try {
    console.log("🔵 parseTextToStructure: начало, текст длина:", text?.length || 0);
    
    if (!text) {
      console.warn("⚠️ parseTextToStructure: пустой текст");
      return [];
    }
    
    const lines = text.split("\n");
    console.log("🔵 parseTextToStructure: разбили на строк:", lines.length);
    
    const result = [];
    let currentCategory = null;

    for (let line of lines) {
      line = line.trim();
      if (!line) {
        result.push({ type: "blank" });
        continue;
      }

      // Пропускаем разделители (строки из дефисов или тире)
      const isSeparator = /^[—\-–−—]+$/.test(line) || /^-{3,}$/.test(line) || /^={3,}$/.test(line);
      if (isSeparator) {
        continue;
      }

      // Проверяем, это ли категория (не начинается с +, -, или *)
      const isHabitLine = line.startsWith("+") || line.startsWith("-") || line.startsWith("*");
      if (!isHabitLine) {
        // Это категория
        currentCategory = line;
        result.push({ type: "category", text: line });
        continue;
      }

      // Это привычка
      if (line.startsWith("+") || line.startsWith("-")) {
        const success = line.startsWith("+");
        let habitText = line.substring(1).trim();

        // Парсим статистику
        const statsMatch = habitText.match(/(.+?)\s+(I\[.*?\].*)/);
        let name = habitText;
        let stats = { I: 0, S: 0, W: 0, E: 0, C: 0, H: 0, ST: 0, $: 0 };
        let quantity = null, unit = null;

        if (statsMatch) {
          habitText = statsMatch[1];
          stats = parseCharacteristics(statsMatch[2]);
        }

        // Парсим количество и единицу (например "30 мин", "2л", "4 часа")
        const quantMatch = habitText.match(/(.+?)\s*—\s*(\d+(?:\.\d+)?)\s*(.+?)$/);
        if (quantMatch) {
          name = quantMatch[1];
          quantity = parseFloat(quantMatch[2]);
          unit = quantMatch[3];
        } else {
          name = habitText;
        }

        const habitObj = {
          type: "habit",
          name: name.trim(),
          category: currentCategory || "Без категории",
          success,
          quantity,
          unit,
          stats
        };

        result.push(habitObj);
      }
    }

    console.log("✅ parseTextToStructure: успешно, привычек:", result.filter(r => r.type === "habit").length);
    return result;
  } catch (e) {
    console.error("🔴 parseTextToStructure: ошибка:", e);
    console.error("🔴 parseTextToStructure: stack:", e.stack);
    throw e;
  }
}

function serializeParsedToText() {
  const lines = [];
  parsed.forEach(item => {
    if (item.type === "blank") {
      lines.push("");
    } else if (item.type === "category") {
      lines.push(item.text);
      lines.push("———————————————");
    } else if (item.type === "habit") {
      const sign = item.success ? "+" : "-";
      const quantity = item.quantity ? ` — ${item.quantity} ${item.unit || ""}` : "";
      const stats = formatStats(item.stats);
      lines.push(`${sign} ${item.name}${quantity} ${stats}`);
    }
  });
  return lines.join("\n");
}

function parseTextInput() {
  try {
    console.log("🔵 parseTextInput: начало парсинга");
    console.log("🔵 parseTextInput: tasksInput value:", elements.tasksInput?.value?.substring(0, 100));
    
    if (!elements.tasksInput) {
      console.error("🔴 parseTextInput: tasksInput элемент не найден!");
      throw new Error("tasksInput элемент не найден");
    }
    
    const inputText = elements.tasksInput.value;
    console.log("🔵 parseTextInput: длина текста:", inputText.length);
    
    parsed = parseTextToStructure(inputText);
    console.log("🔵 parseTextInput: успешно спарсено элементов:", parsed.length);
    console.log("📊 Parsed habits:", parsed.filter(p => p.type === "habit").map(h => ({ name: h.name, category: h.category })));
    
    renderTasks();
    renderMeta();
    
    // Вычитаем и рендерим характеристики
    const friction = parseInt(elements.frictionIndex.value) || 1;
    const totals = calculateTotalStatsWithLinks(parsed, friction, currentBiometricData, currentFinanceData);
    renderTotalStats(totals);
    
    console.log("✅ parseTextInput: завершено успешно");
  } catch (e) {
    console.error("🔴 parseTextInput: ошибка:", e);
    console.error("🔴 parseTextInput: stack:", e.stack);
    alert("❌ Ошибка парсинга: " + e.message);
  }
}

async function loadAllLinks() {
  try {
    habitCombinations = await fetchAPI('/api/combinations/list').then(r => r.data);
    habitBiometricLinks = await fetchAPI('/api/combinations/habit-biometric').then(r => r.data);
    habitFinanceLinks = await fetchAPI('/api/combinations/habit-finance').then(r => r.data);
    autoBiometricBonuses = await fetchAPI('/api/combinations/biometric-characteristics').then(r => r.data);
  } catch (e) {
    console.warn('Failed to load links', e);
  }
}

function renderTasks() {
  const container = elements.tasksList;
  if (!container) return;
  container.innerHTML = "";
  let currentCategory = null;

  parsed.forEach((item, idx) => {
    if (item.type === "blank") {
      const br = document.createElement("div");
      br.style.height = "8px";
      container.appendChild(br);
      return;
    }
    if (item.type === "category") {
      currentCategory = item.text;
      const sec = document.createElement("div");
      sec.className = "section";
      const h3 = document.createElement("h3");
      h3.textContent = currentCategory;
      sec.appendChild(h3);
      container.appendChild(sec);
      return;
    }

    if (item.type === "habit") {
      const catalogHabit = habitsCatalog.find(h => h.name === item.name && h.category === item.category);
      const streakHtml = catalogHabit && streaksData[catalogHabit.id] && streaksData[catalogHabit.id].current > 0
        ? `<span class="streak-fire">🔥${streaksData[catalogHabit.id].current}</span>`
        : "";
      
      const el = document.createElement("div");
      el.className = `task ${catalogHabit ? "habit-from-db" : ""}`;
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.gap = "8px";
      el.style.padding = "8px";
      el.style.border = "1px solid #eee";
      el.style.borderRadius = "6px";
      el.style.margin = "4px 0";

      const btn = document.createElement("button");
      btn.className = "toggle";
      btn.textContent = item.success ? "[+]" : "[-]";
      btn.onclick = () => {
        item.success = !item.success;
        btn.textContent = item.success ? "[+]" : "[-]";
        renderMeta();
        updateReportOutput();
        // Пересчитать характеристики
        const friction = parseInt(elements.frictionIndex.value) || 1;
        const totals = calculateTotalStatsWithLinks(parsed, friction, currentBiometricData, currentFinanceData);
        renderTotalStats(totals);
      };

      const textDiv = document.createElement("div");
      textDiv.style.flex = "1";
      let nameText = item.name;
      if (item.quantity) nameText += ` — ${item.quantity} ${item.unit || ""}`;
      textDiv.innerHTML = `${nameText} ${streakHtml}`;

      const controls = document.createElement("div");
      controls.className = "habit-controls";

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "×";
      removeBtn.className = "small";
      removeBtn.title = "Удалить привычку";
      removeBtn.onclick = () => { parsed.splice(idx, 1); renderTasks(); renderMeta(); updateReportOutput(); };
      controls.appendChild(removeBtn);

      if (!catalogHabit) {
        const addBtn = document.createElement("button");
        addBtn.textContent = "+ BD";
        addBtn.className = "small";
        addBtn.onclick = () => addHabitToCatalog(item, item.category);
        controls.appendChild(addBtn);
      }

      const editBtn = document.createElement("button");
      editBtn.textContent = "✎";
      editBtn.className = "small";
      editBtn.onclick = () => showEditHabitModal(idx, item.category);
      controls.appendChild(editBtn);

      el.appendChild(btn);
      el.appendChild(textDiv);
      el.appendChild(controls);
      container.appendChild(el);
    }
  });
}

function computeDayNumber() {
  const reportDate = elements.reportDateEl.value ? new Date(elements.reportDateEl.value) : new Date();
  const firstDateVal = elements.firstDateEl.value ? new Date(elements.firstDateEl.value) : null;
  const firstDayVal = parseInt(elements.firstDayEl.value, 10) || 1;
  const lastDateVal = elements.lastDateEl.value ? new Date(elements.lastDateEl.value) : null;
  const lastDayVal = parseInt(elements.lastDayEl.value, 10) || 0;

  if (firstDateVal) {
    return Math.max(1, firstDayVal + daysBetween(firstDateVal, reportDate));
  }
  if (lastDateVal) {
    return Math.max(1, lastDayVal + daysBetween(lastDateVal, reportDate));
  }
  return 1;
}

function renderMeta() {
  const systemToday = new Date();
  elements.todayDisplay.textContent = toISODate(systemToday);

  const reportDate = elements.reportDateEl.value ? new Date(elements.reportDateEl.value) : new Date();
  const lastDateVal = elements.lastDateEl.value ? new Date(elements.lastDateEl.value) : null;
  const dayNumber = computeDayNumber();

  if (lastDateVal) {
    const diff = daysBetween(lastDateVal, reportDate);
    elements.diffDaysEl.textContent = diff;
    elements.currentDayDisplay.textContent = String(dayNumber);
  } else {
    elements.diffDaysEl.textContent = "—";
    elements.currentDayDisplay.textContent = String(dayNumber);
  }

  let total = 0, completed = 0;
  parsed.forEach(item => {
    if (item.type === "habit") {
      total++;
      if (item.success) completed++;
    }
  });

  elements.totalCount.textContent = total;
  elements.completedCount.textContent = completed;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  elements.percentDone.textContent = pct + "%";

  const friction = parseInt(elements.frictionIndex.value) || 1;
  const totals = calculateTotalStatsWithLinks(parsed, friction, currentBiometricData, currentFinanceData);
  renderTotalStats(totals);
}


// Функция для проверки, есть ли биометрическая запись определённого типа (и опционально ID/тип)
function hasBiometricEntry(type, id = null, value = null) {
    if (!currentBiometricData) return false;
    const dummyLink = { biometric_type: type, biometric_id: id, biometric_value: value };
    return biometricLinkMatches(dummyLink, currentBiometricData);
}

// Функция для проверки финансовых транзакций
function hasFinanceTransaction(type, categoryId = null, threshold = 0) {
    if (!currentFinanceData) return false;
    let sum = 0;
    for (const tx of currentFinanceData) {
        // Определяем тип транзакции по категории
        const cat = categoriesMap[tx.category_id];
        if (!cat) continue;
        const txType = cat.type; // 'income' или 'expense'
        if (type === 'income_active' && txType === 'income' && (!categoryId || tx.category_id === categoryId)) {
            sum += tx.amount;
        } else if (type === 'income_passive' && txType === 'income' && (!categoryId || tx.category_id === categoryId)) {
            sum += tx.amount;
        } else if (type === 'expense' && txType === 'expense' && (!categoryId || tx.category_id === categoryId)) {
            sum += tx.amount;
        }
    }
    return sum >= threshold;
}

// Проверка активности сочетания привычек
function isCombinationActive(combo) {
    const habitIds = {};
    parsed.forEach(item => {
        if (item.type === "habit") {
            const habit = habitsCatalog.find(h => h.name === item.name && h.category === item.category);
            if (habit) habitIds[habit.id] = item.success;
        }
    });
    return habitIds[combo.habit_a] && habitIds[combo.habit_b];
}

// Проверка активности связи привычка ↔ биометрика
function isBiometricLinkActive(link) {
    // Проверяем, выполнена ли привычка
    let habitSuccess = false;
    for (const item of parsed) {
        if (item.type === "habit") {
            const habit = habitsCatalog.find(h => h.name === item.name && h.category === item.category);
            if (habit && habit.id === link.habit_id && item.success) {
                habitSuccess = true;
                break;
            }
        }
    }
    if (!habitSuccess) return false;

    // Проверяем наличие биометрической записи
    return biometricLinkMatches(link, currentBiometricData);
}

// Проверка активности связи привычка ↔ финансы
function isFinanceLinkActive(link) {
    // Проверяем привычку
    let habitSuccess = false;
    for (const item of parsed) {
        if (item.type === "habit") {
            const habit = habitsCatalog.find(h => h.name === item.name && h.category === item.category);
            if (habit && habit.id === link.habit_id && item.success) {
                habitSuccess = true;
                break;
            }
        }
    }
    if (!habitSuccess) return false;

    // Проверяем финансовые транзакции
    let sum = 0;
    for (const tx of currentFinanceData) {
        const cat = categoriesMap[tx.category_id];
        if (!cat) continue;
        const txType = cat.type;
        if (link.finance_type === 'income_active' && txType === 'income' && cat.is_active) {
            sum += tx.amount;
        } else if (link.finance_type === 'income_passive' && txType === 'income' && !cat.is_active) {
            sum += tx.amount;
        } else if (link.finance_type === 'expense' && txType === 'expense') {
            sum += tx.amount;
        }
    }
    return sum >= (link.threshold || 0);
}

// Проверка активности автоматического бонуса от биометрики
function isAutoBiometricBonusActive(bonus) {
    switch (bonus.biometric_type) {
        case 'substance':
            if (bonus.biometric_id) {
                return currentBiometricData.intakes.some(i => i.substance_id === bonus.biometric_id && i.taken);
            } else {
                return currentBiometricData.intakes.some(i => i.taken);
            }
        case 'meal':
            if (bonus.biometric_id) {
                return currentBiometricData.meals.some(m => m.id === bonus.biometric_id);
            } else {
                return currentBiometricData.meals.length > 0;
            }
        case 'activity':
            if (bonus.biometric_id) {
                return currentBiometricData.activities.some(a => a.id === bonus.biometric_id);
            } else {
                return currentBiometricData.activities.length > 0;
            }
        case 'measurement':
            if (bonus.biometric_id) {
                return currentBiometricData.measurements.some(m => m.id === bonus.biometric_id);
            } else {
                return currentBiometricData.measurements.length > 0;
            }
        default:
            return false;
    }
}

async function updateReportOutput() {
  const friction = parseInt(elements.frictionIndex.value) || 1;
  const totals = calculateTotalStatsWithLinks(parsed, friction, currentBiometricData, currentFinanceData);

  let report = `✨🎉 === ОТЧЁТ ДИСЦИПЛИНЫ === 🎉✨\n\n`;
  report += `📅 Дата: ${elements.reportDateEl.value || toISODate(new Date())}\n`;
  report += `📈 День: ${elements.currentDayDisplay.textContent}\n`;
  report += `⚙️ Трение: ${friction}/10\n`;
  report += `🧾 Статус: ${elements.stateSelect.value}\n`;
  report += `✅ Выполнено: ${elements.completedCount.textContent}/${elements.totalCount.textContent} (${elements.percentDone.textContent})\n`;
  report += `🔥 Стрики: ${formatStreaksSummary()}\n`;
  const dayNumber = computeDayNumber();

  report += `\n=== ХАРАКТЕРИСТИКИ ===\n`;
  const stats = ["I", "S", "W", "E", "C", "H", "ST", "$"];
  stats.forEach(s => {
    const val = totals[s].toFixed(2);
    const allTime = allTimeTotals ? allTimeTotals[s].toFixed(2) : "—";
    report += `${s}: ${val} (всего: ${allTime})\n`;
  });

  const dailySum = calculateStatSum(totals);
  const overallPercent = (allTimeTotals && startTotals)
    ? calculateCumulativeImprovement(allTimeTotals, startTotals)
    : calculateImprovementPercent(totals, allTimeTotals);

  report += `\n💪 Я стал лучше на +%${dailySum.toFixed(2)}\n`;
  if (allTimeTotals) {
    const allTimeSum = calculateStatSum(allTimeTotals);
    const ratio = allTimeSum > 0 ? (dailySum / allTimeSum * 100).toFixed(2) : "—";
    report += `🌍 Доля в общем прогрессе: ${ratio}% (из +%${allTimeSum.toFixed(2)})\n`;
  }
  if (overallPercent !== null && allTimeTotals) {
    report += `📊 Отношение к суммарному прогрессу: ${overallPercent.toFixed(2)}%\n`;
  }

  report += `\n📅 ДЕНЬ ДИСЦИПЛИНЫ: ${dayNumber}`;

  if (elements.thoughtsInput.value) {
    report += `\n=== КОММЕНТАРИЙ ===\n${elements.thoughtsInput.value}\n`;
  }

  report += `\n=== ПРИВЫЧКИ ===\n`;
  let lastCategory = null;
  parsed.forEach(item => {
    if (item.type === "category") {
      lastCategory = item.text;
      report += `\n${item.text}\n`;
    } else if (item.type === "habit") {
      const sign = item.success ? "+" : "-";
      const qty = item.quantity ? ` — ${item.quantity} ${item.unit || ""}` : "";
      const catalogHabit = habitsCatalog.find(h => h.name === item.name && h.category === item.category);
      const streak = catalogHabit && streaksData[catalogHabit.id] ? streaksData[catalogHabit.id].current : 0;
      const streakText = streak > 0 ? ` 🔥${streak}` : "";
      const statusIcon = item.success ? "✅" : "❌";
      report += `  ${statusIcon} ${sign} ${item.name}${qty}${streakText}\n`;
    }
  });

  // === СВЯЗИ МЕЖДУ МОДУЛЯМИ ===
  const activeCombos = habitCombinations.filter(isCombinationActive);
  const activeBioLinks = habitBiometricLinks.filter(isBiometricLinkActive);
  const activeFinanceLinks = habitFinanceLinks.filter(isFinanceLinkActive);
  const activeAutoBonuses = autoBiometricBonuses.filter(isAutoBiometricBonusActive);

  if (activeCombos.length > 0 || activeBioLinks.length > 0 || activeFinanceLinks.length > 0 || activeAutoBonuses.length > 0) {
      report += `\n=== СВЯЗИ МЕЖДУ МОДУЛЯМИ ===\n`;
      
      if (activeCombos.length > 0) {
          report += `Сочетания привычек:\n`;
          for (const combo of activeCombos) {
              const habitA = habitsCatalog.find(h => h.id === combo.habit_a);
              const habitB = habitsCatalog.find(h => h.id === combo.habit_b);
              const bonusStr = [];
              ['i','s','w','e','c','h','st','money'].forEach(k => {
                  if (combo[k] !== 0) bonusStr.push(`${k.toUpperCase()}[${combo[k].toFixed(2)}]`);
              });
              report += `  ${combo.name || 'Без названия'}: ${habitA?.name || '?'} + ${habitB?.name || '?'} → ${bonusStr.join(' ')}\n`;
          }
      }
      
      if (activeBioLinks.length > 0) {
          report += `Связи привычка ↔ биометрика:\n`;
          for (const link of activeBioLinks) {
              const habit = habitsCatalog.find(h => h.id === link.habit_id);
              let bioName = link.biometric_type;
              if (link.biometric_type === 'substance') {
                  if (link.biometric_id) {
                      const sub = substancesCatalog.find(s => s.id === link.biometric_id);
                      bioName = sub ? sub.name : `Вещество #${link.biometric_id}`;
                  } else if (link.biometric_value) {
                      bioName = link.biometric_value;
                  } else {
                      bioName = 'все вещества';
                  }
              } else if (link.biometric_type === 'meal') {
                  if (link.biometric_id) {
                      const meal = mealsCatalog.find(m => m.id === link.biometric_id);
                      bioName = meal ? `${meal.date} ${meal.meal_type}` : `Приём #${link.biometric_id}`;
                  } else if (link.biometric_value) {
                      bioName = link.biometric_value;
                  } else {
                      bioName = 'все приёмы пищи';
                  }
              } else if (link.biometric_type === 'activity') {
                  if (link.biometric_id) {
                      const act = activitiesCatalog.find(a => a.id === link.biometric_id);
                      bioName = act ? `${act.date} ${act.activity_type}` : `Активность #${link.biometric_id}`;
                  } else if (link.biometric_value) {
                      bioName = link.biometric_value;
                  } else {
                      bioName = 'все активности';
                  }
              } else if (link.biometric_type === 'measurement') {
                  if (link.biometric_id) {
                      const meas = measurementsCatalog.find(m => m.id === link.biometric_id);
                      bioName = meas ? meas.date : `Измерение #${link.biometric_id}`;
                  } else if (link.biometric_value) {
                      bioName = link.biometric_value;
                  } else {
                      bioName = 'все измерения';
                  }
              }
              const bonusStr = [];
              ['i','s','w','e','c','h','st','money'].forEach(k => {
                  if (link[`bonus_${k}`] !== 0) bonusStr.push(`${k.toUpperCase()}[${link[`bonus_${k}`].toFixed(2)}]`);
              });
              report += `  ${habit?.name || '?'} ↔ ${bioName} → ${bonusStr.join(' ')}\n`;
          }
      }
      
      if (activeFinanceLinks.length > 0) {
          report += `Связи привычка ↔ финансы:\n`;
          for (const link of activeFinanceLinks) {
              const habit = habitsCatalog.find(h => h.id === link.habit_id);
              const bonusStr = [];
              ['i','s','w','e','c','h','st','money'].forEach(k => {
                  if (link[`bonus_${k}`] !== 0) bonusStr.push(`${k.toUpperCase()}[${link[`bonus_${k}`].toFixed(2)}]`);
              });
              report += `  ${habit?.name || '?'} ↔ ${link.finance_type}${link.category_id ? ` (категория ${link.category_id})` : ''}, порог ${link.threshold} → ${bonusStr.join(' ')}\n`;
          }
      }
      
      if (activeAutoBonuses.length > 0) {
          report += `Автоматические бонусы от биометрики:\n`;
          for (const bonus of activeAutoBonuses) {
              const bonusStr = [];
              ['i','s','w','e','c','h','st','money'].forEach(k => {
                  if (bonus[`bonus_${k}`] !== 0) bonusStr.push(`${k.toUpperCase()}[${bonus[`bonus_${k}`].toFixed(2)}]`);
              });
              let bonusName = bonus.biometric_type;
              if (bonus.biometric_value) bonusName = bonus.biometric_value;
              else if (bonus.biometric_id) bonusName = `${bonus.biometric_type} #${bonus.biometric_id}`;
              report += `  ${bonusName}: ${bonus.description || 'без описания'} → ${bonusStr.join(' ')}\n`;
          }
      }
  }

  // === ФИНАНСЫ ===
  if (currentFinanceData && currentFinanceData.length > 0) {
      report += `\n=== ФИНАНСЫ (сегодня) ===\n`;

      let dayIncome = 0, dayExpense = 0;
      for (const tx of currentFinanceData) {
          const cat = categoriesMap[tx.category_id];
          if (cat && cat.type === 'income') dayIncome += tx.amount;
          else dayExpense += tx.amount;
      }

      report += `Доход: ${dayIncome.toFixed(2)}, Расход: ${dayExpense.toFixed(2)}, Чистая прибыль: ${(dayIncome - dayExpense).toFixed(2)}\n`;
  } else {
      report += `\n=== ФИНАНСЫ (сегодня) ===\nНет транзакций на текущую дату.\n`;
  }

  report += `\n=== ФИНАНСЫ (периоды) ===\n`;
  ['week', 'month', 'all'].forEach(period => {
      const fs = financePeriodStats[period];
      if (fs) {
          report += `За ${period === 'all' ? 'всё время' : period}: доход ${fs.income.toFixed(2)}, расход ${fs.expense.toFixed(2)}, чистая прибыль ${fs.net.toFixed(2)}\n`;
      } else {
          report += `За ${period === 'all' ? 'всё время' : period}: нет данных\n`;
      }
  });

  // ... внутри updateReportOutput() после финансов
  // === ЦЕЛИ ===
  try {
      const goalsData = await fetchAPI('/api/goals/progress?date=' + (elements.reportDateEl.value || toISODate(new Date())));
      if (goalsData.data && goalsData.data.length > 0) {
          report += `\n=== ЦЕЛИ ===\n`;
          for (const goal of goalsData.data) {
              report += `🎯 ${goal.name}: ${goal.current}/${goal.target} (${goal.percent}%)\n`;
              report += `   Период: ${goal.start_date} – ${goal.end_date}\n`;
              if (goal.description) report += `   Описание: ${goal.description}\n`;
          }
      }
  } catch(e) {
      console.warn('Goals not loaded', e);
  }

  // === ПРИНЯТЫЕ ВЕЩЕСТВА ===
  if (currentBiometricData.intakes && currentBiometricData.intakes.length > 0) {
      report += `\n=== ПРИНЯТЫЕ ВЕЩЕСТВА ===\n`;
      const substanceMap = {};
      substancesCatalog.forEach(s => { substanceMap[s.id] = s; });
      for (const intake of currentBiometricData.intakes) {
          const sub = substanceMap[intake.substance_id];
          const status = intake.taken ? '✓' : '✗';
          report += `${sub ? sub.name : `Вещество #${intake.substance_id}`}: ${status}\n`;
      }
  }

  // === РАЦИОН ===
  if (currentBiometricData.meals && currentBiometricData.meals.length > 0) {
      report += `\n=== РАЦИОН ===\n`;
      for (const meal of currentBiometricData.meals) {
          const mealType = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' }[meal.meal_type] || meal.meal_type;
          report += `${mealType}: ${meal.description || ''}${meal.calories ? ` (${meal.calories} ккал)` : ''}\n`;
          if (meal.notes) report += `  Примечание: ${meal.notes}\n`;
      }
  }


  // === ФИЗИЧЕСКИЕ ИЗМЕРЕНИЯ ===
  if (currentBiometricData.measurements && currentBiometricData.measurements.length > 0) {
      report += `\n=== ИЗМЕРЕНИЯ ===\n`;
      for (const m of currentBiometricData.measurements) {
          const parts = [];
          if (m.weight) parts.push(`Вес: ${m.weight} кг`);
          if (m.body_fat_percent) parts.push(`% жира: ${m.body_fat_percent}`);
          if (m.muscle_mass) parts.push(`Мышечная масса: ${m.muscle_mass} кг`);
          if (m.heart_rate) parts.push(`Пульс: ${m.heart_rate}`);
          if (m.blood_pressure_systolic && m.blood_pressure_diastolic) parts.push(`Давление: ${m.blood_pressure_systolic}/${m.blood_pressure_diastolic}`);
          report += parts.join(', ') + '\n';
          if (m.notes) report += `  Примечание: ${m.notes}\n`;
      }
  }

  // === ФИЗИЧЕСКАЯ АКТИВНОСТЬ ===
  if (currentBiometricData.activities && currentBiometricData.activities.length > 0) {
      report += `\n=== ФИЗИЧЕСКАЯ АКТИВНОСТЬ ===\n`;
      for (const a of currentBiometricData.activities) {
          report += `${a.activity_type}: ${a.quantity}${a.intensity ? ` (интенсивность ${a.intensity}/10)` : ''}\n`;
          if (a.notes) report += `  Примечание: ${a.notes}\n`;
      }
  }

  // === НАВЫКИ ===
  try {
    const skillsResp = await fetchAPI("/api/skills/with-levels");
    const skills = skillsResp.data;
    if (skills && skills.length > 0) {
      report += `\n=== НАВЫКИ И РАНГИ ===\n`;
      for (const skill of skills) {
        report += `📖 ${skill.name}: уровень ${skill.level} (${skill.level_name}), всего ${skill.total_hours.toFixed(1)} ч, прогресс ${skill.progress_percent.toFixed(1)}%\n`;
        if (skill.description) report += `   Описание: ${skill.description}\n`;
      }
    } else {
      report += `\n=== НАВЫКИ ===\nНет данных. Добавьте навыки в справочник.\n`;
    }
  } catch(e) {
    report += `\n=== НАВЫКИ ===\nОшибка загрузки: ${e.message}\n`;
  }

  // === КАЛОРИИ (баланс) ===
  let totalCaloriesBurned = 0;
  let totalCaloriesIntake = 0;

  // Считаем потраченные калории
  if (currentBiometricData.activities && currentBiometricData.activities.length > 0) {
      for (const a of currentBiometricData.activities) {
          const calPerUnit = a.calories_per_unit || 0;
          totalCaloriesBurned += a.quantity * calPerUnit;
      }
  }
  // Считаем полученные калории из приёмов пищи
  if (currentBiometricData.meals && currentBiometricData.meals.length > 0) {
      for (const m of currentBiometricData.meals) {
          totalCaloriesIntake += m.calories || 0;
      }
  }
  const balance = totalCaloriesIntake - totalCaloriesBurned;
  report += `\n=== КАЛОРИИ ===\n`;
  report += `🔥 Потрачено: ${totalCaloriesBurned.toFixed(0)} ккал\n`;
  report += `🍽 Получено: ${totalCaloriesIntake.toFixed(0)} ккал\n`;
  report += `⚖️ Баланс: ${balance >= 0 ? '+' : ''}${balance.toFixed(0)} ккал (${balance >= 0 ? 'профицит' : 'дефицит'})\n`;  

  // === МЕНТАЛЬНЫЕ ПОКАЗАТЕЛИ ===
  if (currentBiometricData.mental && currentBiometricData.mental.length > 0) {
      report += `\n=== МЕНТАЛЬНЫЕ ПОКАЗАТЕЛИ ===\n`;
      for (const m of currentBiometricData.mental) {
          const fields = [];
          if (m.focus) fields.push(`Фокус: ${m.focus}/10`);
          if (m.attention) fields.push(`Внимание: ${m.attention}/10`);
          if (m.thinking_speed) fields.push(`Быстрота мышления: ${m.thinking_speed}/10`);
          if (m.energy) fields.push(`Энергия: ${m.energy}/10`);
          if (m.mood) fields.push(`Настроение: ${m.mood}/10`);
          if (m.thinking_type) fields.push(`Тип мышления: ${m.thinking_type}`);
          report += fields.join(', ') + '\n';
          if (m.notes) report += `  Примечание: ${m.notes}\n`;
      }
  }


  elements.reportOutput.textContent = report;
}

function showModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = "flex";
}

function hideModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = "none";
}

function showEditHabitModal(idx, category) {
  const item = parsed[idx];
  document.getElementById("editIndex").value = idx;
  document.getElementById("editName").value = item.name;
  document.getElementById("editCategory").value = item.category;
  document.getElementById("editQuantity").value = item.quantity || "";
  document.getElementById("editUnit").value = item.unit || "";
  document.getElementById("editSuccess").value = item.success ? "1" : "0";
  showModal("habitEditModal");
}



function addHabitToCatalog(habit, category) {
  const data = {
    name: habit.name,
    category: category || "Без категории",
    default_quantity: habit.quantity,
    unit: habit.unit,
    i: habit.stats.I, s: habit.stats.S, w: habit.stats.W,
    e: habit.stats.E, c: habit.stats.C, h: habit.stats.H,
    st: habit.stats.ST, money: habit.stats.$
  };
  fetchAPI("/api/habits/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  }).then(() => {
    alert("✓ Привычка добавлена в справочник!");
    loadHabitsCatalog().then(() => { renderTasks(); });
  }).catch(e => alert("Ошибка: " + e.message));
}

function filterHabits() {
  const search = document.getElementById("habitSearch").value.toLowerCase();
  const list = document.getElementById("habitCatalogList");
  const items = list.querySelectorAll(".habit-option");
  
  items.forEach(item => {
    const visible = item.textContent.toLowerCase().includes(search);
    item.style.display = visible ? "block" : "none";
  });
}

function updateCatalogModal() {
  const list = document.getElementById("habitCatalogList");
  if (!list) return;
  
  list.innerHTML = "";
  let currentCategory = null;
  
  habitsCatalog.forEach(habit => {
    if (habit.category !== currentCategory) {
      currentCategory = habit.category;
      const catHeader = document.createElement("div");
      catHeader.className = "category-header";
      catHeader.style.fontWeight = "bold";
      catHeader.style.padding = "8px 4px";
      catHeader.style.marginTop = "8px";
      catHeader.textContent = currentCategory;
      list.appendChild(catHeader);
    }
    
    const option = document.createElement("div");
    option.className = "habit-option";
    option.style.padding = "6px 4px";
    option.style.cursor = "pointer";
    option.style.borderRadius = "4px";
    option.onmouseover = () => option.style.backgroundColor = "#f0f0f0";
    option.onmouseout = () => option.style.backgroundColor = "transparent";
    
    let text = habit.name;
    if (habit.default_quantity) text += ` — ${habit.default_quantity}${habit.unit ? " " + habit.unit : ""}`;
    option.textContent = text;
    option.onclick = () => addHabitToText(habit);
    list.appendChild(option);
  });
}

function addHabitToText(habit) {
  const category = habit.category || "Без категории";
  const stats = {
    I: habit.i || 0, S: habit.s || 0, W: habit.w || 0,
    E: habit.e || 0, C: habit.c || 0, H: habit.h || 0,
    ST: habit.st || 0, $: habit.money || 0
  };
  const inserted = {
    type: "habit",
    name: habit.name,
    category,
    success: true,
    quantity: habit.default_quantity || null,
    unit: habit.unit || null,
    stats,
  };

  let categoryIdx = parsed.findIndex(p => p.type === "category" && p.text === category);
  if (categoryIdx === -1) {
    parsed.push({ type: "category", text: category });
    parsed.push({ type: "blank" });
    categoryIdx = parsed.findIndex(p => p.type === "category" && p.text === category);
  }

  let insertPosition = categoryIdx + 1;
  while (insertPosition < parsed.length && parsed[insertPosition].type === "habit") {
    insertPosition++;
  }

  parsed.splice(insertPosition, 0, inserted);
  elements.tasksInput.value = serializeParsedToText();
  parseTextInput();
  hideModal("habitCatalogModal");
}

function saveToLocalStorage() {
  const data = {
    tasksInput: elements.tasksInput.value,
    firstDay: elements.firstDayEl.value,
    firstDate: elements.firstDateEl.value,
    lastDay: elements.lastDayEl.value,
    lastDate: elements.lastDateEl.value,
    reportDate: elements.reportDateEl.value,
    state: elements.stateSelect.value,
    thoughts: elements.thoughtsInput.value,
    friction: elements.frictionIndex.value,
  };
  localStorage.setItem("disciplineReport", JSON.stringify(data));
  alert("✓ Сохранено в localStorage");
}

function loadFromLocalStorage() {
  const data = JSON.parse(localStorage.getItem("disciplineReport") || "{}");
  if (data.tasksInput) elements.tasksInput.value = data.tasksInput;
  if (data.firstDay) elements.firstDayEl.value = data.firstDay;
  if (data.firstDate) elements.firstDateEl.value = data.firstDate;
  if (data.lastDay) elements.lastDayEl.value = data.lastDay;
  if (data.lastDate) elements.lastDateEl.value = data.lastDate;
  if (data.reportDate) elements.reportDateEl.value = data.reportDate;
  if (data.state) elements.stateSelect.value = data.state;
  if (data.thoughts) elements.thoughtsInput.value = data.thoughts;
  if (data.friction) {
    elements.frictionIndex.value = data.friction;
    elements.frictionValue.textContent = data.friction;
  }
  parseTextInput();
}

async function loadFinanceData(date) {
    try {
        const data = await fetchAPI(`/api/finance_transactions/list?date=${date}`);
        return data.data;
    } catch (e) {
        console.warn('Failed to load finance data', e);
        return [];
    }
}

async function loadBiometricData(date) {
    const result = {};
    try {
        result.intakes = (await fetchAPI(`/api/biometric_intake_log/list?date=${date}`)).data;
        result.meals = (await fetchAPI(`/api/biometric_meals/list?date=${date}`)).data;
        result.measurements = (await fetchAPI(`/api/biometric_measurements/list?date=${date}`)).data;
        result.activities = (await fetchAPI(`/api/biometric_physical_activity/list?date=${date}`)).data;
        result.mental = (await fetchAPI(`/api/biometric_mental_daily/list?date=${date}`)).data;
        return result;
    } catch (e) {
        console.warn('Failed to load biometric data', e);
        return { intakes: [], meals: [], measurements: [], activities: [], mental: [] };
    }
}

async function loadSubstancesCatalog() {
    try {
        const data = await fetchAPI("/api/biometric_substances/list");
        substancesCatalog = data.data;
    } catch (e) {
        console.warn("Failed to load substances", e);
        substancesCatalog = [];
    }
}

async function saveToDatabase() {
  try {
    const friction = parseInt(elements.frictionIndex.value) || 1;
    const totals = calculateTotalStatsWithLinks(parsed, friction, currentBiometricData, currentFinanceData);
    console.log("🔵 saveToDatabase: STEP 1 - totals calculated:", totals);

    // КРИТИЧНОЕ: убеждаемся что дата установлена!
    if (!elements.reportDateEl.value) {
      const today = toISODate(new Date());
      elements.reportDateEl.value = today;
      console.warn("⚠️ saveToDatabase: reportDateEl была пуста! Установлена текущая дата:", today);
    }

    const completionData = {
      date: elements.reportDateEl.value,
      day_number: parseInt(elements.currentDayDisplay.textContent) || 1,
      state: elements.stateSelect.value,
      thoughts: elements.thoughtsInput.value,
      friction_index: friction,
      totals: totals
    };

    console.log("🔵 saveToDatabase: STEP 2 - completionData:", {
      date: completionData.date,
      day_number: completionData.day_number,
      habits_count: parsed.filter(p => p.type === "habit").length
    });
    console.log("🔵 saveToDatabase: STEP 2b - FULL completionData:", completionData);
    
    console.log("🔵 saveToDatabase: STEP 3 - checking existing completion for date:", completionData.date);
    let response = await fetchAPI(`/api/completions/list?date=${completionData.date}`);
    console.log("🔵 saveToDatabase: STEP 4 - list response count:", response.data ? response.data.length : 0);
    let completionId;

    if (response.data && response.data.length > 0) {
      completionId = response.data[0].id;
      console.log("🔵 saveToDatabase: STEP 5 - updating existing completion ID:", completionId);
      const updateRes = await fetchAPI(`/api/completions/update/${completionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completionData)
      });
      console.log("🔵 saveToDatabase: STEP 6 - update response:", updateRes);
    } else {
      console.log("🔵 saveToDatabase: STEP 5 - creating NEW completion for date:", completionData.date);
      const create = await fetchAPI("/api/completions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completionData)
      });
      console.log("🔵 saveToDatabase: STEP 6 - create response:", create);
      completionId = create.data.id;
      console.log("✅ saveToDatabase: STEP 7 - SUCCESS! Created completion with ID:", completionId, "for date:", completionData.date);
    }

    const old = await fetchAPI(`/api/completion_habits/list?completion_id=${completionId}`);
    console.log("🔵 saveToDatabase: STEP 8 - deleting old habits, count:", old.data ? old.data.length : 0);
    for (const h of old.data) {
      await fetchAPI(`/api/completion_habits/delete/${h.id}`, { method: "DELETE" });
    }

    const rawHabits = [];
    parsed.forEach(item => {
      if (item.type === "habit") {
        rawHabits.push(item);
      }
    });

    console.log("🔵 saveToDatabase: STEP 9 - saving", rawHabits.length, "habits");
    for (const h of rawHabits) {
      const catalogHabit = habitsCatalog.find(c => c.name === h.name && c.category === h.category);
      const payload = {
        completion_id: completionId,
        habit_id: catalogHabit ? catalogHabit.id : null,
        name: h.name,
        category: h.category || "Без категории",
        success: h.success ? 1 : 0,
        quantity: h.quantity || null,
        unit: h.unit || null,
        i: h.stats.I, s: h.stats.S, w: h.stats.W,
        e: h.stats.E, c: h.stats.C, hh: h.stats.H,
        st: h.stats.ST, money: h.stats.$,
      };
      await fetchAPI("/api/completion_habits/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }

    // После сохранения гарантируем, что поля первого/последнего дня синхронизированы
    if (!elements.firstDateEl.value) elements.firstDateEl.value = completionData.date;
    if (!elements.firstDayEl.value) elements.firstDayEl.value = completionData.day_number;
    elements.lastDateEl.value = completionData.date;
    elements.lastDayEl.value = completionData.day_number;

    console.log("✅ ✅ ✅ saveToDatabase: УСПЕХ! Данные сохранены в БД");
    alert("✓ Сохранено в БД!\nДата: " + completionData.date + "\nПривычек: " + rawHabits.length);
    loadDatesFromDB();
    loadStreaks();
  } catch (e) {
    console.error("🔴 saveToDatabase: ОШИБКА:", e);
    console.error("🔴 saveToDatabase: stack:", e.stack);
    alert("❌ Ошибка при сохранении: " + e.message);
  }
}

// Немедленный запуск инициализации для поддержки динамической загрузки через include-loader.js
(async () => {
  try {
    console.log("🔵 report.js: immediate init start");
    
    // Инициализируем элементы ПЕРВЫМИ
    const initOk = initializeElements();
    if (!initOk) {
      console.error("🔴 КРИТИЧНАЯ ОШИБКА: initializeElements вернул false!");
      throw new Error("Не удалось инициализировать элементы страницы");
    }
    
    // Загружаем каталоги
    await loadHabitsCatalog();
    await loadCombinations();
    await loadStreaks();
    await loadDatesFromDB()

    console.log("🔵 Регистрация обработчиков событий...");
    
    // Проверим что кнопки доступны
    const buttonNames = ["parseBtn", "saveBtn", "loadBtn", "clearBtn", "sampleBtn", "saveToDBBtn", "makeReportBtn", "copyReport", "downloadReport"];
    buttonNames.forEach(name => {
      if (elements[name]) {
        console.log(`✅ ${name} найдена`);
      } else {
        console.warn(`⚠️ ${name} НЕ НАЙДЕНА!`);
      }
    });
    
    elements.parseBtn?.addEventListener("click", () => {
      try {
        console.log("🔵 parseBtn clicked");
        parseTextInput();
      } catch (e) {
        console.error("🔴 Error in parseBtn:", e);
        alert("Ошибка парсинга: " + e.message);
      }
    });
    
    elements.saveBtn?.addEventListener("click", () => {
      try {
        saveToLocalStorage();
      } catch (e) {
        console.error("🔴 Error in saveBtn:", e);
      }
    });
    
    elements.loadBtn?.addEventListener("click", () => {
      try {
        loadFromLocalStorage();
        alert("✓ Загружено из localStorage");
      } catch (e) {
        console.error("🔴 Error in loadBtn:", e);
      }
    });
    
    elements.clearBtn?.addEventListener("click", () => {
      try {
        if (confirm("Очистить все данные?")) {
          localStorage.removeItem("disciplineReport");
          elements.tasksInput.value = "";
          parsed = [];
          elements.thoughtsInput.value = "";
          elements.stateSelect.value = "WORK";
          renderTasks();
          renderMeta();
        }
      } catch (e) {
        console.error("🔴 Error in clearBtn:", e);
      }
    });
    
    elements.sampleBtn?.addEventListener("click", () => {
      try {
        console.log("🔵 sampleBtn clicked - loading sample data");
        const sampleText = `Здоровье
———————————————
+ Упражнения — 30 мин I[0.01] S[0.02] W[0.03] E[0] C[0] H[0.05] ST[1] $[0]
+ Пить воду — 2л I[0] S[0] W[0.01] E[0] C[0] H[0.02] ST[1] $[0]

Развитие
———————————————
+ Чтение — 30 страниц I[0.02] S[0.00] W[0.00] E[0.01] C[0.01] H[0.00] ST[1] $[0]

Работа
———————————————
+ Основной проект — 4 часа I[0.05] S[0.00] W[0.01] E[0.00] C[0.02] H[0.00] ST[2] $[50]`;
        
        console.log("🔵 sampleBtn - setting tasksInput value");
        if (!elements.tasksInput) {
          console.error("🔴 tasksInput элемент не найден!");
          alert("❌ Ошибка: tasksInput элемент не найден");
          return;
        }
        
        elements.tasksInput.value = sampleText;
        console.log("🔵 sampleBtn - setting thoughtsInput value");
        elements.thoughtsInput.value = "Хороший продуктивный день!";
        
        console.log("🔵 sampleBtn - calling parseTextInput()");
        parseTextInput();
        
        console.log("🔵 sampleBtn - success, showing alert");
        alert("✓ Пример загружен");
      } catch (e) {
        console.error("🔴 Error in sampleBtn:", e);
        console.error("🔴 Stack:", e.stack);
        alert("❌ Ошибка при загрузке примера: " + e.message);
      }
    });
    
    elements.addFromCatalogBtn?.addEventListener("click", () => {
      try {
        updateCatalogModal();
        showModal("habitCatalogModal");
      } catch (e) {
        console.error("🔴 Error in addFromCatalogBtn:", e);
      }
    });

    elements.dbDateSelect?.addEventListener("change", () => {
      try {
        console.log("🔵 dbDateSelect changed, calling loadDayFromDB");
        loadDayFromDB();
      } catch (e) {
        console.error("🔴 Error in dbDateSelect change:", e);
        alert("❌ Ошибка: " + e.message);
      }
    });
    
    elements.saveToDBBtn?.addEventListener("click", () => {
      try {
        saveToDatabase();
      } catch (e) {
        console.error("🔴 Error in saveToDBBtn:", e);
      }
    });
    
    elements.makeReportBtn?.addEventListener("click", () => {
      try {
        updateReportOutput();
      } catch (e) {
        console.error("🔴 Error in makeReportBtn:", e);
      }
    });
    
    elements.copyReport?.addEventListener("click", () => {
      try {
        navigator.clipboard.writeText(elements.reportOutput.textContent);
        alert("📋 Скопировано в буфер!");
      } catch (e) {
        console.error("🔴 Error in copyReport:", e);
      }
    });
    
    elements.downloadReport?.addEventListener("click", () => {
      try {
        const text = elements.reportOutput.textContent;
        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `report_${toISODate(new Date())}.txt`;
        a.click();
      } catch (e) {
        console.error("🔴 Error in downloadReport:", e);
      }
    });

    elements.frictionIndex?.addEventListener("change", () => {
      try {
        elements.frictionValue.textContent = elements.frictionIndex.value;
        renderMeta();
      } catch (e) {
        console.error("🔴 Error in frictionIndex change:", e);
      }
    });

    document.getElementById("saveEditBtn")?.addEventListener("click", async () => {
      const idx = parseInt(document.getElementById("editIndex").value);
      const item = parsed[idx];
      if (item && item.type === "habit") {
        const oldName = item.name;
        const oldCategory = item.category;
        
        item.name = document.getElementById("editName").value;
        item.category = document.getElementById("editCategory").value;
        item.quantity = parseFloat(document.getElementById("editQuantity").value) || null;
        item.unit = document.getElementById("editUnit").value;
        item.success = document.getElementById("editSuccess").value === "1";
        
        const catalogHabit = habitsCatalog.find(h => h.name === oldName && h.category === oldCategory);
        if (catalogHabit) {
          try {
            await fetchAPI(`/api/habits/update/${catalogHabit.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: item.name,
                category: item.category,
                default_quantity: item.quantity,
                unit: item.unit,
              })
            });
            await loadHabitsCatalog();
          } catch (e) {
            console.warn("Error updating habit:", e);
          }
        }
        
        renderTasks();
        renderMeta();
        hideModal("habitEditModal");
      }
    });

    document.getElementById("habitSearch")?.addEventListener("input", filterHabits);

    console.log("🔵 Загрузка начальных данных...");
    await loadPeriodStats('all');
    await loadFinancePeriodStats('week');
    await loadFinancePeriodStats('month');
    await loadFinancePeriodStats('all');
    await loadAndRenderSkills();
    await loadAllLinks();
    await loadBiometricCatalogs();      // +++ добавить
    await loadFinanceCategories();       // +++ добавить
    
    
    const today = toISODate(new Date());
    if (!elements.reportDateEl.value) {
      elements.reportDateEl.value = today;
      console.log("🔵 Установлена дата отчёта:", today);
    }
    
    renderMeta();
    
    console.log("✅ ✅ ✅ ИНИЦИАЛИЗАЦИЯ ЗАВЕРШЕНА УСПЕШНО ✅ ✅ ✅");
    console.log("ℹ️ Можете использовать все кнопки и функции!");
    console.log("ℹ️ Текущая дата отчёта:", elements.reportDateEl.value);
  } catch (error) {
    console.error("🔴 🔴 🔴 КРИТИЧЕСКАЯ ОШИБКА ПРИ ИНИЦИАЛИЗАЦИИ 🔴 🔴 🔴:", error);
    console.error("🔴 Stack:", error.stack);
    alert("❌ КРИТИЧЕСКАЯ ОШИБКА: " + error.message + "\n\nЧто-то очень серьёзное произошло. Смотрите консоль (F12) для деталей.");
  }
})();







