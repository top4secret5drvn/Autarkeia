// static/tasks-modal.js

function renderTaskModal(state) {
  const { modal } = state;

  if (!modal || modal.type !== 'delete-task') {
    return null; // Don't render the modal if it's not the right type or not visible
  }

  const task = state.tasks.find(t => t.id === modal.taskId);
  const taskName = task ? task.name : '';

  return ['div', { className: 'modal-overlay' },
    ['div', { className: 'modal-card', onClick: (e) => e.stopPropagation() },
      ['h3', { style: 'margin-top:0;' }, 'Подтвердите удаление'],
      ['p', null, `Вы уверены, что хотите удалить задачу "${taskName}"? Это действие необратимо.`],
      ['div', { className: 'modal-actions' },
        ['button', {
          onClick: () => AIFrame.setState({ modal: null })
        }, 'Отмена'],
        ['button', {
          className: 'pill-btn--primary',
          onClick: () => {
            AIFrame.Messenger.send('confirmDeleteTask', modal.taskId);
            AIFrame.setState({ modal: null });
          }
        }, 'Удалить']
      ]
    ]
  ];
}
