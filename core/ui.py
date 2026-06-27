"""
Генерация базового HTML/JS интерфейса для сущности.
"""

from flask import render_template_string
import json

def generate_page_template(entity_cls, db):
    """
    Генерирует HTML-страницу с CRUD интерфейсом для сущности.
    Возвращает строку с HTML.
    """
    page_name = entity_cls.__page_name__
    title = entity_cls.__title__ or page_name.capitalize()

    # Преобразуем поля в структуру для JS
    fields_json = []
    for f in entity_cls.fields:
        field_info = {
            'name': f.name,
            'label': f.label,
            'type': f.field_type.value,
            'required': f.required,
            'choices': f.choices
        }
        fields_json.append(field_info)

    template = """
<!doctype html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ title }}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .form-group { margin-bottom: 10px; }
        label { display: inline-block; width: 150px; }
        input, select, textarea { width: 300px; }
        button { margin: 5px; }
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); justify-content: center; align-items: center; }
        .modal-content { background: white; padding: 20px; border-radius: 5px; min-width: 400px; }
        .close { float: right; cursor: pointer; }
        .error { color: red; }
    </style>
</head>
<body>
    <h1>{{ title }}</h1>
    <div>
        <button id="addBtn">Добавить</button>
    </div>
    <table id="dataTable">
        <thead>
            <tr>
                <th>ID</th>
                {% for f in fields %}
                <th>{{ f.label }}</th>
                {% endfor %}
                <th>Действия</th>
            </tr>
        </thead>
        <tbody></tbody>
    </table>

    <!-- Модальное окно для добавления/редактирования -->
    <div id="modal" class="modal">
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2 id="modalTitle">Добавить</h2>
            <form id="itemForm">
                <input type="hidden" id="itemId">
                {% for f in fields %}
                <div class="form-group">
                    <label for="field_{{ f.name }}">{{ f.label }}:</label>
                    {% if f.choices %}
                    <select id="field_{{ f.name }}" name="{{ f.name }}" {% if f.required %}required{% endif %}>
                        <option value="">-- Выберите --</option>
                        {% for choice in f.choices %}
                        <option value="{{ choice }}">{{ choice }}</option>
                        {% endfor %}
                    </select>
                    {% else %}
                    {% if f.type == 'TEXT' %}
                    <textarea id="field_{{ f.name }}" name="{{ f.name }}" {% if f.required %}required{% endif %}></textarea>
                    {% elif f.type == 'BOOLEAN' %}
                    <input type="checkbox" id="field_{{ f.name }}" name="{{ f.name }}">
                    {% else %}
                    <input type="{{ 'number' if f.type in ('INTEGER','FLOAT') else 'text' }}" id="field_{{ f.name }}" name="{{ f.name }}" {% if f.required %}required{% endif %}>
                    {% endif %}
                    {% endif %}
                </div>
                {% endfor %}
                <button type="submit">Сохранить</button>
                <button type="button" id="cancelBtn">Отмена</button>
            </form>
        </div>
    </div>

    <script>
        const apiUrl = '/api/{{ page_name }}';
        let fields = {{ fields_json|tojson }};

        function loadItems() {
            fetch(apiUrl + '/list')
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'success') {
                        renderTable(data.data);
                    } else {
                        console.error('Error loading items:', data.message);
                    }
                });
        }

        function renderTable(items) {
            const tbody = document.querySelector('#dataTable tbody');
            tbody.innerHTML = '';
            for (const item of items) {
                const row = tbody.insertRow();
                // ID
                const cellId = row.insertCell();
                cellId.textContent = item.id;
                // поля
                for (const f of fields) {
                    const cell = row.insertCell();
                    let val = item[f.name];
                    if (val === null || val === undefined) val = '';
                    if (f.type === 'BOOLEAN') {
                        cell.textContent = val ? 'Да' : 'Нет';
                    } else {
                        cell.textContent = val;
                    }
                }
                // действия
                const cellActions = row.insertCell();
                const editBtn = document.createElement('button');
                editBtn.textContent = '✎';
                editBtn.onclick = () => editItem(item.id);
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = '🗑';
                deleteBtn.onclick = () => deleteItem(item.id);
                cellActions.appendChild(editBtn);
                cellActions.appendChild(deleteBtn);
            }
        }

        function addItem() {
            document.getElementById('modalTitle').textContent = 'Добавить';
            document.getElementById('itemId').value = '';
            document.getElementById('itemForm').reset();
            showModal();
        }

        function editItem(id) {
            fetch(apiUrl + '/item/' + id)
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'success') {
                        const item = data.data;
                        document.getElementById('modalTitle').textContent = 'Редактировать';
                        document.getElementById('itemId').value = item.id;
                        for (const f of fields) {
                            const el = document.getElementById('field_' + f.name);
                            if (el) {
                                if (f.type === 'BOOLEAN') {
                                    el.checked = !!item[f.name];
                                } else {
                                    el.value = item[f.name] !== null ? item[f.name] : '';
                                }
                            }
                        }
                        showModal();
                    } else {
                        alert('Ошибка загрузки: ' + data.message);
                    }
                });
        }

        function deleteItem(id) {
            if (confirm('Удалить запись?')) {
                fetch(apiUrl + '/delete/' + id, { method: 'DELETE' })
                    .then(res => res.json())
                    .then(data => {
                        if (data.status === 'success') {
                            loadItems();
                        } else {
                            alert('Ошибка удаления: ' + data.message);
                        }
                    });
            }
        }

        function saveItem() {
            const id = document.getElementById('itemId').value;
            const formData = {};
            for (const f of fields) {
                const el = document.getElementById('field_' + f.name);
                if (el) {
                    let val;
                    if (f.type === 'BOOLEAN') {
                        val = el.checked;
                    } else {
                        val = el.value;
                        if (f.type === 'INTEGER' && val) val = parseInt(val, 10);
                        if (f.type === 'FLOAT' && val) val = parseFloat(val);
                    }
                    formData[f.name] = val;
                }
            }
            let url = apiUrl + '/create';
            let method = 'POST';
            if (id) {
                url = apiUrl + '/update/' + id;
                method = 'PUT';
            }
            fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    hideModal();
                    loadItems();
                } else {
                    alert('Ошибка сохранения: ' + data.message);
                }
            });
        }

        function showModal() {
            document.getElementById('modal').style.display = 'flex';
        }
        function hideModal() {
            document.getElementById('modal').style.display = 'none';
        }

        document.getElementById('addBtn').addEventListener('click', addItem);
        document.getElementById('itemForm').addEventListener('submit', (e) => {
            e.preventDefault();
            saveItem();
        });
        document.getElementById('cancelBtn').addEventListener('click', hideModal);
        document.querySelector('.close').addEventListener('click', hideModal);
        window.onclick = function(event) {
            const modal = document.getElementById('modal');
            if (event.target == modal) hideModal();
        }

        loadItems();
    </script>
</body>
</html>
    """
    from flask import render_template_string
    return render_template_string(template, title=title, page_name=page_name, fields=entity_cls.fields, fields_json=fields_json)

def register_ui_route(app, entity_cls, db):
    """Регистрирует маршрут для страницы сущности."""
    page_name = entity_cls.__page_name__
    @app.route(f'/{page_name}')
    def entity_page():
        return generate_page_template(entity_cls, db)