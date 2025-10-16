const endpoint = require('../config/endpoint');
const database = require('../config/database');
const evolutionAPI = require('../config/evolution');
const validacaoService = require('./validacaoService');
const MENSAGENS = require('../utils/mensagens');

/**
 * Timeout de sessão (30 minutos padrão)
 */
const TIMEOUT_SESSAO = parseInt(process.env.TIMEOUT_SESSAO) || 30 * 60 * 1000;

/**
 * Gerenciador de estado do usuário
 */
const estadosUsuarios = new Map();

/**
 * Menu principal de opções

const MENU_OPCOES = [
    '1️⃣ Boletos em Aberto',
    '2️⃣ Notas Fiscais',
    '3️⃣ Certificados',
    '4️⃣ Propostas Comerciais',
    '5️⃣ Falar com Atendente'
];
*/

const MENU_OPCOES = [
    '1️⃣ Boletos em Aberto',
    '2️⃣ Informar outro CNPJ',
    '3️⃣ Falar com Atendente',
    '4️⃣ Falar com Suporte'
];

/**
 * Envia menu principal de opções
 * @param {string} phoneNumber - Número do telefone
*/
async function enviarMenuPrincipal(phoneNumber) {
    const whatsappService = require('./whatsappService');
    console.log('enviarMenuPrincipal:');
    console.log('- phoneNumber', phoneNumber);

    // TODO: Criar funcao em: mensagens.js
    const mensagem = 
        `📋 *Menu de Opções*\n\n` +
        `Escolha uma das opções abaixo digitando o número correspondente:\n\n` +
        MENU_OPCOES.join('\n\n');
    
    //await whatsappService.enviarMensagem(phoneNumber, mensagem);
    await evolutionAPI.sendTextMessage(phoneNumber, mensagem);
    await whatsappService.adicionarMensagemConversa(phoneNumber, null, 'bot', mensagem);
}

/**
 * Envia menu principal de opções com botões
 * @param {string} telefone - Número do telefone
 */

async function enviarMenuPrincipalBotao(telefone) {
    const texto = '📋 *Menu de Atendimento*\n\nComo posso te ajudar hoje?';
    
    /*const botoes = [
        { id: '1', text: '💰 Boletos em Aberto', type: 'reply' },
        { id: '2', text: '📄 Notas Fiscais', type: 'reply' },
        { id: '3', text: '📜 Certificados', type: 'reply' },
        { id: '4', text: '💼 Propostas Comerciais', type: 'text' },
        { id: '5', text: '👤 Falar com Atendente', type: 'text' }
    ];*/
    
    await evolutionAPI.sendButtonMessage(telefone, texto, botoes);
}

/**
 * Verifica se a mensagem contém palavras-chave para transferência de atendente
 * @param {string} mensagem - Mensagem recebida do cliente
 * @returns {boolean} True se contém palavra-chave de atendimento

function verificarPalavrasChaveAtendente(mensagem) {
    const palavrasChave = [
        'suporte',
        'atendente',
        'atendimento',
        'financeiro',
        'humano',
        'sim'
    ];

    console.log('verificarPalavrasChaveAtendente: ', mensagem);

    // O metodo 'some' retorna true assim que encontra a primeira correspondência
    const mensagemLower = mensagem.toLowerCase().trim();
    return palavrasChave.some(palavra => mensagemLower.includes(palavra));
}
*/

/**
 * Verifica se a mensagem contém palavras-chave para boleto
 * @param {string} mensagem - Mensagem recebida do cliente
 * @returns {string} palavra-chave encontrada ou undefined
 */
function verificarPalavrasChaveBoleto(mensagem) {
    const palavrasChave = [
        'boleto',
        'bolto',
        'contas',
        'aberto'
    ];

    console.log('verificarPalavrasChaveBoleto: ', mensagem);
    const mensagemLower = mensagem.toLowerCase().trim();
    
    // O metodo 'find' retorna a palavra-chave encontrada (string) ou undefined
    return palavrasChave.find(palavra => mensagemLower.includes(palavra));

    // O metodo 'some' retorna true assim que encontra a primeira correspondência
    // return palavrasChave.some(palavra => mensagemLower.includes(palavra));
}


/**
 * Verifica se a mensagem contém palavras-chave para Atendimento
 * @param {string} mensagem - Mensagem recebida do cliente
 * @returns {string} palavra-chave encontrada ou undefined
 */
