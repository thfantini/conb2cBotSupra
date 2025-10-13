/**
 * Templates de mensagens do bot
 * Centralizadas para facilitar manutenção e personalização
 */

const MENSAGENS = {
    BOAS_VINDAS: {
        COM_NOME: (nome) => 
            `👋 Olá, *${nome}*!\n\n` +
            'Seja bem-vindo(a) ao nosso atendimento automatizado.',
        
        SEM_NOME: () =>
            '👋 Olá! Seja bem-vindo(a) ao nosso atendimento automatizado.'
    },
    
    BLOQUEIO: {
        CLIENTE_BLOQUEADO: () =>
            '🚫 *Cadastro Bloqueado*\n\n' +
            'Identificamos que seu cadastro está bloqueado no momento.\n\n' +
            '📞 Por favor, entre em contato com nosso departamento comercial:\n' +
            '• Telefone: (31) 3333-4444\n' +
            '• Email: comercial@empresa.com',
        
        BLOQUEADO_DURANTE_ATENDIMENTO: () =>
            '🚫 *Atenção*\n\n' +
            'Seu cadastro foi bloqueado durante este atendimento.\n\n' +
            'O atendimento será encerrado. Por favor, entre em contato ' +
            'com nosso departamento comercial.'
    },
    
    PERMISSAO: {
        SEM_PERMISSAO: () =>
            '⚠️ *Sem Permissão*\n\n' +
            'Este telefone não possui permissão para solicitar boletos.\n\n' +
            'Deseja ser transferido para atendimento humano?',
        
        TELEFONE_NAO_CADASTRADO: (cnpj) =>
            '⚠️ *Telefone Não Cadastrado*\n\n' +
            `Seu telefone não está cadastrado para o CNPJ: *${cnpj}*\n\n` +
            'Por favor, entre em contato para atualizar seu cadastro.'
    },
    
    CNPJ: {
        SOLICITAR: () =>
            '🏢 *Identificação*\n\n' +
            'Para continuar, por favor, informe o *CNPJ* da sua empresa:\n\n' +
            '_(Digite apenas os números)_',
        
        NAO_ENCONTRADO: () =>
            '❌ *CNPJ Não Encontrado*\n\n' +
            'Não encontramos este CNPJ em nossa base de dados.\n\n' +
            'Por favor, verifique o número e tente novamente.',
        
        INVALIDO: () =>
            '❌ *CNPJ Inválido*\n\n' +
            'O CNPJ informado não é válido.\n\n' +
            'Por favor, verifique e informe novamente.'
    },
    
    MENU: {
        PRINCIPAL: () =>
            '📋 *Menu de Atendimento*\n\n' +
            'Como posso ajudar você hoje?\n\n' +
            'Selecione uma das opções abaixo:',
        
        OPCAO_INVALIDA: () =>
            '❌ Opção inválida.\n\n' +
            'Por favor, escolha uma opção válida do menu.'
    },
    
    BOLETOS: {
        CONSULTANDO: () =>
            '🔍 Consultando seus boletos em aberto...',
        
        SEM_BOLETOS: () =>
            '✅ *Ótima notícia!*\n\n' +
            'Você não possui boletos em aberto no momento.',
        
        ENCONTRADOS: (quantidade) =>
            `📊 Encontrei *${quantidade}* boleto(s) em aberto.\n\n` +
            'Enviarei os detalhes de cada um:'
    },
    
    NFE: {
        CONSULTANDO: () =>
            '🔍 Consultando suas notas fiscais...',
        
        SEM_NFE: () =>
            '✅ Você não possui notas fiscais disponíveis no momento.',
        
        ENCONTRADAS: (quantidade) =>
            `📊 Encontrei *${quantidade}* nota(s) fiscal(is).\n\n` +
            'Enviarei os detalhes de cada uma:'
    },
    
    CERTIFICADOS: {
        CONSULTANDO: () =>
            '🔍 Consultando seus certificados...',
        
        SEM_CERTIFICADOS: () =>
            '✅ Você não possui certificados disponíveis no momento.',
        
        ENCONTRADOS: (quantidade) =>
            `📊 Encontrei *${quantidade}* certificado(s).\n\n` +
            'Enviarei os detalhes de cada um:'
    },
    
    ATENDIMENTO: {
        TRANSFERINDO: () =>
            '👨‍💼 *Transferindo para Atendimento*\n\n' +
            'Sua solicitação será direcionada para um de nossos atendentes.\n' +
            'Aguarde que em breve alguém entrará em contato com você.',
        
        INDISPONIVEL: () =>
            '⚠️ *Atendimento Indisponível*\n\n' +
            'Nosso horário de atendimento é:\n' +
            'Segunda a Sexta: 8h às 18h\n\n' +
            'Por favor, retorne neste horário ou deixe sua mensagem ' +
            'que responderemos assim que possível.'
    },
    
    ENCERRAMENTO: {
        CANCELAMENTO: () =>
            '👋 Atendimento cancelado.\n\n' +
            'Se precisar de ajuda novamente, é só enviar uma mensagem!',
        
        TIMEOUT: () =>
            '⏱️ *Sessão Expirada*\n\n' +
            'Sua sessão expirou por inatividade.\n\n' +
            'Envie qualquer mensagem para iniciar um novo atendimento.',
        
        FINALIZACAO: () =>
            '✅ *Atendimento Finalizado*\n\n' +
            'Obrigado por utilizar nosso atendimento!\n\n' +
            'Se precisar de algo mais, estamos à disposição.'
    },
    
    ERROS: {
        GENERICO: () =>
            '❌ Desculpe, ocorreu um erro.\n\n' +
            'Por favor, tente novamente em alguns instantes.',
        
        CONEXAO: () =>
            '⚠️ Problema de conexão temporário.\n\n' +
            'Estamos trabalhando para resolver. ' +
            'Por favor, tente novamente em instantes.',
        
        PROCESSAMENTO: () =>
            '❌ Não foi possível processar sua solicitação.\n\n' +
            'Nossa equipe técnica foi notificada. ' +
            'Por favor, tente novamente mais tarde.'
    },
    
    AGUARDANDO: {
        PROCESSANDO: () =>
            '⏳ Processando sua solicitação...\n\n' +
            'Aguarde um momento, por favor.',
        
        BUSCANDO_DADOS: () =>
            '🔍 Buscando informações...',
        
        GERANDO_DOCUMENTO: () =>
            '📄 Gerando documento...\n\n' +
            'Isso pode levar alguns segundos.'
    }
};

