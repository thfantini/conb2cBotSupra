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
    '3️⃣ Falar com Atendente'
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
    const texto = '📋 *Menu de Atendimento*\n\nComo posso ajudar você hoje?';
    
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
 */
function verificarPalavrasChaveAtendente(mensagem) {
    const palavrasChave = [
        'propostas',
        'atendente',
        'atendimento',
        'financeiro',
        'humano',
        'sim'
    ];
    
    const mensagemLower = mensagem.toLowerCase().trim();
    
    return palavrasChave.some(palavra => mensagemLower.includes(palavra));
}


/**
 * Fluxo principal de atendimento
 */
async function fluxoAtendimento(telefone, mensagem, messageId) {
    const estado = estadosUsuarios.get(telefone) || { etapa: 'inicial' };
    
    console.log(`📊 Estado atual: ${estado.etapa}`);

    // Verificação global de comando de saída
    if (verificarComandoSaida(mensagem)) {
        return await processarEncerramentoManual(telefone);
    }

    // Verificação global de palavras-chave para atendente
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
    console.log('🔍 Etapa: Verificação Inicial');
    
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
        estadosUsuarios.set(telefone, { etapa: 'aguardando_cnpj' });
        return { status: 'aguardando_cnpj' };
    }
    
    // Cliente encontrado e autorizado
    const cliente = clienteAPI.data.data[0];
    const contato = clienteAPI.contato;
    
    // TODO: Criar funcao em: mensagens.js
    await evolutionAPI.sendTextMessage(
        telefone,
        `👋 Olá, *${contato.nome}*!\n\n` +
        `Empresa: *${cliente.nome}*\n` +
        `CNPJ: *${cliente.cpfCnpj}*\n\n` +
        `Bem-vindo(a) ao nosso atendimento.\n` +
        'Como posso ajudar você hoje?'
    );
    
    //await whatsappService.mostrarMenuPrincipal(telefone);
    //await whatsappService.enviarMenuPrincipal(telefone);
    await enviarMenuPrincipal(telefone);
    
    estadosUsuarios.set(telefone, {
        etapa: 'menu_principal',
        cliente: cliente,
        contato: contato,
        messageId: messageId
    });
    
    return { status: 'menu_exibido', cliente, contato };
}

/**
 * Etapa 2: Validar CNPJ informado
 */
