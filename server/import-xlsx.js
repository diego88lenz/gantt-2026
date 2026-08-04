const XLSX = require('xlsx');

const filePath = 'C:/Users/diego/Downloads/Inteligencia De Dados - Projetos (1).xlsx';
const API = 'http://localhost:3001/api/projects';

function excelDateToISO(serial) {
    if (!serial || serial === '') return null;
    const num = parseFloat(serial);
    if (isNaN(num)) return null;
    const utcDays = Math.floor(num - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    return date.toISOString().split('T')[0];
}

async function main() {
    const wb = XLSX.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    let count = 0;
    let errors = 0;

    for (let i = 1; i < rawData.length; i++) {
        const row = rawData[i];
        const name = (row.__EMPTY || '').trim();
        if (!name) continue;

        const statusRaw = (row.__EMPTY_1 || '').trim().toLowerCase();
        let status = 'planning';
        if (statusRaw === 'produção' || statusRaw === 'producción' || statusRaw === 'produccion') status = 'in_progress';
        else if (statusRaw === 'pausado' || statusRaw === 'pausada') status = 'on_hold';
        else if (statusRaw === 'concluído' || statusRaw === 'concluido' || statusRaw === 'done' || statusRaw === 'finalizado') status = 'completed';
        else if (statusRaw === 'cancelado') status = 'cancelled';

        const typeRaw = (row.__EMPTY_8 || '').trim().toLowerCase();
        let type = 'data';
        if (typeRaw === 'ia') type = 'ai';
        else if (typeRaw === 'geo' || typeRaw === 'geoprocessamento') type = 'geo';
        else if (typeRaw === 'analytics') type = 'analytics';

        const priorityRaw = (row.__EMPTY_4 || '').trim().toLowerCase();
        let priority = 'medium';
        if (priorityRaw === 'urgente' || priorityRaw === 'critical' || priorityRaw === 'alta' || priorityRaw === 'high') priority = 'high';
        if (priorityRaw === 'baixa' || priorityRaw === 'low') priority = 'low';
        if (priorityRaw === 'crtitica' || priorityRaw === 'crítica') priority = 'critical';

        const project = {
            name,
            description: (row.__EMPTY_2 || '').trim().replace(/[\r\n]+/g, ' ').trim() || null,
            type,
            department: (row.__EMPTY_9 || '').trim() || null,
            company: (row.__EMPTY_10 || '').trim() || null,
            assignee: (row.__EMPTY_3 || '').trim() || null,
            requester: null,
            status,
            priority,
            start_date: excelDateToISO(row.__EMPTY_5),
            end_date: excelDateToISO(row.__EMPTY_7) || null,
        };

        try {
            const resp = await fetch(API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(project),
            });
            if (resp.ok) {
                count++;
                if (count % 50 === 0) console.log(`✓ ${count} projetos importados...`);
            } else {
                const err = await resp.json();
                console.error(`✗ Linha ${i + 1}: ${err.error}`);
                errors++;
            }
        } catch (e) {
            console.error(`✗ Linha ${i + 1}: ${e.message}`);
            errors++;
        }
    }
    console.log(`\n✅ Importação concluída: ${count} projetos importados, ${errors} erros.`);
}

main().catch(console.error);
