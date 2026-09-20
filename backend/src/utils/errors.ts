export class AppError extends Error {
  /**
   * `details` é o que a tela precisa para montar a mensagem certa — qual limite
   * estourou, quanto já se usou, qual plano resolve. Sai no corpo do erro pelo
   * mesmo caminho que o `details` do zod já usa (ver `errorHandler`), então o
   * app lê os dois do mesmo lugar.
   *
   * Opcional porque a maioria dos erros não tem nada a acrescentar: a mensagem
   * já diz tudo.
   */
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Não autenticado') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Sem permissão para esta ação') {
    super('FORBIDDEN', message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(entity = 'Recurso') {
    super('NOT_FOUND', `${entity} não encontrado`, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409);
  }
}

/**
 * Requisição malformada em algo que não passa por um schema do zod — cabeçalho,
 * combinação de parâmetros. O zod já responde 400 sozinho; isto é para o resto.
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message, 400);
  }
}

/**
 * A conta existe, a senha está certa, e o dono do endereço nunca provou ser o
 * dono.
 *
 * 403 e não 401 de propósito: 401 é "não sei quem você é", e aqui se sabe. O
 * app usa o `code` para trocar a mensagem de erro pelo botão de reenviar — ver
 * a tela de login.
 */
export class EmailNotConfirmedError extends AppError {
  constructor() {
    super(
      'EMAIL_NAO_CONFIRMADO',
      'Confirme seu e-mail para liberar o acesso.',
      403
    );
  }
}

/**
 * Código que não abre.
 *
 * Um código de erro só para os quatro casos — nunca existiu, já foi usado,
 * venceu, tentativas esgotadas — porque separá-los diria a quem chuta qual das
 * quatro coisas ele acertou. Para quem digitou de boa-fé, os quatro levam ao
 * mesmo lugar: pedir outro código.
 */
export class InvalidCodeError extends AppError {
  constructor() {
    super('CODIGO_INVALIDO', 'Código inválido ou expirado', 400);
  }
}

/** Pedidos demais para o mesmo endereço, por intervalo ou por hora. */
export class TooManyEmailsError extends AppError {
  constructor() {
    super('LIMITE', 'Muitas tentativas. Aguarde alguns minutos.', 429);
  }
}

/**
 * O servidor de e-mail recusou a mensagem.
 *
 * 502 e não 500: o que falhou está fora daqui, e a diferença importa para quem
 * lê o log às três da manhã. Chave revogada, remetente não verificado e cota
 * diária estourada caem os três aqui.
 */
export class EmailDeliveryError extends AppError {
  constructor() {
    super(
      'EMAIL_FALHOU',
      'Não foi possível enviar o e-mail agora. Tente em alguns minutos.',
      502
    );
  }
}

/**
 * O plano da conta não comporta mais um.
 *
 * Mais um prédio, mais um inspetor, mais um e-mail no mês. 403 e não 402: quem
 * está na frente da tela em geral não é quem paga — o inspetor que não
 * consegue ser cadastrado não tem cartão a passar, e "pagamento necessário"
 * mandaria a pessoa errada para a tela de cobrança.
 *
 * `details` leva o limite e o quanto já se usou, porque a tela precisa dizer
 * "3 de 3 prédios" e não só "não pode".
 */
export class PlanLimitError extends AppError {
  constructor(message: string, details?: { limit?: number; current?: number; plan?: string }) {
    super('LIMITE_DO_PLANO', message, 403, details);
  }
}

/**
 * O recurso não existe neste plano.
 *
 * Diferente do limite: aqui não é "acabou", é "nunca houve". A tela que recebe
 * isto oferece o plano que abre o recurso, e é por isso que `details` carrega o
 * nome dele.
 */
export class FeatureLockedError extends AppError {
  constructor(message: string, details?: { feature?: string; plan?: string }) {
    super('RECURSO_DO_PLANO', message, 403, details);
  }
}

/**
 * O prédio está inativo.
 *
 * Congelado continua existindo e não aceita mais trabalho: nada de vistoria
 * nova, chamado novo, upload. A leitura do que já existe é o que se preserva —
 * o histórico é do cliente, não do plano.
 */
export class BuildingFrozenError extends AppError {
  constructor(message = 'Este prédio está inativo. Regularize o plano para voltar a usá-lo.') {
    super('PREDIO_CONGELADO', message, 403);
  }
}
