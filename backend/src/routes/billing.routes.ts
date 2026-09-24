import { Router } from 'express';
import { billingController } from '../controllers/billing.controller';
import { authenticate } from '../middlewares/authenticate';
import { validate } from '../middlewares/validate';
import { sensitiveLimiter } from '../middlewares/rateLimit';
import { checkoutSchema } from '../validators/billing.validator';

const router = Router();

const auth = authenticate;

/**
 * O webhook, sem autenticação de sessão: quem chama é o Stripe, e a credencial
 * dele é a assinatura do corpo (ver o controller).
 *
 * O corpo chega cru porque o `express.raw` desta rota está montado lá no
 * `app.ts`, antes do `express.json` global — é a ordem que decide, e ela não
 * cabe aqui dentro.
 */
router.post('/webhook', billingController.webhook);

// O plano que vale e o quanto já se gastou dele. Serve ao aviso que a tela dá
// antes de a pessoa esbarrar no limite.
router.get('/plan', auth, billingController.myPlan);

// O que a conta contratou — a tela de cobrança abre com isto.
router.get('/subscription', auth, billingController.mine);

// As duas portas do Stripe. Com teto: cada uma cria uma sessão lá.
router.post('/checkout', auth, sensitiveLimiter, validate(checkoutSchema), billingController.checkout);
router.post('/portal', auth, sensitiveLimiter, billingController.portal);

export default router;
