// static/combinations-app.js
// Модуль «Сочетания» на AIFrame: управление связями между модулями

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 404) {
      console.warn(`Endpoint not found: ${url}`);
      return null;
  }
  if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP Error: ${res.status} - ${errorText}`);
  }
  if (res.status === 204) {
      return null;
  }
  const data = await res.json();
  if (data && data.status && data.status === 'error') {
    throw new Error(data.message || 'API request failed');
  }
  return data;
}

const CombinationsActions = {
  async loadData() {
    try {
        const [habits, substances, meals, activities, measurements, categories, habitBiometricLinks, habitFinanceLinks, combinations, biometricCharacteristics, activityTypesList] = await Promise.all([
            fetchJSON('/api/habits/list').then(r => r.data || []),
            fetchJSON('/api/biometric_substances/list').then(r => r.data || []),
            fetchJSON('/api/biometric_meals/list').then(r => r.data || []),
            fetchJSON('/api/biometric_physical_activity/list').then(r => r.data || []),
            fetchJSON('/api/biometric_measurements/list').then(r => r.data || []),
            fetchJSON('/api/finance_categories/list').then(r => r.data || []),
            fetchJSON('/api/combinations/habit-biometric').then(r => r.data || []),
            fetchJSON('/api/combinations/habit-finance').then(r => r.data || []),
            fetchJSON('/api/combinations/list').then(r => r.data || []),
            fetchJSON('/api/combinations/biometric-characteristics').then(r => r.data || []),
            fetchJSON('/api/biometric/activity/types').then(r => Array.isArray(r) ? r : (r.data || [])),
        ]);

        AIFrame.setState({ 
            habits, substances, meals, activities, measurements, categories, 
            habitBiometricLinks, habitFinanceLinks, combinations, biometricCharacteristics,
            activityTypesList,
            loading: false 
        });
    } catch (e) {
        console.error('loadData error', e);
        AIFrame.setState({ loading: false, error: e.message });
    }
  },

  showDeleteModal(type, id) {
    AIFrame.setState({ modal: { type: `delete-${type}`, id } });
  },

  async deleteLink(type, id) {
    let url;
    switch(type) {
        case 'biometric': url = `/api/combinations/habit-biometric/${id}`; break;
        case 'finance': url = `/api/combinations/habit-finance/${id}`; break;
        case 'combination': url = `/api/combinations/delete/${id}`; break;
        case 'characteristic': url = `/api/combinations/biometric-characteristics/${id}`; break;
        default: return;
    }
    
    try {
      await fetchJSON(url, { method: 'DELETE' });
      this.closeModal();
      this.loadData();
    } catch(e) {
      console.error('Delete failed', e);
      AIFrame.setState({ error: e.message });
    }
  },

  openNewModal() {
    const { activeTab, habits, categories } = AIFrame.state;
    
    const newLink = {
        bonus_i: 0, bonus_s: 0, bonus_w: 0, bonus_e: 0, 
        bonus_c: 0, bonus_h: 0, bonus_st: 0, bonus_money: 0
    };

    if (activeTab === 'biometric') {
        Object.assign(newLink, {
            habit_id: habits[0]?.id || '',
            biometric_type: 'activity',
            scope: 'any_type',
            biometric_id: null,
            biometric_value: ''
        });
    } else if (activeTab === 'finance') {
        Object.assign(newLink, { 
            habit_id: habits[0]?.id || '',
            finance_type: 'income',
            category_id: categories[0]?.id || '',
            threshold: 0
        });
    } else if (activeTab === 'combinations') {
         Object.assign(newLink, {
            name: '',
            habit_a: habits[0]?.id || '',
            habit_b: habits[1]?.id || ''
        });
    } else if (activeTab === 'characteristics') {
        Object.assign(newLink, {
            description: '',
            biometric_type: 'activity',
            biometric_id: null,
            bonus_st: 1
        });
    }

    AIFrame.setState({
        modal: { type: `new-${activeTab}` },
        editingLink: newLink
    });
  },

  updateEditingLink(updates) {
    const { editingLink } = AIFrame.state;
    const newLinkState = { ...editingLink, ...updates };

    if(updates.biometric_type || updates.scope) {
        newLinkState.biometric_id = null;
        newLinkState.biometric_value = '';
    }
    
    AIFrame.setState({ editingLink: newLinkState });
  },

  async saveLink() {
    const { modal, editingLink } = AIFrame.state;
    if (!modal || !editingLink) return;

    const type = modal.type.replace('new-', '').replace('edit-', '');
    const isNew = modal.type.startsWith('new');
    
    let url, body, method;

    try {
        switch(type) {
            case 'biometric':
                url = '/api/combinations/habit-biometric';
                method = 'POST';
                body = {
                    habit_id: parseInt(editingLink.habit_id),
                    biometric_type: editingLink.biometric_type,
                    biometric_id: editingLink.scope === 'specific_record' ? parseInt(editingLink.biometric_id) : null,
                    biometric_value: editingLink.scope === 'specific_type' ? editingLink.biometric_value : null,
                    bonus_i: parseFloat(editingLink.bonus_i || 0),
                    bonus_s: parseFloat(editingLink.bonus_s || 0),
                    bonus_w: parseFloat(editingLink.bonus_w || 0),
                    bonus_e: parseFloat(editingLink.bonus_e || 0),
                    bonus_c: parseFloat(editingLink.bonus_c || 0),
                    bonus_h: parseFloat(editingLink.bonus_h || 0),
                    bonus_st: parseFloat(editingLink.bonus_st || 0),
                    bonus_money: parseFloat(editingLink.bonus_money || 0),
                };
                if (!body.habit_id || !body.biometric_type) throw new Error("Выберите привычку и тип биометрики");
                break;
            case 'finance':
                url = '/api/combinations/habit-finance';
                method = 'POST';
                body = {
                    habit_id: parseInt(editingLink.habit_id),
                    finance_type: editingLink.finance_type,
                    category_id: editingLink.category_id ? parseInt(editingLink.category_id) : null,
                    threshold: parseFloat(editingLink.threshold || 0),
                    bonus_i: parseFloat(editingLink.bonus_i || 0),
                    bonus_s: parseFloat(editingLink.bonus_s || 0),
                    bonus_w: parseFloat(editingLink.bonus_w || 0),
                    bonus_e: parseFloat(editingLink.bonus_e || 0),
                    bonus_c: parseFloat(editingLink.bonus_c || 0),
                    bonus_h: parseFloat(editingLink.bonus_h || 0),
                    bonus_st: parseFloat(editingLink.bonus_st || 0),
                    bonus_money: parseFloat(editingLink.bonus_money || 0),
                };
                if (!body.habit_id || !body.finance_type) throw new Error("Выберите привычку и тип финансов");
                break;
            case 'combinations':
                 url = '/api/combinations/create';
                 method = 'POST';
                 body = {
                    name: editingLink.name || null,
                    habit_a: parseInt(editingLink.habit_a),
                    habit_b: parseInt(editingLink.habit_b),
                    i: parseFloat(editingLink.bonus_i || 0),
                    s: parseFloat(editingLink.bonus_s || 0),
                    w: parseFloat(editingLink.bonus_w || 0),
                    e: parseFloat(editingLink.bonus_e || 0),
                    c: parseFloat(editingLink.bonus_c || 0),
                    h: parseFloat(editingLink.bonus_h || 0),
                    st: parseFloat(editingLink.bonus_st || 0),
                    money: parseFloat(editingLink.bonus_money || 0),
                 };
                 if (!body.habit_a || !body.habit_b) throw new Error("Выберите обе привычки");
                 break;
            case 'characteristics':
                url = '/api/combinations/biometric-characteristics';
                method = 'POST';
                body = {
                    biometric_type: editingLink.biometric_type,
                    biometric_id: editingLink.biometric_id ? parseInt(editingLink.biometric_id) : null,
                    description: editingLink.description || '',
                    bonus_i: parseFloat(editingLink.bonus_i || 0),
                    bonus_s: parseFloat(editingLink.bonus_s || 0),
                    bonus_w: parseFloat(editingLink.bonus_w || 0),
                    bonus_e: parseFloat(editingLink.bonus_e || 0),
                    bonus_c: parseFloat(editingLink.bonus_c || 0),
                    bonus_h: parseFloat(editingLink.bonus_h || 0),
                    bonus_st: parseFloat(editingLink.bonus_st || 0),
                    bonus_money: parseFloat(editingLink.bonus_money || 0),
                }
                if(!body.biometric_type) throw new Error("Выберите тип биометрики");
                break;
            default:
                this.closeModal();
                return;
        }
        
        await fetchJSON(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        this.closeModal();
        this.loadData();
    } catch(e) {
        console.error('Save failed', e);
        AIFrame.setState({ error: e.message });
    }
  },

  closeModal() {
    AIFrame.setState({ modal: null, editingLink: null, error: null });
  }
};

// --- RENDER FUNCTIONS ---
function getBiometricLinkDescription(link, state) {
    const { substances, meals, activities, measurements } = state;
    if (link.biometric_id) {
        let item, name;
        switch (link.biometric_type) {
            case 'substance':
                item = (substances || []).find(s => s.id === link.biometric_id);
                name = item ? item.name : `#${link.biometric_id}`;
                return `Вещество: ${name}`;
            case 'meal':
                item = (meals || []).find(m => m.id === link.biometric_id);
                name = item ? `${item.date} ${item.meal_type}` : `#${link.biometric_id}`;
                return `Еда: ${name}`;
            case 'activity':
                item = (activities || []).find(a => a.id === link.biometric_id);
                name = item ? `${item.date} ${item.activity_type}` : `#${link.biometric_id}`;
                return `Активность: ${name}`;
            case 'measurement':
                 item = (measurements || []).find(m => m.id === link.biometric_id);
                 name = item ? `${item.date} (Вес: ${item.weight})` : `#${link.biometric_id}`;
                 return `Измерение: ${name}`;
            default:
                return `Запись #${link.biometric_id}`;
        }
    }
    if (link.biometric_value) {
        return `Тип активности: "${link.biometric_value}"`;
    }
    return `Любой(ая) ${link.biometric_type.replace('_', ' ')}`;
}