function verificarPalavrasChaveAtendimento(mensagem) {
    // Objeto de mapeamento: [Variação digitada] : [Palavra Oficial a Retornar]
    const mapeamentoChaves = {
        'atendente': 'atendente',   // Correto
        'atndente': 'atendente',    // Erro de digitação
        'atndenti': 'atendente',    // Erro de digitação
        'atndent': 'atendente',    // Erro de digitação
        
        'atendimento': 'atendente', // Correto
        'atndimento': 'atendente',  // Erro de digitação
        'atndiment': 'atendente',  // Erro de digitação
        
        'humano': 'suporte',
        'suporte': 'suporte', // Correto
        'suport': 'suporte',  // Erro de digitação
        
        'financeiro': 'atendente', // Correto
        'financiro': 'atendente',  // Erro de digitação
        'finaceiro': 'atendente'   // Outro erro comum
    };

    console.log('verificarPalavrasChaveAtendimento: ', mensagem);
    const mensagemLower = mensagem.toLowerCase().trim();
    
    // 1. Pega todas as variações (chaves) do objeto de mapeamento
    const variacoes = Object.keys(mapeamentoChaves);

    // 2. Encontra a primeira variação presente na mensagem
    const variacaoEncontrada = variacoes.find(variacao => mensagemLower.includes(variacao));
    
    // 3. Se uma variação foi encontrada, retorna a palavra OFICIAL correspondente
    if (variacaoEncontrada) {
        return mapeamentoChaves[variacaoEncontrada];
    }
    
    // 4. Se nada foi encontrado, retorna undefined
    return undefined;
}

/**
 * Fluxo principal de atendimento
 */
async function fluxoAtendimento(telefone, mensagem, messageId) {
    const estado = estadosUsuarios.get(telefone) || { etapa: 'inicial' };
    
    console.log(`Estado atual: ${estado.etapa}`);

    // Verificação global de comando de saída
    if (verificarComandoSaida(mensagem)) {
        return await processarEncerramentoManual(telefone);
    }

    // Verificação global de palavras-chave para Atendimento
    const buscaAtendimento = verificarPalavrasChaveAtendimento(mensagem);
    if (buscaAtendimento && estado.cliente) {
        const estadosQuePermitemAtendimento = [
            'aguardando_novo_cnpj',
            'aguardando_cnpj',
            'sem_permissao',
            'consultando_boletos',
            'menu_principal',
            'inicial',
            'sem_permissao'
        ];

        console.log(`A mensagem é sobre: ${buscaAtendimento}`);
        if (estadosQuePermitemAtendimento.includes(estado.etapa)) {
            return await etapaMenuPrincipal(telefone, buscaAtendimento, messageId, estado);
        }
    }

    /*
        // Verificação global de palavras-chave para Atendente
        if (verificarPalavrasChaveAtendente(mensagem)) {
            const estadosQuePermitemAtendente = [
                'aguardando_novo_cnpj',
                'aguardando_cnpj',
                'menu_principal',
                'sem_permissao'
            ];
            
            if (estadosQuePermitemAtendente.includes(estado.etapa)) {
                return await processarTransferenciaAtendente(telefone, estado.cliente, messageId);
            }
        }
    */

    // Verificação global de palavras-chave para Boleto > Somente autorizado
    const buscaBoleto = verificarPalavrasChaveBoleto(mensagem);
    if (buscaBoleto && estado.cliente) {
        const estadosQuePermitemBoleto = [
            'consultando_boletos',
            'menu_principal'
        ];

        console.log(`A mensagem é sobre: ${buscaBoleto}`);
        if (estadosQuePermitemBoleto.includes(estado.etapa)) {
            return await etapaMenuPrincipal(telefone, 'boletos', messageId, estado);
        }
    }

    //Menu Principal    
    switch (estado.etapa) {
        case 'inicial':
            return await etapaInicial(telefone, mensagem, messageId);
            
        case 'aguardando_cnpj':
            return await etapaValidarCNPJ(telefone, mensagem, messageId);

        case 'aguardando_novo_cnpj':
            return await processarNovoCNPJ(telefone, mensagem, messageId);

        case 'menu_principal':
            return await etapaMenuPrincipal(telefone, mensagem, messageId, estado);
            
        case 'consultando_boletos':
            return await etapaConsultarBoletos(telefone, mensagem, messageId, estado);
            
        default:
            return await etapaInicial(telefone, mensagem, messageId);
    }
}

/**
 * Etapa 1: Verificação inicial
 */