async function etapaValidarCNPJ(telefone, cnpj, messageId) {
    console.log('🔍 Etapa: Validar CNPJ');
    
    const resultado = await processarOpcaoCNPJ(telefone, cnpj, messageId);
    
    if (resultado.sucesso) {
        estadosUsuarios.set(telefone, {
            etapa: 'menu_principal',
            cliente: resultado.cliente,
            contato: resultado.contato,
            messageId: messageId
        });
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
    console.log('🔍 Etapa: Menu Principal - Opção:', opcao);
    
    const { cliente, contato } = estado;
    
    switch (opcao.toLowerCase()) {
        case '1':
        case 'boletos':
            return await processarOpcaoBoletos(telefone, cliente, messageId);
            
        /*
        case '2':
        case 'nfe':
            return await processarOpcaoNFE(telefone, cliente, messageId);
        */

        case '2':
        case 'alterar':
        case 'trocar':
            return await processarAlteraCNPJ(telefone, messageId, estado);

        case '3':
        case 'certificados':
            return await processarOpcaoCertificados(telefone, cliente, messageId);
            
        case '4':
            return await processarTransferenciaAtendente(telefone, cliente, messageId);

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
        '🏢 *Alterar CNPJ*\n\n' +
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
    console.log('🔍 Validando novo CNPJ:', cnpj);
    
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
    console.log('🔍 Validando CNPJ:', cnpj);
    
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
    const telefoneSemDDI = validacaoService.normalizarTelefoneApi(telefone);
    
    // Verificar se telefone está nos contatos
    const contatosComTelefone = cliente.contatos.filter(c => {
        if (!c.telefone) return false;
        const contatoTelLimpo = c.telefone.replace(/\D/g, '');
        return contatoTelLimpo === telefoneSemDDI;
    });
    
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
        `✅ Olá, *${contatoAutorizado.nome}*!\n\n` +
        `Empresa: *${cliente.nome}*\n` +
        `CNPJ: *${cnpjFormatado}*\n\n` +
        'Como posso ajudar você hoje?'
    );
    
    // Mostrar menu principal
    // TODO: Alterar para: enviarMenuPrincipal
    await evolutionAPI.sendTextMessage(
        telefone,
        '📋 *Menu de Opções*\n\n' +
        'Escolha uma das opções:\n\n' +
        '1️⃣ Boletos em Aberto\n' +
        '2️⃣ Notas Fiscais\n' +
        '3️⃣ Certificados\n' +
        '4️⃣ Propostas Comerciais\n' +
        '5️⃣ Falar com Atendente'
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
    console.log('💰 Processando: Boletos');
    
    // TODO: Criar funcao em: mensagens.js
    await evolutionAPI.sendTextMessage(
        telefone,
        '🔍 Consultando seus boletos em aberto...'
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
            'Posso ajudar com algo mais?'
        );
        
        //await whatsappService.mostrarMenuPrincipal(telefone);
        //await whatsappService.enviarMenuPrincipal(telefone);
        await enviarMenuPrincipal(telefone);
        return { status: 'sem_boletos' };
    }

    //boleto.linhaDigitavel: nao existe, mock: boleto.idConta boleto.numeroDocumento
    //boleto.url: nao existe, link mock para testes
    const boletoLink = `https://boleto.suprasoft.net/?idConta=`;
    
    // Enviar cada boleto
    for (const boleto of boletos.data) {
        
        // TODO: Criar funcao em: mensagens.js
        const mensagem = 
            `📄 *Boleto ${boleto.numeroDocumento}*\n\n` +
            `📅 Vencimento: ${formatarData(boleto.dataVencimento)}\n` +
            `💰 Valor: R$ ${boleto.valor.toFixed(2)}\n\n` +
            `*Linha Digitável:*\n${boleto.idConta}${boleto.numeroDocumento}\n\n` +
            `*Link:*\n${boletoLink}${boleto.idConta}&${boleto.numeroDocumento}`;
        
        await evolutionAPI.sendTextMessage(telefone, mensagem);
        
        // Aguardar 1 segundo entre envios
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Envia Boleto PDF
        await enviarBoletoPDF(telefone, boleto.idConta);

        // Aguardar 3 segundo entre envios
        await new Promise(resolve => setTimeout(resolve, 3000));

    }
    
    // TODO: Criar funcao em: mensagens.js
    await evolutionAPI.sendTextMessage(
        telefone,
        `📊 Total de ${boletos.data.length} boleto(s) encontrado(s).\n\n` +
        'Posso ajudar com algo mais?'
    );
    
    //await whatsappService.mostrarMenuPrincipal(telefone);
    //await whatsappService.enviarMenuPrincipal(telefone);
    await enviarMenuPrincipal(telefone);
    
    return { status: 'boletos_enviados', quantidade: boletos.data.length };
}

/**
 * Enviar Boleto PDF
 */

async function enviarBoletoPDF(telefone, idConta) {
    console.log('📄 Gerando PDF do boleto:', idConta);
    
    // Gerar PDF
    const boletoPDF = await endpoint.geraBoletoPDF(idConta);
    
    // TODO: Criar funcao em: mensagens.js
    if (!boletoPDF.success) {
        await evolutionAPI.sendTextMessage(
            telefone,
            '❌ Não foi possível gerar o boleto.\n\nTente novamente mais tarde.'
        );
        return { success: false };
    }
    
    // Enviar PDF via WhatsApp
    const envio = await evolutionAPI.sendDocument(
        telefone,
        boletoPDF.data.base64,
        boletoPDF.data.filename,
        '📄 Aqui está seu boleto'
    );
    
    // TODO: Criar funcao em: mensagens.js
    if (envio.success) {
        await evolutionAPI.sendTextMessage(
            telefone,
            '✅ Boleto enviado com sucesso!'
        );
    }
    
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
    console.log('🔍 Verificando bloqueio antes de ação...');
    
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
        
        console.log('🚫 Cliente foi bloqueado durante o atendimento');
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
    console.log(`🧹 Limpando sessão: ${telefone}`);
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
    console.log('📄 Processando: NFE');
    
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
    console.log('📜 Processando: Certificados');
    
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
    console.log('👤 Processando: Transferência para Atendente');
    
    // TODO: Criar funcao em: mensagens.js
    await evolutionAPI.sendTextMessage(
        telefone,
        '👨‍💼 *Transferindo para Atendimento*\n\n' +
        'Sua solicitação será direcionada para um de nossos atendentes.\n' +
        'Aguarde que em breve alguém entrará em contato com você.'
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