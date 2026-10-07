-- =============================================================================
-- Gantt 2026 — Documentos de Projeto (brief, especificação, planejamento, etc.)
-- Executar APÓS database/projects.sql
-- É idempotente: pode ser executado várias vezes com segurança.
-- =============================================================================

-- Função reaproveitada pelos triggers de updated_at.
-- Recriada aqui para que este arquivo funcione mesmo sem o schema.sql aplicado.
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- Tabela: project_documents
-- Documento "atual" de cada tipo, por projeto.
-- O catálogo de tipos (type_slug) vive em server/document-templates.js e é
-- validado na API — mantido em código para não divergir dos builders.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_documents (
    id               SERIAL PRIMARY KEY,
    project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type_slug        VARCHAR(60) NOT NULL,
    title            VARCHAR(300) NOT NULL,
    content          TEXT NOT NULL,
    current_version  INTEGER NOT NULL DEFAULT 1 CHECK (current_version >= 1),
    status           VARCHAR(20) NOT NULL DEFAULT 'draft',   -- draft | final
    generated_by     VARCHAR(60) NOT NULL DEFAULT 'template', -- template | manual | ai
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, type_slug)
);

CREATE INDEX IF NOT EXISTS idx_project_documents_project ON project_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_type    ON project_documents(type_slug);

DROP TRIGGER IF EXISTS trg_project_documents_updated ON project_documents;
CREATE TRIGGER trg_project_documents_updated
    BEFORE UPDATE ON project_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -----------------------------------------------------------------------------
-- Tabela: project_document_versions
-- Histórico append-only. Cada salvamento/restauração gera uma nova linha,
-- permitindo auditoria e reversão sem perder o conteúdo anterior.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_document_versions (
    id           SERIAL PRIMARY KEY,
    document_id  INTEGER NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE,
    version      INTEGER NOT NULL CHECK (version >= 1),
    title        VARCHAR(300) NOT NULL,
    content      TEXT NOT NULL,
    author       VARCHAR(200),
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (document_id, version)
);

CREATE INDEX IF NOT EXISTS idx_pdv_document ON project_document_versions(document_id);
