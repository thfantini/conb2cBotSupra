/**
 * Serviço de Atendimento Megazap
 *
 * Este serviço implementa um fluxo unificado de atendimento específico para Megazap.
 * Diferente do atendimentoService.js que envia mensagens individuais,
 * este serviço consolida todas as mensagens e anexos em uma única resposta.
 *
 * Restrições do Megazap:
 * - Não é possível enviar múltiplas mensagens separadas
 * - Toda a resposta deve ser consolidada em um único JSON
 * - Múltiplos documentos devem estar no array attachments[]
 */

const endpoint = require('../config/endpoint');
const messageService = require('../config/messageService');
const validacaoService = require('./validacaoService');

/**
 * Timeout de sessão (30 minutos padrão)
 */
const TIMEOUT_SESSAO = parseInt(process.env.TIMEOUT_SESSAO) || 30 * 60 * 1000;

/**
 * Gerenciador de estado do usuário
 */
const estadosUsuarios = new Map();

/**
 * Mapeamento de opções Megazap
 * Converte valores numéricos recebidos em ações
 */
const OPCOES_MEGAZAP = {
    '1': 'boleto',
    '2': 'notafiscal',
    '3': 'atendimento'
};

/**
 * Formata data do ERP (YYYY-MM-DD) para formato brasileiro (DD/MM/YYYY)
 * @param {string} dataERP - Data no formato YYYY-MM-DD
 * @returns {string} Data no formato DD/MM/YYYY
 */
function formatarDataERP(dataERP) {
    if (!dataERP) return 'Data não disponível';

    try {
        const [ano, mes, dia] = dataERP.split('-');
        return `${dia}/${mes}/${ano}`;
    } catch (error) {
        console.error('Erro ao formatar data:', error);
        return dataERP;
    }
}

/**
 * Verifica se a sessão ainda é válida
 * @param {string} telefone - Número do telefone
 * @returns {boolean} True se sessão válida
 */
function verificarTimeoutSessao(telefone) {
    const estado = estadosUsuarios.get(telefone);

    if (!estado || !estado.ultimaInteracao) {
        return false; // Sessão não existe ou não tem timestamp
    }

    const agora = Date.now();
    const tempoDecorrido = agora - estado.ultimaInteracao;

    if (tempoDecorrido > TIMEOUT_SESSAO) {
        console.log(`[MEGAZAP] Sessão expirou para ${telefone}`);
        estadosUsuarios.delete(telefone);
        return false;
    }

    return true;
}

/**
 * Atualiza timestamp da última interação
 * @param {string} telefone - Número do telefone
 */
function atualizarTimestamp(telefone) {
    const estado = estadosUsuarios.get(telefone);
    if (estado) {
        estado.ultimaInteracao = Date.now();
        estadosUsuarios.set(telefone, estado);
    }
}

/**
 * Verifica se a mensagem contém palavras-chave para boleto
 * @param {string} mensagem - Mensagem recebida do cliente
 * @returns {boolean} True se contém palavra-chave de boleto
 */
function verificarPalavrasChaveBoleto(mensagem) {
    const palavrasChave = [
        'boleto',
        'bolto',
        'contas',
        'aberto'
    ];

    const mensagemLower = mensagem.toLowerCase().trim();
    return palavrasChave.some(palavra => mensagemLower.includes(palavra));
}

/**
 * Verifica se a mensagem contém palavras-chave para Nota Fiscal
 * @param {string} mensagem - Mensagem recebida do cliente
 * @returns {boolean} True se contém palavra-chave de Nota Fiscal
 */
function verificarPalavrasChaveNotaFiscal(mensagem) {
    const palavrasChave = [
        'nota',
        'notafiscal',
        'nota fiscal',
        'xml'
    ];

    const mensagemLower = mensagem.toLowerCase().trim();
    return palavrasChave.some(palavra => mensagemLower.includes(palavra));
}

/**
 * Fluxo principal de atendimento Megazap
 * @param {string} telefone - Número do telefone
 * @param {string} mensagem - Mensagem recebida
 * @param {string} messageId - ID da mensagem
 * @param {Object} megazapData - Dados adicionais do Megazap (contactName, clienteId, etc)
 * @returns {Promise<Object>} Resposta unificada para Megazap
 */
