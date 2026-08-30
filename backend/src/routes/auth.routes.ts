import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/authenticate';
import { validate } from '../middlewares/validate';
import { authLimiter } from '../middlewares/rateLimit';
import { loginSchema, refreshSchema } from '../validators/auth.validator';
import {
  confirmEmailSchema,
  resendConfirmationSchema,
} from '../validators/confirmation.validator';

const router = Router();

router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh', authLimiter, validate(refreshSchema), authController.refresh);

// Confirmação de e-mail. As duas são públicas por natureza: a primeira é o link
// que chega na caixa de entrada de quem ainda não tem acesso, e a segunda é o
// pedido de outro link, feito de uma tela em que ninguém está logado.
//
// `authLimiter` e não `sensitiveLimiter` porque as duas são alvo de tentativa
// em série: adivinhar token e disparar e-mail. O reenvio manda `email` no corpo
// e cai na cota por IP *e* conta; a confirmação não manda, e cai no ramo do IP
// puro — que ali é o certo, porque o que se quer limitar é justamente quem
// varre tokens de um lugar só. O reenvio ainda passa pelo teto de cinco por
// hora por endereço, dentro de `enviarConfirmacao`.
router.post('/confirmar', authLimiter, validate(confirmEmailSchema), authController.confirmar);
router.post('/reenviar', authLimiter, validate(resendConfirmationSchema), authController.reenviar);
// Perfil de quem está logado, qualquer que seja o tipo da conta
router.get('/me', authenticate, authController.me);
// Sair: derruba os refresh tokens da conta e grava LOGOUT na trilha. Autenticada
// de propósito — sem saber quem é, não há geração de sessão para incrementar.
router.post('/logout', authenticate, authController.logout);

export default router;
