"""
Автоматическая генерация Flask Blueprint для сущности.
"""

from flask import Blueprint, request, jsonify
import logging

logger = logging.getLogger(__name__)

def register_entity_blueprint(app, entity_cls, db):
    """Создаёт и регистрирует blueprint для сущности."""
    page_name = entity_cls.__page_name__
    if not page_name:
        page_name = entity_cls.__tablename__

    bp = Blueprint(page_name, __name__, url_prefix=f'/api/{page_name}')

    # GET /list
    @bp.route('/list', methods=['GET'])
    def list_items():
        try:
            # парсим фильтры из query string (одноуровневые)
            filters = {}
            for key, value in request.args.items():
                if key not in ('order_by', 'limit', 'offset'):
                    filters[key] = value
            order_by = request.args.get('order_by')
            limit = request.args.get('limit')
            if limit:
                limit = int(limit)
            offset = request.args.get('offset')
            if offset:
                offset = int(offset)
            items = db.list(entity_cls, filters=filters, order_by=order_by, limit=limit, offset=offset)
            total = db.count(entity_cls, filters=filters)
            return jsonify({
                'status': 'success',
                'data': [item.to_dict() for item in items],
                'total': total,
                'limit': limit,
                'offset': offset
            })
        except Exception as e:
            logger.exception("Error listing items")
            return jsonify({'status': 'error', 'message': str(e)}), 500

    # GET /item/<id>
    @bp.route('/item/<int:id>', methods=['GET'])
    def get_item(id):
        try:
            item = db.get(entity_cls, id)
            if not item:
                return jsonify({'status': 'error', 'message': 'Not found'}), 404
            return jsonify({'status': 'success', 'data': item.to_dict()})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500

    # POST /create
    @bp.route('/create', methods=['POST'])
    def create_item():
        try:
            data = request.get_json()
            if not data:
                return jsonify({'status': 'error', 'message': 'No data'}), 400
            # создаём объект
            item = entity_cls(**data)
            db.insert(item)
            return jsonify({'status': 'success', 'id': item.id, 'data': item.to_dict()})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 400

    # PUT /update/<id>
    @bp.route('/update/<int:id>', methods=['PUT'])
    def update_item(id):
        try:
            item = db.get(entity_cls, id)
            if not item:
                return jsonify({'status': 'error', 'message': 'Not found'}), 404
            data = request.get_json()
            for key, value in data.items():
                item[key] = value
            db.update(item)
            return jsonify({'status': 'success', 'data': item.to_dict()})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 400

    # DELETE /delete/<id>
    @bp.route('/delete/<int:id>', methods=['DELETE'])
    def delete_item(id):
        try:
            db.delete(entity_cls, id)
            return jsonify({'status': 'success'})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500

    app.register_blueprint(bp)
    logger.info(f"Registered API for {page_name}")