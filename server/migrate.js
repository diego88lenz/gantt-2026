/**
 * Migration script: localStorage JSON → PostgreSQL
 * 
 * Uso:
 *   node migrate.js                    # Lê do arquivo exportado pelo frontend
 *   node migrate.js path/to/file.json  # Caminho customizado
 *   GANTT_DATA='{...}' node migrate.js  # Via env var
 */
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://gantt:gantt@localhost:5432/gantt_2026',
});

async function migrate(data) {
    const { ganttData, categories: catsData } = data;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        console.log('🧹 Limpando dados existentes...');
        await client.query('DELETE FROM dependencies');
        await client.query('DELETE FROM task_months');
        await client.query('DELETE FROM tasks');
        await client.query('DELETE FROM categories');
        await client.query('DELETE FROM years');

        console.log('📅 Inserindo anos...');
        const yearMap = {};
        for (const yr of Object.keys(ganttData)) {
            const r = await client.query('INSERT INTO years (year_value) VALUES ($1) RETURNING id', [parseInt(yr)]);
            yearMap[yr] = r.rows[0].id;
        }
        console.log(`   ${Object.keys(yearMap).length} ano(s)`);

        console.log('🏷️  Inserindo categorias...');
        const catMap = {};
        for (let i = 0; i < catsData.length; i++) {
            const cat = catsData[i];
            const r = await client.query(
                'INSERT INTO categories (slug, name, color, sort_order) VALUES ($1, $2, $3, $4) RETURNING id',
                [cat.id, cat.name, cat.color, i]
            );
            catMap[cat.id] = r.rows[0].id;
        }
        console.log(`   ${Object.keys(catMap).length} categoria(s)`);

        console.log('📝 Inserindo tarefas e meses...');
        let taskCount = 0;
        let monthCount = 0;

        for (const [yearStr, yearData] of Object.entries(ganttData)) {
            const yearId = yearMap[yearStr];
            for (const [catSlug, tasks] of Object.entries(yearData)) {
                const categoryId = catMap[catSlug];
                if (!categoryId) {
                    console.warn(`   ⚠️  Categoria "${catSlug}" não encontrada, pulando ${tasks.length} tarefa(s)`);
                    continue;
                }

                for (let i = 0; i < tasks.length; i++) {
                    const t = tasks[i];
                    const tr = await client.query(
                        `INSERT INTO tasks (year_id, category_id, name, progress, is_milestone, assignee, sort_order)
                         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                        [yearId, categoryId, t.name, t.progress || 0, t.milestone || false, t.assignee || null, i]
                    );
                    const taskId = tr.rows[0].id;
                    taskCount++;

                    if (t.months && t.months.length > 0) {
                        const placeholders = t.months.map((_, idx) => `($1, $${idx + 2})`).join(', ');
                        await client.query(
                            `INSERT INTO task_months (task_id, month_num) VALUES ${placeholders}`,
                            [taskId, ...t.months]
                        );
                        monthCount += t.months.length;
                    }
                }
            }
        }

        await client.query('COMMIT');
        console.log(`\n✅ Migração concluída!`);
        console.log(`   ${Object.keys(yearMap).length} ano(s)`);
        console.log(`   ${Object.keys(catMap).length} categoria(s)`);
        console.log(`   ${taskCount} tarefa(s)`);
        console.log(`   ${monthCount} mês(es) ativo(s)`);

        return { years: Object.keys(yearMap).length, categories: Object.keys(catMap).length, tasks: taskCount, months: monthCount };
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Erro na migração:', err.message);
        throw err;
    } finally {
        client.release();
    }
}

async function main() {
    let data;

    if (process.env.GANTT_DATA) {
        data = JSON.parse(process.env.GANTT_DATA);
    } else {
        const filePath = process.argv[2] || './gantt-export.json';
        if (!fs.existsSync(filePath)) {
            console.error(`❌ Arquivo não encontrado: ${filePath}`);
            console.error('   Exporte os dados pela UI (botão Exportar JSON) e passe o caminho:');
            console.error('   node migrate.js path/to/gantt-2026.json');
            process.exit(1);
        }
        data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }

    // Normalize: if flat format (no year nesting), wrap in currentYear
    const firstVal = Object.values(data.ganttData)[0];
    const isMultiYear = firstVal && typeof firstVal === 'object' && !Array.isArray(firstVal);
    if (!isMultiYear) {
        const year = String(data.currentYear || new Date().getFullYear());
        data.ganttData = { [year]: data.ganttData };
    }

    await migrate(data);
    await pool.end();
}

if (require.main === module) {
    main().catch(() => process.exit(1));
}

module.exports = { migrate };
