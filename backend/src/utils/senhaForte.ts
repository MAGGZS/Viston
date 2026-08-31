/**
 * As exigências de composição da senha, num lugar só.
 *
 * Elas moram aqui, e não espalhadas por três schemas, porque a tela mostra uma
 * lista de verificação com exatamente estas quatro linhas: se as regras
 * viverem em lugares diferentes, um dia a lista marca um item que o servidor
 * recusa, e a pessoa fica olhando quatro vistos verdes e um erro vermelho.
 *
 * Uma ressalva registrada, porque ela vai voltar: exigência de composição é
 * discutível. Ela empurra as pessoas para `Senha@123` e para o papel colado no
 * monitor, e o que de fato pesa contra quem adivinha é o comprimento. É uma
 * decisão de produto, tomada com isso sabido — não um esquecimento.
 */
export const REGRAS_SENHA = [
  { id: 'tamanho', texto: 'Pelo menos 8 caracteres', testa: (s: string) => s.length >= 8 },
  { id: 'maiuscula', texto: 'Uma letra maiúscula', testa: (s: string) => /[A-Z]/.test(s) },
  { id: 'numero', texto: 'Um número', testa: (s: string) => /\d/.test(s) },
  {
    id: 'especial',
    texto: 'Um caractere especial',
    // Qualquer coisa que não seja letra, número ou espaço. Listar símbolos
    // permitidos recusaria acentos e pontuação de outros teclados sem motivo —
    // e quem digita em teclado ABNT tem `ç` e `~` à mão.
    testa: (s: string) => /[^A-Za-z0-9\s]/.test(s),
  },
] as const;

/** As regras que a senha ainda não cumpre. Vazio quer dizer que passou. */
export function regrasFaltando(senha: string): string[] {
  return REGRAS_SENHA.filter((r) => !r.testa(senha)).map((r) => r.texto);
}

/**
 * A mensagem de recusa, montada com o que faltou.
 *
 * Dizer "senha fraca" obriga a pessoa a adivinhar qual das quatro regras ela
 * furou. A tela já mostra a lista, mas a API responde a mais gente que a tela.
 */
export function mensagemSenhaFraca(senha: string): string {
  const faltando = regrasFaltando(senha);
  return `A senha precisa ter: ${faltando.join(', ').toLowerCase()}`;
}