function getBonusesString(link, prefix = 'bonus_') {
    const bonusValues = ['i', 's', 'w', 'e', 'c', 'h', 'st', 'money'];
    return bonusValues
        .map(key => ({ key, value: link[prefix + key] }))
        .filter(b => b.value && parseFloat(b.value) !== 0)
        .map(b => `${b.key.toUpperCase()}[${b.value}]`)
        .join(' ');
}

function CombinationsApp(state) {
  const { activeTab = 'biometric', loading = true } = state;

  const renderTab = (id, title) => ['button', {
      className: `tab-btn ${activeTab === id ? 'active' : ''}`,
      onClick: () => AIFrame.setState({ activeTab: id })
    }, title];

  return ['div', { className: 'container' },
    ['div', { className: 'main-panel' },
      ['h1', null, '🔗 Сочетания модулей'],
      ['div', { className: 'tabs' },
        renderTab('combinations', 'Привычки'),
        renderTab('biometric', 'Биометрика'),
        renderTab('finance', 'Финансы'),
        renderTab('characteristics', 'Автобонусы')
      ],
      loading
        ? ['div', {className: 'loading'}, 'Загрузка...']
        : ['div', {className: 'tab-content active'},
            activeTab === 'biometric' && renderBiometricTab(state),
            activeTab === 'combinations' && renderHabitHabitTab(state),
            activeTab === 'finance' && renderFinanceTab(state),
            activeTab === 'characteristics' && renderCharacteristicsTab(state),
          ],
      renderModal(state)
    ]
  ];
}

