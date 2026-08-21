import bcrypt from 'bcrypt';

/**
 * Custo do bcrypt.
 *
 * 12 é a recomendação atual da OWASP; o projeto nasceu em 10, que era a de
 * antes. A conta é de tempo: cada ponto dobra o trabalho de quem tenta
 * adivinhar a senha — e o de quem confere a certa, por isso o número não sobe
 * sem limite. Hash antigo continua válido (o custo vem gravado dentro dele) e é
 * refeito no primeiro login que der certo — ver `needsRehash`.
 */
export const PASSWORD_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_ROUNDS);
}

/**
 * O hash guardado foi feito com custo menor que o de hoje?
 *
 * Só dá para saber com a senha em mãos, então a resposta é usada no login, uma
 * vez por conta. `getRounds` lê o custo do próprio hash; hash de formato
 * estranho não derruba o login — quem não sabe responder responde "não".
 */
export function needsRehash(hash: string): boolean {
  try {
    return bcrypt.getRounds(hash) < PASSWORD_ROUNDS;
  } catch {
    return false;
  }
}
