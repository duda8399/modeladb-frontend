export type TokenKind = "word" | "ident" | "string" | "number" | "punct";

export type Token = { kind: TokenKind; value: string; start: number; end: number };

const WORD_START = /[\p{L}_]/u;
const WORD_PART = /[\p{L}\p{N}_$]/u;

export function tokenize(sql: string): Token[][] {
  const statements: Token[][] = [];
  let current: Token[] = [];
  let i = 0;
  let execCommentDepth = 0;
  const n = sql.length;

  const push = (kind: TokenKind, value: string, start: number) =>
    current.push({ kind, value, start, end: i });

  const readDelimited = (close: string, allowBackslash: boolean): string => {
    let value = "";
    i++;
    while (i < n) {
      const ch = sql[i];
      if (allowBackslash && ch === "\\" && i + 1 < n) {
        value += sql[i + 1];
        i += 2;
        continue;
      }
      if (ch === close) {
        if (sql[i + 1] === close) {
          value += close;
          i += 2;
          continue;
        }
        i++;
        return value;
      }
      value += ch;
      i++;
    }
    return value;
  };

  while (i < n) {
    const ch = sql[i];
    const start = i;

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if ((ch === "-" && sql[i + 1] === "-") || ch === "#") {
      while (i < n && sql[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      if (sql[i + 2] === "!") {
        i += 3;
        while (i < n && /[0-9]/.test(sql[i])) i++;
        execCommentDepth++;
        continue;
      }
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (execCommentDepth > 0 && ch === "*" && sql[i + 1] === "/") {
      execCommentDepth--;
      i += 2;
      continue;
    }

    if (ch === ";") {
      if (current.length) statements.push(current);
      current = [];
      i++;
      continue;
    }

    if (ch === "'") {
      const value = readDelimited("'", true);
      push("string", value, start);
      continue;
    }
    if (ch === '"') {
      const value = readDelimited('"', false);
      push("ident", value, start);
      continue;
    }
    if (ch === "`") {
      const value = readDelimited("`", false);
      push("ident", value, start);
      continue;
    }
    if (ch === "[") {
      const end = sql.indexOf("]", i + 1);
      const inner = end === -1 ? "" : sql.slice(i + 1, end);
      if (inner.trim() && !/^\s*\d*\s*$/.test(inner) && !inner.includes("\n")) {
        i = end + 1;
        push("ident", inner, start);
        continue;
      }
      i++;
      push("punct", ch, start);
      continue;
    }

    if (ch === "$") {
      const match = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64));
      if (match) {
        const tag = match[0];
        const end = sql.indexOf(tag, i + tag.length);
        const value = sql.slice(i + tag.length, end === -1 ? n : end);
        i = end === -1 ? n : end + tag.length;
        push("string", value, start);
        continue;
      }
    }

    if (/[0-9]/.test(ch)) {
      while (i < n && /[0-9.]/.test(sql[i])) i++;
      push("number", sql.slice(start, i), start);
      continue;
    }

    if (WORD_START.test(ch)) {
      while (i < n && WORD_PART.test(sql[i])) i++;
      push("word", sql.slice(start, i), start);
      continue;
    }

    i++;
    push("punct", ch, start);
  }

  if (current.length) statements.push(current);
  return statements;
}

export class Cursor {
  pos = 0;
  readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  get done() {
    return this.pos >= this.tokens.length;
  }

  peek(offset = 0): Token | undefined {
    return this.tokens[this.pos + offset];
  }

  next(): Token | undefined {
    return this.tokens[this.pos++];
  }

  isWord(word: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token?.kind === "word" && token.value.toUpperCase() === word;
  }

  isPunct(value: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token?.kind === "punct" && token.value === value;
  }

  acceptWords(...words: string[]): boolean {
    if (!words.every((word, index) => this.isWord(word, index))) return false;
    this.pos += words.length;
    return true;
  }

  acceptPunct(value: string): boolean {
    if (!this.isPunct(value)) return false;
    this.pos++;
    return true;
  }

  readName(): string | null {
    const first = this.next();
    if (!first || (first.kind !== "word" && first.kind !== "ident" && first.kind !== "string")) {
      return null;
    }
    let name = first.value;
    while (this.isPunct(".")) {
      this.pos++;
      const part = this.next();
      if (!part) break;
      name = part.value;
    }
    return name;
  }

  skipGroup(): Token[] {
    const inner: Token[] = [];
    if (!this.isPunct("(")) return inner;
    let depth = 0;
    while (!this.done) {
      const token = this.next()!;
      if (token.kind === "punct" && token.value === "(") {
        depth++;
        if (depth === 1) continue;
      } else if (token.kind === "punct" && token.value === ")") {
        depth--;
        if (depth === 0) break;
      }
      inner.push(token);
    }
    return inner;
  }

  readNameList(): string[] {
    return splitTopLevel(this.skipGroup())
      .map((part) => part.find((t) => t.kind === "word" || t.kind === "ident")?.value)
      .filter((name): name is string => !!name);
  }
}

export function splitTopLevel(tokens: Token[]): Token[][] {
  const parts: Token[][] = [];
  let current: Token[] = [];
  let depth = 0;

  for (const token of tokens) {
    if (token.kind === "punct") {
      if (token.value === "(") depth++;
      else if (token.value === ")") depth--;
      else if (token.value === "," && depth === 0) {
        parts.push(current);
        current = [];
        continue;
      }
    }
    current.push(token);
  }
  if (current.length) parts.push(current);
  return parts;
}

