// static/biometric-app.js
// Биометрический модуль на AIFrame: LISP UI + Prolog правила + Refal (форматирование)

// ========== API helper ==========
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!data || data.status !== 'success') {
    throw new Error(data?.message || 'Request failed');
  }
  return data;
}

function getTodayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ========== Actions (работа с API и обновление состояния) ==========
const BiometricActions = {
  // Вещества
  async loadSubstances() {
    const data = await fetchJSON('/api/biometric_substances/list');
    AIFrame.setState({ substances: data.data });
  },
  async saveSubstance(substance) {
    const id = substance.id || null;
    const url = id ? `/api/biometric_substances/update/${id}` : '/api/biometric_substances/create';
    const method = id ? 'PUT' : 'POST';
    await fetchJSON(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(substance) });
    await this.loadSubstances();
    AIFrame.setState({ showSubstanceModal: false, editingSubstance: null });
  },
  async deleteSubstance(id) {
    if (!confirm('Удалить вещество? Все связанные записи приёма будут удалены.')) return;
    await fetchJSON(`/api/biometric_substances/delete/${id}`, { method: 'DELETE' });
    await this.loadSubstances();
  },
  async loadIntakeLog(date) {
    const data = await fetchJSON(`/api/biometric_intake_log/list?date=${date}`);
    AIFrame.setState({ intakeLog: data.data, intakeDate: date });
  },
  async toggleIntake(substanceId, date, taken) {
    const existing = AIFrame.state.intakeLog.find(l => l.substance_id === substanceId);
    if (existing) {
      const updated = { ...existing, taken };
      await fetchJSON(`/api/biometric_intake_log/update/${existing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    } else {
      const newEntry = { substance_id: substanceId, date, taken };
      await fetchJSON('/api/biometric_intake_log/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEntry)
      });
    }
    await this.loadIntakeLog(date);
  },

  // Рацион
  async loadMeals() {
    const data = await fetchJSON('/api/biometric_meals/list?order_by=date DESC');
    AIFrame.setState({ meals: data.data });
  },
  async saveMeal(meal) {
    const id = meal.id || null;
    const url = id ? `/api/biometric_meals/update/${id}` : '/api/biometric_meals/create';
    const method = id ? 'PUT' : 'POST';
    await fetchJSON(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meal) });
    await this.loadMeals();
    AIFrame.setState({ showMealModal: false, editingMeal: null });
  },
  async deleteMeal(id) {
    if (!confirm('Удалить запись о приёме пищи?')) return;
    await fetchJSON(`/api/biometric_meals/delete/${id}`, { method: 'DELETE' });
    await this.loadMeals();
  },

  // Измерения
  async loadMeasurements() {
    const data = await fetchJSON('/api/biometric_measurements/list?order_by=date DESC');
    AIFrame.setState({ measurements: data.data });
    this.updateWeightChart();
  },
  async saveMeasurement(measurement) {
    const id = measurement.id || null;
    const url = id ? `/api/biometric_measurements/update/${id}` : '/api/biometric_measurements/create';
    const method = id ? 'PUT' : 'POST';
    await fetchJSON(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(measurement) });
    await this.loadMeasurements();
    AIFrame.setState({ showMeasurementModal: false, editingMeasurement: null });
  },
  async deleteMeasurement(id) {
    if (!confirm('Удалить измерение?')) return;
    await fetchJSON(`/api/biometric_measurements/delete/${id}`, { method: 'DELETE' });
    await this.loadMeasurements();
  },

  // Активности (физические)
  async loadActivities() {
    const data = await fetchJSON('/api/biometric_physical_activity/list?order_by=date DESC');
    AIFrame.setState({ activities: data.data });
    this.updateActivityChart();
    await this.loadActivityPredictions();
  },
  async loadActivityPredictions() {
    const typesData = await fetchJSON('/api/biometric/activity/types');
    const types = typesData.data;
    const predictions = {};
    for (const type of types) {
      try {
        const pred = await fetchJSON(`/api/biometric/activity/predict/${encodeURIComponent(type)}`);
        predictions[type] = pred.data;
      } catch(e) { /* ignore */ }
    }
    AIFrame.setState({ activityPredictions: predictions });
  },
  async saveActivity(activity) {
    await fetchJSON('/api/biometric/activity/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(activity)
    });
    await this.loadActivities();
    AIFrame.setState({ showActivityModal: false, editingActivity: null });
  },
  async deleteActivity(id) {
    if (!confirm('Удалить запись о физической активности?')) return;
    await fetchJSON(`/api/biometric_physical_activity/delete/${id}`, { method: 'DELETE' });
    await this.loadActivities();
  },

  // Activity log (дневник выполнения активностей по типам)
  async loadActivityTypes() {
    const data = await fetchJSON('/api/biometric/activity/types');
    AIFrame.setState({ activityTypes: data.data });
  },
  async loadActivityLog(date) {
    const data = await fetchJSON(`/api/biometric/activity/log?date=${date}`);
    AIFrame.setState({ activityLog: data.data, activityLogDate: date });
  },
  async toggleActivityLog(activityType, date, completed, quantity) {
    await fetchJSON('/api/biometric/activity/log/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity_type: activityType, date, quantity, completed })
    });
    await this.loadActivityLog(date);
    await this.loadActivities();
  },
  async updateActivityLogQuantity(activityType, date, quantity) {
    if (Number.isNaN(quantity) || quantity < 0) return;
    const existing = AIFrame.state.activityLog.find(l => l.activity_type === activityType);
    const completed = existing ? existing.completed : false;
    await fetchJSON('/api/biometric/activity/log/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity_type: activityType, date, quantity, completed })
    });
    await this.loadActivityLog(date);
    await this.loadActivities();
  },

  // Ментальные показатели
  async loadMentalEntries() {
    const data = await fetchJSON('/api/biometric_mental_daily/list?order_by=date DESC');
    AIFrame.setState({ mentalEntries: data.data });
    this.updateMentalChart();
  },
  async saveMentalEntry(entry) {
    const id = entry.id || null;
    const url = id ? `/api/biometric_mental_daily/update/${id}` : '/api/biometric_mental_daily/create';
    const method = id ? 'PUT' : 'POST';
    await fetchJSON(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
    await this.loadMentalEntries();
    AIFrame.setState({ showMentalModal: false, editingMental: null });
  },
  async deleteMentalEntry(id) {
    if (!confirm('Удалить запись о ментальных показателях?')) return;
    await fetchJSON(`/api/biometric_mental_daily/delete/${id}`, { method: 'DELETE' });
    await this.loadMentalEntries();
  },

  // Когнитивные тесты
  async loadCognitiveTests() {
    const data = await fetchJSON('/api/biometric_cognitive_tests/list?order_by=date DESC');
    AIFrame.setState({ cognitiveTests: data.data });
  },
  async saveCognitiveTest(test) {
    const id = test.id || null;
    const url = id ? `/api/biometric_cognitive_tests/update/${id}` : '/api/biometric_cognitive_tests/create';
    const method = id ? 'PUT' : 'POST';
    await fetchJSON(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(test) });
    await this.loadCognitiveTests();
    AIFrame.setState({ showTestModal: false, editingTest: null });
  },
  async deleteCognitiveTest(id) {
    if (!confirm('Удалить результат теста?')) return;
    await fetchJSON(`/api/biometric_cognitive_tests/delete/${id}`, { method: 'DELETE' });
    await this.loadCognitiveTests();
  },

  // Чарты (с защитой от ошибок)
  updateWeightChart() {
    const measurements = AIFrame.state.measurements || [];
    const sorted = [...measurements].sort((a,b) => new Date(a.date) - new Date(b.date));
    const dates = sorted.map(m => m.date);
    const weights = sorted.map(m => m.weight).filter(w => w !== null);
    const canvas = document.getElementById('weightChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (window.weightChart && typeof window.weightChart.destroy === 'function') {
      window.weightChart.destroy();
      window.weightChart = null;
    }
    if (ctx && weights.length) {
      window.weightChart = new Chart(ctx, {
        type: 'line',
        data: { labels: dates, datasets: [{ label: 'Вес (кг)', data: weights, borderColor: '#2b8be6' }] }
      });
    }
  },
  updateActivityChart() {
    const activities = AIFrame.state.activities || [];
    const grouped = {};
    activities.forEach(a => { if (!grouped[a.date]) grouped[a.date] = 0; grouped[a.date] += a.quantity * (a.calories_per_unit || 0); });
    const dates = Object.keys(grouped).sort();
    const calories = dates.map(d => grouped[d]);
    const canvas = document.getElementById('activityChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (window.activityChart && typeof window.activityChart.destroy === 'function') {
      window.activityChart.destroy();
      window.activityChart = null;
    }
    if (ctx && calories.length) {
      window.activityChart = new Chart(ctx, {
        type: 'line',
        data: { labels: dates, datasets: [{ label: 'Сожжено ккал', data: calories, borderColor: '#e67e22' }] }
      });
    }
  },
  updateMentalChart() {
    const entries = AIFrame.state.mentalEntries || [];
    const sorted = [...entries].sort((a,b) => new Date(a.date) - new Date(b.date));
    const dates = sorted.map(e => e.date);
    const focus = sorted.map(e => e.focus);
    const energy = sorted.map(e => e.energy);
    const canvas = document.getElementById('mentalChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (window.mentalChart && typeof window.mentalChart.destroy === 'function') {
      window.mentalChart.destroy();
      window.mentalChart = null;
    }
    if (ctx && focus.length) {
      window.mentalChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: dates,
          datasets: [
            { label: 'Фокус', data: focus, borderColor: '#4caf50' },
            { label: 'Энергия', data: energy, borderColor: '#ff9800' }
          ]
        }
      });
    }
  }
};

// ========== Рендер UI (S-выражения) ==========
function App(state) {
  const {
    activeTab = 'substances',
    substances = [],
    intakeLog = [],
    intakeDate = getTodayISO(),
    meals = [],
    measurements = [],
    activities = [],
    activityTypes = [],
    activityLog = [],
    activityLogDate = getTodayISO(),
    mentalEntries = [],
    cognitiveTests = [],
    activityPredictions = {},
    showSubstanceModal, editingSubstance,
    showMealModal, editingMeal,
    showMeasurementModal, editingMeasurement,
    showActivityModal, editingActivity,
    showMentalModal, editingMental,
    showTestModal, editingTest
  } = state;

  const substanceCount = substances.length;
  const mealsCount = meals.length;
  const measurementCount = measurements.length;
  const activityCount = activities.length;
  const mentalCount = mentalEntries.length;
  const cognitiveCount = cognitiveTests.length;

  // ---- Хелперы рендера таблиц ----
  const renderSubstancesTable = () => {
    if (!substances.length) return ['div', null, 'Нет веществ'];
    return ['table', { style: 'width:100%' },
      ['thead', null,
        ['tr', null, ['th', null, 'Название'], ['th', null, 'Дозировка'], ['th', null, 'Периодичность'], ['th', null, 'Время'], ['th', null, 'Действия']]
      ],
      ['tbody', null,
        ...substances.map(sub => [
          'tr', null,
          ['td', null, sub.name],
          ['td', null, sub.dosage || ''],
          ['td', null, sub.frequency || ''],
          ['td', null, sub.time_of_day || ''],
          ['td', null,
            ['button', { onClick: () => AIFrame.setState({ editingSubstance: sub, showSubstanceModal: true }) }, '✎'],
            ['button', { onClick: () => BiometricActions.deleteSubstance(sub.id) }, '🗑']
          ]
        ])
      ]
    ];
  };

  const renderIntakeLog = () => {
    return ['div', null,
      ['div', { style: 'display:flex; gap:8px; margin-bottom:8px;' },
        ['label', null, 'Дата:'],
        ['input', { type: 'date', value: intakeDate, onInput: (e) => BiometricActions.loadIntakeLog(e.target.value) }]
      ],
      ['table', { style: 'width:auto' },
        ['thead', null, ['tr', null, ['th', null, 'Вещество'], ['th', null, 'Принято']]],
        ['tbody', null,
          ...substances.map(sub => {
            const entry = intakeLog.find(l => l.substance_id === sub.id);
            const checked = entry ? entry.taken : false;
            return ['tr', null,
              ['td', null, sub.name],
              ['td', null,
                ['input', { type: 'checkbox', checked, onChange: (e) => BiometricActions.toggleIntake(sub.id, intakeDate, e.target.checked) }]
              ]
            ];
          })
        ]
      ]
    ];
  };

  const renderMealsTable = () => {
    if (!meals.length) return ['div', null, 'Нет записей'];
    return ['table', { style: 'width:100%' },
      ['thead', null,
        ['tr', null, ['th', null, 'Дата'], ['th', null, 'Приём'], ['th', null, 'Описание'], ['th', null, 'Ккал'], ['th', null, 'Примечания'], ['th', null, 'Действия']]
      ],
      ['tbody', null,
        ...meals.map(meal => {
          const mealTypeMap = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' };
          return ['tr', null,
            ['td', null, meal.date],
            ['td', null, mealTypeMap[meal.meal_type] || meal.meal_type],
            ['td', null, meal.description || ''],
            ['td', null, meal.calories ? meal.calories.toFixed(0) : ''],
            ['td', null, meal.notes || ''],
            ['td', null,
              ['button', { onClick: () => AIFrame.setState({ editingMeal: meal, showMealModal: true }) }, '✎'],
              ['button', { onClick: () => BiometricActions.deleteMeal(meal.id) }, '🗑']
            ]
          ];
        })
      ]
    ];
  };

  const renderMeasurementsTable = () => {
    if (!measurements.length) return ['div', null, 'Нет измерений'];
    return ['table', { style: 'width:100%' },
      ['thead', null,
        ['tr', null, ['th', null, 'Дата'], ['th', null, 'Вес'], ['th', null, '% жира'], ['th', null, 'Мышечная масса'], ['th', null, 'Пульс'], ['th', null, 'Давление'], ['th', null, 'Действия']]
      ],
      ['tbody', null,
        ...measurements.map(m => [
          'tr', null,
          ['td', null, m.date],
          ['td', null, m.weight ? m.weight.toFixed(1) : ''],
          ['td', null, m.body_fat_percent ? m.body_fat_percent.toFixed(1) : ''],
          ['td', null, m.muscle_mass ? m.muscle_mass.toFixed(1) : ''],
          ['td', null, m.heart_rate || ''],
          ['td', null, m.blood_pressure_systolic && m.blood_pressure_diastolic ? `${m.blood_pressure_systolic}/${m.blood_pressure_diastolic}` : ''],
          ['td', null,
            ['button', { onClick: () => AIFrame.setState({ editingMeasurement: m, showMeasurementModal: true }) }, '✎'],
            ['button', { onClick: () => BiometricActions.deleteMeasurement(m.id) }, '🗑']
          ]
        ])
      ]
    ];
  };

  const renderActivitiesTable = () => {
    if (!activities.length) return ['div', null, 'Нет активностей'];
    return ['table', { style: 'width:100%' },
      ['thead', null,
        ['tr', null, ['th', null, 'Дата'], ['th', null, 'Вид'], ['th', null, 'Кол-во'], ['th', null, 'Интенсивность'], ['th', null, 'Ккал/ед'], ['th', null, 'Примечания'], ['th', null, 'Действия']]
      ],
      ['tbody', null,
        ...activities.map(a => [
          'tr', null,
          ['td', null, a.date],
          ['td', null, a.activity_type],
          ['td', null, a.quantity],
          ['td', null, a.intensity || ''],
          ['td', null, a.calories_per_unit ? `${a.calories_per_unit} ккал/ед` : ''],
          ['td', null, a.notes || ''],
          ['td', null,
            ['button', { onClick: () => AIFrame.setState({ editingActivity: a, showActivityModal: true }) }, '✎'],
            ['button', { onClick: () => BiometricActions.deleteActivity(a.id) }, '🗑']
          ]
        ])
      ]
    ];
  };

  const renderActivityLog = () => {
    if (!activityTypes.length) return ['div', null, 'Загрузка типов активностей...'];
    return ['div', null,
      ['div', { style: 'display:flex; gap:8px; margin-bottom:8px;' },
        ['label', null, 'Дата:'],
        ['input', { type: 'date', value: activityLogDate, onInput: (e) => BiometricActions.loadActivityLog(e.target.value) }]
      ],
      ['table', { style: 'width:auto' },
        ['thead', null, ['tr', null, ['th', null, 'Активность'], ['th', null, 'Кол-во'], ['th', null, 'Выполнено']]],
        ['tbody', null,
          ...activityTypes.map(type => {
            const entry = activityLog.find(l => l.activity_type === type);
            const quantity = entry ? entry.quantity : 1;
            const completed = entry ? entry.completed : false;
            return ['tr', null,
              ['td', null, type],
              ['td', null,
                ['input', { type: 'number', min: 1, value: quantity, style: 'width:60px',
                  onInput: (e) => BiometricActions.updateActivityLogQuantity(type, activityLogDate, parseInt(e.target.value)) }]
              ],
              ['td', null,
                ['input', { type: 'checkbox', checked: completed,
                  onChange: (e) => BiometricActions.toggleActivityLog(type, activityLogDate, e.target.checked, quantity) }]
              ]
            ];
          })
        ]
      ]
    ];
  };

  const renderActivityPredictions = () => {
    if (!Object.keys(activityPredictions).length) return null;
    return ['div', { style: 'margin-top:16px' },
      ['h4', null, 'Прогнозы активностей на завтра'],
      ...Object.entries(activityPredictions).map(([type, pred]) =>
        ['div', { style: 'padding:8px; border:1px solid #ddd; margin-bottom:8px' },
          ['strong', null, type], ': ',
          `Максимум завтра: ${pred.max_predicted}, Рекомендация: ${pred.recommended}`
        ]
      )
    ];
  };

  const renderMentalTable = () => {
    if (!mentalEntries.length) return ['div', null, 'Нет записей'];
    return ['table', { style: 'width:100%' },
      ['thead', null,
        ['tr', null, ['th', null, 'Дата'], ['th', null, 'Фокус'], ['th', null, 'Внимание'], ['th', null, 'Быстр. мышления'], ['th', null, 'Энергия'], ['th', null, 'Настроение'], ['th', null, 'Тип'], ['th', null, 'Прим.'], ['th', null, 'Действия']]
      ],
      ['tbody', null,
        ...mentalEntries.map(e => [
          'tr', null,
          ['td', null, e.date],
          ['td', null, e.focus || ''],
          ['td', null, e.attention || ''],
          ['td', null, e.thinking_speed || ''],
          ['td', null, e.energy || ''],
          ['td', null, e.mood || ''],
          ['td', null, e.thinking_type || ''],
          ['td', null, e.notes || ''],
          ['td', null,
            ['button', { onClick: () => AIFrame.setState({ editingMental: e, showMentalModal: true }) }, '✎'],
            ['button', { onClick: () => BiometricActions.deleteMentalEntry(e.id) }, '🗑']
          ]
        ])
      ]
    ];
  };

  const renderCognitiveTable = () => {
    if (!cognitiveTests.length) return ['div', null, 'Нет тестов'];
    return ['table', { style: 'width:100%' },
      ['thead', null,
        ['tr', null, ['th', null, 'Дата'], ['th', null, 'Тест'], ['th', null, 'Результат'], ['th', null, 'Примечания'], ['th', null, 'Действия']]
      ],
      ['tbody', null,
        ...cognitiveTests.map(t => [
          'tr', null,
          ['td', null, t.date],
          ['td', null, t.test_name],
          ['td', null, t.score],
          ['td', null, t.notes || ''],
          ['td', null,
            ['button', { onClick: () => AIFrame.setState({ editingTest: t, showTestModal: true }) }, '✎'],
            ['button', { onClick: () => BiometricActions.deleteCognitiveTest(t.id) }, '🗑']
          ]
        ])
      ]
    ];
  };

  // ---- Модальные окна ----
  const modalOverlayStyle = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;';
  const modalContentStyle = 'background:#fff;padding:20px;border-radius:8px;max-width:500px;width:100%;';

  const substanceModal = showSubstanceModal ? ['div', { className: 'modal-overlay', style: modalOverlayStyle, onClick: (e) => { if (e.target === e.currentTarget) AIFrame.setState({ showSubstanceModal: false }); } },
    ['div', { style: modalContentStyle },
      ['h3', null, editingSubstance ? 'Редактировать вещество' : 'Новое вещество'],
      ['form', { onSubmit: (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const sub = {
          name: fd.get('name'),
          dosage: fd.get('dosage'),
          frequency: fd.get('frequency'),
          time_of_day: fd.get('time_of_day')
        };
        if (editingSubstance) sub.id = editingSubstance.id;
        BiometricActions.saveSubstance(sub);
      }},
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Название *'], ['input', { type: 'text', name: 'name', required: true, defaultValue: editingSubstance?.name || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Дозировка'], ['input', { type: 'text', name: 'dosage', defaultValue: editingSubstance?.dosage || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Периодичность'], ['input', { type: 'text', name: 'frequency', defaultValue: editingSubstance?.frequency || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Время приёма'], ['input', { type: 'text', name: 'time_of_day', defaultValue: editingSubstance?.time_of_day || '' }]],
        ['div', { style: 'display:flex; justify-content:flex-end; gap:8px; margin-top:16px' },
          ['button', { type: 'submit' }, 'Сохранить'],
          ['button', { type: 'button', onClick: () => AIFrame.setState({ showSubstanceModal: false }) }, 'Отмена']
        ]
      ]
    ]
  ] : null;

  const mealModal = showMealModal ? ['div', { className: 'modal-overlay', style: modalOverlayStyle, onClick: (e) => { if (e.target === e.currentTarget) AIFrame.setState({ showMealModal: false }); } },
    ['div', { style: modalContentStyle },
      ['h3', null, editingMeal ? 'Редактировать приём пищи' : 'Новый приём пищи'],
      ['form', { onSubmit: (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const meal = {
          date: fd.get('date'),
          meal_type: fd.get('meal_type'),
          description: fd.get('description'),
          calories: parseFloat(fd.get('calories')) || null,
          notes: fd.get('notes')
        };
        if (editingMeal) meal.id = editingMeal.id;
        BiometricActions.saveMeal(meal);
      }},
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Дата *'], ['input', { type: 'date', name: 'date', required: true, defaultValue: editingMeal?.date || getTodayISO() }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Тип приёма'], ['select', { name: 'meal_type', defaultValue: editingMeal?.meal_type || 'breakfast' },
          ['option', { value: 'breakfast' }, 'Завтрак'],
          ['option', { value: 'lunch' }, 'Обед'],
          ['option', { value: 'dinner' }, 'Ужин'],
          ['option', { value: 'snack' }, 'Перекус']
        ]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Описание'], ['textarea', { name: 'description', rows: 2, defaultValue: editingMeal?.description || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Калории'], ['input', { type: 'number', name: 'calories', step: 1, defaultValue: editingMeal?.calories || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Примечания'], ['textarea', { name: 'notes', rows: 2, defaultValue: editingMeal?.notes || '' }]],
        ['div', { style: 'display:flex; justify-content:flex-end; gap:8px; margin-top:16px' },
          ['button', { type: 'submit' }, 'Сохранить'],
          ['button', { type: 'button', onClick: () => AIFrame.setState({ showMealModal: false }) }, 'Отмена']
        ]
      ]
    ]
  ] : null;

  const measurementModal = showMeasurementModal ? ['div', { className: 'modal-overlay', style: modalOverlayStyle, onClick: (e) => { if (e.target === e.currentTarget) AIFrame.setState({ showMeasurementModal: false }); } },
    ['div', { style: modalContentStyle },
      ['h3', null, editingMeasurement ? 'Редактировать измерение' : 'Новое измерение'],
      ['form', { onSubmit: (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const meas = {
          date: fd.get('date'),
          weight: parseFloat(fd.get('weight')) || null,
          body_fat_percent: parseFloat(fd.get('fat')) || null,
          muscle_mass: parseFloat(fd.get('muscle')) || null,
          chest: parseFloat(fd.get('chest')) || null,
          waist: parseFloat(fd.get('waist')) || null,
          hips: parseFloat(fd.get('hips')) || null,
          heart_rate: parseInt(fd.get('heart_rate')) || null,
          blood_pressure_systolic: parseInt(fd.get('bp_sys')) || null,
          blood_pressure_diastolic: parseInt(fd.get('bp_dia')) || null,
          notes: fd.get('notes')
        };
        if (editingMeasurement) meas.id = editingMeasurement.id;
        BiometricActions.saveMeasurement(meas);
      }},
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Дата *'], ['input', { type: 'date', name: 'date', required: true, defaultValue: editingMeasurement?.date || getTodayISO() }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Вес (кг)'], ['input', { type: 'number', step: 0.1, name: 'weight', defaultValue: editingMeasurement?.weight || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, '% жира'], ['input', { type: 'number', step: 0.1, name: 'fat', defaultValue: editingMeasurement?.body_fat_percent || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Мышечная масса (кг)'], ['input', { type: 'number', step: 0.1, name: 'muscle', defaultValue: editingMeasurement?.muscle_mass || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Грудь (см)'], ['input', { type: 'number', step: 0.1, name: 'chest', defaultValue: editingMeasurement?.chest || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Талия (см)'], ['input', { type: 'number', step: 0.1, name: 'waist', defaultValue: editingMeasurement?.waist || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Бёдра (см)'], ['input', { type: 'number', step: 0.1, name: 'hips', defaultValue: editingMeasurement?.hips || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Пульс'], ['input', { type: 'number', name: 'heart_rate', defaultValue: editingMeasurement?.heart_rate || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Давление (сист.)'], ['input', { type: 'number', name: 'bp_sys', defaultValue: editingMeasurement?.blood_pressure_systolic || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Давление (диаст.)'], ['input', { type: 'number', name: 'bp_dia', defaultValue: editingMeasurement?.blood_pressure_diastolic || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Примечания'], ['textarea', { name: 'notes', rows: 2, defaultValue: editingMeasurement?.notes || '' }]],
        ['div', { style: 'display:flex; justify-content:flex-end; gap:8px; margin-top:16px' },
          ['button', { type: 'submit' }, 'Сохранить'],
          ['button', { type: 'button', onClick: () => AIFrame.setState({ showMeasurementModal: false }) }, 'Отмена']
        ]
      ]
    ]
  ] : null;

  const activityModal = showActivityModal ? ['div', { className: 'modal-overlay', style: modalOverlayStyle, onClick: (e) => { if (e.target === e.currentTarget) AIFrame.setState({ showActivityModal: false }); } },
    ['div', { style: modalContentStyle },
      ['h3', null, editingActivity ? 'Редактировать активность' : 'Новая активность'],
      ['form', { onSubmit: (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const act = {
          date: fd.get('date'),
          activity_type: fd.get('activity_type'),
          quantity: parseInt(fd.get('quantity')),
          intensity: parseInt(fd.get('intensity')) || null,
          calories_per_unit: parseFloat(fd.get('calories_per_unit')) || 0,
          notes: fd.get('notes')
        };
        if (editingActivity) act.id = editingActivity.id;
        BiometricActions.saveActivity(act);
      }},
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Дата *'], ['input', { type: 'date', name: 'date', required: true, defaultValue: editingActivity?.date || getTodayISO() }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Вид активности *'], ['input', { type: 'text', name: 'activity_type', required: true, defaultValue: editingActivity?.activity_type || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Количество *'], ['input', { type: 'number', name: 'quantity', required: true, step: 1, defaultValue: editingActivity?.quantity || 1 }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Интенсивность (1-10)'], ['input', { type: 'number', name: 'intensity', min: 1, max: 10, defaultValue: editingActivity?.intensity || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Ккал за единицу'], ['input', { type: 'number', step: 0.1, name: 'calories_per_unit', defaultValue: editingActivity?.calories_per_unit || 0 }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Примечания'], ['textarea', { name: 'notes', rows: 2, defaultValue: editingActivity?.notes || '' }]],
        ['div', { style: 'display:flex; justify-content:flex-end; gap:8px; margin-top:16px' },
          ['button', { type: 'submit' }, 'Сохранить'],
          ['button', { type: 'button', onClick: () => AIFrame.setState({ showActivityModal: false }) }, 'Отмена']
        ]
      ]
    ]
  ] : null;

  const mentalModal = showMentalModal ? ['div', { className: 'modal-overlay', style: modalOverlayStyle, onClick: (e) => { if (e.target === e.currentTarget) AIFrame.setState({ showMentalModal: false }); } },
    ['div', { style: modalContentStyle },
      ['h3', null, editingMental ? 'Редактировать ментальные показатели' : 'Новые ментальные показатели'],
      ['form', { onSubmit: (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const entry = {
          date: fd.get('date'),
          focus: parseInt(fd.get('focus')) || null,
          attention: parseInt(fd.get('attention')) || null,
          thinking_speed: parseInt(fd.get('thinking_speed')) || null,
          energy: parseInt(fd.get('energy')) || null,
          mood: parseInt(fd.get('mood')) || null,
          thinking_type: fd.get('thinking_type'),
          notes: fd.get('notes')
        };
        if (editingMental) entry.id = editingMental.id;
        BiometricActions.saveMentalEntry(entry);
      }},
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Дата *'], ['input', { type: 'date', name: 'date', required: true, defaultValue: editingMental?.date || getTodayISO() }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Фокус (1-10)'], ['input', { type: 'number', name: 'focus', min: 1, max: 10, defaultValue: editingMental?.focus || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Внимание (1-10)'], ['input', { type: 'number', name: 'attention', min: 1, max: 10, defaultValue: editingMental?.attention || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Быстрота мышления (1-10)'], ['input', { type: 'number', name: 'thinking_speed', min: 1, max: 10, defaultValue: editingMental?.thinking_speed || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Энергия (1-10)'], ['input', { type: 'number', name: 'energy', min: 1, max: 10, defaultValue: editingMental?.energy || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Настроение (1-10)'], ['input', { type: 'number', name: 'mood', min: 1, max: 10, defaultValue: editingMental?.mood || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Тип мышления'], ['input', { type: 'text', name: 'thinking_type', defaultValue: editingMental?.thinking_type || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Примечания'], ['textarea', { name: 'notes', rows: 2, defaultValue: editingMental?.notes || '' }]],
        ['div', { style: 'display:flex; justify-content:flex-end; gap:8px; margin-top:16px' },
          ['button', { type: 'submit' }, 'Сохранить'],
          ['button', { type: 'button', onClick: () => AIFrame.setState({ showMentalModal: false }) }, 'Отмена']
        ]
      ]
    ]
  ] : null;

  const testModal = showTestModal ? ['div', { className: 'modal-overlay', style: modalOverlayStyle, onClick: (e) => { if (e.target === e.currentTarget) AIFrame.setState({ showTestModal: false }); } },
    ['div', { style: modalContentStyle },
      ['h3', null, editingTest ? 'Редактировать тест' : 'Новый тест'],
      ['form', { onSubmit: (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const test = {
          date: fd.get('date'),
          test_name: fd.get('test_name'),
          score: parseFloat(fd.get('score')),
          notes: fd.get('notes')
        };
        if (editingTest) test.id = editingTest.id;
        BiometricActions.saveCognitiveTest(test);
      }},
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Дата *'], ['input', { type: 'date', name: 'date', required: true, defaultValue: editingTest?.date || getTodayISO() }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Название теста *'], ['input', { type: 'text', name: 'test_name', required: true, defaultValue: editingTest?.test_name || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Результат *'], ['input', { type: 'number', step: 'any', name: 'score', required: true, defaultValue: editingTest?.score || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Примечания'], ['textarea', { name: 'notes', rows: 2, defaultValue: editingTest?.notes || '' }]],
        ['div', { style: 'display:flex; justify-content:flex-end; gap:8px; margin-top:16px' },
          ['button', { type: 'submit' }, 'Сохранить'],
          ['button', { type: 'button', onClick: () => AIFrame.setState({ showTestModal: false }) }, 'Отмена']
        ]
      ]
    ]
  ] : null;

  // ---- Основное дерево ----
  return ['div', { className: 'container app-grid' },
    ['aside', { className: 'side-panel' },
      ['div', { className: 'panel-title' }, 'Быстрый обзор'],
      ['div', { className: 'info-card info-card--accent' }, ['div', null, 'Вещества'], ['div', { style: 'font-size:22px;font-weight:bold;' }, `${substanceCount}`]],
      ['div', { className: 'info-card' }, ['div', null, 'Приёмы пищи'], ['div', { style: 'font-size:22px;font-weight:bold;' }, `${mealsCount}`]],
      ['div', { className: 'info-card' }, ['div', null, 'Измерения'], ['div', { style: 'font-size:22px;font-weight:bold;' }, `${measurementCount}`]],
      ['div', { className: 'info-card' }, ['div', null, 'Активность'], ['div', { style: 'font-size:22px;font-weight:bold;' }, `${activityCount}`]],
      ['div', { className: 'info-card' }, ['div', null, 'Ментальное'], ['div', { style: 'font-size:22px;font-weight:bold;' }, `${mentalCount}`]],
      ['div', { className: 'info-card' }, ['div', null, 'Когнитивные тесты'], ['div', { style: 'font-size:22px;font-weight:bold;' }, `${cognitiveCount}`]]
    ],
    ['div', { className: 'main-panel' },
      ['h1', null, 'Биометрика'],
      ['div', { className: 'tabs' },
        ['button', { className: activeTab === 'substances' ? 'tab-btn active' : 'tab-btn', onClick: () => AIFrame.setState({ activeTab: 'substances' }) }, 'Вещества'],
        ['button', { className: activeTab === 'meals' ? 'tab-btn active' : 'tab-btn', onClick: () => AIFrame.setState({ activeTab: 'meals' }) }, 'Рацион'],
        ['button', { className: activeTab === 'physical' ? 'tab-btn active' : 'tab-btn', onClick: () => AIFrame.setState({ activeTab: 'physical' }) }, 'Физические'],
        ['button', { className: activeTab === 'mental' ? 'tab-btn active' : 'tab-btn', onClick: () => AIFrame.setState({ activeTab: 'mental' }) }, 'Ментальные'],
        ['button', { className: activeTab === 'cognitive' ? 'tab-btn active' : 'tab-btn', onClick: () => AIFrame.setState({ activeTab: 'cognitive' }) }, 'Когнитивные']
      ],
      activeTab === 'substances' && ['div', null,
        ['div', { className: 'toolbar' }, ['button', { onClick: () => AIFrame.setState({ editingSubstance: null, showSubstanceModal: true }) }, '➕ Добавить вещество']],
        ['h3', null, 'Журнал приёма'],
        renderIntakeLog(),
        ['h3', null, 'Список веществ'],
        renderSubstancesTable(),
        substanceModal
      ],
      activeTab === 'meals' && ['div', null,
        ['div', { className: 'toolbar' }, ['button', { onClick: () => AIFrame.setState({ editingMeal: null, showMealModal: true }) }, '➕ Добавить приём пищи']],
        renderMealsTable(),
        mealModal
      ],
      activeTab === 'physical' && ['div', null,
        ['div', { className: 'toolbar' },
          ['button', { onClick: () => AIFrame.setState({ editingMeasurement: null, showMeasurementModal: true }) }, '➕ Добавить измерение'],
          ['button', { onClick: () => AIFrame.setState({ editingActivity: null, showActivityModal: true }) }, '➕ Добавить активность']
        ],
        ['h3', null, 'Измерения'],
        renderMeasurementsTable(),
        ['h3', null, 'Журнал активностей (дневник)'],
        renderActivityLog(),
        ['h3', null, 'Физическая активность'],
        renderActivitiesTable(),
        renderActivityPredictions(),
        ['div', { className: 'charts-row' },
          ['div', { className: 'chart-container' }, ['canvas', { id: 'weightChart' }]],
          ['div', { className: 'chart-container' }, ['canvas', { id: 'activityChart' }]]
        ],
        measurementModal,
        activityModal
      ],
      activeTab === 'mental' && ['div', null,
        ['div', { className: 'toolbar' }, ['button', { onClick: () => AIFrame.setState({ editingMental: null, showMentalModal: true }) }, '➕ Добавить запись']],
        ['div', { className: 'chart-container' }, ['canvas', { id: 'mentalChart', style: 'max-height:300px; width:100%' }]],
        renderMentalTable(),
        mentalModal
      ],
      activeTab === 'cognitive' && ['div', null,
        ['div', { className: 'toolbar' }, ['button', { onClick: () => AIFrame.setState({ editingTest: null, showTestModal: true }) }, '➕ Добавить тест']],
        renderCognitiveTable(),
        testModal
      ]
    ]
  ];
}

// ========== Инициализация ==========
async function initBiometric() {
  const initialState = {
    activeTab: 'substances',
    substances: [],
    intakeLog: [],
    intakeDate: getTodayISO(),
    meals: [],
    measurements: [],
    activities: [],
    activityTypes: [],
    activityLog: [],
    activityLogDate: getTodayISO(),
    activityPredictions: {},
    mentalEntries: [],
    cognitiveTests: [],
    showSubstanceModal: false,
    editingSubstance: null,
    showMealModal: false,
    editingMeal: null,
    showMeasurementModal: false,
    editingMeasurement: null,
    showActivityModal: false,
    editingActivity: null,
    showMentalModal: false,
    editingMental: null,
    showTestModal: false,
    editingTest: null
  };

  AIFrame.mount('app', initialState, App);

  // Первоначальная загрузка данных
  await BiometricActions.loadSubstances();
  await BiometricActions.loadIntakeLog(getTodayISO());
  await BiometricActions.loadMeals();
  await BiometricActions.loadMeasurements();
  await BiometricActions.loadActivities();
  await BiometricActions.loadActivityTypes();
  await BiometricActions.loadActivityLog(getTodayISO());
  await BiometricActions.loadMentalEntries();
  await BiometricActions.loadCognitiveTests();
}

document.addEventListener('DOMContentLoaded', initBiometric);