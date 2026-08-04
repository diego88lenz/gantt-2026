// Gantt Chart Data Management — Multi-year
// Structure: { "2026": { categoryId: [tasks] } }
let ganttData = {};
let currentYear = new Date().getFullYear().toString();

// Category Configuration
let categories = [
    { id: 'projects', name: 'Geral', color: '#60a5fa' },
    { id: 'data', name: 'Dados', color: '#fbbf24' },
    { id: 'lake', name: 'Lakehouse', color: '#10b981' }
];

let currentEditingIndex = null;
let currentEditingCategory = null;
let currentEditingCategoryId = null;

// Undo/Redo System
let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 50;

// Collapsed Categories
let collapsedCategories = new Set();

// Search term & assignee filter
let searchTerm = '';
let assigneeFilter = '';

// View mode: 'table' or 'bar'
let viewMode = 'table';

// Zoom level: 12=meses, 4=trimestres, 2=semestres
let zoomLevel = 12;

// Drag State
let dragState = { category: null, index: null, element: null };

// Theme
let isLightTheme = localStorage.getItem('gantt-theme') === 'light';

const MONTH_NAMES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const QUARTER_NAMES = ['Q1 (JAN-MAR)', 'Q2 (ABR-JUN)', 'Q3 (JUL-SET)', 'Q4 (OUT-DEZ)'];
const SEMESTER_NAMES = ['1º SEM (JAN-JUN)', '2º SEM (JUL-DEZ)'];
const CURRENT_MONTH = new Date().getMonth();

// Helper: get data for current year
function getYearData() {
    if (!ganttData[currentYear]) ganttData[currentYear] = {};
    return ganttData[currentYear];
}

// Helper: collect all unique assignees
function collectAssignees() {
    const s = new Set();
    Object.values(ganttData).forEach(yearData => {
        Object.values(yearData).forEach(tasks => {
            tasks.forEach(t => { if (t.assignee) s.add(t.assignee); });
        });
    });
    return [...s].sort();
}

// Icon Helper Function
function createIcon(iconName, className = '') {
    const i = document.createElement('i');
    i.setAttribute('data-lucide', iconName);
    if (className) i.className = className;
    return i;
}

