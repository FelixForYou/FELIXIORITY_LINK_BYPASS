import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlRedirect, queryRedirect, publicError, resolveShortlink } from '../lib/resolve.mjs';

test('Reads explicit redirect parameter on known shortener', () => {
  const url = new URL('https://bit.ly/abc?url=' + encodeURIComponent('https://example.com/target?a=1'));
  assert.equal(queryRedirect(url).href, 'https://example.com/target?a=1');
});
test('Does not follow unrelated query values on regular websites', () => {
  assert.equal(queryRedirect(new URL('https://example.com/search?url=https://other.com')), null);
});
test('Reads meta-refresh destination without executing scripts', () => {
  const output = htmlRedirect('<meta http-equiv="refresh" content="0; url=https://example.org/download">', new URL('https://sfl.gl/abc'));
  assert.equal(output.url.href, 'https://example.org/download');
});
test('Reads simple browser redirect syntax', () => {
  const output = htmlRedirect('<script>window.location.href="https://example.org/d"</script>', new URL('https://short.example/'));
  assert.equal(output.url.href, 'https://example.org/d');
});
test('Blocks localhost without making network requests', async () => {
  await assert.rejects(resolveShortlink('http://127.0.0.1/admin'), { code:'BLOCKED_TARGET' });
  await assert.rejects(resolveShortlink('http://localhost'), { code:'BLOCKED_TARGET' });
  await assert.rejects(resolveShortlink('http://10.0.0.4'), { code:'BLOCKED_TARGET' });
});
test('Rejects unsafe URL schemes and credentials', async () => {
  await assert.rejects(resolveShortlink('file:///etc/passwd'), { code:'INVALID_URL' });
  await assert.rejects(resolveShortlink('http://user:pass@example.com'), { code:'INVALID_URL' });
  await assert.rejects(resolveShortlink('http://example.com:8000'), { code:'BLOCKED_TARGET' });
});
test('Public error never leaks stack traces', () => {
  assert.equal(publicError(new Error('private secret')).body.message, 'Terjadi gangguan saat memproses link. Silakan coba lagi.');
});