async function etapaInicial(telefone, mensagem, messageId) {
    console.log('Etapa: Verificação Inicial');
    
    // Buscar cliente por telefone
    const clienteAPI = await endpoint.getClienteByCelular(telefone);
    
    // Cliente bloqueado
    // TODO: Criar funcao em: mensagens.js
    if (clienteAPI.blocked) {
        await evolutionAPI.sendTextMessage(telefone, clienteAPI.error);
        estadosUsuarios.set(telefone, { etapa: 'bloqueado' });
        return { status: 'bloqueado' };
    }
    
    // Sem permissão
    if (clienteAPI.success && !clienteAPI.hasPermission) {
        await evolutionAPI.sendButtonMessage(
            telefone,
            clienteAPI.error,
            [
                { id: 'atendente', title: '👤 Falar com Atendente' },
                { id: 'cancelar', title: '❌ Cancelar' }
            ]
        );
        estadosUsuarios.set(telefone, { etapa: 'sem_permissao' });
        return { status: 'sem_permissao' };
    }
    
    // Cliente não encontrado
    // TODO: Criar funcao em: mensagens.js
    if (!clienteAPI.success) {
        await evolutionAPI.sendTextMessage(
            telefone,
            '👋 Olá! Bem-vindo ao nosso atendimento.\n\n' +
            'Para continuar, por favor, informe seu *CNPJ*:'
        );

        // Armazenar mensagem inicial para verificar palavra-chave após validação
        estadosUsuarios.set(telefone, {
            etapa: 'aguardando_cnpj',
            mensagemInicial: mensagem
        });

        return { status: 'aguardando_cnpj' };
    }
    
    // Cliente encontrado e autorizado
    const cliente = clienteAPI.data.data[0];
    const contato = clienteAPI.contato;

    // TODO: Criar funcao em: mensagens.js
    await evolutionAPI.sendTextMessage(
        telefone,
        `👋 Olá, ${contato.nome}!\n\n` +
        `Identifiquei seu telefone associado a seguinte empresa:\n\n` +
        `Empresa: *${cliente.nome}*\n` +
        `CNPJ: ${cliente.cpfCnpj}\n\n` +
        `Bem-vindo(a) ao nosso atendimento.`
    );

    // Atualizar estado com cliente autorizado
    estadosUsuarios.set(telefone, {
        etapa: 'menu_principal',
        cliente: cliente,
        contato: contato,
        messageId: messageId
    });

    // Verificar se mensagem inicial contém palavra-chave de boleto
    const buscaBoleto = verificarPalavrasChaveBoleto(mensagem);
    if (buscaBoleto) {
        console.log(`Palavra-chave detectada na mensagem inicial: ${buscaBoleto}`);
        console.log('Executando consulta de boletos automaticamente...');

        // Executar consulta de boletos diretamente
        return await processarOpcaoBoletos(telefone, cliente, messageId);
    }
    
    // Verificar se mensagem inicial contém palavra-chave de atendimento
    const buscaAtendente = verificarPalavrasChaveAtendimento(mensagem);
    if (buscaAtendente) {
        console.log(`Palavra-chave detectada na mensagem inicial: ${buscaAtendente}`);
        console.log('Executando transferencia automaticamente...');

        // Executar consulta transferencia diretamente
        return await etapaMenuPrincipal(telefone, buscaAtendente, messageId, 'menu_principal');
    }

    // Se não houver palavra-chave, exibir menu principal
    // TODO: Criar funcao em: mensagens.js
    await evolutionAPI.sendTextMessage(
        telefone,
        'Como posso te ajudar hoje?'
    );

    await enviarMenuPrincipal(telefone);

    return { status: 'menu_exibido', cliente, contato };
}

/**
 * Etapa 2: Validar CNPJ informado
 */
async function etapaValidarCNPJ(telefone, cnpj, messageId) {
    console.log('Etapa: Validar CNPJ');

    const resultado = await processarOpcaoCNPJ(telefone, cnpj, messageId);

    if (resultado.sucesso) {
        // Atualizar estado com cliente autorizado
        estadosUsuarios.set(telefone, {
            etapa: 'menu_principal',
            cliente: resultado.cliente,
            contato: resultado.contato,
            messageId: messageId
        });

        // Verificar se há mensagem prévia armazenada para detectar palavra-chave
        const estado = estadosUsuarios.get(telefone);
        const mensagemInicial = estado.mensagemInicial || cnpj;

        // Verificar se mensagem contém palavra-chave de boleto
        const buscaBoleto = verificarPalavrasChaveBoleto(mensagemInicial);
        if (buscaBoleto) {
            console.log(`Palavra-chave detectada após validação CNPJ: ${buscaBoleto}`);
            console.log('Executando consulta de boletos automaticamente...');

            // Executar consulta de boletos diretamente
            return await processarOpcaoBoletos(telefone, resultado.cliente, messageId);
        }

        // Se não houver palavra-chave, exibir menu principal
        // TODO: Criar funcao em: mensagens.js
        await evolutionAPI.sendTextMessage(
            telefone,
            'Como posso te ajudar hoje?'
        );

        await enviarMenuPrincipal(telefone);
    } else {
        // Manter na mesma etapa para nova tentativa
        estadosUsuarios.set(telefone, { etapa: 'aguardando_cnpj' });
    }

    return resultado;
}

/**
 * Etapa 3: Processar opção do menu
 */