// Toast Notification System
function toast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = { success: 'check-circle', error: 'alert-circle', info: 'info' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i data-lucide="${icons[type] || 'info'}"></i><span>${message}</span>`;
    container.appendChild(el);
    if (typeof lucide !== 'undefined') lucide.createIcons();

    setTimeout(() => {
        el.classList.add('hide');
        el.addEventListener('animationend', () => el.remove());
    }, duration);
}


// LocalStorage Functions
function saveToLocalStorage() {
    try {
        localStorage.setItem('gantt-2026-data', JSON.stringify({
            ganttData, categories, currentYear
        }));
    } catch (error) {
        console.error('Erro ao salvar dados:', error);
    }
}

function loadFromLocalStorage() {
    try {
        const savedData = localStorage.getItem('gantt-2026-data');
        if (savedData) {
            const parsed = JSON.parse(savedData);
            if (parsed.categories) { categories.length = 0; categories.push(...parsed.categories); }
            if (parsed.currentYear) currentYear = parsed.currentYear;

            if (parsed.ganttData) {
                const sampleCat = categories[0]?.id;
                const firstVal = Object.values(parsed.ganttData)[0];
                const isMultiYear = firstVal && typeof firstVal === 'object' && !Array.isArray(firstVal);

                if (isMultiYear) {
                    Object.keys(ganttData).forEach(k => delete ganttData[k]);
                    Object.assign(ganttData, parsed.ganttData);
                } else {
                    // Migrate flat format to multi-year
                    Object.keys(ganttData).forEach(k => delete ganttData[k]);
                    ganttData[currentYear] = {};
                    Object.assign(ganttData[currentYear], parsed.ganttData);
                }
                if (!ganttData[currentYear]) ganttData[currentYear] = {};
            }
        } else {
            loadDefaultData();
        }
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
    }
}

function loadDefaultData() {
    ganttData[currentYear] = {
        projects: [
            { name: "Kickoff do PLAN 2026", months: [0] },
                    { name: "Versão 1.0 do Design System de Dados", months: [1, 2, 3] },
                    { name: "Portfólio de Projetos", months: [2, 3, 4] },
                    { name: "Trilhas de analítica, ciência de dados e engenharia de Dados (EAD)", months: [3, 4, 5] },
                    { name: "Plano Desenvolvimento Individual", months: [3, 4, 5] },
                    { name: "Lançamento da trilha de capacitação", months: [5, 6] },
                    { name: "Painel de custos de dados (FinOps) e a políticas de retenção.", months: [6, 7, 8, 9] },
                    { name: "Retrospectiva do PLANO 2026", months: [8, 9, 10] },
                    { name: "Desenho preliminar do PLANO 2027", months: [9, 10, 11] }
                ],
                data: [
                    { name: "Definição de padrão de versionamento", months: [0, 1] },
                    { name: "Melhorias nos repositórios principais", months: [1, 2, 3] },
                    { name: "POC do Embed YVY e Animus", months: [1, 2] },
                    { name: "Embed YVY e Animus v1 em produção, expandindo para novos casos", months: [2, 3, 4, 5] },
                    { name: "Design System aplicado aos primeiros dashboards", months: [3, 4, 5] },
                    { name: "Adoção de Design System (todo novo dashboard nasce no padrão)", months: [4, 5, 6, 7, 8, 9, 10, 11] },
                    { name: "Versionamento adotado como padrão obrigatório para novos projetos.", months: [3, 4, 5, 6, 7, 8, 9, 10, 11] },
                    { name: "M.E.S. Envasadora 3.0", months: [1, 2] },
                    { name: "M.E.S. Formulacion", months: [2, 3, 4] },
                    { name: "Balancete Comparativo CN", months: [1, 2, 3] },
                    { name: "Stock 3D IBS", months: [1, 2, 3] },
                    { name: "Distribucion de gastos - IBS", months: [2, 3, 4, 5] },
                    { name: "Analises de Gastos - IBS", months: [4, 5] },
                    { name: "Gestión de Flora 2.0", months: [3, 4, 5] },
                    { name: "Analises de Normalidades", months: [1, 2, 3, 4] },
                    { name: "Analises de Hojas", months: [1, 2, 3] },
                    { name: "Inteligencia de Territorio 2.0", months: [0, 1, 2] },
                    { name: "Fluxo de Caixa TMRR", months: [2, 3, 4, 5] },
                    { name: "Monitores de Produccion Agricola - Agrofert", months: [3, 4, 5] },
                    { name: "Granos - Bonificacion por Fijacion", months: [4, 5, 6] },
                    { name: "Distribucion de Costos de Fabrica de Almidon", months: [5, 6] },
                    { name: "Stock 3D - Minga", months: [5, 6, 7] },
                    { name: "Rastreo en vivo de camiones", months: [6, 7, 8, 9] },
                    { name: "Entrada e Saindo de Vehiculos Silos", months: [7, 8, 9, 10] },
                    { name: "Registro de Mantenimiento Preventivo", months: [7, 8] },
                    { name: "Ganaderia 2.0 CN", months: [1, 2, 3, 4] },
                    { name: "Assessement Comercial TMPY", months: [0, 1, 2] },
                    { name: "Inteligencia de Mercado 2.0 (IA)", months: [2, 3, 4, 5] },
                    { name: "Vaga para Analista de Dados Sr", months: [2, 3, 4] }
                ],
                lake: [
                    { name: "Migração de workspaces Fabric ", months: [0, 1] },
                    { name: "Mapear dados pessoais – base LGPD", months: [0, 1, 2, 3] },
                    { name: "Copydata das principais fontes para o Lakehouse (bronze/silver)", months: [0, 1, 2, 3] },
                    { name: "Migração de Dados legado do Digital Farm para a nova estrutura", months: [1, 2, 3, 4, 5, 6] },
                    { name: "Definição e implementação da primeira versão de monitoramento de pipelines (DataOps)", months: [2, 3, 4] },
                    { name: "Lakehouse com fontes críticas em silver/gold (domínios maduros)", months: [4, 5, 6] },
                    { name: "Pipeline de teste de YVY Clima (Massa de Dados)", months: [2, 3, 4] },
                    { name: "Definição dos datasets self-service", months: [4, 5, 6] },
                    { name: "Ampliação da plataforma self-service (mais datasets)", months: [6, 7, 8] },
                    { name: "Lakehouse como fonte oficial para decisões estratégicas", months: [8, 9, 10, 11] },
                    { name: "2-5 modelos de IA/ML em produção com monitoramento de performance", months: [2, 3, 6, 7, 10, 11] },
                    { name: "Estrutura de Governança de Dados formalizada (papéis, fórum, catálogo inicial)", months: [0, 1, 2, 3, 4, 5] },
                    { name: "Plano detalhado de LGPD (priorização das ações por risco/impacto)", months: [0, 1, 4, 5, 6] },
                    { name: "Processos de DataOps e FinOps maduros (painéis de logs e custos)", months: [9, 10, 11] },
                    { name: "Vaga Engenheiro de Dados", months: [1, 2, 3] },
                    { name: "Vaga Cientista de Dados", months: [2, 3, 4] },
                    { name: "Avaliação de riscos de dados (Data Risk)", months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }
                ]
    };
}

// Load from URL hash (shareable link)
function loadFromUrl() {
    const hash = window.location.hash;
    if (!hash || hash.length < 3) return;
    try {
        const decoded = JSON.parse(decodeURIComponent(escape(atob(hash.slice(1)))));
        if (decoded.g && decoded.c) {
            if (confirm('Dados encontrados na URL. Deseja carregá-los? (Seus dados atuais serão substituídos)')) {
                Object.keys(ganttData).forEach(k => delete ganttData[k]);
                Object.assign(ganttData, decoded.g);
                categories.length = 0;
                categories.push(...decoded.c);
                if (decoded.y) currentYear = decoded.y;
                saveToLocalStorage();
                renderAll();
                window.location.hash = '';
            }
        }
    } catch (e) { /* ignore invalid hash */ }
}

// Share via URL
function shareUrl() {
    const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ g: ganttData, c: categories, y: currentYear }))));
    const url = window.location.origin + window.location.pathname + '#' + payload;
    navigator.clipboard.writeText(url).then(() => {
        toast('Link copiado! Compartilhe esta URL para que outros vejam o planejamento.', 'success');
    }).catch(() => {
        prompt('Copie o link para compartilhar:', url);
    });
}

// History Management
function pushHistory() {
    const snapshot = {
        ganttData: JSON.parse(JSON.stringify(ganttData)),
        categories: JSON.parse(JSON.stringify(categories))
    };
    undoStack.push(snapshot);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
    updateUndoRedoButtons();
}

function undo() {
    if (undoStack.length === 0) return;
    const current = {
        ganttData: JSON.parse(JSON.stringify(ganttData)),
        categories: JSON.parse(JSON.stringify(categories))
    };
    redoStack.push(current);
    const previous = undoStack.pop();
    Object.keys(ganttData).forEach(k => delete ganttData[k]);
    Object.assign(ganttData, previous.ganttData);
    categories.length = 0;
    categories.push(...previous.categories);
    saveToLocalStorage();
    renderGantt();
    updateUndoRedoButtons();
}

function redo() {
    if (redoStack.length === 0) return;
    const current = {
        ganttData: JSON.parse(JSON.stringify(ganttData)),
        categories: JSON.parse(JSON.stringify(categories))
    };
    undoStack.push(current);
    const next = redoStack.pop();
    Object.keys(ganttData).forEach(k => delete ganttData[k]);
    Object.assign(ganttData, next.ganttData);
    categories.length = 0;
    categories.push(...next.categories);
    saveToLocalStorage();
    renderGantt();
    updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    if (undoBtn) undoBtn.style.opacity = undoStack.length === 0 ? '0.4' : '1';
    if (redoBtn) redoBtn.style.opacity = redoStack.length === 0 ? '0.4' : '1';
}

// Initialize the Gantt chart
function initGantt() {
    loadFromLocalStorage();
    loadFromUrl();
    updateAssigneeFilter();
    renderAll();
    setupEventListeners();
}

function renderAll() {
    updateAssigneeFilter();
    if (viewMode === 'bar') { renderBarChart(); return; }
    renderGantt();
}

// Get zoom column headers
function getZoomHeaders() {
    if (zoomLevel === 4) return QUARTER_NAMES;
    if (zoomLevel === 2) return SEMESTER_NAMES;
    return MONTH_NAMES;
}

// Map task months to zoom columns
function getZoomColumns(months) {
    if (zoomLevel === 12) return months;
    const cols = new Set();
    const divisor = zoomLevel === 4 ? 3 : 6;
    months.forEach(m => cols.add(Math.floor(m / divisor)));
    return [...cols].sort((a, b) => a - b);
}

// Get month range string for a zoom column
function getZoomColumnRange(colIndex) {
    if (zoomLevel === 2) {
        const start = colIndex * 6;
        return MONTH_NAMES[start] + '-' + MONTH_NAMES[start + 5];
    }
    if (zoomLevel === 4) {
        const start = colIndex * 3;
        return MONTH_NAMES[start] + '-' + MONTH_NAMES[start + 2];
    }
    return MONTH_NAMES[colIndex];
}

// Check if current month falls within a zoom column
function isCurrentMonthInZoomCol(colIndex) {
    if (zoomLevel === 12) return colIndex === CURRENT_MONTH;
    const divisor = zoomLevel === 4 ? 3 : 6;
    return Math.floor(CURRENT_MONTH / divisor) === colIndex;
}

// Render the Gantt chart
function renderGantt() {
    const tbody = document.getElementById('ganttBody');
    tbody.innerHTML = '';

    const numCols = parseInt(zoomLevel);

    // Update table header
    const theadRow = document.querySelector('.gantt-table thead tr');
    if (theadRow) {
        const headers = getZoomHeaders();
        theadRow.innerHTML = '<th>PROJETOS</th>' + headers.map((h, i) => {
            const curClass = isCurrentMonthInZoomCol(i) ? ' class="current-month"' : '';
            return `<th${curClass}>${h}</th>`;
        }).join('');
    }

    // Render each category
    const yd = getYearData();
    categories.forEach(category => {
        if (!yd[category.id]) {
            yd[category.id] = [];
        }

        const tasks = yd[category.id];
        const isCollapsed = collapsedCategories.has(category.id);

        let filteredTasks = tasks;
        if (searchTerm) {
            filteredTasks = filteredTasks.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));
        }
        if (assigneeFilter) {
            filteredTasks = filteredTasks.filter(t => (t.assignee || '') === assigneeFilter);
        }

        const totalCols = numCols + 1;
        const categoryHeader = document.createElement('tr');
        categoryHeader.innerHTML = `
            <td colspan="${totalCols}" class="category-header" style="background: linear-gradient(135deg, ${adjustColor(category.color, -40)}, ${category.color}) !important;">
                <span class="category-toggle${isCollapsed ? ' collapsed' : ''}" onclick="toggleCategory('${category.id}')">
                    <i data-lucide="chevron-down"></i>
                </span>
                ${category.name.toUpperCase()}
                <button class="btn-icon" onclick="editCategory('${category.id}')" title="Editar Categoria"><i data-lucide="pencil"></i></button>
                <button class="btn-icon" onclick="deleteCategory('${category.id}')" title="Excluir Categoria"><i data-lucide="trash-2"></i></button>
            </td>
        `;
        tbody.appendChild(categoryHeader);

        if (isCollapsed) return;

        filteredTasks.forEach(task => {
            const realIndex = tasks.indexOf(task);
            const row = createTaskRow(task, category.id, realIndex, numCols);
            tbody.appendChild(row);
        });
    });

    updateLegend();
    updateUndoRedoButtons();
    updateStats();

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Create a task row
function createTaskRow(task, category, index, numCols) {
    const row = document.createElement('tr');
    row.dataset.category = category;
    row.dataset.index = index;
    row.draggable = true;

    const progress = task.progress || 0;
    const isMilestone = task.milestone || false;
    const categoryConfig = categories.find(c => c.id === category);
    const color = categoryConfig ? categoryConfig.color : '#60a5fa';
    const zoomMonths = getZoomColumns(task.months);

    // Drag events
    row.addEventListener('dragstart', (e) => handleDragStart(e, category, index));
    row.addEventListener('dragover', (e) => handleDragOver(e, row));
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', (e) => handleDrop(e, category, index));

    // Task name cell
    const nameCell = document.createElement('td');
    nameCell.style.display = 'flex';
    nameCell.style.flexDirection = 'column';
    nameCell.style.alignItems = 'stretch';
    nameCell.style.gap = '4px';

    const nameRow = document.createElement('div');
    nameRow.style.display = 'flex';
    nameRow.style.justifyContent = 'space-between';
    nameRow.style.alignItems = 'center';
    nameRow.style.gap = '8px';

    // Drag handle
    const dragHandle = document.createElement('span');
    dragHandle.className = 'drag-handle';
    dragHandle.innerHTML = '<i data-lucide="grip-vertical"></i>';
    dragHandle.title = 'Arrastar para reordenar';

    const taskNameSpan = document.createElement('span');
    taskNameSpan.textContent = (isMilestone ? '◆ ' : '') + task.name;
    taskNameSpan.style.cursor = 'pointer';
    taskNameSpan.style.flex = '1';
    if (isMilestone) taskNameSpan.style.fontWeight = '700';
    taskNameSpan.addEventListener('click', () => editTask(category, index));

    // Dependency indicator
    if (task.dependency) {
        const depBadge = document.createElement('span');
        depBadge.style.cssText = 'font-size:0.7rem;background:var(--accent-purple, #a855f7);color:#fff;padding:1px 6px;border-radius:8px;margin-left:4px;';
        depBadge.textContent = '↳ dep';
        depBadge.title = 'Depende de: ' + task.dependency;
        taskNameSpan.appendChild(depBadge);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-icon';
    const deleteIcon = createIcon('trash-2');
    deleteBtn.appendChild(deleteIcon);
    deleteBtn.title = 'Excluir Tarefa';
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTask(category, index);
    });

    nameRow.appendChild(dragHandle);
    nameRow.appendChild(taskNameSpan);
    nameRow.appendChild(deleteBtn);
    nameCell.appendChild(nameRow);

    // Progress bar
    const progressContainer = document.createElement('div');
    progressContainer.className = 'task-progress-bar';
    const progressFill = document.createElement('div');
    progressFill.className = 'task-progress-fill';
    progressFill.style.width = progress + '%';
    progressContainer.appendChild(progressFill);

    const progressLabel = document.createElement('span');
    progressLabel.className = 'task-progress-text';
    progressLabel.textContent = progress + '% concluído';

    nameCell.appendChild(progressContainer);
    nameCell.appendChild(progressLabel);

    if (task.assignee) {
        const assigneeLabel = document.createElement('span');
        assigneeLabel.className = 'task-progress-text';
        assigneeLabel.style.color = 'var(--primary-blue-light)';
        assigneeLabel.textContent = '👤 ' + task.assignee;
        nameCell.appendChild(assigneeLabel);
    }

    row.appendChild(nameCell);

    // Month/zoom cells
    for (let col = 0; col < numCols; col++) {
        const cell = document.createElement('td');
        cell.classList.add('task-cell');
        cell.classList.toggle('current-month', isCurrentMonthInZoomCol(col));

        if (zoomMonths.includes(col)) {
            cell.style.background = color;
            cell.classList.add('active');
            if (isMilestone) cell.classList.add('milestone');
            cell.dataset.tooltip = `${task.name} — ${getZoomColumnRange(col)} (${progress}% concluído)`;
            cell.addEventListener('mouseenter', showTooltip);
            cell.addEventListener('mouseleave', hideTooltip);
        }

        if (zoomLevel === 12) {
            cell.addEventListener('click', () => toggleMonth(category, index, col));
        }
        row.appendChild(cell);
    }

    return row;
}

// Toggle month for a task
function toggleMonth(category, taskIndex, month) {
    const task = getYearData()[category][taskIndex];
    const monthIndex = task.months.indexOf(month);

    if (monthIndex > -1) {
        if (!confirm(`Remover ${MONTH_NAMES[month]} da tarefa "${task.name}"?`)) {
            return;
        }
        task.months.splice(monthIndex, 1);
    } else {
        task.months.push(month);
        task.months.sort((a, b) => a - b);
    }

    pushHistory();
    saveToLocalStorage();
    renderGantt();
}

// Collapse/Expand Category
function toggleCategory(categoryId) {
    if (collapsedCategories.has(categoryId)) {
        collapsedCategories.delete(categoryId);
    } else {
        collapsedCategories.add(categoryId);
    }
    renderGantt();
}

// Tooltip
function showTooltip(e) {
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.id = 'activeTooltip';
    tooltip.textContent = e.target.dataset.tooltip;
    document.body.appendChild(tooltip);

    const rect = e.target.getBoundingClientRect();
    tooltip.style.left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2 + 'px';
    tooltip.style.top = rect.top - tooltip.offsetHeight - 8 + 'px';
}

function hideTooltip() {
    const tooltip = document.getElementById('activeTooltip');
    if (tooltip) tooltip.remove();
}

// Drag & Drop
function handleDragStart(e, category, index) {
    dragState = { category, index, element: e.target.closest('tr') };
    e.target.closest('tr').classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${category}:${index}`);
}

