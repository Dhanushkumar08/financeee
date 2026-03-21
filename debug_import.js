const fs = require('fs');

const HEADER_KEYWORDS = ['name', 'stock', 'isin', 'quantity', 'qty',
    'amount', 'price', 'value', 'description', 'source', 'date', 'category'];

function parseRow(row, delimiter) {
    if (delimiter === '\t') {
        return row.split('\t').map(c => c.trim());
    }
    const cols = []; let cur = '', inQ = false;
    for (let i = 0; i < row.length; i++) {
        const c = row[i];
        if (c === '"') { inQ = !inQ; }
        else if (c === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
        else cur += c;
    }
    cols.push(cur.trim());
    return cols;
}

function normalize(h) {
    return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function debugImport(text) {
    const rawLines = text.split(/\r?\n/);
    const sampleLine = rawLines.find(l => l.trim()) || '';
    const delimiter = (sampleLine.split('\t').length > sampleLine.split(',').length) ? '\t' : ',';
    console.log('[Import] Detected delimiter:', delimiter === '\t' ? 'TAB' : 'COMMA');

    let headerLineIdx = 0, bestScore = -1;
    for (let i = 0; i < Math.min(rawLines.length, 25); i++) {
        if (!rawLines[i].trim()) continue;
        const cells = parseRow(rawLines[i], delimiter).map(normalize);
        const score = HEADER_KEYWORDS.filter(kw => cells.some(c => c.includes(kw))).length;
        console.log(`[Debug] Row ${i} score: ${score} | Content: ${rawLines[i].substring(0, 50)}...`);
        if (score > bestScore) { bestScore = score; headerLineIdx = i; }
    }

    const lines = rawLines.slice(headerLineIdx).filter(l => l.trim());
    const headers = parseRow(lines[0], delimiter).map(normalize);
    console.log('[Import] Header row index:', headerLineIdx, '| Headers:', headers);

    const col = (...aliases) => {
        for (const a of aliases) {
            const idx = headers.findIndex(h => h.includes(a));
            if (idx !== -1) return idx;
        }
        return -1;
    };

    const nameI = col('stockname', 'name', 'asset', 'title', 'security', 'scrip');
    console.log('[Import] nameI:', nameI);

    if (nameI === -1) {
        console.error('ERROR: CSV must have a "Name" or "Stock Name" column');
        return;
    }
    console.log('SUCCESS: nameI found at index', nameI);
}

const fileContent = fs.readFileSync('reproduction.csv', 'utf8');
debugImport(fileContent);
