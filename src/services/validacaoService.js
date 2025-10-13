const endpoint = require('../config/endpoint');

/**
 * Serviço de Validações
 * Contém todas as funções de validação do sistema
 */

/**
 * Valida se um CNPJ é válido (apenas formato)
 * @param {string} cnpj - CNPJ a ser validado
 * @returns {boolean} True se válido
 */
function validarFormatoCNPJ(cnpj) {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    
    if (cnpjLimpo.length !== 14) {
        return false;
    }
    
    // Verifica se todos os dígitos são iguais
    if (/^(\d)\1{13}$/.test(cnpjLimpo)) {
        return false;
    }
    
    // Validação dos dígitos verificadores
    let tamanho = cnpjLimpo.length - 2;
    let numeros = cnpjLimpo.substring(0, tamanho);
    const digitos = cnpjLimpo.substring(tamanho);
    let soma = 0;
    let pos = tamanho - 7;
    
    for (let i = tamanho; i >= 1; i--) {
        soma += numeros.charAt(tamanho - i) * pos--;
        if (pos < 2) pos = 9;
    }
    
    let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
    if (resultado != digitos.charAt(0)) {
        return false;
    }
    
    tamanho = tamanho + 1;
    numeros = cnpjLimpo.substring(0, tamanho);
    soma = 0;
    pos = tamanho - 7;
    
    for (let i = tamanho; i >= 1; i--) {
        soma += numeros.charAt(tamanho - i) * pos--;
        if (pos < 2) pos = 9;
    }
    
    resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
    if (resultado != digitos.charAt(1)) {
        return false;
    }
    
    return true;
}

/**
 * Valida formato de telefone brasileiro
 * @param {string} telefone - Telefone a ser validado
 * @returns {boolean} True se válido
 */
function validarFormatoTelefone(telefone) {
    const telefoneLimpo = telefone.replace(/\D/g, '');
    
    // Aceita de 10 a 13 dígitos
    if (telefoneLimpo.length < 10 || telefoneLimpo.length > 13) {
        return false;
    }
    
    // Extrair DDD baseado no tamanho
    let ddd;
    if (telefoneLimpo.length === 10 || telefoneLimpo.length === 11) {
        // Sem código do país
        ddd = parseInt(telefoneLimpo.substring(0, 2));
    } else {
        // Com código do país (55)
        ddd = parseInt(telefoneLimpo.substring(2, 4));
    }
    
    // Verifica se DDD é válido (11-99)
    if (ddd < 11 || ddd > 99) {
        return false;
    }
    
    return true;
}

/**
 * Normaliza telefone para formato WhatsApp
 * @param {string} telefone - Telefone a ser normalizado
 * @returns {string} Telefone no formato 55+31+9+9999-9999
 */
function normalizarTelefoneWhatsApp(telefone) {
    let telefoneLimpo = telefone.replace(/\D/g, '');
    
    // Se já tem código do país (13 dígitos), retornar
    if (telefoneLimpo.length === 13) {
        return telefoneLimpo;
    }
    
    // Se tem 11 dígitos (DDD + 9 + número), adicionar código do país
    if (telefoneLimpo.length === 11) {
        return '55' + telefoneLimpo;
    }
    
    // Se tem 10 dígitos (DDD + número sem 9), adicionar 9 + código do país
    if (telefoneLimpo.length === 10) {
        const ddd = telefoneLimpo.substring(0, 2);
        const numero = telefoneLimpo.substring(2);
        return '55' + ddd + '9' + numero;
    }
    
    // Retorna como está se não se encaixar nos padrões
    return telefoneLimpo;
}

/**
 * Remove DDI do telefone (código do país 55)
 * @param {string} telefone - Telefone com ou sem DDI
 * @returns {string} Telefone no formato DDD+CEL (ex: 31994931105)
 */
function normalizarTelefoneApi(telefone) {
    const telefoneLimpo = telefone.replace(/\D/g, '');
    const telefoneWhatsApp = this.normalizarTelefoneWhatsApp(telefoneLimpo);
    let telefoneApi = telefoneWhatsApp;
    console.log('telefoneApi: ', telefoneApi);

    // Se tem 12 dígitos (DD1 + DDD + número sem 9), adicionar 9 553194931105
    if (telefoneApi.length === 12) {
        const ddi = telefoneApi.substring(0, 2);
        const ddd = telefoneApi.substring(2, 4);
        const numero = telefoneApi.substring(4);
        console.log('normalizarTelefoneApi: ', ddd + '9' + numero);
        return ddd + '9' + numero;
    }

    // Se tem 13 dígitos e começa com 55, remover DDI
    if (telefoneApi.length === 13 && telefoneApi.startsWith('55')) {
        return telefoneApi.substring(2);
    }
    
    // Se tem 12 dígitos e começa com 55, remover DDI
    if (telefoneApi.length === 12 && telefoneApi.startsWith('55')) {
        return telefoneApi.substring(2);
    }

    // Retorna como está
    return telefoneApi;
}

