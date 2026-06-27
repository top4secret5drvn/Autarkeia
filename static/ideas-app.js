// static/ideas-app.js
// Модуль «Идеи» на AIFrame: список идей, редактирование, фильтрация

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!data || data.status !== 'success') {
    throw new Error(data?.message || 'Request failed');
  }
  return data;
}

const IdeasActions = {
  async loadIdeas() {
    try {
      const data = await fetchJSON('/api/ideas/');
      AIFrame.setState({ ideas: data.data });
    } catch (e) {
      console.error('loadIdeas error', e);
      AIFrame.setState({ ideas: [] });
    }
  },

  async deleteIdea(id) {
    if (!confirm('Удалить идею?')) return;
    try {
      await fetchJSON(`/api/ideas/${id}`, { method: 'DELETE' });
      await this.loadIdeas();
    } catch (e) {
      alert('Ошибка при удалении: ' + e.message);
    }
  },

  openNewModal() {
    AIFrame.setState({
      showModal: true,
      editingIdea: null
    });
  },

  editIdea(idea) {
    AIFrame.setState({
      showModal: true,
      editingIdea: idea
    });
  },

  closeModal() {
    AIFrame.setState({ showModal: false, editingIdea: null });
  },

  async saveIdeaFromForm(formElement) {
    const fd = new FormData(formElement);
    const title = fd.get('title').trim();
    if (!title) {
      alert('Введите название идеи');
      return;
    }

    const payload = {
      title,
      description: fd.get('description'),
      idea_type: fd.get('idea_type'),
      realism: parseInt(fd.get('realism')) || 5,
      source: fd.get('source'),
      problems: fd.get('problems'),
      what_changes: fd.get('what_changes'),
      difficulty: fd.get('difficulty'),
      is_completed: fd.get('is_completed') === 'on',
      i: parseFloat(fd.get('i')) || 0,
      s: parseFloat(fd.get('s')) || 0,
      w: parseFloat(fd.get('w')) || 0,
      e: parseFloat(fd.get('e')) || 0,
      c: parseFloat(fd.get('c')) || 0,
      h: parseFloat(fd.get('h')) || 0,
      st: parseFloat(fd.get('st')) || 0,
      money: parseFloat(fd.get('money')) || 0
    };

    try {
      if (AIFrame.state.editingIdea) {
        await fetchJSON(`/api/ideas/${AIFrame.state.editingIdea.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        await fetchJSON('/api/ideas/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      await this.loadIdeas();
      this.closeModal();
    } catch (e) {
      alert('Ошибка сохранения: ' + e.message);
    }
  }
};

function IdeasApp(state) {
  const {
    ideas = [],
    showModal = false,
    editingIdea = null,
    searchText = ''
  } = state;

  const filteredIdeas = ideas.filter(idea => {
    if (!searchText) return true;
    const text = searchText.toLowerCase();
    return idea.title.toLowerCase().includes(text) ||
           (idea.description && idea.description.toLowerCase().includes(text));
  });

  const renderIdeaCard = (idea) => {
    const totalScore = (idea.i || 0) + (idea.s || 0) + (idea.w || 0) + 
                       (idea.e || 0) + (idea.c || 0) + (idea.h || 0) + 
                       (idea.st || 0) + (idea.money || 0);
    
    return ['div', { className: 'card' },
      ['div', { style: 'display:flex; justify-content:space-between; align-items:start;' },
        ['div', null,
          ['h3', { style: 'margin:0 0 4px 0;' }, idea.title],
          idea.is_completed ? ['span', { style: 'color:#2ecc71; font-weight:bold;' }, '✅ Выполнена'] : 
                             ['span', { style: 'color:#999;' }, idea.is_completed ? 'Выполнена' : 'В процессе']
        ],
        ['div', { style: 'display:flex; gap:8px;' },
          ['button', { onClick: () => IdeasActions.editIdea(idea) }, '✎'],
          ['button', { onClick: () => IdeasActions.deleteIdea(idea.id) }, '🗑']
        ]
      ],
      idea.description ? ['p', { style: 'font-size:14px; color:#555; margin:8px 0;' }, idea.description] : null,
      ['div', { style: 'font-size:12px; color:#666; margin:8px 0;' },
        idea.source ? ['span', null, `📌 Источник: ${idea.source}`] : null,
        idea.realism ? ['span', { style: 'margin-left:12px;' }, null, `⭐ Реальность: ${idea.realism}/10`] : null
      ],
      ['div', { style: 'display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; margin-top:8px; font-size:11px;' },
        ['div', null, `I: ${idea.i || 0}`],
        ['div', null, `S: ${idea.s || 0}`],
        ['div', null, `W: ${idea.w || 0}`],
        ['div', null, `E: ${idea.e || 0}`],
        ['div', null, `C: ${idea.c || 0}`],
        ['div', null, `H: ${idea.h || 0}`],
        ['div', null, `ST: ${idea.st || 0}`],
        ['div', null, `$: ${idea.money || 0}`]
      ],
      totalScore > 0 ? ['div', { style: 'margin-top:6px; font-weight:bold; color:#2c3e50;' }, `📊 Сумма: ${totalScore.toFixed(1)}`] : null
    ];
  };

  const modalOverlayStyle = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;';
  const modalContentStyle = 'background:#fff;padding:20px;border-radius:8px;max-width:700px;width:100%;max-height:90vh;overflow-y:auto;';

  const renderModal = () => {
    if (!showModal) return null;
    const title = editingIdea ? 'Редактировать идею' : 'Новая идея';

    return ['div', {
      className: 'modal-overlay',
      style: modalOverlayStyle,
      onClick: (e) => { if (e.target === e.currentTarget) IdeasActions.closeModal(); }
    },
      ['div', { style: modalContentStyle },
        ['h2', null, title],
        ['form', {
          onSubmit: (e) => {
            e.preventDefault();
            IdeasActions.saveIdeaFromForm(e.target);
          }
        },
          ['div', { style: 'margin-bottom:12px' },
            ['label', null, 'Название *'],
            ['input', { type: 'text', name: 'title', required: true, style: 'width:100%; box-sizing:border-box;', value: editingIdea?.title || '' }]
          ],
          ['div', { style: 'margin-bottom:12px' },
            ['label', null, 'Описание'],
            ['textarea', { name: 'description', rows: 3, style: 'width:100%; box-sizing:border-box;', value: editingIdea?.description || '' }]
          ],
          ['div', { style: 'display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px;' },
            ['div', null,
              ['label', null, 'Тип идеи'],
              ['select', { name: 'idea_type', defaultValue: editingIdea?.idea_type || 'own' },
                ['option', { value: 'own' }, 'Собственная мысль'],
                ['option', { value: 'observation' }, 'Наблюдение']
              ]
            ],
            ['div', null,
              ['label', null, 'Реалистичность (1-10)'],
              ['input', { type: 'number', name: 'realism', min: 1, max: 10, style: 'width:100%;', defaultValue: editingIdea?.realism || 5 }]
            ]
          ],
          ['div', { style: 'margin-bottom:12px' },
            ['label', null, 'Источник'],
            ['input', { type: 'text', name: 'source', style: 'width:100%; box-sizing:border-box;', value: editingIdea?.source || '' }]
          ],
          ['div', { style: 'margin-bottom:12px' },
            ['label', null, 'Проблемы, которые решает'],
            ['textarea', { name: 'problems', rows: 2, style: 'width:100%; box-sizing:border-box;', value: editingIdea?.problems || '' }]
          ],
          ['div', { style: 'margin-bottom:12px' },
            ['label', null, 'Что изменит внедрение'],
            ['textarea', { name: 'what_changes', rows: 2, style: 'width:100%; box-sizing:border-box;', value: editingIdea?.what_changes || '' }]
          ],
          ['div', { style: 'display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px;' },
            ['div', null,
              ['label', null, 'Сложность'],
              ['select', { name: 'difficulty', defaultValue: editingIdea?.difficulty || 'background' },
                ['option', { value: 'background' }, 'Фоновая'],
                ['option', { value: 'initial_control' }, 'Начальная'],
                ['option', { value: 'constant_control' }, 'Постоянная']
              ]
            ],
            ['div', null,
              ['label', null, ['input', { type: 'checkbox', name: 'is_completed', defaultChecked: editingIdea?.is_completed }, ' Выполнена']]
            ]
          ],
          ['div', { style: 'display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; margin-bottom:12px;' },
            ['div', null, ['label', null, 'I'], ['input', { type: 'number', name: 'i', step: '0.1', defaultValue: editingIdea?.i || 0 }]],
            ['div', null, ['label', null, 'S'], ['input', { type: 'number', name: 's', step: '0.1', defaultValue: editingIdea?.s || 0 }]],
            ['div', null, ['label', null, 'W'], ['input', { type: 'number', name: 'w', step: '0.1', defaultValue: editingIdea?.w || 0 }]],
            ['div', null, ['label', null, 'E'], ['input', { type: 'number', name: 'e', step: '0.1', defaultValue: editingIdea?.e || 0 }]],
            ['div', null, ['label', null, 'C'], ['input', { type: 'number', name: 'c', step: '0.1', defaultValue: editingIdea?.c || 0 }]],
            ['div', null, ['label', null, 'H'], ['input', { type: 'number', name: 'h', step: '0.1', defaultValue: editingIdea?.h || 0 }]],
            ['div', null, ['label', null, 'ST'], ['input', { type: 'number', name: 'st', step: '0.1', defaultValue: editingIdea?.st || 0 }]],
            ['div', null, ['label', null, '$'], ['input', { type: 'number', name: 'money', step: '0.1', defaultValue: editingIdea?.money || 0 }]]
          ],
          ['div', { style: 'display:flex; justify-content:flex-end; gap:8px; margin-top:16px;' },
            ['button', { type: 'submit' }, 'Сохранить'],
            ['button', { type: 'button', onClick: () => IdeasActions.closeModal() }, 'Отмена']
          ]
        ]
      ]
    ];
  };

  const totalIdeas = ideas.length;
  const completedIdeas = ideas.filter(i => i.is_completed).length;

  return ['div', { className: 'container app-grid' },
    ['div', { className: 'main-panel' },
      ['h1', null, '💡 Идеи'],
      ['div', { className: 'toolbar' },
        ['input', {
          type: 'text',
          placeholder: 'Поиск идей...',
          value: searchText,
          style: 'padding:8px; border:2px outset #ffffff; flex:1; max-width:300px;',
          onInput: (e) => AIFrame.setState({ searchText: e.target.value })
        }],
        ['button', { onClick: () => IdeasActions.openNewModal() }, '➕ Новая идея']
      ],
      ['div', { style: 'margin-top:20px;' },
        filteredIdeas.length > 0 ?
          [...filteredIdeas.map(idea => renderIdeaCard(idea))] :
          ['div', { style: 'padding:20px; text-align:center; color:#999;' }, 'Нет идей']
      ],
      renderModal()
    ],
    ['aside', { className: 'side-panel' },
      ['div', { className: 'panel-title' }, 'Статистика идей'],
      ['div', { className: 'info-card info-card--accent' }, ['div', null, 'Всего идей'], ['div', { style: 'font-size:22px;font-weight:bold;' }, `${totalIdeas}`]],
      ['div', { className: 'info-card' }, ['div', null, 'Выполнено'], ['div', { style: 'font-size:22px;font-weight:bold;' }, `${completedIdeas}`]],
      ['div', { className: 'info-card' }, ['div', null, 'В процессе'], ['div', { style: 'font-size:22px;font-weight:bold;' }, `${totalIdeas - completedIdeas}`]]
    ]
  ];
}

async function initIdeas() {
  const initialState = {
    ideas: [],
    showModal: false,
    editingIdea: null,
    searchText: ''
  };

  AIFrame.mount('app', initialState, IdeasApp);
  await IdeasActions.loadIdeas();
}

document.addEventListener('DOMContentLoaded', initIdeas);
