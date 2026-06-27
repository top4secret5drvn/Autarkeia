// static/finance-app.js
// Финансовый модуль на AIFrame: LISP UI + действия с состоянием

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

// ========== Finance Actions ==========
const FinanceActions = {
  async loadCategories() {
    const data = await fetchJSON('/api/finance_categories/list');
    AIFrame.setState({ categories: data.data });
  },

  async saveCategory(category) {
    const id = category.id || null;
    const url = id ? `/api/finance_categories/update/${id}` : '/api/finance_categories/create';
    const method = id ? 'PUT' : 'POST';
    await fetchJSON(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(category) });
    await this.loadCategories();
    AIFrame.setState({ showCategoryModal: false, editingCategory: null });
  },

  async deleteCategory(id) {
    if (!confirm('Удалить категорию? Все операции с ней станут без категории.')) return;
    await fetchJSON(`/api/finance_categories/delete/${id}`, { method: 'DELETE' });
    await this.loadCategories();
  },

  async loadTransactions(filters = {}) {
    const params = new URLSearchParams();
    if (filters.date_from) params.append('date_from', filters.date_from);
    if (filters.date_to) params.append('date_to', filters.date_to);
    if (filters.category_id) params.append('category_id', filters.category_id);
    if (filters.type) params.append('type', filters.type);
    try {
      const data = await fetchJSON('/api/finance_transactions/list?' + params.toString());
      AIFrame.setState({ transactions: data.data });
    } catch (e) {
      console.error('Ошибка загрузки транзакций:', e);
      AIFrame.setState({ transactions: [] });
    }
  },

  async saveTransaction(transaction) {
    const id = transaction.id || null;
    const url = id ? `/api/finance_transactions/update/${id}` : '/api/finance_transactions/create';
    const method = id ? 'PUT' : 'POST';
    await fetchJSON(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(transaction) });
    await this.loadTransactions(AIFrame.state.transactionFilters);
    await this.loadStats(AIFrame.state.period);
    AIFrame.setState({ showTransactionModal: false, editingTransaction: null });
  },

  async deleteTransaction(id) {
    if (!confirm('Удалить операцию?')) return;
    await fetchJSON(`/api/finance_transactions/delete/${id}`, { method: 'DELETE' });
    await this.loadTransactions(AIFrame.state.transactionFilters);
    await this.loadStats(AIFrame.state.period);
  },

  async loadStats(period) {
    try {
      const data = await fetchJSON(`/api/finance/stats?period=${period}`);
      AIFrame.setState({ stats: data.data, period });
      this.updateCharts();
    } catch (e) {
      console.error('Ошибка загрузки статистики:', e);
    }
  },

  updateCharts() {
    const stats = AIFrame.state.stats;
    if (!stats) return;

    // Безопасное уничтожение предыдущих графиков
    const destroyChart = (chart) => {
      if (chart && typeof chart.destroy === 'function') {
        try { chart.destroy(); } catch (e) { console.warn('Ошибка при destroy графика:', e); }
      }
    };
    destroyChart(window.balanceChart);
    destroyChart(window.activePassiveChart);
    window.balanceChart = null;
    window.activePassiveChart = null;

    // График доходов/расходов
    const balanceCanvas = document.getElementById('balanceChart');
    if (balanceCanvas) {
      try {
        const ctx = balanceCanvas.getContext('2d');
        window.balanceChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: stats.daily_series?.map(d => d.date) || [],
            datasets: [
              { label: 'Доход', data: stats.daily_series?.map(d => d.income) || [], borderColor: '#2ecc71', fill: false },
              { label: 'Расход', data: stats.daily_series?.map(d => d.expense) || [], borderColor: '#e74c3c', fill: false }
            ]
          },
          options: { responsive: true }
        });
      } catch (e) {
        console.warn('Не удалось создать график баланса:', e);
      }
    }

    // Круговая диаграмма активный/пассивный доход
    const apCanvas = document.getElementById('activePassiveChart');
    if (apCanvas) {
      try {
        const ctx = apCanvas.getContext('2d');
        window.activePassiveChart = new Chart(ctx, {
          type: 'pie',
          data: {
            labels: ['Активный доход', 'Пассивный доход'],
            datasets: [{
              data: [stats.active_income || 0, stats.passive_income || 0],
              backgroundColor: ['#3498db', '#f1c40f']
            }]
          }
        });
      } catch (e) {
        console.warn('Не удалось создать круговую диаграмму:', e);
      }
    }
  },

  resetTransactionForm() {
    AIFrame.setState({ editingTransaction: null });
  },
  resetCategoryForm() {
    AIFrame.setState({ editingCategory: null });
  }
};

