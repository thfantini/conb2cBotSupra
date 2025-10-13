const cron = require('node-cron');
const cronSchedulerService = require('../services/cronSchedulerService');
const moment = require('moment');

/**
 * Serviço de automação para execução programada de envios
 * Implementa execução automática via node-cron com controle completo
 */
class ScheduledCron {
    constructor() {
        this.cronJob = null;
        this.isRunning = false;
        this.isEnabled = false;
        this.interval = process.env.CRON_INTERVAL || '*/5 * * * *'; // Padrão: a cada 5 minutos
        this.timezone = process.env.TZ || 'America/Sao_Paulo';
        
        this.statistics = {
            totalAutoExecutions: 0,
            lastAutoExecution: null,
            nextAutoExecution: null,
            autoExecutionErrors: 0,
            serviceStarted: new Date(),
            consecutiveErrors: 0,
            maxConsecutiveErrors: parseInt(process.env.CRON_MAX_ERRORS) || 5
        };

        // Auto-inicializar se habilitado
        this.inicializar();
    }

    /**
     * Inicializa o serviço de cron automático
     */
    async inicializar() {
        try {
            console.log('🤖 [SCHEDULED-CRON] Inicializando serviço de automação...');
            
            // Verificar se deve estar habilitado
            const cronEnabled = process.env.CRON_ENABLED !== 'false';
            
            if (!cronEnabled) {
                console.log('⏸️ [SCHEDULED-CRON] Serviço desabilitado via CRON_ENABLED=false');
                return;
            }

            // Validar intervalo do cron
            if (!cron.validate(this.interval)) {
                console.error(`❌ [SCHEDULED-CRON] Intervalo inválido: ${this.interval}`);
                return;
            }

            // Verificar disponibilidade dos serviços dependentes
            const serviceCheck = await this.verificarServicosDependentes();
            
            if (!serviceCheck.success) {
                console.warn(`⚠️ [SCHEDULED-CRON] Serviços dependentes com problemas: ${serviceCheck.message}`);
                console.warn(`⚠️ [SCHEDULED-CRON] Continuando inicialização, mas execuções podem falhar`);
            }

            // Configurar e iniciar cron
            await this.configurarCron();
            
            console.log(`✅ [SCHEDULED-CRON] Serviço inicializado com sucesso`);
            console.log(`⏰ [SCHEDULED-CRON] Intervalo: ${this.interval} (${this.timezone})`);
            
        } catch (error) {
            console.error('❌ [SCHEDULED-CRON] Erro na inicialização:', error);
        }
    }

    /**
     * Configura e inicia o cron job
     */
    async configurarCron() {
        try {
            console.log(`⚙️ [SCHEDULED-CRON] Configurando cron job...`);

            // Criar cron job
            this.cronJob = cron.schedule(this.interval, async () => {
                await this.executarAutomaticamente();
            }, {
                scheduled: false, // Não iniciar automaticamente
                timezone: this.timezone
            });

            // Calcular próxima execução
            this.calcularProximaExecucao();

            // Iniciar cron
            this.start();

            console.log(`✅ [SCHEDULED-CRON] Cron configurado e iniciado`);

        } catch (error) {
            console.error('❌ [SCHEDULED-CRON] Erro ao configurar cron:', error);
            throw error;
        }
    }

