// Define (ou troca) a senha de acesso ao sistema.
// Uso: node server/definir-senha.js            pergunta a senha
//      node server/definir-senha.js --se-faltar  só pergunta se ainda não houver senha

import { definirSenha, temSenha } from './acesso.js';

const TAMANHO_MINIMO = 8;

/** Lê uma linha do teclado mostrando * no lugar das letras. */
function perguntarOculto(texto) {
  return new Promise((resolve) => {
    process.stdout.write(texto);
    const entrada = process.stdin;
    let valor = '';
    entrada.setRawMode?.(true);
    entrada.resume();
    entrada.setEncoding('utf8');
    const aoDigitar = (tecla) => {
      for (const c of tecla) {
        if (c === '\r' || c === '\n') {
          entrada.setRawMode?.(false);
          entrada.pause();
          entrada.off('data', aoDigitar);
          process.stdout.write('\n');
          return resolve(valor);
        }
        if (c === '\u0003') process.exit(1); // Ctrl+C
        if (c === '\b' || c === '\u007f') {
          if (valor) {
            valor = valor.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else if (c >= ' ') {
          valor += c;
          process.stdout.write('*');
        }
      }
    };
    entrada.on('data', aoDigitar);
  });
}

if (process.argv.includes('--se-faltar') && temSenha()) {
  console.log('  A senha de acesso já está definida.');
  process.exit(0);
}

console.log('\n  Defina a senha que todos vão usar para entrar no sistema.');
console.log(`  Use pelo menos ${TAMANHO_MINIMO} caracteres, misturando letras e números.\n`);

for (;;) {
  const senha = await perguntarOculto('  Nova senha: ');
  if (senha.length < TAMANHO_MINIMO) {
    console.log(`  A senha precisa ter pelo menos ${TAMANHO_MINIMO} caracteres.\n`);
    continue;
  }
  const repetida = await perguntarOculto('  Repita a senha: ');
  if (repetida !== senha) {
    console.log('  As senhas não são iguais. Tente de novo.\n');
    continue;
  }
  definirSenha(senha);
  console.log('\n  Senha gravada. Quem estava conectado vai precisar entrar de novo.\n');
  break;
}
