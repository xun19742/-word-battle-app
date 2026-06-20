const fs = require('node:fs');
const path = require('node:path');

const source = path.join(
  __dirname,
  '..',
  'miniprogram',
  'data',
  'cet4-core-100.js',
);
const target = path.join(
  __dirname,
  '..',
  'cloudfunctions',
  'seed-wordbook',
  'data.js',
);

// 云函数上传时无法引用目录外文件，因此从唯一源机械复制一份部署数据。
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
console.log('已生成云函数词书数据：cloudfunctions/seed-wordbook/data.js');
