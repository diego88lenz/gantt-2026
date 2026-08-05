-- =============================================================================
-- Gantt 2026 — Cadastro de Departamentos, Empresas e Pessoas
-- Executar APÓS projects.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS persons (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL UNIQUE,
    email VARCHAR(200),
    department VARCHAR(200),
    role VARCHAR(50) DEFAULT 'assignee',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(name);
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
CREATE INDEX IF NOT EXISTS idx_persons_name ON persons(name);
CREATE INDEX IF NOT EXISTS idx_persons_role ON persons(role);

-- FKs na tabela projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS assignee_id INTEGER REFERENCES persons(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS requester_id INTEGER REFERENCES persons(id);

-- Popular tabelas a partir dos projetos existentes
INSERT INTO departments (name) SELECT DISTINCT department FROM projects WHERE department IS NOT NULL AND department <> '' ON CONFLICT (name) DO NOTHING;
INSERT INTO companies (name) SELECT DISTINCT company FROM projects WHERE company IS NOT NULL AND company <> '' ON CONFLICT (name) DO NOTHING;

-- Popular persons — extrai responsáveis e solicitantes únicos
INSERT INTO persons (name, role) SELECT DISTINCT assignee, 'assignee' FROM projects WHERE assignee IS NOT NULL AND assignee <> '' ON CONFLICT (name) DO NOTHING;
INSERT INTO persons (name, role) SELECT DISTINCT requester, 'requester' FROM projects WHERE requester IS NOT NULL AND requester <> '' ON CONFLICT (name) DO UPDATE SET role = persons.role; -- mantém role original se já existe

-- Vincular projetos às novas tabelas por nome
UPDATE projects p SET department_id = d.id FROM departments d WHERE p.department = d.name AND p.department_id IS NULL;
UPDATE projects p SET company_id = c.id FROM companies c WHERE p.company = c.name AND p.company_id IS NULL;
UPDATE projects p SET assignee_id = a.id FROM persons a WHERE p.assignee = a.name AND p.assignee_id IS NULL;
UPDATE projects p SET requester_id = a.id FROM persons a WHERE p.requester = a.name AND p.requester_id IS NULL;
