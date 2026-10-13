# Roteiros dos vídeos tutoriais do Viston

Fonte da verdade do conteúdo da central de ajuda. Cada **pasta** é um cargo, cada **funcionalidade** é um vídeo, cada **aba** é um passo (capítulo) do vídeo.

## Como ler este roteiro

- **Tela**: o que acontece na interface. É a base do teste Playwright.
- **Narração**: o texto exato que a voz de IA lê. Também vira a legenda e o texto da aba.
- Rótulos entre aspas são os textos dos botões e campos. Os marcados com **(confirmar)** precisam ser conferidos no código; se o rótulo real for outro, use o real e corrija aqui.
- Duração alvo de cada vídeo: 40 a 100 segundos.

## Regras da narração

1. Fala com a pessoa: "você", frases curtas, uma ideia por frase.
2. Chama cada botão pelo nome que está na tela.
3. Nunca usa os nomes técnicos dos papéis (VIEWER, INSPECTOR). Usa visualizador, inspetor, responsável, moderador, gestor.
4. Explica o porquê quando o sistema faz algo que surpreende.
5. Sem travessão.

## Elenco do prédio de demonstração

| Pessoa | Conta | Papel no Edifício Demonstração |
|---|---|---|
| Rafael Souza | gestor | Dono do prédio |
| Helena Prado | gestor | Co-gestora |
| Juliana Alves | comum | Moderadora |
| Marcos Lima | comum | Responsável (manutenção) |
| Carlos Pereira | comum | Inspetor |
| Ana Ribeiro | comum | Inspetora |
| Beatriz Costa | comum | Visualizadora (também visualizadora de um segundo prédio, para o seletor de prédio aparecer) |
| Lucas Martins | comum | Sem vínculo, com pedido de acesso pendente |
| Pedro Rocha | comum | Sem vínculo, com um segundo pedido de acesso pendente (para a 2.4 rejeitar) |
| Paula Nunes | gestor | Outro prédio, inativo (para mostrar o aviso) |

---

# Pasta 1: Primeiros passos

Para todo mundo. Gravação no celular, exceto quando indicado.

## 1.1 Criar sua conta
`id: primeiros-passos-criar-conta` · celular · conta: nenhuma

**Aba 1. Abrir o cadastro**
- Tela: tela de entrada (`/login`); toque em "Criar conta", no rodapé.
- Narração: "Para usar o Viston você precisa de uma conta. Na tela de entrada, toque em Criar conta."

**Aba 2. Escolher o cadastro certo**
- Tela: destaque no aviso cruzado do topo do cadastro.
- Narração: "Este é o cadastro para quem vai trabalhar em um prédio: vistoriar, atender chamados ou acompanhar relatórios. Se você vai cadastrar e administrar prédios, use o cadastro de gestor, no link logo acima."

**Aba 3. Preencher os dados**
- Tela: preencher nome, e-mail e senha; tocar no botão de criar.
- Narração: "Preencha seu nome, seu e-mail e uma senha. Use um e-mail que você abre com frequência, porque é por ele que o Viston fala com você."

**Aba 4. Confirmar o e-mail**
- Tela: tela "Confirme seu e-mail", só mostrada, sem digitar código. A aba seguinte entra com uma conta do seed já confirmada.
- Narração: "Mandamos um código para o seu e-mail. Abra a mensagem, digite o código aqui e toque em Confirmar. Sem essa confirmação, a conta não entra."

**Aba 5. Primeiro acesso**
- Tela: login; tela inicial sem prédio.
- Narração: "Pronto. Sua conta começa sem nenhum prédio. O próximo passo é pedir acesso ao prédio em que você vai trabalhar, pelo QR Code, pelo link ou pelo código."

## 1.2 Entrar em um prédio pelo QR Code ou link
`id: primeiros-passos-entrar-qr-link` · celular · conta: Lucas (sem pedido pendente; o teste remove o pedido do seed antes)

**Aba 1. O que é o QR Code e o link**
- Tela: tela inicial sem prédio.
- Narração: "O gestor do prédio pode te mostrar um QR Code ou te mandar um link. Os dois servem para a mesma coisa e valem por quinze minutos."

**Aba 2. Abrir o link**
- Tela: navegar para `/conectar?token=...`; aparece o nome do prédio.
- Narração: "Ao escanear o QR Code ou tocar no link, o Viston abre já mostrando o nome do prédio. Confira se é o prédio certo."

**Aba 3. Pedir acesso**
- Tela: tocar em "Solicitar Acesso ao Prédio"; confirmação "Solicitação Enviada!" na tela.
- Narração: "Toque em Solicitar acesso ao prédio. Seu pedido vai direto para o gestor."