/**
 * Valida telefone com múltiplos contatos para mesmo CNPJ
 * Implementa lógica completa de validação de permissões
 * @param {string} cnpj - CNPJ do cliente
 * @param {string} telefone - Telefone a ser validado
 * @returns {Promise<Object>} Resultado da validação
 */
async function validarTelefoneMultiplo(cnpj, telefone) {
    console.log('validarTelefoneMultiplo:');
    console.log('- cnpj:', cnpj);
    console.log('- telefone:', telefone);
    
    // Buscar cliente por CNPJ na API
    const clienteAPI = await endpoint.getClienteByCNPJ(cnpj);
    
    if (!clienteAPI.success) {
        return { 
            valido: false, 
            motivo: 'cnpj_invalido',
            mensagem: 'CNPJ não encontrado ou inválido',
            error: clienteAPI.error
        };
    }
    
    const cliente = clienteAPI.data.data[0];
    const telefoneLimpo = telefone.replace(/\D/g, '');
    
    console.log('- cliente encontrado:', cliente.nome);
    console.log('- total de contatos:', cliente.contatos?.length || 0);
    
    // Buscar TODOS os contatos com este telefone
    const contatosComTelefone = cliente.contatos.filter(c => {
        if (!c.telefone) return false;
        const contatoTelefoneLimpo = c.telefone.replace(/\D/g, '');
        return contatoTelefoneLimpo === telefoneLimpo;
    });
    
    console.log('- contatos com este telefone:', contatosComTelefone.length);
    
    // Caso 1: Telefone não encontrado
    if (contatosComTelefone.length === 0) {
        return { 
            valido: false, 
            motivo: 'telefone_nao_encontrado',
            mensagem: '⚠️ Telefone não cadastrado para este CNPJ.\n\n' +
                     'Por favor, entre em contato para atualizar seu cadastro.',
            cliente: cliente
        };
    }
    
    // Caso 2: Um único contato com este telefone
    if (contatosComTelefone.length === 1) {
        const contato = contatosComTelefone[0];
        
        if (contato.emailFaturamento === true) {
            console.log('✅ Contato único com permissão');
            return {
                valido: true,
                contato: contato,
                cliente: cliente,
                mensagem: `✅ Contato autorizado: ${contato.nome}`
            };
        } else {
            console.log('❌ Contato único sem permissão');
            return {
                valido: false,
                motivo: 'sem_permissao',
                mensagem: '⚠️ Este telefone não possui permissão para solicitar boletos.\n\n' +
                         'Deseja ser transferido para atendimento humano?',
                contato: contato,
                cliente: cliente
            };
        }
    }
    
    // Caso 3: Múltiplos contatos com mesmo telefone - priorizar com emailFaturamento
    console.log('⚠️ Múltiplos contatos encontrados para este telefone');
    
    const contatoAutorizado = contatosComTelefone.find(
        c => c.emailFaturamento === true
    );
    
    if (!contatoAutorizado) {
        console.log('❌ Nenhum contato com permissão');
        return {
            valido: false,
            motivo: 'sem_permissao',
            mensagem: '⚠️ Nenhum dos contatos com este telefone tem permissão para boletos.\n\n' +
                     'Deseja ser transferido para atendimento humano?',
            contatos: contatosComTelefone,
            cliente: cliente
        };
    }
    
    console.log('✅ Contato autorizado encontrado:', contatoAutorizado.nome);
    return {
        valido: true,
        contato: contatoAutorizado,
        cliente: cliente,
        mensagem: `✅ Contato autorizado: ${contatoAutorizado.nome}`,
        observacao: `Encontrados ${contatosComTelefone.length} contatos com este telefone. Usando o autorizado.`
    };
}

/**
 * Valida se cliente está bloqueado consultando a API
 * @param {string} cnpj - CNPJ do cliente
 * @returns {Promise<Object>} Status de bloqueio
 */
async function validarBloqueioCliente(cnpj) {
    console.log('validarBloqueioCliente:', cnpj);
    
    const clienteAPI = await endpoint.getClienteByCNPJ(cnpj);
    
    if (!clienteAPI.success) {
        return {
            bloqueado: false,
            erro: true,
            mensagem: 'Não foi possível verificar status do cliente'
        };
    }
    
    if (clienteAPI.blocked) {
        return {
            bloqueado: true,
            mensagem: clienteAPI.error
        };
    }
    
    return {
        bloqueado: false,
        cliente: clienteAPI.data.data[0]
    };
}

/**
 * Valida permissão de faturamento do contato
 * @param {Object} contato - Dados do contato
 * @returns {Object} Status de permissão
 */
function validarPermissaoFaturamento(contato) {
    if (!contato) {
        return {
            temPermissao: false,
            mensagem: 'Contato não informado'
        };
    }
    
    if (contato.emailFaturamento === true) {
        return {
            temPermissao: true,
            contato: contato
        };
    }
    
    return {
        temPermissao: false,
        mensagem: '⚠️ Este contato não possui permissão para solicitar boletos.',
        contato: contato
    };
}

