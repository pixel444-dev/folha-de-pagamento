import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chaveParaQr, codigoPix, faltaParaQr } from './pix.js';

test('exemplo do manual do Banco Central (QR estático sem valor)', () => {
  assert.equal(
    codigoPix({ tipo: 'Aleatória', chave: '123e4567-e12b-12d1-a456-426655440000', nome: 'Fulano de Tal', cidade: 'BRASILIA' }),
    '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D',
  );
});

test('chave no formato do Pix', () => {
  assert.equal(chaveParaQr('CPF', '123.456.789-09'), '12345678909');
  assert.equal(chaveParaQr('CPF', '2345678909'), null);
  assert.equal(chaveParaQr('CNPJ', '12.345.678/0001-90'), '12345678000190');
  assert.equal(chaveParaQr('Telefone', '(88) 99999-0001'), '+5588999990001');
  assert.equal(chaveParaQr('Telefone', '88 9 9999-0001'), '+5588999990001');
  assert.equal(chaveParaQr('Telefone', '+55 88 99999-0001'), '+5588999990001');
  assert.equal(chaveParaQr('E-mail', ' Fulana@Gmail.com '), 'fulana@gmail.com');
  assert.equal(chaveParaQr('E-mail', 'fulana gmail.com'), null);
  assert.equal(chaveParaQr('Aleatória', '123E4567-E12B-12D1-A456-426655440000'), '123e4567-e12b-12d1-a456-426655440000');
  assert.equal(chaveParaQr('Aleatória', 'abc'), null);
  assert.equal(chaveParaQr(null, '123.456.789-09'), null);
  assert.equal(chaveParaQr('CPF', ''), null);
});

test('nome sem acento e no máximo 25 letras; sem valor no código', () => {
  const c = codigoPix({ tipo: 'CPF', chave: '123.456.789-09', nome: 'Fulana Antônia Exemplo de Oliveira' });
  assert.match(c, /5925Fulana Antonia Exemplo de/);
  assert.doesNotMatch(c, /54\d\d\d/); // campo 54 (valor) não existe
  assert.match(c, /6304[0-9A-F]{4}$/);
});

test('QR só com chave válida, titular e banco preenchidos', () => {
  const completo = { pix_tipo: 'CPF', pix_chave: '123.456.789-09', pix_titular: 'Fulana Antônia Exemplo', pix_banco: 'Nubank' };
  assert.deepEqual(faltaParaQr(completo), []);
  assert.deepEqual(faltaParaQr({ ...completo, pix_titular: '  ', pix_banco: null }), ['titular', 'banco']);
  assert.deepEqual(faltaParaQr({ ...completo, pix_banco: '' }), ['banco']);
  assert.deepEqual(faltaParaQr({ ...completo, pix_chave: '2345678909' }), ['chave válida']);
  assert.deepEqual(faltaParaQr({ pix_tipo: 'CPF' }), ['chave', 'titular', 'banco']);
});
