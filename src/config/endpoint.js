require('dotenv').config();
const axios = require('axios');

/**
 * Configuração para aceitar certificados SSL auto-assinados
*/

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Criar agent HTTPS
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

/**
 * Configuração do cliente HTTP para APIs externas
 */
const apiConfig = {
    baseURL: process.env.API_BASE_URL,
    timeout: parseInt(process.env.API_TIMEOUT) || 60000,
    headers: {
        'Authorization': `Bearer ${process.env.API_BEARER_TOKEN}`,
        'Content-Type': 'application/json'
    },
    httpsAgent: httpsAgent
};

/**
 * Cliente HTTP configurado
 */
const apiClient = axios.create(apiConfig);

/*
    // Ignorar SSL em desenvolvimento (ADICIONAR AQUI)
    if (process.env.NODE_ENV === 'development') {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }
*/

/**
 * Função auxiliar para formatar logs de requisição
 * @param {string} method - Método HTTP
 * @param {string} url - URL da requisição
 * @param {Object} params - Parâmetros da requisição
 * @returns {string} String formatada para log
 */
function formatRequestForLog(method, url, params = {}) {
    const paramStr = Object.keys(params).length > 0 
        ? `?${Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&')}`
        : '';
    return `[${method.toUpperCase()}] ${url}${paramStr}`;
}

/**
 * Executa requisição HTTP com retry automático
 * @param {string} method - Método HTTP (GET, POST, etc)
 * @param {string} url - URL do endpoint
 * @param {Object} options - Opções da requisição
 * @param {number} retries - Número de tentativas
 * @returns {Promise} Resultado da requisição
 */
async function executeRequest(method, url, options = {}, retries = 3) {
    const logRequest = formatRequestForLog(method, url, options.params);
    
    console.log('method: ', method);
    console.log('url: ', url);
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const httpsAgent = new https.Agent({
                rejectUnauthorized: false
            });
            
            const response = await apiClient({
                method,
                url,
                httpsAgent,
                ...options
            });
            
            console.log('API Request:', logRequest);
            console.log('✅ Status:', response.status);
            
            return {
                success: true,
                data: response.data,
                error: null
            };
        } catch (error) {
            const shouldRetry = (
                error.code === 'ECONNRESET' ||
                error.code === 'ETIMEDOUT' ||
                error.code === 'ECONNREFUSED' ||
                (error.response && error.response.status >= 500)
            );

            // Se deve tentar novamente e ainda tem tentativas
            if (shouldRetry && attempt < retries) {
                console.log(`⚠️ Tentativa ${attempt}/${retries} falhou. Tentando novamente...`);
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Delay progressivo
                continue;
            }

            // Última tentativa ou erro não recuperável
            const errorMessage = error.response?.data?.message || error.message;
            const statusCode = error.response?.status || 'N/A';
            
            console.log('❌ Erro na requisição API. Request:', logRequest);
            console.log('❌ Status:', statusCode);
            console.log('❌ Erro:', errorMessage);
            
            return {
                success: false,
                data: null,
                error: errorMessage
            };
        }
    }
}

/**
 * Valida se o cliente está bloqueado
 * @param {Object} clienteData - Dados do cliente
 * @returns {Object} Status de bloqueio
 */
function validarBloqueio(clienteData) {
    if (!clienteData || !clienteData.data || clienteData.data.length === 0) {
        return {
            blocked: false,
            message: null
        };
    }

    const cliente = clienteData.data[0];
    
    if (cliente.bloqueado === true) {
        return {
            blocked: true,
            message: '🚫 Desculpe, seu cadastro está bloqueado no momento. Por favor, entre em contato com nosso atendimento para regularização.'
        };
    }

    return {
        blocked: false,
        message: null
    };
}

