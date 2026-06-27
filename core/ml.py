"""
Простые нейросети и генетические алгоритмы.
Все реализации на чистом Python, без внешних зависимостей.
"""

import math
import random
import json

# ---------- Нейронная сеть ----------
class SimpleNeuralNetwork:
    """Двухслойная нейросеть с сигмоидой."""
    def __init__(self, input_size, hidden_size, output_size, learning_rate=0.1):
        self.input_size = input_size
        self.hidden_size = hidden_size
        self.output_size = output_size
        self.lr = learning_rate

        # инициализация весов случайными числами
        self.W1 = [[random.uniform(-1, 1) for _ in range(hidden_size)] for _ in range(input_size)]
        self.b1 = [random.uniform(-1, 1) for _ in range(hidden_size)]
        self.W2 = [[random.uniform(-1, 1) for _ in range(output_size)] for _ in range(hidden_size)]
        self.b2 = [random.uniform(-1, 1) for _ in range(output_size)]

    def sigmoid(self, x):
        return 1 / (1 + math.exp(-x))

    def sigmoid_derivative(self, x):
        s = self.sigmoid(x)
        return s * (1 - s)

    def forward(self, X):
        """X – список входов размером input_size"""
        # скрытый слой
        z1 = [sum(X[i] * self.W1[i][j] for i in range(self.input_size)) + self.b1[j] for j in range(self.hidden_size)]
        a1 = [self.sigmoid(z) for z in z1]
        # выходной слой
        z2 = [sum(a1[j] * self.W2[j][k] for j in range(self.hidden_size)) + self.b2[k] for k in range(self.output_size)]
        a2 = [self.sigmoid(z) for z in z2]
        return a1, a2

    def predict(self, X):
        _, out = self.forward(X)
        return out

    def train(self, X_train, y_train, epochs=1000):
        """X_train – список примеров, каждый пример – список входов.
           y_train – список целевых выходов (списки длиной output_size)."""
        for epoch in range(epochs):
            total_loss = 0.0
            for X, y in zip(X_train, y_train):
                # прямой проход
                a1, a2 = self.forward(X)
                # ошибка выходного слоя
                error_output = [a2[k] - y[k] for k in range(self.output_size)]
                delta_output = [error_output[k] * self.sigmoid_derivative(a2[k]) for k in range(self.output_size)]
                # ошибка скрытого слоя
                error_hidden = [sum(self.W2[j][k] * delta_output[k] for k in range(self.output_size)) for j in range(self.hidden_size)]
                delta_hidden = [error_hidden[j] * self.sigmoid_derivative(a1[j]) for j in range(self.hidden_size)]

                # обновление весов W2 и b2
                for j in range(self.hidden_size):
                    for k in range(self.output_size):
                        self.W2[j][k] -= self.lr * delta_output[k] * a1[j]
                for k in range(self.output_size):
                    self.b2[k] -= self.lr * delta_output[k]

                # обновление весов W1 и b1
                for i in range(self.input_size):
                    for j in range(self.hidden_size):
                        self.W1[i][j] -= self.lr * delta_hidden[j] * X[i]
                for j in range(self.hidden_size):
                    self.b1[j] -= self.lr * delta_hidden[j]

                total_loss += sum(e**2 for e in error_output)
            if epoch % 100 == 0:
                print(f"Epoch {epoch}, loss = {total_loss / len(X_train)}")

    def save(self, filepath):
        """Сохраняет веса в JSON."""
        with open(filepath, 'w') as f:
            json.dump({
                'input_size': self.input_size,
                'hidden_size': self.hidden_size,
                'output_size': self.output_size,
                'W1': self.W1,
                'b1': self.b1,
                'W2': self.W2,
                'b2': self.b2
            }, f)

    def load(self, filepath):
        """Загружает веса из JSON."""
        with open(filepath) as f:
            data = json.load(f)
        self.input_size = data['input_size']
        self.hidden_size = data['hidden_size']
        self.output_size = data['output_size']
        self.W1 = data['W1']
        self.b1 = data['b1']
        self.W2 = data['W2']
        self.b2 = data['b2']

