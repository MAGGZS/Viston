# Viston

todas as vezes que for aberto uma nova sessão no terminal do agente, uma verificação e atualizar  pra a versão mias atual do repositório que o projeto esta conectado remotamnte, lembrando de fazer isso antes de realizar qualquer pedido.

## Deploy

quando p agnete estiver mexendo no projeto local ele não é commitado, apenas com permissaõ ou pedidos diretos, o deploy a memsa coisa, e os pull request não precisam ser feitos quando o agente estiver trabalhando localmente.

Todo trabalho é entregue como pull request. Nada vai direto para a `main`,
seja qual for o tamanho da mudança.

A `main` publica em produção sozinha: a Vercel serve o frontend a partir dela e
o Render sobe o backend. Empurrar direto para a `main` é, na prática, publicar —
o proprietário veria a mudança já no ar. O PR devolve a ele a janela de olhar
antes.

O ciclo, então: branch a partir da `main` atualizada, commits no branch, branch
empurrado, PR aberto. O merge é do proprietário, e só ele o faz. Qualquer outro
branch gera preview na Vercel, que é justamente o que se quer para avaliar.

Migração em banco de produção continua exigindo pergunta antes de rodar, PR
ou não.
