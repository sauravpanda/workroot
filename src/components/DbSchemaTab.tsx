import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/db-schema.css";

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
}

interface DbSchemaTabProps {
  worktreeId: number;
}

export function DbSchemaTab({ worktreeId }: DbSchemaTabProps) {
  const [schema, setSchema] = useState<SchemaInfo | null>(null);
  const [dbConfig, setDbConfig] = useState<DbConfig | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSchema = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const config = await invoke<DbConfig | null>(
        "detect_worktree_database",
        { worktreeId }
      );
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
    loadSchema();
  }, [loadSchema]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const result = await invoke<SchemaInfo | null>("refresh_db_schema", {
        worktreeId,
      });
      setSchema(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="db-schema-loading">Detecting database...</div>;
  }

  if (!dbConfig) {
    return (
      <div className="db-schema-empty">
        <div className="db-schema-empty-icon">DB</div>
        <p>No database detected</p>
        <p className="db-schema-empty-hint">
          Add a DATABASE_URL environment variable to connect
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="db-schema-error">
        <p>Error: {error}</p>
        <button onClick={loadSchema}>Retry</button>
      </div>
    );
  }

  const tables = schema?.tables || [];
  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const activeTable = tables.find((t) => t.name === selectedTable);

  return (
    <div className="db-schema">
      <div className="db-schema-header">
        <div className="db-schema-status">
          <span className="db-schema-type">{dbConfig.db_type}</span>
          <span className="db-schema-db">
            {dbConfig.database || dbConfig.host || "connected"}
          </span>
        </div>
        <button className="db-schema-refresh" onClick={handleRefresh}>
          Refresh
        </button>
      </div>

      <div className="db-schema-body">
        <div className="db-schema-sidebar">
          <input
            type="text"
            className="db-schema-search"
            placeholder="Filter tables..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="db-schema-table-list">
            {filteredTables.map((table) => (
              <div
                key={table.name}
                className={`db-schema-table-item ${
                  selectedTable === table.name ? "active" : ""
                }`}
                onClick={() => setSelectedTable(table.name)}
              >
                <span className="db-table-name">{table.name}</span>
                {table.row_count !== null && (
                  <span className="db-table-count">
                    {table.row_count.toLocaleString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="db-schema-detail">
          {activeTable ? (
            <>
              <h3 className="db-detail-title">{activeTable.name}</h3>
              {activeTable.row_count !== null && (
                <p className="db-detail-meta">
                  {activeTable.row_count.toLocaleString()} rows
                </p>
              )}

              <table className="db-columns-table">
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Type</th>
                    <th>Nullable</th>
                    <th>Default</th>
                  </tr>
                </thead>
                <tbody>
                  {activeTable.columns.map((col) => (
                    <tr key={col.name}>
                      <td>
                        {col.is_primary_key && (
                          <span className="db-pk-icon" title="Primary Key">
                            PK{" "}
                          </span>
                        )}
                        {col.name}
                      </td>
                      <td className="db-col-type">{col.data_type}</td>
                      <td>{col.nullable ? "Yes" : "No"}</td>
                      <td className="db-col-default">
                        {col.default_value || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {activeTable.foreign_keys.length > 0 && (
                <>
                  <h4 className="db-section-title">Foreign Keys</h4>
                  <ul className="db-fk-list">
                    {activeTable.foreign_keys.map((fk, i) => (
                      <li key={i}>
                        <code>{fk.column}</code> &rarr;{" "}
                        <span
                          className="db-fk-link"
                          onClick={() => setSelectedTable(fk.references_table)}
                        >
                          {fk.references_table}.{fk.references_column}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {activeTable.indexes.length > 0 && (
                <>
                  <h4 className="db-section-title">Indexes</h4>
                  <ul className="db-index-list">
                    {activeTable.indexes.map((idx) => (
                      <li key={idx.name}>
                        <code>{idx.name}</code>
                        {idx.unique && (
                          <span className="db-unique-badge">UNIQUE</span>
                        )}
                        <span className="db-index-cols">
                          ({idx.columns.join(", ")})
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <div className="db-detail-placeholder">
              Select a table to view its schema
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