/**
 * Função helper para formatar mensagem com dados do cliente
 * @param {string} nome - Nome do cliente
 * @param {string} empresa - Nome da empresa
 * @returns {string} Mensagem formatada
 */
function mensagemBoasVindasPersonalizada(nome, empresa) {
    return `👋 Olá, *${nome}*!\n\n` +
           `Bem-vindo(a) ao atendimento da *${empresa}*.\n\n` +
           'Como posso ajudá-lo(a) hoje?';
}

/**
 * Função helper para formatar mensagem de boleto
 * @param {Object} boleto - Dados do boleto
 * @returns {string} Mensagem formatada
 */
function mensagemBoleto(boleto) {
    return `🧾 *Boleto #${boleto.numero}*\n` +
           `📅 Vencimento: ${boleto.dataVencimento}\n` +
           `💰 Valor: ${boleto.valor}\n\n` +
           `🔢 Linha Digitável:\n${boleto.linhaDigitavel}\n\n` +
           `🔗 Link:\n${boleto.url}`;
}

/**
 * Função helper para formatar mensagem de NFE
 * @param {Object} nfe - Dados da NFE
 * @returns {string} Mensagem formatada
 */
function mensagemNFE(nfe) {
    return `📄 *Nota Fiscal #${nfe.numero}*\n` +
           `📅 Data: ${nfe.dataEmissao}\n` +
           `💰 Valor: ${nfe.valor}\n\n` +
           `🔢 Código:\n${nfe.codigo}\n\n` +
           `🔗 Link:\n${nfe.url}`;
}

/**
 * Função helper para formatar mensagem de certificado
 * @param {Object} certificado - Dados do certificado
 * @returns {string} Mensagem formatada
 */
function mensagemCertificado(certificado) {
    return `📜 *Certificado #${certificado.numero}*\n` +
           `📅 Emissão: ${certificado.dataEmissao}\n` +
           `📄 Nota: ${certificado.numeroNota}\n\n` +
           `🔗 Link:\n${certificado.url}`;
}

module.exports = MENSAGENS;
module.exports.mensagemBoasVindasPersonalizada = mensagemBoasVindasPersonalizada;
module.exports.mensagemBoleto = mensagemBoleto;
module.exports.mensagemNFE = mensagemNFE;
module.exports.mensagemCertificado = mensagemCertificado;