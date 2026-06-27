// static/skills-app.js
// Модуль «Навыки» на AIFrame: список навыков, уровни, прогресс, привязка привычек

// ========== API helper ==========
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!data || data.status !== 'success') {
    throw new Error(data?.message || 'Request failed');
  }
  return data;
}

// ========== Skills Actions ==========
const SkillsActions = {
  async loadSkills() {
    try {
      const data = await fetchJSON('/api/skills/with-levels');
      AIFrame.setState({ skills: data.data });
    } catch (e) {
      console.error('loadSkills error', e);
      AIFrame.setState({ skills: [] });
    }
  },

  async loadHabits() {
    try {
      const data = await fetchJSON('/api/habits/list');
      AIFrame.setState({ habitsList: data.data });
    } catch (e) {
      console.error('loadHabits error', e);
    }
  },

  async recalcSkills() {
    try {
      await fetchJSON('/api/skills/recalc', { method: 'POST' });
      await this.loadSkills();
      alert('✅ Навыки пересчитаны');
    } catch (e) {
      alert('Ошибка пересчёта: ' + e.message);
    }
  },

  async deleteSkill(id) {
    if (!confirm('Удалить навык? Это не затронет привычки, только сам навык и его связи.')) return;
    await fetchJSON(`/api/skills/delete/${id}`, { method: 'DELETE' });
    await this.loadSkills();
  },

  openNewModal() {
    AIFrame.setState({
      showModal: true,
      editingSkill: null,
      habitLinks: [{ id: Date.now(), habit_id: null, minutes_per_unit: 0 }]
    });
  },

  editSkill(skill) {
    const habitLinks = (skill.habits && skill.habits.length > 0)
      ? skill.habits.map(h => ({ id: Date.now() + Math.random(), habit_id: h.habit_id, minutes_per_unit: h.minutes_per_unit }))
      : [{ id: Date.now(), habit_id: null, minutes_per_unit: 0 }];
    AIFrame.setState({
      showModal: true,
      editingSkill: skill,
      habitLinks
    });
  },

  closeModal() {
    AIFrame.setState({ showModal: false, editingSkill: null, habitLinks: [] });
  },

  addHabitLink() {
    const links = [...AIFrame.state.habitLinks, { id: Date.now(), habit_id: null, minutes_per_unit: 0 }];
    AIFrame.setState({ habitLinks: links });
  },

  removeHabitLink(id) {
    const links = AIFrame.state.habitLinks.filter(l => l.id !== id);
    AIFrame.setState({ habitLinks: links.length ? links : [{ id: Date.now(), habit_id: null, minutes_per_unit: 0 }] });
  },

  updateHabitLink(id, field, value) {
    const links = AIFrame.state.habitLinks.map(l => l.id === id ? { ...l, [field]: value } : l);
    AIFrame.setState({ habitLinks: links });
  },

  async saveSkillFromForm(formElement) {
    const fd = new FormData(formElement);
    const name = fd.get('name').trim();
    if (!name) {
      alert('Введите название навыка');
      return;
    }
    const description = fd.get('description');
    const habitLinks = AIFrame.state.habitLinks;
    const habits = habitLinks
      .filter(l => l.habit_id && l.minutes_per_unit > 0)
      .map(l => ({ habit_id: parseInt(l.habit_id), minutes_per_unit: parseFloat(l.minutes_per_unit) }));
    // также можно разрешить 0 минут – оставим только >0

    const payload = { name, description, habits };
    try {
      if (AIFrame.state.editingSkill) {
        await fetchJSON(`/api/skills/update/${AIFrame.state.editingSkill.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        await fetchJSON('/api/skills/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      await this.loadSkills();
      this.closeModal();
    } catch (e) {
      alert('Ошибка сохранения: ' + e.message);
    }
  }
};

// ========== UI Render (S-выражения) ==========
function SkillsApp(state) {
  const {
    skills = [],
    habitsList = [],
    showModal = false,
    editingSkill = null,
    habitLinks = []
  } = state;

  const renderSkillCard = (skill) => {
    const hours = (skill.total_minutes / 60).toFixed(1);
    const percent = (skill.progress_percent || 0).toFixed(1);
    const nextHours = (skill.next_level_minutes / 60).toFixed(1);
    let habitsHtml = '';
    if (skill.habits && skill.habits.length) {
      habitsHtml = '📚 Связанные привычки: ' + skill.habits.map(h => {
        const habit = habitsList.find(hb => hb.id === h.habit_id);
        const name = habit ? habit.name : `ID ${h.habit_id}`;
        return `${name} (${h.minutes_per_unit} мин/ед.)`;
      }).join(', ');
    } else {
      habitsHtml = '⚠️ Не привязано ни одной привычки';
    }

    return ['div', { className: 'skill-card' },
      ['div', { style: 'display:flex; justify-content:space-between;' },
        ['strong', null, skill.name],
        ['span', { className: 'level-badge' }, `${skill.level_name} (ур. ${skill.level}/20)`]
      ],
      skill.description ? ['div', { style: 'font-size:13px; color:#555;' }, skill.description] : null,
      ['div', { style: 'font-size:12px; margin-top:6px; color:#2c3e50;' }, habitsHtml],
      ['div', null, `⏱ ${hours} ч / 10000 ч · ${percent}%`],
      ['div', { className: 'progress-bar' },
        ['div', { className: 'progress-fill', style: `width: ${percent}%;` }]
      ],
      ['div', { style: 'font-size:12px;' }, `➡️ Следующий уровень: +${nextHours} ч`],
      ['div', { className: 'controls', style: 'margin-top:8px;' },
        ['button', { className: 'small', onClick: () => SkillsActions.editSkill(skill) }, '✎ Редактировать'],
        ['button', { className: 'small', onClick: () => SkillsActions.deleteSkill(skill.id) }, '🗑 Удалить']
      ]
    ];
  };

  const totalSkills = skills.length;
  const linkedHabitsCount = skills.reduce((set, skill) => {
    (skill.habits || []).forEach(h => set.add(h.habit_id));
    return set;
  }, new Set()).size;
  const avgProgress = skills.length ? (skills.reduce((sum, skill) => sum + (skill.progress_percent || 0), 0) / skills.length).toFixed(1) : '0.0';

  const modalOverlayStyle = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;';
  const modalContentStyle = 'background:#fff;padding:20px;border-radius:8px;max-width:600px;width:100%;max-height:90vh;overflow-y:auto;';

    const renderModal = () => {
        if (!showModal) return null;
        const title = editingSkill ? 'Редактировать навык' : 'Новый навык';

        return ['div', {
        className: 'modal-overlay',
        style: modalOverlayStyle,
        onClick: (e) => { if (e.target === e.currentTarget) SkillsActions.closeModal(); }
        },
        ['div', { style: modalContentStyle },
            ['h2', null, title],
            ['form', {
            onSubmit: (e) => {
                e.preventDefault();
                SkillsActions.saveSkillFromForm(e.target);
            }
            },
            ['input', { type: 'hidden', name: 'id', value: editingSkill?.id || '' }],
            ['label', null, 'Название навыка *'],
            ['input', { type: 'text', name: 'name', required: true, value: editingSkill?.name || '' }],
            ['label', null, 'Описание'],
            ['textarea', { name: 'description', rows: 2, value: editingSkill?.description || '' }],
            ['label', null, 'Привычки, влияющие на навык'],
            ['div', { id: 'habitsContainer', style: 'margin:12px 0; border:1px solid #ddd; padding:10px; border-radius:6px; background:#fefefe;' },
                ...habitLinks.map(link => {
                return ['div', { className: 'habit-link-row', key: link.id },
                    ['select', {
                    id: `habit-select-${link.id}`,          // ← стабильный id
                    value: link.habit_id || '',
                    onChange: (e) => SkillsActions.updateHabitLink(link.id, 'habit_id', e.target.value)
                    },
                    ['option', { value: '' }, '— Выберите привычку —'],
                    ...habitsList.map(h => ['option', { value: h.id }, `${h.name} (${h.category || 'Без категории'})`])
                    ],
                    ['input', {
                    id: `habit-minutes-${link.id}`,         // ← стабильный id
                    type: 'number',
                    step: '0.1',
                    placeholder: 'Минут за единицу',
                    value: link.minutes_per_unit || '',
                    onInput: (e) => SkillsActions.updateHabitLink(link.id, 'minutes_per_unit', parseFloat(e.target.value) || 0)
                    }],
                    ['button', { type: 'button', className: 'remove-habit', onClick: () => SkillsActions.removeHabitLink(link.id) }, '✖']
                ];
                })
            ],
            ['button', { type: 'button', className: 'add-habit-btn', onClick: () => SkillsActions.addHabitLink() }, '➕ Добавить привычку'],
            ['div', { className: 'small-note', style: 'font-size:12px;color:#666;margin-top:4px;' }, 'Укажите, сколько минут практики даёт одна единица привычки (например, 30 минут = 30).'],
            ['div', { style: 'display:flex; justify-content:flex-end; gap:8px; margin-top:16px;' },
                ['button', { type: 'submit' }, 'Сохранить'],
                ['button', { type: 'button', onClick: () => SkillsActions.closeModal() }, 'Отмена']
            ]
            ]
        ]
        ];
    };

  return ['div', { className: 'container app-grid' },
    ['div', { className: 'main-panel' },
      ['h1', null, '🧠 Навыки и мастерство'],
      ['p', null, 'Отслеживай часы, прокачивай ранги от новичка до профессора (10 000 часов).'],
      ['p', null, '⚡ К одному навыку можно привязать несколько привычек. Если добавить навык с уже существующим названием — новые привычки добавятся к нему, дубликат не создастся.'],
      ['div', { className: 'controls' },
        ['button', { className: 'primary', onClick: () => SkillsActions.loadSkills() }, '🔄 Обновить список'],
        ['button', { onClick: () => SkillsActions.recalcSkills() }, '📊 Пересчитать все навыки'],
        ['button', { onClick: () => SkillsActions.openNewModal() }, '➕ Добавить навык']
      ],
      ['div', { style: 'margin-top:20px;' },
        ...skills.map(skill => renderSkillCard(skill))
      ],
      renderModal()
    ],
    ['aside', { className: 'side-panel' },
      ['div', { className: 'panel-title' }, 'Сводка навыков'],
      ['div', { className: 'info-card info-card--accent' }, ['div', null, 'Всего навыков'], ['div', { style: 'font-size:22px;font-weight:bold;' }, `${totalSkills}`]],
      ['div', { className: 'info-card' }, ['div', null, 'Связано привычек'], ['div', { style: 'font-size:22px;font-weight:bold;' }, `${linkedHabitsCount}`]],
      ['div', { className: 'info-card' }, ['div', null, 'Средний прогресс'], ['div', { style: 'font-size:22px;font-weight:bold;' }, `${avgProgress}%`]]
    ]
  ];
}

// ========== Инициализация ==========
async function initSkills() {
  const initialState = {
    skills: [],
    habitsList: [],
    showModal: false,
    editingSkill: null,
    habitLinks: []
  };

  AIFrame.mount('app', initialState, SkillsApp);

  await SkillsActions.loadHabits();
  await SkillsActions.loadSkills();
}

document.addEventListener('DOMContentLoaded', initSkills);