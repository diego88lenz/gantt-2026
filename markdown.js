/**
 * Gantt 2026 — Renderizador Markdown (compartilhado)
 *
 * Implementa o SUBCONJUNTO de Markdown usado pelos templates de documentos,
 * para que ele seja renderizado de forma idêntica no navegador (preview) e no
 * servidor (exportação .doc). Assim não há duas implementações divergindo.
 *
 * Suporta: títulos #/##/###, negrito, itálico, código inline, listas com e sem
 * ordem, listas de tarefas (- [ ] / - [x]), tabelas, linha horizontal e
 * parágrafos. Todo o texto é escapado antes de virar HTML.
 *
 * Módulo UMD: `require()` no Node, `window.GanttMarkdown` no navegador.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.GanttMarkdown = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {

    function escapeHtml(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Divide uma linha de tabela em células, respeitando `\|` (pipe escapado).
     * Necessário porque nomes de projeto podem conter `|`.
     */
    function splitRow(row) {
        const s = String(row).trim().replace(/^\|/, '').replace(/\|$/, '');
        const cells = [];
        let cur = '';
        for (let i = 0; i < s.length; i++) {
            if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; }
            else if (s[i] === '|') { cells.push(cur); cur = ''; }
            else cur += s[i];
        }
        cells.push(cur);
        return cells.map(c => c.trim());
    }

    function inline(text) {
        return escapeHtml(text)
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[\s(])_([^_]+)_(?=[\s.,;:)]|$)/g, '$1<em>$2</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>');
    }

    const isHeading = (l) => /^#{1,6}\s+/.test(l);
    const isHr = (l) => /^-{3,}\s*$/.test(l);
    const isTableRow = (l) => /^\s*\|/.test(l);
    const isTableSep = (l) => /^\s*\|[\s:|-]+\|\s*$/.test(l);
    const isUnordered = (l) => /^\s*[-*]\s+/.test(l);
    const isOrdered = (l) => /^\s*\d+\.\s+/.test(l);
    const isTaskItem = (l) => /^\s*[-*]\s+\[[ xX]\]\s+/.test(l);

    function renderMarkdown(markdown) {
        const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
        const out = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];

            if (!line.trim()) { i++; continue; }

            if (isHr(line)) { out.push('<hr>'); i++; continue; }

            const h = line.match(/^(#{1,6})\s+(.*)$/);
            if (h) {
                const level = h[1].length;
                out.push(`<h${level}>${inline(h[2])}</h${level}>`);
                i++;
                continue;
            }

            // Tabela: linha de cabeçalho seguida de separador
            if (isTableRow(line) && lines[i + 1] && isTableSep(lines[i + 1])) {
                const header = splitRow(line);
                i += 2;
                const rows = [];
                while (i < lines.length && isTableRow(lines[i])) {
                    rows.push(splitRow(lines[i]));
                    i++;
                }
                const head = '<tr>' + header.map(c => `<th>${inline(c)}</th>`).join('') + '</tr>';
                const body = rows.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('');
                out.push(`<table><thead>${head}</thead><tbody>${body}</tbody></table>`);
                continue;
            }

            if (isTaskItem(line)) {
                const items = [];
                while (i < lines.length && isTaskItem(lines[i])) {
                    const m = lines[i].match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
                    const checked = m[1].toLowerCase() === 'x';
                    items.push(`<li class="task-item">${checked ? '☑' : '☐'} ${inline(m[2])}</li>`);
                    i++;
                }
                out.push(`<ul class="task-list">${items.join('')}</ul>`);
                continue;
            }

            if (isUnordered(line)) {
                const items = [];
                while (i < lines.length && isUnordered(lines[i]) && !isTaskItem(lines[i])) {
                    items.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>`);
                    i++;
                }
                out.push(`<ul>${items.join('')}</ul>`);
                continue;
            }

            if (isOrdered(line)) {
                const items = [];
                while (i < lines.length && isOrdered(lines[i])) {
                    items.push(`<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`);
                    i++;
                }
                out.push(`<ol>${items.join('')}</ol>`);
                continue;
            }

            // Parágrafo: acumula linhas comuns
            const para = [line];
            i++;
            while (
                i < lines.length && lines[i].trim() &&
                !isHeading(lines[i]) && !isHr(lines[i]) && !isTableRow(lines[i]) &&
                !isUnordered(lines[i]) && !isOrdered(lines[i])
            ) {
                para.push(lines[i]);
                i++;
            }
            out.push(`<p>${para.map(inline).join('<br>')}</p>`);
        }

        return out.join('\n');
    }

    return { renderMarkdown, escapeHtml };
});
