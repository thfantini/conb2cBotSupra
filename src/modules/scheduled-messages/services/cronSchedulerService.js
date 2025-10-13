const moment = require('moment');
const database = require('../../../config/database');
const scheduledWhatsappService = require('./scheduledWhatsappService');
const scheduledEmailService = require('./scheduledEmailService');

/**
 * Serviço principal para agendamento e execução de envios programados
 * Implementa todas as regras de negócio para mensagens agendadas
 */
class CronSchedulerService {
    constructor() {
        this.isRunning = false;
        this.lastExecution = null;
        this.statistics = {
            totalExecutions: 0,
            totalClientes: 0,
            totalMensagens: 0,
            totalErros: 0,
            lastReset: new Date()
        };
    }

    /**
     * REGRA GERAL: Executa verificação principal do cron
     * Verifica tabela aux_cron e processa clientes elegíveis
     * @returns {Promise<Object>} Resultado da execução
     */
    async executarCron() {
        if (this.isRunning) {
            console.log('⏳ [CRON] Execução já em andamento, pulando...');
            return { success: false, message: 'Execução já em andamento' };
        }

        this.isRunning = true;
        const startTime = Date.now();
        const execucaoId = `EXEC_${Date.now()}`;
        
        console.log(`🚀 [CRON] Iniciando execução ${execucaoId}`);

        try {
            // Incrementa contador de execuções
            this.statistics.totalExecutions++;
            
            // REGRA GERAL: Buscar clientes na tabela aux_cron
            const clientesElegiveis = await this.buscarClientesElegiveis();
            
            if (!clientesElegiveis.success) {
                throw new Error(`Erro ao buscar clientes: ${clientesElegiveis.error}`);
            }

            console.log(`📋 [CRON] Encontrados ${clientesElegiveis.data.length} cliente(s) elegível(is)`);

            const resultados = {
                execucaoId: execucaoId,
                startTime: new Date(startTime).toISOString(),
                clientesVerificados: clientesElegiveis.data.length,
                clientesProcessados: 0,
                mensagensEnviadas: 0,
                erros: [],
                detalhes: []
            };

            // Processar cada cliente encontrado
            for (const clienteCron of clientesElegiveis.data) {
                try {
                    console.log(`👤 [CRON] Processando cliente: ${clienteCron.cliente}`);
                    
                    const resultadoCliente = await this.processarCliente(clienteCron);
                    
                    if (resultadoCliente.success) {
                        resultados.clientesProcessados++;
                        resultados.mensagensEnviadas += resultadoCliente.mensagensEnviadas;
                        this.statistics.totalMensagens += resultadoCliente.mensagensEnviadas;
                    } else {
                        resultados.erros.push({
                            cliente: clienteCron.cliente,
                            erro: resultadoCliente.error
                        });
                        this.statistics.totalErros++;
                    }
                    
                    resultados.detalhes.push(resultadoCliente);
                    
                } catch (errorCliente) {
                    console.error(`❌ [CRON] Erro ao processar cliente ${clienteCron.cliente}:`, errorCliente);
                    resultados.erros.push({
                        cliente: clienteCron.cliente,
                        erro: errorCliente.message
                    });
                    this.statistics.totalErros++;
                }
            }

            const duration = Date.now() - startTime;
            resultados.endTime = new Date().toISOString();
            resultados.duration = `${duration}ms`;
            
            this.lastExecution = {
                timestamp: new Date().toISOString(),
                duration: duration,
                clientesProcessados: resultados.clientesProcessados,
                mensagensEnviadas: resultados.mensagensEnviadas,
                erros: resultados.erros.length
            };

            this.statistics.totalClientes += resultados.clientesProcessados;

            console.log(`✅ [CRON] Execução ${execucaoId} concluída em ${duration}ms`);
            console.log(`📊 [CRON] Resumo: ${resultados.clientesProcessados} clientes, ${resultados.mensagensEnviadas} mensagens, ${resultados.erros.length} erros`);

            return {
                success: true,
                data: resultados
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            console.error(`💥 [CRON] Erro crítico na execução ${execucaoId}:`, error);
            
            this.statistics.totalErros++;
            
            return {
                success: false,
                error: error.message,
                execucaoId: execucaoId,
                duration: `${duration}ms`
            };
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * REGRA GERAL: Busca clientes elegíveis na tabela aux_cron
     * SQL: select cliente,hora_inicio,hora_fim from aux_cron where data_inicio <= {dateNow} and data_fim >= {dateNow} and status=1
     * @returns {Promise<Object>} Lista de clientes elegíveis
     */
    async buscarClientesElegiveis() {
        try {
            const dateNow = moment().format('YYYY-MM-DD');
            const timeNow = moment().format('HH:mm:ss');
            
            console.log(`🔍 [CRON] Buscando clientes para ${dateNow} ${timeNow}`);

            const query = `
                SELECT cliente, hora_inicio, hora_fim, data_inicio, data_fim
                FROM aux_cron 
                WHERE data_inicio <= ? 
                AND data_fim >= ? 
                AND status = 1
                AND hora_inicio <= ?
                AND hora_fim >= ?
                ORDER BY cliente
            `;
            
            const result = await database.executeQuery(query, [dateNow, dateNow, timeNow, timeNow]);
            
            if (!result.success) {
                throw new Error(result.error);
            }

            console.log(`✅ [CRON] Query aux_cron executada: ${result.data.length} registro(s) encontrado(s)`);
            
            return {
                success: true,
                data: result.data
            };

        } catch (error) {
            console.error('❌ [CRON] Erro ao buscar clientes elegíveis:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * REGRA VALIDACAO: Processa um cliente específico
     * Verifica se existem boletos para envio na view vw_botCron
     * @param {Object} clienteCron - Dados do cliente da tabela aux_cron
     * @returns {Promise<Object>} Resultado do processamento
     */
    async processarCliente(clienteCron) {
        try {
            console.log(`🔍 [CRON] Verificando boletos para cliente: ${clienteCron.cliente}`);

            // REGRA VALIDACAO: Buscar boletos com status=0 para o cliente
            const boletosResult = await this.buscarBoletosPendentes(clienteCron.cliente);
            
            if (!boletosResult.success) {
                throw new Error(`Erro ao buscar boletos: ${boletosResult.error}`);
            }

            if (boletosResult.data.length === 0) {
                console.log(`📭 [CRON] Nenhum boleto pendente para cliente: ${clienteCron.cliente}`);
                return {
                    success: true,
                    cliente: clienteCron.cliente,
                    mensagensEnviadas: 0,
                    boletos: [],
                    message: 'Nenhum boleto pendente para envio'
                };
            }

            console.log(`📄 [CRON] Encontrados ${boletosResult.data.length} boleto(s) pendente(s)`);

            // Agrupar boletos por cliente para envio
            const clienteData = boletosResult.data[0]; // Pegar dados do primeiro boleto para info do cliente
            
            // REGRA DE ENVIO: Usar mesmos critérios da função processarBoletos
            const resultadoEnvio = await this.enviarMensagensBoletos(clienteData, boletosResult.data);
            
            if (!resultadoEnvio.success) {
                throw new Error(`Erro no envio: ${resultadoEnvio.error}`);
            }

            // Atualizar status dos boletos enviados
            await this.atualizarStatusBoletos(boletosResult.data);

            console.log(`✅ [CRON] Cliente ${clienteCron.cliente} processado com sucesso`);

            return {
                success: true,
                cliente: clienteCron.cliente,
                mensagensEnviadas: resultadoEnvio.mensagensEnviadas,
                boletos: boletosResult.data.map(b => ({
                    conta: b.idConta || b.conta,
                    numero: b.numero,
                    valor: b.valor,
                    vencimento: b.dataVencimento
                })),
                envio: resultadoEnvio.detalhes
            };

        } catch (error) {
            console.error(`❌ [CRON] Erro ao processar cliente ${clienteCron.cliente}:`, error);
            return {
                success: false,
                cliente: clienteCron.cliente,
                error: error.message
            };
        }
    }

    /**
     * REGRA VALIDACAO: Busca boletos pendentes na view vw_botCron
     * SQL: select * from vw_botCron where cliente = {cliente} and status=0
     * @param {number} clienteId - ID do cliente
     * @returns {Promise<Object>} Lista de boletos pendentes
     */
    async buscarBoletosPendentes(clienteId) {
        try {
            const query = `
                SELECT cliente, cnpj, nome, celular, idNfse, idConta,
                       dataDoc, dataVencimento, numero, valor, codBarras, linhaDigitavel, email, url
                FROM vw_botCron
                WHERE cliente = ?
                AND status = 0
                ORDER BY dataVencimento ASC
            `;
            
            const result = await database.executeQuery(query, [clienteId]);
            
            if (!result.success) {
                throw new Error(result.error);
            }

            return {
                success: true,
                data: result.data
            };

        } catch (error) {
            console.error(`❌ [CRON] Erro ao buscar boletos pendentes:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * REGRA DE ENVIO: Envia mensagens baseado na função processarBoletos
     * Inclui mensagem amigável + dados do boleto + envio de email
     * @param {Object} clienteData - Dados do cliente
     * @param {Array} boletos - Lista de boletos
     * @returns {Promise<Object>} Resultado do envio
     */
    async enviarMensagensBoletos(clienteData, boletos) {
        try {
            console.log(`📤 [CRON] Iniciando envios para: ${clienteData.nome}`);

            const resultadoEnvio = {
                whatsapp: { success: false, messageId: null, error: null },
                email: { success: false, messageId: null, error: null },
                mensagensEnviadas: 0
            };

            // FORMATO: Construir mensagem amigável com dados dos boletos
            const mensagemAmigavel = this.construirMensagemAmigavel(clienteData, boletos);

            // Dados para envio via WhatsApp e Email
            const dadosEnvio = {
                cliente: clienteData,
                mensagem: mensagemAmigavel,
                boletos: boletos,
                timestamp: new Date().toISOString()
            };

            // Envio via WhatsApp (usando celular da view)
            if (clienteData.celular) {
                try {
                    console.log(`📱 [CRON] Enviando via WhatsApp para: ${clienteData.celular}`);

                    const resultadoWhatsApp = await scheduledWhatsappService.enviarMensagemBoletos(dadosEnvio);

                    if (resultadoWhatsApp.success) {
                        resultadoEnvio.whatsapp = {
                            success: true,
                            messageId: resultadoWhatsApp.messageId,
                            status: resultadoWhatsApp.status,
                            timestamp: resultadoWhatsApp.timestamp,
                            duration: resultadoWhatsApp.duration
                        };
                        resultadoEnvio.mensagensEnviadas++;
                        console.log(`✅ [CRON] WhatsApp enviado com sucesso: ${resultadoWhatsApp.messageId}`);
                    } else {
                        resultadoEnvio.whatsapp = {
                            success: false,
                            error: resultadoWhatsApp.error,
                            timestamp: resultadoWhatsApp.timestamp,
                            duration: resultadoWhatsApp.duration
                        };
                        console.error(`❌ [CRON] Erro no WhatsApp: ${resultadoWhatsApp.error}`);
                    }
                } catch (errorWhatsApp) {
                    console.error(`❌ [CRON] Erro no WhatsApp:`, errorWhatsApp);
                    resultadoEnvio.whatsapp = {
                        success: false,
                        error: errorWhatsApp.message,
                        timestamp: new Date().toISOString()
                    };
                }
            }

            // EMAIL: Envio via email (usando email da view)
            if (clienteData.email) {
                try {
                    console.log(`📧 [CRON] Enviando via Email para: ${clienteData.email}`);

                    const resultadoEmail = await scheduledEmailService.enviarEmailBoletos(dadosEnvio);

                    if (resultadoEmail.success) {
                        resultadoEnvio.email = {
                            success: true,
                            messageId: resultadoEmail.messageId,
                            status: resultadoEmail.status,
                            timestamp: resultadoEmail.timestamp,
                            duration: resultadoEmail.duration
                        };
                        resultadoEnvio.mensagensEnviadas++;
                        console.log(`✅ [CRON] Email enviado com sucesso: ${resultadoEmail.messageId}`);
                    } else {
                        resultadoEnvio.email = {
                            success: false,
                            error: resultadoEmail.error,
                            timestamp: resultadoEmail.timestamp,
                            duration: resultadoEmail.duration
                        };
                        console.error(`❌ [CRON] Erro no Email: ${resultadoEmail.error}`);
                    }
                } catch (errorEmail) {
                    console.error(`❌ [CRON] Erro no Email:`, errorEmail);
                    resultadoEnvio.email = {
                        success: false,
                        error: errorEmail.message,
                        timestamp: new Date().toISOString()
                    };
                }
            }

            const sucesso = resultadoEnvio.whatsapp.success || resultadoEnvio.email.success;

            console.log(`📊 [CRON] Resultado dos envios - WhatsApp: ${resultadoEnvio.whatsapp.success}, Email: ${resultadoEnvio.email.success}`);

            return {
                success: sucesso,
                mensagensEnviadas: resultadoEnvio.mensagensEnviadas,
                detalhes: resultadoEnvio
            };

        } catch (error) {
            console.error(`❌ [CRON] Erro no envio de mensagens:`, error);
            return {
                success: false,
                error: error.message,
                mensagensEnviadas: 0
            };
        }
    }

    /**
     * FORMATO: Constrói mensagem amigável baseada na função processarBoletos
     * Inclui mensagem amigável antes dos dados do boleto
     * @param {Object} clienteData - Dados do cliente
     * @param {Array} boletos - Lista de boletos
     * @returns {string} Mensagem formatada
     */
    construirMensagemAmigavel(clienteData, boletos) {
        const nomeCliente = clienteData.nome;
        const totalBoletos = boletos.length;
        const empresa = process.env.COMPANY_NAME || 'Nossa Empresa';

        // Mensagem amigável inicial
        let mensagem = `👋 *Olá, ${nomeCliente}!*\n\n`;
        mensagem += `📬 Você possui *${totalBoletos} boleto(s)* disponível(is) para pagamento:\n\n`;

        // Adicionar dados de cada boleto (baseado na função processarBoletos)
        boletos.forEach((boleto, index) => {
            const dataVencimento = moment(boleto.dataVencimento).format('DD/MM/YYYY');
            const valor = parseFloat(boleto.valor).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL'
            });

            mensagem += `*Boleto ${index + 1}/${totalBoletos}*\n`;
            mensagem += `*Vencimento:* ${dataVencimento}\n`;
            mensagem += `*Número:* ${boleto.numero}\n`;
            mensagem += `*Valor:* ${valor}\n\n`;
            mensagem += `*Linha Digitável:*\n${boleto.linhaDigitavel}\n\n`;
            mensagem += `*Link Impressão:*\n${boleto.url}\n`;
            
            // // Link para impressão (se disponível)
            // if (boleto.url) {
            //     //const idConta = boleto.idConta || boleto.conta;
            //     mensagem += `📎 Link: ${boleto.url}\n`;
            // }
            
            mensagem += `\n`;
        });

        //mensagem += `💡 *Dica:* Você pode copiar a linha digitável e colar no app do seu banco.\n\n`;
        mensagem += `Em caso de dúvidas, entre em contato conosco.\n\n`;
        mensagem += `Atenciosamente,\n*${empresa}*`;

        return mensagem;
    }

    /**
     * ATUALIZAÇÃO: Atualiza status dos boletos após envio
     * SQL: update whapi_clientes_boleto set status=1,statusData={DATETIME} where idConta = {idConta}
     * @param {Array} boletos - Lista de boletos enviados
     * @returns {Promise<Object>} Resultado da atualização
     */
    async atualizarStatusBoletos(boletos) {
        try {
            console.log(`🔄 [CRON] Atualizando status de ${boletos.length} boleto(s)`);

            const updates = [];
            const statusData = moment().format('YYYY-MM-DD HH:mm:ss');

            for (const boleto of boletos) {
                try {
                    const query = `
                        UPDATE whapi_clientes_boleto 
                        SET status = 1, statusData = ?
                        WHERE idConta = ?
                    `;
                    
                    // Verificar se idConta existe no boleto
                    const idConta = boleto.idConta || boleto.conta;

                    if (!idConta) {
                        console.error(`❌ [CRON] idConta não encontrado no boleto:`, boleto);
                        updates.push({
                            conta: 'N/A',
                            success: false,
                            error: 'idConta não encontrado'
                        });
                        continue;
                    }

                    const result = await database.executeQuery(query, [statusData, idConta]);

                    if (result.success) {
                        updates.push({
                            conta: idConta,
                            success: true,
                            timestamp: statusData
                        });
                        console.log(`✅ [CRON] Status atualizado para boleto: ${idConta}`);
                    } else {
                        updates.push({
                            conta: idConta,
                            success: false,
                            error: result.error
                        });
                        console.error(`❌ [CRON] Erro ao atualizar boleto ${idConta}:`, result.error);
                    }

                } catch (errorBoleto) {
                    const idConta = boleto.idConta || boleto.conta || 'N/A';
                    updates.push({
                        conta: idConta,
                        success: false,
                        error: errorBoleto.message
                    });
                    console.error(`❌ [CRON] Erro ao atualizar boleto ${idConta}:`, errorBoleto);
                }
            }

            const sucessos = updates.filter(u => u.success).length;
            console.log(`📊 [CRON] Status atualizado: ${sucessos}/${boletos.length} boletos`);

            return {
                success: true,
                totalBoletos: boletos.length,
                sucessos: sucessos,
                detalhes: updates
            };

        } catch (error) {
            console.error(`❌ [CRON] Erro ao atualizar status dos boletos:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Obtém estatísticas do serviço
     * @returns {Object} Estatísticas atuais
     */
    getStatistics() {
        const uptime = moment().diff(moment(this.statistics.lastReset), 'seconds');
        
        return {
            ...this.statistics,
            isRunning: this.isRunning,
            lastExecution: this.lastExecution,
            uptime: `${uptime}s`
        };
    }

    /**
     * Reseta estatísticas do serviço
     */
    resetStatistics() {
        this.statistics = {
            totalExecutions: 0,
            totalClientes: 0,
            totalMensagens: 0,
            totalErros: 0,
            lastReset: new Date()
        };
        console.log('🔄 [CRON] Estatísticas resetadas');
    }

    /**
     * Verifica se o serviço está disponível
     * @returns {Promise<boolean>} Status de disponibilidade
     */
    async verificarDisponibilidade() {
        try {
            // Testa conexão com banco de dados
            const testQuery = 'SELECT 1 as test';
            const result = await database.executeQuery(testQuery);
            
            return result.success;
        } catch (error) {
            console.error('❌ [CRON] Erro na verificação de disponibilidade:', error);
            return false;
        }
    }
}

// Instância singleton do serviço
const cronSchedulerService = new CronSchedulerService();

module.exports = cronSchedulerService;