function handleDragOver(e, row) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    row.classList.add('drag-over');
}

function handleDrop(e, targetCategory, targetIndex) {
    e.preventDefault();
    const row = e.target.closest('tr');
    if (row) row.classList.remove('drag-over');

    const source = dragState;
    if (!source.category || source.category !== targetCategory) return this;
    if (source.index === targetIndex) return this;

    const tasks = getYearData()[targetCategory];
    const [moved] = tasks.splice(source.index, 1);
    tasks.splice(targetIndex, 0, moved);

    pushHistory();
    saveToLocalStorage();
    renderAll();
}

document.addEventListener('dragend', () => {
    if (dragState.element) dragState.element.classList.remove('dragging');
    dragState = { category: null, index: null, element: null };
});

// Statistics / Dashboard
function updateStats() {
    const dash = document.getElementById('dashboard');
    if (!dash || dash.style.display === 'none') return;

    let totalTasks = 0;
    let completed = 0;
    let inProgress = 0;
    let notStarted = 0;
    const monthCounts = new Array(12).fill(0);
    let totalProgress = 0;

    const yd = getYearData();
    categories.forEach(cat => {
        const tasks = yd[cat.id] || [];
        tasks.forEach(task => {
            totalTasks++;
            const p = task.progress || 0;
            totalProgress += p;
            if (p >= 100) completed++;
            else if (p > 0) inProgress++;
            else notStarted++;

            task.months.forEach(m => monthCounts[m]++);
        });
    });

    const avgProgress = totalTasks > 0 ? Math.round(totalProgress / totalTasks) : 0;
    let busiestIdx = 0;
    monthCounts.forEach((c, i) => { if (c > monthCounts[busiestIdx]) busiestIdx = i; });

    document.getElementById('dashTotalTasks').textContent = totalTasks;
    document.getElementById('dashCompleted').textContent = completed;
    document.getElementById('dashInProgress').textContent = inProgress;
    document.getElementById('dashNotStarted').textContent = notStarted;
    document.getElementById('dashBusiestMonth').textContent = MONTH_NAMES[busiestIdx];
    document.getElementById('dashAvgProgress').textContent = avgProgress + '%';
}