// --- TAB RENDERERS ---

function renderBiometricTab(state) {
    const { habitBiometricLinks = [], habits = [] } = state;
    return ['div', null,
      ['div', { className: 'section-header' },
          ['h2', null, 'Привычка ↔ Биометрика'],
          ['button', { className: 'primary', onClick: () => CombinationsActions.openNewModal() }, '➕ Новая связь'],
      ],
      ['p', null, 'Настройте, какие биометрические данные влияют на привычки.'],
      ['table', { className: 'data-table' },
          ['thead', null, ['tr', null, ['th', null, 'Привычка'], ['th', null, 'Связано с'], ['th', null, 'Бонусы'], ['th', null, 'Действия']]],
          ['tbody', null,
            ...(habitBiometricLinks.length === 0
                ? [['tr', null, ['td', {colSpan: 4, style: 'text-align: center'}, 'Нет связей']]]
                : habitBiometricLinks.map(link => {
                    const habit = (habits || []).find(h => h.id === link.habit_id);
                    return ['tr', { key: `bio-${link.id}` },
                        ['td', null, habit ? habit.name : `ID ${link.habit_id}`],
                        ['td', null, getBiometricLinkDescription(link, state)],
                        ['td', {className: 'bonus-cell'}, getBonusesString(link)],
                        ['td', { className: 'actions' },
                          ['button', { className: 'icon-btn danger', onClick: () => CombinationsActions.showDeleteModal('biometric', link.id) }, '🗑']
                        ]
                    ];
                }))
          ]
      ]
    ];
}