**Aba 4. Esperar a aprovação**
- Tela: continuar na confirmação "Solicitação Enviada!" do `/conectar`; destacar o texto de que o pedido foi encaminhado ao gestor e o botão "Acessar Início". A tela inicial não mostra o pedido pendente, por isso a aba fica nesta confirmação.
- Narração: "Agora o pedido está com o gestor. Quando ele aprovar, o prédio aparece na sua tela inicial, já com o seu papel: inspetor, responsável, moderador ou visualizador. Toque em Acessar Início para voltar."

**Aba 5. Se o link expirou**
- Tela: navegar para um token vencido; mensagem "Convite expirado".
- Narração: "Se aparecer que o link expirou, é porque passaram os quinze minutos. Peça um novo ao gestor, ou use o código do prédio."

## 1.3 Entrar em um prédio pelo código
`id: primeiros-passos-entrar-codigo` · celular · conta: Lucas (sem pedido pendente)

**Aba 1. Onde digitar o código**
- Tela: tela inicial sem prédio; cartão "Nenhum prédio ainda" com o campo do código.
- Narração: "O código do prédio tem doze caracteres e o gestor costuma mandar por mensagem. Na tela inicial, o campo para digitar o código já aparece."

**Aba 2. Digitar e enviar**
- Tela: digitar o código do seed; tocar em "Buscar"; aparece o nome do prédio; tocar em "Conectar-se".
- Narração: "Digite o código exatamente como recebeu e toque em Buscar. Confira o nome do prédio e toque em Conectar-se. Se aparecer código inválido, confira com o gestor: ele pode ter gerado um código novo."

**Aba 3. Acompanhar o pedido**
- Tela: o cartão troca para o aviso "Solicitação enviada!" com "Aguarde a aprovação do gestor do prédio."
- Narração: "Agora é só esperar a aprovação. O gestor escolhe o seu papel na hora de aprovar."

## 1.4 Seu perfil
`id: primeiros-passos-perfil` · celular · conta: Carlos

**Aba 1. Abrir o perfil**
- Tela: tocar em Perfil na barra inferior.
- Narração: "Seus dados ficam no Perfil, na barra de baixo."

**Aba 2. Nome e e-mail**
- Tela: tocar em "Identificação"; mostrar os campos "Nome" e "E-mail" (este só leitura) sem salvar.
- Narração: "Em Identificação você corrige seu nome. O e-mail é a identidade da conta e não muda por aqui."

**Aba 3. Trocar a senha**
- Tela: tocar em "Alterar senha"; mostrar os campos "Senha atual", "Nova senha" e "Confirmar nova senha".
- Narração: "Para trocar a senha, toque em Alterar senha e informe a atual e a nova."

**Aba 4. Tema claro ou escuro**
- Tela: abrir "Tema" (opções "Automático", "Escuro" e "Claro"); alternar para "Claro" e voltar ao "Escuro".
- Narração: "Em Tema você escolhe o modo escuro, o claro ou o automático, que segue o celular. Em sol forte, no térreo ou na cobertura, o claro costuma ler melhor."

**Aba 5. Excluir a conta**
- Tela: tocar em "Excluir conta", na "Zona de risco"; mostrar a confirmação; cancelar.
- Narração: "Se você quiser sair do Viston de vez, a exclusão fica aqui. Ela pede confirmação e não tem volta."

## 1.5 Como usar a ajuda
`id: primeiros-passos-usar-ajuda` · celular · conta: Carlos

**Aba 1. Abrir a ajuda**
- Tela: Perfil; tocar em "Ajuda e tutoriais".
- Narração: "Sempre que tiver dúvida, abra Ajuda e tutoriais no seu Perfil."

**Aba 2. As pastas**
- Tela: grade de pastas com "Seu cargo" no topo.
- Narração: "Cada pasta é um cargo. As do seu cargo aparecem primeiro. As outras continuam abertas, se você quiser entender o trabalho de quem está do outro lado."

**Aba 3. As abas de cada tutorial**
- Tela: abrir um tutorial; tocar em uma aba; o vídeo pula.
- Narração: "Cada tutorial é dividido em passos. Toque em um passo e o vídeo vai direto para aquele ponto."

---

# Pasta 2: Gestor

Gravação no computador. Conta: Rafael, exceto quando indicado.

## 2.1 Criar conta de gestor e o primeiro prédio
`id: gestor-criar-conta-predio` · computador · conta: nenhuma, depois uma conta nova de gestor

**Aba 1. O cadastro de gestor**
- Tela: abrir `/register/gestor`; destacar o aviso cruzado.
- Narração: "Gestor é quem cadastra os prédios, monta a equipe e acompanha a operação. Se você recebeu um convite para trabalhar em um prédio, este não é o seu cadastro: use o link do aviso."

**Aba 2. Criar a conta**
- Tela: preencher e enviar; mostrar a tela "Confirme seu e-mail" sem digitar código. A aba seguinte entra com uma conta de gestor do seed já confirmada.
- Narração: "Preencha seus dados e confirme o e-mail com o código que enviamos."