async function etapaMenuPrincipal(telefone, opcao, messageId, estado) {
    console.log('Etapa: Menu Principal - Opção:', opcao);
    
    const { cliente, contato } = estado;
    
    switch (opcao.toLowerCase()) {
        case '1':
        case 'boletos':
            console.log('etapaMenuPrincipal: boletos');
            console.log(cliente);
            return await processarOpcaoBoletos(telefone, cliente, messageId);
            
        /*
        case '2':
        case 'nfe':
            return await processarOpcaoNFE(telefone, cliente, messageId);
        */

        case '2':
        case 'alterar':
        case 'cnpj':
        case 'trocar':
            return await processarAlteraCNPJ(telefone, messageId, estado);

        /*
        case '3':
        case 'certificados':
            return await processarOpcaoCertificados(telefone, cliente, messageId);
        */

        case '3':
        case 'atendente':
            return await processarTransferenciaAtendente(telefone, cliente, messageId);

        case '4':
        case 'suporte':
            return await processarTransferenciaSuporte(telefone, cliente, messageId);

        case 'menu':
            await enviarMenuPrincipal(telefone);

        default:
            // TODO: Criar funcao em: mensagens.js
            await evolutionAPI.sendTextMessage(
                telefone,
                '❌ Opção inválida. Por favor, escolha uma opção do menu.'
            );
            
            //await whatsappService.mostrarMenuPrincipal(telefone);
            //await whatsappService.enviarMenuPrincipal(telefone);
            await enviarMenuPrincipal(telefone);
            return { status: 'opcao_invalida' };
    }
}

/**
 * Processa solicitação de alteração de CNPJ
 * @param {string} telefone - Número do telefone
 * @param {string} messageId - ID da mensagem
 * @param {Object} estado - Estado atual do usuário
 */
async function processarAlteraCNPJ(telefone, messageId, estado) {
    console.log('🔄 Processando: Alterar CNPJ');
    
    // TODO: Criar funcao em: mensagens.js
    await evolutionAPI.sendTextMessage(
        telefone,
        '📄 *Alterar CNPJ*\n\n' +
        'Por favor, informe o novo CNPJ da sua empresa:\n\n' +
        '_(Digite apenas os números)_'
    );
    
    // Atualizar estado para aguardar novo CNPJ
    definirEstado(telefone, {
        etapa: 'aguardando_novo_cnpj',
        messageId: messageId,
        clienteAnterior: estado.cliente,
        contatoAnterior: estado.contato
    });
    
    return { status: 'aguardando_novo_cnpj' };
}

/**
 * Processa novo CNPJ informado
 * @param {string} telefone - Número do telefone
 * @param {string} cnpj - Novo CNPJ informado
 * @param {string} messageId - ID da mensagem
 * @returns {Promise<Object>} Resultado da validação
 */
async function processarNovoCNPJ(telefone, cnpj, messageId) {
    console.log('Validando novo CNPJ:', cnpj);
    
    // Usar a mesma função de validação existente
    //const resultado = await validarCNPJ(telefone, cnpj, messageId);
    const resultado = await etapaValidarCNPJ(telefone, cnpj, messageId)
    
    if (resultado.sucesso) {
        // Atualizar estado com novo cliente
        definirEstado(telefone, {
            etapa: 'menu_principal',
            cliente: resultado.cliente,
            contato: resultado.contato,
            messageId: messageId
        });
    } else {
        // Manter na etapa de aguardar novo CNPJ para nova tentativa
        const estado = obterEstado(telefone);
        definirEstado(telefone, {
            ...estado,
            etapa: 'aguardando_novo_cnpj'
        });
    }
    
    return resultado;
}


/**
 * Processa CNPJ informado ou recuperado
 * @param {string} telefone - Número do telefone
 * @param {string} cnpj - CNPJ fornecido
 * @param {string} messageId - ID da mensagem
 * @returns {Promise<Object>} Resultado da validação
 */
