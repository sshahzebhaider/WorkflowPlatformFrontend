import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const expected = [
    'src/main.jsx', 'src/app/App.jsx', 'src/app/theme.js', 'src/components/Layout.jsx', 'src/components/UI.jsx',
    'src/components/CaseFields.jsx', 'src/components/FieldLibrary.jsx', 'src/components/AutoCode.jsx',
    'src/context/PlatformContext.jsx', 'src/pages/Login.jsx', 'src/pages/PlatformPages.jsx', 'src/pages/ProjectPages.jsx',
    'src/pages/CaseWorkspace.jsx', 'src/pages/RcaPage.jsx', 'src/pages/Designers.jsx', 'src/pages/Onboarding.jsx', 'src/pages/AccessPages.jsx',
    'src/auth/permissions.js', 'src/utils/lookups.js', 'src/utils/calendarHolidays.js', 'src/utils/bulkLookup.js', 'src/utils/caseTypeLookups.js', 'src/utils/rca.js', 'src/utils/caseFlow.js', 'src/data/seed.js', 'src/utils/helpers.js', 'src/styles.css'
];
let errors = 0;
for (const rel of expected) {
    if (!fs.existsSync(path.join(root, rel))) {
        console.error(`Missing file: ${rel}`);
        errors++;
    }
}
function collect(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(ent => ent.isDirectory() ? collect(path.join(dir, ent.name)) : /\.(jsx|js)$/.test(ent.name) ? [path.join(dir, ent.name)] : []); }
for (const full of collect(path.join(root, 'src'))) {
    const text = fs.readFileSync(full, 'utf8');
    if (/interface\s+\w+\s*\{|type\s+\w+\s*=/.test(text)) {
        console.error('Unexpected TypeScript in ' + full);
        errors++;
    }
    for (const match of text.matchAll(/\b(?:import|export)\s*(?:[^'";]+?\sfrom\s*)?['"](\.{1,2}\/[^'"]+)['"]/g)) {
        const target = path.resolve(path.dirname(full), match[1]);
        if (!['', '.js', '.jsx', '.json'].some(ext => fs.existsSync(target + ext))) {
            console.error('Broken import ' + match[1] + ' in ' + full);
            errors++;
        }
    }
}
console.log(`Validated ${expected.length} expected files and relative imports. ${errors ? `${errors} problems found` : 'All present.'}`);
process.exitCode = errors ? 1 : 0;