**Aba 3. Cadastrar o prédio**
- Tela: painel do gestor vazio ("Nenhum prédio ainda"); clicar em "Criar prédio"; no modal "Novo prédio", preencher "Nome", deixar "Descrição (opcional)", digitar ao menos um andar e apertar Enter; clicar em "Criar prédio".
- Narração: "No painel, clique em Criar prédio. Dê um nome e cadastre pelo menos um andar, que o prédio não é criado sem isso. Pronto: ele já existe e já pode receber a equipe."

## 2.2 Cadastrar e remover andares
`id: gestor-andares` · computador

**Aba 1. Ver os andares**
- Tela: em "Seus prédios" (`/gestor`), clicar em "Editar prédio" (o lápis) no cartão do prédio; destacar a lista "Andares" com as etiquetas.
- Narração: "Os andares ficam em Editar prédio, no cartão do prédio. Eles são a base da vistoria, e o inspetor sempre os percorre do mais alto para o mais baixo."

**Aba 2. Adicionar um andar**
- Tela: digitar "2º Subsolo" no campo de andar e apertar Enter (ou clicar em "+"); a etiqueta nova aparece; clicar em "Salvar".
- Narração: "Para adicionar, escreva o andar e aperte Enter. Para um subsolo, escreva, por exemplo, segundo subsolo. O Viston entende o número e coloca cada andar no lugar certo da vistoria. Depois, clique em Salvar."

**Aba 3. Remover um andar**
- Tela: reabrir "Editar prédio"; clicar no "X" da etiqueta de um andar; a etiqueta some na hora, sem pergunta; clicar em "Cancelar" e confirmar a saída sem salvar no aviso de alterações não salvas. A gravação nunca clica em "Salvar" nesta aba.
- Narração: "Para remover, clique no X do andar. A remoção não pede confirmação e só vale quando você clica em Salvar. Atenção: remover um andar apaga junto o histórico de vistorias dele. O prédio precisa ter pelo menos um andar."

## 2.3 Compartilhar o prédio com a equipe
`id: gestor-compartilhar` · computador

**Aba 1. As três formas**
- Tela: clicar em "Compartilhar ID" na página do prédio.
- Narração: "Há três formas de chamar alguém para o prédio: QR Code, link e código. Todas levam a um pedido de acesso que você aprova."

**Aba 2. QR Code**
- Tela: mostrar o QR Code com o tempo restante.
- Narração: "O QR Code é para quem está com você agora. A pessoa aponta a câmera e pede acesso. Ele vale por quinze minutos."

**Aba 3. Link**
- Tela: clicar em "Copiar link de convite".
- Narração: "O link faz o mesmo, mas pode ser enviado por mensagem. Também vale quinze minutos."

**Aba 4. Código do prédio**
- Tela: destacar o bloco "Código do prédio", com os doze caracteres, o aviso e "Copiar".
- Narração: "O código é fixo e vale até você gerar outro. É o jeito mais prático de mandar para a equipe toda."

**Aba 5. Se o código vazou**
- Tela: clicar em "Gerar novo código"; confirmação; clicar em "Gerar novo código" de novo; o código novo aparece.
- Narração: "Se o código foi parar onde não devia, gere um novo. O antigo para de funcionar na hora. Lembre que o código só permite pedir acesso: quem entra é sempre você que decide."

## 2.4 Aprovar pedidos escolhendo o papel
`id: gestor-aprovar-pedidos` · computador

**Aba 1. Ver os pedidos**
- Tela: em "Colaboradores", o botão "Solicitações" com o contador; abrir a lista; pedido do Lucas, com nome, e-mail e data.
- Narração: "Quando alguém pede acesso, o pedido aparece aqui, com nome e e-mail. Confira se você conhece a pessoa."

**Aba 2. Os papéis**
- Tela: clicar em "Aprovar"; a escolha de papéis com a descrição de cada um.
- Narração: "Ao aprovar, você escolhe o papel. Inspetor faz as vistorias pelo celular. Responsável atende os chamados de manutenção, também pelo celular. Moderador organiza os chamados e acompanha os números. Visualizador só consulta relatórios, e somente pelo computador."

**Aba 3. Aprovar**
- Tela: escolher Inspetor; clicar em "Aprovar como inspetor"; o pedido sai da lista e a pessoa aparece em "Vínculos do prédio".
- Narração: "Escolha o papel e confirme. A pessoa já entra no prédio pronta para trabalhar."

**Aba 4. Rejeitar**
- Tela: em "Solicitações", clicar no "X" ("Rejeitar") do segundo pedido do seed; aviso "Solicitação rejeitada"; o pedido some. Rejeita de verdade, sem confirmação; a restauração recria o pedido.
- Narração: "Não conhece quem pediu? Clique em Rejeitar, o X ao lado de Aprovar. Não há confirmação: a pessoa não entra e o pedido some da lista na hora."

