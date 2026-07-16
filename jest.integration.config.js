// JWT/PostgREST 集成测试（node 环境）。前置：本地 Supabase 栈在运行
//   bash scripts/supabase-local.sh start
// 跑：npm run test:integration
// 与单元测试分开（不同 testEnvironment、需真实栈、跑得慢）。
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/integration'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['babel-jest', { presets: ['babel-preset-expo'] }],
  },
  testTimeout: 30000,
};
