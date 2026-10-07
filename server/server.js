const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { DOCUMENT_TYPES, getDocumentType, buildDocument } = require('./document-templates');
// Renderizador compartilhado (mesmo arquivo usado pelo front no preview)
const { renderMarkdown } = require(path.join(__dirname, '..', 'markdown.js'));

const app = express();
const PORT = process.env.PORT || 3001;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || '[CONNSTRING_REDACTED]localhost:5432/gantt_2026',
});

// =============================================================================
// Upload de arquivos dos projetos
// =============================================================================
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        // Corrige nomes em pt-BR que chegam como latin1
        const original = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const safe = original.replace(/[^\w.\-]+/g, '_').slice(-120);
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${unique}-${safe}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024, files: 10 }, // 25 MB por arquivo, 10 por vez
});

function decodeOriginalName(name) {
    try {
        return Buffer.from(name, 'latin1').toString('utf8');
    } catch {
        return name;
    }
}

// Escapa valores usados no HTML da exportação .doc (Word)
function escapeForDoc(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(UPLOAD_DIR));

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
// Monta a cláusula WHERE + parâmetros a partir dos filtros da query string.
// Compartilhado entre a listagem e as estatísticas, para que o dashboard
// reflita exatamente os mesmos filtros aplicados na tabela.
function buildProjectFilters(query) {
    const { type, category, department, company, status, priority, assignee, search } = query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (type) { conditions.push(`type = $${idx++}`); params.push(type); }
    if (category) { conditions.push(`category = $${idx++}`); params.push(category); }
    if (department) { conditions.push(`department = $${idx++}`); params.push(department); }
    if (company) { conditions.push(`company = $${idx++}`); params.push(company); }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    if (priority) { conditions.push(`priority = $${idx++}`); params.push(priority); }
    if (assignee) { conditions.push(`assignee ILIKE $${idx++}`); params.push(`%${assignee}%`); }
    if (search) { conditions.push(`(name ILIKE $${idx} OR description ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

    return {
        where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
        params,
    };
}

// A contagem de documentos vem de uma subconsulta. Se a migração de documentos
// ainda não tiver sido aplicada, desligamos a coluna e seguimos com a consulta
// simples — assim a listagem de projetos nunca quebra por causa disso.
let documentsTableReady = true;

app.get('/api/projects', async (req, res) => {
    const { where, params } = buildProjectFilters(req.query);
    const order = 'ORDER BY priority DESC, created_at DESC';
    try {
        if (documentsTableReady) {
            try {
                const result = await pool.query(
                    `SELECT projects.*,
                            (SELECT COUNT(*)::int FROM project_documents d
                             WHERE d.project_id = projects.id) AS document_count
                     FROM projects ${where} ${order}`,
                    params
                );
                return res.json(result.rows);
            } catch (err) {
                if (!/project_documents/.test(err.message)) throw err;
                documentsTableReady = false;
                console.warn('⚠️  Tabela project_documents ausente — contagem de documentos desativada.');
            }
        }
        const result = await pool.query(`SELECT projects.* FROM projects ${where} ${order}`, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Aceita os mesmos filtros de /api/projects — sem filtros, devolve o portfólio completo
app.get('/api/projects/stats', async (req, res) => {
    const { where, params } = buildProjectFilters(req.query);
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
                COUNT(*) FILTER (WHERE type = 'analytics') AS analytics,
                COUNT(*) FILTER (WHERE priority = 'critical') AS critical
            FROM projects ${where}
        `, params);
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
            status, priority, start_date, end_date, budget, tags, url, category, github_repo } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO projects
                (name, description, type, department, company, assignee, requester,
                 status, priority, start_date, end_date, budget, tags, url, category, github_repo)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             RETURNING *`,
            [name, description || null, type || 'data', department || null, company || null,
             assignee || null, requester || null, status || 'planning', priority || 'medium',
             start_date || null, end_date || null, budget || null, tags || null, url || null, category || null,
             github_repo || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/projects/:id', async (req, res) => {
    const { id } = req.params;
    const updates = [];
    const values = [];
    let idx = 1;

    const fields = ['name', 'description', 'type', 'department', 'company', 'assignee',
        'requester', 'status', 'priority', 'start_date', 'end_date', 'budget', 'tags', 'url', 'category', 'github_repo'];

    fields.forEach(f => {
        if (req.body.hasOwnProperty(f)) {
            updates.push(`${f} = $${idx++}`);
            values.push(req.body[f]);
        }
    });

    if (updates.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

    values.push(id);
    try {
        const result = await pool.query(
            `UPDATE projects SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
            values
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
        // Remove os arquivos físicos antes de excluir o projeto (cascade remove as linhas)
        const files = await pool.query('SELECT filename FROM project_files WHERE project_id = $1', [id]);
        await pool.query('DELETE FROM projects WHERE id = $1', [id]);
        await Promise.all(files.rows.map(f =>
            fs.promises.unlink(path.join(UPLOAD_DIR, f.filename)).catch(() => {})
        ));
        res.json({ message: 'Projeto excluído' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// =============================================================================
// Project Files — anexos dos projetos
// =============================================================================
app.get('/api/projects/:id/files', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            `SELECT id, project_id, original_name, mime_type, size_bytes, uploaded_at
             FROM project_files WHERE project_id = $1 ORDER BY uploaded_at DESC, id DESC`,
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/projects/:id/files', upload.array('files', 10), async (req, res) => {
    const { id } = req.params;
    const files = req.files || [];

    if (files.length === 0) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const project = await client.query('SELECT id FROM projects WHERE id = $1', [id]);
        if (project.rows.length === 0) {
            await client.query('ROLLBACK');
            await Promise.all(files.map(f => fs.promises.unlink(f.path).catch(() => {})));
            return res.status(404).json({ error: 'Projeto não encontrado' });
        }

        const inserted = [];
        for (const file of files) {
            const original = decodeOriginalName(file.originalname);
            const r = await client.query(
                `INSERT INTO project_files (project_id, filename, original_name, mime_type, size_bytes)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id, project_id, original_name, mime_type, size_bytes, uploaded_at`,
                [id, file.filename, original, file.mimetype || null, file.size || 0]
            );
            inserted.push(r.rows[0]);
        }

        await client.query('COMMIT');
        res.status(201).json(inserted);
    } catch (err) {
        await client.query('ROLLBACK');
        await Promise.all(files.map(f => fs.promises.unlink(f.path).catch(() => {})));
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.get('/api/files/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM project_files WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Arquivo não encontrado' });

        const file = result.rows[0];
        const filePath = path.join(UPLOAD_DIR, file.filename);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo físico não encontrado' });

        res.download(filePath, file.original_name);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/files/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM project_files WHERE id = $1 RETURNING filename', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Arquivo não encontrado' });

        const filePath = path.join(UPLOAD_DIR, result.rows[0].filename);
        fs.promises.unlink(filePath).catch(() => {});
        res.json({ message: 'Arquivo excluído' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// =============================================================================
// Project Documents — brief, especificação, planejamento, etc.
// O catálogo de tipos vive em document-templates.js (fonte única) e é validado
// aqui, para que o catálogo e os builders não divirjam.
// =============================================================================

// Catálogo de tipos disponíveis (estático, vem do código)
app.get('/api/document-types', (_req, res) => {
    res.json(DOCUMENT_TYPES);
});

// Busca o projeto ou responde 404. Retorna null quando já respondeu.
async function fetchProjectOr404(id, res) {
    const r = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);
    if (r.rows.length === 0) {
        res.status(404).json({ error: 'Projeto não encontrado' });
        return null;
    }
    return r.rows[0];
}

// Lista os documentos de um projeto (sem o conteúdo, que é grande)
app.get('/api/projects/:id/documents', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            `SELECT d.id, d.project_id, d.type_slug, d.title, d.current_version, d.status,
                    d.generated_by, d.created_at, d.updated_at,
                    LENGTH(d.content) AS content_length
             FROM project_documents d
             WHERE d.project_id = $1
             ORDER BY d.updated_at DESC, d.id DESC`,
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Gera um documento a partir do template e grava a versão 1
app.post('/api/projects/:id/documents', async (req, res) => {
    const { id } = req.params;
    const { type_slug, author } = req.body;

    const type = getDocumentType(type_slug);
    if (!type) return res.status(400).json({ error: `Tipo de documento inválido: ${type_slug}` });

    const client = await pool.connect();
    try {
        const project = await fetchProjectOr404(id, res);
        if (!project) return;

        // Já existe documento deste tipo? Então o caminho é regenerar.
        const existing = await client.query(
            'SELECT id FROM project_documents WHERE project_id = $1 AND type_slug = $2',
            [id, type_slug]
        );
        if (existing.rows.length > 0) {
            return res.status(409).json({
                error: 'Já existe um documento deste tipo para o projeto',
                document_id: existing.rows[0].id,
            });
        }

        const { title, content } = buildDocument(type_slug, project);

        await client.query('BEGIN');
        const doc = await client.query(
            `INSERT INTO project_documents (project_id, type_slug, title, content, current_version, generated_by)
             VALUES ($1, $2, $3, $4, 1, 'template') RETURNING *`,
            [id, type_slug, title, content]
        );
        const documentId = doc.rows[0].id;

        await client.query(
            `INSERT INTO project_document_versions (document_id, version, title, content, author)
             VALUES ($1, 1, $2, $3, $4)`,
            [documentId, title, content, author || null]
        );

        await client.query('COMMIT');
        res.status(201).json(doc.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Documento completo
app.get('/api/documents/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM project_documents WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Documento não encontrado' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Salva a edição: atualiza o documento e grava uma NOVA versão (append-only)
app.put('/api/documents/:id', async (req, res) => {
    const { id } = req.params;
    const { title, content, status, author } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const current = await client.query(
            'SELECT title, content, current_version FROM project_documents WHERE id = $1 FOR UPDATE',
            [id]
        );
        if (current.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Documento não encontrado' });
        }

        const prev = current.rows[0];
        const newTitle = title !== undefined && title !== null ? title : prev.title;
        const newContent = content !== undefined && content !== null ? content : prev.content;
        const newStatus = status || 'draft';

        if (newTitle === prev.title && newContent === prev.content) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Nenhuma alteração para salvar' });
        }

        const nextVersion = prev.current_version + 1;

        const updated = await client.query(
            `UPDATE project_documents
             SET title = $1, content = $2, status = $3, current_version = $4
             WHERE id = $5 RETURNING *`,
            [newTitle, newContent, newStatus, nextVersion, id]
        );

        await client.query(
            `INSERT INTO project_document_versions (document_id, version, title, content, author)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, nextVersion, newTitle, newContent, author || null]
        );

        await client.query('COMMIT');
        res.json(updated.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Reaplica o template sobre os dados atuais do projeto, como NOVA versão
app.post('/api/documents/:id/regenerate', async (req, res) => {
    const { id } = req.params;
    const { author } = req.body || {};

    const client = await pool.connect();
    try {
        const doc = await client.query('SELECT * FROM project_documents WHERE id = $1', [id]);
        if (doc.rows.length === 0) return res.status(404).json({ error: 'Documento não encontrado' });

        const project = await fetchProjectOr404(doc.rows[0].project_id, res);
        if (!project) return;

        const { title, content } = buildDocument(doc.rows[0].type_slug, project);
        const nextVersion = doc.rows[0].current_version + 1;

        await client.query('BEGIN');
        const updated = await client.query(
            `UPDATE project_documents
             SET title = $1, content = $2, current_version = $3, generated_by = 'template'
             WHERE id = $4 RETURNING *`,
            [title, content, nextVersion, id]
        );
        await client.query(
            `INSERT INTO project_document_versions (document_id, version, title, content, author)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, nextVersion, title, content, author || null]
        );
        await client.query('COMMIT');
        res.json(updated.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Histórico (metadados, sem conteúdo)
app.get('/api/documents/:id/versions', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            `SELECT id, version, title, author, created_at, LENGTH(content) AS content_length
             FROM project_document_versions WHERE document_id = $1 ORDER BY version DESC`,
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Conteúdo de uma versão específica
app.get('/api/documents/:id/versions/:version', async (req, res) => {
    const { id, version } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM project_document_versions WHERE document_id = $1 AND version = $2',
            [id, version]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Versão não encontrada' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Restaura uma versão antiga como NOVA versão (não reescreve o histórico)
app.post('/api/documents/:id/restore/:version', async (req, res) => {
    const { id, version } = req.params;
    const { author } = req.body || {};

    const client = await pool.connect();
    try {
        const source = await client.query(
            'SELECT title, content FROM project_document_versions WHERE document_id = $1 AND version = $2',
            [id, version]
        );
        if (source.rows.length === 0) return res.status(404).json({ error: 'Versão não encontrada' });

        const current = await client.query(
            'SELECT current_version FROM project_documents WHERE id = $1 FOR UPDATE',
            [id]
        );
        if (current.rows.length === 0) return res.status(404).json({ error: 'Documento não encontrado' });

        const nextVersion = current.rows[0].current_version + 1;
        const { title, content } = source.rows[0];

        await client.query('BEGIN');
        const updated = await client.query(
            `UPDATE project_documents SET title = $1, content = $2, current_version = $3
             WHERE id = $4 RETURNING *`,
            [title, content, nextVersion, id]
        );
        await client.query(
            `INSERT INTO project_document_versions (document_id, version, title, content, author)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, nextVersion, title, content, author || `Restaurado da v${version}`]
        );
        await client.query('COMMIT');
        res.json({ ...updated.rows[0], restored_from: Number(version) });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Exportação: format=md (Markdown) ou format=doc (HTML compatível com Word)
app.get('/api/documents/:id/export', async (req, res) => {
    const { id } = req.params;
    const format = (req.query.format || 'md').toLowerCase();

    if (!['md', 'doc'].includes(format)) {
        return res.status(400).json({ error: 'Formato inválido. Use md ou doc.' });
    }

    try {
        const doc = await pool.query('SELECT * FROM project_documents WHERE id = $1', [id]);
        if (doc.rows.length === 0) return res.status(404).json({ error: 'Documento não encontrado' });

        const project = await pool.query('SELECT name, description FROM projects WHERE id = $1', [doc.rows[0].project_id]);
        const projectName = project.rows[0]?.name || 'projeto';
        const slug = String(doc.rows[0].title)
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'documento';

        if (format === 'md') {
            res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${slug}.md"`);
            return res.send(doc.rows[0].content);
        }

        // Word: HTML com o cabeçalho da empresa. O Word abre e permite editar.
        const body = renderMarkdown(doc.rows[0].content);
        const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${escapeForDoc(doc.rows[0].title)}</title>
<style>
  @page { margin: 2cm; }
  body { font-family: Calibri, "Segoe UI", Arial, sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.5; }
  h1 { font-size: 20pt; color: #0b3c46; border-bottom: 2px solid #00b8c4; padding-bottom: 6px; }
  h2 { font-size: 14pt; color: #0b3c46; margin-top: 22px; }
  h3 { font-size: 12pt; color: #14555f; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #b9cacb; padding: 6px 8px; text-align: left; vertical-align: top; font-size: 10pt; }
  th { background: #e6f7f9; color: #0b3c46; }
  hr { border: 0; border-top: 1px solid #cfe3e5; margin: 20px 0; }
  code { background: #f1f5f6; padding: 1px 4px; font-family: Consolas, monospace; }
  ul.task-list { list-style: none; padding-left: 4px; }
  .doc-footer { margin-top: 28px; border-top: 1px solid #cfe3e5; padding-top: 8px; font-size: 8pt; color: #5c7479; }
</style>
</head>
<body>
${body}
<div class="doc-footer">
  ${escapeForDoc(projectName)} · Gerado por Planejamento de Dados em ${new Date().toLocaleDateString('pt-BR')}
</div>
</body>
</html>`;

        res.setHeader('Content-Type', 'application/msword; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${slug}.doc"`);
        return res.send(html);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Exclui o documento (o histórico cai por cascade)
app.delete('/api/documents/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM project_documents WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Documento não encontrado' });
        res.json({ message: 'Documento excluído' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// =============================================================================
// Lookup Tables — Departments, Companies, Persons
// =============================================================================
app.get('/api/departments', async (_req, res) => {
    try {
        const r = await pool.query('SELECT * FROM departments ORDER BY name');
        res.json(r.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/departments', async (req, res) => {
    try {
        const r = await pool.query('INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING *', [req.body.name]);
        res.status(201).json(r.rows[0]);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/companies', async (_req, res) => {
    try {
        const r = await pool.query('SELECT * FROM companies ORDER BY name');
        res.json(r.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/companies', async (req, res) => {
    try {
        const r = await pool.query('INSERT INTO companies (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING *', [req.body.name]);
        res.status(201).json(r.rows[0]);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/persons', async (req, res) => {
    try {
        const role = req.query.role;
        const q = role ? 'SELECT * FROM persons WHERE role = $1 ORDER BY name' : 'SELECT * FROM persons ORDER BY name';
        const params = role ? [role] : [];
        const r = await pool.query(q, params);
        res.json(r.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/persons', async (req, res) => {
    try {
        const r = await pool.query('INSERT INTO persons (name, role) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET role=EXCLUDED.role RETURNING *', [req.body.name, req.body.role || 'assignee']);
        res.status(201).json(r.rows[0]);
    } catch (err) { res.status(400).json({ error: err.message }); }
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