## 2.5 Gerenciar a equipe
`id: gestor-equipe` · computador

**Aba 1. A lista de membros**
- Tela: seção "Vínculos do prédio": cada linha com nome, e-mail, seletor de papel e "Remover vínculo".
- Narração: "Aqui está toda a equipe do prédio e o papel de cada pessoa."

**Aba 2. Mudar o papel**
- Tela: mudar Beatriz de visualizadora para moderadora; desfazer em seguida.
- Narração: "Para mudar o papel, escolha o novo na própria lista. A mudança vale na hora, inclusive para o que a pessoa vê no celular."

**Aba 3. Remover alguém**
- Tela: clicar em "Remover vínculo"; modal "Remover colaborador"; "Cancelar".
- Narração: "Quem sai da equipe perde o acesso ao prédio na hora, inclusive aos relatórios e planilhas. O que a pessoa registrou continua no histórico."

## 2.6 Co-gestores e transferência do prédio
`id: gestor-cogestores-transferencia` · computador

**Aba 1. Adicionar um co-gestor**
- Tela: em "Colaboradores", seção "Gestão"; digitar o e-mail da Helena em "E-mail da conta de gestor"; clicar em "Adicionar".
- Narração: "Gestores não pedem acesso com código. Para dividir a administração, informe aqui o e-mail de outro gestor e clique em Adicionar. Ele precisa ter uma conta de gestor."

**Aba 2. Dono e co-gestor**
- Tela: destacar o título da seção "Dono do prédio" e o nome do dono (sem zoom na frase de ajuda da seção).
- Narração: "Um prédio pode ter vários gestores, mas só um dono, que é quem pode transferir o prédio."

**Aba 3. Transferir o prédio**
- Tela: escolher Helena; clicar em "Passar o prédio"; modal com o prazo de 7 dias; "Cancelar".
- Narração: "Para passar o prédio a outro gestor, escolha o nome e clique em Passar o prédio. Ele recebe um convite e tem sete dias para aceitar. Até lá, nada muda. Se ele recusar ou deixar o prazo passar, o prédio fica inativo."

**Aba 4. Prédio inativo**
- Tela: conta Paula, prédio inativo no seed; destacar a faixa "Este prédio está inativo desde..." no topo, sem clicar no link da faixa.
- Narração: "Às vezes um prédio aparece inativo, com um aviso no topo explicando o que falta acertar. O histórico continua aberto para leitura, mas vistorias, chamados e convites novos ficam suspensos até isso ser resolvido."

## 2.7 Acompanhar a operação
`id: gestor-acompanhar-operacao` · computador

**Aba 1. Os chamados do prédio**
- Tela: na barra lateral do prédio, clicar em "Novos chamados"; mostrar também "Processamento" e "Finalizados".
- Narração: "Como gestor, você enxerga os mesmos chamados que o moderador e também pode encaminhar e fechar."

**Aba 2. O painel analítico**
- Tela: clicar em "Análise" na barra lateral; passar pelas abas "Processos", "Prédio" e "Desempenho".
- Narração: "Em Análise, o painel mostra como os chamados andam, quanto o prédio custou e como a equipe está atendendo. Os detalhes de cada parte estão na pasta Moderador."

**Aba 3. Gestor não vistoria**
- Tela: voltar a "Seus prédios" (`/gestor`); zoom no cartão do prédio com as ações "Abrir", "Compartilhar chave", "Editar prédio" e "Excluir prédio", sem nenhuma de vistoria. O gestor não tem a tela inicial com "Nova vistoria" nem a barra inferior.
- Narração: "Gestor não faz vistoria. Quem vistoria é o inspetor. Se você também vai vistoriar, crie uma conta comum e entre no prédio como inspetor."

---

# Pasta 3: Inspetor

Gravação no celular. Conta: Carlos.

## 3.1 Fazer uma vistoria completa
`id: inspetor-vistoria-completa` · celular

**Aba 1. Começar**
- Tela: tela inicial; tocar no cartão "Nova vistoria".
- Narração: "A vistoria é feita andando pelo prédio, com o celular na mão. Na tela inicial, toque em Nova vistoria."

**Aba 2. Escolher os andares**
- Tela: marcar 6º, 5º, 4º e 1º subsolo; avançar.
- Narração: "Marque os andares que você vai percorrer hoje. Não precisa ser o prédio inteiro. O Viston organiza do andar mais alto para o mais baixo."

**Aba 3. Andar sem problema**
- Tela: 6º andar; marcar "Nada a relatar neste andar"; "Próximo andar".
- Narração: "Andar sem nada a registrar? Marque Nada a relatar neste andar e toque em Próximo andar. É o caminho mais comum."

