// static/combinations-modal.js

function renderCombinationsModal(state) {
  const { modal, editingLink, habits, substances, categories, activities } = state;

  if (!modal) {
    return null;
  }

  const isDelete = modal.type.startsWith('delete-');
  const isEdit = modal.type.startsWith('edit-');
  const isNew = modal.type.startsWith('new-');

  const getTitle = () => {
    if (isDelete) return 'Удалить связь?';
    if (isEdit) return 'Редактировать связь';
    if (isNew) return 'Создать новую связь';
    return '';
  };

  const renderContent = () => {
    if (isDelete) {
      return ['p', null, `Вы уверены, что хотите удалить этот элемент? Действие необратимо.`];
    } 
    
    if (isNew || isEdit) {
      const isBiometric = modal.type.includes('biometric');
      
      const habitOptions = (habits || []).map(h => ['option', { value: h.id }, h.name]);
      
      const substanceOptions = (substances || []).map(s => ['option', { value: s.name }, s.name]);
      const activityOptions = (activities || []).map(a => ['option', { value: a.name }, a.name]);
      const biometricOptions = [
        ['optgroup', { label: 'Вещества' }, ...substanceOptions],
        ['optgroup', { label: 'Активности' }, ...activityOptions]
      ];

      const financeOptions = (categories || []).map(c => ['option', { value: c.id }, c.name]);
      
      return ['div', null,
        ['div', { className: 'form-group' },
          ['label', null, 'Привычка'],
          ['select', {
            value: editingLink.habit_id,
            onChange: (e) => CombinationsActions.updateEditingLink({ habit_id: parseInt(e.target.value) })
          }, ...habitOptions]
        ],
        ['div', { className: 'form-group' },
          ['label', null, isBiometric ? 'Биометрический тип' : 'Финансовая категория'],
          isBiometric 
            ? ['select', { 
                value: editingLink.biometric_type,
                onChange: (e) => CombinationsActions.updateEditingLink({ biometric_type: e.target.value })
              }, ...biometricOptions]
            : ['select', { 
                value: editingLink.category_id,
                onChange: (e) => CombinationsActions.updateEditingLink({ category_id: parseInt(e.target.value) })
              }, ...financeOptions]
        ]
      ];
    }

    return null;
  };

  return ['div', { className: 'modal-overlay' },
    ['div', { className: 'modal-card', onClick: (e) => e.stopPropagation() },
      ['h3', { style: 'margin-top:0;' }, getTitle()],
      renderContent(),
      ['div', { className: 'modal-actions' },
        ['button', {
          onClick: () => CombinationsActions.closeModal()
        }, 'Отмена'],
        isDelete
          ? ['button', {
              className: 'pill-btn--primary',
              onClick: () => {
                AIFrame.Messenger.send('confirm-delete', { type: modal.type, id: modal.id });
                CombinationsActions.closeModal();
              }
            }, 'Удалить']
          : ['button', {
              className: 'pill-btn--primary',
              onClick: () => {
                AIFrame.Messenger.send('save-combination');
              }
            }, 'Сохранить']
      ]
    ]
  ];
}
