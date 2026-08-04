-- =============================================================================
-- Gantt 2026 — Seed de dados iniciais
-- Executar APÓS database/schema.sql
-- =============================================================================

-- Limpar dados existentes (ordem reversa para respeitar FKs)
DELETE FROM dependencies;
DELETE FROM task_months;
DELETE FROM tasks;
DELETE FROM categories;
DELETE FROM years;

-- Resetar sequences
SELECT setval('years_id_seq', 1, false);
SELECT setval('categories_id_seq', 1, false);
SELECT setval('tasks_id_seq', 1, false);
SELECT setval('task_months_id_seq', 1, false);
SELECT setval('dependencies_id_seq', 1, false);

-- =============================================================================
-- Anos
-- =============================================================================
INSERT INTO years (year_value) VALUES (2025), (2026), (2027), (2028);

-- =============================================================================
-- Categorias
-- =============================================================================
INSERT INTO categories (slug, name, color, sort_order) VALUES
    ('projects', 'Geral',      '#00f1fe', 0),
    ('data',     'Dados',      '#00e0fe', 1),
    ('lake',     'Lakehouse',  '#0580d3', 2);

-- =============================================================================
-- Tarefas — Categoria: Geral (projects) — Ano 2026
-- =============================================================================
INSERT INTO tasks (year_id, category_id, name, progress, is_milestone, sort_order) VALUES
    (2, 1, 'Kickoff do PLAN 2026', 0, false, 0),
    (2, 1, 'Versão 1.0 do Design System de Dados', 0, false, 1),
    (2, 1, 'Portfólio de Projetos', 0, false, 2),
    (2, 1, 'Trilhas de analítica, ciência de dados e engenharia de Dados (EAD)', 0, false, 3),
    (2, 1, 'Plano Desenvolvimento Individual', 0, false, 4),
    (2, 1, 'Lançamento da trilha de capacitação', 0, false, 5),
    (2, 1, 'Painel de custos de dados (FinOps) e a políticas de retenção.', 0, false, 6),
    (2, 1, 'Retrospectiva do PLANO 2026', 0, false, 7),
    (2, 1, 'Desenho preliminar do PLANO 2027', 0, false, 8);

INSERT INTO task_months (task_id, month_num) VALUES
    (1, 0),
    (2, 1), (2, 2), (2, 3),
    (3, 2), (3, 3), (3, 4),
    (4, 3), (4, 4), (4, 5),
    (5, 3), (5, 4), (5, 5),
    (6, 5), (6, 6),
    (7, 6), (7, 7), (7, 8), (7, 9),
    (8, 8), (8, 9), (8, 10),
    (9, 9), (9, 10), (9, 11);

-- =============================================================================
-- Tarefas — Categoria: Dados (data) — Ano 2026
-- =============================================================================
INSERT INTO tasks (year_id, category_id, name, progress, is_milestone, sort_order) VALUES
    (2, 2, 'Definição de padrão de versionamento', 0, false, 0),
    (2, 2, 'Melhorias nos repositórios principais', 0, false, 1),
    (2, 2, 'POC do Embed YVY e Animus', 0, false, 2),
    (2, 2, 'Embed YVY e Animus v1 em produção, expandindo para novos casos', 0, false, 3),
    (2, 2, 'Design System aplicado aos primeiros dashboards', 0, false, 4),
    (2, 2, 'Adoção de Design System (todo novo dashboard nasce no padrão)', 0, false, 5),
    (2, 2, 'Versionamento adotado como padrão obrigatório para novos projetos.', 0, false, 6),
    (2, 2, 'M.E.S. Envasadora 3.0', 0, false, 7),
    (2, 2, 'M.E.S. Formulacion', 0, false, 8),
    (2, 2, 'Balancete Comparativo CN', 0, false, 9),
    (2, 2, 'Stock 3D IBS', 0, false, 10),
    (2, 2, 'Distribucion de gastos - IBS', 0, false, 11),
    (2, 2, 'Analises de Gastos - IBS', 0, false, 12),
    (2, 2, 'Gestión de Flora 2.0', 0, false, 13),
    (2, 2, 'Analises de Normalidades', 0, false, 14),
    (2, 2, 'Analises de Hojas', 0, false, 15),
    (2, 2, 'Inteligencia de Territorio 2.0', 0, false, 16),
    (2, 2, 'Fluxo de Caixa TMRR', 0, false, 17),
    (2, 2, 'Monitores de Produccion Agricola - Agrofert', 0, false, 18),
    (2, 2, 'Granos - Bonificacion por Fijacion', 0, false, 19),
    (2, 2, 'Distribucion de Costos de Fabrica de Almidon', 0, false, 20),
    (2, 2, 'Stock 3D - Minga', 0, false, 21),
    (2, 2, 'Rastreo en vivo de camiones', 0, false, 22),
    (2, 2, 'Entrada e Saindo de Vehiculos Silos', 0, false, 23),
    (2, 2, 'Registro de Mantenimiento Preventivo', 0, false, 24),
    (2, 2, 'Ganaderia 2.0 CN', 0, false, 25),
    (2, 2, 'Assessement Comercial TMPY', 0, false, 26),
    (2, 2, 'Inteligencia de Mercado 2.0 (IA)', 0, false, 27),
    (2, 2, 'Vaga para Analista de Dados Sr', 0, false, 28);

