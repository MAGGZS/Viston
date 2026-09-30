/**
 * Semáforo simples: no máximo `max` tarefas rodando ao mesmo tempo; as demais
 * esperam na fila, na ordem em que chegaram.
 *
 * Existe por causa do pool de conexões (`lib/prisma.ts`, `max: 10`). Uma tela
 * que dispara oito consultas pesadas em paralelo ocupa quase o pool inteiro, e
 * o resto da API — login, lista de chamados — fica esperando conexão. Com o
 * teto, essas telas dividem entre si uma fatia do pool e deixam o resto livre.
 *
 * Vale para uma instância só, que é o que o Render roda hoje.
 */
export function createLimiter(max: number) {
  let running = 0;
  const queue: Array<() => void> = [];

  // A vaga passa direto de quem sai para o próximo da fila, sem voltar a ficar
  // livre no meio: senão quem chegasse naquele instante furaria a fila e o teto.
  const release = () => {
    const next = queue.shift();
    if (next) next();
    else running--;
  };

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (running >= max) {
      await new Promise<void>((resolve) => queue.push(resolve));
    } else {
      running++;
    }
    try {
      return await task();
    } finally {
      release();
    }
  };
}

type AsyncMethods = Record<string, (...args: never[]) => Promise<unknown>>;

/** Passa cada método assíncrono do objeto pelo mesmo semáforo. */
export function limitMethods<T extends AsyncMethods>(methods: T, max: number): T {
  const run = createLimiter(max);
  const limited = {} as T;
  for (const key of Object.keys(methods) as Array<keyof T>) {
    const method = methods[key];
    limited[key] = ((...args: Parameters<T[keyof T]>) =>
      run(() => method.apply(methods, args))) as T[keyof T];
  }
  return limited;
}