/**
 * Formata CNPJ para padrão XX.XXX.XXX/XXXX-XX
 * @param {string} cnpj - CNPJ apenas números
 * @returns {string} CNPJ formatado
 */
function formatarCNPJ(cnpj) {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    
    if (cnpjLimpo.length !== 14) {
        return cnpj; // Retorna original se inválido
    }
    
    return cnpjLimpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

/**
 * Formata telefone para padrão (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
 * @param {string} telefone - Telefone apenas números
 * @returns {string} Telefone formatado
 */
function formatarTelefone(telefone) {
    const telefoneLimpo = telefone.replace(/\D/g, '');
    
    if (telefoneLimpo.length === 11) {
        return telefoneLimpo.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
    } else if (telefoneLimpo.length === 10) {
        return telefoneLimpo.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
    }
    
    return telefone; // Retorna original se inválido
}

/**
 * Limpa string removendo caracteres especiais
 * @param {string} texto - Texto a ser limpo
 * @returns {string} Texto apenas com números
 */
function limparApenasNumeros(texto) {
    return texto.replace(/\D/g, '');
}

/**
 * Valida se ID do parceiro é válido
 * @param {number|string} idParceiro - ID do parceiro
 * @returns {boolean} True se válido
 */
function validarIdParceiro(idParceiro) {
    const id = parseInt(idParceiro);
    return !isNaN(id) && id > 0;
}

/**
 * Valida conjunto de dados do cliente
 * @param {Object} clienteData - Dados do cliente
 * @returns {Object} Resultado da validação
 */
function validarDadosCliente(clienteData) {
    const erros = [];
    
    if (!clienteData) {
        return {
            valido: false,
            erros: ['Dados do cliente não fornecidos']
        };
    }
    
    if (!clienteData.id && !clienteData.idParceiro) {
        erros.push('ID do cliente não encontrado');
    }
    
    if (!clienteData.nome) {
        erros.push('Nome do cliente não encontrado');
    }
    
    if (!clienteData.cpfCnpj && !clienteData.cnpj) {
        erros.push('CNPJ não encontrado');
    }
    
    if (erros.length > 0) {
        return {
            valido: false,
            erros: erros
        };
    }
    
    return {
        valido: true,
        cliente: clienteData
    };
}

/**
 * Valida se mensagem é um comando válido
 * @param {string} mensagem - Mensagem recebida
 * @returns {Object} Tipo de comando identificado
 */
function validarComando(mensagem) {
    const mensagemLimpa = mensagem.trim().toLowerCase();
    
    // Comandos de menu
    const comandosMenu = {
        '1': 'boletos',
        '2': 'nfe',
        '3': 'certificados',
        '4': 'propostas',
        '5': 'atendente',
        'boletos': 'boletos',
        'boleto': 'boletos',
        'nfe': 'nfe',
        'nota': 'nfe',
        'notas': 'nfe',
        'certificado': 'certificados',
        'certificados': 'certificados',
        'proposta': 'propostas',
        'propostas': 'propostas',
        'atendente': 'atendente',
        'atendimento': 'atendente',
        'falar': 'atendente'
    };
    
    if (comandosMenu[mensagemLimpa]) {
        return {
            valido: true,
            tipo: 'menu',
            comando: comandosMenu[mensagemLimpa]
        };
    }
    
    // Comando de CNPJ
    const cnpjLimpo = limparApenasNumeros(mensagemLimpa);
    if (cnpjLimpo.length === 14) {
        return {
            valido: true,
            tipo: 'cnpj',
            valor: cnpjLimpo
        };
    }
    
    // Comandos de confirmação
    const comandosConfirmacao = ['sim', 's', 'yes', 'ok'];
    const comandosNegacao = ['nao', 'não', 'n', 'no'];
    
    if (comandosConfirmacao.includes(mensagemLimpa)) {
        return {
            valido: true,
            tipo: 'confirmacao',
            valor: true
        };
    }
    
    if (comandosNegacao.includes(mensagemLimpa)) {
        return {
            valido: true,
            tipo: 'confirmacao',
            valor: false
        };
    }
    
    // Mensagem não reconhecida
    return {
        valido: false,
        tipo: 'desconhecido',
        mensagem: mensagem
    };
}

module.exports = {
    // Validações de formato
    validarFormatoCNPJ,
    validarFormatoTelefone,
	normalizarTelefoneWhatsApp,
    normalizarTelefoneApi,
    validarIdParceiro,
    
    // Validações de negócio
    validarTelefoneMultiplo,
    validarBloqueioCliente,
    validarPermissaoFaturamento,
    validarDadosCliente,
    validarComando,
    
    // Formatadores
    formatarCNPJ,
    formatarTelefone,
    limparApenasNumeros
};