function renderHabitHabitTab(state) {
    const { combinations = [], habits = [] } = state;
    return ['div', null,
        ['div', { className: 'section-header' },
            ['h2', null, 'Привычка ↔ Привычка'],
            ['button', { className: 'primary', onClick: () => CombinationsActions.openNewModal() }, '➕ Новое сочетание'],
        ],
        ['p', null, 'Создайте сочетания из двух привычек для получения бонусов.'],
        ['table', { className: 'data-table' },
            ['thead', null, ['tr', null, ['th', null, 'Название'], ['th', null, 'Привычки'], ['th', null, 'Бонусы'], ['th', null, 'Действия']]],
            ['tbody', null,
              ...(combinations.length === 0
                  ? [['tr', null, ['td', {colSpan: 4, style: 'text-align: center'}, 'Нет сочетаний']]]
                  : combinations.map(combo => {
                      const habitA = habits.find(h => h.id === combo.habit_a);
                      const habitB = habits.find(h => h.id === combo.habit_b);
                      return ['tr', { key: `combo-${combo.id}` },
                          ['td', null, combo.name || '(Без названия)'],
                          ['td', null, `${habitA?.name || '?'} + ${habitB?.name || '?'}`],
                          ['td', {className: 'bonus-cell'}, getBonusesString(combo, '')],
                          ['td', { className: 'actions' },
                              ['button', { className: 'icon-btn danger', onClick: () => CombinationsActions.showDeleteModal('combination', combo.id) }, '🗑']
                          ]
                      ];
                  }))
            ]
        ]
    ];
}

function renderFinanceTab(state) {
    const { habitFinanceLinks = [], habits = [], categories = [] } = state;
    return ['div', null,
      ['div', { className: 'section-header' },
        ['h2', null, 'Привычка ↔ Финансы'],
        ['button', { className: 'primary', onClick: () => CombinationsActions.openNewModal() }, '➕ Новая связь'],
      ],
      ['p', null, 'Свяжите выполнение привычек с финансовыми событиями (доходами или расходами).'],
      ['table', { className: 'data-table' },
        ['thead', null, ['tr', null, ['th', null, 'Привычка'], ['th', null, 'Финансы'], ['th', null, 'Бонусы'], ['th', null, 'Действия']]],
        ['tbody', null,
          ...(habitFinanceLinks.length === 0
              ? [['tr', null, ['td', {colSpan: 4, style: 'text-align: center'}, 'Нет связей']]]
              : habitFinanceLinks.map(link => {
                  const habit = (habits || []).find(h => h.id === link.habit_id);
                  const category = (categories || []).find(c => c.id === link.category_id);
                  const financeDesc = `${link.finance_type === 'income' ? 'Доход' : 'Расход'} (${category ? category.name : 'любая категория'}) ${link.threshold > 0 ? '> ' + link.threshold + 'руб.' : ''}`;
                  return ['tr', { key: `fin-${link.id}` },
                    ['td', null, habit ? habit.name : `ID ${link.habit_id}`],
                    ['td', null, financeDesc],
                    ['td', {className: 'bonus-cell'}, getBonusesString(link)],
                    ['td', { className: 'actions' },
                      ['button', { className: 'icon-btn danger', onClick: () => CombinationsActions.showDeleteModal('finance', link.id) }, '🗑']
                    ]
                  ];
              }))
        ]
      ]
    ];
}

