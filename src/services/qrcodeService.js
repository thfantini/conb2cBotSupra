const evolutionAPI = require('../config/evolution');

/**
 * Serviço para gerenciar QR Code e conexão WhatsApp
 */
class QRCodeService {

    /**
     * Obtém QR Code para conexão da instância
     * @returns {Promise} QR Code em base64
     */
    static async obterQRCode() {
        try {
            console.log('📱 Solicitando QR Code da instância...');
            
            const response = await evolutionAPI.evolutionAPI.get(
                `/instance/qrcode/${process.env.EVOLUTION_INSTANCE_NAME}`
            );

            if (response.data && response.data.qrcode) {
                console.log('✅ QR Code obtido com sucesso');
                return {
                    success: true,
                    data: {
                        qrcode: response.data.qrcode,
                        timestamp: new Date().toISOString(),
                        instanceName: process.env.EVOLUTION_INSTANCE_NAME
                    },
                    error: null
                };
            } else {
                console.log('⚠️ QR Code não disponível');
                return {
                    success: false,
                    data: null,
                    error: 'QR Code não disponível'
                };
            }

        } catch (error) {
            console.error('❌ Erro ao obter QR Code:', error.response?.data || error.message);
            return {
                success: false,
                data: null,
                error: error.response?.data?.message || error.message
            };
        }
    }

    /**
     * Verifica status detalhado da conexão
     * @returns {Promise} Status da conexão
     */
    static async verificarStatusConexao() {
        try {
            console.log('🔍 Verificando status da conexão...');
            
            const response = await evolutionAPI.evolutionAPI.get(
                `/instance/connectionState/${process.env.EVOLUTION_INSTANCE_NAME}`
            );

            const status = response.data;
            console.log(`📊 Status da conexão: ${status.state}`);

            return {
                success: true,
                data: {
                    state: status.state,
                    instance: status.instance,
                    timestamp: new Date().toISOString(),
                    connected: status.state === 'open'
                },
                error: null
            };

        } catch (error) {
            console.error('❌ Erro ao verificar status:', error.response?.data || error.message);
            return {
                success: false,
                data: null,
                error: error.response?.data?.message || error.message
            };
        }
    }

    /**
     * Reinicia a instância para novo QR Code
     * @returns {Promise} Resultado da reinicialização
     */
    static async reiniciarInstancia() {
        try {
            console.log('🔄 Reiniciando instância...');
            
            const response = await evolutionAPI.evolutionAPI.post(
                `/instance/restart/${process.env.EVOLUTION_INSTANCE_NAME}`
            );

            console.log('✅ Instância reiniciada com sucesso');
            return {
                success: true,
                data: {
                    message: 'Instância reiniciada',
                    instance: process.env.EVOLUTION_INSTANCE_NAME,
                    timestamp: new Date().toISOString()
                },
                error: null
            };

        } catch (error) {
            console.error('❌ Erro ao reiniciar instância:', error.response?.data || error.message);
            return {
                success: false,
                data: null,
                error: error.response?.data?.message || error.message
            };
        }
    }

    /**
     * Desconecta a instância
     * @returns {Promise} Resultado da desconexão
     */
    static async desconectarInstancia() {
        try {
            console.log('🔌 Desconectando instância...');
            
            const response = await evolutionAPI.evolutionAPI.post(
                `/instance/disconnect/${process.env.EVOLUTION_INSTANCE_NAME}`
            );

            console.log('✅ Instância desconectada com sucesso');
            return {
                success: true,
                data: {
                    message: 'Instância desconectada',
                    instance: process.env.EVOLUTION_INSTANCE_NAME,
                    timestamp: new Date().toISOString()
                },
                error: null
            };

        } catch (error) {
            console.error('❌ Erro ao desconectar instância:', error.response?.data || error.message);
            return {
                success: false,
                data: null,
                error: error.response?.data?.message || error.message
            };
        }
    }

    /**
     * Obtém informações completas da instância
     * @returns {Promise} Informações da instância
     */
    static async obterInformacoesInstancia() {
        try {
            console.log('📋 Obtendo informações da instância...');
            
            const response = await evolutionAPI.evolutionAPI.get(
                `/instance/fetchInstances/${process.env.EVOLUTION_INSTANCE_NAME}`
            );

            const info = response.data;
            console.log('✅ Informações obtidas com sucesso');

            return {
                success: true,
                data: {
                    instanceName: info.instanceName,
                    status: info.status,
                    serverUrl: info.serverUrl,
                    webhookUrl: info.webhook?.url,
                    webhookEvents: info.webhook?.events,
                    timestamp: new Date().toISOString()
                },
                error: null
            };

        } catch (error) {
            console.error('❌ Erro ao obter informações:', error.response?.data || error.message);
            return {
                success: false,
                data: null,
                error: error.response?.data?.message || error.message
            };
        }
    }

    /**
     * Monitora conexão até estabelecer ou falhar
     * @param {number} maxTentativas - Máximo de tentativas
     * @param {number} intervalo - Intervalo entre verificações (ms)
     * @returns {Promise} Status final da conexão
     */
    static async monitorarConexao(maxTentativas = 30, intervalo = 2000) {
        try {
            console.log(`🕐 Monitorando conexão (${maxTentativas} tentativas)...`);
            
            for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
                const status = await this.verificarStatusConexao();
                
                if (status.success && status.data.connected) {
                    console.log(`✅ Conexão estabelecida na tentativa ${tentativa}`);
                    return {
                        success: true,
                        data: {
                            connected: true,
                            tentativas: tentativa,
                            status: status.data,
                            timestamp: new Date().toISOString()
                        },
                        error: null
                    };
                }

                console.log(`⏳ Tentativa ${tentativa}/${maxTentativas} - Status: ${status.data?.state || 'unknown'}`);
                
                if (tentativa < maxTentativas) {
                    await new Promise(resolve => setTimeout(resolve, intervalo));
                }
            }

            console.log('⚠️ Tempo limite para conexão excedido');
            return {
                success: false,
                data: null,
                error: `Conexão não estabelecida após ${maxTentativas} tentativas`
            };

        } catch (error) {
            console.error('❌ Erro no monitoramento:', error.message);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }

    /**
     * Processo completo de conexão com QR Code
     * @returns {Promise} Resultado do processo de conexão
     */
    static async iniciarProcessoConexao() {
        try {
            console.log('🚀 Iniciando processo de conexão...');
            
            // 1. Verifica status atual
            const statusAtual = await this.verificarStatusConexao();
            
            if (statusAtual.success && statusAtual.data.connected) {
                console.log('✅ Instância já conectada');
                return {
                    success: true,
                    data: {
                        alreadyConnected: true,
                        status: statusAtual.data,
                        timestamp: new Date().toISOString()
                    },
                    error: null
                };
            }

            // 2. Reinicia instância para gerar novo QR
            const reinicio = await this.reiniciarInstancia();
            if (!reinicio.success) {
                return reinicio;
            }

            // 3. Aguarda um momento para estabilizar
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 4. Obtém QR Code
            const qrCode = await this.obterQRCode();
            if (!qrCode.success) {
                return qrCode;
            }

            console.log('✅ Processo de conexão iniciado com sucesso');
            return {
                success: true,
                data: {
                    qrcode: qrCode.data.qrcode,
                    instanceName: process.env.EVOLUTION_INSTANCE_NAME,
                    message: 'Escaneie o QR Code com seu WhatsApp',
                    timestamp: new Date().toISOString()
                },
                error: null
            };

        } catch (error) {
            console.error('❌ Erro no processo de conexão:', error.message);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
}

module.exports = QRCodeService;