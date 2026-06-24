// 从固定 ECDICT CSV 生成小程序可直接 require 的紧凑词书数据。
const fs = require('node:fs');
const path = require('node:path');
const { createCsvParser } = require('./csv-parser');
const {
  createWordbookAccumulator,
  serializeWordbookData,
  validateBuiltData,
} = require('./wordbook-builder');

const source = process.argv[2];
const target = process.argv[3] || path.join(
  __dirname,
  '..',
  'miniprogram',
  'data',
  'exam-wordbooks.generated.js',
);

if (!source) {
  throw new Error('请提供 ECDICT CSV 路径');
}

const accumulator = createWordbookAccumulator();
const parser = createCsvParser((row) => accumulator.addRow(row));
const stream = fs.createReadStream(source, { encoding: 'utf8' });

stream.on('data', (chunk) => parser.write(chunk));
stream.on('error', (error) => {
  throw error;
});
stream.on('end', () => {
  parser.end();
  const data = accumulator.build();
  validateBuiltData(data);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, serializeWordbookData(data));
  console.log(`已生成 ${data.books.length} 本词书，共 ${data.entries.length} 个共享词条`);
});
