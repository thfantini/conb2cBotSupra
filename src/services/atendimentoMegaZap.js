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
 * Formata data Boleto ERP
 * @param {string} dataERP - Data no formato (DD-MM-YYYY H:I:S)
 * @returns {string} Data no formato DD/MM/YYYY
 */
function formatarDataBoletoERP(dataERP) {
    if (!dataERP) return 'Data não disponível';

    try {
        // Remover a parte da hora (tudo após o espaço) antes de fazer o split
        const data = dataERP.split(' ')[0];
        const [dia, mes, ano] = data.split('-');
        return `${dia}/${mes}/${ano}`;
    } catch (error) {
        console.error('Erro ao formatar data:', error);
        return dataERP;
    }
}

/**
 * Formata data NFE ERP
 * @param {string} dataERP - Data no formato (YYYY-MM-DD H:I:S)
 * @returns {string} Data no formato DD/MM/YYYY
 */
function formatarDataNfeERP(dataERP) {
    if (!dataERP) return 'Data não disponível';

    try {
        const data = dataERP.split('T')[0];
        const [ano, mes, dia] = data.split('-');
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
        '1',
        'boleto',
        'boletos',
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
        '2',
        'nfe',
        'nota',
        'notas',
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

    // Verificar palavras-chave: Boleto > Determinar ação
    const temPalavraBoleto = verificarPalavrasChaveBoleto(mensagem);
    let acao = opcao;
        if (!acao && temPalavraBoleto) {
            acao = 'boleto';
            console.log('[MEGAZAP] Palavra-chave de boleto detectada');
        }

    // Verificar palavras-chave: NotaFiscal > Determinar ação
    const temPalavraNota = verificarPalavrasChaveNotaFiscal(mensagem);
        if (!acao && temPalavraNota) {
            acao = 'notafiscal';
            console.log('[MEGAZAP] Palavra-chave de notafiscal detectada');
        }

    // Se não há ação identificada, retornar Menu
    if (!acao) {
        console.log('[MEGAZAP] Nenhuma ação identificada');
        
        // Menu MegaZap
        const menu = getMenu(telefone, messageId);
        return await messageService.sendMenu(
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
                'Opção não implementada ainda.'
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

    // 1. Buscar clientes por telefone (agora retorna múltiplas empresas válidas)
    const clienteAPI = await endpoint.getClienteByCelular(telefone);
    console.log('[MEGAZAP] Resposta do endpoint:', JSON.stringify(clienteAPI, null, 2));

    // 2. Validar cliente bloqueado
    if (clienteAPI.blocked) {
        console.log('[MEGAZAP] Cliente bloqueado');
        return await messageService.sendTextMessage(
            telefone,
            clienteAPI.error || 'Seu acesso está bloqueado. Entre em contato com o suporte.'
        );
    }

    // 3. Validar cliente não encontrado ou sem permissão
    if (!clienteAPI.success || !clienteAPI.hasPermission) {
        console.log('[MEGAZAP] Cliente sem permissão');
        const mensagemErro = clienteAPI.error ||
            'Telefone não autorizado. Entre em contato com o suporte para liberar seu acesso.';

        return await messageService.sendTextMessage(telefone, mensagemErro);
    }

    // 4. Validar estrutura de dados
    if (!clienteAPI.data || !Array.isArray(clienteAPI.data) || clienteAPI.data.length === 0) {
        console.log('[MEGAZAP] Nenhuma empresa válida encontrada');
        return await messageService.sendTextMessage(
            telefone,
            'Nenhuma empresa encontrada. Entre em contato com o suporte.'
        );
    }

    const empresas = clienteAPI.data;
    console.log(`[MEGAZAP] ${empresas.length} empresa(s) válida(s) encontrada(s)`);

    // 5. Buscar boletos para cada empresa
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[MEGAZAP] Buscando boletos para todas as empresas...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const empresasComBoletos = [];

    for (const empresa of empresas) {
        console.log(`\n[MEGAZAP] Processando empresa: ${empresa.nome} (ID: ${empresa.id})`);

        const boletos = await endpoint.getBoletosByCNPJ(empresa.id);

        if (boletos.success && boletos.data && boletos.data.length > 0) {
            console.log(`[MEGAZAP] ${boletos.data.length} boleto(s) encontrado(s) para ${empresa.nome}`);

            empresasComBoletos.push({
                ...empresa,
                boletos: boletos.data
            });
        } else {
            console.log(`[MEGAZAP] Nenhum boleto encontrado para ${empresa.nome}`);
        }
    }

    // 6. Validar se alguma empresa tem boletos
    if (empresasComBoletos.length === 0) {
        console.log('[MEGAZAP] Nenhum boleto encontrado em nenhuma empresa');
        return await messageService.sendTextMessage(
            telefone,
            'Você não possui boletos em aberto no momento.\n\nPosso te ajudar com algo mais?'
        );
    }

    console.log(`\n[MEGAZAP] Total: ${empresasComBoletos.length} empresa(s) com boletos`);

    // Salvar no estado
    estado.empresas = empresasComBoletos;
    estado.etapa = 'processando_boletos';
    estado.ultimaInteracao = Date.now();
    estadosUsuarios.set(telefone, estado);

    // 7. Gerar resposta unificada com todas as empresas e boletos
    return await gerarRespostaBoletosUnificada(telefone, empresasComBoletos);
}

/**
 * Gera resposta unificada com todos os boletos e PDFs de múltiplas empresas
 * @param {string} telefone - Número do telefone
 * @param {Array} empresasComBoletos - Array de empresas com seus boletos
 * @returns {Promise<Object>} Resposta com mensagem e attachments
 */
async function gerarRespostaBoletosUnificada(telefone, empresasComBoletos) {
    console.log('[MEGAZAP] Gerando resposta unificada de boletos para múltiplas empresas');

    // Contar total de boletos
    const totalBoletos = empresasComBoletos.reduce((total, empresa) => total + empresa.boletos.length, 0);

    // Inicializar mensagem
    let mensagem = `Encontrei *${totalBoletos}* boleto(s) em *${empresasComBoletos.length}* empresa(s).\n\n`;

    // Array para armazenar todos os anexos
    const attachments = [];

    // Processar cada empresa
    for (const empresa of empresasComBoletos) {
        console.log(`\n[MEGAZAP] Processando empresa: ${empresa.nome}`);
        console.log(`   - Boletos: ${empresa.boletos.length}`);

        // Adicionar nome da empresa na mensagem
        mensagem += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        mensagem += `*${empresa.nomeFantasia || empresa.nome}*\n`;
        mensagem += `CNPJ: ${empresa.cpfCnpj}\n`;
        mensagem += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        // Processar cada boleto da empresa
        for (const boleto of empresa.boletos) {
            console.log(`Processando boleto: ${boleto.numeroDocumento}`);

            // Adicionar informações do boleto na mensagem
            mensagem += `*Boleto: ${boleto.numeroDocumento}*\n`;
            mensagem += `*Vencimento:* ${formatarDataBoletoERP(boleto.dataVencimento)}\n`;
            mensagem += `*Valor:* R$ ${boleto.valor.toFixed(2)} (até o vencimento)\n`;

            // Verifica Linha Digitável
            if (boleto.linhaDigitavelBoleto) {
                mensagem += `*Linha Digitável:*\n${boleto.linhaDigitavelBoleto}\n`;
            }

            // Gerar PDF do boleto
            const boletoPDF = await endpoint.geraBoletoPDF(boleto.idConta);

            if (!boletoPDF.success) {
                console.error(`Erro ao gerar PDF do boleto ${boleto.numeroDocumento}`);
                mensagem += `Não foi possível gerar o PDF deste boleto.\n`;
            } else {
                console.log(`PDF gerado para boleto ${boleto.numeroDocumento}`);

                // Limpar base64
                const base64Clean = boletoPDF.data.base64
                    .replace(/data:application\/pdf;base64,/g, '')
                    .replace(/\r?\n|\r/g, '')
                    .trim();

                // Nome do arquivo incluindo empresa
                const nomeArquivo = `${empresa.nomeFantasia || empresa.nome}_${boletoPDF.data.filename}`;

                // Adicionar ao array de attachments
                attachments.push({
                    position: "AFTER",
                    type: "DOCUMENT",
                    name: nomeArquivo,
                    base64: base64Clean
                });
            }

            mensagem += '\n'; // Separador entre boletos
        }

        mensagem += '\n'; // Separador entre empresas
    }

    mensagem += 'Posso te ajudar com algo mais?';

    console.log(`\n[MEGAZAP] Resumo:`);
    console.log(`   - Empresas processadas: ${empresasComBoletos.length}`);
    console.log(`   - Total de boletos: ${totalBoletos}`);
    console.log(`   - Total de PDFs gerados: ${attachments.length}`);

    // Se não há anexos (nenhum PDF foi gerado), enviar apenas texto
    if (attachments.length === 0) {
        console.log('[MEGAZAP] Nenhum PDF gerado, enviando apenas texto');
        return await messageService.sendTextMessage(telefone, mensagem);
    }

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
 * Processa fluxo unificado de notas para Megazap
 * @param {string} telefone - Número do telefone
 * @param {string} mensagem - Mensagem recebida
 * @param {string} messageId - ID da mensagem
 * @param {Object} megazapData - Dados do Megazap
 * @param {Object} estado - Estado atual do usuário
 * @returns {Promise<Object>} Resposta unificada
 */
async function processarFluxoNotaFiscal(telefone, mensagem, messageId, megazapData, estado) {
    console.log('[MEGAZAP] Processando fluxo de notas');
    console.log('[MEGAZAP] Telefone recebido:', telefone);

    // 1. Buscar clientes por telefone (agora retorna múltiplas empresas válidas)
    const clienteAPI = await endpoint.getClienteByCelular(telefone);
    console.log('[MEGAZAP] Resposta do endpoint:', JSON.stringify(clienteAPI, null, 2));

    // 2. Validar cliente bloqueado
    if (clienteAPI.blocked) {
        console.log('[MEGAZAP] Cliente bloqueado');
        return await messageService.sendTextMessage(
            telefone,
            clienteAPI.error || 'Seu acesso está bloqueado. Entre em contato com o suporte.'
        );
    }

    // 3. Validar cliente não encontrado ou sem permissão
    if (!clienteAPI.success || !clienteAPI.hasPermission) {
        console.log('[MEGAZAP] Cliente sem permissão');
        const mensagemErro = clienteAPI.error ||
            'Telefone não autorizado. Entre em contato com o suporte para liberar seu acesso.';

        return await messageService.sendTextMessage(telefone, mensagemErro);
    }

    // 4. Validar estrutura de dados
    if (!clienteAPI.data || !Array.isArray(clienteAPI.data) || clienteAPI.data.length === 0) {
        console.log('[MEGAZAP] Nenhuma empresa válida encontrada');
        return await messageService.sendTextMessage(
            telefone,
            'Nenhuma empresa encontrada. Entre em contato com o suporte.'
        );
    }

    const empresas = clienteAPI.data;
    console.log(`[MEGAZAP] ${empresas.length} empresa(s) válida(s) encontrada(s)`);

    // 5. Buscar notas para cada empresa
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[MEGAZAP] Buscando notas para todas as empresas...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const empresasComNotas = [];

    for (const empresa of empresas) {
        console.log(`\n[MEGAZAP] Processando empresa: ${empresa.nome} (ID: ${empresa.id})`);

        const notas = await endpoint.getNotaByCNPJ(empresa.id);

        if (notas.success && notas.data && notas.data.length > 0) {
            console.log(`[MEGAZAP] ${notas.data.length} nota(s) encontrado(s) para ${empresa.nome}`);

            empresasComNotas.push({
                ...empresa,
                notas: notas.data
            });
        } else {
            console.log(`[MEGAZAP] Nenhum nota encontrado para ${empresa.nome}`);
        }
    }

    // 6. Validar se alguma empresa tem notas
    if (empresasComNotas.length === 0) {
        console.log('[MEGAZAP] Nenhum nota encontrado em nenhuma empresa');
        return await messageService.sendTextMessage(
            telefone,
            'Você não possui notas em aberto no momento.\n\nPosso te ajudar com algo mais?'
        );
    }

    console.log(`\n[MEGAZAP] Total: ${empresasComNotas.length} empresa(s) com notas`);

    // Salvar no estado
    estado.empresas = empresasComNotas;
    estado.etapa = 'processando_notas';
    estado.ultimaInteracao = Date.now();
    estadosUsuarios.set(telefone, estado);

    // 7. Gerar resposta unificada com todas as empresas e notas
    return await gerarRespostaNotaFiscalUnificada(telefone, empresasComNotas);
}

/**
 * Gera resposta unificada com todos os notas e XMLs de múltiplas empresas
 * @param {string} telefone - Número do telefone
 * @param {Array} empresasComNotas - Array de empresas com seus notas
 * @returns {Promise<Object>} Resposta com mensagem e attachments
 */
async function gerarRespostaNotaFiscalUnificada(telefone, empresasComNotas) {
    console.log('[MEGAZAP] Gerando resposta unificada de notas para múltiplas empresas');

    // Contar total de notas
    const totalNotas = empresasComNotas.reduce((total, empresa) => total + empresa.notas.length, 0);

    // Inicializar mensagem
    let mensagem = `Encontrei *${totalNotas}* nota(s) em *${empresasComNotas.length}* empresa(s).\n\n`;

    // Array para armazenar todos os anexos
    const attachments = [];

    // Processar cada empresa
    for (const empresa of empresasComNotas) {
        console.log(`\n[MEGAZAP] Processando empresa: ${empresa.nome}`);
        console.log(`   - Notas: ${empresa.notas.length}`);

        // Adicionar nome da empresa na mensagem
        mensagem += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        mensagem += `*${empresa.nomeFantasia || empresa.nome}*\n`;
        mensagem += `CNPJ: ${empresa.cpfCnpj}\n`;
        mensagem += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        // Processar cada nota da empresa
        for (const nota of empresa.notas) {
            console.log(`Processando nota com ID: ${nota.idNotaFiscalServico || 'não informado'}`);

            // Verificar se nota tem idNotaFiscalServico
            if (!nota.idNotaFiscalServico) {
                console.log(`Nota sem idNotaFiscalServico - pulando`);
                continue; // Pula notas sem ID
            }

            // Gerar XML da nota (obtém dados completos da NFE)
            const notaXML = await endpoint.geraNotaXML(nota.idNotaFiscalServico);

            if (!notaXML.success || !notaXML.data) {
                console.error(`Erro ao gerar XML da nota ID ${nota.idNotaFiscalServico}`);
                mensagem += `Não foi possível gerar o XML desta nota.\n\n`;
                continue;
            }

            const notaData = notaXML.data;
            console.log(`XML gerado para nota ${notaData.numero || 'N/A'}`);

            // Adicionar informações da nota na mensagem (dados vindos do XML)
            mensagem += `*Nota Fiscal*\n`;
            mensagem += `*Número:* ${notaData.numero || 'N/A'}\n`;
            mensagem += `*Emissão:* ${formatarDataNfeERP(notaData.dataEmissao)}\n`;

            // Validar e formatar valor
            if (notaData.valorLiquidoNfse) {
                const valor = parseFloat(notaData.valorLiquidoNfse);
                mensagem += `*Valor:* R$ ${valor.toFixed(2)}\n`;
            }

            if (notaData.codigoVerificacao) {
                mensagem += `*Código Verificação:* ${notaData.codigoVerificacao}\n`;
            }

            if (notaData.chaveAcesso) {
                mensagem += `*Chave de Acesso:* ${notaData.chaveAcesso}\n`;
            }

            // Verificar se existe base64 do XML
            if (!notaData.base64) {
                console.error(`XML sem base64 para nota ${notaData.numero}`);
                mensagem += `Não foi possível obter o arquivo XML.\n`;
            } else {
                console.log(`Base64 disponível para nota ${notaData.numero}`);

                // Limpar base64
                const base64Clean = notaData.base64
                    .replace(/data:application\/xml;base64,/g, '')
                    .replace(/\r?\n|\r/g, '')
                    .trim();

                // Nome do arquivo incluindo empresa
                const nomeArquivo = `${empresa.nomeFantasia || empresa.nome}_${notaData.filename || `nota_${notaData.numero}.xml`}`;

                // Adicionar ao array de attachments
                attachments.push({
                    position: "AFTER",
                    type: "DOCUMENT",
                    name: nomeArquivo,
                    base64: base64Clean
                });
            }

            mensagem += '\n'; // Separador entre notas
        }

        mensagem += '\n'; // Separador entre empresas
    }

    mensagem += 'Posso te ajudar com algo mais?';

    console.log(`\n[MEGAZAP] Resumo:`);
    console.log(`   - Empresas processadas: ${empresasComNotas.length}`);
    console.log(`   - Total de notas: ${totalNotas}`);
    console.log(`   - Total de XMLs gerados: ${attachments.length}`);

    // Se não há anexos (nenhum XML foi gerado), enviar apenas texto
    if (attachments.length === 0) {
        console.log('[MEGAZAP] Nenhum XML gerado, enviando apenas texto');
        return await messageService.sendTextMessage(telefone, mensagem);
    }

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
 * Gera resposta unificada com todas as notas e XMLs
 * @param {string} telefone - Número do telefone
 * @param {Array} notas - Array de notas
 * @param {Object} cliente - Dados do cliente
 * @returns {Promise<Object>} Resposta com mensagem e attachments
*/
async function gerarRespostaNotaFiscalUnificadaDesativada(telefone, notas, cliente) {
    console.log('[MEGAZAP] Gerando resposta unificada de notas');

    // Inicializar mensagem
    let mensagem = `Encontrei *${notas.length}* nota(s).\n\n`;

    // Array para armazenar todos os anexos
    const attachments = [];

    // Processar cada nota
    for (const nota of notas) {
        console.log(`[MEGAZAP] Processando nota: ${nota.numero}`);

        // Adicionar informações da nota na mensagem
        mensagem += `*Nota Fiscal*\n`;
        mensagem += `*Número:* ${nota.numero}\n`;
        mensagem += `*Emissão:* ${formatarDataNfeERP(nota.dataEmissao)}\n`;

        // Validar e formatar valor
        if (nota.valorLiquidoNfse) {
            const valor = parseFloat(nota.valorLiquidoNfse);
            mensagem += `*Valor:* R$ ${valor.toFixed(2)}\n`;
        }

        if (nota.codigoVerificacao) {
            mensagem += `*Código Verificação:* ${nota.codigoVerificacao}\n`;
        }

        if (nota.chaveAcesso) {
            mensagem += `*Chave de Acesso:* ${nota.chaveAcesso}\n`;
        }

        // Verificar se existe base64 do XML
        if (!nota.base64) {
            console.error(`[MEGAZAP] XML não encontrado para nota ${nota.numero}`);
            mensagem += `Infelizmente não foi possível gerar o XML desta nota.\n`;
        } else {
            console.log(`[MEGAZAP] XML disponível para nota ${nota.numero}`);

            // Limpar base64
            const base64Clean = nota.base64
                .replace(/data:application\/xml;base64,/g, '')
                .replace(/\r?\n|\r/g, '')
                .trim();

            // Adicionar ao array de attachments
            attachments.push({
                position: "AFTER",
                type: "DOCUMENT",
                name: nota.filename || `nota_${nota.numero}.xml`,
                base64: base64Clean
            });
        }

        mensagem += '\n'; // Separador entre notas
    }

    mensagem += 'Posso te ajudar com algo mais?';

    console.log(`[MEGAZAP] Total de anexos: ${attachments.length}`);

    // Se não há anexos (nenhum XML foi gerado), enviar apenas texto
    if (attachments.length === 0) {
        console.log('[MEGAZAP] Nenhum XML gerado, enviando apenas texto');
        return await messageService.sendTextMessage(telefone, mensagem);
    }

    // Enviar resposta unificada com todos os documentos
    console.log('[MEGAZAP] Enviando resposta unificada com documentos');

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
    console.log(`[MEGAZAP] Sessão limpa para ${telefone}`);
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
function getMenu(phoneNumber, messageId) {
    console.log('[MEGAZAP] Gerando menu padrão');
    console.log(`[MEGAZAP] Telefone: ${phoneNumber}, MessageId: ${messageId}`);

    const webhookUrl = process.env.WEBHOOK_URL;

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

    return menu;
}

module.exports = {
    fluxoAtendimentoMegazap,
    processarFluxoBoleto,
    processarFluxoNotaFiscal,
    limparSessao,
    obterEstado,
    verificarTimeoutSessao,
    getMenu,
    OPCOES_MEGAZAP
};
