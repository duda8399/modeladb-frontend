import { splitTopLevel, tokenize, type Token } from "./sqlTokenizer";

export type ViewAnalysis = {
  tables: string[];
  columns: string[];
};

const FROM_STOP_WORDS = new Set([
  "WHERE", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "CROSS", "FULL", "NATURAL",
  "ON", "USING", "GROUP", "ORDER", "LIMIT", "HAVING", "UNION", "INTERSECT", "EXCEPT",
  "WINDOW", "OFFSET", "FETCH", "FOR", "LATERAL", "STRAIGHT_JOIN", "AS", "WITH",
]);

const CLAUSE_END_WORDS = new Set([
  "WHERE", "GROUP", "ORDER", "HAVING", "LIMIT", "UNION", "INTERSECT", "EXCEPT",
  "WINDOW", "OFFSET", "FETCH", "RETURNING",
]);

const isWord = (token: Token | undefined, word: string) =>
  token?.kind === "word" && token.value.toUpperCase() === word;

const isPunct = (token: Token | undefined, value: string) =>
  token?.kind === "punct" && token.value === value;

const isName = (token: Token | undefined) =>
  !!token && (token.kind === "ident" || (token.kind === "word" && !FROM_STOP_WORDS.has(token.value.toUpperCase())));

function skipGroup(tokens: Token[], open: number): number {
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    if (isPunct(tokens[i], "(")) depth++;
    else if (isPunct(tokens[i], ")") && --depth === 0) return i + 1;
  }
  return tokens.length;
}

function readQualifiedName(tokens: Token[], index: number): { name: string; next: number } | null {
  if (!isName(tokens[index])) return null;
  let name = tokens[index].value;
  let i = index + 1;
  while (isPunct(tokens[i], ".") && tokens[i + 1]) {
    name = tokens[i + 1].value;
    i += 2;
  }
  return { name, next: i };
}

function collectTables(tokens: Token[]): string[] {
  const cteNames = new Set<string>();
  const tables: string[] = [];
  const seen = new Set<string>();

  if (isWord(tokens[0], "WITH")) {
    let i = isWord(tokens[1], "RECURSIVE") ? 2 : 1;
    while (isName(tokens[i])) {
      cteNames.add(tokens[i].value.toLowerCase());
      i++;
      if (isPunct(tokens[i], "(")) i = skipGroup(tokens, i);
      if (!isWord(tokens[i], "AS")) break;
      i++;
      if (isWord(tokens[i], "NOT")) i++;
      if (isWord(tokens[i], "MATERIALIZED")) i++;
      if (!isPunct(tokens[i], "(")) break;
      i = skipGroup(tokens, i);
      if (!isPunct(tokens[i], ",")) break;
      i++;
    }
  }

  const add = (name: string) => {
    const key = name.toLowerCase();
    if (cteNames.has(key) || seen.has(key)) return;
    seen.add(key);
    tables.push(name);
  };

  const parenIsQuery: boolean[] = [];
  const fromActive: boolean[] = [false];
  const inQueryScope = () => parenIsQuery.length === 0 || parenIsQuery[parenIsQuery.length - 1];

  const readTableAt = (index: number) => {
    const ref = readQualifiedName(tokens, index);
    if (ref && !isPunct(tokens[ref.next], "(")) add(ref.name);
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (isPunct(token, "(")) {
      parenIsQuery.push(isWord(tokens[i + 1], "SELECT") || isWord(tokens[i + 1], "WITH"));
      fromActive[parenIsQuery.length] = false;
      continue;
    }
    if (isPunct(token, ")")) {
      parenIsQuery.pop();
      continue;
    }
    if (!inQueryScope()) continue;

    const depth = parenIsQuery.length;
    if (isWord(token, "FROM") || isWord(token, "JOIN")) {
      fromActive[depth] = true;
      readTableAt(i + 1);
    } else if (token.kind === "word" && CLAUSE_END_WORDS.has(token.value.toUpperCase())) {
      fromActive[depth] = false;
    } else if (fromActive[depth] && isPunct(token, ",")) {
      readTableAt(i + 1);
    }
  }

  return tables;
}

function collectColumns(sql: string, tokens: Token[]): string[] {
  let depth = 0;
  let selectAt = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (isPunct(tokens[i], "(")) depth++;
    else if (isPunct(tokens[i], ")")) depth--;
    else if (depth === 0 && isWord(tokens[i], "SELECT")) {
      selectAt = i;
      break;
    }
  }
  if (selectAt === -1) return [];

  let start = selectAt + 1;
  while (isWord(tokens[start], "DISTINCT") || isWord(tokens[start], "ALL")) start++;
  if (isWord(tokens[start], "ON") && isPunct(tokens[start + 1], "(")) {
    start = skipGroup(tokens, start + 1);
  }

  depth = 0;
  let end = start;
  for (; end < tokens.length; end++) {
    if (isPunct(tokens[end], "(")) depth++;
    else if (isPunct(tokens[end], ")")) depth--;
    else if (depth === 0 && (isWord(tokens[end], "FROM") || isWord(tokens[end], "INTO"))) break;
  }

  return splitTopLevel(tokens.slice(start, end))
    .filter((item) => item.length > 0)
    .map((item) => {
      const last = item[item.length - 1];
      const beforeLast = item[item.length - 2];

      if (isPunct(last, "*")) {
        return isPunct(beforeLast, ".") && item[item.length - 3]
          ? `${item[item.length - 3].value}.*`
          : "*";
      }
      if (isWord(beforeLast, "AS") && (last.kind === "word" || last.kind === "ident" || last.kind === "string")) {
        return last.value;
      }
      if (item.every((t, i) => (i % 2 === 0 ? t.kind === "word" || t.kind === "ident" : isPunct(t, ".")))) {
        return last.value;
      }
      if ((last.kind === "ident" || last.kind === "word") && !isPunct(beforeLast, ".") && !isPunct(beforeLast, "(")) {
        return last.value;
      }
      const text = sql.slice(item[0].start, last.end).replace(/\s+/g, " ");
      return text.length > 32 ? `${text.slice(0, 31)}…` : text;
    });
}

export function analyzeViewSql(sql: string): ViewAnalysis {
  const tokens = tokenize(sql ?? "")[0] ?? [];
  return { tables: collectTables(tokens), columns: collectColumns(sql ?? "", tokens) };
}
