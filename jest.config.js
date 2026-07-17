// 单元 + 组件测试（jest-expo preset）。不含 JWT 集成测试（见 jest.integration.config.js）。
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // 集成测试单独用 node 环境的 config 跑，这里排除掉
  testPathIgnorePatterns: ['/node_modules/', '/tests/integration/', '/e2e/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|nativewind|react-native-svg|lucide-react-native|@tanstack/.*))',
  ],
};
