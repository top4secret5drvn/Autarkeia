// static/tasks-app.js
// Модуль «Задачи» на AIFrame: простой планировщик мелких дел

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!data || data.status !== 'success') {
    throw new Error(data?.message || 'Request failed');
  }
  return data;
}

const TasksActions = {
  // Для простоты используем localStorage как хранилище
  loadTasks() {
    try {
      const saved = localStorage.getItem('tasks') || '[]';
      const tasks = JSON.parse(saved);
      AIFrame.setState({ tasks });
    } catch (e) {
      console.error('loadTasks error', e);
      AIFrame.setState({ tasks: [] });
    }
  },

  saveTasks(tasks) {
    localStorage.setItem('tasks', JSON.stringify(tasks));
  },

  addTask(name) {
    if (!name.trim()) {
      alert('Введите название задачи');
      return;
    }
    const newTask = {
      id: Date.now(),
      name: name.trim(),
      content: '',
      completed: false,
      i: 0, s: 0, w: 0, e: 0, c: 0, h: 0, st: 0, money: 0,
      createdAt: new Date().toISOString()
    };
    const tasks = [...AIFrame.state.tasks, newTask];
    this.saveTasks(tasks);
    AIFrame.setState({ tasks, newTaskName: '' });
  },

  deleteTask(id) {
    const tasks = AIFrame.state.tasks.filter(t => t.id !== id);
    this.saveTasks(tasks);
    AIFrame.setState({ tasks, selectedTaskId: null });
  },

  showDeleteModal(taskId) {
    AIFrame.setState({ 
      modal: {
        type: 'delete-task',
        taskId: taskId
      }
    });
  },

  updateTask(id, updates) {
    const tasks = AIFrame.state.tasks.map(t =>
      t.id === id ? { ...t, ...updates } : t
    );
    this.saveTasks(tasks);
    AIFrame.setState({ tasks });
  },

  toggleTask(id) {
    const task = AIFrame.state.tasks.find(t => t.id === id);
    if (task) {
      this.updateTask(id, { completed: !task.completed });
    }
  }
};

