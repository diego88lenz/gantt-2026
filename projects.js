/**
 * Gantt 2026 — Projects Module
 * Gerencia o cadastro de projetos de Dados, IA e Geoprocessamento
 */
const ProjectsModule = (() => {
    let projects = [];
    let editingId = null;
    let filters = { category: '', status: '', priority: '', search: '' };
    let sortState = { key: null, asc: true };
    let pendingFiles = [];   // arquivos selecionados, ainda não enviados
    let currentFiles = [];   // arquivos já salvos no projeto em edição

    const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
    const MAX_FILES = 10;

    const TYPE_LABELS = { data: 'Dados', ai: 'IA', geo: 'Geo', analytics: 'Analytics' };
    const STATUS_LABELS = { planning: 'Planejando', in_progress: 'Em andamento', completed: 'Concluído', on_hold: 'Pausado', cancelled: 'Cancelado' };
    const PRIORITY_LABELS = { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa' };

    let roadmapCategories = [];

    // Filtros ativos → query string, compartilhada entre a tabela e o dashboard
    function buildFilterParams() {
        const params = new URLSearchParams();
        if (filters.category) params.set('category', filters.category);
        if (filters.status) params.set('status', filters.status);
        if (filters.priority) params.set('priority', filters.priority);
        if (filters.search) params.set('search', filters.search);
        return params;
    }

    function hasActiveFilters() {
        return !!(filters.category || filters.status || filters.priority || filters.search);
    }

    async function loadProjects() {
        const params = buildFilterParams();

        try {
            const [projResp, cats] = await Promise.all([
                fetch(`/api/projects?${params}`),
                fetch('/api/categories').then(r => r.json()).catch(() => [])
            ]);
            projects = await projResp.json();
            roadmapCategories = cats;
            updateCategoryUI();
            renderTable();
            await loadStats();
        } catch (err) {
            console.error('Erro ao carregar projetos:', err);
        }
    }

    async function loadStats() {
        const params = buildFilterParams();
        const active = hasActiveFilters();

        try {
            // Dashboard: reflete os filtros selecionados
            const filtered = await fetch(`/api/projects/stats?${params}`).then(r => r.json());

            // Hero: portfólio completo (sempre sem filtros).
            // Sem filtros ativos reaproveita a resposta, evitando chamada extra.
            const global = active
                ? await fetch('/api/projects/stats').then(r => r.json()).catch(() => filtered)
                : filtered;

            // Dashboard cards → refletem os filtros
            document.getElementById('pStatTotal').textContent = filtered.total || 0;
            document.getElementById('pStatProgress').textContent = filtered.in_progress || 0;
            document.getElementById('pStatCompleted').textContent = filtered.completed || 0;
            document.getElementById('pStatPlanning').textContent = filtered.planning || 0;
            document.getElementById('pStatOnHold').textContent = filtered.on_hold || 0;
            document.getElementById('pStatCritical').textContent = filtered.critical || 0;

            // Hero cards → portfólio completo
            document.getElementById('headerProjectCount').textContent = global.total || 0;
            document.getElementById('headerProjectCompleted').textContent = global.completed || 0;
            document.getElementById('headerProjectProgress').textContent = global.in_progress || 0;

            updateDashboardFilterState(active, filtered.total || 0);
        } catch { /* offline */ }
    }

    // Deixa explícito quando os indicadores estão refletindo um subconjunto filtrado
    function updateDashboardFilterState(active, count) {
        const badge = document.getElementById('projFilteredBadge');
        if (badge) {
            badge.hidden = !active;
            badge.title = active
                ? `Indicadores refletindo os filtros ativos (${count} projeto(s))`
                : 'Indicadores de todo o portfólio';
        }
    }

    async function loadLookups() {
        try {
            const [depts, comps, persons] = await Promise.all([
                fetch('/api/departments').then(r => r.json()).catch(() => []),
                fetch('/api/companies').then(r => r.json()).catch(() => []),
                fetch('/api/persons').then(r => r.json()).catch(() => [])
            ]);
            const deptList = document.getElementById('deptList');
            const companyList = document.getElementById('companyList');
            const personList = document.getElementById('personList');
            if (deptList) deptList.innerHTML = depts.map(d => `<option value="${escapeHtml(d.name)}">`).join('');
            if (companyList) companyList.innerHTML = comps.map(c => `<option value="${escapeHtml(c.name)}">`).join('');
            if (personList) personList.innerHTML = persons.map(p => `<option value="${escapeHtml(p.name)}">`).join('');
        } catch { /* offline */ }
    }

    function updateCategoryUI() {
        const cats = roadmapCategories || [];
        const catSelect = document.getElementById('projCategory');
        const filterCat = document.getElementById('projFilterCategory');
        if (catSelect) {
            catSelect.innerHTML = '<option value="">Selecione...</option>' + cats.map(c => `<option value="${c.slug}" style="color:${c.color}">${c.name}</option>`).join('');
        }
        if (filterCat) {
            const currentVal = filterCat.value;
            filterCat.innerHTML = '<option value="">Todas as categorias</option>' + cats.map(c => `<option value="${c.slug}">${c.name}</option>`).join('');
            filterCat.value = currentVal;
        }
    }

    function sortBy(key) {
        if (sortState.key === key) {
            sortState.asc = !sortState.asc;
        } else {
            sortState.key = key;
            sortState.asc = true;
        }
        // Sort in place
        const prioOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        projects.sort((a, b) => {
            let va = (a[key] || '').toString().toLowerCase();
            let vb = (b[key] || '').toString().toLowerCase();
            if (key === 'priority') { va = prioOrder[a.priority] ?? 9; vb = prioOrder[b.priority] ?? 9; }
            if (va < vb) return sortState.asc ? -1 : 1;
            if (va > vb) return sortState.asc ? 1 : -1;
            return 0;
        });
        renderTable();
    }

    function renderTable() {
        const tbody = document.getElementById('projectsBody');
        if (!tbody) return;

        // Update header sort indicators
        const headers = document.querySelectorAll('.projects-table th[data-sort]');
        headers.forEach(th => {
            const key = th.dataset.sort;
            th.classList.toggle('sort-asc', sortState.key === key && sortState.asc);
            th.classList.toggle('sort-desc', sortState.key === key && !sortState.asc);
        });

        if (projects.length === 0) {
            tbody.innerHTML = `<tr><td colspan="13" class="empty-projects"><p>Nenhum projeto cadastrado. Clique em "Novo Projeto" para começar.</p></td></tr>`;
            return;
        }

        tbody.innerHTML = projects.map(p => {
            const cat = roadmapCategories.find(c => c.slug === p.category);
            const catName = cat ? cat.name : (p.category || '—');
            const catColor = cat ? cat.color : '#888';
            return `
            <tr>
                <td><button class="proj-name-btn" onclick="ProjectsModule.edit(${p.id})" title="${escapeHtml(p.description || '')}">${escapeHtml(p.name)}</button></td>
                <td>${p.github_repo ? `<a class="proj-link" href="${escapeHtml(p.github_repo)}" target="_blank" rel="noopener noreferrer" title="Abrir repositório no GitHub"><i data-lucide="git-branch" aria-hidden="true"></i></a>` : '—'}</td>
                <td><span class="proj-type-badge" style="background:${catColor}22; color:${catColor}; border:1px solid ${catColor}44;">${escapeHtml(catName)}</span></td>
                <td>${escapeHtml(p.department || '—')}</td>
                <td>${escapeHtml(p.company || '—')}</td>
                <td>${escapeHtml(p.assignee || '—')}</td>
                <td>${escapeHtml(p.requester || '—')}</td>
                <td>${p.end_date ? new Date(p.end_date).getFullYear() : '—'}</td>
                <td><span class="proj-status-badge ${p.status}">${STATUS_LABELS[p.status] || p.status}</span></td>
                <td><span class="proj-priority-dot ${p.priority}"></span>${PRIORITY_LABELS[p.priority] || p.priority}</td>
                <td>${p.start_date ? new Date(p.start_date).toLocaleDateString('pt-BR') : '—'}</td>
                <td>${documentsCell(p)}</td>
                <td><button class="proj-action-btn" onclick="ProjectsModule.remove(${p.id})" title="Excluir"><i data-lucide="trash-2" aria-hidden="true"></i></button></td>
            </tr>
            `;
        }).join('');

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // Célula da coluna "Docs": mostra a contagem e abre a aba de documentos
    function documentsCell(p) {
        const count = Number(p.document_count) || 0;
        if (count > 0) {
            return `<button class="proj-doc-btn" onclick="ProjectsModule.openDocuments(${p.id})"
                title="Abrir os ${count} documento(s) deste projeto">
                <i data-lucide="file-text" aria-hidden="true"></i> ${count}
            </button>`;
        }
        return `<button class="proj-action-btn" onclick="ProjectsModule.openDocuments(${p.id})"
            title="Gerar documentos deste projeto">
            <i data-lucide="file-plus-2" aria-hidden="true"></i>
        </button>`;
    }

    // Alterna entre as abas "Dados" e "Documentos" do modal do projeto
    function switchModalTab(name) {
        const isDocs = name === 'documentos';
        const dadosPanel = document.getElementById('projTabDados');
        const docsPanel = document.getElementById('projTabDocumentos');
        const dadosBtn = document.getElementById('projTabDadosBtn');
        const docsBtn = document.getElementById('projTabDocumentosBtn');
        if (!dadosPanel || !docsPanel || !dadosBtn || !docsBtn) return;

        dadosPanel.hidden = isDocs;
        docsPanel.hidden = !isDocs;
        dadosBtn.classList.toggle('active', !isDocs);
        docsBtn.classList.toggle('active', isDocs);
        dadosBtn.setAttribute('aria-selected', String(!isDocs));
        docsBtn.setAttribute('aria-selected', String(isDocs));

        // Salvar/Excluir são do projeto — só valem na aba de dados
        const actions = document.querySelector('#projectForm .modal-actions');
        if (actions) actions.style.display = isDocs ? 'none' : '';

        if (isDocs && typeof lucide !== 'undefined') lucide.createIcons();
    }

    // Abre o projeto já na aba de documentos (usado pela coluna Docs)
    async function openDocuments(id) {
        await edit(id);
        switchModalTab('documentos');
    }

    function openModal(project = null) {
        const modal = document.getElementById('projectModal');
        const title = document.getElementById('projectModalTitle');
        const form = document.getElementById('projectForm');
        const deleteBtn = document.getElementById('deleteProjectBtn');
        const datesInfo = document.getElementById('projDatesInfo');

        form.reset();
        loadLookups();

        // Reset do estado de arquivos
        pendingFiles = [];
        currentFiles = [];
        const fileInput = document.getElementById('projFiles');
        if (fileInput) fileInput.value = '';
        renderFileList();

        if (project) {
            editingId = project.id;
            title.textContent = 'Editar Projeto';
            document.getElementById('projName').value = project.name || '';
            document.getElementById('projDescription').value = project.description || '';
            document.getElementById('projCategory').value = project.category || '';
            document.getElementById('projPriority').value = project.priority || 'medium';
            document.getElementById('projDepartment').value = project.department || '';
            document.getElementById('projCompany').value = project.company || '';
            document.getElementById('projAssignee').value = project.assignee || '';
            document.getElementById('projRequester').value = project.requester || '';
            document.getElementById('projStatus').value = project.status || 'planning';
            document.getElementById('projStartDate').value = project.start_date ? project.start_date.split('T')[0] : '';
            document.getElementById('projEndDate').value = project.end_date ? project.end_date.split('T')[0] : '';
            document.getElementById('projBudget').value = project.budget || '';
            document.getElementById('projTags').value = project.tags || '';
            document.getElementById('projUrl').value = project.url || '';
            document.getElementById('projGithub').value = project.github_repo || '';
            loadProjectFiles(project.id);

            if (project.created_at) {
                datesInfo.style.display = '';
                document.getElementById('projCreated').textContent = new Date(project.created_at).toLocaleString('pt-BR');
                document.getElementById('projUpdated').textContent = new Date(project.updated_at).toLocaleString('pt-BR');
            }
            deleteBtn.style.display = '';
        } else {
            editingId = null;
            title.textContent = 'Novo Projeto';
            document.getElementById('projGithub').value = '';
            datesInfo.style.display = 'none';
            deleteBtn.style.display = 'none';
        }

        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');

        // Aba de documentos: associa o projeto atual e volta para "Dados"
        if (typeof DocumentsModule !== 'undefined') DocumentsModule.setProject(project);
        switchModalTab('dados');

        setTimeout(() => document.getElementById('projName').focus(), 100);
    }

    function closeModal() {
        const modal = document.getElementById('projectModal');
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        editingId = null;
        if (typeof DocumentsModule !== 'undefined') DocumentsModule.reset();
    }

    async function save(e) {
        e.preventDefault();
        const data = {
            name: document.getElementById('projName').value,
            description: document.getElementById('projDescription').value || null,
            category: document.getElementById('projCategory').value || null,
            type: 'data',
            priority: document.getElementById('projPriority').value,
            department: document.getElementById('projDepartment').value,
            company: document.getElementById('projCompany').value,
            assignee: document.getElementById('projAssignee').value,
            requester: document.getElementById('projRequester').value,
            status: document.getElementById('projStatus').value,
            start_date: document.getElementById('projStartDate').value || null,
            end_date: document.getElementById('projEndDate').value || null,
            budget: document.getElementById('projBudget').value || null,
            tags: document.getElementById('projTags').value || null,
            url: document.getElementById('projUrl').value || null,
            github_repo: document.getElementById('projGithub').value || null,
        };

        try {
            let projectId = editingId;

            if (editingId) {
                const resp = await fetch(`/api/projects/${editingId}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
                });
                if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || 'Falha ao atualizar');
                if (typeof toast === 'function') toast('Projeto atualizado!', 'success');
            } else {
                const resp = await fetch('/api/projects', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
                });
                if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || 'Falha ao criar');
                const created = await resp.json();
                projectId = created.id;
                if (typeof toast === 'function') toast('Projeto criado!', 'success');
            }

            await uploadPendingFiles(projectId);
            pendingFiles = [];
            closeModal();
            await loadProjects();
        } catch (err) {
            if (typeof toast === 'function') toast('Erro: ' + err.message, 'error');
        }
    }

    // ====== Arquivos anexos ======
    async function loadProjectFiles(projectId) {
        try {
            const resp = await fetch(`/api/projects/${projectId}/files`);
            currentFiles = resp.ok ? await resp.json() : [];
        } catch {
            currentFiles = [];
        }
        renderFileList();
    }

    function formatBytes(bytes) {
        const n = Number(bytes) || 0;
        if (n <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        let value = n;
        while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
        return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
    }

    function fileIcon(mime) {
        const m = (mime || '').toLowerCase();
        if (m.includes('pdf')) return 'file-text';
        if (m.includes('sheet') || m.includes('excel') || m.includes('csv')) return 'file-spreadsheet';
        if (m.includes('image')) return 'file-image';
        if (m.includes('zip') || m.includes('compressed') || m.includes('tar')) return 'file-archive';
        if (m.includes('word') || m.includes('document')) return 'file-type';
        return 'file';
    }

    function renderFileList() {
        const list = document.getElementById('projFileList');
        if (!list) return;
        const items = [];

        currentFiles.forEach(f => {
            items.push(`<li class="file-item">
                <i data-lucide="${fileIcon(f.mime_type)}" aria-hidden="true"></i>
                <div class="file-item-info">
                    <span class="file-item-name">${escapeHtml(f.original_name)}</span>
                    <small>${formatBytes(f.size_bytes)} · ${f.uploaded_at ? new Date(f.uploaded_at).toLocaleDateString('pt-BR') : ''}</small>
                </div>
                <a class="proj-action-btn file-download" href="/api/files/${f.id}" title="Baixar arquivo"><i data-lucide="download" aria-hidden="true"></i></a>
                <button type="button" class="proj-action-btn" onclick="ProjectsModule.removeFile(${f.id})" title="Excluir arquivo"><i data-lucide="trash-2" aria-hidden="true"></i></button>
            </li>`);
        });

        pendingFiles.forEach((f, i) => {
            items.push(`<li class="file-item file-item-pending">
                <i data-lucide="file-up" aria-hidden="true"></i>
                <div class="file-item-info">
                    <span class="file-item-name">${escapeHtml(f.name)}</span>
                    <small>${formatBytes(f.size)} · aguardando salvar</small>
                </div>
                <button type="button" class="proj-action-btn" onclick="ProjectsModule.cancelFile(${i})" title="Remover seleção"><i data-lucide="x" aria-hidden="true"></i></button>
            </li>`);
        });

        list.innerHTML = items.join('');
        list.hidden = items.length === 0;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function addFiles(fileList) {
        for (const file of Array.from(fileList || [])) {
            if (file.size > MAX_FILE_SIZE) {
                if (typeof toast === 'function') toast(`"${file.name}" excede 25 MB`, 'error');
                continue;
            }
            if (pendingFiles.length >= MAX_FILES) {
                if (typeof toast === 'function') toast(`Máximo de ${MAX_FILES} arquivos por vez`, 'error');
                break;
            }
            pendingFiles.push(file);
        }
        renderFileList();
    }

    function cancelFile(index) {
        pendingFiles.splice(index, 1);
        renderFileList();
    }

    async function removeFile(id) {
        if (!confirm('Tem certeza que deseja excluir este arquivo?')) return;
        try {
            const resp = await fetch(`/api/files/${id}`, { method: 'DELETE' });
            if (!resp.ok) throw new Error('Falha ao excluir');
            currentFiles = currentFiles.filter(f => f.id !== id);
            renderFileList();
            if (typeof toast === 'function') toast('Arquivo excluído', 'success');
        } catch (err) {
            if (typeof toast === 'function') toast('Erro: ' + err.message, 'error');
        }
    }

    async function uploadPendingFiles(projectId) {
        if (!projectId || pendingFiles.length === 0) return;
        const formData = new FormData();
        pendingFiles.forEach(f => formData.append('files', f));
        const resp = await fetch(`/api/projects/${projectId}/files`, { method: 'POST', body: formData });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || 'Falha ao enviar arquivos');
        }
    }

    async function edit(id) {
        try {
            const resp = await fetch(`/api/projects/${id}`);
            const project = await resp.json();
            openModal(project);
        } catch (err) {
            if (typeof toast === 'function') toast('Erro ao carregar projeto', 'error');
        }
    }

    async function remove(id) {
        if (!confirm('Tem certeza que deseja excluir este projeto?')) return;
        try {
            await fetch(`/api/projects/${id}`, { method: 'DELETE' });
            if (typeof toast === 'function') toast('Projeto excluído', 'success');
            await loadProjects();
        } catch (err) {
            if (typeof toast === 'function') toast('Erro ao excluir', 'error');
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function switchTab(tabName) {
        const ganttPanel = document.getElementById('tabGanttPanel');
        const projectsPanel = document.getElementById('tabProjectsPanel');
        const tabGantt = document.getElementById('tabGantt');
        const tabProjects = document.getElementById('tabProjects');

        if (tabName === 'projects') {
            ganttPanel.hidden = true;
            projectsPanel.hidden = false;
            tabGantt.classList.remove('active');
            tabGantt.setAttribute('aria-selected', 'false');
            tabProjects.classList.add('active');
            tabProjects.setAttribute('aria-selected', 'true');
            loadLookups();
            loadProjects();
        } else {
            ganttPanel.hidden = false;
            projectsPanel.hidden = true;
            tabGantt.classList.add('active');
            tabGantt.setAttribute('aria-selected', 'true');
            tabProjects.classList.remove('active');
            tabProjects.setAttribute('aria-selected', 'false');
        }
    }

    function setDashboardVisibility(show) {
        const dashboard = document.getElementById('projDashboard');
        const btn = document.getElementById('projStatsBtn');
        dashboard.style.display = show ? 'block' : 'none';
        btn.setAttribute('aria-expanded', String(show));
        btn.setAttribute('aria-label', show ? 'Ocultar indicadores' : 'Exibir indicadores');
    }

    function init() {
        document.getElementById('tabGantt').addEventListener('click', () => switchTab('gantt'));
        document.getElementById('tabProjects').addEventListener('click', () => switchTab('projects'));
        document.getElementById('newProjectBtn').addEventListener('click', () => openModal());
        document.getElementById('projectForm').addEventListener('submit', save);
        document.getElementById('projectCancelBtn').addEventListener('click', closeModal);
        document.getElementById('projectModalClose').addEventListener('click', closeModal);

        // Arquivos: seleção por clique e arrastar-e-soltar
        const fileInput = document.getElementById('projFiles');
        const fileDrop = document.getElementById('projFileDrop');
        if (fileInput && fileDrop) {
            fileInput.addEventListener('change', (e) => {
                addFiles(e.target.files);
                e.target.value = '';
            });
            fileDrop.addEventListener('click', () => fileInput.click());
            fileDrop.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
            });
            ['dragenter', 'dragover'].forEach(evt =>
                fileDrop.addEventListener(evt, (e) => { e.preventDefault(); fileDrop.classList.add('dragover'); }));
            ['dragleave', 'dragend'].forEach(evt =>
                fileDrop.addEventListener(evt, () => fileDrop.classList.remove('dragover')));
            fileDrop.addEventListener('drop', (e) => {
                e.preventDefault();
                fileDrop.classList.remove('dragover');
                addFiles(e.dataTransfer.files);
            });
        }
        document.getElementById('deleteProjectBtn').addEventListener('click', () => {
            if (editingId) remove(editingId);
            closeModal();
        });

        document.getElementById('projectModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeModal();
        });

        // Dashboard toggle
        document.getElementById('projStatsBtn').addEventListener('click', () => {
            setDashboardVisibility(document.getElementById('projDashboard').style.display === 'none');
        });

        // Actions dropdown
        const projMenuBtn = document.getElementById('projMenuBtn');
        const projMenu = document.getElementById('projMenu');
        projMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = projMenu.classList.toggle('open');
            projMenuBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            if (isOpen) requestAnimationFrame(() => projMenu.querySelector('[role="menuitem"]')?.focus());
        });
        document.addEventListener('click', () => {
            projMenu.classList.remove('open');
            projMenuBtn.setAttribute('aria-expanded', 'false');
        });
        projMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.target.closest('.dropdown-item')) {
                projMenu.classList.remove('open');
                projMenuBtn.setAttribute('aria-expanded', 'false');
                projMenuBtn.focus();
            }
        });
        projMenu.addEventListener('keydown', (e) => {
            const items = [...projMenu.querySelectorAll('[role="menuitem"]')];
            const currentIndex = items.indexOf(document.activeElement);
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const direction = e.key === 'ArrowDown' ? 1 : -1;
                const nextIndex = (currentIndex + direction + items.length) % items.length;
                items[nextIndex].focus();
            } else if (e.key === 'Home' || e.key === 'End') {
                e.preventDefault();
                items[e.key === 'Home' ? 0 : items.length - 1].focus();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                projMenu.classList.remove('open');
                projMenuBtn.setAttribute('aria-expanded', 'false');
                projMenuBtn.focus();
            }
        });

        // Export CSV
        document.getElementById('projExportCsvBtn').addEventListener('click', () => {
            if (projects.length === 0) { toast('Nenhum projeto para exportar', 'info'); return; }
            const headers = ['Nome', 'Descrição', 'Categoria', 'Departamento', 'Empresa', 'Responsável', 'Solicitante', 'Status', 'Prioridade', 'Início', 'Fim'];
            const rows = projects.map(p => [
                p.name, p.description || '', p.category || '', p.department || '', p.company || '',
                p.assignee || '', p.requester || '', p.status, p.priority,
                p.start_date || '', p.end_date || ''
            ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
            const csv = [headers.join(','), ...rows].join('\n');
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'projetos.csv';
            link.click();
            URL.revokeObjectURL(link.href);
            toast('Projetos exportados para CSV', 'success');
        });

        // Import CSV
        document.getElementById('projImportCsvBtn').addEventListener('click', () => {
            document.getElementById('projImportFile').click();
        });
        document.getElementById('projImportFile').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const lines = ev.target.result.split('\n').filter(l => l.trim());
                const headers = lines[0].replace(/"/g, '').split(',').map(h => h.trim().toLowerCase());
                const nameIdx = headers.indexOf('nome');
                if (nameIdx < 0) { toast('CSV precisa ter coluna "Nome"', 'error'); return; }
                let imported = 0;
                for (let i = 1; i < lines.length; i++) {
                    const cols = lines[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [];
                    const vals = cols.map(c => c.replace(/^"|"$/g, '').trim());
                    const name = vals[nameIdx];
                    if (!name) continue;
                    const deptIdx = headers.indexOf('departamento');
                    const compIdx = headers.indexOf('empresa');
                    const body = { name };
                    if (headers.indexOf('categoria') >= 0) body.category = vals[headers.indexOf('categoria')];
                    if (deptIdx >= 0) body.department = vals[deptIdx];
                    if (compIdx >= 0) body.company = vals[compIdx];
                    if (headers.indexOf('responsável') >= 0 || headers.indexOf('responsavel') >= 0) {
                        body.assignee = vals[headers.indexOf('responsável') >= 0 ? headers.indexOf('responsável') : headers.indexOf('responsavel')];
                    }
                    if (headers.indexOf('solicitante') >= 0) body.requester = vals[headers.indexOf('solicitante')];
                    if (headers.indexOf('status') >= 0) body.status = vals[headers.indexOf('status')];
                    if (headers.indexOf('prioridade') >= 0) body.priority = vals[headers.indexOf('prioridade')];
                    if (headers.indexOf('início') >= 0 || headers.indexOf('inicio') >= 0) {
                        body.start_date = vals[headers.indexOf('início') >= 0 ? headers.indexOf('início') : headers.indexOf('inicio')];
                    }

                    try {
                        const resp = await fetch('/api/projects', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
                        });
                        if (resp.ok) imported++;
                    } catch { /* skip */ }
                }
                toast(`${imported} projetos importados`, 'success');
                loadProjects();
            };
            reader.readAsText(file);
            e.target.value = '';
        });

        // Share
        document.getElementById('projShareBtn').addEventListener('click', () => {
            navigator.clipboard.writeText(window.location.origin + window.location.pathname).then(() => {
                toast('Link copiado!', 'success');
            }).catch(() => {
                prompt('Copie o link:', window.location.origin + window.location.pathname);
            });
        });

        // Filters
        document.getElementById('projFilterCategory').addEventListener('change', (e) => { filters.category = e.target.value; loadProjects(); });
        document.getElementById('projFilterStatus').addEventListener('change', (e) => { filters.status = e.target.value; loadProjects(); });
        document.getElementById('projFilterPriority').addEventListener('change', (e) => { filters.priority = e.target.value; loadProjects(); });
        // Busca: debounce para não disparar tabela + dashboard a cada tecla
        let searchTimer = null;
        document.getElementById('projSearch').addEventListener('input', (e) => {
            filters.search = e.target.value;
            clearTimeout(searchTimer);
            searchTimer = setTimeout(loadProjects, 250);
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.getElementById('projectModal').classList.contains('active')) {
                closeModal();
            }
        });
    }

    return { init, edit, remove, loadProjects, switchTab, sortBy, removeFile, cancelFile, openDocuments, switchModalTab };
})();

document.addEventListener('DOMContentLoaded', () => ProjectsModule.init());
