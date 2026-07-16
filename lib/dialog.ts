import { Alert, Platform } from 'react-native';

// 跨端确认/提示。
// ⚠️ react-native-web 的 Alert.alert 不渲染带按钮的弹窗、onPress 回调在 web 不触发
//    → 管理端的「确认/提取/删除」在网页版表现为"没反应"。这里按端分流:
//    web 用浏览器原生 confirm/alert(可靠、阻塞),原生(iOS/Android)用 RN Alert。

const join = (title: string, message?: string) => [title, message].filter(Boolean).join('\n\n');

// 确认框 → Promise<boolean>(确定=true / 取消=false)。
export function confirmAsync(title: string, message?: string, confirmText = '确定', cancelText = '取消'): Promise<boolean> {
  if (Platform.OS === 'web') {
    // fail-safe非fail-open:环境没给confirm能力时当"取消"处理,不可逆操作宁可挡住不该挡的,
    // 不能反过来放行不该放的(2026-07-13发现·此前默认true=当已确认,方向反了)。
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') return Promise.resolve(false);
    return Promise.resolve(window.confirm(join(title, message)));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, onPress: () => resolve(true) },
    ]);
  });
}

// 提示框(单按钮)。onClose 可选(关闭后回调,如返回上页)。
export function notify(title: string, message?: string, onClose?: () => void): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(join(title, message));
    onClose?.();
    return;
  }
  Alert.alert(title, message, [{ text: '确定', onPress: () => onClose?.() }]);
}
