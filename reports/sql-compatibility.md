# Compatibilidade do SQL exportado

Gerado por `npm run test:sql-engines` em 2026-11-15T21:51:45.873Z (MySQL 8.4, PostgreSQL 16).

| Tipo | Simples MySQL | Simples PG | UNIQUE MySQL | UNIQUE PG | PK MySQL | PK PG |
|---|---|---|---|---|---|---|
| TINYINT | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| SMALLINT | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| MEDIUMINT | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| INT | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| BIGINT | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| DECIMAL | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| FLOAT | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| DOUBLE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| BIT | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| DATE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| DATETIME | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| TIMESTAMP | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| TIME | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| YEAR | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| CHAR | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| VARCHAR | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| TINYTEXT | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| TEXT | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| MEDIUMTEXT | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| LONGTEXT | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| ENUM | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| SET | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| BINARY | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| VARBINARY | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| TINYBLOB | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| BLOB | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| MEDIUMBLOB | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| LONGBLOB | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| BOOLEAN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| JSON | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| GEOMETRY | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| POINT | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
