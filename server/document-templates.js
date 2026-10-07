/**
 * Gantt 2026 — Motor de Templates de Documentos
 *
 * Gera o conteúdo (Markdown) dos documentos de gestão de projeto a partir dos
 * dados já cadastrados em `projects`. Sem dependências externas e sem IA:
 * os templates são determinísticos e preenchidos com os dados disponíveis.
 *
 * O catálogo DOCUMENT_TYPES é a FONTE ÚNICA dos tipos válidos (mantido em
 * código, não em tabela, para não divergir dos builders abaixo).
 */

const PROJECT_FIELDS = [
    'name', 'description', 'type', 'department', 'company', 'assignee', 'requester',
    'status', 'priority', 'start_date', 'end_date', 'budget', 'tags', 'url',
    'github_repo', 'category',
];

// =============================================================================
// Rótulos
// =============================================================================
const STATUS_LABELS = {
    planning: 'Planejando',
    in_progress: 'Em andamento',
    completed: 'Concluído',
    on_hold: 'Pausado',
    cancelled: 'Cancelado',
};

const PRIORITY_LABELS = {
    critical: 'Crítica',
    high: 'Alta',
    medium: 'Média',
    low: 'Baixa',
};

const TYPE_LABELS = {
    data: 'Dados',
    ai: 'IA',
    geo: 'Geoprocessamento',
    analytics: 'Analytics',
};

const CATEGORY_LABELS = {
    geral: 'Geral',
    projects: 'Projetos',
    data: 'Dados',
    lake: 'Lakehouse',
    inteligencia_artificial: 'Inteligência Artificial',
    geoprocessamento: 'Geoprocessamento',
};

const ADEFINIR = '_A definir_';

// =============================================================================
// Helpers puros
// =============================================================================
function statusLabel(v) { return STATUS_LABELS[v] || v || ADEFINIR; }
function priorityLabel(v) { return PRIORITY_LABELS[v] || v || ADEFINIR; }
function typeLabel(v) { return TYPE_LABELS[v] || v || 'Dados'; }
function categoryLabel(v) { return CATEGORY_LABELS[v] || v || ADEFINIR; }

