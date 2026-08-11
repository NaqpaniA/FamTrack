import fs from 'node:fs';
import path from 'node:path';
import { FamTrackDatabase } from './database.js';

const inputPath = process.argv[2];
if (!inputPath) {
    throw new Error('Usage: node dist-server/server/verify-database.js /absolute/path/to/famtrack.sqlite');
}

const databasePath = path.resolve(inputPath);
if (!fs.existsSync(databasePath)) {
    throw new Error(`Database file does not exist: ${databasePath}`);
}

const database = await FamTrackDatabase.open(databasePath);
let serializedReport = '';
try {
    const report = database.integrityReport();
    if (!report.ok) {
        throw new Error(`SQLite quick_check failed: ${report.quickCheck.join('; ')}`);
    }
    serializedReport = `${JSON.stringify(report)}\n`;
} finally {
    database.close();
}

// sql.js may keep a runtime handle alive under Node 20 even after Database#close.
// Write synchronously so the release gate can terminate deterministically without
// risking a truncated audit report.
fs.writeSync(1, serializedReport);
process.exit(0);
