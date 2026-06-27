// static/goals-app.js
// Модуль «Цели» на AIFrame: типы целей, привязка к привычкам/активностям/веществам, прогресс

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

// ========== Goals Actions ==========
const GoalsActions = {
  // Загрузка справочников
  async loadHabits() {
    try {
      const data = await fetchJSON('/api/habits/list');
      AIFrame.setState({ habits: data.data });
    } catch (e) {
      console.error('loadHabits error', e);
    }
  },

  async loadSubstances() {
    try {
      const data = await fetchJSON('/api/biometric_substances/list');
      AIFrame.setState({ substances: data.data });
    } catch (e) {
      console.error('loadSubstances error', e);
    }
  },

  async loadActivityTypes() {
    try {
      const data = await fetchJSON('/api/biometric/activity/types');
      AIFrame.setState({ activityTypes: data.data });
    } catch (e) {
      console.error('loadActivityTypes error', e);
    }
  },

  async loadAllCatalogs() {
    await Promise.all([
      this.loadHabits(),
      this.loadSubstances(),
      this.loadActivityTypes()
    ]);
  },

  async loadGoals() {
    try {
      const data = await fetchJSON('/api/goals/progress');
      AIFrame.setState({ goals: data.data });
    } catch (e) {
      console.error('loadGoals error', e);
      AIFrame.setState({ goals: [] });
    }
  },

  async deleteGoal(id) {
    if (!confirm('Удалить цель? Прогресс также будет удалён.')) return;
    await fetchJSON(`/api/goals/delete/${id}`, { method: 'DELETE' });
    await this.loadGoals();
  },

    openNewGoalModal() {
    AIFrame.setState({ showGoalModal: true, editingGoal: false });
    },

    openEditGoalModal(goal) {
    // Сохраняем данные цели во временной переменной (не в state), чтобы при рендере подставить defaultValue
    this._editingGoalData = goal;
    AIFrame.setState({ showGoalModal: true, editingGoal: true });
    },

    closeModal() {
    this._editingGoalData = null;
    AIFrame.setState({ showGoalModal: false });
    },

    updateFormField() {
    // Больше не нужен, удаляем
    },

    async saveGoalFromForm(formData) {
    if (!formData.name || !formData.target_key || !formData.target_count || !formData.start_date || !formData.end_date) {
        alert('Заполните все обязательные поля');
        return;
    }
    const payload = {
        name: formData.name.trim(),
        type: formData.type,
        target_key: formData.target_key,
        target_count: parseInt(formData.target_count),
        start_date: formData.start_date,
        end_date: formData.end_date,
        description: formData.description
    };
    try {
        if (formData.id) {
        await fetchJSON(`/api/goals/update/${formData.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        } else {
        await fetchJSON('/api/goals/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        }
        await this.loadGoals();
        this.closeModal();
    } catch (e) {
        alert('Ошибка сохранения: ' + e.message);
    }
    },


  async saveGoal() {
    const form = AIFrame.state.goalForm;
    if (!form.name || !form.targetKey || !form.targetCount || !form.startDate || !form.endDate) {
      alert('Заполните все обязательные поля');
      return;
    }

    const data = {
      name: form.name.trim(),
      type: form.type,
      target_key: form.targetKey,
      target_count: parseInt(form.targetCount),
      start_date: form.startDate,
      end_date: form.endDate,
      description: form.description
    };

    try {
      if (form.id) {
        await fetchJSON(`/api/goals/update/${form.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      } else {
        await fetchJSON('/api/goals/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      }
      await this.loadGoals();
      this.closeModal();
    } catch (e) {
      alert('Ошибка сохранения: ' + e.message);
    }
  }
};

// ========== Вспомогательные функции рендера ==========
function translateType(type) {
  const map = {
    'habit_count': 'Выполнение привычки',
    'habit_streak': 'Стрик привычки',
    'activity_count': 'Повторения упражнения',
    'substance_count': 'Приём добавки'
  };
  return map[type] || type;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// Возвращает описание ключа для отображения (человеческое имя)
function getTargetKeyDisplay(goal, habits, activityTypes, substances) {
  if (!goal.target_key) return '';
  const [prefix, id] = goal.target_key.split(':');
  if (prefix === 'habit') {
    const habit = habits.find(h => h.id === parseInt(id));
    return habit ? habit.name : goal.target_key;
  } else if (prefix === 'activity') {
    return id; // activityTypes - массив строк, target_key = "activity:тип"
  } else if (prefix === 'substance') {
    const sub = substances.find(s => s.id === parseInt(id));
    return sub ? sub.name : goal.target_key;
  }
  return goal.target_key;
}

// ========== UI Render (S-выражения) ==========
function GoalsApp(state) {
  const {
    goals = [],
    habits = [],
    substances = [],
    activityTypes = [],
    showGoalModal = false,
    editingGoal = false,
    goalForm = { type: 'habit_count', targetKey: '', targetCount: '', startDate: getTodayISO(), endDate: '', description: '' }
  } = state;

  // Рендер карточки цели
  const renderGoalCard = (goal) => {
    const percent = goal.percent || 0;
    const keyDisplay = getTargetKeyDisplay(goal, habits, activityTypes, substances);
    return ['div', {
      className: 'goal-card',
      style: 'border:1px solid #ddd;border-radius:8px;padding:12px;margin:8px 0;background:#fff;'
    },
      ['div', { style: 'display:flex; justify-content:space-between; align-items:center;' },
        ['h3', { style: 'margin:0;' }, escapeHtml(goal.name)],
        ['div', null,
          ['button', { onClick: () => GoalsActions.openEditGoalModal(goal) }, '✎'],
          ['button', { onClick: () => GoalsActions.deleteGoal(goal.id) }, '🗑']
        ]
      ],
      ['div', { style: 'margin:8px 0;' },
        ['div', { style: 'display:flex; justify-content:space-between;' },
          ['span', null, `${goal.current || 0} / ${goal.target_count}`],
          ['span', null, `${percent}%`]
        ],
        ['progress', { value: goal.current || 0, max: goal.target_count || 1, style: 'width:100%;height:10px;border-radius:5px;' }]
      ],
      ['div', { style: 'font-size:14px; color:#555; margin-top:4px;' },
        ['strong', null, 'Тип: '], translateType(goal.type),
        ['br'],
        ['strong', null, 'Ключ: '], keyDisplay,
        ['br'],
        ['strong', null, 'Период: '], `${goal.start_date} – ${goal.end_date}`
      ],
      goal.description ? ['p', { style: 'font-size:12px; color:#666; margin-top:4px;' }, escapeHtml(goal.description)] : null
    ];
  };

    const renderModal = () => {
    if (!showGoalModal) return null;
    const editData = editingGoal ? GoalsActions._editingGoalData : null;
    
    // Функция для построения опций второго селекта в зависимости от типа
    const buildKeyOptions = (type) => {
        let options = [];
        if (type === 'habit_count' || type === 'habit_streak') {
        options = habits.map(h => ['option', { value: `habit:${h.id}` }, h.name]);
        } else if (type === 'activity_count') {
        options = activityTypes.map(t => ['option', { value: `activity:${t}` }, t]);
        } else if (type === 'substance_count') {
        options = substances.map(s => ['option', { value: `substance:${s.id}` }, s.name]);
        }
        return options;
    };

    // Начальный тип
    const initialType = editData ? editData.type : 'habit_count';
    const initialKey = editData ? editData.target_key : '';

    return ['div', {
        className: 'modal-overlay',
        style: 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;',
        onClick: (e) => { if (e.target === e.currentTarget) GoalsActions.closeModal(); }
    },
        ['div', {
        style: 'background:#fff;padding:20px;border-radius:8px;max-width:500px;width:100%;max-height:90vh;overflow-y:auto;'
        },
        ['h3', null, editingGoal ? 'Редактировать цель' : 'Новая цель'],
        ['form', {
            onSubmit: (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = {
                id: editData?.id || null,
                name: fd.get('name'),
                type: fd.get('type'),
                target_key: fd.get('target_key'),
                target_count: parseInt(fd.get('target_count')),
                start_date: fd.get('start_date'),
                end_date: fd.get('end_date'),
                description: fd.get('description')
            };
            GoalsActions.saveGoalFromForm(data); // см. ниже
            }
        },
            // Поле Название
            ['div', ['label', 'Название *'], ['input', { type: 'text', name: 'name', required: true, defaultValue: editData?.name || '' }]],
            
            // Тип цели
            ['div', ['label', 'Тип цели'],
            ['select', {
                name: 'type',
                defaultValue: initialType,
                onChange: (e) => {
                // При смене типа динамически обновляем опции второго селекта
                const keySelect = document.querySelector('[name="target_key"]');
                if (!keySelect) return;
                const newType = e.target.value;
                const options = buildKeyOptions(newType);
                keySelect.innerHTML = '';
                options.forEach(opt => {
                    const optionEl = document.createElement('option');
                    optionEl.value = opt[1].value;
                    optionEl.textContent = opt[2];
                    keySelect.appendChild(optionEl);
                });
                }
            },
                ['option', { value: 'habit_count' }, 'Выполнение привычки'],
                ['option', { value: 'habit_streak' }, 'Стрик привычки'],
                ['option', { value: 'activity_count' }, 'Повторения упражнения'],
                ['option', { value: 'substance_count' }, 'Приём добавки']
            ]
            ],
            
            // Объект цели
            ['div', ['label', 'Объект цели *'],
            ['select', {
                name: 'target_key',
                required: true,
                defaultValue: initialKey
            },
                ['option', { value: '' }, '-- Выберите --'],
                ...buildKeyOptions(initialType)
            ]
            ],
            
            // Целевое значение
            ['div', ['label', 'Целевое значение *'],
            ['input', { type: 'number', name: 'target_count', min: 1, required: true, defaultValue: editData?.target_count || '' }]
            ],
            
            // Даты
            ['div', { style: 'display:flex; gap:12px;' },
            ['div', ['label', 'Дата начала'], ['input', { type: 'date', name: 'start_date', defaultValue: editData?.start_date || getTodayISO() }]],
            ['div', ['label', 'Дата окончания'], ['input', { type: 'date', name: 'end_date', defaultValue: editData?.end_date || '' }]]
            ],
            
            // Описание
            ['div', ['label', 'Описание'], ['textarea', { name: 'description', rows: 2, defaultValue: editData?.description || '' }]],
            
            // Кнопки
            ['div', { style: 'display:flex; justify-content:flex-end; gap:8px;' },
            ['button', { type: 'submit' }, 'Сохранить'],
            ['button', { type: 'button', onClick: () => GoalsActions.closeModal() }, 'Отмена']
            ]
        ]
        ]
    ];
    };
  const totalGoals = goals.length;
  const completedGoals = goals.filter(goal => (goal.percent || 0) >= 100).length;
  const activeGoals = totalGoals - completedGoals;
  const goalTypes = [...new Set(goals.map(goal => goal.type))].join(', ') || '—';

  return ['div', { className: 'container app-grid' },
    ['div', { className: 'main-panel' },
      ['h1', null, 'Цели'],
      ['div', { className: 'toolbar' },
        ['button', { onClick: () => GoalsActions.openNewGoalModal() }, '➕ Новая цель']
      ],
      ['div', null,
        ...goals.map(goal => renderGoalCard(goal))
      ],
      renderModal()
    ],
    ['aside', { className: 'side-panel' },
      ['div', { className: 'panel-title' }, 'Целевая сводка'],
      ['div', { className: 'info-card info-card--accent' }, ['div', null, 'Всего целей'], ['div', { style: 'font-size:22px;font-weight:bold;' }, `${totalGoals}`]],
      ['div', { className: 'info-card' }, ['div', null, 'Активных'], ['div', { style: 'font-size:22px;font-weight:bold;' }, `${activeGoals}`]],
      ['div', { className: 'info-card' }, ['div', null, 'Завершено'], ['div', { style: 'font-size:22px;font-weight:bold;' }, `${completedGoals}`]],
      ['div', { className: 'info-card' }, ['div', null, 'Типы целей'], ['div', { style: 'font-size:13px; color:#333; margin-top:6px;' }, goalTypes]],
      ['div', { className: 'info-card info-card--accent' }, ['strong', null, 'Подсказка'], ['div', { style: 'font-size:12px; color:#333; margin-top:6px;' }, 'Используйте цели для привычек, активности и добавок.']]
    ]
  ];
}
// ========== Инициализация ==========
async function initGoals() {
  const initialState = {
    goals: [],
    habits: [],
    substances: [],
    activityTypes: [],
    showGoalModal: false,
    editingGoal: false,
  };

  AIFrame.mount('app', initialState, GoalsApp);

  await GoalsActions.loadAllCatalogs();
  await GoalsActions.loadGoals();
}

document.addEventListener('DOMContentLoaded', initGoals);