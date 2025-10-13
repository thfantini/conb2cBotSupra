const endpoint = require('../config/endpoint');
const database = require('../config/database');

/**
 * Valida CNPJ informado pelo usuário
 */
async function validarCNPJ(telefone, cnpj, messageId) {
    console.log(`🔍 Validando CNPJ: ${cnpj}`);
    
    // 1. Buscar cliente por CNPJ via API
    const clienteAPI = await endpoint.getClienteByCNPJ(cnpj);
    
    // 2. CNPJ não encontrado
    if (!clienteAPI.success) {
        await sendTextMessage(
            telefone,
            '❌ CNPJ não encontrado em nossa base de dados.\n\n' +
            'Por favor, verifique o número e tente novamente ou ' +
            'entre em contato com nosso atendimento.'
        );
        
        await sendButtonMessage(
            telefone,
            'O que deseja fazer?',
            [
                { id: 'tentar_novamente', title: '🔄 Tentar Novamente' },
                { id: 'atendente', title: '👤 Falar com Atendente' }
            ]
        );
        
        return { 
            sucesso: false, 
            motivo: 'cnpj_nao_encontrado' 
        };
    }
    
    // 3. Cliente bloqueado
    if (clienteAPI.blocked) {
        await sendTextMessage(telefone, clienteAPI.error);
        
        // Registrar tentativa
        await database.registrarAtendimento({
            messageId,
            cliente: clienteAPI.data.data[0]?.id || null,
            cnpj: cnpj,
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
    
    // 4. Cliente encontrado - agora validar telefone
    const cliente = clienteAPI.data.data[0];
    
    // Verificar se o telefone está nos contatos
    const contatosComTelefone = cliente.contatos.filter(c => {
        if (!c.telefone) return false;
        return c.telefone.replace(/\D/g, '') === telefone.replace(/\D/g, '');
    });
    
    if (contatosComTelefone.length === 0) {
        await sendTextMessage(
            telefone,
            `⚠️ Seu telefone *${telefone}* não está cadastrado para o CNPJ informado.\n\n` +
            'Por favor, entre em contato com nosso atendimento para atualizar seu cadastro.'
        );
        
        await sendButtonMessage(
            telefone,
            'Deseja falar com um atendente?',
            [
                { id: 'atendente', title: '👤 Sim, quero atendente' },
                { id: 'cancelar', title: '❌ Não, obrigado' }
            ]
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
        await sendTextMessage(
            telefone,
            '⚠️ Seu cadastro não possui permissão para solicitar boletos.\n\n' +
            'Deseja ser transferido para atendimento humano?'
        );
        
        await sendButtonMessage(
            telefone,
            'Escolha uma opção:',
            [
                { id: 'atendente', title: '👤 Sim, falar com atendente' },
                { id: 'cancelar', title: '❌ Não, obrigado' }
            ]
        );
        
        return { 
            sucesso: false, 
            motivo: 'sem_permissao_faturamento' 
        };
    }
    
    // 5. Cliente válido e autorizado
    await sendTextMessage(
        telefone,
        `✅ Olá, *${contatoAutorizado.nome}*!\n\n` +
        `Empresa: *${cliente.nome}*\n` +
        `CNPJ: *${cliente.cpfCnpj}*\n\n` +
        'Como posso ajudar você hoje?'
    );
    
    await mostrarMenuPrincipal(telefone);
    
    // Registrar atendimento iniciado
    await database.registrarAtendimento({
        messageId,
        cliente: cliente.id,
        cnpj: cliente.cpfCnpj,
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
 * Mostra menu principal de opções
 */
async function mostrarMenuPrincipal(telefone) {
    await sendListMessage(
        telefone,
        '📋 *Menu de Atendimento*\n\nSelecione uma opção:',
        [
            { id: 'boletos', title: '💰 Boletos em Aberto' },
            { id: 'nfe', title: '📄 Notas Fiscais' },
            { id: 'certificados', title: '📜 Certificados' },
            { id: 'propostas', title: '💼 Propostas Comerciais' },
            { id: 'atendente', title: '👤 Falar com Atendente' }
        ]
    );
}

module.exports = {
    validarCNPJ,
    mostrarMenuPrincipal
};