async function processarOpcaoCNPJ(telefone, cnpj, messageId) {
    console.log('Validando CNPJ:', cnpj);
    
    // Limpar CNPJ
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    
    // Validar formato
    if (!validacaoService.validarFormatoCNPJ(cnpjLimpo)) {
        
        // TODO: Criar funcao em: mensagens.js
        await evolutionAPI.sendTextMessage(
            telefone,
            '❌ *CNPJ Inválido*\n\n' +
            'O CNPJ informado não é válido.\n\n' +
            'Por favor, verifique e informe novamente.'
        );
        
        return { 
            sucesso: false, 
            motivo: 'cnpj_invalido' 
        };
    }
    
    // Formatar CNPJ
    const cnpjFormatado = validacaoService.formatarCNPJ(cnpjLimpo);
    
    // Buscar cliente por CNPJ via API
    const clienteAPI = await endpoint.getClienteByCNPJ(cnpjFormatado);

    console.log('processarOpcaoCNPJ: ', telefone);
    console.log('processarOpcaoCNPJ: ', cnpj);
    console.log(clienteAPI);
    
    // CNPJ não encontrado
    if (!clienteAPI.success) {
        
        // TODO: Criar funcao em: mensagens.js
        await evolutionAPI.sendTextMessage(
            telefone,
            '❌ *CNPJ Não Encontrado*\n\n' +
            'Não encontramos este CNPJ em nossa base de dados.\n\n' +
            'Por favor, verifique o número e tente novamente ou ' +
            'entre em contato com nosso atendimento.'
        );
        
        return { 
            sucesso: false, 
            motivo: 'cnpj_nao_encontrado' 
        };
    }
    
    // Cliente bloqueado
    if (clienteAPI.blocked) {
        await evolutionAPI.sendTextMessage(telefone, clienteAPI.error);
        
        // Registrar tentativa bloqueada
        await database.registrarAtendimento({
            messageId,
            cliente: clienteAPI.data.data[0]?.id || null,
            cnpj: cnpjFormatado,
            conversa: [{
                tipo: 'cliente',
                data: new Date(),
                mensagem: cnpj
            }, {
                tipo: 'bot',
                data: new Date(),
                mensagem: clienteAPI.error,
                status: 'bloqueado'
            }]
        });
        
        return { 
            sucesso: false, 
            motivo: 'cliente_bloqueado' 
        };
    }
    
    // Cliente encontrado - validar telefone nos contatos
    const cliente = clienteAPI.data.data[0];

    // Remover DDI do telefone para comparação
    // const telefoneSemDDI = validacaoService.normalizarTelefoneApi(telefone);

    /*
        // Verificar se telefone está nos contatos
        const contatosComTelefone = cliente.contatos.filter(c => {
            if (!c.telefone) return false;
            const contatoTelLimpo = c.telefone.replace(/\D/g, '');
            return contatoTelLimpo === telefoneSemDDI;
        });
    */

    const contatosComTelefone = endpoint.buscarTelefoneCliente(clienteAPI.data, telefone);
    
    if (contatosComTelefone.length === 0) {
        
        // TODO: Criar funcao em: mensagens.js
        await evolutionAPI.sendTextMessage(
            telefone,
            `⚠️ *Telefone Não Cadastrado*\n\n` +
            `Seu telefone não está cadastrado para o CNPJ: *${cnpjFormatado}*\n\n` +
            'Por favor, entre em contato com nosso atendimento para atualizar seu cadastro.\n\n' +
            'Deseja falar com um atendente?'
        );
        
        return { 
            sucesso: false, 
            motivo: 'telefone_nao_cadastrado' 
        };
    }
    
    // Verificar permissão de faturamento
    const contatoAutorizado = contatosComTelefone.find(
        c => c.emailFaturamento === true
    );
    
    if (!contatoAutorizado) {
        
        // TODO: Criar funcao em: mensagens.js
        await evolutionAPI.sendTextMessage(
            telefone,
            '⚠️ *Sem Permissão*\n\n' +
            'Seu cadastro não possui permissão para solicitar boletos.\n\n' +
            'Deseja ser transferido para atendimento humano?'
        );
        
        return { 
            sucesso: false, 
            motivo: 'sem_permissao_faturamento' 
        };
    }
    
    // Cliente válido e autorizado
    // TODO: Criar funcao em: mensagens.js
    await evolutionAPI.sendTextMessage(
        telefone,
        `👋 Olá, ${contatoAutorizado.nome}!\n\n` +
        `Identifiquei seu telefone associado a seguinte empresa:\n\n` +
        `Empresa: *${cliente.nome}*\n` +
        `CNPJ: ${cnpjFormatado}\n\n` +
        'Bem-vindo(a) ao nosso atendimento.'
    );

    // Registrar atendimento iniciado
    await database.registrarAtendimento({
        messageId,
        cliente: cliente.id,
        cnpj: cnpjFormatado,
        conversa: [{
            tipo: 'cliente',
            data: new Date(),
            mensagem: cnpj
        }, {
            tipo: 'bot',
            data: new Date(),
            mensagem: 'Cliente validado com sucesso',
            status: 'autorizado'
        }]
    });

    return {
        sucesso: true,
        cliente: cliente,
        contato: contatoAutorizado
    };
}


/**
 * Processar opção: Boletos
 */