    /**
     * Execução automática do cron (chamada pelo node-cron)
     */
    async executarAutomaticamente() {
        const execucaoId = `AUTO_${Date.now()}`;
        
        try {
            console.log(`🤖 [SCHEDULED-CRON] Execução automática iniciada: ${execucaoId}`);
            
            this.statistics.totalAutoExecutions++;
            this.statistics.lastAutoExecution = new Date().toISOString();

            // Verificar se cronSchedulerService não está executando manualmente
            if (cronSchedulerService.isRunning) {
                console.log(`⏳ [SCHEDULED-CRON] ${execucaoId}: CronScheduler em execução manual, pulando...`);
                return;
            }

            // Executar o cron scheduler
            const startTime = Date.now();
            const resultado = await cronSchedulerService.executarCron();
            const duration = Date.now() - startTime;

            if (resultado.success) {
                console.log(`✅ [SCHEDULED-CRON] ${execucaoId}: Concluído com sucesso em ${duration}ms`);
                console.log(`📊 [SCHEDULED-CRON] ${execucaoId}: ${resultado.data.clientesProcessados} clientes, ${resultado.data.mensagensEnviadas} mensagens`);
                
                // Reset contador de erros consecutivos
                this.statistics.consecutiveErrors = 0;
                
            } else {
                throw new Error(resultado.error || 'Falha na execução do cronScheduler');
            }

            // Calcular próxima execução
            this.calcularProximaExecucao();

        } catch (error) {
            console.error(`❌ [SCHEDULED-CRON] ${execucaoId}: Erro na execução automática:`, error);
            
            this.statistics.autoExecutionErrors++;
            this.statistics.consecutiveErrors++;

            // Verificar se deve parar por muitos erros consecutivos
            if (this.statistics.consecutiveErrors >= this.statistics.maxConsecutiveErrors) {
                console.error(`🚨 [SCHEDULED-CRON] Muitos erros consecutivos (${this.statistics.consecutiveErrors}), parando automação!`);
                this.stop();
                
                // TODO: Implementar notificação de alerta
                await this.notificarErrosCriticos();
            }
        }
    }