// Theme Toggle
function toggleTheme() {
    isLightTheme = !isLightTheme;
    document.body.classList.toggle('light', isLightTheme);
    localStorage.setItem('gantt-theme', isLightTheme ? 'light' : 'dark');
    const icon = document.querySelector('.theme-toggle i');
    if (icon) icon.setAttribute('data-lucide', isLightTheme ? 'moon' : 'sun');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Apply saved theme
function applyTheme() {
    document.body.classList.toggle('light', isLightTheme);
    const icon = document.querySelector('.theme-toggle i');
    if (icon) icon.setAttribute('data-lucide', isLightTheme ? 'moon' : 'sun');
}

// Update assignee filter dropdown
function updateAssigneeFilter() {
    const select = document.getElementById('assigneeFilter');
    const current = select.value;
    select.innerHTML = '<option value="">Todos os responsáveis</option>';
    collectAssignees().forEach(a => {
        select.innerHTML += `<option value="${a}">${a}</option>`;
    });
    select.value = current;
}

// Import CSV
function importCsv(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const lines = event.target.result.split('\n').filter(l => l.trim());
            if (lines.length < 2) { toast('CSV vazio ou inválido.', 'error'); return; }
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            const nameIdx = headers.indexOf('nome') >= 0 ? headers.indexOf('nome') : headers.indexOf('name');
            const catIdx = headers.indexOf('categoria') >= 0 ? headers.indexOf('categoria') : headers.indexOf('category');
            const monthsIdx = headers.indexOf('meses') >= 0 ? headers.indexOf('meses') : headers.indexOf('months');
            const progressIdx = headers.indexOf('progresso') >= 0 ? headers.indexOf('progresso') : headers.indexOf('progress');
            const assigneeIdx = headers.indexOf('responsavel') >= 0 ? headers.indexOf('responsavel') : headers.indexOf('assignee');
            const milestoneIdx = headers.indexOf('marco') >= 0 ? headers.indexOf('marco') : headers.indexOf('milestone');

            if (nameIdx < 0 || catIdx < 0 || monthsIdx < 0) {
                toast('CSV precisa ter colunas: nome, categoria, meses', 'error');
                return;
            }

            const imported = {};
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',').map(c => c.trim());
                const name = cols[nameIdx];
                const cat = cols[catIdx];
                const monthsStr = cols[monthsIdx];
                if (!name || !cat) continue;

                const months = monthsStr.split(';').map(m => parseInt(m.trim())).filter(m => !isNaN(m) && m >= 0 && m < 12);
                const task = { name, months };
                if (progressIdx >= 0 && cols[progressIdx]) task.progress = parseInt(cols[progressIdx]) || 0;
                if (assigneeIdx >= 0 && cols[assigneeIdx]) task.assignee = cols[assigneeIdx];
                if (milestoneIdx >= 0 && cols[milestoneIdx]) task.milestone = cols[milestoneIdx].toLowerCase() === 'sim';

                const catId = cat.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                if (!categories.find(c => c.id === catId)) {
                    categories.push({ id: catId, name: cat, color: '#' + Math.floor(Math.random()*16777215).toString(16) });
                }
                if (!imported[catId]) imported[catId] = [];
                imported[catId].push(task);
            }

            Object.keys(ganttData).forEach(k => delete ganttData[k]);
            ganttData[currentYear] = imported;
            saveToLocalStorage();
            updateAssigneeFilter();
            renderAll();
            toast('CSV importado com sucesso!', 'success');
        } catch (error) {
            toast('Erro ao importar CSV: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// Bar Chart View
function renderBarChart() {
    const container = document.getElementById('barChartContainer');
    container.innerHTML = '';
    const yd = getYearData();
    const numCols = parseInt(zoomLevel);

    let allTasks = [];
    categories.forEach(cat => {
        const tasks = yd[cat.id] || [];
        tasks.forEach((t, i) => {
            let filtered = true;
            if (searchTerm && !t.name.toLowerCase().includes(searchTerm.toLowerCase())) filtered = false;
            if (assigneeFilter && (t.assignee || '') !== assigneeFilter) filtered = false;
            if (filtered) allTasks.push({ ...t, _cat: cat, _idx: i });
        });
    });

    categories.forEach(cat => {
        const filtered = allTasks.filter(t => t._cat.id === cat.id);
        if (filtered.length === 0) return;

        const catHeader = document.createElement('div');
        catHeader.className = 'bar-category-header';
        catHeader.style.background = `linear-gradient(135deg, ${adjustColor(cat.color, -40)}, ${cat.color})`;
        catHeader.textContent = cat.name.toUpperCase();
        container.appendChild(catHeader);

        const maxMonths = Math.max(...filtered.flatMap(t => t.months.length ? [Math.max(...t.months)] : [0]), 1);
        const extremes = filtered.flatMap(t => t.months.length ? [Math.min(...t.months), Math.max(...t.months)] : []);
        const globalMin = extremes.length ? Math.min(...extremes) : 0;
        const globalMax = extremes.length ? Math.max(...extremes) : 11;
        const range = globalMax - globalMin + 1;

        filtered.forEach(task => {
            const row = document.createElement('div');
            row.className = 'bar-row';

            const label = document.createElement('div');
            label.className = 'bar-label';
            const prefix = task.milestone ? '◆ ' : '';
            label.innerHTML = `${prefix}${task.name}` + (task.assignee ? `<span class="bar-assignee">👤 ${task.assignee}</span>` : '');
            row.appendChild(label);

            const track = document.createElement('div');
            track.className = 'bar-track';

            // Month markers
            for (let m = 0; m < numCols; m++) {
                if (zoomLevel === 12) {
                    const marker = document.createElement('div');
                    marker.className = 'bar-month-marker';
                    marker.style.left = ((m - globalMin) / range * 100) + '%';
                    track.appendChild(marker);
                    if (m % 3 === 0) {
                        const ml = document.createElement('div');
                        ml.className = 'bar-month-label';
                        ml.style.left = ((m - globalMin) / range * 100) + '%';
                        ml.textContent = MONTH_NAMES[m];
                        track.appendChild(ml);
                    }
                }
            }

            const months = task.months;
            if (months.length > 0) {
                const start = Math.min(...months);
                const end = Math.max(...months);
                const catColor = categories.find(c => c.id === task._cat.id)?.color || '#60a5fa';

                if (task.milestone && months.length === 1) {
                    const bar = document.createElement('div');
                    bar.className = 'bar-fill milestone-bar';
                    bar.style.left = ((start - globalMin) / range * 100) + '%';
                    bar.style.top = '6px';
                    bar.style.height = '16px';
                    bar.title = task.name;
                    track.appendChild(bar);
                } else {
                    const bar = document.createElement('div');
                    bar.className = 'bar-fill';
                    bar.style.background = catColor;
                    bar.style.left = ((start - globalMin) / range * 100) + '%';
                    bar.style.width = ((end - start + 1) / range * 100) + '%';
                    bar.textContent = `${getZoomColumnRange(start)} — ${getZoomColumnRange(end)}`;
                    bar.title = `${task.name} (${task.progress || 0}%)`;
                    track.appendChild(bar);
                }
            }

            row.appendChild(track);
            container.appendChild(row);
        });
    });
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('addTaskBtn').addEventListener('click', () => openTaskModal());
    document.getElementById('addCategoryBtn').addEventListener('click', () => openCategoryModal());
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('exportPngBtn').addEventListener('click', exportPng);
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', importData);
    document.getElementById('importCsvBtn').addEventListener('click', () => document.getElementById('importCsvFile').click());
    document.getElementById('importCsvFile').addEventListener('change', importCsv);
    document.getElementById('shareBtn').addEventListener('click', shareUrl);
    document.getElementById('undoBtn').addEventListener('click', undo);
    document.getElementById('redoBtn').addEventListener('click', redo);
    document.getElementById('cancelBtn').addEventListener('click', closeTaskModal);

    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    // Year selector
    document.getElementById('yearSelect').addEventListener('change', (e) => {
        currentYear = e.target.value;
        document.getElementById('yearDisplay').textContent = currentYear;
        if (!ganttData[currentYear]) ganttData[currentYear] = {};
        saveToLocalStorage();
        renderAll();
    });
    document.getElementById('yearSelect').value = currentYear;
    document.getElementById('yearDisplay').textContent = currentYear;

    // View toggle (segmented: table / bar chart)
    function setViewMode(mode) {
        viewMode = mode;
        document.getElementById('viewTableBtn').classList.toggle('active', mode === 'table');
        document.getElementById('viewBarBtn').classList.toggle('active', mode === 'bar');
        document.getElementById('ganttWrapper').style.display = mode === 'bar' ? 'none' : '';
        document.getElementById('barChartView').style.display = mode === 'bar' ? '' : 'none';
        renderAll();
    }
    document.getElementById('viewTableBtn').addEventListener('click', () => setViewMode('table'));
    document.getElementById('viewBarBtn').addEventListener('click', () => setViewMode('bar'));

    // Data dropdown menu
    const dataMenuBtn = document.getElementById('dataMenuBtn');
    const dataMenu = document.getElementById('dataMenu');
    dataMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dataMenu.classList.toggle('open');
        dataMenuBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
    document.addEventListener('click', () => {
        dataMenu.classList.remove('open');
        dataMenuBtn.setAttribute('aria-expanded', 'false');
    });
    dataMenu.addEventListener('click', (e) => e.stopPropagation());

    // Assignee filter
    document.getElementById('assigneeFilter').addEventListener('change', (e) => {
        assigneeFilter = e.target.value;
        renderAll();
    });

    // Dashboard toggle
    document.getElementById('statsBtn').addEventListener('click', () => {
        const dash = document.getElementById('dashboard');
        const isVisible = dash.style.display !== 'none';
        dash.style.display = isVisible ? 'none' : 'grid';
        if (!isVisible) updateStats();
    });

    // Zoom
    document.getElementById('zoomSelect').addEventListener('change', (e) => {
        zoomLevel = parseInt(e.target.value);
        renderAll();
    });

    // Milestone checkbox
    document.getElementById('taskMilestone').addEventListener('change', (e) => {
        const depGroup = document.getElementById('dependencyGroup');
        depGroup.style.display = e.target.checked ? 'none' : '';
        document.getElementById('taskProgress').value = e.target.checked ? 100 : 0;
        document.getElementById('progressValue').textContent = e.target.checked ? '100%' : '0%';
    });

    const taskForm = document.getElementById('taskForm');
    taskForm.addEventListener('submit', saveTask);

    const deleteTaskBtn = document.getElementById('deleteTaskBtn');
    deleteTaskBtn.addEventListener('click', () => {
        if (currentEditingCategory !== null && currentEditingIndex !== null) {
            closeTaskModal();
            deleteTask(currentEditingCategory, currentEditingIndex);
        }
    });

    document.getElementById('categoryCancelBtn').addEventListener('click', closeCategoryModal);
    document.getElementById('categoryForm').addEventListener('submit', saveCategory);

    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
        searchTerm = e.target.value;
        renderAll();
    });

    const taskProgress = document.getElementById('taskProgress');
    const progressValue = document.getElementById('progressValue');
    taskProgress.addEventListener('input', () => {
        progressValue.textContent = taskProgress.value + '%';
    });

    const taskModal = document.getElementById('taskModal');
    taskModal.addEventListener('click', (e) => { if (e.target === taskModal) closeTaskModal(); });

    const categoryModal = document.getElementById('categoryModal');
    categoryModal.addEventListener('click', (e) => { if (e.target === categoryModal) closeCategoryModal(); });

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
        if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
        if (e.ctrlKey && e.key === 'f') { e.preventDefault(); searchInput.focus(); }
        if (e.ctrlKey && e.key === 'd') { e.preventDefault();
            const dash = document.getElementById('dashboard');
            dash.style.display = dash.style.display === 'none' ? 'grid' : 'none';
            if (dash.style.display !== 'none') updateStats();
        }
        if (e.key === 'Escape') { closeTaskModal(); closeCategoryModal(); }
        if (e.key === 'n' && !e.ctrlKey && !e.metaKey && document.activeElement === document.body) { openTaskModal(); }
    });

    applyTheme();
}

