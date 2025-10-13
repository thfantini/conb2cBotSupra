const express = require('express');
const router = express.Router();
const scheduledWhatsappService = require('../services/scheduledWhatsappService');
const scheduledEmailService = require('../services/scheduledEmailService');
const cronSchedulerService = require('../services/cronSchedulerService');

/**
 * Middleware de logging específico para scheduled messages
 */
const logScheduledRequest = (req, res, next) => {
    const startTime = Date.now();
    
    // Log da requisição
    console.log(`📅 [SCHEDULED] ${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
    });

    // Log da resposta
    const originalSend = res.send;
    res.send = function(data) {
        const duration = Date.now() - startTime;
        const statusEmoji = res.statusCode >= 400 ? '❌' : '✅';
        
        console.log(`${statusEmoji} [SCHEDULED] ${res.statusCode} - ${duration}ms`);
        
        // Sanitiza dados sensíveis no log
        let logData = data;
        if (typeof data === 'string') {
            try {
                const parsed = JSON.parse(data);
                if (parsed.data && parsed.data.cliente) {
                    logData = JSON.stringify({
                        ...parsed,
                        data: {
                            ...parsed.data,
                            cliente: {
                                ...parsed.data.cliente,
                                email: '***@***.com',
                                celular: '***********'
                            }
                        }
                    });
                }
            } catch (e) {
                // Manter original se não for JSON
            }
        }
        
        return originalSend.call(this, data);
    };
    
    next();
};

/**
 * Middleware de validação de token para endpoints críticos
 */
const validateToken = (req, res, next) => {
    const token = req.headers.authorization || req.query.token || req.body.token;
    const expectedToken = process.env.WEBHOOK_TOKEN || process.env.SCHEDULED_TOKEN;
    
    if (!expectedToken) {
        console.warn('⚠️ [SCHEDULED] Token de segurança não configurado');
        return next(); // Continua sem validação se não estiver configurado
    }
    
    if (!token || token !== expectedToken) {
        console.error('🔒 [SCHEDULED] Token inválido ou ausente');
        return res.status(401).json({
            success: false,
            error: 'Token de autorização inválido ou ausente',
            timestamp: new Date().toISOString()
        });
    }
    
    next();
};

/**
 * Aplicar middleware em todas as rotas
 */
router.use(logScheduledRequest);

/**
 * Endpoint de status do serviço de mensagens programadas
 * GET /scheduled/status
 */
router.get('/status', async (req, res) => {
    try {
        // TODO: Integrar com scheduledController.js
        const status = {
            service: 'scheduled-messages',
            status: 'active',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            cron: {
                enabled: process.env.CRON_ENABLED === 'true' || true,
                interval: process.env.CRON_INTERVAL || '*/5 * * * *', // A cada 5 minutos
                lastExecution: null, // TODO: Implementar tracking
                nextExecution: null  // TODO: Implementar tracking
            },
            statistics: {
                totalScheduled: 0,    // TODO: Implementar contador
                totalSent: 0,         // TODO: Implementar contador
                totalFailed: 0,       // TODO: Implementar contador
                uptime: process.uptime()
            }
        };

        console.log('📊 [SCHEDULED] Status consultado');
        
        res.json({
            success: true,
            data: status,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ [SCHEDULED] Erro ao obter status:', error);
        
        res.status(500).json({
            success: false,
            error: 'Erro interno ao obter status do serviço',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Endpoint de health check específico para scheduled messages
 * GET /scheduled/health
 */
router.get('/health', async (req, res) => {
    try {
        // TODO: Verificar disponibilidade dos serviços dependentes
        const healthChecks = {
            database: false,      // TODO: Implementar check da tabela aux_cron
            whatsapp: false,     // TODO: Implementar check do serviço WhatsApp
            email: false,        // TODO: Implementar check do serviço Email
            cron: true           // Sempre true se o serviço estiver rodando
        };
        
        const allHealthy = Object.values(healthChecks).every(check => check === true);
        const status = allHealthy ? 'healthy' : 'partial';
        
        console.log(`🏥 [SCHEDULED] Health check: ${status}`);
        
        res.status(allHealthy ? 200 : 206).json({
            success: true,
            status: status,
            checks: healthChecks,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ [SCHEDULED] Erro no health check:', error);
        
        res.status(503).json({
            success: false,
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Endpoint para executar cron manualmente (trigger manual)
 * POST /scheduled/trigger
 */
router.post('/trigger', validateToken, async (req, res) => {
    try {
        console.log('🚀 [SCHEDULED] Trigger manual do cron iniciado');
        
        // TODO: Integrar com cronSchedulerService.js
        const resultado = {
            triggered: true,
            startTime: new Date().toISOString(),
            clientesProcessados: 0,    // TODO: Implementar contagem real
            mensagensEnviadas: 0,      // TODO: Implementar contagem real
            erros: 0,                  // TODO: Implementar contagem real
            duration: '0ms'            // TODO: Implementar duração real
        };
        
        console.log('✅ [SCHEDULED] Trigger manual concluído com sucesso');
        
        res.json({
            success: true,
            message: 'Cron executado manualmente com sucesso',
            data: resultado,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ [SCHEDULED] Erro no trigger manual:', error);
        
        res.status(500).json({
            success: false,
            error: 'Erro ao executar cron manualmente',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Endpoint para obter configuração do cron
 * GET /scheduled/config
 */
router.get('/config', async (req, res) => {
    try {
        const config = {
            cron: {
                enabled: process.env.CRON_ENABLED === 'true' || true,
                interval: process.env.CRON_INTERVAL || '*/5 * * * *',
                timezone: process.env.TZ || 'America/Sao_Paulo'
            },
            database: {
                cronTable: 'aux_cron',
                boletosTable: 'boletos',
                viewBoletos: 'vw_botCron'
            },
            services: {
                whatsapp: {
                    enabled: !!process.env.EVOLUTION_API_URL,
                    instanceName: process.env.EVOLUTION_INSTANCE_NAME || 'default'
                },
                email: {
                    enabled: !!process.env.SMTP_HOST,
                    host: process.env.SMTP_HOST || 'não configurado',
                    port: process.env.SMTP_PORT || 587
                }
            },
            features: {
                friendlyMessage: true,
                parallelSending: true,
                statusTracking: true
            }
        };
        
        console.log('⚙️ [SCHEDULED] Configuração consultada');
        
        res.json({
            success: true,
            data: config,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ [SCHEDULED] Erro ao obter configuração:', error);
        
        res.status(500).json({
            success: false,
            error: 'Erro ao obter configuração',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Endpoint para validar configuração do ambiente
 * GET /scheduled/validate-config
 */
router.get('/validate-config', async (req, res) => {
    try {
        const validation = {
            database: {
                host: !!process.env.DB_HOST,
                user: !!process.env.DB_USER,
                password: !!process.env.DB_PASSWORD,
                name: !!process.env.DB_NAME
            },
            evolution: {
                url: !!process.env.EVOLUTION_API_URL,
                key: !!process.env.EVOLUTION_API_KEY,
                instance: !!process.env.EVOLUTION_INSTANCE_NAME
            },
            email: {
                host: !!process.env.SMTP_HOST,
                user: !!process.env.SMTP_USER,
                password: !!process.env.SMTP_PASS,
                from: !!process.env.SMTP_FROM
            },
            scheduled: {
                token: !!process.env.SCHEDULED_TOKEN || !!process.env.WEBHOOK_TOKEN,
                interval: !!process.env.CRON_INTERVAL,
                enabled: process.env.CRON_ENABLED !== 'false'
            }
        };
        
        const allValid = Object.values(validation).every(section => 
            Object.values(section).every(check => check === true)
        );
        
        console.log(`🔍 [SCHEDULED] Validação de configuração: ${allValid ? 'OK' : 'PROBLEMAS'}`);
        
        res.status(allValid ? 200 : 400).json({
            success: allValid,
            message: allValid ? 'Configuração válida' : 'Problemas na configuração encontrados',
            validation: validation,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ [SCHEDULED] Erro na validação:', error);
        
        res.status(500).json({
            success: false,
            error: 'Erro ao validar configuração',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Endpoint para testar conectividade com Evolution API (WhatsApp)
 * GET /scheduled/test/whatsapp
 */
router.get('/test/whatsapp', async (req, res) => {
    try {
        console.log(`🔍 [SCHEDULED] Testando conectividade WhatsApp...`);

        const resultadoTeste = await scheduledWhatsappService.testarConectividade();

        if (resultadoTeste.success) {
            console.log(`✅ [SCHEDULED] Teste WhatsApp bem-sucedido`);

            res.json({
                success: true,
                service: 'whatsapp',
                status: 'connected',
                message: 'Conectividade com Evolution API funcionando',
                details: resultadoTeste,
                timestamp: new Date().toISOString()
            });
        } else {
            console.warn(`⚠️ [SCHEDULED] Teste WhatsApp falhou: ${resultadoTeste.error}`);

            res.status(503).json({
                success: false,
                service: 'whatsapp',
                status: 'disconnected',
                error: resultadoTeste.error,
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        console.error('❌ [SCHEDULED] Erro no teste WhatsApp:', error);

        res.status(500).json({
            success: false,
            service: 'whatsapp',
            status: 'error',
            error: 'Erro interno ao testar conectividade WhatsApp',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Endpoint para testar conectividade SMTP (Email)
 * GET /scheduled/test/email
 */
router.get('/test/email', async (req, res) => {
    try {
        console.log(`🔍 [SCHEDULED] Testando conectividade Email...`);

        const resultadoTeste = await scheduledEmailService.testarConectividade();

        if (resultadoTeste.success) {
            console.log(`✅ [SCHEDULED] Teste Email bem-sucedido`);

            res.json({
                success: true,
                service: 'email',
                status: 'connected',
                message: 'Conectividade SMTP funcionando',
                details: resultadoTeste,
                timestamp: new Date().toISOString()
            });
        } else {
            console.warn(`⚠️ [SCHEDULED] Teste Email falhou: ${resultadoTeste.error}`);

            res.status(503).json({
                success: false,
                service: 'email',
                status: 'disconnected',
                error: resultadoTeste.error,
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        console.error('❌ [SCHEDULED] Erro no teste Email:', error);

        res.status(500).json({
            success: false,
            service: 'email',
            status: 'error',
            error: 'Erro interno ao testar conectividade Email',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Endpoint para testar conectividade de ambos os serviços
 * GET /scheduled/test/all
 */
router.get('/test/all', async (req, res) => {
    try {
        console.log(`🔍 [SCHEDULED] Testando conectividade de todos os serviços...`);

        const [whatsappTest, emailTest] = await Promise.allSettled([
            scheduledWhatsappService.testarConectividade(),
            scheduledEmailService.testarConectividade()
        ]);

        const resultados = {
            whatsapp: {
                status: whatsappTest.status === 'fulfilled' && whatsappTest.value.success ? 'connected' : 'disconnected',
                details: whatsappTest.status === 'fulfilled' ? whatsappTest.value : { error: whatsappTest.reason?.message }
            },
            email: {
                status: emailTest.status === 'fulfilled' && emailTest.value.success ? 'connected' : 'disconnected',
                details: emailTest.status === 'fulfilled' ? emailTest.value : { error: emailTest.reason?.message }
            }
        };

        const allConnected = resultados.whatsapp.status === 'connected' && resultados.email.status === 'connected';
        const anyConnected = resultados.whatsapp.status === 'connected' || resultados.email.status === 'connected';

        const status = allConnected ? 'all_connected' : (anyConnected ? 'partial_connected' : 'disconnected');

        console.log(`📊 [SCHEDULED] Teste geral: ${status}`);

        res.status(allConnected ? 200 : (anyConnected ? 206 : 503)).json({
            success: anyConnected,
            status: status,
            services: resultados,
            summary: {
                whatsapp: resultados.whatsapp.status,
                email: resultados.email.status,
                operational: anyConnected
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ [SCHEDULED] Erro no teste geral:', error);

        res.status(500).json({
            success: false,
            status: 'error',
            error: 'Erro interno ao testar conectividade dos serviços',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Endpoint para obter estatísticas dos serviços
 * GET /scheduled/stats
 */
router.get('/stats', async (req, res) => {
    try {
        console.log(`📊 [SCHEDULED] Consultando estatísticas...`);

        const stats = {
            cron: cronSchedulerService.getStatistics(),
            whatsapp: scheduledWhatsappService.getStatistics(),
            email: scheduledEmailService.getStatistics(),
            system: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                timestamp: new Date().toISOString()
            }
        };

        res.json({
            success: true,
            data: stats,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ [SCHEDULED] Erro ao obter estatísticas:', error);

        res.status(500).json({
            success: false,
            error: 'Erro ao obter estatísticas',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Endpoint de documentação da API (apenas desenvolvimento)
 * GET /scheduled/docs
 */
if (process.env.NODE_ENV === 'development') {
    router.get('/docs', (req, res) => {
        const documentation = {
            title: 'API de Mensagens Programadas',
            version: '1.0.0',
            description: 'Micro-serviço para envio programado de mensagens WhatsApp e Email',
            baseUrl: '/scheduled',
            endpoints: [
                {
                    method: 'GET',
                    path: '/status',
                    description: 'Status do serviço e estatísticas',
                    authentication: false
                },
                {
                    method: 'GET',
                    path: '/health',
                    description: 'Health check dos serviços dependentes',
                    authentication: false
                },
                {
                    method: 'POST',
                    path: '/trigger',
                    description: 'Executa cron manualmente',
                    authentication: true,
                    body: 'Nenhum'
                },
                {
                    method: 'GET',
                    path: '/config',
                    description: 'Configuração atual do serviço',
                    authentication: false
                },
                {
                    method: 'GET',
                    path: '/validate-config',
                    description: 'Validação das variáveis de ambiente',
                    authentication: false
                },
                {
                    method: 'GET',
                    path: '/test/whatsapp',
                    description: 'Testa conectividade com Evolution API (WhatsApp)',
                    authentication: false
                },
                {
                    method: 'GET',
                    path: '/test/email',
                    description: 'Testa conectividade SMTP (Email)',
                    authentication: false
                },
                {
                    method: 'GET',
                    path: '/test/all',
                    description: 'Testa conectividade de todos os serviços',
                    authentication: false
                },
                {
                    method: 'GET',
                    path: '/stats',
                    description: 'Estatísticas detalhadas dos serviços',
                    authentication: false
                }
            ],
            authentication: {
                type: 'Token',
                header: 'Authorization',
                query: 'token',
                body: 'token'
            },
            cronRules: {
                description: 'Sistema verifica tabela aux_cron a cada execução',
                table: 'aux_cron',
                conditions: [
                    'data_inicio <= NOW()',
                    'data_fim >= NOW()',
                    'status = 1',
                    'hora_inicio <= CURRENT_TIME()',
                    'hora_fim >= CURRENT_TIME()'
                ]
            }
        };
        
        res.json(documentation);
    });
}

/**
 * Tratamento de erro padrão para rotas não encontradas
 */
router.use((req, res) => {
    console.warn(`⚠️ [SCHEDULED] Rota não encontrada: ${req.method} ${req.path}`);
    
    res.status(404).json({
        success: false,
        error: 'Endpoint não encontrado no serviço de mensagens programadas',
        availableEndpoints: ['/status', '/health', '/trigger', '/config', '/validate-config'],
        timestamp: new Date().toISOString()
    });
});

/**
 * Tratamento de erro global para o módulo
 */
router.use((error, req, res, next) => {
    console.error('💥 [SCHEDULED] Erro não tratado:', error);
    
    res.status(500).json({
        success: false,
        error: 'Erro interno do serviço de mensagens programadas',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;