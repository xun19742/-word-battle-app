function createCsvParser(onRecord) {
  let headers = null;
  let row = [];
  let field = '';
  let inQuotes = false;
  let quotePending = false;

  function emitField() {
    row.push(field);
    field = '';
  }

  function emitRow() {
    emitField();
    if (row.length === 1 && row[0] === '') {
      row = [];
      return;
    }
    if (!headers) {
      headers = row.map((value, index) => (
        index === 0 ? value.replace(/^\uFEFF/, '') : value
      ));
    } else {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = row[index] || '';
      });
      onRecord(record);
    }
    row = [];
  }

  function processOutsideQuote(character) {
    if (character === ',') {
      emitField();
    } else if (character === '\n') {
      emitRow();
    } else if (character === '\r') {
      // CRLF 的回车由换行统一结束记录。
    } else if (character === '"' && field === '') {
      inQuotes = true;
    } else {
      field += character;
    }
  }

  return {
    write(chunk) {
      const text = String(chunk);
      for (const character of text) {
        if (quotePending) {
          if (character === '"') {
            field += '"';
            quotePending = false;
            continue;
          }
          quotePending = false;
          inQuotes = false;
          processOutsideQuote(character);
          continue;
        }
        if (inQuotes) {
          if (character === '"') {
            quotePending = true;
          } else {
            field += character;
          }
          continue;
        }
        processOutsideQuote(character);
      }
    },

    end() {
      if (quotePending) {
        quotePending = false;
        inQuotes = false;
      }
      if (inQuotes) {
        throw new Error('CSV 引号未闭合');
      }
      if (field !== '' || row.length) {
        emitRow();
      }
    },
  };
}

function parseCsvText(text) {
  const records = [];
  const parser = createCsvParser((record) => records.push(record));
  parser.write(text);
  parser.end();
  return records;
}

module.exports = {
  createCsvParser,
  parseCsvText,
};
