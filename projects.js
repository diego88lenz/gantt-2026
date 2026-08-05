/**
 * Gantt 2026 — Projects Module
 * Gerencia o cadastro de projetos de Dados, IA e Geoprocessamento
 */
const ProjectsModule = (() => {
    let projects = [];
    let editingId = null;
    let filters = { type: '', status: '', priority: '', search: '' };

    const TYPE_LABELS = { data: '📊 Dados', ai: '🤖 IA', geo: '🗺️ Geo', analytics: '📈 Analytics' };
    const STATUS_LABELS = { planning: 'Planejando', in_progress: 'Em andamento', completed: 'Concluído', on_hold: 'Pausado', cancelled: 'Cancelado' };
    const PRIORITY_LABELS = { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa' };

    async function loadProjects() {
        const params = new URLSearchParams();
        if (filters.type) params.set('type', filters.type);
        if (filters.status) params.set('status', filters.status);
        if (filters.priority) params.set('priority', filters.priority);
        if (filters.search) params.set('search', filters.search);

        try {
            const resp = await fetch(`/api/projects?${params}`);
            projects = await resp.json();
            renderTable();
            await loadStats();
        } catch (err) {
            console.error('Erro ao carregar projetos:', err);
        }
    }

    async function loadStats() {
        try {
            const resp = await fetch('/api/projects/stats');
            const s = await resp.json();
            document.getElementById('pStatTotal').textContent = s.total || 0;
            document.getElementById('pStatProgress').textContent = s.in_progress || 0;
            document.getElementById('pStatCompleted').textContent = s.completed || 0;
            document.getElementById('pStatPlanning').textContent = s.planning || 0;
            document.getElementById('pStatAI').textContent = s.ai || 0;
        } catch { /* offline */ }
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

    function renderTable() {
        const tbody = document.getElementById('projectsBody');
        if (!tbody) return;

        if (projects.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" class="empty-projects"><p>Nenhum projeto cadastrado. Clique em "Novo Projeto" para começar.</p></td></tr>`;
            return;
        }

        tbody.innerHTML = projects.map(p => `
            <tr>
                <td><button class="proj-name-btn" onclick="ProjectsModule.edit(${p.id})" title="${escapeHtml(p.description || '')}">${escapeHtml(p.name)}</button></td>
                <td><span class="proj-type-badge ${p.type}">${TYPE_LABELS[p.type] || p.type}</span></td>
                <td>${escapeHtml(p.department || '—')}</td>
                <td>${escapeHtml(p.company || '—')}</td>
                <td>${escapeHtml(p.assignee || '—')}</td>
                <td>${escapeHtml(p.requester || '—')}</td>
                <td>${p.url ? `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener" class="proj-link" title="${escapeHtml(p.url)}"><i data-lucide="external-link"></i></a>` : '—'}</td>
                <td><span class="proj-status-badge ${p.status}">${STATUS_LABELS[p.status] || p.status}</span></td>
                <td><span class="proj-priority-dot ${p.priority}"></span>${PRIORITY_LABELS[p.priority] || p.priority}</td>
                <td>${p.start_date ? new Date(p.start_date).toLocaleDateString('pt-BR') : '—'}</td>
                <td><button class="proj-action-btn" onclick="ProjectsModule.remove(${p.id})" title="Excluir"><i data-lucide="trash-2" aria-hidden="true"></i></button></td>
            </tr>
        `).join('');

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function openModal(project = null) {
        const modal = document.getElementById('projectModal');
        const title = document.getElementById('projectModalTitle');
        const form = document.getElementById('projectForm');
        const deleteBtn = document.getElementById('deleteProjectBtn');
        const datesInfo = document.getElementById('projDatesInfo');

        form.reset();
        loadLookups();

        if (project) {
            editingId = project.id;
            title.textContent = 'Editar Projeto';
            document.getElementById('projName').value = project.name || '';
            document.getElementById('projDescription').value = project.description || '';
            document.getElementById('projType').value = project.type || 'data';
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

            if (project.created_at) {
                datesInfo.style.display = '';
                document.getElementById('projCreated').textContent = new Date(project.created_at).toLocaleString('pt-BR');
                document.getElementById('projUpdated').textContent = new Date(project.updated_at).toLocaleString('pt-BR');
            }
            deleteBtn.style.display = '';
        } else {
            editingId = null;
            title.textContent = 'Novo Projeto';
            datesInfo.style.display = 'none';
            deleteBtn.style.display = 'none';
        }

        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        setTimeout(() => document.getElementById('projName').focus(), 100);
    }

    function closeModal() {
        const modal = document.getElementById('projectModal');
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        editingId = null;
    }

    async function save(e) {
        e.preventDefault();
        const data = {
            name: document.getElementById('projName').value,
            description: document.getElementById('projDescription').value,
            type: document.getElementById('projType').value,
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
        };

        try {
            if (editingId) {
                await fetch(`/api/projects/${editingId}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
                });
                if (typeof toast === 'function') toast('Projeto atualizado!', 'success');
            } else {
                await fetch('/api/projects', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
                });
                if (typeof toast === 'function') toast('Projeto criado!', 'success');
            }
            closeModal();
            await loadProjects();
        } catch (err) {
            if (typeof toast === 'function') toast('Erro: ' + err.message, 'error');
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

    function init() {
        document.getElementById('tabGantt').addEventListener('click', () => switchTab('gantt'));
        document.getElementById('tabProjects').addEventListener('click', () => switchTab('projects'));
        document.getElementById('newProjectBtn').addEventListener('click', () => openModal());
        document.getElementById('projectForm').addEventListener('submit', save);
        document.getElementById('projectCancelBtn').addEventListener('click', closeModal);
        document.getElementById('projectModalClose').addEventListener('click', closeModal);
        document.getElementById('deleteProjectBtn').addEventListener('click', () => {
            if (editingId) remove(editingId);
            closeModal();
        });

        document.getElementById('projectModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeModal();
        });

        document.getElementById('projFilterType').addEventListener('change', (e) => { filters.type = e.target.value; loadProjects(); });
        document.getElementById('projFilterStatus').addEventListener('change', (e) => { filters.status = e.target.value; loadProjects(); });
        document.getElementById('projFilterPriority').addEventListener('change', (e) => { filters.priority = e.target.value; loadProjects(); });
        document.getElementById('projSearch').addEventListener('input', (e) => { filters.search = e.target.value; loadProjects(); });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.getElementById('projectModal').classList.contains('active')) {
                closeModal();
            }
        });
    }

    return { init, edit, remove, loadProjects, switchTab };
})();

document.addEventListener('DOMContentLoaded', () => ProjectsModule.init());
