const { execFileSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const { Script } = require('node:vm');

function download(url) {
    return execFileSync('curl', ['-fsSL', '--max-time', '30', url], {
        encoding: 'utf8'
    });
}

const skaz = download(
    'https://cdn.jsdelivr.net/gh/SsabroS/lampa-plugins@main/plugin_final.js?v=16'
).replaceAll('Клубничка', 'Дашенька');

const xsena = download('http://e.xsena.red/')
    .replaceAll('lampac_sisiname', 'xsena_sisiname')
    .replaceAll('Клубничка', 'Даша')
    .replaceAll('sisi_add_param_ready', 'xsena_add_param_ready')
    .replaceAll("component: 'sisi'", "component: 'xsena'")
    .replaceAll('sisi_preview', 'xsena_preview')
    .replaceAll('sisi_history', 'xsena_history')
    .replaceAll("'xsena.red'", "'Даша'")
    .replaceAll('>xsena.red<', '>Даша<');

const combined = skaz.trimEnd() + '\n;\n' + xsena.trimEnd() + '\n';
new Script(combined);
writeFileSync('dashenka-dasha.js', combined, 'utf8');
