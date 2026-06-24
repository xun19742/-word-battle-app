const BOOKS = [
  {
    id: 'cet4',
    tag: 'cet4',
    name: '大学英语四级',
    description: '大学英语四级考试词汇',
  },
  {
    id: 'cet6',
    tag: 'cet6',
    name: '大学英语六级',
    description: '大学英语六级考试词汇',
  },
  {
    id: 'postgraduate',
    tag: 'ky',
    name: '考研英语',
    description: '全国硕士研究生招生考试英语词汇',
  },
  {
    id: 'ielts',
    tag: 'ielts',
    name: '雅思词汇',
    description: 'IELTS 考试词汇',
  },
];

function compactText(value) {
  return String(value || '').trim().replace(/\r?\n+/g, '；');
}

function normalizeRow(row) {
  const word = compactText(row.word).toLowerCase();
  const meaning = compactText(row.translation);
  if (!word || !meaning) {
    return null;
  }
  const tags = new Set(compactText(row.tag).split(/\s+/).filter(Boolean));
  const rank = Number(row.frq) || Number(row.bnc) || Number.MAX_SAFE_INTEGER;
  return {
    word,
    phonetic: compactText(row.phonetic),
    meaning,
    tags,
    rank,
  };
}

function createWordbookAccumulator() {
  const words = new Map();
  return {
    addRow(row) {
      const item = normalizeRow(row);
      if (!item || !BOOKS.some((book) => item.tags.has(book.tag))) {
        return;
      }
      const current = words.get(item.word);
      if (!current) {
        words.set(item.word, item);
        return;
      }
      item.tags.forEach((tag) => current.tags.add(tag));
      if (item.rank < current.rank) {
        current.rank = item.rank;
        current.phonetic = item.phonetic || current.phonetic;
        current.meaning = item.meaning;
      }
    },

    build() {
      const ordered = [...words.values()].sort((left, right) => (
        left.rank - right.rank
        || (left.word < right.word ? -1 : left.word > right.word ? 1 : 0)
      ));
      const positions = new Map(
        ordered.map((item, index) => [item.word, index]),
      );
      return {
        source: {
          name: 'ECDICT',
          license: 'MIT',
          commit: 'bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b',
        },
        entries: ordered.map((item) => [
          item.word,
          item.phonetic,
          item.meaning,
        ]),
        books: BOOKS.map((book) => ({
          ...book,
          indexes: ordered
            .filter((item) => item.tags.has(book.tag))
            .map((item) => positions.get(item.word)),
        })),
      };
    },
  };
}

function buildWordbookData(rows) {
  const accumulator = createWordbookAccumulator();
  rows.forEach((row) => accumulator.addRow(row));
  return accumulator.build();
}

function serializeWordbookData(data) {
  return `// 此文件由构建脚本生成，请勿手工修改。\nmodule.exports=${JSON.stringify(data)};\n`;
}

function validateBuiltData(data, maxBytes = 1.8 * 1024 * 1024) {
  if (!data || !Array.isArray(data.entries) || !Array.isArray(data.books)) {
    throw new Error('生成词书格式错误');
  }
  data.books.forEach((book) => {
    if (!book.indexes.length) {
      throw new Error(`词书为空：${book.id}`);
    }
    if (new Set(book.indexes).size !== book.indexes.length) {
      throw new Error(`词书索引重复：${book.id}`);
    }
    if (book.indexes.some((index) => !data.entries[index])) {
      throw new Error(`词书索引无效：${book.id}`);
    }
  });
  if (Buffer.byteLength(serializeWordbookData(data), 'utf8') > maxBytes) {
    throw new Error('生成词书超过 1.8 MB');
  }
}

module.exports = {
  BOOKS,
  buildWordbookData,
  createWordbookAccumulator,
  serializeWordbookData,
  validateBuiltData,
};