**Aba 4. Registrar uma ocorrência**
- Tela: 5º andar; preencher "Tipo de manutenção", "Categoria" Corretiva, "Prioridade" Média e "Descrição"; deixar "Responsável (opcional)" em branco.
- Narração: "Encontrou algo? Escolha o tipo de manutenção, se ela é corretiva ou preventiva, a prioridade e descreva o que viu. O responsável pode ficar em branco: o moderador encaminha depois."

**Aba 5. Mais de uma ocorrência no andar**
- Tela: tocar em "Adicionar ocorrência"; preencher a "Ocorrência 2" com prioridade Alta.
- Narração: "Se houver mais de um problema no mesmo andar, toque em Adicionar ocorrência. Cada uma vira um chamado separado."

**Aba 6. Se faltou algo**
- Tela: tentar avançar com a descrição vazia; erros aparecem nos campos; corrigir.
- Narração: "Se faltar algum campo, o Viston aponta qual é e não deixa avançar. Corrija e siga."

**Aba 7. Voltar a um andar**
- Tela: a partir de um andar ainda sem preenchimento, tocar em "Voltar"; o andar anterior aparece preenchido; avançar de novo.
- Narração: "Pode voltar a qualquer andar já feito. O que você preencheu continua lá."

**Aba 8. Enviar**
- Tela: último andar; "Enviar vistoria"; tela "Vistoria enviada".
- Narração: "No último andar, o botão muda para Enviar vistoria. Ao enviar, ela vira relatório, planilha, entra no calendário e no histórico, e os chamados chegam ao moderador."

## 3.2 Prioridade e situação do andar
`id: inspetor-prioridade-situacao` · celular

**Aba 1. As três situações**
- Tela: histórico com vistorias em OK, Atenção e Problema.
- Narração: "Cada andar sai da vistoria com uma situação: OK, Atenção ou Problema. Você não escolhe isso. O Viston calcula pela prioridade do que você registrou."

**Aba 2. Como é calculado**
- Tela: abrir um relatório; destacar os andares.
- Narração: "Andar sem ocorrência fica OK. Prioridade média deixa o andar em Atenção. Prioridade alta deixa em Problema. E a vistoria inteira assume a pior situação entre os andares."

**Aba 3. Por que isso importa**
- Tela: calendário ou lista destacando um Problema.
- Narração: "É assim que um vazamento grave no subsolo não fica escondido numa vistoria de dez andares. Escolha a prioridade com cuidado."

## 3.3 Retomar uma vistoria interrompida
`id: inspetor-retomar-vistoria` · celular

**Aba 1. O que fica salvo**
- Tela: começar uma vistoria; concluir dois andares; fechar a aba.
- Narração: "Cada andar que você conclui fica guardado no próprio celular. Se o app fechar ou a bateria acabar, o trabalho não se perde. O andar que você está preenchendo só fica salvo quando você avança."

**Aba 2. Retomar**
- Tela: abrir de novo; modal "Vistoria interrompida"; tocar em "Continuar vistoria"; volta no terceiro andar.
- Narração: "Ao abrir o Viston de novo, ele pergunta se você quer continuar de onde parou. Toque em Continuar vistoria e você volta ao mesmo andar."

**Aba 3. Se a internet cair no envio**
- Tela: simular falha de rede no envio (bloquear a rota no Playwright); mensagem de erro; liberar a rede; reenviar; sucesso.
- Narração: "Se a internet cair na hora de enviar, nada se perde. É só tentar de novo quando o sinal voltar. O Viston reconhece o reenvio e não cria uma vistoria duplicada."

**Aba 4. Descartar**
- Tela: com um novo rascunho (criado fora do quadro, com corte), no modal "Vistoria interrompida" tocar em "Descartar e começar de novo"; o modal fecha sem outra pergunta.
- Narração: "Se não quiser continuar, toque em Descartar e começar de novo. O rascunho também vence sozinho depois de um dia."

## 3.4 Histórico e relatório do dia
`id: inspetor-historico` · celular

**Aba 1. Abrir o histórico**
- Tela: tocar em Histórico na barra inferior.
- Narração: "No histórico estão todas as vistorias dos seus prédios, das mais novas para as mais antigas."

**Aba 2. Vistorias e ocorrências**
- Tela: alternar para ocorrências.
- Narração: "Use o alternador para ver as ocorrências uma a uma, com a situação de cada chamado: em aberto, encaminhado, em andamento ou concluída."

**Aba 3. Abrir o relatório do dia**
- Tela: abrir a vistoria do dia com duas vistorias; destacar o aviso do topo.
- Narração: "Ao abrir uma vistoria, você vê o relatório do dia inteiro. Se outra pessoa também vistoriou o prédio naquele dia, os registros dela aparecem juntos, e os nomes de quem vistoriou ficam no topo."

