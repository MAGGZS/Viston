# Viston

## Deploy

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
