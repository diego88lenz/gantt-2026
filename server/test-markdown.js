/**
 * Teste temporário do renderizador Markdown (markdown.js).
 */
const { renderMarkdown } = require('../markdown.js');
const { DOCUMENT_TYPES, buildDocument } = require('./document-templates');

const project = {
    name: 'Plataforma de Analytics | Fase 2',   // pipe no nome = teste de escape
    description: 'Unificar indicadores.',
    type: 'data', category: 'data',
    assignee: 'Diego Silva', requester: 'Maria Souza',
    status: 'in_progress', priority: 'high',
    start_date: '2026-01-15', end_date: '2026-07-30',
    budget: 12345.67, github_repo: 'https://github.com/h2o/analytics',
};

let failures = 0;
const fail = (m) => { console.log('  FALHA: ' + m); failures++; };

// --- Casos unitários do renderer ---
const cases = [
    ['# T', ['<h1>T</h1>']],
    ['## Sub', ['<h2>Sub</h2>']],
    ['**negrito**', ['<strong>negrito</strong>']],
    ['_itálico_', ['<em>itálico</em>']],
    ['- a\n- b', ['<ul>', '<li>a</li>', '<li>b</li>']],
    ['1. a\n2. b', ['<ol>', '<li>a</li>']],
    ['- [ ] pend\n- [x] feito', ['task-list', '☐', '☑']],
    ['---', ['<hr>']],
    ['``` sem cerca', []],
    ['texto com <script>alert(1)</script>', ['&lt;script&gt;']],
    ['| A | B |\n| --- | --- |\n| 1 | 2 |', ['<table>', '<th>A</th>', '<td>1</td>']],
];

console.log('=== Renderer: casos unitários ===');
for (const [input, expects] of cases) {
    const html = renderMarkdown(input);
    for (const e of expects) {
        if (!html.includes(e)) fail(`"${input.slice(0, 30)}" -> não contém ${e} (gerou: ${html.slice(0, 70)})`);
    }
}
console.log('  ' + cases.length + ' casos verificados');

// --- Renderização dos 7 documentos reais ---
console.log('\n=== Renderer: documentos gerados ===');
for (const t of DOCUMENT_TYPES) {
    const { content } = buildDocument(t.slug, project);
    const html = renderMarkdown(content);

    if (html.includes('<table>') === false) fail(t.slug + ': nenhuma tabela renderizada');
    if (!html.includes('<h1>')) fail(t.slug + ': sem h1');
    if (!html.includes('<h2>')) fail(t.slug + ': sem h2');
    // O pipe escapado deve virar | dentro da célula, não sobrar '\|'
    if (html.includes('\\|')) fail(t.slug + ': pipe escapado vazou para o HTML');
    if (!html.includes('Analytics | Fase 2')) fail(t.slug + ': nome com pipe não foi preservado');
    // Nada de markdown cru sobrando
    if (html.includes('| --- |')) fail(t.slug + ': separador de tabela vazou');
    if (/^#{1,6}\s/m.test(html)) fail(t.slug + ': heading markdown não convertido');

    const tables = (html.match(/<table>/g) || []).length;
    console.log(`  ${t.slug}: ${html.length} chars, ${tables} tabela(s)`);
}

console.log('\n=== ' + (failures === 0 ? 'TODOS OS TESTES PASSARAM' : failures + ' FALHA(S)') + ' ===');
process.exit(failures === 0 ? 0 : 1);
