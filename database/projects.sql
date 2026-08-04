-- =============================================================================
-- Gantt 2026 — Tabela de Projetos
-- Executar APÓS database/schema.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS projects (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(300) NOT NULL,
    description     TEXT,
    type            VARCHAR(50) NOT NULL DEFAULT 'data',
    department      VARCHAR(200),
    company         VARCHAR(200),
    assignee        VARCHAR(200),
    requester       VARCHAR(200),
    status          VARCHAR(30) NOT NULL DEFAULT 'planning',
    priority        VARCHAR(20) NOT NULL DEFAULT 'medium',
    start_date      DATE,
    end_date        DATE,
    budget          DECIMAL(12,2),
    tags            VARCHAR(300),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_type        ON projects(type);
CREATE INDEX IF NOT EXISTS idx_projects_department  ON projects(department);
CREATE INDEX IF NOT EXISTS idx_projects_company     ON projects(company);
CREATE INDEX IF NOT EXISTS idx_projects_status      ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_priority    ON projects(priority);
CREATE INDEX IF NOT EXISTS idx_projects_assignee    ON projects(assignee);

-- Trigger updated_at (reaproveita a função update_updated_at do schema.sql)
DROP TRIGGER IF EXISTS trg_projects_updated ON projects;
CREATE TRIGGER trg_projects_updated
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