function TasksApp(state) {
  const {
    tasks = [],
    newTaskName = '',
    selectedTaskId = null
  } = state;

  const selectedTask = tasks.find(t => t.id === selectedTaskId);
  const completedCount = tasks.filter(t => t.completed).length;

  const renderTaskItem = (task) => {
    return ['div', {
      className: `task-item ${task.completed ? 'completed' : ''}`,
      onClick: () => AIFrame.setState({ selectedTaskId: task.id }),
      style: `padding:12px; border:1px solid #ddd; margin-bottom:8px; cursor:pointer; background:${selectedTaskId === task.id ? '#e8f4f8' : '#fff'};`
    },
      ['div', { style: 'display:flex; align-items:center; gap:8px;' },
        ['input', {
          type: 'checkbox',
          checked: task.completed,
          onClick: (e) => e.stopPropagation(),
          onChange: (e) => { e.stopPropagation(); TasksActions.toggleTask(task.id); },
          style: 'cursor:pointer;'
        }],
        ['span', { style: `text-decoration:${task.completed ? 'line-through' : 'none'}; flex:1;` }, task.name],
        task.completed ? ['span', { style: 'color:#2ecc71; font-weight:bold;' }, '✅'] : null
      ]
    ];
  };

  const taskCharacteristics = selectedTask ? {
    i: selectedTask.i || 0,
    s: selectedTask.s || 0,
    w: selectedTask.w || 0,
    e: selectedTask.e || 0,
    c: selectedTask.c || 0,
    h: selectedTask.h || 0,
    st: selectedTask.st || 0,
    money: selectedTask.money || 0
  } : null;

  return ['div', { className: 'container app-grid' },
    ['div', { className: 'main-panel' },
      ['h1', null, '📋 Задачи'],
      ['div', { className: 'toolbar' },
        ['input', {
          type: 'text',
          placeholder: 'Название новой задачи...',
          value: newTaskName,
          style: 'padding:8px; border:2px outset #ffffff; flex:1;',
          onInput: (e) => AIFrame.setState({ newTaskName: e.target.value }),
          onKeyPress: (e) => {
            if (e.key === 'Enter') {
              TasksActions.addTask(newTaskName);
            }
          }
        }],
        ['button', { onClick: () => TasksActions.addTask(newTaskName) }, '➕ Добавить']
      ],
      
      ['div', { style: 'display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-top:16px;' },
        ['div', null,
          ['h3', null, 'Список задач'],
          ['div', null,
            tasks.length > 0 ?
              [...tasks.map(task => renderTaskItem(task))] :
              ['div', { style: 'padding:20px; text-align:center; color:#999;' }, 'Нет задач']
          ]
        ],
        
        selectedTask ? ['div', { className: 'section' },
          ['h3', null, '✏️ Редактирование'],
          ['div', { style: 'margin-bottom:12px;' },
            ['label', null, 'Название'],
            ['input', {
              type: 'text',
              style: 'width:100%; box-sizing:border-box;',
              value: selectedTask.name,
              onChange: (e) => TasksActions.updateTask(selectedTask.id, { name: e.target.value })
            }]
          ],
          ['div', { style: 'margin-bottom:12px;' },
            ['label', null, 'Примечания / Описание'],
            ['textarea', {
              rows: 4,
              style: 'width:100%; box-sizing:border-box;',
              value: selectedTask.content,
              onChange: (e) => TasksActions.updateTask(selectedTask.id, { content: e.target.value })
            }]
          ],
          ['div', { style: 'display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; margin-bottom:12px;' },
            ['div', null, ['label', null, 'I'], ['input', { type: 'number', step: '0.1', value: selectedTask.i || 0, onChange: (e) => TasksActions.updateTask(selectedTask.id, { i: parseFloat(e.target.value) }) }]],
            ['div', null, ['label', null, 'S'], ['input', { type: 'number', step: '0.1', value: selectedTask.s || 0, onChange: (e) => TasksActions.updateTask(selectedTask.id, { s: parseFloat(e.target.value) }) }]],
            ['div', null, ['label', null, 'W'], ['input', { type: 'number', step: '0.1', value: selectedTask.w || 0, onChange: (e) => TasksActions.updateTask(selectedTask.id, { w: parseFloat(e.target.value) }) }]],
            ['div', null, ['label', null, 'E'], ['input', { type: 'number', step: '0.1', value: selectedTask.e || 0, onChange: (e) => TasksActions.updateTask(selectedTask.id, { e: parseFloat(e.target.value) }) }]],
            ['div', null, ['label', null, 'C'], ['input', { type: 'number', step: '0.1', value: selectedTask.c || 0, onChange: (e) => TasksActions.updateTask(selectedTask.id, { c: parseFloat(e.target.value) }) }]],
            ['div', null, ['label', null, 'H'], ['input', { type: 'number', step: '0.1', value: selectedTask.h || 0, onChange: (e) => TasksActions.updateTask(selectedTask.id, { h: parseFloat(e.target.value) }) }]],
            ['div', null, ['label', null, 'ST'], ['input', { type: 'number', step: '0.1', value: selectedTask.st || 0, onChange: (e) => TasksActions.updateTask(selectedTask.id, { st: parseFloat(e.target.value) }) }]],
            ['div', null, ['label', null, '$'], ['input', { type: 'number', step: '0.1', value: selectedTask.money || 0, onChange: (e) => TasksActions.updateTask(selectedTask.id, { money: parseFloat(e.target.value) }) }]]
          ],
          ['button', { style: 'background:#e74c3c; color:white;', onClick: () => TasksActions.showDeleteModal(selectedTask.id) }, '🗑 Удалить']
        ] : null
      ]
    ],

    ['aside', { className: 'side-panel' },
      ['div', { className: 'panel-title' }, 'Статистика'],
      ['div', { className: 'info-card info-card--accent' }, ['div', null, 'Всего задач'], ['div', { style: 'font-size:22px;font-weight:bold;' }, `${tasks.length}`]],
      ['div', { className: 'info-card' }, ['div', null, 'Выполнено'], ['div', { style: 'font-size:22px;font-weight:bold;' }, `${completedCount}`]],
      ['div', { className: 'info-card' }, ['div', null, 'Осталось'], ['div', { style: 'font-size:22px;font-weight:bold;' }, `${tasks.length - completedCount}`]],
      selectedTask && taskCharacteristics ? ['div', { className: 'info-card info-card--accent' },
        ['div', null, '📊 Сумма показателей'],
        ['div', { style: 'font-size:18px;font-weight:bold;' },
          (taskCharacteristics.i + taskCharacteristics.s + taskCharacteristics.w + 
           taskCharacteristics.e + taskCharacteristics.c + taskCharacteristics.h + 
           taskCharacteristics.st + taskCharacteristics.money).toFixed(1)
        ]
      ] : null,
    ],
    renderTaskModal(state)
  ];
}

async function initTasks() {
  const initialState = {
    tasks: [],
    newTaskName: '',
    selectedTaskId: null,
    modal: null
  };

  AIFrame.mount('app', initialState, TasksApp);
  TasksActions.loadTasks();

  AIFrame.Messenger.register('confirmDeleteTask', (taskId) => {
    TasksActions.deleteTask(taskId);
  });
}

document.addEventListener('DOMContentLoaded', initTasks);