function renderCharacteristicsTab(state) {
    const { biometricCharacteristics = [] } = state;
     return ['div', null,
      ['div', { className: 'section-header' },
        ['h2', null, 'Автобонусы за биометрику'],
        ['button', { className: 'primary', onClick: () => CombinationsActions.openNewModal() }, '➕ Новое правило'],
      ],
      ['p', null, 'Настройте бонусы, которые начисляются автоматически при добавлении определенных биометрических данных.'],
      ['table', { className: 'data-table' },
        ['thead', null, ['tr', null, ['th', null, 'Биометрика'], ['th', null, 'Описание'], ['th', null, 'Бонусы'], ['th', null, 'Действия']]],
        ['tbody', null,
          ...(biometricCharacteristics.length === 0
              ? [['tr', null, ['td', {colSpan: 4, style: 'text-align: center'}, 'Нет правил']]]
              : biometricCharacteristics.map(char => {
                  return ['tr', { key: `char-${char.id}` },
                    ['td', null, getBiometricLinkDescription(char, state)],
                    ['td', null, char.description],
                    ['td', {className: 'bonus-cell'}, getBonusesString(char)],
                    ['td', { className: 'actions' },
                      ['button', { className: 'icon-btn danger', onClick: () => CombinationsActions.showDeleteModal('characteristic', char.id) }, '🗑']
                    ]
                  ];
                }))
        ]
      ]
    ];
}

// --- MODAL RENDERER ---

function renderModal(state) {
    const { modal, error } = state;
    if (!modal) return null;

    let title, content, actions;

    if (modal.type.startsWith('delete-')) {
        const typeMap = {
            'biometric': 'эту биометрическую связь?',
            'finance': 'эту финансовую связь?',
            'combination': 'это сочетание?',
            'characteristic': 'это правило автобонуса?'
        };
        const itemType = modal.type.replace('delete-', '');
        title = 'Подтверждение удаления';
        content = ['p', null, `Вы уверены, что хотите удалить ${typeMap[itemType] || 'этот элемент'}`];
        actions = [
            ['button', { className: 'danger', onClick: () => CombinationsActions.deleteLink(itemType, modal.id) }, 'Удалить'],
            ['button', { onClick: () => CombinationsActions.closeModal() }, 'Отмена'],
        ];

    } else if (modal.type.startsWith('new-')) {
        const type = modal.type.replace('new-', '');
        const titleMap = {
            'biometric': 'Новая связь: Привычка ↔ Биометрика',
            'combinations': 'Новое сочетание: Привычка ↔ Привычка',
            'finance': 'Новая связь: Привычка ↔ Финансы',
            'characteristics': 'Новое правило: Автобонус'
        };
        title = titleMap[type] || 'Создать';
        
        switch(type) {
            case 'biometric': content = renderBiometricForm(state); break;
            case 'combinations': content = renderHabitHabitForm(state); break;
            case 'finance': content = renderFinanceForm(state); break;
            case 'characteristics': content = renderCharacteristicForm(state); break;
            default: content = ['p', null, 'Неизвестный тип формы'];
        }
        
        actions = [
            ['button', { className: 'primary', onClick: () => CombinationsActions.saveLink() }, 'Сохранить'],
            ['button', { onClick: () => CombinationsActions.closeModal() }, 'Отмена'],
        ];
    }

    return ['div', { className: 'modal-overlay' },
        ['div', { className: 'mac-window modal-window' },
            ['div', { className: 'mac-titlebar' },
                ['div', { className: 'mac-titlebar__controls' },
                    ['span', {className: 'close-btn', onClick: () => CombinationsActions.closeModal()}],
                    ['span'],
                    ['span']
                ],
                ['div', { className: 'mac-titlebar__label' }, title],
                ['div', { className: 'mac-titlebar__spacer' }]
            ],
            ['div', { className: 'mac-window__body' },
                error && ['div', { className: 'error-banner' }, typeof error === 'object' ? JSON.stringify(error) : error],
                content,
                ['div', { className: 'modal-actions' }, ...actions]
            ]
        ]
    ];
}


// --- FORM RENDERERS ---

const renderBonusFields = (link) => {
    const fields = ['i', 's', 'w', 'e', 'c', 'h', 'st', 'money'];
    return ['div', {className: 'form-grid bonus-grid'},
        ...fields.map(f => ['label', {key: f}, f.toUpperCase(),
            ['input', {
                type: 'number', 
                value: link[f] ?? link['bonus_' + f] ?? 0,
                onChange: e => CombinationsActions.updateEditingLink({[link.hasOwnProperty(f) ? f : 'bonus_' + f]: e.target.value})
            }]
        ])
    ];
};

