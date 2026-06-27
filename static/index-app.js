// static/index-app.js
// Модуль «Дашборд» на AIFrame: главная страница с статистикой

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!data || data.status !== 'success') {
    throw new Error(data?.message || 'Request failed');
  }
  return data;
}

const DashboardActions = {
  async loadStats() {
    try {
      const stats = await fetchJSON('/api/stats/streaks');
      AIFrame.setState({ stats: stats.data });
    } catch (e) {
      console.error('loadStats error', e);
    }
  },

  async loadIdeas() {
    try {
      const ideas = await fetchJSON('/api/ideas/');
      AIFrame.setState({ ideas: ideas.data });
    } catch (e) {
      console.error('loadIdeas error', e);
    }
  },

  async loadSkills() {
    try {
      const skills = await fetchJSON('/api/skills/with-levels');
      AIFrame.setState({ skills: skills.data });
    } catch (e) {
      console.error('loadSkills error', e);
    }
  },

  getRandomIdea() {
    const { ideas = [] } = AIFrame.state;
    if (ideas.length === 0) return null;
    return ideas[Math.floor(Math.random() * ideas.length)];
  },

  refreshIdea() {
    const idea = this.getRandomIdea();
    AIFrame.setState({ randomIdea: idea });
  }
};

function DashboardApp(state) {
  const {
    stats = {},
    ideas = [],
    skills = [],
    randomIdea = null
  } = state;

  const totalDays = stats.total_days || 0;
  const currentStreak = stats.current_streak || 0;
  const bestStreak = stats.best_streak || 0;
  const avgST = stats.avg_st || 0;

  const renderMetricCard = (label, value, icon = '') => {
    return ['div', { className: 'info-card' },
      ['div', null, icon ? `${icon} ${label}` : label],
      ['div', { style: 'font-size:28px; font-weight:bold; margin-top:6px;' }, value]
    ];
  };

  return ['div', { className: 'container app-grid' },
    ['div', { className: 'main-panel' },
      ['h1', null, '📊 Дашборд дисциплины'],
      ['p', null, 'Обзор вашего прогресса, статистика и рекомендации'],
      
      ['div', { className: 'toolbar', style: 'display:grid; grid-template-columns: repeat(4, 1fr); gap:12px;' },
        renderMetricCard('Дней дисциплины', totalDays, '📅'),
        renderMetricCard('Текущий стрик', currentStreak, '🔥'),
        renderMetricCard('Максимум', bestStreak, '🏆'),
        renderMetricCard('Средний ST', avgST.toFixed(1), '⚡')
      ],

      ['div', { className: 'section' },
        ['h2', null, '💡 Случайная идея'],
        randomIdea ? ['div', { style: 'background:#fff8e7; border-left:4px solid #f0c36d; padding:12px; margin-bottom:8px;' },
          ['h4', null, randomIdea.title],
          randomIdea.description ? ['p', { style: 'font-size:13px; color:#555; margin:6px 0;' }, randomIdea.description] : null,
          ['button', { style: 'font-size:12px;', onClick: () => DashboardActions.refreshIdea() }, '🔄 Другая идея']
        ] : ['div', { style: 'color:#999;' }, 'Идей не найдено'],
        ideas.length > 0 ? ['div', { style: 'font-size:12px; color:#666;' }, `Всего идей: ${ideas.length}`] : null
      ],

      skills && skills.length > 0 ? ['div', { className: 'section' },
        ['h2', null, '🧠 Текущие навыки'],
        ['div', { style: 'display:grid; gap:12px;' },
          ...skills.slice(0, 5).map(skill => ['div', { style: 'background:#f0f0f0; padding:12px; border-radius:4px;' },
            ['div', { style: 'display:flex; justify-content:space-between; margin-bottom:6px;' },
              ['strong', null, skill.name],
              ['span', null, `${skill.progress_percent.toFixed(1)}%`]
            ],
            ['div', { style: 'background:#e0e0e0; height:8px; border-radius:4px; overflow:hidden;' },
              ['div', { style: `background:#2ecc71; width:${skill.progress_percent}%; height:100%;` }]
            ]
          ])
        ]
      ] : null,

      ['div', { className: 'section' },
        ['h2', null, '📝 Рекомендации'],
        ['ul', null,
          ['li', null, '✅ Продолжайте поддерживать текущую дисциплину'],
          ['li', null, '💪 Увеличивайте сложность постепенно'],
          ['li', null, '🎯 Фокусируйтесь на главных целях'],
          ['li', null, '🔄 Регулярно пересматривайте прогресс']
        ]
      ]
    ],

    ['aside', { className: 'side-panel' },
      ['div', { className: 'panel-title' }, 'Быстрые ссылки'],
      ['button', { style: 'width:100%; margin-bottom:8px; padding:10px;', onClick: () => { /* navigate to report */ } }, '📊 Отчёт'],
      ['button', { style: 'width:100%; margin-bottom:8px; padding:10px;', onClick: () => { /* navigate to habits */ } }, '✅ Привычки'],
      ['button', { style: 'width:100%; margin-bottom:8px; padding:10px;', onClick: () => { /* navigate to skills */ } }, '🧠 Навыки'],
      ['button', { style: 'width:100%; padding:10px;', onClick: () => { /* navigate to goals */ } }, '🎯 Цели'],

      ['div', { className: 'info-card info-card--accent', style: 'margin-top:16px;' },
        ['div', null, 'Сегодня'],
        ['div', { style: 'font-size:14px; margin-top:6px;' }, new Date().toLocaleDateString('ru-RU', { weekday: 'long', month: 'long', day: 'numeric' })]
      ],

      ['div', { className: 'info-card', style: 'margin-top:8px;' },
        ['strong', null, 'Статус'],
        ['div', { style: 'font-size:12px; color:#2ecc71; margin-top:6px;' }, '🟢 Все системы готовы']
      ]
    ]
  ];
}

async function initDashboard() {
  const initialState = {
    stats: {},
    ideas: [],
    skills: [],
    randomIdea: null
  };

  AIFrame.mount('app', initialState, DashboardApp);

  // Загружаем данные
  await DashboardActions.loadStats();
  await DashboardActions.loadIdeas();
  await DashboardActions.loadSkills();
  
  // Выбираем случайную идею
  DashboardActions.refreshIdea();
}

document.addEventListener('DOMContentLoaded', initDashboard);
