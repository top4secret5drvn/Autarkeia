// static/planner-app.js
// Модуль «Планировщик» на AIFrame: управление проектами и задачами

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!data || data.status !== 'success') {
    throw new Error(data?.message || 'Request failed');
  }
  return data;
}

const PlannerActions = {
  // Для простоты используем localStorage как хранилище проектов
  loadProjects() {
    try {
      const saved = localStorage.getItem('projects');
      const parsed = saved ? JSON.parse(saved) : {};
      const projects = Array.isArray(parsed) ? parsed : parsed.projects || [];
      const selectedProjectId = parsed && !Array.isArray(parsed)
        ? parsed.selectedProjectId
        : null;

      const safeSelectedProjectId = projects.some(p => p.id === selectedProjectId)
        ? selectedProjectId
        : (projects[0]?.id || null);

      AIFrame.setState({ projects, selectedProjectId: safeSelectedProjectId, newProjectName: '', newTaskName: '' });
    } catch (e) {
      console.error('loadProjects error', e);
      AIFrame.setState({ projects: [], selectedProjectId: null, newProjectName: '', newTaskName: '' });
    }
  },

  saveProjects(projects, selectedProjectId = AIFrame.state.selectedProjectId) {
    localStorage.setItem('projects', JSON.stringify({ projects, selectedProjectId }));
  },

  _calculateEbbinghausNextDate(x_count) {
    const intervals = { 0: 0, 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };
    const days = intervals[x_count] ?? 30;
    const next = new Date();
    next.setDate(next.getDate() + days);
    return next.toISOString().slice(0, 10);
  },

  createProject(name, type = 'personal') {
    if (!name.trim()) {
      alert('Введите название проекта');
      return;
    }
    const newProject = {
      id: Date.now(),
      name: name.trim(),
      type: type,
      tasks: [],
      createdAt: new Date().toISOString()
    };
    const projects = [...AIFrame.state.projects, newProject];
    this.saveProjects(projects, newProject.id);
    AIFrame.setState({ projects, selectedProjectId: newProject.id, newProjectName: '', newTaskName: '' });
  },

  deleteProject(id) {
    if (!confirm('Удалить проект?')) return;
    const projects = AIFrame.state.projects.filter(p => p.id !== id);
    const newSelectedId = projects.some(p => p.id === AIFrame.state.selectedProjectId)
      ? AIFrame.state.selectedProjectId
      : (projects[0]?.id || null);
    this.saveProjects(projects, newSelectedId);
    AIFrame.setState({ projects, selectedProjectId: newSelectedId, selectedTaskId: null });
  },

  addTask(projectId, taskName) {
    if (!projectId) {
      alert('Сначала выберите проект');
      return;
    }
    if (!taskName.trim()) {
      alert('Введите название задачи');
      return;
    }
    const project = AIFrame.state.projects.find(p => p.id === projectId);
    const isTraining = project?.type === 'training';
    const newTask = {
      id: Date.now(),
      name: taskName.trim(),
      completed: false,
      description: '',
      repeatCount: isTraining ? 0 : 0,
      nextRepeat: null,
      lastCompleted: null
    };
    const projects = AIFrame.state.projects.map(p => {
      if (p.id === projectId) {
        return {
          ...p,
          tasks: [...(p.tasks || []), newTask]
        };
      }
      return p;
    });
    this.saveProjects(projects, projectId);
    AIFrame.setState({ projects, newTaskName: '', selectedTaskId: newTask.id });
  },

  updateTask(projectId, taskId, updates) {
    const projects = AIFrame.state.projects.map(p => {
      if (p.id === projectId) {
        return {
          ...p,
          tasks: (p.tasks || []).map(t =>
            t.id === taskId ? { ...t, ...updates } : t
          )
        };
      }
      return p;
    });
    this.saveProjects(projects, projectId);
    AIFrame.setState({ projects });
  },

  deleteTask(projectId, taskId) {
    if (!confirm('Удалить задачу?')) return;
    const projects = AIFrame.state.projects.map(p => {
      if (p.id === projectId) {
        return {
          ...p,
          tasks: (p.tasks || []).filter(t => t.id !== taskId)
        };
      }
      return p;
    });
    const isDeletedSelected = AIFrame.state.selectedTaskId === taskId;
    this.saveProjects(projects, projectId);
    AIFrame.setState({ projects, selectedTaskId: isDeletedSelected ? null : AIFrame.state.selectedTaskId });
  },

  markTrainingTask(projectId, taskId, mark = true) {
    const projects = AIFrame.state.projects.map(p => {
      if (p.id !== projectId) return p;
      return {
        ...p,
        tasks: (p.tasks || []).map(t => {
          if (t.id !== taskId) return t;
          const repeatCount = Math.max(0, Math.min(3, (t.repeatCount || 0) + (mark ? 1 : -1)));
          const completed = repeatCount >= 3;
          const lastCompleted = mark ? new Date().toISOString().slice(0, 10) : (repeatCount > 0 ? t.lastCompleted : null);
          const nextRepeat = repeatCount > 0 && repeatCount < 3 ? this._calculateEbbinghausNextDate(repeatCount) : null;
          return {
            ...t,
            repeatCount,
            completed,
            lastCompleted,
            nextRepeat
          };
        })
      };
    });
    this.saveProjects(projects, projectId);
    AIFrame.setState({ projects });
  },

  setProjectType(projectId, type) {
    const projects = AIFrame.state.projects.map(p => {
      if (p.id !== projectId) return p;
      const updatedProject = { ...p, type };
      if (type === 'training') {
        updatedProject.tasks = (p.tasks || []).map(t => ({
          ...t,
          repeatCount: t.repeatCount || 0,
          nextRepeat: t.nextRepeat || null,
          lastCompleted: t.lastCompleted || null,
          completed: t.repeatCount >= 3
        }));
      }
      return updatedProject;
    });
    this.saveProjects(projects, projectId);
    AIFrame.setState({ projects });
  }
};

