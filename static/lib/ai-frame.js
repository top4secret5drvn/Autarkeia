// ai-frame.js
// 🧠 Мини-фреймворк: LISP-структуры + Prolog-правила + Smalltalk-сообщения + Refal.

const AIFrame = {
  // ========== 1. ЯДРО (реактивность и создание DOM из S-выражений) ==========
  state: {},

  listeners: [],

  setState(newState) {
    this.state = { ...this.state, ...newState };
    this.listeners.forEach(listener => listener());
  },

  /**
   * Превращает S-выражение (массив вида [тег, атрибуты, ...дети]) в DOM-элемент.
   * Поддерживает строки, числа, null/undefined/boolean → пустой текстовый узел.
   * Если ребёнок — массив массивов, разворачивает его как список.
   */
  createElement(node) {
    if (typeof node === 'string' || typeof node === 'number') {
      return document.createTextNode(node);
    }
    if (node === null || node === undefined || typeof node === 'boolean') {
      return document.createTextNode('');
    }

    const [tag, attrs, ...children] = node;
    const el = document.createElement(tag);

    // Временные переменные для value/checked, которые установим ПОСЛЕ добавления детей
    let deferredValue = undefined;
    let deferredChecked = undefined;

    if (attrs) {
      for (let key in attrs) {
        if (key.startsWith('on') && typeof attrs[key] === 'function') {
          const eventName = key.substring(2).toLowerCase();
          el.addEventListener(eventName, attrs[key]);
        } else if (key === 'className') {
          el.className = attrs[key];
        } else if (key === 'style' && typeof attrs[key] === 'object') {
          Object.assign(el.style, attrs[key]);
        } else if (key === 'value' && 'value' in el) {
          // откладываем установку value
          deferredValue = attrs[key];
        } else if (key === 'checked' && 'checked' in el) {
          // откладываем установку checked
          deferredChecked = attrs[key];
        } else if (key === 'key') {
          el.setAttribute('data-ai-key', attrs[key]);
        } else {
          el.setAttribute(key, attrs[key]);
        }
      }
    }

    // Добавляем дочерние элементы (напр. <option> для <select>)
    children.forEach(child => {
      if (Array.isArray(child) && Array.isArray(child[0])) {
        child.forEach(c => el.appendChild(this.createElement(c)));
      } else {
        el.appendChild(this.createElement(child));
      }
    });

    // Теперь, когда все дочерние элементы на месте, задаём value и checked
    if (deferredValue !== undefined) {
      el.value = deferredValue;
    }
    if (deferredChecked !== undefined) {
      el.checked = deferredChecked;
    }

    return el;
  },

  /**
   * Монтирует приложение в DOM.
   * @param {string} rootElementId - id элемента-контейнера
   * @param {object} initialState - начальное состояние
   * @param {function} renderFunction - (state) => S-выражение
   */
  mount(rootElementId, initialState, renderFunction) {
    this.state = initialState;
    const root = document.getElementById(rootElementId);

    const updateDOM = () => {
      const activeEl = document.activeElement;
      const activeInfo = activeEl && root.contains(activeEl) ? {
        tagName: activeEl.tagName.toLowerCase(),
        id: activeEl.id,
        name: activeEl.name,
        placeholder: activeEl.placeholder,
        type: activeEl.type,
        dataKey: activeEl.dataset.aiKey,
        selectionStart: activeEl.selectionStart,
        selectionEnd: activeEl.selectionEnd
      } : null;

      const escapeCss = (value) => {
        if (typeof CSS !== 'undefined' && CSS.escape) {
          return CSS.escape(value);
        }
        return value.replace(/(["'\\])/g, '\\$1');
      };

      const findMatchingElement = (info) => {
        if (!info) return null;
        if (info.id) {
          const byId = document.getElementById(info.id);
          if (byId) return byId;
        }
        if (info.dataKey) {
          const byKey = document.querySelector(`[data-ai-key="${escapeCss(info.dataKey)}"]`);
          if (byKey) return byKey;
        }
        if (info.name) {
          const byName = root.querySelector(`${info.tagName}[name="${escapeCss(info.name)}"]`);
          if (byName) return byName;
        }
        if (info.placeholder) {
          const byPlaceholder = root.querySelector(`${info.tagName}[placeholder="${escapeCss(info.placeholder)}"]`);
          if (byPlaceholder) return byPlaceholder;
        }
        return null;
      };

      root.innerHTML = '';
      const virtualTree = renderFunction(this.state);
      root.appendChild(this.createElement(virtualTree));

      if (activeInfo) {
        const newEl = findMatchingElement(activeInfo);
        if (newEl && newEl.tagName.toLowerCase() === activeInfo.tagName) {
          newEl.focus();
          if (newEl.setSelectionRange && activeInfo.selectionStart !== undefined) {
            newEl.setSelectionRange(activeInfo.selectionStart, activeInfo.selectionEnd);
          }
        }
      }
    };

    this.listeners.push(updateDOM);
    updateDOM();
  },

  // ========== 2. ПРОЛОГ-МАШИНА (факты, правила, унификация) ==========
  Rules: {
    facts: [],
    rules: [],

    fact(...args) {
      this.facts.push(args);
    },

    rule(head, ...body) {
      this.rules.push({ head, body });
    },

    query(goal) {
      const solutions = [];
      const trySolve = (goals, bindings) => {
        if (goals.length === 0) {
          const clean = {};
          for (const [name, value] of Object.entries(bindings)) {
            if (typeof value === 'string' && value.startsWith('$')) continue;
            clean[name] = value;
          }
          solutions.push(clean);
          return;
        }

        const [current, ...rest] = goals;

        for (const fact of this.facts) {
          const newB = this.unify(current, fact, bindings);
          if (newB) trySolve(rest, newB);
        }

        for (const rule of this.rules) {
          const headCopy = JSON.parse(JSON.stringify(rule.head));
          const newB = this.unify(current, headCopy, bindings);
          if (newB) {
            const bodyWithBindings = rule.body.map(g => this.substitute(g, newB));
            trySolve([...bodyWithBindings, ...rest], newB);
          }
        }
      };

      trySolve([goal], {});
      return solutions;
    },

    unify(goal, fact, bindings) {
      const newB = { ...bindings };

      const walk = (g, f) => {
        if (typeof g === 'string' && g.startsWith('$')) {
          const varName = g.slice(1);
          if (newB[varName] !== undefined) {
            return walk(newB[varName], f);
          }
          newB[varName] = f;
          return true;
        }
        if (Array.isArray(g) && Array.isArray(f) && g.length === f.length) {
          for (let i = 0; i < g.length; i++) {
            if (!walk(g[i], f[i])) return false;
          }
          return true;
        }
        return g === f;
      };

      return walk(goal, fact) ? newB : null;
    },

    substitute(goal, bindings) {
      const sub = (x) => {
        if (typeof x === 'string' && x.startsWith('$')) {
          const v = bindings[x.slice(1)];
          return v !== undefined ? v : x;
        }
        if (Array.isArray(x)) return x.map(sub);
        return x;
      };
      return goal.map(sub);
    }
  },

  // ========== 3. SMALLTALK-СООБЩЕНИЯ ==========
  Messenger: {
    receivers: {},

    register(name, handler) {
      this.receivers[name] = handler;
    },

    send(name, ...args) {
      if (this.receivers[name]) {
        return this.receivers[name](...args);
      }
      console.warn(`[Messenger] нет получателя для сообщения "${name}"`);
    }
  },

  // ========== 4. ФОРТРАНОВЫЕ ПОДПРОГРАММЫ (макросы) ==========
  SUBROUTINE(name, fn) {
    this[name] = fn;
  },

  // ========== 5. РЕФАЛ-ДВИЖОК (нормальные алгоритмы Маркова) ==========
  Refal: {
    rules: [],

    addRule(pattern, replacement) {
      this.rules.push({ pattern, replacement });
    },

    apply(input) {
      let result = input;
      for (const { pattern, replacement } of this.rules) {
        if (typeof replacement === 'function') {
          result = result.replace(pattern, replacement);
        } else {
          result = result.replace(pattern, replacement);
        }
      }
      return result;
    },

    applyWith(input, rules) {
      let result = input;
      for (const { pattern, replacement } of rules) {
        if (typeof replacement === 'function') {
          result = result.replace(pattern, replacement);
        } else {
          result = result.replace(pattern, replacement);
        }
      }
      return result;
    }
  }
};