---

# Pasta 4: Responsável

Gravação no celular. Conta: Marcos.

## 4.1 Receber um chamado
`id: responsavel-receber-chamado` · celular

**Aba 1. O aviso de chamado novo**
- Tela: `/responsavel`; o topo mostra "1 para receber" e a fila "A receber" traz o número.
- Narração: "Quando o moderador encaminha um chamado para você, o aviso aparece aqui em cima."

**Aba 2. Ver o chamado**
- Tela: fila "A receber"; abrir um; mostrar andar, prioridade, o campo "Prazo" e a nota "Do moderador".
- Narração: "Abra o chamado para ver o andar, a prioridade, o prazo e as observações do moderador."

**Aba 3. Receber**
- Tela: tocar em "Receber chamado"; o chamado vai para em andamento.
- Narração: "Toque em Receber chamado para assumir. Só você pode fazer isso: é a sua confirmação de que o chamado está com você. A partir daqui, o prazo corre na sua conta."

## 4.2 Trabalhar no chamado
`id: responsavel-trabalhar-chamado` · celular

**Aba 1. Sua fila**
- Tela: `/responsavel`; filas "A receber", "Em andamento" e "Concluídos".
- Narração: "Seus chamados ficam separados por etapa: os que esperam você receber, os que estão em andamento e os que você já concluiu."

**Aba 2. Registrar o andamento**
- Tela: abrir um chamado em andamento; na linha do tempo, escrever em "O que foi feito agora?", anexar uma foto em "Fotos" e tocar em "Registrar".
- Narração: "Registre o que foi feito, com fotos se puder, e toque em Registrar. Isso ajuda o moderador a acompanhar sem precisar te ligar."

**Aba 3. Aguardando responsável**
- Tela: `/responsavel`, fila "A receber"; destacar um cartão com a etiqueta "Encaminhado", o fio do prazo e o botão "Receber" no pé do cartão; não tocar em "Receber".
- Narração: "Chamado que o moderador mandou para você e que ainda não foi recebido espera na fila A receber, com a etiqueta Encaminhado. Dá para receber direto pelo botão Receber do cartão, sem abrir. O moderador vê que o chamado está aguardando você. E repare no prazo do cartão: ele conta desde o dia da vistoria, por isso não deixe o chamado parado nesta fila."

**Aba 4. O prazo**
- Tela: fila "Em andamento"; destacar o fio do prazo no pé do cartão (ex.: "3 dias úteis para o prazo"); abrir o chamado atrasado e destacar o campo "Prazo" ("Atrasado há 2 dias úteis", em vermelho, com o triângulo).
- Narração: "O prazo aparece em cada chamado, na lista e dentro dele. Quando passa, ele fica em vermelho e diz há quanto tempo está atrasado."

## 4.3 Informar a conclusão
`id: responsavel-informar-conclusao` · celular

**Aba 1. O relatório do serviço**
- Tela: abrir chamado em andamento; escrever o relatório do serviço.
- Narração: "Terminou? Escreva em poucas palavras o que foi feito. Esse texto vai para o moderador."

**Aba 2. Informar conclusão**
- Tela: tocar em "Informar conclusão"; confirmação explicando o fechamento; confirmar.
- Narração: "Toque em Informar conclusão. Atenção: isso não fecha o chamado. Você avisa que terminou, e o moderador revisa e fecha."

**Aba 3. Aguardando o fechamento**
- Tela: card com "Aguardando o moderador fechar".
- Narração: "Enquanto o moderador não fecha, o chamado mostra que está aguardando. Depois de fechado, aparece como fechado pelo moderador."

**Aba 4. Desfazer**
- Tela: tocar em "Cancelar conclusão"; volta para em andamento com o texto preservado.
- Narração: "Informou cedo demais? Toque em Cancelar conclusão. O chamado volta para em andamento e o texto que você escreveu continua lá."

## 4.4 Registrar uma ocorrência com fotos
`id: responsavel-ocorrencia-avulsa` · celular

**Aba 1. Quando usar**
- Tela: em `/responsavel`, tocar no botão redondo "Registrar ocorrência" (+) do topo; abre o modal "Registrar nova ocorrência".
- Narração: "Achou um problema fora da vistoria? Você mesmo pode registrar a ocorrência, com fotos."

**Aba 2. Preencher**
- Tela: preencher "Andar / Local", "Tipo de manutenção", "Prioridade", "Categoria" e "Descrição do problema".
- Narração: "Escolha o andar, o tipo de manutenção, a categoria e a prioridade, e descreva o que encontrou."