// Open modal for adding/editing task
function openTaskModal(category = null, index = null) {
    const modal = document.getElementById('taskModal');
    const modalTitle = document.getElementById('modalTitle');
    const taskName = document.getElementById('taskName');
    const deleteTaskBtn = document.getElementById('deleteTaskBtn');
    const taskProgress = document.getElementById('taskProgress');
    const progressValue = document.getElementById('progressValue');
    const taskMilestone = document.getElementById('taskMilestone');
    const taskAssignee = document.getElementById('taskAssignee');
    const depGroup = document.getElementById('dependencyGroup');
    const taskDependency = document.getElementById('taskDependency');
    updateCategoryOptions();
    const taskCategory = document.getElementById('taskCategory');

    document.getElementById('taskForm').reset();

    // Build dependency options (all tasks)
    taskDependency.innerHTML = '<option value="">Nenhuma</option>';
    categories.forEach(cat => {
        const tasks = getYearData()[cat.id] || [];
        tasks.forEach((t, i) => {
            const label = `[${cat.name}] ${t.name}`;
            const val = `${cat.id}::${i}`;
            taskDependency.innerHTML += `<option value="${val}">${label}</option>`;
        });
    });

    if (category !== null && index !== null) {
        currentEditingCategory = category;
        currentEditingIndex = index;
        const task = getYearData()[category][index];

        modalTitle.textContent = 'Editar Tarefa';
        taskName.value = task.name;
        taskCategory.value = category;
        taskProgress.value = task.progress || 0;
        progressValue.textContent = (task.progress || 0) + '%';
        taskMilestone.checked = task.milestone || false;
        taskAssignee.value = task.assignee || '';
        depGroup.style.display = task.milestone ? 'none' : '';
        if (task.milestone) {
            taskProgress.value = 100;
            progressValue.textContent = '100%';
        }
        if (task.dependency) taskDependency.value = task.dependency;
        deleteTaskBtn.style.display = 'block';

        task.months.forEach(month => {
            document.getElementById(`month-${month}`).checked = true;
        });
    } else {
        currentEditingCategory = null;
        currentEditingIndex = null;
        modalTitle.textContent = 'Adicionar Nova Tarefa';
        taskProgress.value = 0;
        progressValue.textContent = '0%';
        depGroup.style.display = '';
        deleteTaskBtn.style.display = 'none';
    }

    modal.classList.add('active');
}

