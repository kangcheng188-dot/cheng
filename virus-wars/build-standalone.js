/* 把 index.html + css + js 打包成单文件。
   用法: node build-standalone.js
   产物:
     standalone.html         完整单文件网页（可离线双击打开）
     dist/artifact.html      去掉 doctype/html/head/body 的版本（用于内嵌发布）
*/
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('index.html');

html = html.replace(
  /<link rel="stylesheet" href="css\/style\.css">/,
  '<style>\n' + read('css/style.css') + '\n</style>'
);

html = html.replace(/<script src="js\/([\w.-]+)"><\/script>\s*/g, (_, f) =>
  '<script>\n' + read('js/' + f) + '\n</script>\n'
);

fs.writeFileSync(path.join(root, 'standalone.html'), html);

// 内嵌版本：只保留 <title> 之后、</body> 之前的内容
const inner = html
  .replace(/^[\s\S]*?<title>/, '<title>')
  .replace(/^<link rel="icon".*$\n?/m, '')
  .replace(/^<\/head>$\n?/m, '')
  .replace(/^<body>$\n?/m, '')
  .replace(/<\/body>\s*<\/html>\s*$/, '');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/artifact.html'), inner);

console.log('standalone.html      ', (html.length / 1024).toFixed(1) + ' KB');
console.log('dist/artifact.html   ', (inner.length / 1024).toFixed(1) + ' KB');
