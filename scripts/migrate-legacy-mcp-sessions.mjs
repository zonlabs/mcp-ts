import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function toNullable(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function toBoolean(value) {
  const trimmed = toNullable(value);
  if (trimmed === null) return false;
  return trimmed.toLowerCase() === "true";
}

function parseJsonOrNull(value, label, sessionId) {
  const trimmed = toNullable(value);
  if (trimmed === null) return null;

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Invalid JSON in ${label} for session ${sessionId}: ${message}`);
  }
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";

  if (typeof value === "object") {
    const json = JSON.stringify(value).replace(/'/g, "''");
    return `'${json}'::jsonb`;
  }

  const text = String(value).replace(/'/g, "''");
  return `'${text}'`;
}

function buildUpsert(tableName, columns, rows, conflictColumns, updateColumns) {
  if (rows.length === 0) {
    return `-- No rows for ${tableName}\n`;
  }

  const columnList = columns.join(", ");
  const valueLines = rows.map((row) => {
    const values = columns.map((column) => sqlLiteral(row[column]));
    return `  (${values.join(", ")})`;
  });

  return [
    `INSERT INTO public.${tableName} (${columnList})`,
    "VALUES",
    valueLines.join(",\n"),
    `ON CONFLICT (${conflictColumns.join(", ")}) DO UPDATE SET`,
    updateColumns.map((column) => `  ${column} = EXCLUDED.${column}`).join(",\n"),
    ";",
    "",
  ].join("\n");
}

async function upsertRows(supabase, tableName, rows, conflictColumns) {
  if (rows.length === 0) return;

  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from(tableName)
      .upsert(batch, { onConflict: conflictColumns.join(",") });

    if (error) {
      throw new Error(`Failed to upsert ${tableName}: ${error.message}`);
    }
  }
}

function mapLegacyRow(raw, index) {
  const sessionId = toNullable(raw.session_id);
  const userId = toNullable(raw.user_id);

  if (!sessionId) {
    throw new Error(`Row ${index + 2} is missing session_id`);
  }
  if (!userId) {
    throw new Error(`Row ${index + 2} is missing user_id`);
  }

  const createdAt = toNullable(raw.created_at);
  const updatedAt = toNullable(raw.updated_at);

  return {
    session: {
      id: toNullable(raw.id),
      session_id: sessionId,
      user_id: userId,
      server_id: toNullable(raw.server_id),
      server_name: toNullable(raw.server_name),
      server_url: toNullable(raw.server_url),
      transport_type: toNullable(raw.transport_type),
      callback_url: toNullable(raw.callback_url),
      created_at: createdAt,
      updated_at: updatedAt,
      expires_at: toNullable(raw.expires_at),
      status: toBoolean(raw.active) ? "active" : "pending",
      headers: parseJsonOrNull(raw.headers, "headers", sessionId),
      auth_url: null,
    },
    credential: {
      session_id: sessionId,
      user_id: userId,
      client_information: parseJsonOrNull(
        raw.client_information,
        "client_information",
        sessionId
      ),
      tokens: parseJsonOrNull(raw.tokens, "tokens", sessionId),
      code_verifier: toNullable(raw.code_verifier),
      client_id: toNullable(raw.client_id),
      oauth_state: null,
      created_at: createdAt,
      updated_at: updatedAt,
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  const shouldExecute = args.includes("--execute");
  const positionalArgs = args.filter((arg) => arg !== "--execute");
  const inputPath = positionalArgs[0];
  const defaultOutputPath = path.resolve(
    import.meta.dirname,
    "..",
    "supabase",
    "legacy-mcp-session-import.sql"
  );
  const outputPath =
    positionalArgs[1] ?? defaultOutputPath;

  if (!inputPath) {
    console.error(
      "Usage: node scripts/migrate-legacy-mcp-sessions.mjs <legacy-csv-path> [output-sql-path]"
    );
    process.exit(1);
  }

  const csvText = fs.readFileSync(inputPath, "utf8");
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    throw new Error("CSV did not contain a header row and data rows");
  }

  const headers = rows[0];
  const dataRows = rows.slice(1).filter((row) => row.some((value) => value.trim() !== ""));

  const mappedRows = dataRows.map((row, index) => {
    const record = Object.fromEntries(headers.map((header, i) => [header, row[i] ?? ""]));
    return mapLegacyRow(record, index);
  });

  const sessionRows = mappedRows.map((item) => item.session);
  const credentialRows = mappedRows.filter((item) => {
    const hasSecrets =
      item.credential.client_information !== null ||
      item.credential.tokens !== null ||
      item.credential.code_verifier !== null ||
      item.credential.client_id !== null;
    return hasSecrets;
  }).map((item) => item.credential);

  const sql = [
    "-- Generated by scripts/migrate-legacy-mcp-sessions.mjs",
    `-- Source CSV: ${inputPath}`,
    `-- Generated at: ${new Date().toISOString()}`,
    "",
    "BEGIN;",
    "",
    buildUpsert(
      "mcp_sessions",
      [
        "id",
        "session_id",
        "user_id",
        "server_id",
        "server_name",
        "server_url",
        "transport_type",
        "callback_url",
        "created_at",
        "updated_at",
        "expires_at",
        "status",
        "headers",
        "auth_url",
      ],
      sessionRows,
      ["user_id", "session_id"],
      [
        "id",
        "server_id",
        "server_name",
        "server_url",
        "transport_type",
        "callback_url",
        "created_at",
        "updated_at",
        "expires_at",
        "status",
        "headers",
        "auth_url",
      ]
    ),
    buildUpsert(
      "mcp_credentials",
      [
        "session_id",
        "user_id",
        "client_information",
        "tokens",
        "code_verifier",
        "client_id",
        "oauth_state",
        "created_at",
        "updated_at",
      ],
      credentialRows,
      ["user_id", "session_id"],
      [
        "client_information",
        "tokens",
        "code_verifier",
        "client_id",
        "oauth_state",
        "created_at",
        "updated_at",
      ]
    ),
    "COMMIT;",
    "",
  ].join("\n");

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, sql, "utf8");

  return {
    inputPath,
    outputPath,
    sessionRows,
    credentialRows,
    shouldExecute,
  };
}

try {
  const result = main();
  if (result instanceof Promise) {
    throw new Error("Unexpected async return from main()");
  }

  if (result.shouldExecute) {
    const supabaseUrl =
      process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        "--execute requires SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY"
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    await upsertRows(
      supabase,
      "mcp_sessions",
      result.sessionRows,
      ["user_id", "session_id"]
    );
    await upsertRows(
      supabase,
      "mcp_credentials",
      result.credentialRows,
      ["user_id", "session_id"]
    );
  }

  console.log(
    JSON.stringify(
      {
        inputPath: result.inputPath,
        outputPath: result.outputPath,
        sessionRows: result.sessionRows.length,
        credentialRows: result.credentialRows.length,
        executed: result.shouldExecute,
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