**Aba 3. Anexar fotos**
- Tela: "Anexar fotos"; escolher duas imagens de exemplo; miniaturas aparecem e o botão passa a "Adicionar mais fotos (2/4)".
- Narração: "Anexe fotos do problema. O Viston reduz o tamanho delas antes de enviar, para não pesar no seu plano de dados. Há um limite de fotos por ocorrência, mostrado no botão."

**Aba 4. Registrar**
- Tela: "Registrar ocorrência"; aviso de sucesso; o chamado aparece em andamento.
- Narração: "Toque em Registrar ocorrência. Como foi você quem encontrou, o chamado já entra na sua fila, em andamento."

---

# Pasta 5: Moderador

Gravação no computador. Conta: Juliana.

## 5.1 O painel do moderador
`id: moderador-painel` · computador

**Aba 1. Os contadores**
- Tela: `/moderador`; destacar os cartões "Em aberto", "Encaminhados", "Em andamento", "Concluídos" e "Fora do prazo".
- Narração: "O painel mostra quantos chamados estão em cada etapa: em aberto, encaminhados, em andamento e concluídos. O cartão Fora do prazo junta os que já passaram do prazo."

**Aba 2. A barra lateral**
- Tela: percorrer a barra lateral: "Painel", "Análise", "Novos chamados", "Processamento" e "Finalizados".
- Narração: "Pela barra lateral você entra em cada fila. O trabalho do dia começa por Novos chamados."

**Aba 3. O histórico do painel**
- Tela: descer até o cartão do histórico; alternar entre "Vistorias" e "Ocorrências"; voltar a "Vistorias" e clicar numa linha; abre o relatório do dia.
- Narração: "Mais abaixo fica o histórico do prédio, com as vistorias e as ocorrências. Clique em uma vistoria para abrir o relatório completo do dia."

## 5.2 Encaminhar um chamado
`id: moderador-encaminhar` · computador

**Aba 1. A fila de novos**
- Tela: clicar em "Novos chamados" na barra lateral.
- Narração: "Toda ocorrência registrada na vistoria sem responsável chega aqui como chamado novo."

**Aba 2. Abrir o chamado**
- Tela: abrir um chamado de prioridade alta.
- Narração: "Abra o chamado para ver o andar, a prioridade, a descrição e quem vistoriou."

**Aba 3. Encaminhar**
- Tela: em "Encaminhar para", escolher Marcos Lima; clicar em "Encaminhar".
- Narração: "Em Encaminhar para, escolha o responsável e clique em Encaminhar. O chamado fica aguardando até ele confirmar o recebimento."

**Aba 4. Deixar uma nota**
- Tela: corte para um chamado do seed já em andamento (em "Processamento"); escrever em "Notas para o responsável"; "Salvar nota". O campo só aparece depois que o responsável recebe o chamado.
- Narração: "Quando o responsável já recebeu o chamado, aparece o campo Notas para o responsável. Use para dizer o que precisa ser feito ou o que ficou combinado, e clique em Salvar nota."

**Aba 5. Cancelar o envio**
- Tela: de volta ao chamado encaminhado na Aba 3; "Cancelar envio"; o chamado volta para "Novos chamados".
- Narração: "Encaminhou para a pessoa errada? Clique em Cancelar envio enquanto ela ainda não recebeu. O chamado volta para Novos chamados, sem responsável."

## 5.3 Acompanhar e fechar
`id: moderador-acompanhar-fechar` · computador

**Aba 1. Em andamento**
- Tela: clicar em "Processamento" na barra lateral; abrir um chamado em andamento com relatos do responsável na linha do tempo.
- Narração: "Em Processamento ficam os chamados que já foram encaminhados. Abra um chamado em andamento para ver o que o responsável registrou."

**Aba 2. Aguardando responsável**
- Tela: em "Processamento", destacar a coluna "Encaminhados" ("Com responsável, aguardando ele confirmar o recebimento"); abrir um chamado; destacar o aviso "Aguardando ... confirmar o recebimento" e o bloco "Cancelar envio"; fechar sem cancelar.
- Narração: "Na coluna Encaminhados ficam os chamados que o responsável ainda não recebeu. Ao abrir um, você vê desde quando ele está aguardando. Enquanto ninguém recebe, a única ação é Cancelar envio: o chamado volta para Novos chamados, e aí você encaminha para quem quiser."

**Aba 3. Trocar o responsável**
- Tela: em "Reenviar para", escolher outro responsável e destacar "Reenviar", sem confirmar (reenviar zera o recebimento e não tem desfazer).
- Narração: "Para trocar o responsável com o chamado em andamento, escolha outra pessoa em Reenviar para e clique em Reenviar. O novo responsável precisa receber de novo, e o que o anterior informou é descartado."

**Aba 4. Concluídos pelo responsável**
- Tela: em "Processamento", abrir um chamado "Concluído pelo responsável", com o relatório do serviço.
- Narração: "Quando o responsável informa que terminou, o chamado espera por você. Leia o relatório do serviço e, se estiver tudo certo, finalize."

