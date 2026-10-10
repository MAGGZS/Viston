/**
 * O `DATABASE_URL` aponta para um banco desta máquina?
 *
 * Usado pelos scripts que escrevem no banco pela linha de comando (o seed da
 * central de ajuda): nesta máquina o `.env.local` aponta para o banco de
 * produção, e rodar o script esquecendo disso escreveria lá. Local é só
 * `localhost`, `127.0.0.1` e `::1`; qualquer outro host, ou URL que nem dá
 * para ler, conta como remoto. Na dúvida, o lado que recusa.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function isLocalDatabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Só o host, para a mensagem de recusa. Nunca a URL inteira: ela carrega a senha. */
export function databaseHost(url: string | undefined): string {
  if (!url) return '(DATABASE_URL vazio)';
  try {
    return new URL(url).hostname || '(sem host)';
  } catch {
    return '(DATABASE_URL ilegível)';
  }
}
