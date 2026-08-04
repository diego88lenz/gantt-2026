/**
 * Gantt 2026 — API Client
 * Camada de abstração que detecta se o backend está disponível
 * e sincroniza com PostgreSQL via REST. Se offline, usa localStorage.
 */
const GanttAPI = (() => {
    const BASE_URL = '';
    const API_PREFIX = '/api';
    let online = false;
    let checking = false;

    async function request(endpoint, options = {}) {
        const url = `${BASE_URL}${API_PREFIX}${endpoint}`;
        const config = {
            headers: { 'Content-Type': 'application/json' },
            ...options,
        };
        if (config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }
        const response = await fetch(url, config);
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: response.statusText }));
            throw new Error(error.error || `HTTP ${response.status}`);
        }
        return response.json();
    }

    async function checkHealth() {
        if (checking) return false;
        checking = true;
        try {
            const result = await request('/health', { signal: AbortSignal.timeout(2000) });
            online = result.status === 'ok' && result.database === 'connected';
        } catch {
            online = false;
        }
        checking = false;
        return online;
    }

    function isOnline() {
        return online;
    }

    // ====== Years ======
    async function getYears() {
        return request('/years');
    }

    // ====== Categories ======
    async function getCategories() {
        return request('/categories');
    }

    async function createCategory(data) {
        return request('/categories', { method: 'POST', body: data });
    }

    async function updateCategory(id, data) {
        return request(`/categories/${id}`, { method: 'PUT', body: data });
    }

    async function deleteCategory(id) {
        return request(`/categories/${id}`, { method: 'DELETE' });
    }

    // ====== Tasks ======
    async function getYearTasks(year) {
        return request(`/years/${year}/tasks`);
    }

    async function createTask(year, data) {
        return request(`/years/${year}/tasks`, { method: 'POST', body: data });
    }

    async function updateTask(id, data) {
        return request(`/tasks/${id}`, { method: 'PUT', body: data });
    }

    async function deleteTask(id) {
        return request(`/tasks/${id}`, { method: 'DELETE' });
    }

    async function reorderTask(id, direction) {
        return request(`/tasks/${id}/reorder`, { method: 'PUT', body: { direction } });
    }

    // ====== Migration ======
    async function migrate(data) {
        return request('/migrate', { method: 'POST', body: data });
    }

    return {
        checkHealth,
        isOnline,
        getYears,
        getCategories,
        createCategory,
        updateCategory,
        deleteCategory,
        getYearTasks,
        createTask,
        updateTask,
        deleteTask,
        reorderTask,
        migrate,
    };
})();
