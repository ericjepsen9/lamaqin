// 集成测试助手：读本地栈连接信息 + 用 jose 按本地 JWT 密钥签发各角色 token +
// 构造带该 token 的 supabase-js 客户端（走真实 PostgREST + Kong apikey + JWT 校验路径）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SignJWT } from 'jose';

// 固定测试用户 UUID（与 supabase/tests/01_seed.sql 对齐，便于心智映射）
export const USER_A = '44444444-4444-4444-4444-444444444444'; // 正式师兄 stu1（A 班）
export const USER_B = '55555555-5555-5555-5555-555555555555'; // 正式师兄 stu2（A 班）

function parseEnvFile(): Record<string, string> {
  const path = join(process.cwd(), '.env.local.supabase');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      '缺少 .env.local.supabase（本地栈连接信息）。先跑：bash scripts/supabase-local.sh start，' +
        '再 npx supabase status -o env > .env.local.supabase',
    );
  }
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}

const env = parseEnvFile();
export const API_URL = env.API_URL;
export const ANON_KEY = env.ANON_KEY;
export const DB_URL = env.DB_URL;
const JWT_SECRET = env.JWT_SECRET;

// 签发一枚 authenticated 角色的用户 JWT（HS256，claims 对齐 Supabase：sub/role/aud）。
export async function signUserJwt(userId: string): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return new SignJWT({ role: 'authenticated', sub: userId, aud: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}

// 以某用户身份构造客户端：apikey=anon（过 Kong）+ Authorization=Bearer 用户JWT（PostgREST 据此定 auth.uid）。
export async function clientAs(userId: string): Promise<SupabaseClient> {
  const jwt = await signUserJwt(userId);
  return createClient(API_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

// 匿名客户端（只有 anon key，无用户身份）。
export function anonClient(): SupabaseClient {
  return createClient(API_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