**Aba 5. Finalizar**
- Tela: clicar em "Finalizar"; no modal "Finalizar chamado", escrever em "Relatório da manutenção"; marcar "Houve gasto nesta manutenção"; informar o valor; finalizar.
- Narração: "Ao finalizar, escreva o que foi a manutenção. Se houve gasto, marque a opção e informe o valor. Se não houve, deixe desmarcado: assim o relatório não soma um zero que ninguém conferiu."

## 5.4 O painel analítico
`id: moderador-painel-analitico` · computador

**Aba 1. Os filtros**
- Tela: abrir o painel; ajustar período e andar.
- Narração: "Os filtros do topo valem para o painel todo. Escolha o período e, se quiser, um andar."

**Aba 2. Processos**
- Tela: aba Processos; o que pede ação hoje, o funil, os prazos.
- Narração: "Em Processos você vê o caminho dos chamados: o que pede ação hoje, onde eles travam e o que está fora do prazo."

**Aba 3. Prédio**
- Tela: aba Prédio; custo por tipo e por andar; clicar numa barra de andar e o filtro muda.
- Narração: "Em Prédio você vê onde o dinheiro foi, por tipo de manutenção e por andar. Clique em um andar para filtrar o painel por ele. Os valores vêm do que é informado ao finalizar cada chamado."

**Aba 4. Desempenho**
- Tela: aba Desempenho.
- Narração: "Em Desempenho você compara o atendimento da equipe: quanto cada pessoa recebeu e em quanto tempo resolveu."

## 5.5 Relatório de chamados em Word
`id: moderador-relatorio-docx` · computador

**Aba 1. Escolher o período**
- Tela: em "Finalizados", clicar em "Gerar relatório"; no modal "Gerar relatório", escolher o "Período".
- Narração: "Para prestar contas, entre em Finalizados e clique em Gerar relatório. Escolha o período."

**Aba 2. Gerar e baixar**
- Tela: clicar em "Gerar .docx"; download do arquivo.
- Narração: "Gere o arquivo. O Viston monta um documento Word, pronto para enviar ou imprimir."

**Aba 3. O que o documento traz**
- Tela: a esteira converte o `.docx` baixado para PDF e mostra a primeira página num quadro.
- Narração: "O documento traz o que foi feito em cada chamado e quanto custou. Por isso vale escrever bem o relatório ao finalizar: é ele que aparece aqui."

---

# Pasta 6: Visualizador

Gravação no computador. Conta: Beatriz.

## 6.1 O calendário de vistorias
`id: visualizador-calendario` · computador

**Aba 1. Visão mensal**
- Tela: clicar em "Histórico" na barra lateral (`/historico`); calendário no modo "Mensal".
- Narração: "O calendário fica em Histórico, na barra lateral, e mostra os dias com vistoria. Quanto mais forte a cor, mais vistorias naquele dia."

**Aba 2. Semestral e anual**
- Tela: alternar para "Semestral" e "Anual".
- Narração: "Mude para a visão semestral ou anual para enxergar a frequência das vistorias ao longo do tempo."

**Aba 3. Seus prédios**
- Tela: destacar o seletor de prédio do topo (aparece porque, no seed, Beatriz tem um segundo prédio); trocar de prédio e voltar.
- Narração: "Você só vê os prédios em que tem acesso. Se tiver mais de um, escolha o prédio no seletor do topo."

## 6.2 Relatório do dia e planilha
`id: visualizador-relatorio-planilha` · computador

**Aba 1. Abrir o dia**
- Tela: clicar no dia com duas vistorias.
- Narração: "Clique em um dia para abrir o relatório."

**Aba 2. Ler o relatório**
- Tela: destacar o aviso do topo e a situação de cada andar.
- Narração: "O relatório junta todas as vistorias daquele dia, com os nomes de quem vistoriou. Cada andar mostra a pior situação encontrada no dia."

**Aba 3. Baixar a planilha**
- Tela: tocar em "Gerar planilha" (ou "Baixar planilha", se o dia já tiver planilha).
- Narração: "Baixe a planilha em Excel para guardar ou repassar. O download começa na hora; se demorar para clicar, o link de download vence e é só pedir de novo."

## 6.3 Por que não abre no celular
`id: visualizador-so-computador` · celular · conta: Beatriz

**Aba 1. O aviso**
- Tela: abrir o app no celular com a conta de visualizadora; aviso.
- Narração: "O visualizador consulta relatórios, calendário e planilhas, e isso foi feito para a tela do computador. Pelo celular, aparece este aviso."

**Aba 2. O que fazer**
- Tela: manter o aviso.
- Narração: "Abra o Viston no computador. Se o seu trabalho é vistoriar ou atender chamados, peça ao gestor para mudar o seu papel."
