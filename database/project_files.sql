-- =============================================================================
-- Gantt 2026 — Repositório GitHub + Arquivos Anexos dos Projetos
-- Executar: node server/init-db.js  OU  psql -f database/project_files.sql
-- É idempotente: pode ser executado várias vezes com segurança.
-- =============================================================================

-- 1) Campo para o repositório do GitHub no cadastro de projeto
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_repo VARCHAR(1000);

-- 2) Arquivos anexados a um projeto
CREATE TABLE IF NOT EXISTS project_files (
    id             SERIAL PRIMARY KEY,
    project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    filename       VARCHAR(500) NOT NULL,     -- nome físico no disco
    original_name  VARCHAR(500) NOT NULL,     -- nome original enviado pelo usuário
    mime_type      VARCHAR(200),
    size_bytes     BIGINT NOT NULL DEFAULT 0,
    uploaded_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id);
