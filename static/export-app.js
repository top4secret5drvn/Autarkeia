// static/export-app.js
// Модуль «Экспорт» на AIFrame: экспорт статистики за период

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

function getDateMonthsAgo(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

const ExportActions = {
  async exportStats(startDate, endDate) {
    try {
      AIFrame.setState({ exporting: true, exportStatus: 'Генерируем отчет...' });
      
      const response = await fetch('/api/export/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: startDate, end_date: endDate })
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `statistics_${startDate}_${endDate}.txt`;
      a.click();
      URL.revokeObjectURL(url);

      AIFrame.setState({ exporting: false, exportStatus: '✅ Экспорт завершен!' });
      setTimeout(() => AIFrame.setState({ exportStatus: '' }), 3000);
    } catch (e) {
      AIFrame.setState({ exporting: false, exportStatus: '❌ Ошибка: ' + e.message });
    }
  },

  async exportJSON(startDate, endDate) {
    try {
      AIFrame.setState({ exporting: true, exportStatus: 'Генерируем JSON...' });
      
      // Загружаем данные из разных API
      const [habits, ideas, skills, goals] = await Promise.all([
        fetchJSON('/api/habits/list').catch(() => ({ data: [] })),
        fetchJSON('/api/ideas/').catch(() => ({ data: [] })),
        fetchJSON('/api/skills/with-levels').catch(() => ({ data: [] })),
        fetchJSON('/api/goals/progress').catch(() => ({ data: [] }))
      ]);

      const exportData = {
        exportDate: getTodayISO(),
        period: { start: startDate, end: endDate },
        data: {
          habits: habits.data,
          ideas: ideas.data,
          skills: skills.data,
          goals: goals.data
        }
      };

      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export_${startDate}_${endDate}.json`;
      a.click();
      URL.revokeObjectURL(url);

      AIFrame.setState({ exporting: false, exportStatus: '✅ Экспорт завершен!' });
      setTimeout(() => AIFrame.setState({ exportStatus: '' }), 3000);
    } catch (e) {
      AIFrame.setState({ exporting: false, exportStatus: '❌ Ошибка: ' + e.message });
    }
  }
};

function ExportApp(state) {
  const {
    startDate = getDateMonthsAgo(3),
    endDate = getTodayISO(),
    exportFormat = 'txt',
    exporting = false,
    exportStatus = ''
  } = state;

  return ['div', { className: 'container app-grid' },
    ['div', { className: 'main-panel' },
      ['h1', null, '📥 Экспорт статистики'],
      ['div', { className: 'section' },
        ['h2', null, '📅 Выберите период'],
        ['div', { style: 'display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:16px;' },
          ['div', null,
            ['label', null, 'Начало периода'],
            ['input', {
              type: 'date',
              value: startDate,
              style: 'width:100%;',
              onChange: (e) => AIFrame.setState({ startDate: e.target.value })
            }]
          ],
          ['div', null,
            ['label', null, 'Конец периода'],
            ['input', {
              type: 'date',
              value: endDate,
              style: 'width:100%;',
              onChange: (e) => AIFrame.setState({ endDate: e.target.value })
            }]
          ]
        ],
        ['div', { style: 'display:grid; grid-template-columns: repeat(4, 1fr); gap:8px;' },
          ['button', { onClick: () => AIFrame.setState({ startDate: getDateMonthsAgo(1), endDate: getTodayISO() }) }, 'Последний месяц'],
          ['button', { onClick: () => AIFrame.setState({ startDate: getDateMonthsAgo(3), endDate: getTodayISO() }) }, 'Последние 3 месяца'],
          ['button', { onClick: () => AIFrame.setState({ startDate: getDateMonthsAgo(6), endDate: getTodayISO() }) }, 'Последние 6 месяцев'],
          ['button', { onClick: () => AIFrame.setState({ startDate: getDateMonthsAgo(12), endDate: getTodayISO() }) }, 'Последний год']
        ]
      ],

      ['div', { className: 'section' },
        ['h2', null, '📄 Формат экспорта'],
        ['div', { style: 'display:flex; gap:16px; margin-bottom:16px;' },
          ['label', null,
            ['input', {
              type: 'radio',
              name: 'format',
              value: 'txt',
              checked: exportFormat === 'txt',
              onChange: (e) => AIFrame.setState({ exportFormat: e.target.value })
            }],
            ' Текстовый формат (.txt)'
          ],
          ['label', null,
            ['input', {
              type: 'radio',
              name: 'format',
              value: 'json',
              checked: exportFormat === 'json',
              onChange: (e) => AIFrame.setState({ exportFormat: e.target.value })
            }],
            ' JSON формат (.json)'
          ]
        ]
      ],

      ['div', { className: 'section' },
        ['h2', null, '🚀 Экспорт'],
        ['button', {
          className: 'primary',
          disabled: exporting,
          style: 'padding:12px 24px; font-size:16px;',
          onClick: () => {
            if (exportFormat === 'txt') {
              ExportActions.exportStats(startDate, endDate);
            } else {
              ExportActions.exportJSON(startDate, endDate);
            }
          }
        }, exporting ? '⏳ Экспортируем...' : '📥 Экспортировать'],
        exportStatus ? ['div', { style: 'margin-top:12px; padding:12px; background:#f0f0f0; border-radius:4px;' }, exportStatus] : null
      ],

      ['div', { className: 'section' },
        ['h2', null, 'ℹ️ Информация'],
        ['p', null, 'Экспортируйте свою статистику за выбранный период. Доступны форматы:'],
        ['ul', null,
          ['li', null, 'TXT – текстовый отчет с полной статистикой'],
          ['li', null, 'JSON – структурированные данные для дальнейшей обработки']
        ]
      ]
    ],

    ['aside', { className: 'side-panel' },
      ['div', { className: 'panel-title' }, 'Быстрые периоды'],
      ['button', {
        className: 'period-btn',
        style: 'width:100%; margin-bottom:8px; padding:8px;',
        onClick: () => AIFrame.setState({ startDate: getDateMonthsAgo(1), endDate: getTodayISO() })
      }, '📅 1 месяц'],
      ['button', {
        className: 'period-btn',
        style: 'width:100%; margin-bottom:8px; padding:8px;',
        onClick: () => AIFrame.setState({ startDate: getDateMonthsAgo(3), endDate: getTodayISO() })
      }, '📅 3 месяца'],
      ['button', {
        className: 'period-btn',
        style: 'width:100%; margin-bottom:8px; padding:8px;',
        onClick: () => AIFrame.setState({ startDate: getDateMonthsAgo(6), endDate: getTodayISO() })
      }, '📅 6 месяцев'],
      ['button', {
        className: 'period-btn',
        style: 'width:100%; padding:8px;',
        onClick: () => AIFrame.setState({ startDate: getDateMonthsAgo(12), endDate: getTodayISO() })
      }, '📅 1 год'],

      ['div', { className: 'panel-title', style: 'margin-top:16px;' }, 'Форматы'],
      ['div', { className: 'info-card' },
        ['strong', null, 'TXT'],
        ['div', { style: 'font-size:12px; color:#666; margin-top:6px;' }, 'Читаемый текстовый формат со всей статистикой']
      ],
      ['div', { className: 'info-card', style: 'margin-top:8px;' },
        ['strong', null, 'JSON'],
        ['div', { style: 'font-size:12px; color:#666; margin-top:6px;' }, 'Структурированные данные для программной обработки']
      ]
    ]
  ];
}

async function initExport() {
  const initialState = {
    startDate: getDateMonthsAgo(3),
    endDate: getTodayISO(),
    exportFormat: 'txt',
    exporting: false,
    exportStatus: ''
  };

  AIFrame.mount('app', initialState, ExportApp);
}

document.addEventListener('DOMContentLoaded', initExport);