// Close modal
function closeTaskModal() {
    const modal = document.getElementById('taskModal');
    modal.classList.remove('active');
    currentEditingCategory = null;
    currentEditingIndex = null;
}

// Edit task
function editTask(category, index) {
    openTaskModal(category, index);
}

// Delete task
function deleteTask(category, index) {
    const task = getYearData()[category][index];

    if (confirm(`Tem certeza que deseja excluir a tarefa "${task.name}"?`)) {
        getYearData()[category].splice(index, 1);
        pushHistory();
        saveToLocalStorage();
        renderGantt();
    }
}

// Save task
function saveTask(e) {
    e.preventDefault();

    const taskName = document.getElementById('taskName').value;
    const taskCategory = document.getElementById('taskCategory').value;
    const taskProgress = parseInt(document.getElementById('taskProgress').value);
    const isMilestone = document.getElementById('taskMilestone').checked;
    const taskDependency = document.getElementById('taskDependency').value;
    const taskAssignee = document.getElementById('taskAssignee').value.trim();
    const months = [];

    for (let i = 0; i < 12; i++) {
        if (document.getElementById(`month-${i}`).checked) {
            months.push(i);
        }
    }

    const task = {
        name: taskName,
        months: months,
        progress: isMilestone ? 100 : taskProgress,
        milestone: isMilestone
    };
    if (taskDependency) task.dependency = taskDependency;
    if (taskAssignee) task.assignee = taskAssignee;

    if (currentEditingCategory !== null && currentEditingIndex !== null) {
        getYearData()[currentEditingCategory][currentEditingIndex] = task;

        if (currentEditingCategory !== taskCategory) {
            getYearData()[currentEditingCategory].splice(currentEditingIndex, 1);
            getYearData()[taskCategory].push(task);
        }
    } else {
        getYearData()[taskCategory].push(task);
    }

    pushHistory();
    saveToLocalStorage();
    renderGantt();
    closeTaskModal();
}

