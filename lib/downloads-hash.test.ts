import { extensionFromUrl, hashUrl, localFileNameFor } from './downloads-hash';

describe('hashUrl', () => {
  it('同一 URL 每次算出同一哈希(可判"是否已下载")', () => {
    const u = 'https://cdn.example.com/audio/lesson-1.mp3';
    expect(hashUrl(u)).toBe(hashUrl(u));
  });

  it('不同 URL 算出不同哈希', () => {
    expect(hashUrl('https://a.com/1.mp3')).not.toBe(hashUrl('https://a.com/2.mp3'));
  });
});

describe('extensionFromUrl', () => {
  it('取末尾扩展名(忽略 query/hash)', () => {
    expect(extensionFromUrl('https://a.com/audio/x.mp3')).toBe('.mp3');
    expect(extensionFromUrl('https://a.com/img/slide-3.PNG?token=abc')).toBe('.png');
    expect(extensionFromUrl('https://a.com/img/slide-3.jpg#frag')).toBe('.jpg');
  });

  it('没有扩展名时返回空字符串', () => {
    expect(extensionFromUrl('https://a.com/audio/stream')).toBe('');
  });
});

describe('localFileNameFor', () => {
  it('哈希 + 扩展名拼成文件名,同一 URL 稳定不变', () => {
    const u = 'https://cdn.example.com/slides/page-1.jpg';
    const name = localFileNameFor(u);
    expect(name).toBe(localFileNameFor(u));
    expect(name.endsWith('.jpg')).toBe(true);
  });
});
