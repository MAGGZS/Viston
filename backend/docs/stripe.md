# Ligar a cobrança

O código de cobrança já está pronto e vai para produção desligado: sem chave, as
rotas de `/billing` respondem 503 e o resto do produto funciona inteiro. Este
arquivo é o que falta fazer no painel do Stripe e no Render para ele acordar.

São quinze minutos, uma vez.

## 1. Os produtos e os preços

No painel do Stripe, em **modo de teste** primeiro. Crie dois produtos de
assinatura e um de prédio extra, cada um com preço mensal e anual — seis preços
ao todo, porque é o que `config.stripe.prices` espera.

| Produto | Preço | Recorrência | Variável do preço |
| --- | --- | --- | --- |
| Viston Essencial | R$ 79,00 | mensal | `STRIPE_PRICE_ESSENCIAL_MONTHLY` |
| Viston Essencial | R$ 790,00 | anual | `STRIPE_PRICE_ESSENCIAL_YEARLY` |
| Viston Pro | R$ 249,00 | mensal | `STRIPE_PRICE_PRO_MONTHLY` |
| Viston Pro | R$ 2.490,00 | anual | `STRIPE_PRICE_PRO_YEARLY` |
| Prédio extra | R$ 29,00 | mensal | `STRIPE_PRICE_EXTRA_BUILDING_MONTHLY` |
| Prédio extra | R$ 290,00 | anual | `STRIPE_PRICE_EXTRA_BUILDING_YEARLY` |

Os valores acima são os que a vitrine mostra hoje (`frontend/app/lib/planos.js`)
— se mudarem aqui, mudam lá também. O que cobra de verdade é o preço do Stripe;
o arquivo do frontend é texto de tela.

Moeda `BRL`. O prédio extra é cobrado por unidade: a sessão de pagamento manda
`quantity` com o número de extras escolhidos, então **não** marque preço por
pacote.

## 2. O webhook

Ainda no painel, em Desenvolvedores → Webhooks, aponte um endpoint para:

```
https://viston.onrender.com/billing/webhook
```

Eventos a escutar — só estes três importam hoje:

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Copie o segredo de assinatura (`whsec_...`). É ele que prova que o evento veio
do Stripe; sem ele, quem descobrir a URL promove a própria conta para PRO com um
`curl`.

## 3. As variáveis no Render

No painel do serviço `viston-api`, em Environment. Todas já estão declaradas em
`render.yaml` com `sync: false` — o valor entra pelo painel, e segredo nenhum
mora no repositório.

```
STRIPE_SECRET_KEY=sk_test_...        (ou sk_live_... quando a loja abrir)
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ESSENCIAL_MONTHLY=price_...
STRIPE_PRICE_ESSENCIAL_YEARLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_EXTRA_BUILDING_MONTHLY=price_...
STRIPE_PRICE_EXTRA_BUILDING_YEARLY=price_...
```

Enquanto estiver com as chaves de teste, use os cartões de teste do Stripe
(`4242 4242 4242 4242`, qualquer data futura, qualquer CVC). Eles falham alto em
vez de cobrar de alguém de verdade.

## 4. Conferir que ligou

1. Entre como gestor e abra **Planos e cobrança**. O botão de assinar deve levar
   ao checkout do Stripe — se responder 503, falta `STRIPE_SECRET_KEY`.
2. Pague com o cartão de teste.
3. No painel do Stripe, o webhook deve mostrar `200` para o evento
   `customer.subscription.created`. Se mostrar `401`, o `STRIPE_WEBHOOK_SECRET`
   não é o daquele endpoint.
4. Volte à tela de cobrança: o plano novo aparece em alguns segundos. Quem
   escreve isso é o webhook, e não o checkout — o app nunca dá o plano por
   pago sozinho.

## 5. O ciclo diário

Independente do Stripe, e igualmente necessário: o ciclo que vence
transferências e congela o que passou do plano roda por
`POST /jobs/planos`, disparado pelo workflow `.github/workflows/planos.yml`.

Crie o mesmo valor secreto nos dois lugares:

- no Render, variável `JOB_SECRET`;
- nos segredos do repositório no GitHub, `JOB_SECRET`.

Sem ele, a rota responde 404 e o workflow falha alto — de propósito: ciclo parado
em silêncio é ciclo que ninguém percebe parado.
