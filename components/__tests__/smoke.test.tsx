// 冒烟测试：证明 jest-expo preset + React Native Testing Library 渲染链路可用。
// 用自包含的内联组件，不依赖 app 的 provider/路由，故稳定。
// 只用 RNTL 核心 API（getByText/getByTestId）+ jest 核心匹配器，不引入 jest-native 扩展匹配器。
import { render } from '@testing-library/react-native';
import { Text, View } from 'react-native';

function Hello({ name }: { name: string }) {
  return (
    <View>
      <Text testID="greeting">你好，{name}</Text>
    </View>
  );
}

describe('RNTL 渲染冒烟', () => {
  // ⚠️ RNTL v14 起 render/rerender/unmount/act 均为 async，必须 await（对齐 React 19 异步 act）。
  test('渲染后能按文本和 testID 取到节点', async () => {
    const { getByText, getByTestId } = await render(<Hello name="师兄" />);
    expect(getByText('你好，师兄')).toBeTruthy();
    expect(getByTestId('greeting')).toBeTruthy();
  });
});
