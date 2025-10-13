const express = require('express');
const WebhookGroupController = require('../controllers/webhookGroupController');

const router = express.Router();

/**
 * Middleware aplicado a todas as rotas do webhook de grupos
 */
router.use(WebhookGroupController.logRequestGroup);

/**
 * POST /webhook-group/mensagem
 * Endpoint principal para receber mensagens de grupos da API Evolution
 * Aplica validação de token antes do processamento
 */
router.post('/mensagem', 
    // Reutiliza validação de token do webhook principal
    require('../controllers/webhookController').validarToken,
    WebhookGroupController.receberMensagemGrupo
);

/**
 * GET /webhook-group/status
 * Verifica se o webhook de grupos está ativo e funcionando
 * Não requer autenticação para facilitar monitoramento
 */
router.get('/status', WebhookGroupController.verificarStatusGrupo);

/**
 * GET /webhook-group/teste
 * Endpoint de teste para verificar conectividade do serviço de grupos
 * Útil para testes de infraestrutura específicos de grupos
 */
router.get('/teste', (req, res) => {
    try {
        const testData = {
            webhook_group: 'funcionando',
            timestamp: new Date().toISOString(),
            servidor: {
                nodejs: process.version,
                memoria: process.memoryUsage(),
                uptime: process.uptime()
            },
            ambiente: process.env.NODE_ENV || 'development',
            service: 'webhook-group-controller'
        };

        return res.status(200).json({
            success: true,
            message: 'Conectividade de grupos OK',
            data: testData
        });

    } catch (error) {
        console.error('Erro no teste de conectividade de grupos:', error);
        return res.status(500).json({
            success: false,
            error: 'Erro interno do servidor'
        });
    }
});

/**
 * POST /webhook-group/teste-mensagem
 * Endpoint para simular recebimento de mensagem de grupo (apenas desenvolvimento)
 * Útil para testes sem precisar enviar via WhatsApp em grupos reais
 */
if (process.env.NODE_ENV === 'development') {
    router.post('/teste-mensagem', (req, res) => {
        try {
            const { groupId, phoneNumber, message, userName, messageType = 'text' } = req.body;
            
            if (!groupId || !phoneNumber || !message) {
                return res.status(400).json({
                    success: false,
                    error: 'groupId, phoneNumber e message são obrigatórios'
                });
            }

            // Simula estrutura do webhook Evolution para grupos
            let messageContent = {};
            
            // Constrói conteúdo baseado no tipo de mensagem
            switch (messageType) {
                case 'text':
                    messageContent = {
                        conversation: message
                    };
                    break;
                case 'image':
                    messageContent = {
                        imageMessage: {
                            caption: message,
                            jpegThumbnail: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
                        }
                    };
                    break;
                case 'document':
                    messageContent = {
                        documentMessage: {
                            caption: message,
                            title: 'documento_teste.pdf',
                            mimetype: 'application/pdf',
                            fileLength: 1024
                        }
                    };
                    break;
                default:
                    messageContent = {
                        conversation: message
                    };
            }

            const webhookSimulado = {
                event: 'messages.upsert',
                data: [{
                    key: {
                        id: `TEST_GROUP_${Date.now()}`,
                        remoteJid: `${groupId}@g.us`,
                        fromMe: false,
                        participant: `${phoneNumber}@s.whatsapp.net`
                    },
                    message: messageContent,
                    messageTimestamp: Math.floor(Date.now() / 1000),
                    pushName: userName || 'Usuario Teste'
                }]
            };

            // Simula requisição para o controller
            req.body = webhookSimulado;
            return WebhookGroupController.receberMensagemGrupo(req, res);

        } catch (error) {
            console.error('Erro no teste de mensagem de grupo:', error);
            return res.status(500).json({
                success: false,
                error: 'Erro interno do servidor'
            });
        }
    });
}

/**
 * GET /webhook-group/validar-grupo/:groupId
 * Endpoint para validar se um grupo específico está autorizado
 * Útil para verificações administrativas
 */
