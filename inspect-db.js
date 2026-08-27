const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabaseUrl = 'https://khidzfgthgqvgklwjqzq.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectSchema() {
  try {
    // Query tables using raw RPC
    console.log('\n=== Checking for autonomous tables ===');
    const { data, error } = await supabase.rpc('execute_sql', {
      sql: `
        SELECT table_schema, table_name, column_name, data_type
        FROM information_schema.tables t
        LEFT JOIN information_schema.columns c ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE table_name ILIKE '%autonomous%'
        ORDER BY t.table_schema, t.table_name, c.ordinal_position
      `
    }).catch(() => null);

    if (data) console.log(JSON.stringify(data, null, 2));
    if (error) console.log('Error:', error);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

inspectSchema();