async function fluxoAtendimentoMegazap(telefone, mensagem, messageId, megazapData = {}) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[MEGAZAP] Iniciando fluxo de atendimento');
    console.log(`Telefone: ${telefone}`);
    console.log(`Mensagem: ${mensagem}`);
    console.log(`Dados Megazap:`, megazapData);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Verificar timeout de sessão
    const sessaoValida = verificarTimeoutSessao(telefone);
    if (!sessaoValida) {
        console.log('[MEGAZAP] Sessão expirou ou não existe - criando nova');
    }

    // Obter ou criar estado do usuário
    let estado = estadosUsuarios.get(telefone) || {
        etapa: 'inicial',
        ultimaInteracao: Date.now()
    };

    // Mapear opção numérica para ação
    const opcao = OPCOES_MEGAZAP[mensagem.trim()];
    console.log(`[MEGAZAP] Opção mapeada: ${mensagem} → ${opcao || 'não reconhecida'}`);

    // Verificar palavras-chave
    const temPalavraBoleto = verificarPalavrasChaveBoleto(mensagem);

    // Determinar ação
    let acao = opcao;
    if (!acao && temPalavraBoleto) {
        acao = 'boleto';
        console.log('[MEGAZAP] Palavra-chave de boleto detectada');
    }

    // Se não há ação identificada, retornar Menu
    if (!acao) {
        console.log('❌ [MEGAZAP] Nenhuma ação identificada');
        
        // Menu MegaZap
        const menu = getDirectToMenu(telefone, messageId);
        return await messageService.sendDirectToMenu(
            telefone,
            menu
        );
        
        /*
            return await messageService.sendTextMessage(
                telefone,
                '❌ Opção não reconhecida. Por favor, envie uma opção válida:\n\n5 - Boletos\n6 - Notas Fiscais'
            );
        */
    }

    // Processar ação
    switch (acao) {
        case 'boleto':
            return await processarFluxoBoleto(telefone, mensagem, messageId, megazapData, estado);

        case 'notafiscal':
            return await processarFluxoNotaFiscal(telefone, mensagem, messageId, megazapData, estado);

        case 'atendimento':
            return await processarFluxoAtendimento(telefone);

        default:
            return await messageService.sendTextMessage(
                telefone,
                '❌ Opção não implementada ainda.'
            );
    }
}

/**
 * Processa fluxo unificado de boletos para Megazap
 * @param {string} telefone - Número do telefone
 * @param {string} mensagem - Mensagem recebida
 * @param {string} messageId - ID da mensagem
 * @param {Object} megazapData - Dados do Megazap
 * @param {Object} estado - Estado atual do usuário
 * @returns {Promise<Object>} Resposta unificada
 */