router.get('/validar-grupo/:groupId', async (req, res) => {
    try {
        const { groupId } = req.params;
        
        if (!groupId) {
            return res.status(400).json({
                success: false,
                error: 'ID do grupo é obrigatório'
            });
        }

        // Valida o grupo usando método do controller
        const validacao = await WebhookGroupController.validarGrupo(groupId);
        
        if (validacao.valido) {
            return res.status(200).json({
                success: true,
                message: 'Grupo autorizado',
                data: {
                    groupId: groupId,
                    cliente: validacao.dados.cliente,
                    tipo: validacao.dados.tipo,
                    status: 'ativo'
                }
            });
        } else {
            return res.status(404).json({
                success: false,
                message: 'Grupo não autorizado',
                data: {
                    groupId: groupId,
                    motivo: validacao.motivo,
                    status: 'inativo'
                }
            });
        }

    } catch (error) {
        console.error('Erro ao validar grupo:', error);
        return res.status(500).json({
            success: false,
            error: 'Erro interno do servidor'
        });
    }
});

/**
 * GET /webhook-group/tabelas-destino
 * Lista todas as tabelas de destino disponíveis
 * Útil para verificações administrativas
 */
router.get('/tabelas-destino', async (req, res) => {
    try {
        const database = require('../config/database');
        
        const query = `
            SELECT tipo, tabela 
            FROM whapi_tabelas 
            ORDER BY tipo ASC
        `;
        
        const resultado = await database.executeQuery(query);
        
        if (resultado.success) {
            return res.status(200).json({
                success: true,
                message: 'Tabelas de destino encontradas',
                data: resultado.data,
                total: resultado.data.length
            });
        } else {
            return res.status(500).json({
                success: false,
                error: 'Erro ao buscar tabelas de destino'
            });
        }

    } catch (error) {
        console.error('Erro ao listar tabelas de destino:', error);
        return res.status(500).json({
            success: false,
            error: 'Erro interno do servidor'
        });
    }
});

/**
 * GET /webhook-group/health
 * Health check simplificado para load balancers específico de grupos
 */
router.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        timestamp: Date.now(),
        service: 'webhook-group'
    });
});

/**
 * GET /webhook-group/estatisticas
 * Endpoint para obter estatísticas básicas do processamento de grupos
 * (implementação futura - preparada para métricas)
 */
router.get('/estatisticas', async (req, res) => {
    try {
        // TODO: Implementar consultas de estatísticas quando necessário
        const stats = {
            total_grupos_ativos: 0,
            mensagens_processadas_hoje: 0,
            tipos_suportados: [
                { tipo: 0, nome: 'whapi_mensagem' },
                { tipo: 1, nome: 'whapi_documentacao' },
                { tipo: 2, nome: 'whapi_kanban' },
                { tipo: 3, nome: 'whapi_registro' },
                { tipo: 4, nome: 'whapi_homologacao' }
            ],
            ultimo_processamento: new Date().toISOString()
        };

        return res.status(200).json({
            success: true,
            message: 'Estatísticas do webhook de grupos',
            data: stats,
            observacao: 'Métricas detalhadas serão implementadas conforme necessidade'
        });

    } catch (error) {
        console.error('Erro ao obter estatísticas:', error);
        return res.status(500).json({
            success: false,
            error: 'Erro interno do servidor'
        });
    }
});

/**
 * Middleware de tratamento de erros específico para rotas de webhook de grupos
 */
router.use((error, req, res, next) => {
    console.error('❌ Erro na rota de webhook de grupos:', error);
    
    // Log detalhado em desenvolvimento
    if (process.env.NODE_ENV === 'development') {
        console.error('Stack trace (grupos):', error.stack);
        console.error('Request body (grupos):', req.body);
        console.error('Request headers (grupos):', req.headers);
    }

    return res.status(500).json({
        success: false,
        error: 'Erro interno no webhook de grupos',
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
        service: 'webhook-group'
    });
});

/**
 * Middleware para rotas não encontradas no webhook de grupos
 */
router.use('*', (req, res) => {
    console.log(`⚠️ Rota de webhook de grupos não encontrada: ${req.method} ${req.path}`);
    
    return res.status(404).json({
        success: false,
        error: 'Endpoint de webhook de grupos não encontrado',
        available_endpoints: [
            'POST /webhook-group/mensagem',
            'GET /webhook-group/status',
            'GET /webhook-group/teste',
            'GET /webhook-group/health',
            'GET /webhook-group/validar-grupo/:groupId',
            'GET /webhook-group/tabelas-destino',
            'GET /webhook-group/estatisticas'
        ],
        requested: `${req.method} ${req.path}`,
        service: 'webhook-group'
    });
});

module.exports = router;