// Export data to JSON
function exportData() {
    const exportObj = { ganttData, categories };
    const dataStr = JSON.stringify(exportObj, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'gantt-2026.json';
    link.click();

    URL.revokeObjectURL(url);
}

// Export chart as PNG
function exportPng() {
    const wrapper = document.querySelector('.gantt-wrapper');
    if (typeof html2canvas === 'undefined') {
        toast('Biblioteca de exportação não carregada. Verifique sua conexão.', 'error');
        return;
    }
    html2canvas(wrapper, {
        backgroundColor: '#111827',
        scale: 2,
        useCORS: true
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = 'gantt-2026.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    }).catch(err => {
        toast('Erro ao exportar PNG: ' + err.message, 'error');
    });
}

// Import data from JSON
function importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const importedData = JSON.parse(event.target.result);

            // Validate data structure
            if (!importedData || typeof importedData !== 'object') {
                toast('Formato de arquivo inválido: o arquivo não contém um objeto JSON válido.', 'error');
                return;
            }

            if (!importedData.categories || !Array.isArray(importedData.categories)) {
                toast('Formato de arquivo inválido: campo "categories" ausente ou inválido.', 'error');
                return;
            }

            for (const cat of importedData.categories) {
                if (!cat.id || !cat.name || !cat.color) {
                    toast('Formato de arquivo inválido: categoria sem id, name ou color.', 'error');
                    return;
                }
            }

            if (!importedData.ganttData || typeof importedData.ganttData !== 'object') {
                toast('Formato de arquivo inválido: campo "ganttData" ausente ou inválido.', 'error');
                return;
            }

            for (const [key, tasks] of Object.entries(importedData.ganttData)) {
                if (!Array.isArray(tasks)) {
                    toast(`Formato de arquivo inválido: dados da categoria "${key}" não são um array.`, 'error');
                    return;
                }
                for (const task of tasks) {
                    if (!task.name || !Array.isArray(task.months)) {
                        toast(`Formato de arquivo inválido: tarefa sem name ou months na categoria "${key}".`, 'error');
                        return;
                    }
                }
            }

            Object.keys(ganttData).forEach(key => delete ganttData[key]);
            Object.assign(ganttData, importedData.ganttData);
            categories.length = 0;
            categories.push(...importedData.categories);
            renderGantt();
            toast('Dados importados com sucesso!', 'success');
        } catch (error) {
            toast('Erro ao importar arquivo: ' + error.message, 'error');
        }
    };

    reader.readAsText(file);
    e.target.value = ''; // Reset file input
}

