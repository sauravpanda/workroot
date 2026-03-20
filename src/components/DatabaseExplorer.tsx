import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/database-explorer.css";

interface ColumnInfo {
  name: string;
  data_type: string;
  nullable: boolean;
  default_value: string | null;
  is_primary_key: boolean;
}

interface ForeignKeyInfo {
  column: string;
  references_table: string;
  references_column: string;
}

interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
}

interface TableInfo {
  name: string;
  row_count: number | null;
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  foreign_keys: ForeignKeyInfo[];
}

interface SchemaInfo {
  db_type: string;
  tables: TableInfo[];
}

interface DbConfig {
  db_type: string;
  url: string;
  host: string | null;
  port: number | null;
  database: string | null;
  username: string | null;
}

interface DatabaseExplorerProps {
  worktreeId: number;
  onClose: () => void;
}

export function DatabaseExplorer({
  worktreeId,
  onClose,
}: DatabaseExplorerProps) {
  const [dbConfig, setDbConfig] = useState<DbConfig | null>(null);
  const [schema, setSchema] = useState<SchemaInfo | null>(null);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const config = await invoke<DbConfig | null>("detect_worktree_database", {
        worktreeId,
      });
      setDbConfig(config);

      if (config) {
        const result = await invoke<SchemaInfo | null>("get_db_schema", {
          worktreeId,
        });
        setSchema(result);
      } else {
        setSchema(null);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [worktreeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const result = await invoke<SchemaInfo | null>("refresh_db_schema", {
        worktreeId,
      });
      setSchema(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setRefreshing(false);
    }
  };

  const toggleTable = (tableName: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableName)) {
        next.delete(tableName);
      } else {
        next.add(tableName);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (schema) {
      setExpandedTables(new Set(schema.tables.map((t) => t.name)));
    }
  };

  const collapseAll = () => {
    setExpandedTables(new Set());
  };

  const dbTypeLabel = (type: string): string => {
    switch (type) {
      case "postgres":
        return "PostgreSQL";
      case "sqlite":
        return "SQLite";
      case "mysql":
        return "MySQL";
      default:
        return type;
    }
  };

  if (loading) {
    return (
      <div className="database-explorer">
        <div className="database-explorer__header">
          <span className="database-explorer__title">Database Explorer</span>
          <button className="database-explorer__close-btn" onClick={onClose}>
            x
          </button>
        </div>
        <div className="database-explorer__loading">Detecting database...</div>
      </div>
    );
  }

  if (!dbConfig) {
    return (
      <div className="database-explorer">
        <div className="database-explorer__header">
          <span className="database-explorer__title">Database Explorer</span>
          <button className="database-explorer__close-btn" onClick={onClose}>
            x
          </button>
        </div>
        <div className="database-explorer__empty">
          <div className="database-explorer__empty-icon">DB</div>
          <p>No database detected</p>
          <p className="database-explorer__empty-hint">
            Add a DATABASE_URL environment variable or place a .sqlite file in
            your project
          </p>
          <button className="database-explorer__retry-btn" onClick={loadData}>
            Retry Detection
          </button>
        </div>
      </div>
    );
  }

  const tables = schema?.tables || [];
  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="database-explorer">
      <div className="database-explorer__header">
        <span className="database-explorer__title">Database Explorer</span>
        <div className="database-explorer__header-actions">
          <button
            className="database-explorer__refresh-btn"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh Schema"}
          </button>
          <button className="database-explorer__close-btn" onClick={onClose}>
            x
          </button>
        </div>
      </div>

      {/* Connection info */}
      <div className="database-explorer__connection">
        <span className="database-explorer__db-type">
          {dbTypeLabel(dbConfig.db_type)}
        </span>
        {dbConfig.host && (
          <span className="database-explorer__connection-detail">
            {dbConfig.host}
            {dbConfig.port ? `:${dbConfig.port}` : ""}
          </span>
        )}
        {dbConfig.database && (
          <span className="database-explorer__connection-detail">
            {dbConfig.database}
          </span>
        )}
        {dbConfig.username && (
          <span className="database-explorer__connection-detail">
            {dbConfig.username}@
          </span>
        )}
      </div>

      {error && (
        <div className="database-explorer__error">
          <span>Error: {error}</span>
          <button onClick={loadData}>Retry</button>
        </div>
      )}

      {/* Toolbar */}
      <div className="database-explorer__toolbar">
        <input
          type="text"
          className="database-explorer__search"
          placeholder="Filter tables..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button className="database-explorer__expand-btn" onClick={expandAll}>
          Expand All
        </button>
        <button className="database-explorer__expand-btn" onClick={collapseAll}>
          Collapse
        </button>
        <span className="database-explorer__table-count">
          {filteredTables.length} table
          {filteredTables.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Tree view */}
      <div className="database-explorer__tree">
        {filteredTables.length === 0 ? (
          <div className="database-explorer__no-tables">
            {searchQuery ? "No tables match filter" : "No tables found"}
          </div>
        ) : (
          filteredTables.map((table) => {
            const isExpanded = expandedTables.has(table.name);
            return (
              <div key={table.name} className="database-explorer__table-node">
                <div
                  className="database-explorer__table-header"
                  onClick={() => toggleTable(table.name)}
                >
                  <span className="database-explorer__chevron">
                    {isExpanded ? "\u25BE" : "\u25B8"}
                  </span>
                  <span className="database-explorer__table-icon">T</span>
                  <span className="database-explorer__table-name">
                    {table.name}
                  </span>
                  {table.row_count !== null && (
                    <span className="database-explorer__row-count">
                      {table.row_count.toLocaleString()} rows
                    </span>
                  )}
                </div>

                {isExpanded && (
                  <div className="database-explorer__table-body">
                    {/* Columns */}
                    {table.columns.map((col) => (
                      <div
                        key={col.name}
                        className="database-explorer__column-row"
                      >
                        <span className="database-explorer__column-indicators">
                          {col.is_primary_key && (
                            <span
                              className="database-explorer__pk-badge"
                              title="Primary Key"
                            >
                              PK
                            </span>
                          )}
                          {table.foreign_keys.some(
                            (fk) => fk.column === col.name,
                          ) && (
                            <span
                              className="database-explorer__fk-badge"
                              title="Foreign Key"
                            >
                              FK
                            </span>
                          )}
                        </span>
                        <span className="database-explorer__column-name">
                          {col.name}
                        </span>
                        <span className="database-explorer__column-type">
                          {col.data_type}
                        </span>
                        {col.nullable && (
                          <span className="database-explorer__nullable-badge">
                            NULL
                          </span>
                        )}
                        {col.default_value && (
                          <span
                            className="database-explorer__default-value"
                            title={`Default: ${col.default_value}`}
                          >
                            = {col.default_value}
                          </span>
                        )}
                      </div>
                    ))}

                    {/* Foreign keys detail */}
                    {table.foreign_keys.length > 0 && (
                      <div className="database-explorer__section">
                        <div className="database-explorer__section-title">
                          Foreign Keys
                        </div>
                        {table.foreign_keys.map((fk, i) => (
                          <div key={i} className="database-explorer__fk-detail">
                            <code>{fk.column}</code>
                            <span className="database-explorer__fk-arrow">
                              {"\u2192"}
                            </span>
                            <span
                              className="database-explorer__fk-ref"
                              onClick={() => {
                                setExpandedTables(
                                  (prev) =>
                                    new Set([...prev, fk.references_table]),
                                );
                              }}
                            >
                              {fk.references_table}.{fk.references_column}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Indexes */}
                    {table.indexes.length > 0 && (
                      <div className="database-explorer__section">
                        <div className="database-explorer__section-title">
                          Indexes
                        </div>
                        {table.indexes.map((idx) => (
                          <div
                            key={idx.name}
                            className="database-explorer__index-detail"
                          >
                            <code>{idx.name}</code>
                            {idx.unique && (
                              <span className="database-explorer__unique-badge">
                                UNIQUE
                              </span>
                            )}
                            <span className="database-explorer__index-cols">
                              ({idx.columns.join(", ")})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