async function processarFluxoBoleto(telefone, mensagem, messageId, megazapData, estado) {
    console.log('[MEGAZAP] Processando fluxo de boletos');
    console.log('[MEGAZAP] Telefone recebido:', telefone);

    // 1. Buscar cliente por telefone
    const clienteAPI = await endpoint.getClienteByCelular(telefone);
    console.log('[MEGAZAP] Resposta completa do endpoint:', JSON.stringify(clienteAPI, null, 2));

    // 2. Validar cliente bloqueado
    if (clienteAPI.blocked) {
        console.log('❌ [MEGAZAP] Cliente bloqueado');
        return await messageService.sendTextMessage(
            telefone,
            clienteAPI.error || '❌ Seu acesso está bloqueado. Entre em contato com o suporte.'
        );
    }

    // 3. Validar cliente não encontrado ou sem permissão
    if (!clienteAPI.success || !clienteAPI.hasPermission) {
        console.log('⚠️ [MEGAZAP] Cliente sem permissão');
        const mensagemErro = clienteAPI.error ||
            '❌ Telefone não autorizado. Entre em contato com o suporte para liberar seu acesso.';

        return await messageService.sendTextMessage(telefone, mensagemErro);
    }

    console.log('[MEGAZAP] Cliente válido - Resposta completa:', clienteAPI);
    console.log('[MEGAZAP] clienteAPI.data:', clienteAPI.data);
    console.log('[MEGAZAP] clienteAPI.contato:', clienteAPI.contato);

    // Extrair ID do cliente
    // O endpoint retorna uma estrutura aninhada:
    // clienteAPI.data.data = array de clientes
    // clienteAPI.contato.idParceiro = ID do cliente (mais confiável)
    let clienteId;
    let clienteData;

    // Opção 1: Usar idParceiro do contato (mais confiável)
    if (clienteAPI.contato && clienteAPI.contato.idParceiro) {
        clienteId = clienteAPI.contato.idParceiro;
        console.log(`[MEGAZAP] ID extraído de contato.idParceiro: ${clienteId}`);

        // Buscar dados completos do cliente no array
        if (clienteAPI.data && clienteAPI.data.data && Array.isArray(clienteAPI.data.data)) {
            clienteData = clienteAPI.data.data.find(c => c.id === clienteId);
            if (clienteData) {
                console.log(`[MEGAZAP] Cliente encontrado no array: ${clienteData.nome}`);
            } else {
                console.log(`[MEGAZAP] Cliente não encontrado no array, usando primeiro`);
                clienteData = clienteAPI.data.data[0];
            }
        }
    }
    // Opção 2: Usar primeiro cliente do array data.data
    else if (clienteAPI.data && clienteAPI.data.data && Array.isArray(clienteAPI.data.data)) {
        console.log(`[MEGAZAP] Array de clientes encontrado com ${clienteAPI.data.data.length} elementos`);

        if (clienteAPI.data.data.length === 0) {
            console.log('⚠️ [MEGAZAP] Array de clientes vazio');
            return await messageService.sendTextMessage(
                telefone,
                '❌ Nenhum cliente encontrado. Entre em contato com o suporte.'
            );
        }

        clienteData = clienteAPI.data.data[0];
        clienteId = clienteData.id;
        console.log(`[MEGAZAP] Usando primeiro cliente do array: ID=${clienteId}, Nome=${clienteData.nome}`);
    }
    // Opção 3: Fallback - dados diretos
    else if (clienteAPI.data && Array.isArray(clienteAPI.data)) {
        console.log(`[MEGAZAP] clienteAPI.data é um array direto`);
        clienteData = clienteAPI.data[0];
        clienteId = clienteData.id;
    } else {
        console.error('❌ [MEGAZAP] Formato de dados inesperado!');
        console.error('❌ [MEGAZAP] clienteAPI:', JSON.stringify(clienteAPI, null, 2));
        return await messageService.sendTextMessage(
            telefone,
            '❌ Erro ao processar dados do cliente. Entre em contato com o suporte.'
        );
    }

    // Validar se conseguimos o ID
    if (!clienteId) {
        console.error('❌ [MEGAZAP] Não foi possível extrair o ID do cliente!');
        return await messageService.sendTextMessage(
            telefone,
            '❌ Erro ao identificar cliente. Entre em contato com o suporte.'
        );
    }

    // Salvar cliente no estado
    estado.cliente = clienteData;
    estado.clienteId = clienteId;
    estado.etapa = 'processando_boletos';
    estado.ultimaInteracao = Date.now();
    estadosUsuarios.set(telefone, estado);

    // 4. Buscar boletos
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[MEGAZAP] DEBUG - Antes de buscar boletos:');
    console.log('clienteId:', clienteId);
    console.log('Tipo de clienteId:', typeof clienteId);
    console.log('clienteData:', clienteData);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`[MEGAZAP] Buscando boletos para cliente ID: ${clienteId}`);
    const boletos = await endpoint.getBoletosByCNPJ(clienteId);

    // 5. Validar se existem boletos
    if (!boletos.success || boletos.data.length === 0) {
        console.log('[MEGAZAP] Nenhum boleto encontrado');
        return await messageService.sendTextMessage(
            telefone,
            'Você não possui boletos em aberto no momento.\n\nPosso te ajudar com algo mais?'
        );
    }

    console.log(`[MEGAZAP] ${boletos.data.length} boleto(s) encontrado(s)`);

    // 6. Gerar resposta unificada com todos os boletos
    return await gerarRespostaBoletosUnificada(telefone, boletos.data, clienteData);
}

/**
 * Gera resposta unificada com todos os boletos e PDFs
 * @param {string} telefone - Número do telefone
 * @param {Array} boletos - Array de boletos
 * @param {Object} cliente - Dados do cliente
 * @returns {Promise<Object>} Resposta com mensagem e attachments
 */
async function gerarRespostaBoletosUnificada(telefone, boletos, cliente) {
    console.log('[MEGAZAP] Gerando resposta unificada de boletos');

    // Inicializar mensagem
    let mensagem = `Encontrei *${boletos.length}* boleto(s).\n\n`;

    // Array para armazenar todos os anexos
    const attachments = [];

    // Processar cada boleto
    for (const boleto of boletos) {
        console.log(`[MEGAZAP] Processando boleto: ${boleto.numeroDocumento}`);

        // Adicionar informações do boleto na mensagem
        mensagem += `*Boleto: ${boleto.numeroDocumento}*\n`;
        mensagem += `*Vencimento:* ${formatarDataERP(boleto.dataVencimento)}\n`;
        mensagem += `*Valor:* R$ ${boleto.valor.toFixed(2)} (até o vencimento)\n`;

        // Gerar PDF do boleto
        const boletoPDF = await endpoint.geraBoletoPDF(boleto.idConta);

        if (!boletoPDF.success) {
            console.error(`[MEGAZAP] Erro ao gerar PDF do boleto ${boleto.numeroDocumento}`);
            mensagem += `⚠️ Infelizmente não foi possível gerar o PDF deste boleto.\n`;
        } else {
            console.log(`[MEGAZAP] PDF gerado para boleto ${boleto.numeroDocumento}`);

            // Limpar base64
            const base64Clean = boletoPDF.data.base64
                .replace(/data:application\/pdf;base64,/g, '')
                .replace(/\r?\n|\r/g, '')
                .trim();

            // Adicionar ao array de attachments
            attachments.push({
                position: "AFTER",
                type: "DOCUMENT",
                name: boletoPDF.data.filename,
                base64: base64Clean
            });
        }

        mensagem += '\n'; // Separador entre boletos
    }

    mensagem += 'Posso te ajudar com algo mais?';

    console.log(`[MEGAZAP] Total de anexos: ${attachments.length}`);

    // Se não há anexos (nenhum PDF foi gerado), enviar apenas texto
    if (attachments.length === 0) {
        console.log('⚠️ [MEGAZAP] Nenhum PDF gerado, enviando apenas texto');
        return await messageService.sendTextMessage(telefone, mensagem);
    }

    // Enviar resposta unificada com todos os documentos
    console.log('[MEGAZAP] Enviando resposta unificada com documentos');

    // Usar diretamente o serviço Megazap para ter controle total sobre attachments
    const megazapService = messageService.megazapService;

    // Construir payload manualmente
    const payload = {
        type: "INFORMATION",
        text: mensagem,
        attachments: attachments
    };

    console.log('[MEGAZAP] Payload unificado gerado:', {
        type: payload.type,
        textLength: payload.text.length,
        attachmentsCount: payload.attachments.length
    });

    return {
        success: true,
        data: payload,
        error: null
    };
}

