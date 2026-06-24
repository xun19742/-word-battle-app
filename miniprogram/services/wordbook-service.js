const legacyBook = require('../data/cet4-core-100');
const generated = require('../data/exam-wordbooks.generated');

const REQUIRED_FIELDS = ['id', 'word', 'meaning', 'order'];

function expandBook(book) {
  return {
    id: book.id,
    name: book.name,
    description: book.description,
    source: generated.source.name,
    words: book.indexes.map((entryIndex, order) => {
      const [word, phonetic, meaning] = generated.entries[entryIndex];
      return {
        id: `ecdict-${entryIndex}`,
        word,
        phonetic,
        meaning,
        example: '',
        exampleTranslation: '',
        difficulty: 1,
        order: order + 1,
      };
    }),
  };
}

function listWordbooks() {
  return [
    ...generated.books.map((book) => ({
      id: book.id,
      name: book.name,
      description: book.description,
      wordCount: book.indexes.length,
      source: generated.source.name,
    })),
    {
      id: legacyBook.id,
      name: legacyBook.name,
      description: legacyBook.description,
      wordCount: legacyBook.words.length,
      source: 'WordRush',
    },
  ];
}

function isValidWordbookId(bookId) {
  return listWordbooks().some((book) => book.id === bookId);
}

function getWordbook(bookId = 'cet4') {
  if (bookId === legacyBook.id) {
    return {
      ...legacyBook,
      words: legacyBook.words.map((word) => ({ ...word })),
    };
  }
  const book = generated.books.find((item) => item.id === bookId)
    || generated.books.find((item) => item.id === 'cet4');
  return expandBook(book);
}

function getBuiltinWordbook() {
  // 兼容尚未迁移的旧页面和云端种子脚本。
  return getWordbook('cet4-core-100');
}

function validateWordbook(book) {
  if (!book || !Array.isArray(book.words) || !book.words.length) {
    return ['词书格式错误'];
  }

  const errors = [];
  const seen = new Set();
  book.words.forEach((word, index) => {
    REQUIRED_FIELDS.forEach((field) => {
      if (word[field] === undefined || word[field] === '') {
        errors.push(`第 ${index + 1} 个单词缺少 ${field}`);
      }
    });
    if (seen.has(word.word)) {
      errors.push(`单词重复：${word.word}`);
    }
    seen.add(word.word);
  });
  return errors;
}

module.exports = {
  getBuiltinWordbook,
  getWordbook,
  isValidWordbookId,
  listWordbooks,
  validateWordbook,
};
