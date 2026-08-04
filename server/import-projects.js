/**
 * Importa projetos da planilha Excel para o banco de dados
 * Uso: node import-projects.js
 */
const XLSX = require('xlsx');
const fs = require('fs');

const filePath = process.argv[2] || 'C:/Users/diego/Downloads/Inteligencia De Dados - Projetos (1).xlsx';

function excelDateToISO(serial) {
    if (!serial || serial === '') return null;
    const num = parseFloat(serial);
    if (isNaN(num)) return null;
    // Excel epoch: 1900-01-01 minus the leap year bug
    const utcDays = Math.floor(num - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    return date.toISOString().split('T')[0];
}

function mapStatus(statusRaw) {
    const s = (statusRaw || '').trim().toLowerCase();
    if (s === 'produção' || s === 'produccion') return 'in_progress';
    if (s === 'pausado' || s === 'pausada') return 'on_hold';
    if (s === 'concluído' || s === 'concluido' || s === 'done') return 'completed';
    if (s === 'backlog' || s === 'planejando') return 'planning';
    if (s === 'cancelado') return 'cancelled';
    return 'planning';
}

function mapPriority(priorityRaw) {
    const p = (priorityRaw || '').trim().toLowerCase();
    if (p === 'urgente' || p === 'critical' || p === 'critica' || p === 'crítica') return 'critical';
    if (p === 'alta' || p === 'high') return 'high';
    if (p === 'baixa' || p === 'low') return 'low';
    return 'medium';
}

function mapType(typeRaw) {
    const t = (typeRaw || '').trim().toLowerCase();
    if (t === 'dados') return 'data';
    if (t === 'ia') return 'ai';
    if (t === 'geo' || t === 'geoprocessamento') return 'geo';
    if (t === 'analytics') return 'analytics';
    return 'data';
}

const wb = XLSX.readFile(filePath);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rawData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

// Skip header row (first row is headers shown as data due to formatting)
const projects = rawData.slice(1).map((row, i) => {
    const name = (row.__EMPTY || '').trim();
    if (!name) return null;

    return {
        name,
        description: (row.__EMPTY_2 || '').trim().replace(/\r\n/g, ' ').replace(/\n/g, ' ') || null,
        type: mapType(row.__EMPTY_8),
        department: (row.__EMPTY_9 || '').trim() || null,
        company: (row.__EMPTY_10 || '').trim() || null,
        assignee: (row.__EMPTY_3 || '').trim() || null,
        requester: null,
        status: mapStatus(row.__EMPTY_1),
        priority: mapPriority(row.__EMPTY_4),
        start_date: excelDateToISO(row.__EMPTY_5),
        end_date: excelDateToISO(row.__EMPTY_7) || null,
        created_at_override: excelDateToISO(row.__EMPTY_6),
    };
}).filter(Boolean);

// Output as JSON for pipe to API
console.log(JSON.stringify(projects));
