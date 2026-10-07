/**
 * Gantt 2026 — Documents Module
 *
 * Gera, edita, versiona e exporta os documentos de gestão de cada projeto
 * (brief, especificação, planejamento técnico, construção, cronograma, etc.).
 *
 * Convive com o ProjectsModule: este é chamado quando o modal do projeto abre
 * (setProject) e cuida apenas da aba "Documentos".
 */
const DocumentsModule = (() => {
    const API = '/api';

    let project = null;      // projeto atualmente aberto no modal
    let documents = [];      // documentos do projeto (metadados)
    let active = null;       // documento carregado por completo
    let versions = [];       // histórico do documento ativo
    let dirty = false;       // há edição não salva no editor
    let previewTimer = null;

    // =========================================================================
    // Utilidades
    // =========================================================================
    function el(id) { return document.getElementById(id); }

    function esc(value) {
        return (typeof GanttMarkdown !== 'undefined')
            ? GanttMarkdown.escapeHtml(value)
            : String(value === null || value === undefined ? '' : value);
    }

    function notify(msg, type) {
        if (typeof toast === 'function') toast(msg, type);
    }

    function author() {
        const input = el('docAuthorInput');
        const v = input ? input.value.trim() : '';
        return v || null;
    }

    async function api(path, options) {
        const res = await fetch(API + path, options);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(body.error || `HTTP ${res.status}`);
            err.status = res.status;
            err.body = body;
            throw err;
        }
        return body;
    }

    function jsonBody(method, data) {
        return {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        };
    }

    function formatDate(value) {
        if (!value) return '';
        const d = new Date(value);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    const STATUS_LABELS = { draft: 'Rascunho', final: 'Final' };

    // =========================================================================
    // Estado da UI
    // =========================================================================
    function showBlocked(show, message) {
        const blocked = el('docBlocked');
        const content = el('docContent');
        if (blocked) {
            blocked.hidden = !show;
            if (show && message) blocked.textContent = message;
        }
        if (content) content.hidden = show;
    }

    function setBusy(isBusy) {
        ['docGenerateBtn', 'docSaveBtn', 'docRegenerateBtn', 'docDeleteBtn'].forEach(id => {
            const b = el(id);
            if (b) b.disabled = isBusy;
        });
    }

    function setDirty(value) {
        dirty = value;
        const badge = el('docDirtyBadge');
        if (badge) badge.hidden = !value;
        const save = el('docSaveBtn');
        if (save) save.classList.toggle('btn-primary', true);
    }

    // =========================================================================
    // Carregamento
    // =========================================================================
    async function loadTypes() {
        const select = el('docTypeSelect');
        if (!select) return;
        try {
            const types = await api('/document-types');
            select.innerHTML = types
                .map(t => `<option value="${esc(t.slug)}">${esc(t.name)}</option>`)
                .join('');
        } catch (err) {
            select.innerHTML = '<option value="">Erro ao carregar tipos</option>';
            console.error('Erro ao carregar tipos de documento:', err);
        }
    }

    async function loadDocuments() {
        if (!project || !project.id) return;

        try {
            documents = await api(`/projects/${project.id}/documents`);
        } catch (err) {
            console.error('Erro ao carregar documentos:', err);
            documents = [];
        }
        renderChips();

        // Mantém o documento ativo se ele ainda existir
        if (active && !documents.some(d => d.id === active.id)) {
            active = null;
        }
        if (!active) {
            resetWorkspace();
        }
    }

    function renderChips() {
        const list = el('docList');
        const empty = el('docEmpty');
        if (!list) return;

        if (documents.length === 0) {
            list.innerHTML = '';
            if (empty) empty.hidden = false;
            return;
        }
        if (empty) empty.hidden = true;

        list.innerHTML = documents.map(d => {
            const isActive = active && active.id === d.id;
            const statusClass = d.status === 'final' ? 'final' : 'draft';
            return `<button type="button" class="doc-chip${isActive ? ' active' : ''}" onclick="DocumentsModule.open(${d.id})">
                <span class="doc-chip-name">${esc(d.title)}</span>
                <span class="doc-chip-meta">
                    <span class="doc-chip-ver">v${d.current_version}</span>
                    <span class="doc-chip-status ${statusClass}">${STATUS_LABELS[d.status] || d.status}</span>
                </span>
            </button>`;
        }).join('');
    }

    function resetWorkspace() {
        const ws = el('docWorkspace');
        if (ws) ws.hidden = true;
        versions = [];
        renderVersions();
        setDirty(false);
    }

    // =========================================================================
    // Ações
    // =========================================================================
    async function generate() {
        if (!project || !project.id) return;
        const slug = el('docTypeSelect')?.value;
        if (!slug) { notify('Selecione um tipo de documento', 'error'); return; }

        setBusy(true);
        try {
            const doc = await api(`/projects/${project.id}/documents`,
                jsonBody('POST', { type_slug: slug, author: author() }));
            notify('Documento gerado!', 'success');
            await loadDocuments();
            await open(doc.id);
        } catch (err) {
            if (err.status === 409 && err.body && err.body.document_id) {
                notify('Já existe um documento deste tipo — abrindo o existente', 'info');
                await open(err.body.document_id);
            } else {
                notify('Erro ao gerar: ' + err.message, 'error');
            }
        } finally {
            setBusy(false);
        }
    }

    async function open(id) {
        if (dirty && !confirm('Há alterações não salvas. Descartar e abrir outro documento?')) return;

        try {
            const doc = await api(`/documents/${id}`);
            active = doc;

            const ws = el('docWorkspace');
            if (ws) ws.hidden = false;
            el('docTitleInput').value = doc.title || '';
            el('docEditor').value = doc.content || '';
            el('docStatusSelect').value = doc.status || 'draft';
            el('docVersionBadge').textContent = 'v' + doc.current_version;
            el('docMetaInfo').textContent = `${formatDate(doc.updated_at)} · gerado por ${doc.generated_by}`;

            setDirty(false);
            renderPreview();
            renderChips();
            await loadVersions();
        } catch (err) {
            notify('Erro ao abrir documento: ' + err.message, 'error');
        }
    }

    async function save() {
        if (!active) return;
        const title = el('docTitleInput').value.trim();
        const content = el('docEditor').value;
        if (!title) { notify('O título é obrigatório', 'error'); return; }

        setBusy(true);
        try {
            const updated = await api(`/documents/${active.id}`,
                jsonBody('PUT', { title, content, status: el('docStatusSelect').value, author: author() }));
            active = updated;
            el('docVersionBadge').textContent = 'v' + updated.current_version;
            el('docMetaInfo').textContent = `${formatDate(updated.updated_at)} · salvo manualmente`;
            setDirty(false);
            notify(`Salvo como versão v${updated.current_version}`, 'success');
            await loadDocuments();
            await open(updated.id);
        } catch (err) {
            if (err.status === 400 && /Nenhuma altera/i.test(err.message)) {
                setDirty(false);
                notify('Nenhuma alteração para salvar', 'info');
            } else {
                notify('Erro ao salvar: ' + err.message, 'error');
            }
        } finally {
            setBusy(false);
        }
    }

    async function regenerate() {
        if (!active) return;
        if (!confirm('Regerar a partir do template? O conteúdo atual será substituído por uma nova versão (o histórico é preservado).')) return;

        setBusy(true);
        try {
            const doc = await api(`/documents/${active.id}/regenerate`, jsonBody('POST', { author: author() }));
            notify(`Regenerado como v${doc.current_version}`, 'success');
            await loadDocuments();
            await open(doc.id);
        } catch (err) {
            notify('Erro ao regerar: ' + err.message, 'error');
        } finally {
            setBusy(false);
        }
    }

    async function remove() {
        if (!active) return;
        if (!confirm(`Excluir o documento "${active.title}" e todo o seu histórico?`)) return;

        const id = active.id;
        setBusy(true);
        try {
            await api(`/documents/${id}`, { method: 'DELETE' });
            active = null;
            resetWorkspace();
            notify('Documento excluído', 'success');
            await loadDocuments();
        } catch (err) {
            notify('Erro ao excluir: ' + err.message, 'error');
        } finally {
            setBusy(false);
        }
    }

    function exportAs(format) {
        if (!active) return;
        const url = `${API}/documents/${active.id}/export?format=${format}`;
        const link = document.createElement('a');
        link.href = url;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        notify(format === 'doc' ? 'Baixando documento do Word...' : 'Baixando Markdown...', 'info');
    }

    function print() {
        if (!active) return;
        renderPreview();
        // A impressão é controlada pelo @media print no styles.css
        window.print();
    }

    // =========================================================================
    // Versões
    // =========================================================================
    async function loadVersions() {
        if (!active) return;
        try {
            versions = await api(`/documents/${active.id}/versions`);
        } catch {
            versions = [];
        }
        renderVersions();
    }

    function renderVersions() {
        const panel = el('docHistory');
        if (!panel) return;

        if (!active || versions.length === 0) {
            panel.innerHTML = '<p class="doc-history-empty">Sem histórico.</p>';
            return;
        }

        panel.innerHTML = versions.map(v => {
            const isCurrent = active && v.version === active.current_version;
            return `<div class="doc-version-row${isCurrent ? ' current' : ''}">
                <span class="doc-version-num">v${v.version}</span>
                <span class="doc-version-info">
                    <strong>${esc(v.title)}</strong>
                    <small>${formatDate(v.created_at)}${v.author ? ' · ' + esc(v.author) : ''} · ${v.content_length} caracteres</small>
                </span>
                ${isCurrent
                    ? '<span class="doc-version-current">atual</span>'
                    : `<button type="button" class="btn btn-ghost doc-version-restore" onclick="DocumentsModule.restore(${v.version})">Restaurar</button>`}
            </div>`;
        }).join('');
    }

    async function restore(version) {
        if (!active) return;
        if (!confirm(`Restaurar a versão v${version}? Ela será aplicada como uma NOVA versão.`)) return;

        setBusy(true);
        try {
            const doc = await api(`/documents/${active.id}/restore/${version}`, jsonBody('POST', { author: author() }));
            notify(`Restaurado de v${version} como v${doc.current_version}`, 'success');
            await loadDocuments();
            await open(doc.id);
        } catch (err) {
            notify('Erro ao restaurar: ' + err.message, 'error');
        } finally {
            setBusy(false);
        }
    }

    function toggleHistory() {
        const panel = el('docHistory');
        const btn = el('docHistoryBtn');
        if (!panel) return;
        const willShow = panel.hidden;
        panel.hidden = !willShow;
        if (btn) btn.setAttribute('aria-expanded', String(willShow));
    }

    // =========================================================================
    // Preview
    // =========================================================================
    function renderPreview() {
        const editor = el('docEditor');
        const body = el('docPaperBody');
        if (!editor || !body) return;

        const render = (typeof GanttMarkdown !== 'undefined')
            ? GanttMarkdown.renderMarkdown
            : (txt) => '<pre>' + esc(txt) + '</pre>';

        body.innerHTML = render(editor.value);

        const title = el('docTitleInput')?.value || '';
        const paperTitle = el('docPaperTitle');
        if (paperTitle) paperTitle.textContent = title;
        const paperProject = el('docPaperProject');
        if (paperProject) paperProject.textContent = project ? project.name : '';
        const paperDate = el('docPaperDate');
        if (paperDate) paperDate.textContent = new Date().toLocaleDateString('pt-BR');
        const foot = el('docPaperFootProject');
        if (foot) foot.textContent = project ? project.name : '';
    }

    function schedulePreview() {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(renderPreview, 200);
    }

    // =========================================================================
    // Ciclo de vida (chamado pelo ProjectsModule)
    // =========================================================================
    function setProject(p) {
        project = p;
        active = null;
        documents = [];
        versions = [];
        dirty = false;

        const label = el('docProjectName');
        if (label) label.textContent = p && p.name ? p.name : '—';

        resetWorkspace();
        renderChips();

        if (!p || !p.id) {
            showBlocked(true, 'Salve o projeto primeiro para poder gerar documentos.');
            return;
        }
        showBlocked(false);
        loadDocuments();
    }

    function reset() {
        project = null;
        active = null;
        documents = [];
        versions = [];
        dirty = false;
        resetWorkspace();
        renderChips();
    }

    // =========================================================================
    // Init
    // =========================================================================
    function init() {
        if (!el('projTabDocumentos')) return;

        loadTypes();

        el('docGenerateBtn')?.addEventListener('click', generate);
        el('docSaveBtn')?.addEventListener('click', save);
        el('docRegenerateBtn')?.addEventListener('click', regenerate);
        el('docDeleteBtn')?.addEventListener('click', remove);
        el('docExportMdBtn')?.addEventListener('click', () => exportAs('md'));
        el('docExportDocBtn')?.addEventListener('click', () => exportAs('doc'));
        el('docPrintBtn')?.addEventListener('click', print);
        el('docHistoryBtn')?.addEventListener('click', toggleHistory);

        el('docEditor')?.addEventListener('input', () => { setDirty(true); schedulePreview(); });
        el('docTitleInput')?.addEventListener('input', () => { setDirty(true); schedulePreview(); });
        el('docStatusSelect')?.addEventListener('change', () => setDirty(true));

        // Ctrl+S / Cmd+S salva o documento quando a aba está aberta
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                const panel = el('projTabDocumentos');
                if (panel && !panel.hidden && active) {
                    e.preventDefault();
                    save();
                }
            }
        });
    }

    return { init, setProject, reset, open, restore, generate, save, regenerate, remove, exportAs, print, toggleHistory };
})();

document.addEventListener('DOMContentLoaded', () => DocumentsModule.init());
