const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm');
let count = 0;
function scan(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (['node_modules', '.git', 'legacy'].includes(name)) continue;
    const file = path.join(dir, name);
    if (fs.statSync(file).isDirectory()) scan(file);
    else if (/\.(js|cjs)$/.test(name)) {
      new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
      count++;
    } else if (name.endsWith('.html')) {
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
        new vm.Script(match[1], { filename: file });
        count++;
      }
    }
  }
}
scan(path.join(__dirname, '..'));
console.log(count + ' archivos/bloques JavaScript válidos');