/**
 * Valida se o contato tem permissão para solicitar boletos
 * @param {Object} clienteData - Dados do cliente
 * @param {string} telefone - Número de telefone a validar
 * @returns {Object} Status de permissão

function validarPermissaoFaturamento(clienteData, telefone) {
    if (!clienteData || !clienteData.data || clienteData.data.length === 0) {
        console.log('Cliente não encontrado!');
        return {
            hasPermission: false,
            message: '❌ Cliente não encontrado.',
            contato: null
        };
    }

    const cliente = clienteData.data[0];
    //console.log('clienteData: ', cliente);
    //console.log('clienteContatos: ', cliente.contatos);
    
    if (!cliente.contatos || cliente.contatos.length === 0) {
        console.log('Nenhum contato cadastrado para este cliente!');
        return {
            hasPermission: false,
            message: '❌ Nenhum contato cadastrado para este cliente.',
            contato: null
        };
    }

    // Limpa o telefone para comparação (remove caracteres especiais)
    const telefoneLimpo = telefone.replace(/\D/g, '');

    console.log('telefoneLimpo: ', telefoneLimpo);
    console.log('clienteContatos: ', cliente.contatos);

    // Busca contatos com o telefone informado
    const contatosComTelefone = cliente.contatos.filter(contato => {
        
        
        if(contato.telefone!='undefined'){
            console.log('telefone: ', contato.telefone);
        }
        
        
        if (!contato.telefone) return false;
        const contatoTelefoneLimpo = contato.telefone.replace(/\D/g, '');
        return contatoTelefoneLimpo === telefoneLimpo;
    });

    if (contatosComTelefone.length === 0) {
        console.log('Telefone não encontrado nos contatos cadastrados!');
        return {
            hasPermission: false,
            message: '❌ Telefone não encontrado nos contatos cadastrados.',
            contato: null
        };
    }

    // Busca o contato com emailFaturamento = true
    const contatoAutorizado = contatosComTelefone.find(
        contato => contato.emailFaturamento === true
    );

    if (!contatoAutorizado) {
        console.log('Este telefone não possui permissão para solicitar boletos!');
        return {
            hasPermission: false,
            message: '⚠️ Este telefone não possui permissão para solicitar boletos.\n\nDeseja ser transferido para atendimento humano?',
            contato: contatosComTelefone[0] // Retorna o primeiro contato encontrado
        };
    }

     console.log('hasPermission: Autorizado!');
    return {
        hasPermission: true,
        message: null,
        contato: contatoAutorizado
    };
}
*/

/**
 * Valida se o contato tem permissão para solicitar boletos
 * @param {Object} clienteData - Dados do cliente
 * @param {string} telefone - Número de telefone a validar
 * @returns {Object} Status de permissão
 */
function validarPermissaoFaturamento(clienteData, telefone) {
    if (!clienteData || !clienteData.data || clienteData.data.length === 0) {
        return {
            hasPermission: false,
            message: '❌ Cliente não encontrado.',
            contato: null
        };
    }

    const cliente = clienteData.data[0];
    
    if (!cliente.contatos || cliente.contatos.length === 0) {
        return {
            hasPermission: false,
            message: '❌ Nenhum contato cadastrado para este cliente.',
            contato: null
        };
    }

    // Limpa o telefone para comparação (remove caracteres especiais)
    const telefoneLimpo = telefone.replace(/\D/g, '');
    console.log('telefoneLimpo: ', telefoneLimpo);

    // Busca contatos que possuem telefone correspondente ao número informado
    const contatosComTelefone = cliente.contatos.filter(contato => {
        // Ignora contatos sem telefone
        if (!contato.telefone) return false;
        
        console.log('contato.nome: ', contato.nome);
        console.log('contato.telefone: ', contato.telefone);
        console.log('contato.emailFaturamento: ', contato.emailFaturamento);
        
        // Limpa telefone do contato e compara
        const contatoTelefoneLimpo = contato.telefone.replace(/\D/g, '');
        return contatoTelefoneLimpo === telefoneLimpo;
    });

    console.log('- Total de contatos:', cliente.contatos.length);
    console.log('- Contatos com telefone correspondente:', contatosComTelefone.length);

    if (contatosComTelefone.length === 0) {
        return {
            hasPermission: false,
            message: '❌ Telefone não encontrado nos contatos cadastrados.',
            contato: null
        };
    }

    // Busca o contato com emailFaturamento = true
    const contatoAutorizado = contatosComTelefone.find(
        contato => contato.emailFaturamento === true
    );

    if (!contatoAutorizado) {
        return {
            hasPermission: false,
            message: '⚠️ Este telefone não possui permissão para solicitar boletos.\n\nDeseja ser transferido para atendimento humano?',
            contato: contatosComTelefone[0] // Retorna o primeiro contato encontrado
        };
    }

    return {
        hasPermission: true,
        message: null,
        contato: contatoAutorizado
    };
}

/**
 * Busca cliente por número de celular
 * @param {string} celular - Número do celular
 * @returns {Promise} Dados do cliente com validações
 */
