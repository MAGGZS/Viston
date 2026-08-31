export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly statusCode: number = 400
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
 * lê o log às três da manhã. Senha de app revogada e cota diária do Gmail
 * estourada caem os dois aqui.
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
