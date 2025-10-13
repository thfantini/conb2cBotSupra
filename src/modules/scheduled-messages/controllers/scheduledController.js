const cronSchedulerService = require('../services/cronSchedulerService');
const scheduledWhatsappService = require('../services/scheduledWhatsappService');
const scheduledEmailService = require('../services/scheduledEmailService');
const moment = require('moment');

/**
 * Controlador principal do módulo de mensagens programadas
 * Integra todos os serviços e fornece API completa
 */
class ScheduledController {
    
    /**
     * Obtém status completo do serviço de mensagens programadas
     * Substitui TODO no endpoint GET /scheduled/status
     * @param {Object} req - Request do Express
     * @param {Object} res - Response do Express
     */
    async getStatus(req, res) {
        try {
            console.log('📊 [SCHEDULED-CONTROLLER] Consultando status do serviço...');

            // Obter estatísticas de todos os serviços
            const cronStats = cronSchedulerService.getStatistics();
            const whatsappStats = scheduledWhatsappService.getStatistics();
            const emailStats = scheduledEmailService.getStatistics();

            // Calcular próxima execução baseada no intervalo configurado
            const cronInterval = process.env.CRON_INTERVAL || '*/5 * * * *';
            const nextExecution = this.calcularProximaExecucao(cronInterval);

            const status = {
                service: 'scheduled-messages',
                status: 'active',
                version: '1.0.0',
                timestamp: new Date().toISOString(),
                environment: process.env.NODE_ENV || 'development',
                
                cron: {
                    enabled: process.env.CRON_ENABLED !== 'false',
                    interval: cronInterval,
                    lastExecution: cronStats.lastExecution,
                    nextExecution: nextExecution,
                    isRunning: cronStats.isRunning,
                    statistics: {
                        totalExecutions: cronStats.totalExecutions,
                        totalClientes: cronStats.totalClientes,
                        totalMensagens: cronStats.totalMensagens,
                        totalErros: cronStats.totalErros,
                        uptime: cronStats.uptime
                    }
                },
                
                whatsapp: {
                    enabled: !!process.env.EVOLUTION_API_URL,
                    statistics: {
                        totalEnvios: whatsappStats.totalEnvios,
                        totalSucessos: whatsappStats.totalSucessos,
                        totalFalhas: whatsappStats.totalFalhas,
                        taxaSucesso: whatsappStats.taxaSucesso,
                        tempoMedioEnvio: whatsappStats.tempoMedioEnvio,
                        ultimoEnvio: whatsappStats.ultimoEnvio
                    }
                },
                
                email: {
                    enabled: emailStats.isConfigured,
                    statistics: {
                        totalEnvios: emailStats.totalEnvios,
                        totalSucessos: emailStats.totalSucessos,
                        totalFalhas: emailStats.totalFalhas,
                        taxaSucesso: emailStats.taxaSucesso,
                        tempoMedioEnvio: emailStats.tempoMedioEnvio,
                        ultimoEnvio: emailStats.ultimoEnvio
                    }
                },
                
                consolidated: {
                    totalMensagensCron: cronStats.totalMensagens,
                    totalMensagensWhatsApp: whatsappStats.totalEnvios,
                    totalMensagensEmail: emailStats.totalEnvios,
                    servicosAtivos: this.contarServicosAtivos(),
                    uptime: process.uptime()
                }
            };

            console.log('✅ [SCHEDULED-CONTROLLER] Status consultado com sucesso');

            res.json({
                success: true,
                data: status,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ [SCHEDULED-CONTROLLER] Erro ao obter status:', error);
            
            res.status(500).json({
                success: false,
                error: 'Erro interno ao obter status do serviço',
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Health check completo de todos os serviços
     * Substitui TODO no endpoint GET /scheduled/health
     * @param {Object} req - Request do Express
     * @param {Object} res - Response do Express
     */
    async getHealthCheck(req, res) {
        try {
            console.log('🏥 [SCHEDULED-CONTROLLER] Executando health check...');

            // Verificar disponibilidade de cada serviço
            const healthChecks = {
                database: await cronSchedulerService.verificarDisponibilidade(),
                whatsapp: await scheduledWhatsappService.verificarDisponibilidade(),
                email: await scheduledEmailService.verificarDisponibilidade(),
                cron: !cronSchedulerService.isRunning // Healthy se não estiver executando (disponível)
            };

            // Determinar status geral
            const totalChecks = Object.keys(healthChecks).length;
            const healthyChecks = Object.values(healthChecks).filter(check => check === true).length;
            
            let status;
            let httpStatus;
            
            if (healthyChecks === totalChecks) {
                status = 'healthy';
                httpStatus = 200;
            } else if (healthyChecks > 0) {
                status = 'partial';
                httpStatus = 206; // Partial Content
            } else {
                status = 'unhealthy';
                httpStatus = 503; // Service Unavailable
            }

            console.log(`🏥 [SCHEDULED-CONTROLLER] Health check: ${status} (${healthyChecks}/${totalChecks})`);

            res.status(httpStatus).json({
                success: status !== 'unhealthy',
                status: status,
                checks: healthChecks,
                summary: {
                    total: totalChecks,
                    healthy: healthyChecks,
                    unhealthy: totalChecks - healthyChecks
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ [SCHEDULED-CONTROLLER] Erro no health check:', error);
            
            res.status(503).json({
                success: false,
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Executa cron manualmente (trigger)
     * Substitui TODO no endpoint POST /scheduled/trigger
     * @param {Object} req - Request do Express
     * @param {Object} res - Response do Express
     */
    async triggerCron(req, res) {
        try {
            console.log('🚀 [SCHEDULED-CONTROLLER] Trigger manual do cron iniciado');

            // Verificar se já está executando
            if (cronSchedulerService.isRunning) {
                console.warn('⚠️ [SCHEDULED-CONTROLLER] Cron já está em execução');
                return res.status(409).json({
                    success: false,
                    error: 'Cron já está em execução. Aguarde a conclusão.',
                    timestamp: new Date().toISOString()
                });
            }

            // Executar cron
            const startTime = Date.now();
            const resultado = await cronSchedulerService.executarCron();
            const duration = Date.now() - startTime;

            if (!resultado.success) {
                throw new Error(resultado.error || 'Falha na execução do cron');
            }

            console.log('✅ [SCHEDULED-CONTROLLER] Trigger manual concluído com sucesso');

            res.json({
                success: true,
                message: 'Cron executado manualmente com sucesso',
                data: {
                    ...resultado.data,
                    triggerDuration: `${duration}ms`,
                    triggeredBy: 'manual',
                    triggeredAt: new Date().toISOString()
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ [SCHEDULED-CONTROLLER] Erro no trigger manual:', error);
            
            res.status(500).json({
                success: false,
                error: 'Erro ao executar cron manualmente',
                details: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Obtém configuração completa do módulo
     * Substitui TODO no endpoint GET /scheduled/config
     * @param {Object} req - Request do Express
     * @param {Object} res - Response do Express
     */
    async getConfig(req, res) {
        try {
            console.log('⚙️ [SCHEDULED-CONTROLLER] Consultando configuração...');

            const config = {
                cron: {
                    enabled: process.env.CRON_ENABLED !== 'false',
                    interval: process.env.CRON_INTERVAL || '*/5 * * * *',
                    timezone: process.env.TZ || 'America/Sao_Paulo',
                    lastExecution: cronSchedulerService.lastExecution,
                    isRunning: cronSchedulerService.isRunning
                },
                
                database: {
                    cronTable: 'aux_cron',
                    boletosTable: 'boletos',
                    viewBoletos: 'vw_botCron',
                    host: process.env.DB_HOST || 'localhost',
                    port: process.env.DB_PORT || 3306,
                    database: process.env.DB_NAME || 'não configurado'
                },
                
                services: {
                    whatsapp: {
                        enabled: !!process.env.EVOLUTION_API_URL,
                        instanceName: process.env.EVOLUTION_INSTANCE_NAME || 'default',
                        apiUrl: process.env.EVOLUTION_API_URL ? 
                            process.env.EVOLUTION_API_URL.replace(/\/+$/, '') : 'não configurado'
                    },
                    email: {
                        enabled: scheduledEmailService.isConfigured,
                        host: process.env.SMTP_HOST || 'não configurado',
                        port: process.env.SMTP_PORT || 587,
                        secure: process.env.SMTP_SECURE === 'true',
                        from: process.env.SMTP_FROM || process.env.SMTP_USER || 'não configurado'
                    }
                },
                
                features: {
                    friendlyMessage: true,
                    parallelSending: true,
                    statusTracking: true,
                    htmlEmailTemplate: true,
                    rateLimiting: {
                        whatsapp: '1000ms',
                        email: '500ms'
                    }
                },
                
                urls: {
                    boletosBase: process.env.BOLETO_BASE_URL || 'não configurado',
                    webhookBase: process.env.WEBHOOK_URL || 'não configurado'
                }
            };

            console.log('✅ [SCHEDULED-CONTROLLER] Configuração consultada');

            res.json({
                success: true,
                data: config,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ [SCHEDULED-CONTROLLER] Erro ao obter configuração:', error);
            
            res.status(500).json({
                success: false,
                error: 'Erro ao obter configuração',
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Valida configuração do ambiente
     * Substitui TODO no endpoint GET /scheduled/validate-config
     * @param {Object} req - Request do Express
     * @param {Object} res - Response do Express
     */
    async validateConfig(req, res) {
        try {
            console.log('🔍 [SCHEDULED-CONTROLLER] Validando configuração...');

            const validation = {
                database: {
                    host: !!process.env.DB_HOST,
                    user: !!process.env.DB_USER,
                    password: !!process.env.DB_PASSWORD,
                    name: !!process.env.DB_NAME,
                    connectivity: await cronSchedulerService.verificarDisponibilidade()
                },
                
                evolution: {
                    url: !!process.env.EVOLUTION_API_URL,
                    key: !!process.env.EVOLUTION_API_KEY,
                    instance: !!process.env.EVOLUTION_INSTANCE_NAME,
                    connectivity: await scheduledWhatsappService.verificarDisponibilidade()
                },
                
                email: {
                    host: !!process.env.SMTP_HOST,
                    user: !!process.env.SMTP_USER,
                    password: !!process.env.SMTP_PASS,
                    from: !!process.env.SMTP_FROM,
                    connectivity: await scheduledEmailService.verificarDisponibilidade()
                },
                
                scheduled: {
                    token: !!process.env.SCHEDULED_TOKEN || !!process.env.WEBHOOK_TOKEN,
                    interval: !!process.env.CRON_INTERVAL,
                    enabled: process.env.CRON_ENABLED !== 'false',
                    timezone: !!process.env.TZ
                }
            };

            // Calcular estatísticas de validação
            const sections = Object.keys(validation);
            const totalChecks = sections.reduce((total, section) => 
                total + Object.keys(validation[section]).length, 0);
            
            const passedChecks = sections.reduce((total, section) => 
                total + Object.values(validation[section]).filter(check => check === true).length, 0);

            const allValid = passedChecks === totalChecks;
            const percentage = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

            // Identificar problemas críticos
            const criticalIssues = [];
            
            if (!validation.database.connectivity) {
                criticalIssues.push('Banco de dados inacessível');
            }
            if (!validation.evolution.connectivity && validation.evolution.url) {
                criticalIssues.push('Evolution API inacessível');
            }
            if (!validation.email.connectivity && validation.email.host) {
                criticalIssues.push('Servidor SMTP inacessível');
            }

            console.log(`🔍 [SCHEDULED-CONTROLLER] Validação: ${percentage}% (${passedChecks}/${totalChecks})`);

            res.status(allValid ? 200 : 400).json({
                success: allValid,
                message: allValid ? 'Configuração totalmente válida' : 'Problemas na configuração encontrados',
                validation: validation,
                summary: {
                    totalChecks: totalChecks,
                    passedChecks: passedChecks,
                    percentage: `${percentage}%`,
                    criticalIssues: criticalIssues
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ [SCHEDULED-CONTROLLER] Erro na validação:', error);
            
            res.status(500).json({
                success: false,
                error: 'Erro ao validar configuração',
                details: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Executa teste completo dos serviços
     * Endpoint adicional para facilitar debugging
     * @param {Object} req - Request do Express
     * @param {Object} res - Response do Express
     */
    async runDiagnostics(req, res) {
        try {
            console.log('🔧 [SCHEDULED-CONTROLLER] Executando diagnósticos...');

            const diagnostics = {
                timestamp: new Date().toISOString(),
                tests: {}
            };

            // Teste do banco de dados
            console.log('🔍 [SCHEDULED-CONTROLLER] Testando banco de dados...');
            try {
                const dbTest = await cronSchedulerService.verificarDisponibilidade();
                diagnostics.tests.database = {
                    success: dbTest,
                    message: dbTest ? 'Conectividade OK' : 'Falha na conectividade',
                    duration: 'N/A'
                };
            } catch (error) {
                diagnostics.tests.database = {
                    success: false,
                    message: error.message,
                    duration: 'N/A'
                };
            }

            // Teste WhatsApp
            console.log('🔍 [SCHEDULED-CONTROLLER] Testando WhatsApp...');
            try {
                const whatsappTest = await scheduledWhatsappService.testarConectividade();
                diagnostics.tests.whatsapp = whatsappTest;
            } catch (error) {
                diagnostics.tests.whatsapp = {
                    success: false,
                    error: error.message
                };
            }

            // Teste Email
            console.log('🔍 [SCHEDULED-CONTROLLER] Testando Email...');
            try {
                const emailTest = await scheduledEmailService.testarConectividade();
                diagnostics.tests.email = emailTest;
            } catch (error) {
                diagnostics.tests.email = {
                    success: false,
                    error: error.message
                };
            }

            // Teste da tabela aux_cron
            console.log('🔍 [SCHEDULED-CONTROLLER] Testando tabela aux_cron...');
            try {
                const cronTest = await cronSchedulerService.buscarClientesElegiveis();
                diagnostics.tests.aux_cron = {
                    success: cronTest.success,
                    message: cronTest.success ? 
                        `Tabela acessível - ${cronTest.data?.length || 0} cliente(s) elegível(is)` : 
                        cronTest.error,
                    clientesElegiveis: cronTest.data?.length || 0
                };
            } catch (error) {
                diagnostics.tests.aux_cron = {
                    success: false,
                    message: error.message,
                    clientesElegiveis: 0
                };
            }

            const totalTests = Object.keys(diagnostics.tests).length;
            const passedTests = Object.values(diagnostics.tests).filter(test => test.success).length;
            const overallSuccess = passedTests === totalTests;

            console.log(`✅ [SCHEDULED-CONTROLLER] Diagnósticos concluídos: ${passedTests}/${totalTests}`);

            res.status(overallSuccess ? 200 : 206).json({
                success: overallSuccess,
                message: `Diagnósticos concluídos: ${passedTests}/${totalTests} testes passaram`,
                data: diagnostics,
                summary: {
                    totalTests: totalTests,
                    passedTests: passedTests,
                    failedTests: totalTests - passedTests,
                    overallHealth: overallSuccess ? 'healthy' : 'partial'
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ [SCHEDULED-CONTROLLER] Erro nos diagnósticos:', error);
            
            res.status(500).json({
                success: false,
                error: 'Erro ao executar diagnósticos',
                details: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Reseta estatísticas de todos os serviços
     * Endpoint adicional para limpeza de dados
     * @param {Object} req - Request do Express
     * @param {Object} res - Response do Express
     */
    async resetStatistics(req, res) {
        try {
            console.log('🔄 [SCHEDULED-CONTROLLER] Resetando estatísticas...');

            // Resetar estatísticas de todos os serviços
            cronSchedulerService.resetStatistics();
            scheduledWhatsappService.resetStatistics();
            scheduledEmailService.resetStatistics();

            console.log('✅ [SCHEDULED-CONTROLLER] Estatísticas resetadas com sucesso');

            res.json({
                success: true,
                message: 'Estatísticas de todos os serviços foram resetadas',
                resetTime: new Date().toISOString(),
                services: ['cronScheduler', 'whatsappService', 'emailService']
            });

        } catch (error) {
            console.error('❌ [SCHEDULED-CONTROLLER] Erro ao resetar estatísticas:', error);
            
            res.status(500).json({
                success: false,
                error: 'Erro ao resetar estatísticas',
                details: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    // === MÉTODOS UTILITÁRIOS ===

    /**
     * Calcula próxima execução baseada no intervalo do cron
     * @param {string} cronInterval - Intervalo do cron (formato crontab)
     * @returns {string|null} Próxima execução ou null se inválido
     */
    calcularProximaExecucao(cronInterval) {
        try {
            // Para simplificar, assumir que é */X * * * * (a cada X minutos)
            const match = cronInterval.match(/\*\/(\d+)/);
            if (match) {
                const minutos = parseInt(match[1]);
                const proxima = moment().add(minutos, 'minutes');
                return proxima.toISOString();
            }
            
            // Se não conseguir parsear, retornar estimativa genérica
            return moment().add(5, 'minutes').toISOString();
        } catch (error) {
            console.warn('⚠️ [SCHEDULED-CONTROLLER] Erro ao calcular próxima execução:', error);
            return null;
        }
    }

    /**
     * Conta quantos serviços estão ativos
     * @returns {number} Número de serviços ativos
     */
    contarServicosAtivos() {
        let ativos = 1; // Cron sempre ativo se o módulo está rodando
        
        if (process.env.EVOLUTION_API_URL) ativos++;
        if (scheduledEmailService.isConfigured) ativos++;
        
        return ativos;
    }

    /**
     * Obtém estatísticas consolidadas de todos os serviços
     * @returns {Object} Estatísticas consolidadas
     */
    getConsolidatedStatistics() {
        const cronStats = cronSchedulerService.getStatistics();
        const whatsappStats = scheduledWhatsappService.getStatistics();
        const emailStats = scheduledEmailService.getStatistics();

        return {
            cron: cronStats,
            whatsapp: whatsappStats,
            email: emailStats,
            consolidated: {
                totalMensagens: cronStats.totalMensagens,
                totalEnviosWhatsApp: whatsappStats.totalEnvios,
                totalEnviosEmail: emailStats.totalEnvios,
                servicosAtivos: this.contarServicosAtivos(),
                isRunning: cronStats.isRunning
            }
        };
    }
}

// Instância singleton do controlador
const scheduledController = new ScheduledController();

module.exports = scheduledController;