// Category Management Functions

function openCategoryModal(categoryId = null) {
    const modal = document.getElementById('categoryModal');
    const modalTitle = document.getElementById('categoryModalTitle');
    const categoryNameInput = document.getElementById('categoryName');
    const categoryColorInput = document.getElementById('categoryColor');

    document.getElementById('categoryForm').reset();

    if (categoryId) {
        currentEditingCategoryId = categoryId;
        const category = categories.find(c => c.id === categoryId);

        modalTitle.textContent = 'Editar Categoria';
        categoryNameInput.value = category.name;
        categoryColorInput.value = category.color;
    } else {
        currentEditingCategoryId = null;
        modalTitle.textContent = 'Adicionar Nova Categoria';
        categoryColorInput.value = '#' + Math.floor(Math.random() * 16777215).toString(16);
    }

    modal.classList.add('active');
}

function closeCategoryModal() {
    const modal = document.getElementById('categoryModal');
    modal.classList.remove('active');
    currentEditingCategoryId = null;
}

function saveCategory(e) {
    e.preventDefault();

    const categoryName = document.getElementById('categoryName').value;
    const categoryColor = document.getElementById('categoryColor').value;

    if (currentEditingCategoryId) {
        // Edit existing category
        const category = categories.find(c => c.id === currentEditingCategoryId);
        category.name = categoryName;
        category.color = categoryColor;
    } else {
        // Add new category
        const categoryId = categoryName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

        // Check if ID already exists
        if (categories.find(c => c.id === categoryId)) {
            toast('Uma categoria com este nome já existe!', 'error');
            return;
        }

        categories.push({
            id: categoryId,
            name: categoryName,
            color: categoryColor
        });

        getYearData()[categoryId] = [];
    }

    pushHistory();
    saveToLocalStorage();
    renderGantt();
    closeCategoryModal();
}

function editCategory(categoryId) {
    openCategoryModal(categoryId);
}

function deleteCategory(categoryId) {
    if (categories.length <= 1) {
        toast('Você deve ter pelo menos uma categoria!', 'error');
        return;
    }

    if (confirm(`Tem certeza que deseja excluir a categoria "${categories.find(c => c.id === categoryId).name}"? Todas as tarefas desta categoria serão perdidas.`)) {
        const index = categories.findIndex(c => c.id === categoryId);
        categories.splice(index, 1);
        delete getYearData()[categoryId];
        collapsedCategories.delete(categoryId);
        pushHistory();
        saveToLocalStorage();
        renderGantt();
    }
}

function updateCategoryOptions() {
    const select = document.getElementById('taskCategory');
    select.innerHTML = '';

    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        select.appendChild(option);
    });
}

function updateLegend() {
    const legend = document.querySelector('.legend');
    legend.innerHTML = '';

    categories.forEach(category => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `
            <div class="legend-color" style="background: ${category.color};"></div>
            <span>${category.name}</span>
        `;
        legend.appendChild(item);
    });
}

function adjustColor(color, amount) {
    const clamp = (val) => Math.min(Math.max(val, 0), 255);
    const num = parseInt(color.replace('#', ''), 16);
    const r = clamp((num >> 16) + amount);
    const g = clamp(((num >> 8) & 0x00FF) + amount);
    const b = clamp((num & 0x0000FF) + amount);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initGantt);
