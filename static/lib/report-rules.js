// static/lib/report-rules.js
// Чистые функции для парсинга текста привычек, декларативных правил и расчёта характеристик.
// Зависит только от глобального AIFrame (Prolog-движок).
// Никаких DOM-зависимостей, API-запросов или управления состоянием.

const ReportRules = {
  /**
   * Парсит строку характеристик вида "I[0.01] S[0.02] ST[1] $[-2.5]"
   * и возвращает объект с ключами {I, S, W, E, C, H, ST, $}.
   * @param {string} text
   * @returns {{I:number, S:number, W:number, E:number, C:number, H:number, ST:number, $:number}}
   */
  parseCharacteristics(text) {
    const stats = { I: 0, S: 0, W: 0, E: 0, C: 0, H: 0, ST: 0, $: 0 };
    if (!text) return stats;
    const regex = /([ISWEHC]|ST|\$)\[([-\d.]+)\]/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const value = parseFloat(match[2]);
      if (!isNaN(value)) {
        stats[match[1]] = value;
      }
    }
    return stats;
  },

  /**
   * Форматирует объект характеристик обратно в строку для отчёта.
   * @param {{I:number, S:number, W:number, E:number, C:number, H:number, ST:number, $:number}} stats
   * @returns {string}
   */
  formatStats(stats) {
    return `I[${stats.I.toFixed(2)}] S[${stats.S.toFixed(2)}] W[${stats.W.toFixed(2)}] E[${stats.E.toFixed(2)}] C[${stats.C.toFixed(2)}] H[${stats.H.toFixed(2)}] ST[${Number(stats.ST).toFixed(2)}] $[${stats.$}]`;
  },

  /**
   * Парсит текст привычек в структурированный массив.
   * Формат:
   *   Категория
   *   + Название привычки — 30 мин I[0.01] S[0.02] ...
   *   - Название (провал)
   *
   * Использует AIFrame.Refal для обработки строк (правила можно заменить на прямые регулярки).
   * @param {string} text
   * @returns {Array<{type:'category'|'habit', ...}>}
   */
  parseText(text) {
    if (!text) return [];

    // Локальные правила парсинга, не трогают глобальный AIFrame.Refal
    const localRules = [
      { pattern: /^\s*$/gm, replacement: '' },
      { pattern: /^[—\-–=]{3,}\s*$/gm, replacement: '' },
      {
        pattern: /^(?!\s*[+-])(.+)$/gm,
        replacement: (match, content) => `⟦category⟧${content.trim()}`
      },
      {
        pattern: /^\s*([+-])\s+(.*?)(\s+I\[.*)?$/gm,
        replacement: (match, sign, mainPart, statsPart) => {
          const success = sign === '+' ? '✓' : '✗';
          let name = mainPart.trim();
          let quantity = '';
          let unit = '';
          const quantMatch = name.match(/^(.+?)\s+—\s+(\d+(?:\.\d+)?)\s*(.+)$/);
          if (quantMatch) {
            name = quantMatch[1].trim();
            quantity = quantMatch[2];
            unit = quantMatch[3].trim();
          }
          const stats = statsPart ? statsPart.trim() : '';
          return `⟦habit⟧${success}⟧${name}⟧${quantity}⟧${unit}⟧${stats}`;
        }
      }
    ];

    const result = [];
    let currentCategory = 'Без категории';
    const lines = text.split('\n');

    for (const line of lines) {
      let processed = line;
      if (typeof AIFrame !== 'undefined' && AIFrame.Refal) {
        processed = AIFrame.Refal.applyWith(processed, localRules);
      } else {
        // Fallback без Refal (использует те же правила, но вручную)
        if (/^[—\-–=]{3,}$/.test(processed.trim())) continue;
        if (/^\s*$/.test(processed)) continue;
        if (/^[^+-]/.test(processed.trim())) {
          currentCategory = processed.trim();
          result.push({ type: 'category', text: currentCategory });
          continue;
        }
        const match = processed.match(/^\s*([+-])\s+(.*)/);
        if (match) {
          const sign = match[1];
          let main = match[2];
          let statsStr = '';
          const statsIdx = main.indexOf(' I[');
          if (statsIdx > 0) {
            statsStr = main.substring(statsIdx + 1);
            main = main.substring(0, statsIdx);
          }
          const success = sign === '+';
          let name = main;
          let quantity = null, unit = null;
          const qm = main.match(/^(.+?)\s+—\s+(\d+(?:\.\d+)?)\s*(.+)$/);
          if (qm) {
            name = qm[1].trim();
            quantity = parseFloat(qm[2]);
            unit = qm[3].trim();
          }
          result.push({
            type: 'habit',
            name,
            category: currentCategory,
            success,
            quantity,
            unit,
            stats: this.parseCharacteristics(statsStr)
          });
        }
        continue;
      }

      // Обработка после Refal
      if (processed.startsWith('⟦category⟧')) {
        currentCategory = processed.slice('⟦category⟧'.length).trim();
        result.push({ type: 'category', text: currentCategory });
      } else if (processed.startsWith('⟦habit⟧')) {
        const parts = processed.split('⟧');
        if (parts.length < 3) continue;
        const success = parts[1] === '✓';
        const name = parts[2];
        const quantity = parts[3] ? parseFloat(parts[3]) : null;
        const unit = parts[4] || null;
        const statsStr = parts[5] || '';
        result.push({
          type: 'habit',
          name,
          category: currentCategory,
          success,
          quantity,
          unit,
          stats: this.parseCharacteristics(statsStr)
        });
      }
    }
    return result;
  },

  /**
   * Простой расчёт характеристик только по самим привычкам (без учёта бонусов).
   * Оставлен для совместимости и тестов.
   * @param {Array} parsedTasks
   * @param {number} [friction=1]
   * @returns {Object}
   */
  calculateStats(parsedTasks, friction = 1) {
    const totals = { I: 0, S: 0, W: 0, E: 0, C: 0, H: 0, ST: 0, $: 0 };
    const mult = 1 + (friction - 1) / 9;
    for (const item of parsedTasks) {
      if (item.type === 'habit' && item.success) {
        for (const k in totals) {
          totals[k] += (item.stats[k] || 0) * mult;
        }
      }
    }
    return totals;
  },

  /**
   * Сумма ключевых характеристик (I,S,W,E,C,H) для вычисления относительных показателей.
   * @param {Object} stats
   * @returns {number}
   */
  calculateStatSum(stats) {
    if (!stats) return 0;
    const keys = ['I', 'S', 'W', 'E', 'C', 'H'];
    return keys.reduce((acc, k) => acc + (Number(stats[k]) || 0), 0);
  },

  /**
   * Процент улучшения дня относительно общего прогресса.
   * @param {Object} daily - характеристики дня
   * @param {Object} total - суммарные характеристики за всё время
   * @returns {number}
   */
  calculateImprovementPercent(daily, total) {
    const dSum = this.calculateStatSum(daily);
    const tSum = this.calculateStatSum(total);
    if (tSum === 0) return dSum;
    return (dSum / tSum) * 100;
  },

  calculateCumulativeImprovement(currentTotals, baselineTotals) {
    if (!currentTotals || !baselineTotals) return null;
    const cur = this.calculateStatSum(currentTotals);
    const base = this.calculateStatSum(baselineTotals);
    if (base === 0) return null;
    return ((cur - base) / base) * 100;
  },

  /**
   * Загружает все декларативные правила бонусов в AIFrame.Rules.
   * Должно вызываться один раз при старте приложения, когда справочники уже загружены.
   * @param {Array} combos - массив сочетаний привычка-привычка
   * @param {Array} bioLinks - массив связей привычка ↔ биометрика
   * @param {Array} financeLinks - массив связей привычка ↔ финансы
   * @param {Array} autoBonuses - массив автобонусов от биометрики
   */
  loadRules(combos, bioLinks, financeLinks, autoBonuses) {
    if (typeof AIFrame === 'undefined' || !AIFrame.Rules) {
      console.error('ReportRules.loadRules: AIFrame.Rules не найден');
      return;
    }

    // Очищаем старые правила и факты
    AIFrame.Rules.rules = [];
    AIFrame.Rules.facts = []; // факты динамические, но сбросим для чистоты

    // 1. Базовое правило: выполнена привычка → её статы
    AIFrame.Rules.rule(
      ['habit_bonus', '$Day', '$HabitId', '$I', '$S', '$W', '$E', '$C', '$H', '$ST', '$M'],
      ['habit_done', '$Day', '$HabitId'],
      ['habit_stat', '$Day', '$HabitId', '$I', '$S', '$W', '$E', '$C', '$H', '$ST', '$M']
    );

    // 2. Комбинации привычка ↔ привычка
    for (const combo of combos) {
      AIFrame.Rules.rule(
        ['combo_bonus', '$Day', combo.habit_a, combo.habit_b,
         combo.i || 0, combo.s || 0, combo.w || 0, combo.e || 0,
         combo.c || 0, combo.h || 0, combo.st || 0, combo.money || 0],
        ['habit_done', '$Day', combo.habit_a],
        ['habit_done', '$Day', combo.habit_b]
      );
    }

    // 3. Связи привычка ↔ биометрика
    const bioPredicateMap = {
      substance: 'intake_taken',
      meal:      'meal_eaten',
      activity:  'activity_done',
      measurement: 'measurement_done'
    };

    for (const link of bioLinks) {
      const pred = bioPredicateMap[link.biometric_type];
      if (!pred) continue;
      const arg = link.biometric_id || '_'; // '_' означает "любой"
      AIFrame.Rules.rule(
        ['bio_link_bonus', '$Day', link.habit_id,
         link.bonus_i || 0, link.bonus_s || 0, link.bonus_w || 0, link.bonus_e || 0,
         link.bonus_c || 0, link.bonus_h || 0, link.bonus_st || 0, link.bonus_money || 0],
        ['habit_done', '$Day', link.habit_id],
        [pred, '$Day', arg]
      );
    }

    // 4. Связи привычка ↔ финансы
    for (const link of financeLinks) {
      let finPred = 'expense_sum';
      if (link.finance_type === 'income_active') finPred = 'income_active_sum';
      else if (link.finance_type === 'income_passive') finPred = 'income_passive_sum';

      AIFrame.Rules.rule(
        ['finance_link_bonus', '$Day', link.habit_id,
         link.bonus_i || 0, link.bonus_s || 0, link.bonus_w || 0, link.bonus_e || 0,
         link.bonus_c || 0, link.bonus_h || 0, link.bonus_st || 0, link.bonus_money || 0],
        ['habit_done', '$Day', link.habit_id],
        [finPred, '$Day', link.threshold || 0]
      );
    }

    // 5. Автоматические бонусы от биометрики (без привязки к привычкам)
    for (const bonus of autoBonuses) {
      const pred = bioPredicateMap[bonus.biometric_type];
      if (!pred) continue;
      const arg = bonus.biometric_id || '_';
      AIFrame.Rules.rule(
        ['auto_bio_bonus', '$Day',
         bonus.bonus_i || 0, bonus.bonus_s || 0, bonus.bonus_w || 0, bonus.bonus_e || 0,
         bonus.bonus_c || 0, bonus.bonus_h || 0, bonus.bonus_st || 0, bonus.bonus_money || 0],
        [pred, '$Day', arg]
      );
    }
  },

  /**
   * Главный метод: вычисляет итоговые характеристики дня с учётом всех правил.
   * @param {Array} parsedTasks - результат parseText
   * @param {Object} context - см. ниже
   * @param {number} context.friction
   * @param {Array}  context.habitsCatalog - массив объектов привычек с полями id, name, category
   * @param {Object} context.currentBiometricData - { intakes, meals, activities, measurements }
   * @param {Array}  context.currentFinanceData - массив транзакций
   * @param {Object} context.financeCategoriesMap - карта ID категории -> объект { type, is_active }
   * @returns {{I:number, S:number, W:number, E:number, C:number, H:number, ST:number, $:number}}
   */
  evaluate(parsedTasks, context) {
    const {
      friction,
      habitsCatalog,
      currentBiometricData = {},
      currentFinanceData = [],
      financeCategoriesMap = {}
    } = context;
    const day = 'today';
    const mult = 1 + (friction - 1) / 9;

    // Инициализация totals
    const totals = { I: 0, S: 0, W: 0, E: 0, C: 0, H: 0, ST: 0, $: 0 };

    if (typeof AIFrame === 'undefined' || !AIFrame.Rules) {
      // Fallback на статический расчёт без бонусов
      return this.calculateStats(parsedTasks, context.friction);
    }

    // Сброс динамических фактов (правила уже загружены)
    AIFrame.Rules.facts = [];

    // Построение карты имя+категория -> id
    const nameToId = {};
    for (const h of habitsCatalog) {
      nameToId[`${h.name}|${h.category}`] = h.id;
    }

    // === 1. Факты о привычках ===
    for (const item of parsedTasks) {
      if (item.type === 'habit' && item.success) {
        const habitId = nameToId[`${item.name}|${item.category}`];
        if (habitId !== undefined) {
          AIFrame.Rules.fact('habit_done', day, habitId);
          AIFrame.Rules.fact('habit_stat', day, habitId,
            item.stats.I || 0, item.stats.S || 0, item.stats.W || 0,
            item.stats.E || 0, item.stats.C || 0, item.stats.H || 0,
            item.stats.ST || 0, item.stats.$ || 0);
        }
      }
    }

    // === 2. Факты биометрики ===
    const bio = currentBiometricData;
    (bio.intakes || []).forEach(i => { if (i.taken) AIFrame.Rules.fact('intake_taken', day, i.substance_id); });
    (bio.meals || []).forEach(m => AIFrame.Rules.fact('meal_eaten', day, m.id));
    (bio.activities || []).forEach(a => AIFrame.Rules.fact('activity_done', day, a.id));
    (bio.measurements || []).forEach(m => AIFrame.Rules.fact('measurement_done', day, m.id));

    // === 3. Финансовые факты ===
    let incomeActive = 0, incomePassive = 0, totalExpense = 0;
    for (const tx of currentFinanceData) {
      const cat = financeCategoriesMap[tx.category_id];
      if (!cat) continue;
      if (cat.type === 'income') {
        if (cat.is_active) incomeActive += tx.amount;
        else incomePassive += tx.amount;
      } else {
        totalExpense += tx.amount;
      }
    }
    AIFrame.Rules.fact('income_active_sum', day, incomeActive);
    AIFrame.Rules.fact('income_passive_sum', day, incomePassive);
    AIFrame.Rules.fact('expense_sum', day, totalExpense);

    // === 4. Суммирование базовых характеристик из привычек ===
    for (const item of parsedTasks) {
      if (item.type === 'habit' && item.success) {
        totals.I += (item.stats.I || 0) * mult;
        totals.S += (item.stats.S || 0) * mult;
        totals.W += (item.stats.W || 0) * mult;
        totals.E += (item.stats.E || 0) * mult;
        totals.C += (item.stats.C || 0) * mult;
        totals.H += (item.stats.H || 0) * mult;
        totals.ST += (item.stats.ST || 0) * mult;
        totals.$ += (item.stats.$ || 0) * mult;
      }
    }

    // === 5. Запросы к Prolog-движку и суммирование бонусов ===

    const addSolutions = (goal) => {
      const solutions = AIFrame.Rules.query(goal);
      for (const sol of solutions) {
        totals.I += (sol.I || 0) * mult;
        totals.S += (sol.S || 0) * mult;
        totals.W += (sol.W || 0) * mult;
        totals.E += (sol.E || 0) * mult;
        totals.C += (sol.C || 0) * mult;
        totals.H += (sol.H || 0) * mult;
        totals.ST += (sol.ST || 0) * mult;
        totals.$ += (sol.M || 0) * mult;
      }
    };

    // Все типы бонусов
    addSolutions(['habit_bonus', day, '$H', '$I', '$S', '$W', '$E', '$C', '$H', '$ST', '$M']);
    addSolutions(['combo_bonus', day, '$A', '$B', '$I', '$S', '$W', '$E', '$C', '$H', '$ST', '$M']);
    addSolutions(['bio_link_bonus', day, '$H', '$I', '$S', '$W', '$E', '$C', '$H', '$ST', '$M']);
    addSolutions(['finance_link_bonus', day, '$H', '$I', '$S', '$W', '$E', '$C', '$H', '$ST', '$M']);
    addSolutions(['auto_bio_bonus', day, '$I', '$S', '$W', '$E', '$C', '$H', '$ST', '$M']);

    return totals;
  }
};

// Если модуль не используется как ES-модуль, объект доступен глобально
if (typeof window !== 'undefined') {
  window.ReportRules = ReportRules;
}