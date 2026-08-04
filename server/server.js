const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://gantt:gantt@localhost:5432/gantt_2026',
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..')));

// =============================================================================
// Health check
// =============================================================================
app.get('/api/health', async (_req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'connected' });
    } catch (err) {
        res.status(500).json({ status: 'error', database: 'disconnected', error: err.message });
    }
});

// =============================================================================
// Years
// =============================================================================
app.get('/api/years', async (_req, res) => {
    try {
        const result = await pool.query('SELECT * FROM years ORDER BY year_value');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/years', async (req, res) => {
    const { year_value } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO years (year_value) VALUES ($1) ON CONFLICT (year_value) DO NOTHING RETURNING *',
            [year_value]
        );
        res.status(201).json(result.rows[0] || { message: 'Ano já existe', year_value });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// =============================================================================
// Categories
// =============================================================================
app.get('/api/categories', async (_req, res) => {
    try {
        const result = await pool.query('SELECT * FROM categories ORDER BY sort_order, name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/categories', async (req, res) => {
    const { slug, name, color, sort_order } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO categories (slug, name, color, sort_order) VALUES ($1, $2, $3, $4) RETURNING *',
            [slug, name, color || '#00f1fe', sort_order || 0]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/categories/:id', async (req, res) => {
    const { id } = req.params;
    const { name, color, sort_order } = req.body;
    try {
        const result = await pool.query(
            `UPDATE categories SET name = COALESCE($1, name), color = COALESCE($2, color),
             sort_order = COALESCE($3, sort_order) WHERE id = $4 RETURNING *`,
            [name, color, sort_order, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Categoria não encontrada' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/categories/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM categories WHERE id = $1', [id]);
        res.json({ message: 'Categoria excluída' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// =============================================================================
// Tasks — GET all for a year (with months + categories structure)
// =============================================================================
app.get('/api/years/:year/tasks', async (req, res) => {
    const { year } = req.params;
    try {
        const result = await pool.query(`
            SELECT
                t.id, t.name, t.progress, t.is_milestone, t.assignee, t.sort_order,
                t.category_id, c.slug AS category_slug, c.name AS category_name, c.color AS category_color,
                COALESCE(
                    ARRAY_AGG(tm.month_num ORDER BY tm.month_num) FILTER (WHERE tm.month_num IS NOT NULL),
                    ARRAY[]::INTEGER[]
                ) AS months
            FROM tasks t
            JOIN years y ON t.year_id = y.id
            JOIN categories c ON t.category_id = c.id
            LEFT JOIN task_months tm ON tm.task_id = t.id
            WHERE y.year_value = $1
            GROUP BY t.id, c.id
            ORDER BY c.sort_order, t.sort_order, t.id
        `, [year]);

        const categories = await pool.query('SELECT * FROM categories ORDER BY sort_order');
        const ganttData = {};
        categories.rows.forEach(cat => { ganttData[cat.slug] = []; });

        result.rows.forEach(row => {
            ganttData[row.category_slug].push({
                id: row.id,
                name: row.name,
                months: row.months,
                progress: row.progress,
                milestone: row.is_milestone,
                assignee: row.assignee || undefined
            });
        });

        res.json({
            ganttData: { [year]: ganttData },
            categories: categories.rows,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =============================================================================
// Tasks — CRUD
// =============================================================================
app.post('/api/years/:year/tasks', async (req, res) => {
    const { year } = req.params;
    const { name, category_slug, months, progress, milestone, assignee } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let yearRow = await client.query('SELECT id FROM years WHERE year_value = $1', [year]);
        if (yearRow.rows.length === 0) {
            yearRow = await client.query('INSERT INTO years (year_value) VALUES ($1) RETURNING id', [year]);
        }

        let catRow = await client.query('SELECT id FROM categories WHERE slug = $1', [category_slug]);
        if (catRow.rows.length === 0) throw new Error(`Categoria "${category_slug}" não encontrada`);

        const maxOrder = await client.query(
            'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM tasks WHERE year_id = $1 AND category_id = $2',
            [yearRow.rows[0].id, catRow.rows[0].id]
        );

        const taskResult = await client.query(
            `INSERT INTO tasks (year_id, category_id, name, progress, is_milestone, assignee, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [yearRow.rows[0].id, catRow.rows[0].id, name,
             progress || 0, milestone || false, assignee || null, maxOrder.rows[0].next_order]
        );

        const taskId = taskResult.rows[0].id;
        if (months && months.length > 0) {
            const values = months.map((m, i) => `($1, $${i + 2})`).join(', ');
            await client.query(`INSERT INTO task_months (task_id, month_num) VALUES ${values}`, [taskId, ...months]);
        }

        await client.query('COMMIT');
        res.status(201).json(taskResult.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.put('/api/tasks/:id', async (req, res) => {
    const { id } = req.params;
    const { name, progress, milestone, assignee, months, category_slug } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let categoryId = null;
        if (category_slug) {
            const cat = await client.query('SELECT id FROM categories WHERE slug = $1', [category_slug]);
            if (cat.rows.length > 0) categoryId = cat.rows[0].id;
        }

        const result = await client.query(
            `UPDATE tasks SET
                name = COALESCE($1, name),
                progress = COALESCE($2, progress),
                is_milestone = COALESCE($3, is_milestone),
                assignee = COALESCE($4, assignee),
                category_id = COALESCE($5, category_id)
             WHERE id = $6 RETURNING *`,
            [name, progress, milestone, assignee || null, categoryId, id]
        );

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Tarefa não encontrada' });
        }

        if (months !== undefined) {
            await client.query('DELETE FROM task_months WHERE task_id = $1', [id]);
            if (months.length > 0) {
                const values = months.map((m, i) => `($1, $${i + 2})`).join(', ');
                await client.query(`INSERT INTO task_months (task_id, month_num) VALUES ${values}`, [id, ...months]);
            }
        }

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.delete('/api/tasks/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
        res.json({ message: 'Tarefa excluída' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// =============================================================================
// Reorder
// =============================================================================
app.put('/api/tasks/:id/reorder', async (req, res) => {
    const { id } = req.params;
    const { direction } = req.body;
    try {
        const current = await pool.query('SELECT category_id, sort_order FROM tasks WHERE id = $1', [id]);
        if (current.rows.length === 0) return res.status(404).json({ error: 'Tarefa não encontrada' });

        const { category_id, sort_order } = current.rows[0];
        const targetOrder = sort_order + direction;

        await pool.query('UPDATE tasks SET sort_order = sort_order + $1 WHERE id = $2', [-direction, id]);
        await pool.query('UPDATE tasks SET sort_order = $1 WHERE id = $2', [targetOrder, id]);

        res.json({ message: 'Ordem atualizada' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// =============================================================================
// Migrate — import JSON from localStorage
// =============================================================================
app.post('/api/migrate', async (req, res) => {
    const { ganttData, categories: catsData } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Clear existing
        await client.query('DELETE FROM dependencies');
        await client.query('DELETE FROM task_months');
        await client.query('DELETE FROM tasks');
        await client.query('DELETE FROM categories');
        await client.query('DELETE FROM years');

        // Insert years
        const yearsSet = new Set(Object.keys(ganttData));
        const yearMap = {};
        for (const yr of yearsSet) {
            const r = await client.query('INSERT INTO years (year_value) VALUES ($1) RETURNING id', [parseInt(yr)]);
            yearMap[yr] = r.rows[0].id;
        }

        // Insert categories
        const catMap = {};
        for (let i = 0; i < catsData.length; i++) {
            const cat = catsData[i];
            const r = await client.query(
                'INSERT INTO categories (slug, name, color, sort_order) VALUES ($1, $2, $3, $4) RETURNING id',
                [cat.id, cat.name, cat.color, i]
            );
            catMap[cat.id] = r.rows[0].id;
        }

        // Insert tasks + months
        let taskCount = 0;
        for (const [yearStr, yearData] of Object.entries(ganttData)) {
            const yearId = yearMap[yearStr];
            for (const [catSlug, tasks] of Object.entries(yearData)) {
                const categoryId = catMap[catSlug];
                if (!categoryId) continue;

                for (let i = 0; i < tasks.length; i++) {
                    const t = tasks[i];
                    const tr = await client.query(
                        `INSERT INTO tasks (year_id, category_id, name, progress, is_milestone, assignee, sort_order)
                         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                        [yearId, categoryId, t.name, t.progress || 0, t.milestone || false, t.assignee || null, i]
                    );
                    const taskId = tr.rows[0].id;

                    if (t.months && t.months.length > 0) {
                        const placeholders = t.months.map((_, idx) => `($1, $${idx + 2})`).join(', ');
                        await client.query(
                            `INSERT INTO task_months (task_id, month_num) VALUES ${placeholders}`,
                            [taskId, ...t.months]
                        );
                    }
                    taskCount++;
                }
            }
        }

        await client.query('COMMIT');
        res.json({
            message: 'Migração concluída com sucesso',
            years: Object.keys(yearMap).length,
            categories: Object.keys(catMap).length,
            tasks: taskCount
        });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// =============================================================================
// Projects — CRUD
// =============================================================================
app.get('/api/projects', async (req, res) => {
    const { type, department, company, status, priority, assignee, search } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (type) { conditions.push(`type = $${idx++}`); params.push(type); }
    if (department) { conditions.push(`department = $${idx++}`); params.push(department); }
    if (company) { conditions.push(`company = $${idx++}`); params.push(company); }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    if (priority) { conditions.push(`priority = $${idx++}`); params.push(priority); }
    if (assignee) { conditions.push(`assignee ILIKE $${idx++}`); params.push(`%${assignee}%`); }
    if (search) { conditions.push(`(name ILIKE $${idx} OR description ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    try {
        const result = await pool.query(
            `SELECT * FROM projects ${where} ORDER BY priority DESC, created_at DESC`,
            params
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/projects/stats', async (_req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'planning') AS planning,
                COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
                COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                COUNT(*) FILTER (WHERE status = 'on_hold') AS on_hold,
                COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
                COUNT(*) FILTER (WHERE type = 'data') AS data,
                COUNT(*) FILTER (WHERE type = 'ai') AS ai,
                COUNT(*) FILTER (WHERE type = 'geo') AS geo,
                COUNT(*) FILTER (WHERE type = 'analytics') AS analytics
            FROM projects
        `);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/projects/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Projeto não encontrado' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/projects', async (req, res) => {
    const { name, description, type, department, company, assignee, requester,
            status, priority, start_date, end_date, budget, tags } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO projects
                (name, description, type, department, company, assignee, requester,
                 status, priority, start_date, end_date, budget, tags)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING *`,
            [name, description || null, type || 'data', department || null, company || null,
             assignee || null, requester || null, status || 'planning', priority || 'medium',
             start_date || null, end_date || null, budget || null, tags || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/projects/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description, type, department, company, assignee, requester,
            status, priority, start_date, end_date, budget, tags } = req.body;
    try {
        const result = await pool.query(
            `UPDATE projects SET
                name = COALESCE($1, name),
                description = COALESCE($2, description),
                type = COALESCE($3, type),
                department = COALESCE($4, department),
                company = COALESCE($5, company),
                assignee = COALESCE($6, assignee),
                requester = COALESCE($7, requester),
                status = COALESCE($8, status),
                priority = COALESCE($9, priority),
                start_date = COALESCE($10, start_date),
                end_date = COALESCE($11, end_date),
                budget = COALESCE($12, budget),
                tags = COALESCE($13, tags)
             WHERE id = $14 RETURNING *`,
            [name, description, type, department, company, assignee, requester,
             status, priority, start_date, end_date, budget, tags, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Projeto não encontrado' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/projects/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM projects WHERE id = $1', [id]);
        res.json({ message: 'Projeto excluído' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// =============================================================================
// Serve frontend
// =============================================================================
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Endpoint não encontrado' });
    }
    const indexPath = path.join(__dirname, '..', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).json({ error: 'Frontend não encontrado' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📋 API: http://localhost:${PORT}/api/health`);
});
