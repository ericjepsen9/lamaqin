import { defineConfig, devices } from '@playwright/test';

// 只跑本地Docker Supabase栈(需先 bash scripts/supabase-local.sh start)。
// 用独立端口8082,不与开发者手动起的 npm run web(默认8081,可能连sss-dev)冲突混淆。
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false, // 全部测试共用同一份种子数据(同一学员/班级),并发跑会互相踩脏状态
  workers: 1,
  retries: 0,
  timeout: 90_000, // 默认30s对Metro偶发冷编译/慢路由偏紧;2026-07-10接CI实测第一条测试冷编译吃满60s还不够,
  // 再放宽一档(非app问题)。globalSetup 里也加了预热请求把大头编译成本转嫁过去,这里留作兜底余量。
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8082',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx expo start --web --port 8082',
    url: 'http://127.0.0.1:8082',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      EXPO_PUBLIC_SUPABASE_URL: LOCAL_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: LOCAL_ANON_KEY,
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