async function processarOpcaoBoletos(telefone, cliente, messageId) {
    console.log('Processando: Boletos');
    
    // TODO: Criar funcao em: mensagens.js
    await evolutionAPI.sendTextMessage(
        telefone,
        '🔍 Certo! estou consultando os seus boletos ...'
    );
    
    // Recupera Dados do cliente
    // const clienteId = estadosUsuarios.get(telefone)?.cliente?.id;
    
    // Buscar boletos no banco (database.js)
    // const boletos = await database.getBoletosByCNPJ(cliente.cpfCnpj);

    // Buscar boletos no endpoint (endpoint.js)
    const boletos = await endpoint.getBoletosByCNPJ(cliente.id);
    
    if (!boletos.success || boletos.data.length === 0) {
        
        // TODO: Criar funcao em: mensagens.js
        await evolutionAPI.sendTextMessage(
            telefone,
            '✅ Você não possui boletos em aberto no momento.\n\n' +
            'Posso te ajudar com algo mais?'
        );
        
        //await whatsappService.mostrarMenuPrincipal(telefone);
        //await whatsappService.enviarMenuPrincipal(telefone);
        await enviarMenuPrincipal(telefone);
        return { status: 'sem_boletos' };
    }

    //boleto.linhaDigitavel: nao existe, mock: boleto.idConta boleto.numeroDocumento
    //boleto.url: nao existe, link mock para testes
    const boletoLink = `https://boleto.suprasoft.net/?idConta=`;

    // TODO: Criar funcao em: mensagens.js
    await evolutionAPI.sendTextMessage(
        telefone,
        //`Encontrei um total de ${boletos.data.length} boleto(s).\n\n` +
        `Encontrei *${boletos.data.length}* boleto(s).`
    );
    
    // Enviar cada boleto
    let linhaDigitavelBoleto = '';
    for (const boleto of boletos.data) {
        
        //Verifica Linha Digitavel
        if(boleto.linhaDigitavelBoleto){
            linhaDigitavelBoleto = `*Linha Digitável:*\n${boleto.linhaDigitavelBoleto}\n`;
        }
        
        // TODO: Criar funcao em: mensagens.js
        const mensagem = 
            `📄 *Boleto: ${boleto.numeroDocumento}*\n\n` +
            //`📅 Vencimento: ${formatarData(boleto.dataVencimento)}\n` +
            //`💰 Valor: R$ ${boleto.valor.toFixed(2)}\n\n${linhaDigitavelBoleto}` +
            `Vencimento: ${formatarDataERP(boleto.dataVencimento)}\n` +
            `Valor: R$ ${boleto.valor.toFixed(2)}\n${linhaDigitavelBoleto}` ;
            //`*Linha Digitável:*\n${boleto.idConta}${boleto.numeroDocumento}\n\n` +
            //`*Link:*\n${boletoLink}${boleto.idConta}&${boleto.numeroDocumento}`;
            //`\n`;
        
        await evolutionAPI.sendTextMessage(telefone, mensagem);
        
        // Aguardar 1 segundo entre envios
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Envia Boleto PDF
        await enviarBoletoPDF(telefone, boleto.idConta, boleto.numeroDocumento);

        // Aguardar 3 segundo entre envios
        await new Promise(resolve => setTimeout(resolve, 3000));

    }
    
    // TODO: Criar funcao em: mensagens.js
    await evolutionAPI.sendTextMessage(
        telefone,
        //`Encontrei um total de ${boletos.data.length} boleto(s).\n\n` +
        //`Encontrei *${boletos.data.length}* boleto(s).\n\n` +
        'Posso te ajudar com algo mais?'
    );
    
    //await whatsappService.mostrarMenuPrincipal(telefone);
    //await whatsappService.enviarMenuPrincipal(telefone);
    await enviarMenuPrincipal(telefone);
    
    return { status: 'boletos_enviados', quantidade: boletos.data.length };
}

/**
 * Enviar Boleto PDF
 */

async function enviarBoletoPDF(telefone, idConta, numeroDocumento) {
    console.log('Gerando PDF do boleto:', idConta);
    
    // Gerar PDF
    const boletoPDF = await endpoint.geraBoletoPDF(idConta);
    
    // TODO: Criar funcao em: mensagens.js
    if (!boletoPDF.success) {
        await evolutionAPI.sendTextMessage(
            telefone,
            `❌ Infelizmente não foi possível gerar o boleto: ${numeroDocumento}. Tente novamente mais tarde, por favor.`
        );
        return { success: false };
    }
    
    // TODO: Criar funcao em: mensagens.js
    // Enviar PDF via WhatsApp
    const envio = await evolutionAPI.sendDocument(
        telefone,
        boletoPDF.data.base64,
        boletoPDF.data.filename,
        `✅ Segue boleto: ${numeroDocumento}`
    );
    
    /*
        // TODO: Criar funcao em: mensagens.js
        if (envio.success) {
            await evolutionAPI.sendTextMessage(
                telefone,
                '✅ Boleto enviado com sucesso!'
            );
        }
    */
    
    return envio;
}