function getRecordDisplayName(record, type) {
    switch(type) {
        case 'substance': return record.name;
        case 'meal': return `${record.date} ${record.meal_type}`;
        case 'activity': return `${record.date || ''} ${record.activity_type || 'активность'}`;
        case 'measurement': return `${record.date} (Вес: ${record.weight || '?'})`;
        default: return record.name || `Запись #${record.id}`;
    }
}

function renderBiometricForm(state) {
    const { editingLink, habits = [], substances = [], meals = [], activities = [], measurements = [], activityTypesList = [] } = state;
    if (!editingLink) return null;

    let recordSource = [];
    if (editingLink.scope === 'specific_record') {
        switch(editingLink.biometric_type) {
            case 'substance': recordSource = substances; break;
            case 'meal': recordSource = meals; break;
            case 'activity': recordSource = activities; break;
            case 'measurement': recordSource = measurements; break;
        }
    }

    return ['div', {className: 'form-grid'},
        ['label', {className: 'full-width'}, 'Привычка', 
            ['select', { value: editingLink.habit_id, onChange: (e) => CombinationsActions.updateEditingLink({ habit_id: e.target.value }) },
            ['option', {value: ''}, '-- Выберите привычку --'],
            ...habits.map(h => ['option', {value: h.id}, h.name])]
        ],
        ['label', {className: 'full-width'}, 'Тип биометрии',
            ['select', { value: editingLink.biometric_type, onChange: (e) => CombinationsActions.updateEditingLink({ biometric_type: e.target.value, scope: 'any_type' }) },
                ['option', {value: 'activity'}, 'Физическая активность'],
                ['option', {value: 'substance'}, 'Вещество'],
                ['option', {value: 'meal'}, 'Приём пищи'],
                ['option', {value: 'measurement'}, 'Измерение']
            ]
        ],
        ['div', {className: 'radio-group full-width'},
            ['label', null, ['input', {type: 'radio', name: 'scope', value:'any_type', checked: editingLink.scope === 'any_type', onChange: e => CombinationsActions.updateEditingLink({scope: e.target.value})}], 'Любая запись этого типа'],
            (editingLink.biometric_type === 'activity') && ['label', null, ['input', {type: 'radio', name: 'scope', value:'specific_type', checked: editingLink.scope === 'specific_type', onChange: e => CombinationsActions.updateEditingLink({scope: e.target.value})}], 'Конкретный тип активности'],
            ['label', null, ['input', {type: 'radio', name: 'scope', value:'specific_record', checked: editingLink.scope === 'specific_record', onChange: e => CombinationsActions.updateEditingLink({scope: e.target.value})}], 'Конкретная запись'],
        ],

        (editingLink.scope === 'specific_type' && editingLink.biometric_type === 'activity') && ['label', {className: 'full-width'}, 'Тип активности',
            ['select', { value: editingLink.biometric_value, onChange: e => CombinationsActions.updateEditingLink({ biometric_value: e.target.value }) },
            ['option', {value: ''}, '-- Выберите тип --'],
            ...activityTypesList.map(at => ['option', {value: at}, at])]
        ],
        
        (editingLink.scope === 'specific_record') && ['label', {className: 'full-width'}, 'Конкретная запись',
            ['select', { value: editingLink.biometric_id, onChange: e => CombinationsActions.updateEditingLink({ biometric_id: e.target.value }) },
            ['option', {value: ''}, '-- Выберите запись --'],
            ...recordSource.map(r => ['option', {value: r.id}, getRecordDisplayName(r, editingLink.biometric_type)])]
        ],
        ['h4', {className: 'full-width'}, 'Бонусы'],
        renderBonusFields(editingLink)
    ];
}

