// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
// Same answers, bit for bit in meaning: {columns, rows, errors} for every
// {text, header}. Same broken-row policy as the reference:
//   - U+FEFF at the very start is dropped
//   - a record ends at LF or CRLF; a line left with no characters is no record
//   - outside quotes a CR not followed by LF is dropped (stray_cr)
//   - a field opening with a quote runs to the next quote that is not doubled;
//     "" inside it is one quote, CRLF / lone CR inside it read as LF; what
//     follows its closing quote up to the next comma or line break is appended
//     as it stands (quote_junk, when the field ends); a quote that never
//     closes is a literal character and the text after it is read again as
//     unquoted (unterminated_quote)
//   - a quote inside an unquoted field is a literal character
//   - columns is the first record when header is true, else null; rows are
//     padded (short_row) or cut (long_row) to the first record's width
//   - each error is {code, line, row} in the order met; line is the 1-based
//     line its record starts on, row its record's index in rows (null: header)
//
// Speed comes from never building a field one character at a time: plain
// lines are split natively, fields are sliced, and quoted fields are found
// with indexOf instead of a per-character walk.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // Field result, written by readUnquoted/readQuoted instead of returned,
  // so no object is allocated per field: fVal the field, fEnd how it ended
  // (COMMA/LINE_BREAK/END), fAdded the characters kept after the prefix,
  // which is what decides quote_junk.
  let fVal = '';
  let fEnd = END;
  let fAdded = 0;

  // Reads unquoted characters from `start` onto `prefix`, up to the next
  // comma or line break: a CR not followed by LF is dropped (stray_cr).
  function readUnquoted(start, prefix) {
    let parts = null; // segments kept, only when a stray CR splits the field
    let segStart = start;
    let added = 0;
    let j = start;
    while (j < n) {
      const c = text.charCodeAt(j);
      if (c === 44) { // ,
        const tail = text.slice(segStart, j);
        fVal = parts === null ? prefix + tail : parts.join('') + tail;
        pos = j + 1;
        fEnd = COMMA;
        fAdded = added + tail.length;
        return;
      }
      if (c === 10) { // \n
        const tail = text.slice(segStart, j);
        fVal = parts === null ? prefix + tail : parts.join('') + tail;
        pos = j + 1;
        line += 1;
        fEnd = LINE_BREAK;
        fAdded = added + tail.length;
        return;
      }
      if (c === 13) { // \r
        if (text.charCodeAt(j + 1) === 10) {
          const tail = text.slice(segStart, j);
          fVal = parts === null ? prefix + tail : parts.join('') + tail;
          pos = j + 2;
          line += 1;
          fEnd = LINE_BREAK;
          fAdded = added + tail.length;
          return;
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        const seg = text.slice(segStart, j);
        if (parts === null) parts = [prefix, seg];
        else parts.push(seg);
        added += seg.length;
        j += 1;
        segStart = j;
        continue;
      }
      j += 1;
    }
    const tail = text.slice(segStart, j);
    fVal = parts === null ? prefix + tail : parts.join('') + tail;
    pos = j;
    fEnd = END;
    fAdded = added + tail.length;
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    // The closing quote is the first quote whose next character is not a
    // quote; a quote followed by a quote is one escaped quote inside.
    let q = text.indexOf('"', open + 1);
    let doubled = false;
    while (q !== -1 && text.charCodeAt(q + 1) === 34) {
      doubled = true;
      q = text.indexOf('"', q + 2);
    }
    if (q === -1) {
      // The quote never closes: it is a literal character, and the text
      // after it is read again as unquoted.
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      readUnquoted(open + 1, '"');
      return;
    }
    let value;
    // A line break inside the quotes: count it and read it as LF.
    const nl = text.indexOf('\n', open + 1);
    const cr = text.indexOf('\r', open + 1);
    if (!doubled && (nl === -1 || nl >= q) && (cr === -1 || cr >= q)) {
      value = text.slice(open + 1, q);
    } else {
      // Slow lane: doubled quotes and/or line breaks inside the quotes.
      const parts = [];
      let seg = open + 1;
      let i = open + 1;
      while (i < q) {
        const c = text.charCodeAt(i);
        if (c === 34) { // "" -> one quote
          parts.push(text.slice(seg, i), '"');
          i += 2;
          seg = i;
        } else if (c === 13) { // CRLF / lone CR inside quotes -> LF
          parts.push(text.slice(seg, i), '\n');
          line += 1;
          i += text.charCodeAt(i + 1) === 10 ? 2 : 1;
          seg = i;
        } else if (c === 10) {
          parts.push(text.slice(seg, i), '\n');
          line += 1;
          i += 1;
          seg = i;
        } else {
          i += 1;
        }
      }
      parts.push(text.slice(seg, q));
      value = parts.join('');
    }
    pos = q + 1;
    if (pos >= n) {
      fVal = value;
      fEnd = END;
      fAdded = 0;
      return;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) { // ,
      pos += 1;
      fVal = value;
      fEnd = COMMA;
      fAdded = 0;
      return;
    }
    if (c === 10) { // \n
      pos += 1;
      line += 1;
      fVal = value;
      fEnd = LINE_BREAK;
      fAdded = 0;
      return;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fVal = value;
      fEnd = LINE_BREAK;
      fAdded = 0;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    readUnquoted(pos, value);
    if (fAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    let fields;
    let lastQuoted = false;
    let ended = END;
    // Fast lane: a whole line with no quote and no CR is one record whose
    // fields are the native split on commas.
    const le = text.indexOf('\n', pos);
    const lineEnd = le === -1 ? n : le;
    const hasQuote = text.indexOf('"', pos);
    const hasCr = text.indexOf('\r', pos);
    if ((hasQuote === -1 || hasQuote >= lineEnd) && (hasCr === -1 || hasCr >= lineEnd)) {
      fields = text.slice(pos, lineEnd).split(',');
      if (le === -1) {
        pos = n;
        ended = END;
      } else {
        pos = le + 1;
        line += 1;
        ended = LINE_BREAK;
      }
    } else {
      fields = [];
      do {
        lastQuoted = text.charCodeAt(pos) === 34;
        if (lastQuoted) readQuoted();
        else readUnquoted(pos, '');
        fields.push(fVal);
        ended = fEnd;
      } while (fEnd === COMMA);
    }

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
