import type { SupabaseClient } from "@supabase/supabase-js";

const MISSING_COLUMN_PATTERN =
  /Could not find the '([^']+)' column of '([^']+)' in the schema cache/i;

function getMissingColumn(error: any, table: string) {
  const message = String(error?.message ?? "");
  const match = message.match(MISSING_COLUMN_PATTERN);
  if (!match) return null;

  const [, column, sourceTable] = match;
  if (sourceTable && sourceTable !== table) return null;
  return column;
}

export async function insertSingleRowWithSchemaFallback<T = any>(
  client: SupabaseClient,
  table: string,
  row: Record<string, any>,
  select = "*"
): Promise<{
  data: T | null;
  error: any;
  removedColumns: string[];
}> {
  const payload: Record<string, any> = { ...row };
  const removedColumns: string[] = [];

  while (true) {
    const { data, error } = await client
      .from(table)
      .insert(payload)
      .select(select)
      .single();

    if (!error) {
      return {
        data: (data as T) ?? null,
        error: null,
        removedColumns,
      };
    }

    const missingColumn = getMissingColumn(error, table);
    if (!missingColumn || !(missingColumn in payload)) {
      return { data: null, error, removedColumns };
    }

    if (removedColumns.includes(missingColumn)) {
      return { data: null, error, removedColumns };
    }

    delete payload[missingColumn];
    removedColumns.push(missingColumn);
  }
}
