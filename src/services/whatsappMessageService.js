const evolutionAPI = require('../config/evolution');

/**
 * Serviço específico para envio de mensagens via WhatsApp
 * Módulo independente para o micro-serviço de mensagens
 */
class WhatsAppMessageService {

    /**
     * Envia mensagem via WhatsApp para cliente autorizado
     * @param {Object} dadosEnvio - Dados consolidados para envio
     * @returns {Promise<Object>} Resultado do envio
     */
    static async enviarMensagem(dadosEnvio) {
        try {
            const { cnpj, celular, mensagem, timestamp } = dadosEnvio;
            
            console.log(`📱 Iniciando envio WhatsApp para: ${celular}`);

            // Formatar número para padrão Evolution API
            const numeroFormatado = WhatsAppMessageService.formatarNumero(celular);
            
            // Validar número formatado
            if (!numeroFormatado) {
                console.error(`❌ Número inválido para WhatsApp: ${celular}`);
                return {
                    success: false,
                    status: 'erro',
                    error: 'Número de celular inválido',
                    timestamp: new Date().toISOString()
                };
            }

            let resultadoEnvio;

            // Determinar tipo de mensagem e enviar
            if (mensagem.texto && !mensagem.imagem) {
                // Envio de mensagem de texto
                resultadoEnvio = await WhatsAppMessageService.enviarTexto(numeroFormatado, mensagem.texto);
            } 
            else if (mensagem.imagem && !mensagem.texto) {
                // Envio de mensagem de imagem
                resultadoEnvio = await WhatsAppMessageService.enviarImagem(numeroFormatado, mensagem.imagem);
            }
            else if (mensagem.texto && mensagem.imagem) {
                // Envio de imagem com legenda
                resultadoEnvio = await WhatsAppMessageService.enviarImagemComLegenda(numeroFormatado, mensagem.imagem, mensagem.texto);
            }
            else {
                console.error(`❌ Tipo de mensagem não suportado`);
                return {
                    success: false,
                    status: 'erro',
                    error: 'Tipo de mensagem não suportado',
                    timestamp: new Date().toISOString()
                };
            }

            // Log do resultado
            if (resultadoEnvio.success) {
                console.log(`✅ WhatsApp enviado com sucesso para: ${celular}`);
            } else {
                console.error(`❌ Falha no envio WhatsApp para: ${celular} - ${resultadoEnvio.error}`);
            }

            return {
                success: resultadoEnvio.success,
                status: resultadoEnvio.success ? 'enviado' : 'erro',
                messageId: resultadoEnvio.data?.messageId || null,
                error: resultadoEnvio.error || null,
                numero: numeroFormatado,
                tipoMensagem: WhatsAppMessageService.obterTipoMensagem(mensagem),
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Erro no serviço WhatsApp:', error);
            return {
                success: false,
                status: 'erro',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Envia mensagem de texto simples
     * @param {string} numero - Número formatado
     * @param {string} texto - Texto da mensagem
     * @returns {Promise<Object>} Resultado do envio
     */
    static async enviarTexto(numero, texto) {
        try {
            console.log(`📝 Enviando texto para: ${numero}`);
            
            const resultado = await evolutionAPI.sendTextMessage(numero, texto);
            
            return resultado;

        } catch (error) {
            console.error('Erro no envio de texto:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Envia mensagem de imagem
     * @param {string} numero - Número formatado
     * @param {Object} imagem - Dados da imagem
     * @returns {Promise<Object>} Resultado do envio
     */
    static async enviarImagem(numero, imagem) {
        try {
            console.log(`🖼️ Enviando imagem para: ${numero}`);
            
            // Preparar payload da imagem baseado no tipo
            let imagemPayload;
            
            if (imagem.url) {
                imagemPayload = {
                    image: imagem.url,
                    caption: imagem.legenda || ''
                };
            } else if (imagem.base64) {
                imagemPayload = {
                    image: imagem.base64,
                    caption: imagem.legenda || ''
                };
            } else {
                throw new Error('Formato de imagem não suportado');
            }

            // Usar método específico da Evolution API para imagens
            const resultado = await WhatsAppMessageService.enviarImagemEvolution(numero, imagemPayload);
            
            return resultado;

        } catch (error) {
            console.error('Erro no envio de imagem:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Envia imagem com legenda (texto)
     * @param {string} numero - Número formatado
     * @param {Object} imagem - Dados da imagem
     * @param {string} texto - Texto/legenda
     * @returns {Promise<Object>} Resultado do envio
     */
    static async enviarImagemComLegenda(numero, imagem, texto) {
        try {
            console.log(`🖼️📝 Enviando imagem com legenda para: ${numero}`);
            
            // Adicionar texto como legenda da imagem
            const imagemComLegenda = {
                ...imagem,
                legenda: texto
            };
            
            return await WhatsAppMessageService.enviarImagem(numero, imagemComLegenda);

        } catch (error) {
            console.error('Erro no envio de imagem com legenda:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Método específico para envio de imagem via Evolution API
     * @param {string} numero - Número formatado
     * @param {Object} imagemPayload - Payload da imagem
     * @returns {Promise<Object>} Resultado do envio
     */
    static async enviarImagemEvolution(numero, imagemPayload) {
        try {
            // Utilizar método específico da Evolution API para imagens
            // Adaptando para o padrão da Evolution API baseado no evolutionAPI existente
            
            const payload = {
                number: numero,
                mediaMessage: {
                    mediatype: 'image',
                    ...imagemPayload
                }
            };

            // Simular envio baseado na estrutura do evolutionAPI existente
            // TODO: Ajustar conforme método real da Evolution API para imagens
            const response = await evolutionAPI.evolutionAPI.post(
                `/message/sendMedia/${process.env.EVOLUTION_INSTANCE_NAME}`,
                payload
            );

            return {
                success: true,
                data: response.data,
                error: null
            };

        } catch (error) {
            console.error('Erro na Evolution API para imagem:', error);
            return {
                success: false,
                data: null,
                error: error.response?.data?.message || error.message
            };
        }
    }

    /**
     * Formatar número para padrão Evolution API (brasileiro)
     * @param {string} numero - Número a ser formatado
     * @returns {string|null} Número formatado ou null se inválido
     */
    static formatarNumero(numero) {
        try {
            // Remove caracteres não numéricos
            let numeroLimpo = numero.replace(/\D/g, '');
            
            // Validação básica de tamanho
            if (numeroLimpo.length < 10 || numeroLimpo.length > 13) {
                return null;
            }
            
            // Adiciona código do país se não existir
            if (!numeroLimpo.startsWith('55')) {
                numeroLimpo = '55' + numeroLimpo;
            }
            
            // Adiciona 9 no celular se necessário (padrão brasileiro)
            if (numeroLimpo.length === 12 && numeroLimpo.substring(4, 5) !== '9') {
                numeroLimpo = numeroLimpo.substring(0, 4) + '9' + numeroLimpo.substring(4);
            }
            
            // Validação final
            if (numeroLimpo.length !== 13) {
                return null;
            }
            
            return numeroLimpo;

        } catch (error) {
            console.error('Erro na formatação do número:', error);
            return null;
        }
    }

    /**
     * Determina o tipo de mensagem baseado no conteúdo
     * @param {Object} mensagem - Objeto da mensagem
     * @returns {string} Tipo da mensagem
     */
    static obterTipoMensagem(mensagem) {
        if (mensagem.texto && mensagem.imagem) {
            return 'imagem_com_legenda';
        } else if (mensagem.imagem) {
            return 'imagem';
        } else if (mensagem.texto) {
            return 'texto';
        } else {
            return 'desconhecido';
        }
    }

    /**
     * Valida se o serviço WhatsApp está disponível
     * @returns {Promise<boolean>} Status do serviço
     */
    static async verificarDisponibilidade() {
        try {
            const status = await evolutionAPI.getInstanceStatus();
            
            if (status.success && status.data?.state === 'open') {
                console.log('✅ Serviço WhatsApp disponível');
                return true;
            } else {
                console.warn('⚠️ Serviço WhatsApp indisponível ou desconectado');
                return false;
            }
            
        } catch (error) {
            console.error('❌ Erro ao verificar disponibilidade WhatsApp:', error);
            return false;
        }
    }

    /**
     * Obtém estatísticas de envio (placeholder para futuras implementações)
     * @returns {Object} Estatísticas básicas
     */
    static obterEstatisticas() {
        return {
            servicoAtivo: true,
            tiposSuportados: ['texto', 'imagem', 'imagem_com_legenda'],
            formatosImagem: ['url', 'base64'],
            limiteTamanhoTexto: 4096,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = WhatsAppMessageService;