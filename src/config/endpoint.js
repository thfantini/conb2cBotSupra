require('dotenv').config();
const https = require('https');
const axios = require('axios');
const tokenManager = require('../services/tokenManagerService');

/**
 * Configuração para aceitar certificados SSL auto-assinados
*/

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Criar agent HTTPS
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

/**
 * Obtém o token de autorização (do arquivo ou fallback para .env)
 * @returns {Promise<string>} Token de autorização
 */
async function obterTokenAutorizacao() {
    try {
        // Tentar ler do arquivo primeiro
        const token = await tokenManager.obterTokenAtual();

        if (token) {
            console.log('# Usando token do arquivo físico');
            return token;
        }

        // Fallback para .env se não encontrar no arquivo
        console.log('# Token do arquivo não encontrado, usando .env como fallback');
        return process.env.API_BEARER_TOKEN;

    } catch (error) {
        console.warn('# Erro ao obter token do arquivo, usando .env como fallback:', error.message);
        return process.env.API_BEARER_TOKEN;
    }
}

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

// Interceptor para atualizar o token dinamicamente antes de cada requisição
apiClient.interceptors.request.use(
    async (config) => {
        // Obter token atualizado do arquivo (ou fallback para .env)
        const token = await obterTokenAutorizacao();

        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

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
            const response = await apiClient({
                method,
                url,
                ...options
            });
            
            console.log('# API Request:', logRequest);
            console.log('Status:', response.status);
            
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
                console.log(`# Tentativa ${attempt}/${retries} falhou. Tentando novamente...`);
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Delay progressivo
                continue;
            }

            // Última tentativa ou erro não recuperável
            const errorMessage = error.response?.data?.message || error.message;
            const statusCode = error.response?.status || 'N/A';
            
            console.log('# Erro na requisição API. Request:', logRequest);
            console.log('Status:', statusCode);
            console.log('Erro:', errorMessage);
            
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
            message: '# Desculpe, seu cadastro está bloqueado no momento. Por favor, entre em contato com nosso atendimento para regularização.'
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
 * Verifica se o Telefone existe na lista de contatos do CNPJ
 * @param {Object} clienteData - Dados do cliente
 * @param {string} telefone - Número de telefone a validar
 * @returns {Array} Array de contatos com o telefone correspondente
 */
function buscarTelefoneCliente(clienteData, telefone) {

    // Limpa o telefone para comparação (remove caracteres especiais)
    const validacaoService = require('../services/validacaoService');
    const telefoneLimpo = validacaoService.normalizarTelefoneERP(telefone);
    console.log('buscarTelefoneCliente: ', telefone);
    console.log('telefoneLimpo: ', telefoneLimpo);

    // Busca contatos que possuem telefone correspondente ao número informado
    const cliente = clienteData.data[0];
    const contatosComTelefone = cliente.contatos.filter(contato => {

        // Ignora contatos sem Telefone e Celular
        if (!contato.telefone && !contato.celular) {
            return false;
        }

        // Verifica Contato > Telefone
        let telefoneCorresponde = false;
        if (contato.telefone) {
            let contatoTelefoneLimpo = contato.telefone.replace(/\D/g, '');
            telefoneCorresponde = (contatoTelefoneLimpo === telefoneLimpo);
        }

        // Verifica Contato > Celular (se telefone não correspondeu)
        let celularCorresponde = false;
        if (contato.celular) {
            let contatoCelularLimpo = contato.celular.replace(/\D/g, '');
            celularCorresponde = (contatoCelularLimpo === telefoneLimpo);
        }

        console.log('telefoneCorresponde: ', telefoneCorresponde);
        console.log('celularCorresponde: ', celularCorresponde);

        // Retorna true se corresponder
        return telefoneCorresponde || celularCorresponde;
    });

    console.log('buscarTelefoneCliente - Contatos encontrados:', contatosComTelefone.length);
    return contatosComTelefone;
}



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
            message: '# Cliente não encontrado.',
            contato: null
        };
    }

    const cliente = clienteData.data[0];
    
    if (!cliente.contatos || cliente.contatos.length === 0) {
        return {
            hasPermission: false,
            message: '# Nenhum contato cadastrado para este cliente.',
            contato: null
        };
    }

    /*
        // Limpa o telefone para comparação (remove caracteres especiais)
        // const telefoneLimpo = telefone.replace(/\D/g, '');
        const validacaoService = require('../services/validacaoService');
        const telefoneLimpo = validacaoService.normalizarTelefoneERP(telefone);
        console.log('telefoneLimpo: ', telefoneLimpo);
    */

    // // Busca contatos que possuem telefone correspondente ao número informado
    // const contatosComTelefone = cliente.contatos.filter(contato => {
    //     // Ignora contatos sem telefone
    //     if (!contato.telefone) return false;
        
    //     console.log('contato.nome: ', contato.nome);
    //     console.log('contato.telefone: ', contato.telefone);
    //     console.log('contato.emailFaturamento: ', contato.emailFaturamento);
        
    //     // Verifica Contato > Telefone
    //     let contatoTelefone = contato.telefone.replace(/\D/g, '');
    //     return contatoTelefone === telefoneLimpo;

    //     // Verifica Contato > Celular
    //     let contatoCelular = contato.celular.replace(/\D/g, '');
    //     return contatoCelular === telefoneLimpo;
    // });

    // // Busca contatos que possuem telefone correspondente ao número informado
    // const contatosComTelefone = cliente.contatos.filter(contato => {

    //     // Ignora contatos sem Telefone e Celular
    //     if (!contato.telefone && !contato.celular) {
    //         return false; 
    //     }
        
    //     // Verifica Contato > Telefone
    //     let telefoneCorresponde = false;
    //     if (contato.telefone) {
    //         let contatoTelefoneLimpo = contato.telefone.replace(/\D/g, '');
    //         telefoneCorresponde = (contatoTelefoneLimpo === telefoneLimpo);
    //     }

    //     // Verifica Contato > Celular (se telefone nao correspondeu)
    //     let celularCorresponde = false;
    //     if (contato.celular) {
    //         let contatoCelularLimpo = contato.celular.replace(/\D/g, '');
    //         celularCorresponde = (contatoCelularLimpo === telefoneLimpo);
    //     }

    //     // 2. Retorna true se corresponder
    //     return telefoneCorresponde || celularCorresponde;
    // });

    const contatosComTelefone = buscarTelefoneCliente(clienteData, telefone);

    console.log('- Total de contatos:', cliente.contatos.length);
    console.log('- Contatos com telefone correspondente:', contatosComTelefone.length);

    if (contatosComTelefone.length === 0) {
        return {
            hasPermission: false,
            message: '# Telefone não encontrado nos contatos cadastrados.',
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
            message: '# Este telefone não possui permissão para solicitar boletos.\n\nDeseja ser transferido para atendimento humano?',
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
 * Processa contatos de múltiplas empresas e valida permissões
 * @param {Array} empresas - Array de empresas válidas (não bloqueadas)
 * @param {string} celular - Número do celular para validação
 * @returns {Promise<Array>} Array de empresas com contatos válidos
 */
async function processaContatos(empresas, celular) {
    console.log(`# [PROCESSA CONTATOS] Iniciando validação de ${empresas.length} empresa(s)`);

    const empresasComContatosValidos = [];

    for (const empresa of empresas) {
        console.log(`\n# [PROCESSA CONTATOS] Processando empresa: ${empresa.nome} (ID: ${empresa.id})`);

        // Verificar se a empresa tem contatos
        if (!empresa.contatos || !Array.isArray(empresa.contatos) || empresa.contatos.length === 0) {
            console.log(`# [PROCESSA CONTATOS] Empresa ${empresa.nome} não possui contatos`);
            continue;
        }

        console.log(`# [PROCESSA CONTATOS] Empresa possui ${empresa.contatos.length} contato(s)`);

        // Criar estrutura temporária para validação de permissão
        const dataTemp = { data: [empresa] };
        const permissaoStatus = validarPermissaoFaturamento(dataTemp, celular);

        if (permissaoStatus.hasPermission && permissaoStatus.contato) {
            console.log(`# [PROCESSA CONTATOS] Contato válido encontrado: ${permissaoStatus.contato.nome}`);
            console.log(`   - Telefone: ${permissaoStatus.contato.numero}`);
            console.log(`   - Autoriza Faturamento: ${permissaoStatus.contato.autorizaFaturamento}`);

            // Adicionar empresa com apenas o contato válido
            empresasComContatosValidos.push({
                id: empresa.id,
                nome: empresa.nome,
                nomeFantasia: empresa.nomeFantasia,
                cpfCnpj: empresa.cpfCnpj,
                contatos: [permissaoStatus.contato] // Apenas o contato válido
            });
        } else {
            console.log(`# [PROCESSA CONTATOS] Nenhum contato válido para empresa ${empresa.nome}`);
            console.log(`   - Motivo: ${permissaoStatus.message || 'Sem permissão de faturamento'}`);
        }
    }

    console.log(`\n[PROCESSA CONTATOS] Resultado: ${empresasComContatosValidos.length} empresa(s) com contatos válidos`);

    return empresasComContatosValidos;
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

    // Filtrar apenas empresas que possuem CNPJ válido
    if (result.data && result.data.data && Array.isArray(result.data.data)) {
        const empresasOriginais = result.data.data.length;
        result.data.data = result.data.data.filter(empresa =>
            empresa.cpfCnpj && empresa.cpfCnpj.trim() !== ''
        );
        console.log(`[VALIDAÇÃO CNPJ] Empresas antes do filtro: ${empresasOriginais}, após filtro: ${result.data.data.length}`);

        // Se não houver empresas com CNPJ após o filtro
        if (result.data.data.length === 0) {
            console.log('[VALIDAÇÃO CNPJ] Nenhuma empresa com CNPJ válido encontrada');
            return {
                success: false,
                data: result.data,
                error: 'Nenhuma empresa com CNPJ válido foi encontrada para este telefone.',
                blocked: false,
                hasPermission: false
            };
        }
    }

    // Validação de bloqueio e filtrar empresas válidas (não bloqueadas)
    const empresasValidas = [];

    for (const empresa of result.data.data) {
        // Criar estrutura temporária para validação de bloqueio
        const dataTemp = { data: [empresa] };
        const bloqueioStatus = validarBloqueio(dataTemp);

        if (!bloqueioStatus.blocked) {
            empresasValidas.push(empresa);
            console.log(`[VALIDAÇÃO BLOQUEIO] Empresa ${empresa.nome} - Não bloqueada`);
        } else {
            console.log(`[VALIDAÇÃO BLOQUEIO] Empresa ${empresa.nome} - Bloqueada: ${bloqueioStatus.message}`);
        }
    }

    // Se não houver empresas válidas após filtro de bloqueio
    if (empresasValidas.length === 0) {
        console.log('[VALIDAÇÃO BLOQUEIO] Todas as empresas estão bloqueadas');
        return {
            success: false,
            data: result.data,
            error: 'Todas as empresas associadas a este telefone estão bloqueadas.',
            blocked: true,
            hasPermission: false
        };
    }

    console.log(`[VALIDAÇÃO BLOQUEIO] Empresas válidas (não bloqueadas): ${empresasValidas.length}`);

    // Processar contatos das empresas válidas
    const empresasComContatos = await processaContatos(empresasValidas, celularSemDDI);

    // Se nenhuma empresa tem contato válido
    if (empresasComContatos.length === 0) {
        console.log('[VALIDAÇÃO CONTATOS] Nenhum contato válido encontrado');
        return {
            success: false,
            data: result.data,
            error: 'Nenhum contato autorizado para faturamento foi encontrado.',
            blocked: false,
            hasPermission: false
        };
    }

    // Cliente válido e autorizado com múltiplas empresas
    console.log(`[VALIDAÇÃO] ${empresasComContatos.length} empresa(s) válida(s) com contatos autorizados`);

    return {
        success: true,
        data: empresasComContatos, // Array de empresas com contatos válidos
        error: null,
        blocked: false,
        hasPermission: true
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

    //Sem Resultados
    if (!result.data.data) {
        console.log('getClienteByCNPJ SEM DATA!: ', cpfCnpj)
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
        message: '# Cliente encontrado! Agora preciso validar suas permissões.'
    };
}

/**
 * Busca boletos por ID do parceiro (CNPJ)
 * @param {number} idParceiro - ID do parceiro
 * @returns {Promise} Lista de boletos
 */
async function getBoletosByCNPJ(idParceiro) {
    console.log('getBoletosByCNPJ:', idParceiro);

    /*
        //Mock ( Cliente Supra )
        if(idParceiro==724 || idParceiro==257){
            idParceiro = 2136; //BNT BUSINESS
            idParceiro = 2401; //INCOMED PRODUTOS E EQUIPAMENTOS LTDA
        }
    */

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

    //Sem Resultados
    if (!result.data.data) {
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
    console.log('# geraBoletoPDF - Iniciando:', idConta);

    try {
        // Fazer requisição com responseType arraybuffer para receber dados binários
        const response = await apiClient({
            method: 'GET',
            url: '/financeiro/boletosPDF',
            params: { idConta: idConta },
            responseType: 'arraybuffer',
            validateStatus: function (status) {
                // Aceitar qualquer status para tratar manualmente
                return status >= 200 && status < 600;
            }
        });

        console.log('# Status da resposta:', response.status);
        console.log('Content-Type:', response.headers['content-type']);

        // Se o status não for 200, tentar parsear como JSON de erro
        if (response.status !== 200) {
            let errorMessage = 'Erro ao gerar boleto';

            try {
                // Tentar converter buffer para JSON
                const errorData = JSON.parse(Buffer.from(response.data).toString('utf-8'));
                errorMessage = errorData.message || errorMessage;
                console.log('Erro JSON detectado:', errorData);
            } catch (e) {
                console.log('Não foi possível parsear erro como JSON');
            }

            return {
                success: false,
                error: errorMessage,
                data: null
            };
        }

        // Verificar se é PDF (binário) pelo Content-Type ou pela presença do header PDF
        const contentType = response.headers['content-type'];
        const isPDF = contentType && (
            contentType.includes('application/pdf') ||
            contentType.includes('application/octet-stream')
        );

        // Se não for PDF, pode ser um JSON de erro
        if (!isPDF) {
            try {
                const errorData = JSON.parse(Buffer.from(response.data).toString('utf-8'));
                console.log('# Resposta JSON (erro):', errorData);

                return {
                    success: false,
                    error: errorData.message || 'Erro ao gerar boleto',
                    data: null
                };
            } catch (e) {
                console.log('# Resposta não é PDF nem JSON válido');
                return {
                    success: false,
                    error: 'Resposta inválida do servidor',
                    data: null
                };
            }
        }

        // Converter buffer para base64
        const base64 = Buffer.from(response.data).toString('base64');

        // Verificar se o PDF foi gerado (header PDF: %PDF)
        const pdfHeader = Buffer.from(response.data).toString('utf-8', 0, 5);
        if (!pdfHeader.startsWith('%PDF')) {
            console.log('# Dados recebidos não são um PDF válido');
            return {
                success: false,
                error: 'Dados recebidos não são um PDF válido',
                data: null
            };
        }

        console.log('# Boleto PDF gerado com sucesso!');
        console.log('Tamanho:', response.data.length, 'bytes');

        return {
            success: true,
            data: {
                base64: base64,
                filename: `boleto_${idConta}.pdf`
            },
            error: null
        };

    } catch (error) {
        console.error('# Erro ao gerar boleto PDF:', error.message);

        return {
            success: false,
            error: error.message || 'Erro ao gerar boleto',
            data: null
        };
    }
}

/**
 * Gera PDF do boleto
 * @param {number} idConta - ID da conta
 * @returns {Promise<Object>} Dados do boleto em base64
 */
async function geraBoletoData(idConta) {
    console.log('geraBoletoData:', idConta);

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

async function getNotaByCNPJ(idParceiro) {
    console.log('getNotaByCNPJ:', idParceiro);

    /*
        //Mock ( Cliente Supra )
        if(idParceiro==724 || idParceiro==257){
            idParceiro = 2136; //BNT BUSINESS
            idParceiro = 2401; //INCOMED PRODUTOS E EQUIPAMENTOS LTDA
        }
    */

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

    //Sem Resultados
    if (!result.data.data) {
        return result;
    }

    return {
        success: true,
        data: result.data.data || [],
        error: null
    };
}


/**
 * Busca notas fiscais por ID do parceiro (CNPJ)
 * @param {number} idParceiro - ID do parceiro
 * @returns {Promise} Lista de notas fiscais

async function getNotaByCNPJ(idParceiro) {
    console.log('getNotaByCNPJ:', idParceiro);

    //Mock ( Cliente Supra > Cliente: BNT BUSINESS )
    if(idParceiro==724){
        idParceiro = 2136;
    }

    // Mock: ID fixo para teste
    const idConta = 25960;
    const result = await geraNotaXML(idConta);

    if (!result.success) {
        return {
            success: false,
            error: result.error,
            data: []
        };
    }

    // Verificar se há dados
    if (!result.data) {
        return {
            success: false,
            error: 'Nenhuma nota fiscal encontrada',
            data: []
        };
    }

    // Retornar array de notas (mockado com apenas 1 nota)
    // Estrutura similar a getBoletosByCNPJ que retorna array de boletos
    return {
        success: true,
        data: [result.data], // Array com os dados da nota
        error: null
    };
}
*/


/**
 * Extrai a chave de acesso do campo OutrasInformacoes
 * @param {string} outrasInformacoes - Texto completo do campo OutrasInformacoes
 * @returns {string|null} Chave de acesso extraída ou null
 */
function extrairChaveAcesso(outrasInformacoes) {
    if (!outrasInformacoes) return null;

    // Procurar por sequência de 44 dígitos após "Chave de acesso"
    const regex = /Chave\s+de\s+acesso[^:]*:\s*(\d{44})/i;
    const match = outrasInformacoes.match(regex);

    if (match && match[1]) {
        return match[1];
    }

    // Tentar encontrar qualquer sequência de 44 dígitos
    const regexNumeros = /(\d{44})/;
    const matchNumeros = outrasInformacoes.match(regexNumeros);

    return matchNumeros ? matchNumeros[1] : null;
}

/**
 * Faz parsing do XML da Nota Fiscal e extrai informações
 * @param {string} xmlString - String XML completa
 * @returns {Object} Objeto com dados extraídos da nota
 */
function parseNotaFiscalXML(xmlString) {
    try {
        // Extrair Número da Nota
        const numeroMatch = xmlString.match(/<Numero>([^<]+)<\/Numero>/i);
        const numero = numeroMatch ? numeroMatch[1] : null;

        // Extrair Código de Verificação
        const codigoVerificacaoMatch = xmlString.match(/<CodigoVerificacao>([^<]+)<\/CodigoVerificacao>/i);
        const codigoVerificacao = codigoVerificacaoMatch ? codigoVerificacaoMatch[1] : null;

        // Extrair Valor Líquido da NFSe (Servico > Valores > ValorLiquidoNfse)
        const valorLiquidoMatch = xmlString.match(/<ValorLiquidoNfse>([^<]+)<\/ValorLiquidoNfse>/i);
        const valorLiquidoNfse = valorLiquidoMatch ? valorLiquidoMatch[1] : null;

        // Extrair Data de Emissão
        const dataEmissaoMatch = xmlString.match(/<DataEmissao>([^<]+)<\/DataEmissao>/i);
        const dataEmissao = dataEmissaoMatch ? dataEmissaoMatch[1] : null;

        // Extrair Outras Informações
        const outrasInformacoesMatch = xmlString.match(/<OutrasInformacoes>([^<]+)<\/OutrasInformacoes>/i);
        const outrasInformacoes = outrasInformacoesMatch ? outrasInformacoesMatch[1] : null;

        // Extrair a chave de acesso do campo OutrasInformacoes
        const chaveAcesso = extrairChaveAcesso(outrasInformacoes);

        return {
            numero,
            codigoVerificacao,
            dataEmissao,
            valorLiquidoNfse,
            outrasInformacoes,
            chaveAcesso
        };
    } catch (error) {
        console.error('# Erro ao fazer parsing do XML:', error.message);
        return {
            numero: null,
            codigoVerificacao: null,
            dataEmissao: null,
            valorLiquidoNfse: null,
            outrasInformacoes: null,
            chaveAcesso: null
        };
    }
}

/**
 * Gera XML da NFE/NFSE
 * @param {number} idConta - ID da conta
 * @returns {Promise<Object>} Dados da nota em base64 com informações extraídas
 */
async function geraNotaXML(idConta) {
    console.log('# geraNotaXML - Iniciando:', idConta);

    try {
        // Fazer requisição para obter o XML
        const response = await apiClient({
            method: 'GET',
            url: '/comercial/notaFiscalServico/XML',
            params: { id: idConta },
            validateStatus: function (status) {
                // Aceitar qualquer status para tratar manualmente
                return status >= 200 && status < 600;
            }
        });

        console.log('Status da resposta:', response.status);
        console.log('Content-Type:', response.headers['content-type']);

        // Se o status não for 200, retornar erro
        if (response.status !== 200) {
            let errorMessage = response.data?.message || 'Erro ao gerar nota';
            console.log('Erro na requisição:', errorMessage);

            return {
                success: false,
                error: errorMessage,
                data: null
            };
        }

        // Verificar se a resposta tem a estrutura esperada
        if (!response.data || !response.data.success || !response.data.data || response.data.data.length === 0) {
            console.log('Resposta sem dados válidos');
            return {
                success: false,
                error: 'Nota fiscal não encontrada',
                data: null
            };
        }

        // Extrair o XML do campo xml
        const xmlString = response.data.data[0].xml;

        if (!xmlString) {
            console.log('Campo XML não encontrado na resposta');
            return {
                success: false,
                error: 'XML não encontrado na resposta',
                data: null
            };
        }

        // Verificar se o XML é válido (deve começar com < ou <?xml)
        const xmlHeader = xmlString.trim().substring(0, 5);
        if (!xmlHeader.startsWith('<?xml') && !xmlHeader.startsWith('<')) {
            console.log('Dados recebidos não são um XML válido');
            return {
                success: false,
                error: 'Dados recebidos não são um XML válido',
                data: null
            };
        }

        // Converter XML para base64
        const base64 = Buffer.from(xmlString, 'utf-8').toString('base64');

        // Fazer parsing do XML para extrair informações
        const dadosNota = parseNotaFiscalXML(xmlString);

        console.log('# Nota XML gerada com sucesso!');
        console.log('Tamanho:', xmlString.length, 'bytes');
        console.log('Número:', dadosNota.numero);
        console.log('Código Verificação:', dadosNota.codigoVerificacao);
        console.log('Data Emissão:', dadosNota.dataEmissao);
        console.log('Valor Líquido:', dadosNota.valorLiquidoNfse);
        console.log('Chave de Acesso:', dadosNota.chaveAcesso);

        return {
            success: true,
            data: {
                base64: base64,
                xmlString: xmlString, // XML completo como string
                filename: `${dadosNota.numero}-${dadosNota.codigoVerificacao}.xml`,
                // Dados extraídos do XML para WhatsApp
                numero: dadosNota.numero,
                codigoVerificacao: dadosNota.codigoVerificacao,
                dataEmissao: dadosNota.dataEmissao,
                valorLiquidoNfse: dadosNota.valorLiquidoNfse,
                chaveAcesso: dadosNota.chaveAcesso,
                outrasInformacoes: dadosNota.outrasInformacoes
            },
            error: null
        };

    } catch (error) {
        console.error('Erro ao gerar nota XML:', error.message);

        return {
            success: false,
            error: error.message || 'Erro ao gerar nota',
            data: null
        };
    }
}


/**
 * Gera novo token ERP
 * @returns {Promise<Object>} Token e dados de validade
 */
async function gerarTokenERP() {
    console.log('gerarTokenERP - Iniciando...');

    try {
        // Buscar credenciais do .env
        const login = process.env.API_USER_TOKEN;
        const senha = process.env.API_PASS_TOKEN;

        if (!login || !senha) {
            throw new Error('Credenciais API_USER_TOKEN ou API_PASS_TOKEN não configuradas no .env');
        }

        // Fazer requisição para gerar token
        const response = await apiClient({
            method: 'POST',
            url: '/cadastro/usuario/token',
            data: {
                login: login,
                senha: senha
            }
        });

        console.log('Status da resposta:', response.status);

        // Verificar se o status não for 200
        if (response.status !== 200) {
            throw new Error('Erro ao gerar token ERP');
        }

        // Validar estrutura da resposta
        if (!response.data || !response.data.success) {
            throw new Error('Resposta inválida do servidor');
        }

        const { token, dataValidade, data } = response.data;

        // Validar dados essenciais
        if (!token || !dataValidade) {
            throw new Error('Token ou data de validade não retornados');
        }

        console.log('# Token ERP gerado com sucesso!');
        console.log('Token:', token);
        console.log('Data de Validade:', dataValidade);

        return {
            success: true,
            data: {
                token: token,
                dataValidade: dataValidade,
                dataValidadeToken: data && data[0] ? data[0].dataValidadeToken : dataValidade,
                appVersion: response.data.appVersion,
                usuario: data && data[0] ? {
                    nome: data[0].nome,
                    login: data[0].login,
                    id: data[0].id
                } : null
            },
            error: null
        };

    } catch (error) {
        console.error('# Erro ao gerar token ERP:', error.message);

        return {
            success: false,
            data: null,
            error: error.message || 'Erro ao gerar token ERP'
        };
    }
}

/**
 * Testa conexão com a API externa
 * @returns {Promise} Status da conexão
 */
async function testConnection() {
    try {
        const response = await apiClient.get('/health', { timeout: 5000 });
        console.log('# API Externa conectada com sucesso!');
        console.log(`# Base URL: ${apiConfig.baseURL}`);
        return true;
    } catch (error) {
        console.log('# Aviso: Não foi possível conectar à API externa:', error.message);
        console.log('# Base URL configurada:', apiConfig.baseURL);
        return false;
    }
}

module.exports = {
    getClienteByCelular,
    getClienteByCNPJ,
    getBoletosByCNPJ,
    geraBoletoPDF,
    geraBoletoData,
    getNotaByCNPJ,
    geraNotaXML,
    gerarTokenERP,
    testConnection,
    validarBloqueio,
    validarPermissaoFaturamento,
    processaContatos,
    buscarTelefoneCliente
};