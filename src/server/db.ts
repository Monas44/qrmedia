import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';

export type SqlValue = SQLInputValue;

/**
 * Camada fina sobre o SQLite nativo do Node (node:sqlite). A interface é
 * assíncrona e no formato prepare().bind().first/all/run + batch, para que os
 * repositórios não dependam do driver.
 */
export interface Statement {
  bind(...values: SQLInputValue[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ changes: number }>;
}

export interface Database {
  prepare(sql: string): Statement;
  /** Executa as instruções numa única transação; retorna as linhas de cada uma. */
  batch<T = Record<string, unknown>>(statements: Statement[]): Promise<{ results: T[] }[]>;
  exec(sql: string): void;
  close(): void;
}

// Linhas do node:sqlite vêm com protótipo nulo; normaliza para objetos comuns.
const plain = <T>(row: unknown) => ({ ...(row as object) }) as T;

class SqliteStatement implements Statement {
  constructor(
    private readonly stmt: StatementSync,
    private readonly values: SQLInputValue[] = [],
  ) {}

  bind(...values: SQLInputValue[]): Statement {
    return new SqliteStatement(this.stmt, values);
  }

  async first<T>(): Promise<T | null> {
    const row = this.stmt.get(...this.values);
    return row ? plain<T>(row) : null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.stmt.all(...this.values).map((r) => plain<T>(r)) };
  }

  async run(): Promise<{ changes: number }> {
    return { changes: Number(this.stmt.run(...this.values).changes) };
  }

  /** Usado pelo batch: executa e devolve linhas (vazio para INSERT/UPDATE sem RETURNING). */
  rows<T>(): T[] {
    return this.stmt.all(...this.values).map((r) => plain<T>(r));
  }
}

class SqliteDatabase implements Database {
  constructor(private readonly db: DatabaseSync) {}

  prepare(sql: string): Statement {
    return new SqliteStatement(this.db.prepare(sql));
  }

  async batch<T>(statements: Statement[]): Promise<{ results: T[] }[]> {
    this.db.exec('BEGIN');
    try {
      const out = statements.map((s) => ({ results: (s as SqliteStatement).rows<T>() }));
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  close(): void {
    this.db.close();
  }
}

export function openDatabase(path: string): Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
  return new SqliteDatabase(db);
}

/** Aplica, em ordem, os arquivos .sql de `dir` que ainda não foram aplicados. */
export function migrate(db: Database, dir: string): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];

  for (const name of files) {
    const done = (db as SqliteDatabase).prepare('SELECT 1 AS ok FROM _migrations WHERE name = ?1').bind(name) as SqliteStatement;
    if (done.rows().length > 0) continue;
    const sql = readFileSync(join(dir, name), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      (db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?1, ?2)').bind(name, new Date().toISOString()) as SqliteStatement).rows();
      db.exec('COMMIT');
      applied.push(name);
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Falha na migration ${name}: ${String(err)}`);
    }
  }
  return applied;
}
