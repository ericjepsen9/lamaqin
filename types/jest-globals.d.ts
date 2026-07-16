// 让 tsc 认识 jest 全局（describe/test/expect 等），不影响 expo 的自动类型包含。
// 用 triple-slash reference 注入，比在 tsconfig 里写 "types":[] 更安全（后者会关掉自动 @types 包含）。
/// <reference types="jest" />