/**
 * Verifica se a sessão ainda é válida
 * @param {string} telefone - Número do telefone
 * @returns {boolean} True se sessão válida

function verificarTimeoutSessao(telefone) {
    const estado = estadosUsuarios.get(telefone);
    
    if (!estado || !estado.ultimaInteracao) {
        return false; // Sessão não existe ou não tem timestamp
    }
    
    const agora = Date.now();
    const tempoDecorrido = agora - estado.ultimaInteracao;
    
    if (tempoDecorrido > TIMEOUT_SESSAO) {
        // Sessão expirada
        console.log(`⏱️ Sessão expirada para ${telefone} (${Math.floor(tempoDecorrido / 60000)} min)`);
        estadosUsuarios.delete(telefone);
        return false;
    }
    
    // Atualizar timestamp
    estado.ultimaInteracao = agora;
    estadosUsuarios.set(telefone, estado);
    
    return true;
}
 */

/**
 * Verifica se a sessão ainda é válida
 * @param {string} telefone - Número do telefone
 * @returns {boolean} True se sessão válida
 */
function verificarTimeoutSessao(telefone) {
    const estado = estadosUsuarios.get(telefone);
    
    if (!estado) {
        return false; // Sessão não existe
    }
    
    // Se não tem timestamp, inicializar (evita falso positivo em mudanças de estado)
    if (!estado.ultimaInteracao) {
        estado.ultimaInteracao = Date.now();
        estadosUsuarios.set(telefone, estado);
        return true;
    }
    
    const agora = Date.now();
    const tempoDecorrido = agora - estado.ultimaInteracao;
    
    if (tempoDecorrido > TIMEOUT_SESSAO) {
        // Sessão expirada
        console.log(`⏱️ Sessão expirada para ${telefone} (${Math.floor(tempoDecorrido / 60000)} min)`);
        estadosUsuarios.delete(telefone);
        return false;
    }
    
    // Atualizar timestamp
    estado.ultimaInteracao = agora;
    estadosUsuarios.set(telefone, estado);
    
    return true;
}

/**
 * Processa mensagem com verificação de timeout
 * @param {string} telefone - Número do telefone
 * @param {string} mensagem - Mensagem recebida
 * @param {string} messageId - ID da mensagem
 * @returns {Promise<Object>} Resultado do processamento
 */
async function processarMensagemComTimeout(telefone, mensagem, messageId) {
    const sessaoValida = verificarTimeoutSessao(telefone);
    
    // TODO: Criar funcao em: mensagens.js
    if (!sessaoValida) {
        await evolutionAPI.sendTextMessage(
            telefone,
            MENSAGENS.ENCERRAMENTO.TIMEOUT()
        );
        
        // Reiniciar atendimento
        return await etapaInicial(telefone, mensagem, messageId);
    }
    
    return await fluxoAtendimento(telefone, mensagem, messageId);
}

/**
 * Processa encerramento manual da sessão
 * @param {string} telefone - Número do telefone
 * @returns {Promise<Object>} Resultado do encerramento
 */
async function processarEncerramentoManual(telefone) {
    console.log(`👋 Encerrando sessão manualmente: ${telefone}`);
    
    await evolutionAPI.sendTextMessage(
        telefone,
        MENSAGENS.ENCERRAMENTO.FINALIZACAO()
    );
    
    // Limpar sessão
    estadosUsuarios.delete(telefone);
    
    return { status: 'encerrado_manual' };
}

/**
 * Verifica se a mensagem é um comando de saída
 * @param {string} mensagem - Mensagem recebida do cliente
 * @returns {boolean} True se é comando de saída
 */
function verificarComandoSaida(mensagem) {
    const comandosSaida = ['sair', 'encerrar', 'finalizar', 'cancelar'];
    const mensagemLower = mensagem.toLowerCase().trim();
    return comandosSaida.some(comando => mensagemLower === comando);
}


/**
 * Verifica bloqueio do cliente antes de ação crítica
 * @param {string} telefone - Número do telefone
 * @param {string} cnpj - CNPJ do cliente
 * @returns {Promise<boolean>} True se cliente não está bloqueado
 */
async function verificarBloqueioAntesDeAcao(telefone, cnpj) {
    console.log('Verificando bloqueio antes de ação...');
    
    // Sempre verificar status antes de ações críticas
    const clienteAPI = await endpoint.getClienteByCNPJ(cnpj);
    
    // TODO: Criar funcao em: mensagens.js
    if (clienteAPI.blocked) {
        await evolutionAPI.sendTextMessage(
            telefone,
            MENSAGENS.BLOQUEIO.BLOQUEADO_DURANTE_ATENDIMENTO()
        );
        
        // Limpar estado
        estadosUsuarios.delete(telefone);
        
        console.log('Cliente foi bloqueado durante o atendimento');
        return false;
    }
    
    console.log('✅ Cliente não está bloqueado');
    return true;
}

/**
 * Limpa sessão do usuário
 * @param {string} telefone - Número do telefone
 */