async function getClienteByCelular(celular) {

    // Remover DDI antes de enviar para API
    const validacaoService = require('../services/validacaoService');
    const celularSemDDI = validacaoService.normalizarTelefoneApi(celular);

    const result = await executeRequest('GET', '/cadastro/parceiro/clientesPorTelefone', {
        params: { numeroTelefone: celularSemDDI }
    });

    if (!result.success) {
        return result;
    }

    console.log('----- result: ', result.success);
    console.log('----- data: ', result.data);

    // Validação de bloqueio
    const bloqueioStatus = validarBloqueio(result.data);
    if (bloqueioStatus.blocked) {
        console.log('Validação de bloqueio');
        return {
            success: false,
            data: result.data,
            error: bloqueioStatus.message,
            blocked: true,
            hasPermission: false
        };
    }

    // Validação de permissão de faturamento
    const permissaoStatus = validarPermissaoFaturamento(result.data, celularSemDDI);
    if (!permissaoStatus.hasPermission) {
        console.log('validarPermissaoFaturamento');
        return {
            success: false,
            data: result.data,
            error: permissaoStatus.message,
            blocked: false,
            hasPermission: false,
            contato: permissaoStatus.contato
        };
    }

    // Cliente válido e autorizado
    console.log('Cliente válido e autorizado: true');
    return {
        success: true,
        data: result.data,
        error: null,
        blocked: false,
        hasPermission: true,
        contato: permissaoStatus.contato
    };
}

/**
 * Busca cliente por CNPJ
 * @param {string} cpfCnpj - CPF ou CNPJ do cliente
 * @returns {Promise} Dados do cliente com validações
 */
async function getClienteByCNPJ(cpfCnpj) {
    console.log('getClienteByCNPJ:', cpfCnpj);

    const result = await executeRequest('GET', '/cadastro/parceiro/clientes', {
        params: { cpfCnpj: cpfCnpj }
    });

    console.log(result);

    if (!result.success) {
        return result;
    }

    // Validação de bloqueio
    const bloqueioStatus = validarBloqueio(result.data);
    if (bloqueioStatus.blocked) {
        return {
            success: false,
            data: result.data,
            error: bloqueioStatus.message,
            blocked: true,
            hasPermission: null // Não aplicável sem telefone
        };
    }

    // Para CNPJ, retornamos sucesso mas sem validação de permissão
    // A permissão será validada quando o usuário informar o telefone
    return {
        success: true,
        data: result.data,
        error: null,
        blocked: false,
        hasPermission: null, // Será validado posteriormente
        message: '✅ Cliente encontrado! Agora preciso validar suas permissões.'
    };
}

/**
 * Busca boletos por ID do parceiro (CNPJ)
 * @param {number} idParceiro - ID do parceiro
 * @returns {Promise} Lista de boletos
 */
async function getBoletosByCNPJ(idParceiro) {
    console.log('getBoletosByCNPJ:', idParceiro);

    //Mock ( Cliente Supra > Cliente: BNT BUSINESS )
    if(idParceiro==724){
        idParceiro = 2136;
    }

    const result = await executeRequest('GET', '/financeiro/parcelas', {
        params: {
            max: 10,
            consolidada: false,
            contaPagarReceber: 'RECEBER',
            idParceiro: idParceiro,
            idsSituacaoDocumento: '[1,2]',
            quitada: false
        }
    });

    if (!result.success) {
        return result;
    }

    return {
        success: true,
        data: result.data.data || [],
        error: null
    };
}

/**
 * Gera PDF do boleto
 * @param {number} idConta - ID da conta
 * @returns {Promise<Object>} Dados do boleto em base64
 */
async function geraBoletoPDF(idConta) {
    console.log('geraBoletoPDF:', idConta);

    const result = await executeRequest('GET', '/financeiro/boletos', {
        params: { idConta: idConta }
    });

    if (!result.success) {
        return {
            success: false,
            error: result.error,
            data: null
        };
    }

    if (!result.data.data || result.data.data.length === 0) {
        return {
            success: false,
            error: 'Boleto não encontrado',
            data: null
        };
    }

    // Retorna o base64 do PDF
    return {
        success: true,
        data: {
            base64: result.data.data[0].boleto,
            filename: `boleto_${idConta}.pdf`
        },
        error: null
    };
}

/**
 * Testa conexão com a API externa
 * @returns {Promise} Status da conexão
 */
async function testConnection() {
    try {
        const response = await apiClient.get('/health', { timeout: 5000 });
        console.log('✅ API Externa conectada com sucesso!');
        console.log(`🌐 Base URL: ${apiConfig.baseURL}`);
        return true;
    } catch (error) {
        console.log('⚠️ Aviso: Não foi possível conectar à API externa:', error.message);
        console.log('🌐 Base URL configurada:', apiConfig.baseURL);
        return false;
    }
}

module.exports = {
    getClienteByCelular,
    getClienteByCNPJ,
    getBoletosByCNPJ,
    geraBoletoPDF,
    testConnection,
    validarBloqueio,
    validarPermissaoFaturamento
};