function PlannerApp(state) {
  const {
    projects = [],
    selectedProjectId = null,
    newProjectName = '',
    newProjectType = 'personal',
    newTaskName = '',
    selectedTaskId = null
  } = state;

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const projectTasks = selectedProject ? (selectedProject.tasks || []) : [];
  const selectedTask = selectedProject ? projectTasks.find(t => t.id === selectedTaskId) : null;
  const isTrainingProject = selectedProject?.type === 'training';
  const completedTasks = projectTasks.filter(t => t.completed).length;
  const totalRepeatPoints = projectTasks.length * 3;
  const gainedRepeatPoints = projectTasks.reduce((sum, t) => sum + (t.repeatCount || 0), 0);
  const trainingProgress = totalRepeatPoints ? Math.round((gainedRepeatPoints / totalRepeatPoints) * 100) : 0;
  const taskProgress = isTrainingProject ? trainingProgress : (projectTasks.length ? Math.round((completedTasks / projectTasks.length) * 100) : 0);
  const progressDescription = isTrainingProject
    ? `${gainedRepeatPoints} из ${totalRepeatPoints} повторов выполнено`
    : `${completedTasks} из ${projectTasks.length} задач выполнено`;
  const trainingProjects = projects.filter(p => p.type === 'training');
  const regularProjects = projects.filter(p => p.type !== 'training');

  const handleCreateProject = () => {
    PlannerActions.createProject(newProjectName, newProjectType);
  };

  const handleAddTask = () => {
    PlannerActions.addTask(selectedProjectId, newTaskName);
  };

  const getProjectTypeLabel = (type) => {
    const labels = {
      'training': '🎓 Учёба',
      'learning': '📚 Обучение',
      'work': '💼 Работа',
      'personal': '⭐ Личное',
      'hobby': '🎮 Хобби'
    };
    return labels[type] || type;
  };

  return ['div', { className: 'container app-grid' },
    ['div', { className: 'main-panel' },
      ['h1', null, '📋 Планировщик'],
      selectedProject ? [
        'div', null,
        ['div', { className: 'toolbar' },
          ['input', {
            type: 'text',
            placeholder: 'Название новой задачи...',
            value: newTaskName,
            style: 'padding:8px; border:2px outset #ffffff; flex:1;',
            onInput: (e) => AIFrame.setState({ newTaskName: e.target.value }),
            onKeyDown: (e) => {
              if (e.key === 'Enter') {
                handleAddTask();
              }
            }
          }],
          ['button', { onClick: handleAddTask }, '➕ Добавить']
        ],

        ['div', null,
          ['h3', null, 'Прогресс проекта'],
          ['div', { style: 'display:flex; align-items:center; gap:12px;' },
            ['div', { style: 'flex:1;' },
              ['div', { style: 'background:#e0e0e0; border:2px outset #ffffff; padding:0; height:20px; border-radius:4px; overflow:hidden;' },
                ['div', { style: `background:#2ecc71; width:${taskProgress}%; height:100%; transition:width 0.3s;` }]
              ]
            ],
            ['span', { style: 'font-weight:bold; min-width:50px;' }, `${taskProgress}%`]
          ],
          ['div', { style: 'font-size:12px; color:#666; margin-top:8px;' }, progressDescription]
        ],

        ['div', { style: 'margin-top:16px;' },
          projectTasks.length > 0 ?
            ['div', null,
              ...projectTasks.map(task => ['div', {
                style: 'display:flex; align-items:center; gap:8px; padding:12px; border:2px outset #ffffff; margin-bottom:8px; background:' + (selectedTaskId === task.id ? '#dfefff' : task.completed ? '#f0f0f0' : '#ffffff'),
                onClick: (e) => { if (e.target !== e.currentTarget) return; AIFrame.setState({ selectedTaskId: task.id }); }
              },
                isTrainingProject ? ['div', { style: 'flex:1; display:flex; flex-direction:column; gap:4px;' },
                  ['span', { style: 'font-weight:600;' }, task.name],
                  ['span', { style: 'font-size:12px; color:#666;' }, `${task.repeatCount || 0}/3 повторов${task.nextRepeat ? ' • Следующее: ' + task.nextRepeat : ''}`]
                ] : ['div', { style: 'display:flex; align-items:center; gap:8px; flex:1;' },
                  ['input', {
                    type: 'checkbox',
                    checked: task.completed,
                    onClick: (e) => e.stopPropagation(),
                    onChange: (e) => {
                      e.stopPropagation();
                      PlannerActions.updateTask(selectedProjectId, task.id, { completed: !task.completed });
                    }
                  }],
                  ['span', { style: `flex:1; text-decoration:${task.completed ? 'line-through' : 'none'};` }, task.name]
                ],
                isTrainingProject ? ['button', { style: 'margin-right:4px;', onClick: (e) => { e.stopPropagation(); PlannerActions.markTrainingTask(selectedProjectId, task.id, true); } }, task.repeatCount >= 3 ? '✅ Завершено' : '➕ Повторить'] : ['button', { style: 'margin-right:4px;', onClick: (e) => { e.stopPropagation(); AIFrame.setState({ selectedTaskId: task.id }); } }, '✎'],
                isTrainingProject ? ['button', { style: 'margin-right:4px;', disabled: !(task.repeatCount > 0), onClick: (e) => { e.stopPropagation(); PlannerActions.markTrainingTask(selectedProjectId, task.id, false); } }, '↩️ Отменить'] : null,
                ['button', { onClick: (e) => { e.stopPropagation(); PlannerActions.deleteTask(selectedProjectId, task.id); } }, '🗑']
              ])
            ] : ['div', { style: 'padding:20px; text-align:center; color:#999;' }, 'Нет задач в проекте']
        ],

        selectedTask ? ['div', { className: 'section', style: 'margin-top:24px; padding:16px; border:2px inset #f0f0f0; background:#fbfbfb;' },
          ['h3', null, 'Редактирование задачи'],
          isTrainingProject ? ['div', { style: 'margin-bottom:12px; font-size:13px; color:#444;' },
            ['div', null, `Повторы: ${selectedTask.repeatCount || 0} из 3`],
            selectedTask.nextRepeat ? ['div', null, `Следующее повторение: ${selectedTask.nextRepeat}`] : null
          ] : null,
          ['div', { style: 'margin-bottom:12px;' },
            ['label', null, 'Название задачи'],
            ['input', {
              type: 'text',
              value: selectedTask.name,
              style: 'width:100%; box-sizing:border-box; padding:8px; margin-top:4px; border:1px solid #ccc;',
              onInput: (e) => PlannerActions.updateTask(selectedProjectId, selectedTask.id, { name: e.target.value })
            }]
          ],
          ['div', { style: 'margin-bottom:12px;' },
            ['label', null, 'Описание'],
            ['textarea', {
              rows: 5,
              value: selectedTask.description || '',
              style: 'width:100%; box-sizing:border-box; padding:8px; margin-top:4px; border:1px solid #ccc;',
              onInput: (e) => PlannerActions.updateTask(selectedProjectId, selectedTask.id, { description: e.target.value })
            }]
          ],
          ['div', { style: 'display:flex; align-items:center; gap:8px; flex-wrap:wrap;' },
            ['button', {
              onClick: () => isTrainingProject ? PlannerActions.markTrainingTask(selectedProjectId, selectedTask.id, true) : PlannerActions.updateTask(selectedProjectId, selectedTask.id, { completed: !selectedTask.completed }),
              style: 'padding:8px 12px;'
            }, isTrainingProject ? (selectedTask.repeatCount >= 3 ? '✅ Уже завершено' : '➕ Отметить повтор') : (selectedTask.completed ? '↩️ Отметить как невыполнено' : '✅ Отметить как выполнено')],
            isTrainingProject ? ['button', {
              onClick: () => PlannerActions.markTrainingTask(selectedProjectId, selectedTask.id, false),
              disabled: !(selectedTask.repeatCount > 0),
              style: 'padding:8px 12px;'
            }, '↩️ Отменить повтор'] : null,
            ['button', { onClick: () => PlannerActions.deleteTask(selectedProjectId, selectedTask.id), style: 'padding:8px 12px; background:#e74c3c; color:#fff; border:none; cursor:pointer;' }, '🗑 Удалить задачу']
          ]
        ] : null
      ] : ['div', { style: 'padding:40px; text-align:center; color:#999;' }, '← Выберите проект слева'],
    ],

    ['aside', { className: 'side-panel' },
      ['div', { className: 'panel-title' }, 'Проекты'],
      ['div', { className: 'toolbar' },
        ['div', { style: 'display:grid; gap:6px;' },
          ['select', {
            value: newProjectType,
            style: 'width:100%; padding:6px; border:2px outset #ffffff;',
            onChange: (e) => AIFrame.setState({ newProjectType: e.target.value })
          },
            ['option', { value: 'personal' }, '⭐ Личное'],
            ['option', { value: 'learning' }, '📚 Обучение'],
            ['option', { value: 'work' }, '💼 Работа'],
            ['option', { value: 'hobby' }, '🎮 Хобби'],
            ['option', { value: 'training' }, '🎓 Учёба']
          ],
          ['input', {
            type: 'text',
            placeholder: 'Новый проект...',
            value: newProjectName,
            style: 'width:100%; padding:6px; box-sizing:border-box;',
            onInput: (e) => AIFrame.setState({ newProjectName: e.target.value }),
            onKeyDown: (e) => {
              if (e.key === 'Enter') {
                handleCreateProject();
              }
            }
          }],
          ['button', { style: 'width:100%;', onClick: handleCreateProject }, '➕ Создать']
        ]
      ],
      
      ['div', { style: 'display:grid; gap:8px;' },
        ['div', { style: 'font-weight:bold; margin-bottom:8px;' }, 'Учебные проекты'],
        trainingProjects.length > 0 ?
          trainingProjects.map(project => ['div', {
            style: `padding:10px; border:2px outset #ffffff; cursor:pointer; background:${selectedProjectId === project.id ? '#dfefff' : '#eaf3ff'};`,
            onClick: () => AIFrame.setState({ selectedProjectId: project.id, selectedTaskId: null })
          },
            ['div', { style: 'font-weight:bold; font-size:12px;' }, project.name],
            ['div', { style: 'font-size:11px; color:#666;' }, `${project.tasks?.reduce((sum, t) => sum + (t.repeatCount || 0), 0) || 0} / ${ (project.tasks?.length || 0) * 3 } повторов`],
            ['div', { style: 'font-size:11px; color:#666;' }, getProjectTypeLabel(project.type)],
            ['button', { style: 'margin-top:4px; font-size:10px;', onClick: (e) => { e.stopPropagation(); PlannerActions.deleteProject(project.id); } }, '🗑 Удалить']
          ]) : ['div', { style: 'color:#999; text-align:center;' }, 'Нет учебных проектов'],
        ['div', { style: 'font-weight:bold; margin:16px 0 8px 0;' }, 'Остальные проекты'],
        regularProjects.length > 0 ?
          regularProjects.map(project => ['div', {
            style: `padding:10px; border:2px outset #ffffff; cursor:pointer; background:${selectedProjectId === project.id ? '#d5d5d5' : '#e2e2e2'};`,
            onClick: () => AIFrame.setState({ selectedProjectId: project.id, selectedTaskId: null })
          },
            ['div', { style: 'font-weight:bold; font-size:12px;' }, project.name],
            ['div', { style: 'font-size:11px; color:#666;' }, `${(project.tasks || []).filter(t => t.completed).length}/${(project.tasks || []).length} задач`],
            ['div', { style: 'font-size:11px; color:#666;' }, getProjectTypeLabel(project.type)],
            ['button', { style: 'margin-top:4px; font-size:10px;', onClick: (e) => { e.stopPropagation(); PlannerActions.deleteProject(project.id); } }, '🗑 Удалить']
          ]) : ['div', { style: 'color:#999; text-align:center;' }, 'Нет проектов']
      ],
      
      selectedProject ? ['div', { className: 'info-card info-card--accent', style: 'margin-top:16px;' },
        ['div', null, 'Текущий проект'],
        ['div', { style: 'font-size:14px; font-weight:bold; margin-top:6px;' }, selectedProject.name],
        ['div', { style: 'font-size:12px; color:#666; margin-top:6px;' }, `${projectTasks.length} задач • ${getProjectTypeLabel(selectedProject.type)}`],
        ['button', {
          style: 'margin-top:10px; padding:6px 10px; font-size:12px;',
          onClick: () => PlannerActions.setProjectType(selectedProjectId, isTrainingProject ? 'personal' : 'training')
        }, isTrainingProject ? 'Сделать обычным' : 'Сделать учебным']
      ] : null
    ]
  ];
}

async function initPlanner() {
  const initialState = {
    projects: [],
    selectedProjectId: null,
    newProjectName: '',
    newProjectType: 'personal',
    newTaskName: '',
    selectedTaskId: null
  };

  AIFrame.mount('app', initialState, PlannerApp);
  PlannerActions.loadProjects();
}

document.addEventListener('DOMContentLoaded', initPlanner);