// ========== UI Render (S-выражения) ==========
function FinanceApp(state) {
  const {
    categories = [],
    transactions = [],
    stats = null,
    period = 'month',
    transactionFilters = {},
    showTransactionModal = false,
    editingTransaction = null,
    showCategoriesModal = false,
    showCategoryModal = false,
    editingCategory = null
  } = state;

  // Хелперы рендера
  const renderStatsCards = () => {
    if (!stats) return ['div', null, 'Загрузка статистики...'];
    return ['div', { className: 'stats-grid' },
      ['div', { className: 'stat-card' },
        ['div', { className: 'stat-label' }, 'Доход'],
        ['div', { className: 'stat-value' }, (stats.income || 0).toFixed(2)]
      ],
      ['div', { className: 'stat-card' },
        ['div', { className: 'stat-label' }, 'Расход'],
        ['div', { className: 'stat-value' }, (stats.expense || 0).toFixed(2)]
      ],
      ['div', { className: 'stat-card' },
        ['div', { className: 'stat-label' }, 'Чистая прибыль'],
        ['div', { className: 'stat-value' }, (stats.net || 0).toFixed(2)]
      ],
      ['div', { className: 'stat-card' },
        ['div', { className: 'stat-label' }, 'Расходы от дохода'],
        ['div', { className: 'stat-value' }, `${(stats.expense_percent || 0).toFixed(1)}%`]
      ]
    ];
  };

  const renderCharts = () => {
    return ['div', { className: 'charts-row' },
      ['div', { className: 'chart-container' }, ['canvas', { id: 'balanceChart' }]],
      ['div', { className: 'chart-container' }, ['canvas', { id: 'activePassiveChart' }]]
    ];
  };

  const renderPeriodButtons = () => {
    return ['div', { className: 'period-controls' },
      ['button', { className: period === 'week' ? 'active' : '', onClick: () => FinanceActions.loadStats('week') }, 'Неделя'],
      ['button', { className: period === 'month' ? 'active' : '', onClick: () => FinanceActions.loadStats('month') }, 'Месяц'],
      ['button', { className: period === 'year' ? 'active' : '', onClick: () => FinanceActions.loadStats('year') }, 'Год']
    ];
  };

  const renderFilters = () => [
    'div', { className: 'filters' },
    ['label', null, 'Дата с:',
      ['input', { type: 'date', value: transactionFilters.date_from || '',
        onInput: (e) => AIFrame.setState({ transactionFilters: { ...transactionFilters, date_from: e.target.value } })
      }]
    ],
    ['label', null, 'по:',
      ['input', { type: 'date', value: transactionFilters.date_to || '',
        onInput: (e) => AIFrame.setState({ transactionFilters: { ...transactionFilters, date_to: e.target.value } })
      }]
    ],
    ['label', null, 'Категория:',
      ['select', {
        value: transactionFilters.category_id || '',
        onChange: (e) => AIFrame.setState({ transactionFilters: { ...transactionFilters, category_id: e.target.value } })
      },
        ['option', { value: '' }, 'Все'],
        ...categories.map(cat => ['option', { value: cat.id }, cat.name])
      ]
    ],
    ['label', null, 'Тип:',
      ['select', {
        value: transactionFilters.type || '',
        onChange: (e) => AIFrame.setState({ transactionFilters: { ...transactionFilters, type: e.target.value } })
      },
        ['option', { value: '' }, 'Все'],
        ['option', { value: 'income' }, 'Доход'],
        ['option', { value: 'expense' }, 'Расход']
      ]
    ],
    ['button', { onClick: () => FinanceActions.loadTransactions(transactionFilters) }, 'Применить']
  ];

  const renderTransactionsTable = () => {
    if (!transactions.length) return ['div', null, 'Нет операций'];
    return ['table', null,
      ['thead', null,
        ['tr', null, ['th', null, 'Дата'], ['th', null, 'Категория'], ['th', null, 'Сумма'], ['th', null, 'Описание'], ['th', null, 'Действия']]
      ],
      ['tbody', null,
        ...transactions.map(tx => {
          const cat = categories.find(c => c.id === tx.category_id);
          return ['tr', null,
            ['td', null, tx.date],
            ['td', null, cat?.name || '—'],
            ['td', null, tx.amount.toFixed(2)],
            ['td', null, tx.description || ''],
            ['td', null,
              ['button', { onClick: () => AIFrame.setState({ editingTransaction: tx, showTransactionModal: true }) }, '✎'],
              ['button', { onClick: () => FinanceActions.deleteTransaction(tx.id) }, '🗑']
            ]
          ];
        })
      ]
    ];
  };

  // Модальные окна
  const modalOverlayStyle = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;';
  const modalContentStyle = 'background:#fff;padding:20px;border-radius:8px;max-width:500px;width:100%;';

  const transactionModal = showTransactionModal ? ['div', {
    className: 'modal-overlay', style: modalOverlayStyle,
    onClick: (e) => { if (e.target === e.currentTarget) AIFrame.setState({ showTransactionModal: false }); }
  },
    ['div', { style: modalContentStyle },
      ['h3', null, editingTransaction ? 'Редактировать операцию' : 'Добавить операцию'],
      ['form', { onSubmit: (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const tx = {
          date: fd.get('date'),
          category_id: parseInt(fd.get('category_id')),
          amount: parseFloat(fd.get('amount')),
          description: fd.get('description')
        };
        if (editingTransaction) tx.id = editingTransaction.id;
        FinanceActions.saveTransaction(tx);
      }},
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Дата *'], ['input', { type: 'date', name: 'date', required: true, defaultValue: editingTransaction?.date || getTodayISO() }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Категория *'], ['select', { name: 'category_id', required: true },
          ['option', { value: '' }, '-- Выберите --'],
          ...categories.map(c => ['option', { value: c.id, selected: editingTransaction?.category_id === c.id }, c.name])
        ]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Сумма *'], ['input', { type: 'number', step: '0.01', name: 'amount', required: true, defaultValue: editingTransaction?.amount || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Описание'], ['textarea', { name: 'description', rows: 2, defaultValue: editingTransaction?.description || '' }]],
        ['div', { style: 'display:flex; justify-content:flex-end; gap:8px; margin-top:16px' },
          ['button', { type: 'submit' }, 'Сохранить'],
          ['button', { type: 'button', onClick: () => AIFrame.setState({ showTransactionModal: false }) }, 'Отмена']
        ]
      ]
    ]
  ] : null;

  const categoriesModal = showCategoriesModal ? ['div', {
    className: 'modal-overlay', style: modalOverlayStyle,
    onClick: (e) => { if (e.target === e.currentTarget) AIFrame.setState({ showCategoriesModal: false }); }
  },
    ['div', { style: modalContentStyle + ';max-width:700px;' },
      ['h3', null, 'Управление категориями'],
      ['div', { className: 'toolbar' },
        ['button', { onClick: () => AIFrame.setState({ editingCategory: null, showCategoryModal: true }) }, '➕ Добавить категорию']
      ],
      ['table', null,
        ['thead', null, ['tr', null, ['th', null, 'Название'], ['th', null, 'Тип'], ['th', null, 'Активный'], ['th', null, 'Цвет'], ['th', null, 'Действия']]],
        ['tbody', null,
          ...categories.map(cat => ['tr', null,
            ['td', null, cat.name],
            ['td', null, cat.type === 'income' ? 'Доход' : 'Расход'],
            ['td', null, cat.is_active ? 'Да' : 'Нет'],
            ['td', null, ['span', { style: `display:inline-block;width:16px;height:16px;background:${cat.color || '#000'};border-radius:3px;` }]],
            ['td', null,
              ['button', { onClick: () => AIFrame.setState({ editingCategory: cat, showCategoryModal: true }) }, '✎'],
              ['button', { onClick: () => FinanceActions.deleteCategory(cat.id) }, '🗑']
            ]
          ])
        ]
      ],
      ['div', { style: 'text-align:right;margin-top:12px;' },
        ['button', { onClick: () => AIFrame.setState({ showCategoriesModal: false }) }, 'Закрыть']
      ]
    ]
  ] : null;

  const categoryModal = showCategoryModal ? ['div', {
    className: 'modal-overlay', style: modalOverlayStyle,
    onClick: (e) => { if (e.target === e.currentTarget) AIFrame.setState({ showCategoryModal: false }); }
  },
    ['div', { style: modalContentStyle },
      ['h3', null, editingCategory ? 'Редактировать категорию' : 'Новая категория'],
      ['form', { onSubmit: (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const cat = {
          name: fd.get('name'),
          type: fd.get('type'),
          is_active: fd.get('is_active') === 'on',
          color: fd.get('color')
        };
        if (editingCategory) cat.id = editingCategory.id;
        FinanceActions.saveCategory(cat);
      }},
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Название *'], ['input', { type: 'text', name: 'name', required: true, defaultValue: editingCategory?.name || '' }]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Тип'], ['select', { name: 'type', defaultValue: editingCategory?.type || 'income' },
          ['option', { value: 'income' }, 'Доход'],
          ['option', { value: 'expense' }, 'Расход']
        ]],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, ['input', { type: 'checkbox', name: 'is_active', defaultChecked: editingCategory?.is_active || false }], ' Активный доход']],
        ['div', { style: 'margin-bottom:12px' }, ['label', null, 'Цвет'], ['input', { type: 'color', name: 'color', defaultValue: editingCategory?.color || '#000000' }]],
        ['div', { style: 'display:flex; justify-content:flex-end; gap:8px; margin-top:16px' },
          ['button', { type: 'submit' }, 'Сохранить'],
          ['button', { type: 'button', onClick: () => AIFrame.setState({ showCategoryModal: false }) }, 'Отмена']
        ]
      ]
    ]
  ] : null;

  const transactionCount = transactions.length;
  const totalCategories = categories.length;

  return ['div', { className: 'container app-grid' },
    ['aside', { className: 'side-panel' },
      ['div', { className: 'panel-title' }, 'Итоги'],
      renderStatsCards(),
      ['div', { className: 'panel-title' }, 'Период'],
      renderPeriodButtons(),
      ['div', { className: 'info-card info-card--accent' }, ['div', null, 'Операций'], ['div', { style: 'font-size:22px;font-weight:bold;' }, `${transactionCount}`]],
      ['div', { className: 'info-card' }, ['div', null, 'Категорий'], ['div', { style: 'font-size:22px;font-weight:bold;' }, `${totalCategories}`]]
    ],
    ['div', { className: 'main-panel' },
      ['h1', null, 'Финансы'],
      renderCharts(),
      ['div', { className: 'section' },
        ['h2', null, 'Операции'],
        ['div', { className: 'toolbar' },
          ['button', { onClick: () => { FinanceActions.resetTransactionForm(); AIFrame.setState({ showTransactionModal: true }); } }, '➕ Добавить операцию'],
          ['button', { onClick: () => AIFrame.setState({ showCategoriesModal: true }) }, '📂 Управлять категориями']
        ],
        renderFilters(),
        renderTransactionsTable()
      ]
    ],
    transactionModal,
    categoriesModal,
    categoryModal
  ];
}

// ========== Инициализация ==========
async function initFinance() {
  const initialState = {
    categories: [],
    transactions: [],
    stats: null,
    period: 'month',
    transactionFilters: {},
    showTransactionModal: false,
    editingTransaction: null,
    showCategoriesModal: false,
    showCategoryModal: false,
    editingCategory: null
  };

  AIFrame.mount('app', initialState, FinanceApp);

  // Последовательная загрузка данных (сначала категории, потом транзакции, потом статистика)
  await FinanceActions.loadCategories();
  await FinanceActions.loadTransactions(initialState.transactionFilters);
  await FinanceActions.loadStats(initialState.period);
}

document.addEventListener('DOMContentLoaded', initFinance);