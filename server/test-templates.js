/**
 * Teste temporário do motor de templates.
 * Valida os 7 tipos com um projeto completo e um projeto vazio.
 */
const { DOCUMENT_TYPES, buildDocument } = require('./document-templates');

const fullProject = {
    id: 999, name: 'Plataforma de Analytics', description: 'Unificar indicadores em uma plataforma única.',
    type: 'data', category: 'data', department: 'Comercial', company: 'H2O Innovation',
    assignee: 'Diego Silva', requester: 'Maria Souza', status: 'in_progress', priority: 'critical',
    start_date: '2026-01-15', end_date: '2026-07-30', budget: 250000.5,
    tags: 'analytics, KPI', url: 'https://exemplo.com', github_repo: 'https://github.com/h2o/analytics',
};

const emptyProject = { id: 998, name: 'Projeto Sem Dados' };

const REQUIRED_SECTIONS = {
    'brief': ['## 1. Objetivo', '## 3. Escopo', '## 9. Marcos', '## 11. Aprovações'],
    'especificacao': ['## 4. Requisitos funcionais', '## 5. Regras de negócio', '## 9. Critérios de aceite'],
    'planejamento-tecnico': ['## 2. Stack tecnológica', '## 11. Estimativas por fase'],
    'construcao': ['## 1. Fases de construção', '## 7. Plano de rollback', '## 9. Checklist de implantação'],
    'cronograma': ['## 2. Fases', '## 3. Marcos', '## 5. Caminho crítico'],
    'matriz-riscos': ['## 2. Riscos identificados', '## 4. Plano de resposta'],
    'plano-testes': ['## 6. Casos de teste', '## 9. Homologação'],
};

let failures = 0;
const fail = (msg) => { console.log('  FALHA: ' + msg); failures++; };

console.log('=== Tipos no catálogo: ' + DOCUMENT_TYPES.length + ' ===\n');

for (const t of DOCUMENT_TYPES) {
    console.log('--- ' + t.slug + ' ---');

    // 1) Projeto completo
    const full = buildDocument(t.slug, fullProject);
    if (!full.title || full.title.length < 5) fail('título ausente');
    if (full.title.includes('undefined') || full.title.includes('null')) fail('título com undefined/null');
    if (!full.content || full.content.length < 200) fail('conteúdo muito curto');
    if (/undefined|null/.test(full.content)) {
        const line = full.content.split('\n').find(l => /undefined|null/.test(l));
        fail('conteúdo contém undefined/null -> ' + line.trim().slice(0, 90));
    }
    for (const sec of (REQUIRED_SECTIONS[t.slug] || [])) {
        if (!full.content.includes(sec)) fail('seção ausente: ' + sec);
    }
    // dados do projeto devem aparecer
    if (!full.content.includes('Plataforma de Analytics')) fail('nome do projeto ausente');
    if (!full.content.includes('Diego Silva')) fail('responsável ausente');

    // 2) Projeto vazio (sem datas, descrição, etc.)
    const empty = buildDocument(t.slug, emptyProject);
    if (/undefined|null/.test(empty.content)) {
        const line = empty.content.split('\n').find(l => /undefined|null/.test(l));
        fail('projeto vazio gerou undefined/null -> ' + line.trim().slice(0, 90));
    }
    if (empty.content.includes('Invalid Date')) fail('projeto vazio gerou Invalid Date');
    if (!empty.content.includes('Projeto Sem Dados')) fail('nome ausente no projeto vazio');

    console.log('  title: ' + full.title);
    console.log('  chars: ' + full.content.length + ' | linhas: ' + full.content.split('\n').length);
    console.log('  vazio: ok (' + empty.content.length + ' chars)');
}

// 3) Tipo inválido deve lançar
try {
    buildDocument('nao-existe', fullProject);
    fail('tipo inválido não lançou erro');
} catch (e) {
    console.log('\n--- tipo inválido ---\n  ok: ' + e.message);
}

console.log('\n=== ' + (failures === 0 ? 'TODOS OS TESTES PASSARAM' : failures + ' FALHA(S)') + ' ===');
process.exit(failures === 0 ? 0 : 1);
