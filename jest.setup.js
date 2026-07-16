// Jest 全局环境 setup。AsyncStorage 原生模块在 Jest 下不存在,用官方提供的内存版 mock 替代
// (lib/auth.test.tsx 是第一个真正间接 import 到它的测试——此前所有 jest 测试都没碰到这条路径,
// 这个洞一直没暴露;@react-native-async-storage/async-storage 官方文档指定的标准接法)。
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
