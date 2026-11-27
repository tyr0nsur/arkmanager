function findInlineCommentIndex(rawValue) {
  let inQuotes = false;
  let escaped = false;

  for (let index = 0; index < rawValue.length; index += 1) {
    const character = rawValue[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === '\\') {
      escaped = true;
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && (character === '#' || character === ';')) {
      const previous = rawValue[index - 1];
      if (index === 0) return index;
      if (/\s/.test(previous)) {
        let commentStart = index;
        while (commentStart > 0 && /\s/.test(rawValue[commentStart - 1])) {
          commentStart -= 1;
        }
        return commentStart;
      }
    }
  }

  return -1;
}

export function parseConfigLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) return null;

  const eqIdx = line.indexOf('=');
  if (eqIdx === -1) return null;

  const key = line.substring(0, eqIdx).trim();
  if (!key) return null;

  const rawValue = line.substring(eqIdx + 1);
  const leadingWhitespace = rawValue.match(/^\s*/)?.[0] || '';
  const rawValueBody = rawValue.substring(leadingWhitespace.length);
  const commentIdx = findInlineCommentIndex(rawValueBody);
  const rawToken = commentIdx === -1 ? rawValueBody : rawValueBody.substring(0, commentIdx);
  const commentSuffix = commentIdx === -1 ? '' : rawValueBody.substring(commentIdx);
  const valueToken = rawToken.trimEnd();
  const hasQuotes = valueToken.startsWith('"') && valueToken.endsWith('"') && valueToken.length >= 2;
  const value = hasQuotes ? valueToken.substring(1, valueToken.length - 1) : valueToken;

  return {
    key,
    value,
    hasQuotes,
    leadingWhitespace,
    commentSuffix,
  };
}

export function replaceConfigLineValue(line, newValue, item) {
  const eqIdx = line.indexOf('=');
  if (eqIdx === -1) return line;

  const prefix = line.substring(0, eqIdx + 1);
  const valueToken = item.hasQuotes ? `"${newValue}"` : String(newValue);
  return `${prefix}${item.leadingWhitespace || ''}${valueToken}${item.commentSuffix || ''}`;
}
