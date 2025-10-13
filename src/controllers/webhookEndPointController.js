const endpoint = require('../config/endpoint');
const database = require('../config/database');
const whatsappService = require('../services/whatsappService');

/**
 * Processa mensagem recebida no webhook
 */
async function processarMensagem(message) {
    const { remoteJid, body, messageId } = message;
    const telefone = remoteJid.split('@')[0];
    
    console.log(`📱 Mensagem de: ${telefone}`);
    console.log(`💬 Conteúdo: ${body}`);
    
    try {
        // 1. Verificar se cliente existe via API (endpoint.js)
        const clienteAPI = await endpoint.getClienteByCelular(telefone);
        
        // 2. Tratar cliente bloqueado
        if (clienteAPI.blocked) {
            await whatsappService.sendTextMessage(
                telefone,
                clienteAPI.error
            );
            
            // Registrar tentativa de atendimento bloqueado
            await database.registrarAtendimento({
                messageId,
                cliente: clienteAPI.data.data[0]?.id || null,
                cnpj: clienteAPI.data.data[0]?.cpfCnpj || null,
                conversa: [{
                    tipo: 'cliente',
                    data: new Date(),
                    mensagem: body
                }, {
                    tipo: 'bot',
                    data: new Date(),
                    mensagem: clienteAPI.error,
                    status: 'bloqueado'
                }]
            });
            
            return { status: 'bloqueado' };
        }
        
        // 3. Tratar sem permissão
        if (clienteAPI.success && !clienteAPI.hasPermission) {
            await whatsappService.sendButtonMessage(
                telefone,
                clienteAPI.error,
                [
                    { id: 'atendente', title: '👤 Falar com Atendente' },
                    { id: 'cancelar', title: '❌ Cancelar' }
                ]
            );
            
            // Registrar tentativa sem permissão
            await database.registrarAtendimento({
                messageId,
                cliente: clienteAPI.data.data[0]?.id || null,
                cnpj: clienteAPI.data.data[0]?.cpfCnpj || null,
                conversa: [{
                    tipo: 'cliente',
                    data: new Date(),
                    mensagem: body
                }, {
                    tipo: 'bot',
                    data: new Date(),
                    mensagem: clienteAPI.error,
                    status: 'sem_permissao'
                }]
            });
            
            return { status: 'sem_permissao' };
        }
        
        // 4. Cliente não encontrado - solicitar CNPJ
        if (!clienteAPI.success) {
            await whatsappService.sendTextMessage(
                telefone,
                '👋 Olá! Bem-vindo ao atendimento.\n\n' +
                'Para continuar, por favor, informe seu *CNPJ*:'
            );
            
            return { status: 'aguardando_cnpj' };
        }
        
        // 5. Cliente válido - processar atendimento
        const cliente = clienteAPI.data.data[0];
        const contato = clienteAPI.contato;
        
        console.log(`✅ Cliente autorizado: ${cliente.nome}`);
        console.log(`👤 Contato: ${contato.nome}`);
        
        // Continuar com o fluxo normal do bot
        return await processarAtendimento(
            telefone, 
            body, 
            messageId, 
            cliente, 
            contato
        );
        
    } catch (error) {
        console.error('❌ Erro ao processar mensagem:', error);
        
        await whatsappService.sendTextMessage(
            telefone,
            '❌ Desculpe, ocorreu um erro. Por favor, tente novamente em instantes.'
        );
        
        return { status: 'erro', error: error.message };
    }
}

module.exports = { processarMensagem };