    /**
     * Inicia o cron job
     * @returns {Object} Resultado da operação
     */
    start() {
        try {
            if (this.isRunning) {
                return {
                    success: false,
                    message: 'Cron já está em execução'
                };
            }

            if (!this.cronJob) {
                return {
                    success: false,
                    message: 'Cron não foi configurado'
                };
            }

            this.cronJob.start();
            this.isRunning = true;
            this.isEnabled = true;
            
            console.log('▶️ [SCHEDULED-CRON] Automação iniciada');
            
            return {
                success: true,
                message: 'Automação iniciada com sucesso',
                nextExecution: this.statistics.nextAutoExecution
            };

        } catch (error) {
            console.error('❌ [SCHEDULED-CRON] Erro ao iniciar:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * Para o cron job
     * @returns {Object} Resultado da operação
     */
    stop() {
        try {
            if (!this.isRunning) {
                return {
                    success: false,
                    message: 'Cron não está em execução'
                };
            }

            if (this.cronJob) {
                this.cronJob.stop();
            }
            
            this.isRunning = false;
            this.isEnabled = false;
            this.statistics.nextAutoExecution = null;
            
            console.log('⏹️ [SCHEDULED-CRON] Automação parada');
            
            return {
                success: true,
                message: 'Automação parada com sucesso'
            };

        } catch (error) {
            console.error('❌ [SCHEDULED-CRON] Erro ao parar:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * Reinicia o cron job com nova configuração
     * @param {string} newInterval - Novo intervalo (opcional)
     * @returns {Object} Resultado da operação
     */
    async restart(newInterval = null) {
        try {
            console.log('🔄 [SCHEDULED-CRON] Reiniciando automação...');

            // Parar execução atual
            this.stop();

            // Atualizar intervalo se fornecido
            if (newInterval) {
                if (!cron.validate(newInterval)) {
                    throw new Error(`Intervalo inválido: ${newInterval}`);
                }
                this.interval = newInterval;
                console.log(`⏰ [SCHEDULED-CRON] Novo intervalo: ${this.interval}`);
            }

            // Destruir cron job atual
            if (this.cronJob) {
                this.cronJob.destroy();
                this.cronJob = null;
            }

            // Reconfigurar e iniciar
            await this.configurarCron();

            console.log('✅ [SCHEDULED-CRON] Automação reiniciada com sucesso');

            return {
                success: true,
                message: 'Automação reiniciada com sucesso',
                interval: this.interval,
                nextExecution: this.statistics.nextAutoExecution
            };

        } catch (error) {
            console.error('❌ [SCHEDULED-CRON] Erro ao reiniciar:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * Calcula próxima execução baseada no intervalo atual
     */
    calcularProximaExecucao() {
        try {
            // Implementação simplificada para intervalos mais comuns
            const agora = moment();
            let proxima = null;

            // Tentar parsear padrões comuns
            if (this.interval.includes('*/')) {
                // Formato */X (a cada X unidades)
                const minutosMatch = this.interval.match(/\*\/(\d+)\s+\*/);
                if (minutosMatch) {
                    const minutos = parseInt(minutosMatch[1]);
                    proxima = agora.clone().add(minutos, 'minutes');
                }
            } else if (this.interval.match(/^\d+\s+\*/)) {
                // Formato específico de minuto
                const minuto = parseInt(this.interval.split(' ')[0]);
                proxima = agora.clone().add(1, 'hour').minute(minuto).second(0);
            }

            // Fallback: adicionar 5 minutos
            if (!proxima) {
                proxima = agora.clone().add(5, 'minutes');
            }

            this.statistics.nextAutoExecution = proxima.toISOString();
            
        } catch (error) {
            console.warn('⚠️ [SCHEDULED-CRON] Erro ao calcular próxima execução:', error);
            this.statistics.nextAutoExecution = moment().add(5, 'minutes').toISOString();
        }
    }

    /**
     * Verifica disponibilidade dos serviços dependentes
     * @returns {Promise<Object>} Resultado da verificação
     */
    async verificarServicosDependentes() {
        try {
            const problemas = [];

            // Verificar banco de dados
            const dbCheck = await cronSchedulerService.verificarDisponibilidade();
            if (!dbCheck) {
                problemas.push('Banco de dados inacessível');
            }

            // Verificar se há configuração mínima
            if (!process.env.DB_HOST || !process.env.DB_USER) {
                problemas.push('Configuração de banco incompleta');
            }

            if (!process.env.EVOLUTION_API_URL && !process.env.SMTP_HOST) {
                problemas.push('Nenhum serviço de envio configurado (WhatsApp ou Email)');
            }

            return {
                success: problemas.length === 0,
                message: problemas.length > 0 ? problemas.join(', ') : 'Todos os serviços disponíveis',
                problemas: problemas
            };

        } catch (error) {
            return {
                success: false,
                message: `Erro na verificação: ${error.message}`,
                problemas: [error.message]
            };
        }
    }

    /**
     * Notifica sobre erros críticos (muitos erros consecutivos)
     */
    async notificarErrosCriticos() {
        try {
            console.error('🚨 [SCHEDULED-CRON] ALERTA CRÍTICO: Automação parada por erros consecutivos');
            
            const alertMessage = `
🚨 ALERTA CRÍTICO - Sistema de Mensagens Programadas

A automação foi interrompida devido a ${this.statistics.consecutiveErrors} erros consecutivos.

Detalhes:
- Última execução: ${this.statistics.lastAutoExecution}
- Total de execuções: ${this.statistics.totalAutoExecutions}
- Total de erros: ${this.statistics.autoExecutionErrors}
- Intervalo configurado: ${this.interval}

Ação necessária: Verificar logs e reiniciar manualmente a automação.
            `.trim();

            // TODO: Implementar notificação real (email, Slack, etc.)
            console.error(alertMessage);

            // Salvar no log para análise posterior
            // TODO: Implementar log específico para alertas críticos

        } catch (error) {
            console.error('❌ [SCHEDULED-CRON] Erro ao notificar alertas críticos:', error);
        }
    }

    /**
     * Obtém status completo do serviço de automação
     * @returns {Object} Status detalhado
     */
    getStatus() {
        const uptime = moment().diff(moment(this.statistics.serviceStarted), 'seconds');
        const errorRate = this.statistics.totalAutoExecutions > 0 ? 
            ((this.statistics.autoExecutionErrors / this.statistics.totalAutoExecutions) * 100).toFixed(2) : 0;

        return {
            isRunning: this.isRunning,
            isEnabled: this.isEnabled,
            interval: this.interval,
            timezone: this.timezone,
            
            statistics: {
                ...this.statistics,
                uptime: `${uptime}s`,
                errorRate: `${errorRate}%`,
                healthStatus: this.statistics.consecutiveErrors < this.statistics.maxConsecutiveErrors ? 'healthy' : 'critical'
            },

            configuration: {
                cronInterval: this.interval,
                timezone: this.timezone,
                maxConsecutiveErrors: this.statistics.maxConsecutiveErrors,
                enabled: process.env.CRON_ENABLED !== 'false'
            },

            nextAction: this.isRunning ? 
                `Próxima execução: ${this.statistics.nextAutoExecution}` :
                'Automação parada - use start() para iniciar'
        };
    }

    /**
     * Obtém estatísticas resumidas
     * @returns {Object} Estatísticas resumidas
     */
    getStatistics() {
        return {
            totalAutoExecutions: this.statistics.totalAutoExecutions,
            lastAutoExecution: this.statistics.lastAutoExecution,
            nextAutoExecution: this.statistics.nextAutoExecution,
            autoExecutionErrors: this.statistics.autoExecutionErrors,
            consecutiveErrors: this.statistics.consecutiveErrors,
            isRunning: this.isRunning,
            isEnabled: this.isEnabled,
            uptime: moment().diff(moment(this.statistics.serviceStarted), 'seconds')
        };
    }

    /**
     * Reseta estatísticas do serviço
     */
    resetStatistics() {
        this.statistics = {
            ...this.statistics,
            totalAutoExecutions: 0,
            lastAutoExecution: null,
            autoExecutionErrors: 0,
            consecutiveErrors: 0,
            serviceStarted: new Date()
        };
        
        console.log('🔄 [SCHEDULED-CRON] Estatísticas resetadas');
    }

    /**
     * Valida intervalo de cron
     * @param {string} interval - Intervalo para validar
     * @returns {boolean} Se o intervalo é válido
     */
    static validateInterval(interval) {
        return cron.validate(interval);
    }

    /**
     * Obtém intervalos de exemplo
     * @returns {Array} Lista de intervalos comuns
     */
    static getExampleIntervals() {
        return [
            { interval: '*/5 * * * *', description: 'A cada 5 minutos' },
            { interval: '*/10 * * * *', description: 'A cada 10 minutos' },
            { interval: '*/15 * * * *', description: 'A cada 15 minutos' },
            { interval: '*/30 * * * *', description: 'A cada 30 minutos' },
            { interval: '0 * * * *', description: 'A cada hora (no minuto 0)' },
            { interval: '0 */2 * * *', description: 'A cada 2 horas' },
            { interval: '0 8 * * *', description: 'Todos os dias às 8:00' },
            { interval: '0 8,12,18 * * *', description: 'Às 8:00, 12:00 e 18:00' },
            { interval: '0 8 * * 1-5', description: 'Dias úteis às 8:00' }
        ];
    }

    /**
     * Força parada de emergência (para uso em casos críticos)
     */
    emergencyStop() {
        try {
            console.warn('🚨 [SCHEDULED-CRON] PARADA DE EMERGÊNCIA ATIVADA!');
            
            if (this.cronJob) {
                this.cronJob.destroy();
                this.cronJob = null;
            }
            
            this.isRunning = false;
            this.isEnabled = false;
            this.statistics.nextAutoExecution = null;
            
            console.warn('🚨 [SCHEDULED-CRON] Automação interrompida forçadamente');
            
        } catch (error) {
            console.error('❌ [SCHEDULED-CRON] Erro na parada de emergência:', error);
        }
    }
}

// Instância singleton do serviço de automação
const scheduledCron = new ScheduledCron();

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('📴 [SCHEDULED-CRON] Recebido SIGTERM, parando automação...');
    scheduledCron.stop();
});

process.on('SIGINT', () => {
    console.log('📴 [SCHEDULED-CRON] Recebido SIGINT, parando automação...');
    scheduledCron.stop();
});

module.exports = scheduledCron;