function renderHabitHabitForm(state) {
    const { editingLink, habits = [] } = state;
    if (!editingLink) return null;
    return ['div', {className: 'form-grid'},
        ['label', {className: 'full-width'}, 'Название (необязательно)',
            ['input', {type: 'text', value: editingLink.name, onChange: e => CombinationsActions.updateEditingLink({name: e.target.value})}],
        ],
        ['label', null, 'Привычка А',
            ['select', {value: editingLink.habit_a, onChange: e => CombinationsActions.updateEditingLink({habit_a: e.target.value})},
            ...habits.map(h => ['option', {value: h.id}, h.name])]
        ],
        ['label', null, 'Привычка Б',
            ['select', {value: editingLink.habit_b, onChange: e => CombinationsActions.updateEditingLink({habit_b: e.target.value})},
            ...habits.map(h => ['option', {value: h.id}, h.name])]
        ],
        ['h4', {className: 'full-width'}, 'Бонусы'],
        renderBonusFields(editingLink)
    ];
}

function renderFinanceForm(state) {
    const { editingLink, habits = [], categories = [] } = state;
    if (!editingLink) return null;
    return ['div', {className: 'form-grid'},
        ['label', {className: 'full-width'}, 'Привычка', 
            ['select', { value: editingLink.habit_id, onChange: (e) => CombinationsActions.updateEditingLink({ habit_id: e.target.value }) },
            ['option', {value: ''}, '-- Выберите привычку --'],
            ...habits.map(h => ['option', {value: h.id}, h.name])]
        ],
        ['label', null, 'Тип',
            ['select', {value: editingLink.finance_type, onChange: e => CombinationsActions.updateEditingLink({finance_type: e.target.value})},
                ['option', {value: 'income'}, 'Доход'],
                ['option', {value: 'expense'}, 'Расход'],
            ]
        ],
        ['label', null, 'Категория (необязательно)',
            ['select', {value: editingLink.category_id, onChange: e => CombinationsActions.updateEditingLink({category_id: e.target.value})},
                ['option', {value: ''}, 'Любая'],
                ...categories.map(c => ['option', {value: c.id}, c.name])
            ]
        ],
         ['label', {className: 'full-width'}, 'Порог (0 = любой)',
            ['input', {type: 'number', value: editingLink.threshold, onChange: e => CombinationsActions.updateEditingLink({threshold: e.target.value})}],
        ],
        ['h4', {className: 'full-width'}, 'Бонусы'],
        renderBonusFields(editingLink)
    ];
}

function renderCharacteristicForm(state) {
    const { editingLink, substances = [], meals = [], activities = [], measurements = [] } = state;
    if (!editingLink) return null;

    let recordSource = [];
    switch(editingLink.biometric_type) {
        case 'substance': recordSource = substances; break;
        case 'meal': recordSource = meals; break;
        case 'activity': recordSource = activities; break;
        case 'measurement': recordSource = measurements; break;
    }

    return ['div', {className: 'form-grid'},
        ['label', null, 'Тип биометрики',
            ['select', { value: editingLink.biometric_type, onChange: (e) => CombinationsActions.updateEditingLink({ biometric_type: e.target.value, biometric_id: null }) },
                ['option', {value: 'activity'}, 'Физическая активность'],
                ['option', {value: 'substance'}, 'Вещество'],
                ['option', {value: 'meal'}, 'Приём пищи'],
                ['option', {value: 'measurement'}, 'Измерение']
            ]
        ],
        ['label', null, 'Конкретная запись (необязательно)',
            ['select', { value: editingLink.biometric_id, onChange: e => CombinationsActions.updateEditingLink({ biometric_id: e.target.value }) },
            ['option', {value: ''}, '-- Любая запись этого типа --'],
            ...recordSource.map(r => ['option', {value: r.id}, getRecordDisplayName(r, editingLink.biometric_type)])]
        ],
        ['label', {className: 'full-width'}, 'Описание',
            ['input', {type: 'text', value: editingLink.description, onChange: e => CombinationsActions.updateEditingLink({description: e.target.value})}],
        ],
        ['h4', {className: 'full-width'}, 'Бонусы'],
        renderBonusFields(editingLink)
    ];
}

// --- INIT ---

function initCombinations() {
  const initialState = {
    activeTab: 'biometric',
    loading: true,
    error: null,
    modal: null,
    editingLink: null,
  };

  AIFrame.mount('app', initialState, CombinationsApp);
  CombinationsActions.loadData();
}

document.addEventListener('DOMContentLoaded', initCombinations);