/** Data só aparece se existir — evita "Invalid Date" em projeto sem datas. */
function formatDate(value) {
    if (!value) return ADEFINIR;
    const d = new Date(value);
    if (isNaN(d.getTime())) return ADEFINIR;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

function or(value, fallback = ADEFINIR) {
    if (value === null || value === undefined) return fallback;
    const s = String(value).trim();
    return s.length > 0 ? s : fallback;
}

/**
 * Seguro para células de tabela Markdown: escapa `|` (que quebraria a linha)
 * e aplica o fallback padrão quando vazio.
 */
function cell(value, fallback = ADEFINIR) {
    return or(value, fallback).replace(/\|/g, '\\|');
}

function formatBudget(value) {
    if (value === null || value === undefined || value === '') return ADEFINIR;
    const n = Number(value);
    if (isNaN(n)) return ADEFINIR;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Duração em dias corridos entre início e fim (null se faltar data). */
function projectDuration(project) {
    if (!project.start_date || !project.end_date) return null;
    const a = new Date(project.start_date);
    const b = new Date(project.end_date);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
    const days = Math.round((b - a) / 86400000);
    return days >= 0 ? days : null;
}

function durationLabel(project) {
    const days = projectDuration(project);
    if (days === null) return ADEFINIR;
    if (days === 0) return 'Mesmo dia';
    const months = Math.round((days / 30) * 10) / 10;
    return `${days} dia(s) (~${months} mês(es))`;
}

/**
 * Distribui as fases proporcionalmente entre as datas do projeto.
 * Sem datas, devolve as fases com "_A definir_".
 */
function phasePlan(project, phases) {
    const hasDates = project.start_date && project.end_date;
    let start = null;
    let total = null;

    if (hasDates) {
        const a = new Date(project.start_date);
        const b = new Date(project.end_date);
        if (!isNaN(a.getTime()) && !isNaN(b.getTime())) {
            start = a;
            total = Math.max(0, b - a);
        }
    }

    const weights = phases.map(p => p.weight || 1);
    const sum = weights.reduce((acc, w) => acc + w, 0) || 1;
    let cursor = 0;

    return phases.map((p, i) => {
        const share = (weights[i] / sum) * total;
        const from = hasDates && start ? new Date(start.getTime() + cursor) : null;
        const to = hasDates && start ? new Date(start.getTime() + cursor + share) : null;
        if (hasDates) cursor += share;
        return {
            name: p.name,
            objective: p.objective,
            start: from ? formatDate(from.toISOString()) : ADEFINIR,
            end: to ? formatDate(to.toISOString()) : ADEFINIR,
        };
    });
}

/** Normaliza o projeto para o template, garantindo campos presentes. */
function normalize(project = {}) {
    const p = { ...project };
    for (const f of PROJECT_FIELDS) {
        if (p[f] === null || p[f] === undefined) p[f] = '';
    }
    return p;
}

// Bloco de identificação repetido no topo de todo documento
function identification(project, typeName) {
    const p = normalize(project);
    return [
        `| Campo | Informação |`,
        `| --- | --- |`,
        `| **Projeto** | ${cell(p.name)} |`,
        `| **Documento** | ${cell(typeName)} |`,
        `| **Categoria** | ${cell(categoryLabel(p.category))} |`,
        `| **Tipo** | ${cell(typeLabel(p.type))} |`,
        `| **Empresa** | ${cell(p.company)} |`,
        `| **Departamento** | ${cell(p.department)} |`,
        `| **Responsável** | ${cell(p.assignee)} |`,
        `| **Solicitante** | ${cell(p.requester)} |`,
        `| **Status** | ${cell(statusLabel(p.status))} |`,
        `| **Prioridade** | ${cell(priorityLabel(p.priority))} |`,
        `| **Início** | ${formatDate(p.start_date)} |`,
        `| **Término** | ${formatDate(p.end_date)} |`,
        `| **Duração** | ${durationLabel(p)} |`,
        `| **Orçamento** | ${formatBudget(p.budget)} |`,
        `| **Repositório** | ${cell(p.github_repo)} |`,
    ].join('\n');
}

// =============================================================================
// Builders por tipo
// =============================================================================
const BUILDERS = {

    // -------------------------------------------------------------------------
    'brief': (project) => {
        const p = normalize(project);
        return {
            title: `Brief do Projeto — ${or(p.name, 'Sem nome')}`,
            content: `# Brief do Projeto — ${or(p.name, 'Sem nome')}

${identification(p, 'Brief / Termo de Abertura')}

---

## 1. Objetivo

${or(p.description, `${ADEFINIR} — descreva em uma frase o resultado esperado deste projeto.`)}

## 2. Contexto e justificativa

- **Área demandante:** ${or(p.department)}
- **Solicitante:** ${or(p.requester)}
- **Categoria:** ${categoryLabel(p.category)}
- **Motivação:** ${ADEFINIR}

## 3. Escopo

**Inclui:**
- ${ADEFINIR}

**Não inclui:**
- ${ADEFINIR}

## 4. Partes interessadas

| Nome | Papel | Responsabilidade |
| --- | --- | --- |
| ${cell(p.requester)} | Solicitante | Validar escopo e prioridades |
| ${cell(p.assignee)} | Responsável | Conduzir a execução |
| ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} |

## 5. Entregáveis

| # | Entregável | Formato | Responsável |
| --- | --- | --- | --- |
| 1 | Especificação funcional | Documento | ${cell(p.assignee)} |
| 2 | Planejamento técnico | Documento | ${cell(p.assignee)} |
| 3 | Solução implantada | Sistema | ${cell(p.assignee)} |
| 4 | ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} |

## 6. Premissas

- ${ADEFINIR}

## 7. Restrições

- **Prazo:** ${formatDate(p.start_date)} a ${formatDate(p.end_date)} (${durationLabel(p)})
- **Orçamento:** ${formatBudget(p.budget)}
- ${ADEFINIR}

## 8. Critérios de sucesso

- ${ADEFINIR}

## 9. Marcos

| Marco | Data prevista |
| --- | --- |
| Aprovação do brief | ${formatDate(p.start_date)} |
| Entrega final | ${formatDate(p.end_date)} |

## 10. Riscos iniciais

| Risco | Probabilidade | Impacto | Resposta |
| --- | --- | --- | --- |
| ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} |

## 11. Aprovações

| Nome | Papel | Data |
| --- | --- | --- |
| ${cell(p.requester)} | Solicitante | ${ADEFINIR} |
| ${cell(p.assignee)} | Responsável | ${ADEFINIR} |
`,
        };
    },

    // -------------------------------------------------------------------------
    'especificacao': (project) => {
        const p = normalize(project);
        return {
            title: `Especificação Funcional — ${or(p.name, 'Sem nome')}`,
            content: `# Especificação Funcional — ${or(p.name, 'Sem nome')}

${identification(p, 'Especificação Funcional')}

---

## 1. Visão geral

${or(p.description, `${ADEFINIR} — descreva a solução proposta.`)}

## 2. Objetivos de negócio

- ${ADEFINIR}

## 3. Personas e perfis de acesso

| Persona | Descrição | Permissões |
| --- | --- | --- |
| ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} |

## 4. Requisitos funcionais

| ID | Requisito | Prioridade | Critério de aceite |
| --- | --- | --- | --- |
| RF-01 | ${ADEFINIR} | ${priorityLabel(p.priority)} | ${ADEFINIR} |
| RF-02 | ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} |
| RF-03 | ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} |

## 5. Regras de negócio

| ID | Regra | Exceções |
| --- | --- | --- |
| RN-01 | ${ADEFINIR} | ${ADEFINIR} |

## 6. Fluxos principais

### 6.1 Fluxo principal

1. ${ADEFINIR}
2. ${ADEFINIR}
3. ${ADEFINIR}

### 6.2 Fluxos alternativos

- ${ADEFINIR}

## 7. Requisitos não funcionais

| Categoria | Requisito |
| --- | --- |
| Desempenho | ${ADEFINIR} |
| Segurança | ${ADEFINIR} |
| Disponibilidade | ${ADEFINIR} |
| Usabilidade | ${ADEFINIR} |
| Auditoria | ${ADEFINIR} |

## 8. Integrações

| Sistema | Direção | Protocolo | Observações |
| --- | --- | --- | --- |
| ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} |

## 9. Critérios de aceite

- [ ] ${ADEFINIR}

## 10. Fora de escopo

- ${ADEFINIR}

## 11. Glossário

| Termo | Definição |
| --- | --- |
| ${ADEFINIR} | ${ADEFINIR} |
`,
        };
    },

    // -------------------------------------------------------------------------
    'planejamento-tecnico': (project) => {
        const p = normalize(project);
        const phases = phasePlan(p, [
            { name: 'Arquitetura e modelagem', objective: 'Definir arquitetura e modelo de dados', weight: 2 },
            { name: 'Desenvolvimento', objective: 'Implementar os componentes da solução', weight: 5 },
            { name: 'Testes e homologação', objective: 'Validar requisitos e corrigir desvios', weight: 2 },
            { name: 'Implantação', objective: 'Publicar em produção e monitorar', weight: 1 },
        ]);
        return {
            title: `Planejamento Técnico — ${or(p.name, 'Sem nome')}`,
            content: `# Planejamento Técnico — ${or(p.name, 'Sem nome')}

${identification(p, 'Planejamento Técnico')}

---

## 1. Arquitetura da solução

${ADEFINIR} — descreva a visão geral (diagrama, camadas, componentes principais).

Repositório: ${or(p.github_repo)}

## 2. Stack tecnológica

| Camada | Tecnologia | Justificativa |
| --- | --- | --- |
| Front-end | ${ADEFINIR} | ${ADEFINIR} |
| Back-end | ${ADEFINIR} | ${ADEFINIR} |
| Banco de dados | ${ADEFINIR} | ${ADEFINIR} |
| Infraestrutura | ${ADEFINIR} | ${ADEFINIR} |

## 3. Componentes

| Componente | Responsabilidade | Tecnologia |
| --- | --- | --- |
| ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} |

## 4. Modelo de dados

| Entidade | Descrição | Principais campos |
| --- | --- | --- |
| ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} |

## 5. Interfaces e APIs

| Endpoint | Método | Descrição | Autenticação |
| --- | --- | --- | --- |
| ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} |

## 6. Ambientes e infraestrutura

| Ambiente | Finalidade | Observações |
| --- | --- | --- |
| Desenvolvimento | ${ADEFINIR} | ${ADEFINIR} |
| Homologação | ${ADEFINIR} | ${ADEFINIR} |
| Produção | ${ADEFINIR} | ${ADEFINIR} |

## 7. Segurança

- Autenticação e autorização: ${ADEFINIR}
- Tratamento de dados sensíveis / LGPD: ${ADEFINIR}
- Gestão de segredos: ${ADEFINIR}

## 8. Observabilidade

- Logs: ${ADEFINIR}
- Métricas: ${ADEFINIR}
- Alertas: ${ADEFINIR}

## 9. Dependências

| Dependência | Tipo | Responsável | Prazo |
| --- | --- | --- | --- |
| ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} |

## 10. Estratégia de testes

| Nível | Escopo | Ferramenta |
| --- | --- | --- |
| Unitário | ${ADEFINIR} | ${ADEFINIR} |
| Integração | ${ADEFINIR} | ${ADEFINIR} |
| Aceitação | ${ADEFINIR} | ${ADEFINIR} |

## 11. Estimativas por fase

| Fase | Objetivo | Início | Término |
| --- | --- | --- | --- |
${phases.map(f => `| ${f.name} | ${f.objective} | ${f.start} | ${f.end} |`).join('\n')}

**Duração total estimada:** ${durationLabel(p)}

## 12. Riscos técnicos

| Risco | Probabilidade | Impacto | Mitigação |
| --- | --- | --- | --- |
| ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} |
`,
        };
    },

    // -------------------------------------------------------------------------
    'construcao': (project) => {
        const p = normalize(project);
        const phases = phasePlan(p, [
            { name: 'Setup e preparação', objective: 'Preparar repositório, ambientes e pipelines', weight: 1 },
            { name: 'Desenvolvimento', objective: 'Implementar as funcionalidades planejadas', weight: 5 },
            { name: 'Testes', objective: 'Executar testes e corrigir defeitos', weight: 2 },
            { name: 'Implantação', objective: 'Publicar, monitorar e encerrar', weight: 1 },
        ]);
        return {
            title: `Plano de Construção — ${or(p.name, 'Sem nome')}`,
            content: `# Plano de Construção — ${or(p.name, 'Sem nome')}

${identification(p, 'Construção / Implantação')}

---

## 1. Fases de construção

| Fase | Objetivo | Início | Término |
| --- | --- | --- | --- |
${phases.map(f => `| ${f.name} | ${f.objective} | ${f.start} | ${f.end} |`).join('\n')}

## 2. Atividades

| ID | Atividade | Responsável | Início | Término | Status |
| --- | --- | --- | --- | --- | --- |
| A-01 | ${ADEFINIR} | ${cell(p.assignee)} | ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} |
| A-02 | ${ADEFINIR} | ${cell(p.assignee)} | ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} |

## 3. Ambientes

| Ambiente | Uso | Endereço |
| --- | --- | --- |
| Desenvolvimento | ${ADEFINIR} | ${ADEFINIR} |
| Homologação | ${ADEFINIR} | ${ADEFINIR} |
| Produção | ${ADEFINIR} | ${ADEFINIR} |

## 4. CI/CD e versionamento

- Repositório: ${or(p.github_repo)}
- Estratégia de branches: ${ADEFINIR}
- Pipeline de build: ${ADEFINIR}
- Pipeline de deploy: ${ADEFINIR}

## 5. Definição de pronto (DoD)

- [ ] Código revisado (code review)
- [ ] Testes automatizados passando
- [ ] Documentação atualizada
- [ ] ${ADEFINIR}

## 6. Plano de implantação

| Etapa | Responsável | Janela | Validação |
| --- | --- | --- | --- |
| Deploy | ${cell(p.assignee)} | ${formatDate(p.end_date)} | ${ADEFINIR} |
| Smoke test | ${cell(p.assignee)} | ${formatDate(p.end_date)} | ${ADEFINIR} |

## 7. Plano de rollback

- Gatilho de rollback: ${ADEFINIR}
- Procedimento: ${ADEFINIR}
- Responsável: ${or(p.assignee)}

## 8. Riscos operacionais

| Risco | Probabilidade | Impacto | Mitigação |
| --- | --- | --- | --- |
| ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} |

## 9. Checklist de implantação

- [ ] Backup realizado
- [ ] Janela comunicada
- [ ] Deploy executado
- [ ] Monitoramento ativo
- [ ] ${ADEFINIR}
`,
        };
    },

    // -------------------------------------------------------------------------
    'cronograma': (project) => {
        const p = normalize(project);
        const phases = phasePlan(p, [
            { name: 'Iniciação', objective: 'Aprovar brief e alinhar escopo', weight: 1 },
            { name: 'Planejamento', objective: 'Detalhar requisitos e arquitetura', weight: 1 },
            { name: 'Execução', objective: 'Construir e testar a solução', weight: 5 },
            { name: 'Homologação', objective: 'Validar com as áreas envolvidas', weight: 2 },
            { name: 'Encerramento', objective: 'Implantar e formalizar a entrega', weight: 1 },
        ]);
        return {
            title: `Cronograma — ${or(p.name, 'Sem nome')}`,
            content: `# Cronograma — ${or(p.name, 'Sem nome')}

${identification(p, 'Cronograma')}

---

## 1. Resumo

- **Início:** ${formatDate(p.start_date)}
- **Término:** ${formatDate(p.end_date)}
- **Duração:** ${durationLabel(p)}
- **Responsável:** ${or(p.assignee)}

## 2. Fases

| Fase | Objetivo | Início | Término |
| --- | --- | --- | --- |
${phases.map(f => `| ${f.name} | ${f.objective} | ${f.start} | ${f.end} |`).join('\n')}

## 3. Marcos

| Marco | Data | Critério de conclusão |
| --- | --- | --- |
| Kickoff | ${formatDate(p.start_date)} | Escopo alinhado |
| Entrega final | ${formatDate(p.end_date)} | Aceite formal do solicitante |

## 4. Dependências

| Dependência | Tipo | Responsável | Prazo |
| --- | --- | --- | --- |
| ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} |

## 5. Caminho crítico

${ADEFINIR} — liste as atividades cuja soma define a menor duração possível do projeto.

## 6. Observações

- Prioridade do projeto: **${priorityLabel(p.priority)}**
- Status atual: **${statusLabel(p.status)}**
- ${ADEFINIR}
`,
        };
    },

    // -------------------------------------------------------------------------
    'matriz-riscos': (project) => {
        const p = normalize(project);
        const high = p.priority === 'critical' || p.priority === 'high';
        return {
            title: `Matriz de Riscos — ${or(p.name, 'Sem nome')}`,
            content: `# Matriz de Riscos — ${or(p.name, 'Sem nome')}

${identification(p, 'Matriz de Riscos')}

---

## 1. Escala de avaliação

**Probabilidade:** 1 (Muito baixa) · 2 (Baixa) · 3 (Média) · 4 (Alta) · 5 (Muito alta)

**Impacto:** 1 (Insignificante) · 2 (Menor) · 3 (Moderado) · 4 (Maior) · 5 (Crítico)

**Severidade** = Probabilidade × Impacto — Baixa (1–6) · Média (8–12) · Alta (15–25)

## 2. Riscos identificados

| ID | Risco | Categoria | Prob. | Imp. | Severidade | Resposta | Responsável |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R-01 | Atraso na entrega | Prazo | ${p.priority === 'critical' ? '4' : '3'} | ${high ? '5' : '3'} | ${high ? 'Alta' : 'Média'} | Revisar cronograma semanalmente | ${cell(p.assignee)} |
| R-02 | Indisponibilidade do responsável | Pessoas | 2 | 4 | Média | Documentar o conhecimento da solução | ${cell(p.assignee)} |
| R-03 | Mudança de escopo | Escopo | 3 | 3 | Média | Aprovação formal de mudanças | ${cell(p.requester)} |
| R-04 | ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} |

## 3. Riscos por categoria

| Categoria | Quantidade | Severidade máxima |
| --- | --- | --- |
| Prazo | 1 | ${high ? 'Alta' : 'Média'} |
| Pessoas | 1 | Média |
| Escopo | 1 | Média |

## 4. Plano de resposta

| Severidade | Estratégia |
| --- | --- |
| Alta | Mitigar imediatamente com plano dedicado e acompanhamento semanal |
| Média | Monitorar e definir plano de contingência |
| Baixa | Aceitar e revisar periodicamente |

## 5. Monitoramento

- **Frequência de revisão:** ${ADEFINIR}
- **Responsável pelo acompanhamento:** ${or(p.assignee)}
`,
        };
    },

    // -------------------------------------------------------------------------
    'plano-testes': (project) => {
        const p = normalize(project);
        return {
            title: `Plano de Testes — ${or(p.name, 'Sem nome')}`,
            content: `# Plano de Testes — ${or(p.name, 'Sem nome')}

${identification(p, 'Plano de Testes / Homologação')}

---

## 1. Estratégia de testes

${ADEFINIR} — descreva a abordagem geral (níveis, automação, ambientes).

## 2. Escopo

**Será testado:**
- ${ADEFINIR}

**Não será testado:**
- ${ADEFINIR}

## 3. Tipos de teste

| Tipo | Objetivo | Responsável |
| --- | --- | --- |
| Funcional | Validar requisitos | ${cell(p.assignee)} |
| Integração | Validar comunicação entre sistemas | ${cell(p.assignee)} |
| Regressão | Garantir que nada quebrou | ${cell(p.assignee)} |
| Aceitação | Validar com o solicitante | ${cell(p.requester)} |

## 4. Ambientes

| Ambiente | Finalidade | Dados |
| --- | --- | --- |
| Desenvolvimento | ${ADEFINIR} | ${ADEFINIR} |
| Homologação | ${ADEFINIR} | ${ADEFINIR} |

## 5. Critérios de entrada

- Requisitos aprovados
- Build disponível em homologação
- ${ADEFINIR}

## 6. Casos de teste

| ID | Caso | Pré-condição | Passos | Resultado esperado | Status |
| --- | --- | --- | --- | --- | --- |
| CT-01 | ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} | Pendente |
| CT-02 | ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} | Pendente |

## 7. Critérios de saída

- Todos os casos de prioridade ${priorityLabel(p.priority)} executados
- Nenhum defeito crítico ou alto em aberto
- ${ADEFINIR}

## 8. Evidências

${ADEFINIR} — descreva onde prints, logs e relatórios serão armazenados.

## 9. Homologação

| Nome | Papel | Data | Aceite |
| --- | --- | --- | --- |
| ${cell(p.requester)} | Solicitante | ${formatDate(p.end_date)} | ${ADEFINIR} |
| ${cell(p.assignee)} | Responsável | ${formatDate(p.end_date)} | ${ADEFINIR} |

## 10. Defeitos

| ID | Descrição | Severidade | Status | Responsável |
| --- | --- | --- | --- | --- |
| ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} | ${ADEFINIR} |
`,
        };
    },
};

// =============================================================================
// Catálogo (ordem de exibição na UI)
// =============================================================================
const DOCUMENT_TYPES = [
    { slug: 'brief', name: 'Brief / Termo de Abertura', description: 'Objetivo, escopo, stakeholders e aprovações', icon: 'file-text', sort_order: 1 },
    { slug: 'especificacao', name: 'Especificação Funcional', description: 'Requisitos, regras de negócio e critérios de aceite', icon: 'clipboard-list', sort_order: 2 },
    { slug: 'planejamento-tecnico', name: 'Planejamento Técnico', description: 'Arquitetura, stack, integrações e estimativas', icon: 'cpu', sort_order: 3 },
    { slug: 'construcao', name: 'Construção / Implantação', description: 'Fases, atividades, CI/CD e plano de deploy', icon: 'hammer', sort_order: 4 },
    { slug: 'cronograma', name: 'Cronograma', description: 'Fases, marcos, dependências e caminho crítico', icon: 'calendar-range', sort_order: 5 },
    { slug: 'matriz-riscos', name: 'Matriz de Riscos', description: 'Riscos, severidade e plano de resposta', icon: 'shield-alert', sort_order: 6 },
    { slug: 'plano-testes', name: 'Plano de Testes', description: 'Estratégia, casos de teste e homologação', icon: 'flask-conical', sort_order: 7 },
];

const DOCUMENT_TYPE_MAP = DOCUMENT_TYPES.reduce((acc, t) => {
    acc[t.slug] = t;
    return acc;
}, {});

function getDocumentType(slug) {
    return DOCUMENT_TYPE_MAP[slug] || null;
}

/**
 * Gera o documento de um tipo a partir do projeto.
 * @returns {{ title: string, content: string }}
 * @throws {Error} se o tipo for inválido
 */
function buildDocument(typeSlug, project) {
    const builder = BUILDERS[typeSlug];
    if (!builder) {
        throw new Error(`Tipo de documento inválido: ${typeSlug}`);
    }
    const result = builder(project || {});
    return { title: result.title, content: result.content };
}

module.exports = {
    DOCUMENT_TYPES,
    getDocumentType,
    buildDocument,
    // helpers exportados para testes
    formatDate,
    formatBudget,
    durationLabel,
    phasePlan,
    statusLabel,
    priorityLabel,
    typeLabel,
    categoryLabel,
    cell,
};