/**
 * Processa fluxo de notas fiscais (placeholder para implementação futura)
 * @param {string} telefone - Número do telefone
 * @param {string} mensagem - Mensagem recebida
 * @param {string} messageId - ID da mensagem
 * @param {Object} megazapData - Dados do Megazap
 * @param {Object} estado - Estado atual do usuário
 * @returns {Promise<Object>} Resposta
 */
async function processarFluxoNotaFiscal(telefone, mensagem, messageId, megazapData, estado) {
    console.log('[MEGAZAP] Processando fluxo de notas fiscais');

    return await messageService.sendTextMessage(
        telefone,
        'A funcionalidade de Notas Fiscais ainda não está disponível.\n\nPosso te ajudar com algo mais?'
    );
}

/**
 * Processa fluxo de Atendimento (move para o menu especifico no MegaZap)
 * @param {string} telefone - Número do telefone
 * @returns {Promise<Object>} Resposta
 */
async function processarFluxoAtendimento(telefone) {
    console.log('[MEGAZAP] Processando fluxo de Redirecionamento Atendimento');

    return await messageService.sendDirectToMenu(
        telefone,
        process.env.MEGAZAP_MENU
    );
}

/**
 * Limpa sessão de um usuário
 * @param {string} telefone - Número do telefone
 */
function limparSessao(telefone) {
    estadosUsuarios.delete(telefone);
    console.log(`🗑️ [MEGAZAP] Sessão limpa para ${telefone}`);
}

/**
 * Obtém informações do estado atual
 * @param {string} telefone - Número do telefone
 * @returns {Object} Estado atual ou null
 */
function obterEstado(telefone) {
    return estadosUsuarios.get(telefone) || null;
}

/**
 * Gera estrutura de menu padrão para Megazap
 * @param {string} phoneNumber - Número do telefone
 * @param {string} messageId - ID da mensagem
 * @returns {Object} Objeto com estrutura do menu
 */
function getDirectToMenu(phoneNumber, messageId) {
    console.log('[MEGAZAP] Gerando menu padrão');
    console.log(`[MEGAZAP] Telefone: ${phoneNumber}, MessageId: ${messageId}`);

    const webhookUrl = process.env.WEBHOOK_URL || 'https://botfox.conb2b.com.br/webhook/message';

    const menu = [
        {
            number: 1,
            text: "Consultar boletos",
            callback: {
                endpoint: webhookUrl,
                data: {
                    text: "boleto",
                    contact: {
                        key: phoneNumber
                    },
                    id: messageId
                }
            }
        },
        {
            number: 2,
            text: "Consultar Nota Fiscal",
            callback: {
                endpoint: webhookUrl,
                data: {
                    text: "notafiscal",
                    contact: {
                        key: phoneNumber
                    },
                    id: messageId
                }
            }
        },
        {
            number: 3,
            text: "Falar com o Financeiro",
            callback: {
                endpoint: webhookUrl,
                data: {
                    text: "atendimento",
                    contact: {
                        key: phoneNumber
                    },
                    id: messageId
                }
            }
        }
    ];

    console.log('[MEGAZAP] Menu padrão gerado com', menu.length, 'opções');

    return { menu };
}

module.exports = {
    fluxoAtendimentoMegazap,
    processarFluxoBoleto,
    processarFluxoNotaFiscal,
    limparSessao,
    obterEstado,
    verificarTimeoutSessao,
    getDirectToMenu,
    OPCOES_MEGAZAP
};