function limparSessao(telefone) {
    console.log(`Limpando sessão: ${telefone}`);
    estadosUsuarios.delete(telefone);
}

/**
 * Obtém estado atual do usuário
 * @param {string} telefone - Número do telefone
 * @returns {Object|null} Estado do usuário
 */
function obterEstado(telefone) {
    return estadosUsuarios.get(telefone) || null;
}

/**
 * Define estado do usuário
 * @param {string} telefone - Número do telefone
 * @param {Object} estado - Novo estado
 */
function definirEstado(telefone, estado) {
    estado.ultimaInteracao = Date.now();
    estadosUsuarios.set(telefone, estado);
}

/**
 * Processa outras opções do menu
 */
async function processarOpcaoNFE(telefone, cliente, messageId) {
    console.log('Processando: NFE');
    
    // TODO: Criar funcao em: mensagens.js
    await evolutionAPI.sendTextMessage(
        telefone,
        '🔍 Consultando suas notas fiscais...'
    );
    
    // Implementar busca de NFE
    // TODO: Criar funcao em: mensagens.js
    await evolutionAPI.sendTextMessage(
        telefone,
        '📋 *Notas Fiscais*\n\n' +
        'Em breve disponibilizaremos suas notas fiscais por aqui.\n' +
        'Para acessá-las agora, entre em contato com nosso atendimento.'
    );
    
    //await whatsappService.mostrarMenuPrincipal(telefone);
    //await whatsappService.enviarMenuPrincipal(telefone);
    await enviarMenuPrincipal(telefone);
    return { status: 'nfe_indisponivel' };
}

async function processarOpcaoCertificados(telefone, cliente, messageId) {
    console.log('Processando: Certificados');
    
    // TODO: Criar funcao em: mensagens.js
    await evolutionAPI.sendTextMessage(
        telefone,
        '🔍 Consultando seus certificados...'
    );
    
    // Implementar busca de certificados
    // TODO: Criar funcao em: mensagens.js
    await evolutionAPI.sendTextMessage(
        telefone,
        '🏆 *Certificados*\n\n' +
        'Em breve disponibilizaremos seus certificados por aqui.\n' +
        'Para acessá-los agora, entre em contato com nosso atendimento.'
    );
    
    //await whatsappService.mostrarMenuPrincipal(telefone);
    //await whatsappService.enviarMenuPrincipal(telefone);
    await enviarMenuPrincipal(telefone);
    return { status: 'certificados_indisponivel' };
}

async function processarTransferenciaAtendente(telefone, cliente, messageId) {
    console.log('Processando: Transferência para Atendente');
    
    // TODO: Criar funcao em: mensagens.js
    await evolutionAPI.sendTextMessage(
        telefone,
        '👨‍💼 *Transferindo Atendimento*\n\n' +
        'Estou direcionando sua mensagem para o nosso setor administrativo.\n' +
        'Em breve, alguém do time entrará em contato por aqui para te ajudar.\n\n' +
        'Nosso horário de atendimento:\n*Segunda à Sexta-feira*,\n*de 08hs às 17hs*'
    );
    
    // TODO: Implementar transferência real
    limparSessao(telefone);
    
    return { status: 'transferido_atendente' };
}

async function processarTransferenciaSuporte(telefone, cliente, messageId) {
    console.log('Processando: Transferência para Suporte');
    
    // TODO: Criar funcao em: mensagens.js
    await evolutionAPI.sendTextMessage(
        telefone,
        '👨‍💼 *Falar com Suporte*\n\n' +
        'Para falar com o nosso Suporte, entre em contato pelo número:\n' +
        `${process.env.API_PHONE}\n\n` +
        'Este canal é exclusivo para emissão e envio de boletos.\n\n' +
        'Nossa equipe irá atendê-lo(a) com excelência nesse número.'
    );
    
    // TODO: Implementar transferência real
    limparSessao(telefone);
    
    return { status: 'transferido_atendente' };
}

/**
 * Formatar data para exibição
 */
function formatarData(data) {
    const d = new Date(data);
    return d.toLocaleDateString('pt-BR');
}

/**
 * Formatar data para exibição
 */
function formatarDataERP(data) {
    // 1. Pega apenas a data (os 10 primeiros caracteres)
    const dataPart = data.substring(0, 10); // "10-09-2025"
    
    // 2. Substitui todos os traços por barras
    return dataPart.replace(/-/g, '/'); // "10/09/2025"
}

module.exports = {
    fluxoAtendimento,
    etapaInicial,
    etapaValidarCNPJ,
    etapaMenuPrincipal,
    enviarMenuPrincipal,
    processarAlteraCNPJ,
    processarNovoCNPJ,  
    verificarTimeoutSessao,
    processarMensagemComTimeout,
    verificarBloqueioAntesDeAcao,
    limparSessao,
    obterEstado,
    definirEstado
};