-- Meses para tarefas 10–38 (Dados)
INSERT INTO task_months (task_id, month_num) VALUES
    (10, 0), (10, 1),
    (11, 1), (11, 2), (11, 3),
    (12, 1), (12, 2),
    (13, 2), (13, 3), (13, 4), (13, 5),
    (14, 3), (14, 4), (14, 5),
    (15, 4), (15, 5), (15, 6), (15, 7), (15, 8), (15, 9), (15, 10), (15, 11),
    (16, 3), (16, 4), (16, 5), (16, 6), (16, 7), (16, 8), (16, 9), (16, 10), (16, 11),
    (17, 1), (17, 2),
    (18, 2), (18, 3), (18, 4),
    (19, 1), (19, 2), (19, 3),
    (20, 1), (20, 2), (20, 3),
    (21, 2), (21, 3), (21, 4), (21, 5),
    (22, 4), (22, 5),
    (23, 3), (23, 4), (23, 5),
    (24, 1), (24, 2), (24, 3), (24, 4),
    (25, 1), (25, 2), (25, 3),
    (26, 0), (26, 1), (26, 2),
    (27, 2), (27, 3), (27, 4), (27, 5),
    (28, 3), (28, 4), (28, 5),
    (29, 4), (29, 5), (29, 6),
    (30, 5), (30, 6),
    (31, 5), (31, 6), (31, 7),
    (32, 6), (32, 7), (32, 8), (32, 9),
    (33, 7), (33, 8), (33, 9), (33, 10),
    (34, 7), (34, 8),
    (35, 1), (35, 2), (35, 3), (35, 4),
    (36, 0), (36, 1), (36, 2),
    (37, 2), (37, 3), (37, 4), (37, 5),
    (38, 2), (38, 3), (38, 4);

-- =============================================================================
-- Tarefas — Categoria: Lakehouse (lake) — Ano 2026
-- =============================================================================
INSERT INTO tasks (year_id, category_id, name, progress, is_milestone, sort_order) VALUES
    (2, 3, 'Migração de workspaces Fabric ', 0, false, 0),
    (2, 3, 'Mapear dados pessoais – base LGPD', 0, false, 1),
    (2, 3, 'Copydata das principais fontes para o Lakehouse (bronze/silver)', 0, false, 2),
    (2, 3, 'Migração de Dados legado do Digital Farm para a nova estrutura', 0, false, 3),
    (2, 3, 'Definição e implementação da primeira versão de monitoramento de pipelines (DataOps)', 0, false, 4),
    (2, 3, 'Lakehouse com fontes críticas em silver/gold (domínios maduros)', 0, false, 5),
    (2, 3, 'Pipeline de teste de YVY Clima (Massa de Dados)', 0, false, 6),
    (2, 3, 'Definição dos datasets self-service', 0, false, 7),
    (2, 3, 'Ampliação da plataforma self-service (mais datasets)', 0, false, 8),
    (2, 3, 'Lakehouse como fonte oficial para decisões estratégicas', 0, false, 9),
    (2, 3, '2-5 modelos de IA/ML em produção com monitoramento de performance', 0, false, 10),
    (2, 3, 'Estrutura de Governança de Dados formalizada (papéis, fórum, catálogo inicial)', 0, false, 11),
    (2, 3, 'Plano detalhado de LGPD (priorização das ações por risco/impacto)', 0, false, 12),
    (2, 3, 'Processos de DataOps e FinOps maduros (painéis de logs e custos)', 0, false, 13),
    (2, 3, 'Vaga Engenheiro de Dados', 0, false, 14),
    (2, 3, 'Vaga Cientista de Dados', 0, false, 15),
    (2, 3, 'Avaliação de riscos de dados (Data Risk)', 0, false, 16);

-- Meses para tarefas 39–55 (Lakehouse)
INSERT INTO task_months (task_id, month_num) VALUES
    (39, 0), (39, 1),
    (40, 0), (40, 1), (40, 2), (40, 3),
    (41, 0), (41, 1), (41, 2), (41, 3),
    (42, 1), (42, 2), (42, 3), (42, 4), (42, 5), (42, 6),
    (43, 2), (43, 3), (43, 4),
    (44, 4), (44, 5), (44, 6),
    (45, 2), (45, 3), (45, 4),
    (46, 4), (46, 5), (46, 6),
    (47, 6), (47, 7), (47, 8),
    (48, 8), (48, 9), (48, 10), (48, 11),
    (49, 2), (49, 3), (49, 6), (49, 7), (49, 10), (49, 11),
    (50, 0), (50, 1), (50, 2), (50, 3), (50, 4), (50, 5),
    (51, 0), (51, 1), (51, 4), (51, 5), (51, 6),
    (52, 9), (52, 10), (52, 11),
    (53, 1), (53, 2), (53, 3),
    (54, 2), (54, 3), (54, 4),
    (55, 0), (55, 1), (55, 2), (55, 3), (55, 4), (55, 5), (55, 6), (55, 7), (55, 8), (55, 9), (55, 10), (55, 11);

-- =============================================================================
-- Verificação
-- =============================================================================
SELECT 'Seed concluído!' AS status,
       (SELECT COUNT(*) FROM years) AS anos,
       (SELECT COUNT(*) FROM categories) AS categorias,
       (SELECT COUNT(*) FROM tasks) AS tarefas,
       (SELECT COUNT(*) FROM task_months) AS meses_ativos;