# ---------- Линейная регрессия для прогнозирования ----------
class LinearRegression:
    """Простая линейная регрессия для предсказания на основе временного ряда."""
    def __init__(self):
        self.slope = 0.0
        self.intercept = 0.0

    def fit(self, X, y):
        """X - список дней (например, 0,1,2,...), y - значения quantity."""
        n = len(X)
        if n == 0:
            return
        sum_x = sum(X)
        sum_y = sum(y)
        sum_xy = sum(x * y for x, y in zip(X, y))
        sum_x2 = sum(x**2 for x in X)
        denominator = n * sum_x2 - sum_x**2
        if denominator == 0:
            self.slope = 0
            self.intercept = sum_y / n
        else:
            self.slope = (n * sum_xy - sum_x * sum_y) / denominator
            self.intercept = (sum_y - self.slope * sum_x) / n

    def predict(self, X):
        """X - список дней для предсказания."""
        return [self.slope * x + self.intercept for x in X]

    def predict_next(self, days_count):
        """Предсказать следующее значение после days_count дней."""
        return self.slope * days_count + self.intercept

# ---------- Прогнозирование физической активности ----------
def predict_activity_progress(db, activity_type, days_ahead=1):
    """
    Прогнозирует прогресс для activity_type на days_ahead дней вперёд.
    Возвращает: {'max_predicted': float, 'recommended': float}
    """
    from datetime import datetime, timedelta

    # Получить данные за последние 30 дней
    end_date = datetime.today().date()
    start_date = end_date - timedelta(days=30)

    # Получить записи из базы
    conn = db.get_conn()
    conn.row_factory = None  # использовать dict
    cursor = conn.cursor()
    cursor.execute("""
        SELECT date, quantity FROM biometric_physical_activity
        WHERE activity_type = ? AND date BETWEEN ? AND ?
        ORDER BY date
    """, (activity_type, start_date.isoformat(), end_date.isoformat()))
    rows = cursor.fetchall()
    conn.close()

    if len(rows) < 2:
        # Недостаточно данных, вернуть среднее
        avg = sum(r[1] for r in rows) / len(rows) if rows else 0
        return {'max_predicted': avg, 'recommended': avg * 1.05}

    # Подготовить данные: дни от 0 до len-1, quantity
    dates = [datetime.fromisoformat(r[0]).date() for r in rows]
    quantities = [r[1] for r in rows]
    days = list(range(len(dates)))

    # Обучить линейную регрессию
    lr = LinearRegression()
    lr.fit(days, quantities)

    # Предсказать на следующий день
    next_day = len(days)
    max_predicted = lr.predict_next(next_day)

    # Рекомендация: предсказанное + 5% прирост, но не меньше последнего
    last_quantity = quantities[-1]
    recommended = max(last_quantity * 1.05, max_predicted * 0.95)

    return {'max_predicted': round(max_predicted, 1), 'recommended': round(recommended, 1)}

# ---------- Генетический алгоритм ----------
class GeneticOptimizer:
    def __init__(self, population_size, genes, fitness, mutation_rate=0.1, crossover_rate=0.7):
        self.pop_size = population_size
        self.genes = genes        # количество параметров (длина хромосомы)
        self.fitness = fitness    # функция, принимающая список параметров и возвращающая число
        self.mutation_rate = mutation_rate
        self.crossover_rate = crossover_rate
        self.population = None

    def _create_individual(self):
        return [random.uniform(-10, 10) for _ in range(self.genes)]

    def _crossover(self, p1, p2):
        if random.random() < self.crossover_rate:
            point = random.randint(1, self.genes-1)
            child = p1[:point] + p2[point:]
            return child
        else:
            return p1[:]  # клон

    def _mutate(self, ind):
        for i in range(self.genes):
            if random.random() < self.mutation_rate:
                ind[i] += random.gauss(0, 1)
        return ind

    def _select(self, fitnesses):
        # турнирный отбор
        tournament = random.sample(range(self.pop_size), 2)
        if fitnesses[tournament[0]] > fitnesses[tournament[1]]:
            return tournament[0]
        else:
            return tournament[1]

    def run(self, generations):
        self.population = [self._create_individual() for _ in range(self.pop_size)]
        for gen in range(generations):
            fitnesses = [self.fitness(ind) for ind in self.population]
            best_idx = max(range(self.pop_size), key=lambda i: fitnesses[i])
            best = self.population[best_idx]
            # элитизм
            new_pop = [best[:]]
            while len(new_pop) < self.pop_size:
                p1_idx = self._select(fitnesses)
                p2_idx = self._select(fitnesses)
                child = self._crossover(self.population[p1_idx], self.population[p2_idx])
                child = self._mutate(child)
                new_pop.append(child)
            self.population = new_pop
            # вывод прогресса
            print(f"Generation {gen}: best fitness = {fitnesses[best_idx]}")
        return best