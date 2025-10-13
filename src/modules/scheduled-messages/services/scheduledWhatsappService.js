const evolutionAPI = require('../../../config/evolution');
const moment = require('moment');

/**
 * Serviço específico para envio de mensagens WhatsApp programadas
 * Baseado no whatsappMessageService.js existente, adaptado para envios em lote
 */
class ScheduledWhatsappService {
    constructor() {
        this.statistics = {
            totalEnvios: 0,
            totalSucessos: 0,
            totalFalhas: 0,
            ultimoEnvio: null,
            tempoMedioEnvio: 0,
            lastReset: new Date()
        };
    }

    /**
     * Envia mensagem de boletos programada
     * Baseado na função processarBoletos do whatsappService.js
     * @param {Object} dadosEnvio - Dados do cliente e boletos
     * @returns {Promise<Object>} Resultado do envio
     */
    async enviarMensagemBoletos(dadosEnvio) {
        const startTime = Date.now();
        this.statistics.totalEnvios++;

        try {
            const { cliente, mensagem, boletos, timestamp } = dadosEnvio;
            
            console.log(`📱 [SCHEDULED-WHATSAPP] Iniciando envio para: ${cliente.nome}`);
            console.log(`📱 [SCHEDULED-WHATSAPP] Celular: ${cliente.celular}, Boletos: ${boletos.length}`);

            // Validar dados obrigatórios
            if (!cliente.celular || !mensagem) {
                throw new Error('Dados obrigatórios ausentes: celular ou mensagem');
            }

            // Formatar número do celular para padrão brasileiro
            const numeroFormatado = this.formatarNumeroBrasileiro(cliente.celular);
            
            if (!numeroFormatado) {
                throw new Error(`Número de celular inválido: ${cliente.celular}`);
            }

            console.log(`📱 [SCHEDULED-WHATSAPP] Número formatado: ${numeroFormatado}`);

            // Verificar disponibilidade da instância WhatsApp
            const disponibilidade = await this.verificarDisponibilidadeInstancia();
            
            if (!disponibilidade.success) {
                throw new Error(`Instância WhatsApp indisponível: ${disponibilidade.error}`);
            }

            // Enviar mensagem via Evolution API
            const resultadoEnvio = await this.enviarTexto(numeroFormatado, mensagem);
            
            if (!resultadoEnvio.success) {
                throw new Error(`Falha no envio: ${resultadoEnvio.error}`);
            }

            // Calcular tempo de envio
            const duration = Date.now() - startTime;
            this.atualizarEstatisticas(true, duration);

            console.log(`✅ [SCHEDULED-WHATSAPP] Mensagem enviada com sucesso em ${duration}ms`);
            console.log(`✅ [SCHEDULED-WHATSAPP] MessageId: ${resultadoEnvio.data.messageId}`);

            return {
                success: true,
                status: 'enviado',
                messageId: resultadoEnvio.data.messageId,
                timestamp: new Date().toISOString(),
                duration: `${duration}ms`,
                cliente: {
                    nome: cliente.nome,
                    celular: numeroFormatado
                },
                boletos: boletos.map(b => ({
                    numero: b.numero,
                    valor: b.valor,
                    conta: b.conta
                }))
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            this.atualizarEstatisticas(false, duration);
            
            console.error(`❌ [SCHEDULED-WHATSAPP] Erro no envio:`, error);
            
            return {
                success: false,
                status: 'erro',
                error: error.message,
                timestamp: new Date().toISOString(),
                duration: `${duration}ms`,
                cliente: dadosEnvio.cliente ? {
                    nome: dadosEnvio.cliente.nome,
                    celular: dadosEnvio.cliente.celular
                } : null
            };
        }
    }

    /**
     * Envia mensagem de texto via Evolution API
     * Adaptado do whatsappMessageService.js para contexto programado
     * @param {string} phoneNumber - Número do telefone formatado
     * @param {string} message - Texto da mensagem
     * @returns {Promise<Object>} Resultado do envio
     */
    async enviarTexto(phoneNumber, message) {
        try {
            console.log(`📤 [SCHEDULED-WHATSAPP] Enviando texto para: ${phoneNumber}`);
            
            // Usar o método existente do evolutionAPI
            const resultado = await evolutionAPI.sendTextMessage(phoneNumber, message);
            
            if (!resultado.success) {
                throw new Error(resultado.error || 'Falha no envio via Evolution API');
            }

            console.log(`✅ [SCHEDULED-WHATSAPP] Texto enviado via Evolution API`);

            return {
                success: true,
                data: {
                    messageId: resultado.data?.messageId || `MSG_${Date.now()}`,
                    status: 'enviado',
                    phoneNumber: phoneNumber
                }
            };

        } catch (error) {
            console.error(`❌ [SCHEDULED-WHATSAPP] Erro no envio de texto:`, error);
            
            return {
                success: false,
                error: error.message,
                phoneNumber: phoneNumber
            };
        }
    }

    /**
     * Formata número de celular para padrão brasileiro da Evolution API
     * Baseado no whatsappMessageService.js existente
     * @param {string} phoneNumber - Número original
     * @returns {string|null} Número formatado ou null se inválido
     */
    formatarNumeroBrasileiro(phoneNumber) {
        try {
            // Remove todos os caracteres não numéricos
            let numero = phoneNumber.replace(/\D/g, '');
            
            console.log(`📱 [SCHEDULED-WHATSAPP] Formatando número: ${phoneNumber} -> ${numero}`);

            // Validações básicas
            if (!numero || numero.length < 10) {
                console.warn(`⚠️ [SCHEDULED-WHATSAPP] Número muito curto: ${numero}`);
                return null;
            }

            // Se começar com 55 (código do Brasil), remover
            if (numero.startsWith('55') && numero.length >= 12) {
                numero = numero.substring(2);
            }

            // Se não tem 11 dígitos, tentar ajustar
            if (numero.length === 10) {
                // Adicionar 9 após o DDD (celular antigo)
                const ddd = numero.substring(0, 2);
                const restante = numero.substring(2);
                numero = ddd + '9' + restante;
            }

            // Validar formato final
            if (numero.length !== 11) {
                console.warn(`⚠️ [SCHEDULED-WHATSAPP] Formato inválido após ajuste: ${numero}`);
                return null;
            }

            // Formar número completo para Evolution API (55 + DDD + 9 + número)
            const numeroCompleto = '55' + numero;
            
            console.log(`✅ [SCHEDULED-WHATSAPP] Número formatado: ${numeroCompleto}`);
            
            return numeroCompleto;

        } catch (error) {
            console.error(`❌ [SCHEDULED-WHATSAPP] Erro na formatação:`, error);
            return null;
        }
    }

    /**
     * Verifica disponibilidade da instância WhatsApp
     * @returns {Promise<Object>} Status da verificação
     */
    async verificarDisponibilidadeInstancia() {
        try {
            console.log(`🔍 [SCHEDULED-WHATSAPP] Verificando instância WhatsApp...`);

            // Usar método existente do evolutionAPI
            const status = await evolutionAPI.getInstanceStatus();

            if (!status.success) {
                throw new Error(status.error || 'Falha ao verificar status da instância');
            }

            // A resposta da Evolution API tem a estrutura: { instance: { instanceName: "FOX", state: "open" } }
            const instanceData = status.data?.instance || status.data;
            const isAvailable = instanceData?.state === 'open' || instanceData?.connectionState === 'connected';

            if (!isAvailable) {
                console.warn(`⚠️ [SCHEDULED-WHATSAPP] Instância não conectada: ${JSON.stringify(instanceData)}`);
                return {
                    success: false,
                    error: 'Instância WhatsApp não está conectada',
                    data: instanceData
                };
            }

            console.log(`✅ [SCHEDULED-WHATSAPP] Instância WhatsApp disponível: ${instanceData?.instanceName} - ${instanceData?.state}`);

            return {
                success: true,
                data: instanceData
            };

        } catch (error) {
            console.error(`❌ [SCHEDULED-WHATSAPP] Erro na verificação da instância:`, error);

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Envia múltiplas mensagens em lote com controle de rate limit
     * @param {Array} listaEnvios - Array de objetos com dados para envio
     * @returns {Promise<Object>} Resultado do envio em lote
     */
    async enviarLote(listaEnvios) {
        console.log(`📋 [SCHEDULED-WHATSAPP] Iniciando envio em lote: ${listaEnvios.length} mensagem(ns)`);
        
        const resultados = {
            total: listaEnvios.length,
            sucessos: 0,
            falhas: 0,
            detalhes: [],
            startTime: new Date().toISOString(),
            endTime: null,
            duration: null
        };

        const startTime = Date.now();

        for (let i = 0; i < listaEnvios.length; i++) {
            const envio = listaEnvios[i];
            
            try {
                console.log(`📤 [SCHEDULED-WHATSAPP] Enviando ${i + 1}/${listaEnvios.length}`);
                
                const resultado = await this.enviarMensagemBoletos(envio);
                
                if (resultado.success) {
                    resultados.sucessos++;
                } else {
                    resultados.falhas++;
                }
                
                resultados.detalhes.push({
                    cliente: envio.cliente?.nome || 'N/A',
                    resultado: resultado
                });

                // Rate limit: aguardar 1 segundo entre envios para evitar bloqueio
                if (i < listaEnvios.length - 1) {
                    console.log(`⏱️ [SCHEDULED-WHATSAPP] Aguardando rate limit...`);
                    await this.delay(1000);
                }

            } catch (error) {
                console.error(`❌ [SCHEDULED-WHATSAPP] Erro no envio ${i + 1}:`, error);
                
                resultados.falhas++;
                resultados.detalhes.push({
                    cliente: envio.cliente?.nome || 'N/A',
                    resultado: {
                        success: false,
                        error: error.message
                    }
                });
            }
        }

        const duration = Date.now() - startTime;
        resultados.endTime = new Date().toISOString();
        resultados.duration = `${duration}ms`;

        console.log(`✅ [SCHEDULED-WHATSAPP] Lote concluído: ${resultados.sucessos} sucessos, ${resultados.falhas} falhas em ${duration}ms`);

        return {
            success: true,
            data: resultados
        };
    }

    /**
     * Atualiza estatísticas do serviço
     * @param {boolean} sucesso - Se o envio foi bem-sucedido
     * @param {number} duracao - Duração em milissegundos
     */
    atualizarEstatisticas(sucesso, duracao) {
        if (sucesso) {
            this.statistics.totalSucessos++;
        } else {
            this.statistics.totalFalhas++;
        }

        // Calcular tempo médio de envio
        const totalEnvios = this.statistics.totalSucessos + this.statistics.totalFalhas;
        this.statistics.tempoMedioEnvio = ((this.statistics.tempoMedioEnvio * (totalEnvios - 1)) + duracao) / totalEnvios;
        
        this.statistics.ultimoEnvio = {
            timestamp: new Date().toISOString(),
            sucesso: sucesso,
            duracao: `${duracao}ms`
        };
    }

    /**
     * Obtém estatísticas do serviço
     * @returns {Object} Estatísticas atuais
     */
    getStatistics() {
        const uptime = moment().diff(moment(this.statistics.lastReset), 'seconds');
        const taxaSucesso = this.statistics.totalEnvios > 0 ? 
            ((this.statistics.totalSucessos / this.statistics.totalEnvios) * 100).toFixed(2) : 0;

        return {
            ...this.statistics,
            taxaSucesso: `${taxaSucesso}%`,
            tempoMedioEnvio: `${Math.round(this.statistics.tempoMedioEnvio)}ms`,
            uptime: `${uptime}s`
        };
    }

    /**
     * Reseta estatísticas do serviço
     */
    resetStatistics() {
        this.statistics = {
            totalEnvios: 0,
            totalSucessos: 0,
            totalFalhas: 0,
            ultimoEnvio: null,
            tempoMedioEnvio: 0,
            lastReset: new Date()
        };
        console.log('🔄 [SCHEDULED-WHATSAPP] Estatísticas resetadas');
    }

    /**
     * Verifica se o serviço está disponível
     * @returns {Promise<boolean>} Status de disponibilidade
     */
    async verificarDisponibilidade() {
        try {
            const instanciaStatus = await this.verificarDisponibilidadeInstancia();
            return instanciaStatus.success;
        } catch (error) {
            console.error('❌ [SCHEDULED-WHATSAPP] Erro na verificação de disponibilidade:', error);
            return false;
        }
    }

    /**
     * Testa conectividade com Evolution API
     * @returns {Promise<Object>} Resultado do teste
     */
    async testarConectividade() {
        try {
            console.log(`🔍 [SCHEDULED-WHATSAPP] Testando conectividade...`);

            // Usar o método testConnection do evolution.js que retorna boolean
            const testeConexao = await evolutionAPI.testConnection();

            if (!testeConexao) {
                throw new Error('Falha na conexão com Evolution API');
            }

            // Testar também o status da instância específica
            const statusInstancia = await this.verificarDisponibilidadeInstancia();

            console.log(`✅ [SCHEDULED-WHATSAPP] Conectividade OK`);

            return {
                success: true,
                message: 'Conectividade com Evolution API funcionando',
                details: {
                    connectionTest: testeConexao,
                    instanceAvailable: statusInstancia.success,
                    instanceData: statusInstancia.data || null,
                    instanceError: statusInstancia.error || null
                },
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error(`❌ [SCHEDULED-WHATSAPP] Erro no teste de conectividade:`, error);

            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Utilitário para delay/pausa
     * @param {number} ms - Milissegundos para aguardar
     * @returns {Promise} Promise que resolve após o delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Valida dados de envio
     * @param {Object} dadosEnvio - Dados para validação
     * @returns {Object} Resultado da validação
     */
    validarDadosEnvio(dadosEnvio) {
        const erros = [];

        if (!dadosEnvio) {
            erros.push('Dados de envio não fornecidos');
        } else {
            if (!dadosEnvio.cliente) {
                erros.push('Dados do cliente ausentes');
            } else {
                if (!dadosEnvio.cliente.nome) {
                    erros.push('Nome do cliente obrigatório');
                }
                if (!dadosEnvio.cliente.celular) {
                    erros.push('Celular do cliente obrigatório');
                }
            }

            if (!dadosEnvio.mensagem) {
                erros.push('Mensagem obrigatória');
            }

            if (!dadosEnvio.boletos || !Array.isArray(dadosEnvio.boletos) || dadosEnvio.boletos.length === 0) {
                erros.push('Lista de boletos obrigatória e não pode estar vazia');
            }
        }

        return {
            valido: erros.length === 0,
            erros: erros
        };
    }
}

// Instância singleton do serviço
const scheduledWhatsappService = new ScheduledWhatsappService();

module.exports = scheduledWhatsappService;