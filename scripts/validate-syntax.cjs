const fs = require('fs');
const path = require('path');
const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
let errors = 0, files = 0;
function traverse(dir) { for (const x of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, x.name);
    if (x.isDirectory())
        traverse(p);
    else if (/\.(jsx|js)$/.test(x.name)) {
        files++;
        const text = fs.readFileSync(p, 'utf8');
        const s = ts.createSourceFile(p, text, ts.ScriptTarget.Latest, true, x.name.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.JS);
        for (const e of s.parseDiagnostics) {
            errors++;
            const pos = s.getLineAndCharacterOfPosition(e.start);
            console.error(`${p}:${pos.line + 1}:${pos.character + 1}: ${ts.flattenDiagnosticMessageText(e.messageText, ' ')}`);
        }
    }
} }
traverse(path.join(__dirname, '..', 'src'));
traverse(path.join(__dirname, '..', 'server'));
console.log(`Parsed ${files} JS/JSX files, ${errors} syntax errors`);
process.exit(errors ? 1 : 0);
