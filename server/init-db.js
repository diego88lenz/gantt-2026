/**
 * Inicializa o banco: executa schema.sql + seed.sql
 * Uso: node init-db.js
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://gantt:gantt@localhost:5432/gantt_2026',
});

async function runSQLFile(filePath) {
    const sql = fs.readFileSync(filePath, 'utf-8');
    await pool.query(sql);
    console.log(`✅ Executado: ${path.basename(filePath)}`);
}

async function main() {
    const dbDir = path.join(__dirname, '..', 'database');

    try {
        await runSQLFile(path.join(dbDir, 'schema.sql'));
        await runSQLFile(path.join(dbDir, 'seed.sql'));
        console.log('\n🎉 Banco inicializado com sucesso!');
        console.log('   55 tarefas, 3 categorias, 4 anos carregados.');
    } catch (err) {
        console.error('❌ Erro ao inicializar banco:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
