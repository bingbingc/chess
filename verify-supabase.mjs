import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

let supabaseUrl = '';
let supabaseAnonKey = '';

// Try to read from .env.local
try {
    const envPath = path.resolve('.env.local');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const lines = envContent.split('\n');
        for (const line of lines) {
            if (line.includes('NEXT_PUBLIC_SUPABASE_URL=')) {
                supabaseUrl = line.split('=')[1].trim().replace(/['"]/g, '');
            }
            if (line.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) {
                supabaseAnonKey = line.split('=')[1].trim().replace(/['"]/g, '');
            }
        }
    }
} catch (err) {
    console.log('Note: Could not read .env.local file directly.');
}

// Fallback to arguments
const args = process.argv.slice(2);
supabaseUrl = args[0] || supabaseUrl;
supabaseAnonKey = args[1] || supabaseAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Error: Supabase URL or Anon Key is missing.');
    console.log('\nUsage: node verify-supabase.mjs <URL> <ANON_KEY>');
    console.log('Or ensure .env.local is present in the current directory.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function verify() {
    console.log('\n--- Supabase Diagnostic ---');
    console.log(`URL: ${supabaseUrl}`);

    try {
        // 1. Test Connection / Basic Select
        console.log('\n1. Testing SELECT from "games" table...');
        const { data, error } = await supabase.from('games').select('*').limit(1);

        if (error) {
            console.error('❌ SELECT Failed:', error.message);
            console.log('Status code:', error.status);
            if (error.status === 401) {
                console.log('💡 Tip: 401 Unauthorized usually means the ANON_KEY is invalid or the "anon" role lacks SELECT permissions.');
            }
        } else {
            console.log('✅ SELECT Successful (Connection is working)');
            console.log('Items found in games table:', data.length);
        }

        // 2. Test Anonymous Insert
        console.log('\n2. Testing anonymous INSERT into "games" table...');
        const { data: insertData, error: insertError } = await supabase
            .from('games')
            .insert({ status: 'waiting', fen: 'start_fen' })
            .select();

        if (insertError) {
            console.error('❌ INSERT Failed:', insertError.message);
            console.log('Status code:', insertError.status);
            if (insertError.status === 401 || insertError.status === 403) {
                console.log('💡 Tip: This confirms RLS or Permissions are blocking inserts.');
            }
        } else {
            console.log('✅ INSERT Successful (Anonymous RLS is correctly configured)');
            if (insertData?.[0]?.id) {
                console.log('Cleaning up test data...');
                await supabase.from('games').delete().eq('id', insertData[0].id);
                console.log('✅ Cleanup successful.');
            }
        }
    } catch (err) {
        console.error('❌ Unexpected Error:', err.message);
    }
}

verify();
