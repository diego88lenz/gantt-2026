-- =============================================================================
-- Gantt 2026 — Modelo Relacional
-- SGBD: PostgreSQL 15+ (compatível com MySQL 8+ com ajustes menores)
-- =============================================================================

-- Tabela: years
-- Armazena os anos de planejamento disponíveis
CREATE TABLE years (
    id          SERIAL PRIMARY KEY,
    year_value  INTEGER NOT NULL UNIQUE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela: categories
-- Categorias de agrupamento de tarefas (ex: Geral, Dados, Lakehouse)
CREATE TABLE categories (
    id          SERIAL PRIMARY KEY,
    slug        VARCHAR(50) NOT NULL UNIQUE,      -- identificador textual (ex: 'projects')
    name        VARCHAR(100) NOT NULL,
    color       VARCHAR(7) NOT NULL DEFAULT '#00f1fe',  -- hexadecimal ex: #00f1fe
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela: tasks
-- Tarefas pertencem a uma categoria e a um ano
CREATE TABLE tasks (
    id            SERIAL PRIMARY KEY,
    year_id       INTEGER NOT NULL REFERENCES years(id) ON DELETE CASCADE,
    category_id   INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name          VARCHAR(500) NOT NULL,
    progress      INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    is_milestone  BOOLEAN NOT NULL DEFAULT FALSE,
    assignee      VARCHAR(200),
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela: task_months
-- Relação N:N entre tasks e meses (0=JAN, 11=DEZ)
-- Cada linha representa um mês em que a tarefa está ativa
CREATE TABLE task_months (
    id          SERIAL PRIMARY KEY,
    task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    month_num   INTEGER NOT NULL CHECK (month_num >= 0 AND month_num <= 11),
    UNIQUE (task_id, month_num)
);

-- Tabela: dependencies
-- Tarefa predecessora → tarefa sucessora
CREATE TABLE dependencies (
    id                    SERIAL PRIMARY KEY,
    predecessor_task_id   INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    successor_task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dependency_type       VARCHAR(20) DEFAULT 'finish_to_start',  -- finish_to_start | start_to_start | finish_to_finish | start_to_finish
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (predecessor_task_id, successor_task_id),
    CHECK (predecessor_task_id <> successor_task_id)
);

-- =============================================================================
-- Índices
-- =============================================================================
CREATE INDEX idx_tasks_year            ON tasks(year_id);
CREATE INDEX idx_tasks_category        ON tasks(category_id);
CREATE INDEX idx_tasks_assignee        ON tasks(assignee);
CREATE INDEX idx_tasks_year_category   ON tasks(year_id, category_id);
CREATE INDEX idx_task_months_task      ON task_months(task_id);
CREATE INDEX idx_task_months_month     ON task_months(month_num);
CREATE INDEX idx_deps_predecessor      ON dependencies(predecessor_task_id);
CREATE INDEX idx_deps_successor        ON dependencies(successor_task_id);

-- =============================================================================
-- Triggers: atualizar updated_at automaticamente
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_categories_updated
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_tasks_updated
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
