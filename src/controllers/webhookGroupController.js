const database = require('../config/database');

/**
 * Controller para gerenciar webhooks de grupos da API Evolution
 * Micro-serviço independente para processamento de mensagens de grupos específicos
 */
class WebhookGroupController {

    /**
     * Recebe e processa mensagens de grupos do webhook
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     */
    static async receberMensagemGrupo(req, res) {
        try {
            const webhookData = req.body;
            
            // Log do webhook recebido (apenas em desenvolvimento)
            if (process.env.NODE_ENV === 'development') {
                console.log('📨 Webhook Grupo recebido:', JSON.stringify(webhookData, null, 2));
            }

            // Valida estrutura básica do webhook
            if (!webhookData || !webhookData.data) {
                console.log('⚠️ Webhook Grupo inválido: estrutura incorreta');
                return res.status(400).json({
                    success: false,
                    error: 'Estrutura de webhook inválida'
                });
            }

            // Verifica se é evento de mensagem
            if (webhookData.event !== 'messages.upsert') {
                console.log(`ℹ️ Evento Grupo ignorado: ${webhookData.event}`);
                return res.status(200).json({
                    success: true,
                    message: 'Evento não processado'
                });
            }

            // Processa cada mensagem do webhook
            const mensagens = webhookData.data;
            const resultados = [];

            for (const mensagem of mensagens) {
                try {
                    // Valida mensagem individual para grupos
                    const validacao = WebhookGroupController.validarMensagemGrupo(mensagem);
                    
                    if (!validacao.valida) {
                        console.log(`⚠️ Mensagem de grupo ignorada: ${validacao.motivo}`);
                        resultados.push({
                            messageId: mensagem.key?.id || 'unknown',
                            status: 'ignorada',
                            motivo: validacao.motivo
                        });
                        continue;
                    }

                    // Processa mensagem válida de grupo
                    console.log(`📱 Processando mensagem de grupo: ${mensagem.key.remoteJid}`);
                    const resultado = await WebhookGroupController.processarMensagemGrupo(mensagem);
                    
                    resultados.push({
                        messageId: mensagem.key.id,
                        status: resultado.success ? 'processada' : 'erro',
                        resultado: resultado
                    });

                    // Log do resultado
                    if (resultado.success) {
                        console.log(`✅ Mensagem de grupo processada: ${mensagem.key.id}`);
                    } else {
                        console.error(`❌ Erro ao processar mensagem de grupo: ${resultado.error}`);
                    }

                } catch (error) {
                    console.error('❌ Erro ao processar mensagem individual de grupo:', error);
                    resultados.push({
                        messageId: mensagem.key?.id || 'unknown',
                        status: 'erro',
                        error: error.message
                    });
                }
            }

            // Resposta para Evolution API
            return res.status(200).json({
                success: true,
                message: 'Webhook de grupo processado',
                resultados: resultados,
                total: mensagens.length,
                processadas: resultados.filter(r => r.status === 'processada').length
            });

        } catch (error) {
            console.error('❌ Erro no webhook group controller:', error);
            return res.status(500).json({
                success: false,
                error: 'Erro interno do servidor',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Valida se a mensagem de grupo deve ser processada
     * @param {Object} mensagem - Dados da mensagem
     * @returns {Object} Resultado da validação
     */
    static validarMensagemGrupo(mensagem) {
        try {
            // Verifica estrutura básica
            if (!mensagem || !mensagem.key || !mensagem.message) {
                return {
                    valida: false,
                    motivo: 'Estrutura de mensagem inválida'
                };
            }

            const { key, message, messageTimestamp } = mensagem;

            // Ignora mensagens do próprio bot
            if (key.fromMe) {
                return {
                    valida: false,
                    motivo: 'Mensagem enviada pelo bot'
                };
            }

            // Processa APENAS mensagens de grupos
            if (!key.remoteJid.includes('@g.us')) {
                return {
                    valida: false,
                    motivo: 'Não é mensagem de grupo'
                };
            }

            // Ignora status do WhatsApp
            if (key.remoteJid === 'status@broadcast') {
                return {
                    valida: false,
                    motivo: 'Status do WhatsApp'
                };
            }

            // Verifica se há conteúdo válido (texto, imagem ou documento)
            const hasValidContent = message.conversation || 
                                   message.extendedTextMessage?.text || 
                                   message.imageMessage?.caption ||
                                   message.documentMessage?.caption ||
                                   message.imageMessage ||
                                   message.documentMessage;

            if (!hasValidContent) {
                return {
                    valida: false,
                    motivo: 'Mensagem sem conteúdo válido'
                };
            }

            // Ignora mensagens muito antigas (mais de 5 minutos)
            if (messageTimestamp) {
                const agora = Date.now() / 1000;
                const tempoMensagem = parseInt(messageTimestamp);
                const diferenca = agora - tempoMensagem;
                
                if (diferenca > 300) { // 5 minutos
                    return {
                        valida: false,
                        motivo: 'Mensagem muito antiga'
                    };
                }
            }

            return {
                valida: true,
                motivo: 'Mensagem válida'
            };

        } catch (error) {
            console.error('Erro na validação da mensagem de grupo:', error);
            return {
                valida: false,
                motivo: 'Erro na validação'
            };
        }
    }

    /**
     * Processa mensagem de grupo válida
     * @param {Object} messageData - Dados da mensagem
     * @returns {Promise} Resultado do processamento
     */
    static async processarMensagemGrupo(messageData) {
        try {
            const { key, message } = messageData;
            const chatId = key.remoteJid.replace('@g.us', '');
            const messageId = key.id;
            const userNumber = key.participant?.replace('@s.whatsapp.net', '') || 'unknown';
            const userName = messageData.pushName || 'Usuario';

            // REGRA 1: Verifica se o grupo existe na view vw_sup_grupos
            const grupoValidacao = await WebhookGroupController.validarGrupo(chatId);
            if (!grupoValidacao.valido) {
                return {
                    success: false,
                    error: 'Grupo não autorizado',
                    motivo: grupoValidacao.motivo
                };
            }

            const grupoInfo = grupoValidacao.dados;

            // REGRA 2: Busca tabela de destino baseada no tipo
            const tabelaDestino = await WebhookGroupController.buscarTabelaDestino(grupoInfo.tipo);
            if (!tabelaDestino.success) {
                return {
                    success: false,
                    error: 'Tabela de destino não encontrada',
                    motivo: tabelaDestino.error
                };
            }

            // Processa conteúdo da mensagem baseado no tipo
            const conteudoProcessado = await WebhookGroupController.processarConteudoMensagem(message);
            
            // Monta dados para inserção
            const dadosInsercao = {
                tipo: grupoInfo.tipo,
                cliente: grupoInfo.cliente,
                chatId: messageId,
                userNumber: userNumber,
                userName: userName,
                titulo: conteudoProcessado.titulo,
                mensagem: conteudoProcessado.mensagem,
                imagem: conteudoProcessado.imagem,
                arquivo: conteudoProcessado.arquivo,
                dataCad: new Date().toISOString().slice(0, 19).replace('T', ' ')
            };

            // Insere na tabela de destino
            const resultadoInsercao = await WebhookGroupController.inserirNaTabelaDestino(
                tabelaDestino.tabela, 
                dadosInsercao
            );

            if (resultadoInsercao.success) {
                console.log(`✅ Mensagem de grupo salva na tabela: ${tabelaDestino.tabela}`);
                return {
                    success: true,
                    data: 'Mensagem de grupo processada com sucesso',
                    tabela: tabelaDestino.tabela,
                    registro_id: resultadoInsercao.insertId
                };
            } else {
                return {
                    success: false,
                    error: 'Erro ao salvar mensagem',
                    details: resultadoInsercao.error
                };
            }

        } catch (error) {
            console.error('Erro ao processar mensagem de grupo:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Valida se o grupo está autorizado
     * @param {string} chatId - ID do grupo
     * @returns {Promise} Resultado da validação
     */
    static async validarGrupo(chatId) {
        try {
            const query = `
                SELECT codigo, cliente, tipo 
                FROM vw_sup_grupos 
                WHERE codigo = ? AND status = 1
                LIMIT 1
            `;
            
            const resultado = await database.executeQuery(query, [chatId]);
            
            if (resultado.success && resultado.data.length > 0) {
                return {
                    valido: true,
                    dados: resultado.data[0],
                    motivo: 'Grupo autorizado'
                };
            } else {
                return {
                    valido: false,
                    dados: null,
                    motivo: 'Grupo não encontrado ou inativo'
                };
            }
        } catch (error) {
            console.error('Erro ao validar grupo:', error);
            return {
                valido: false,
                dados: null,
                motivo: 'Erro na validação do grupo'
            };
        }
    }

    /**
     * Busca tabela de destino baseada no tipo
     * @param {number} tipo - Tipo do grupo
     * @returns {Promise} Tabela de destino
     */
    static async buscarTabelaDestino(tipo) {
        try {
            const query = `
                SELECT tabela 
                FROM whapi_tabelas 
                WHERE tipo = ?
                LIMIT 1
            `;
            
            const resultado = await database.executeQuery(query, [tipo]);
            
            if (resultado.success && resultado.data.length > 0) {
                return {
                    success: true,
                    tabela: resultado.data[0].tabela,
                    error: null
                };
            } else {
                return {
                    success: false,
                    tabela: null,
                    error: 'Tabela não encontrada para o tipo especificado'
                };
            }
        } catch (error) {
            console.error('Erro ao buscar tabela de destino:', error);
            return {
                success: false,
                tabela: null,
                error: error.message
            };
        }
    }

    /**
     * Processa conteúdo da mensagem baseado no tipo
     * @param {Object} message - Objeto da mensagem
     * @returns {Object} Conteúdo processado
     */
    static async processarConteudoMensagem(message) {
        let textoCompleto = '';
        let imagem = null;
        let arquivo = null;

        // Extrai texto baseado no tipo de mensagem
        if (message.conversation) {
            textoCompleto = message.conversation;
        } else if (message.extendedTextMessage?.text) {
            textoCompleto = message.extendedTextMessage.text;
        } else if (message.imageMessage?.caption) {
            textoCompleto = message.imageMessage.caption;
            // Processa imagem se existir preview em base64
            if (message.imageMessage.jpegThumbnail) {
                imagem = `data:image/jpeg;base64,${message.imageMessage.jpegThumbnail.toString('base64')}`;
            }
        } else if (message.documentMessage?.caption) {
            textoCompleto = message.documentMessage.caption;
            // Processa documento se existir
            if (message.documentMessage.title && message.documentMessage.mimetype) {
                arquivo = {
                    nome: message.documentMessage.title,
                    tipo: message.documentMessage.mimetype,
                    tamanho: message.documentMessage.fileLength || 0
                };
            }
        } else if (message.imageMessage && !message.imageMessage.caption) {
            // Imagem sem caption
            textoCompleto = '[Imagem enviada]';
            if (message.imageMessage.jpegThumbnail) {
                imagem = `data:image/jpeg;base64,${message.imageMessage.jpegThumbnail.toString('base64')}`;
            }
        } else if (message.documentMessage && !message.documentMessage.caption) {
            // Documento sem caption
            textoCompleto = `[Documento: ${message.documentMessage.title || 'arquivo'}]`;
            if (message.documentMessage.title && message.documentMessage.mimetype) {
                arquivo = {
                    nome: message.documentMessage.title,
                    tipo: message.documentMessage.mimetype,
                    tamanho: message.documentMessage.fileLength || 0
                };
            }
        }

        // Extrai título e mensagem
        const { titulo, mensagem } = WebhookGroupController.extrairTituloEMensagem(textoCompleto);

        return {
            titulo: titulo,
            mensagem: mensagem,
            imagem: imagem,
            arquivo: arquivo ? JSON.stringify(arquivo) : null
        };
    }

    /**
     * Extrai título e mensagem do texto
     * @param {string} textoCompleto - Texto completo da mensagem
     * @returns {Object} Título e mensagem separados
     */
    static extrairTituloEMensagem(textoCompleto) {
        if (!textoCompleto || !textoCompleto.trim()) {
            return {
                titulo: '[Sem título]',
                mensagem: '[Mensagem vazia]'
            };
        }

        // Procura por texto em negrito na primeira linha (*TEXTO*)
        const linhas = textoCompleto.split('\n');
        const primeiraLinha = linhas[0] || '';
        
        // Regex para capturar texto entre asteriscos
        const regexTitulo = /^\*(.+?)\*/;
        const matchTitulo = primeiraLinha.match(regexTitulo);
        
        if (matchTitulo) {
            // Encontrou título em negrito
            const titulo = matchTitulo[1].trim();
            // Remove a primeira linha (título) e junta o resto
            const mensagem = linhas.slice(1).join('\n').trim() || '[Sem conteúdo adicional]';
            
            return {
                titulo: titulo,
                mensagem: mensagem
            };
        } else {
            // Não encontrou título em negrito, usa primeira linha como título
            const titulo = primeiraLinha.trim() || '[Sem título]';
            const mensagem = linhas.slice(1).join('\n').trim() || '[Sem conteúdo adicional]';
            
            return {
                titulo: titulo,
                mensagem: mensagem
            };
        }
    }

    /**
     * Insere dados na tabela de destino
     * @param {string} tabela - Nome da tabela
     * @param {Object} dados - Dados para inserção
     * @returns {Promise} Resultado da inserção
     */
    static async inserirNaTabelaDestino(tabela, dados) {
        try {
            const query = `
                INSERT INTO ${tabela} 
                (tipo, cliente, chatId, userNumber, userName, titulo, mensagem, imagem, arquivo, dataCad)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const params = [
                dados.tipo,
                dados.cliente,
                dados.chatId,
                dados.userNumber,
                dados.userName,
                dados.titulo,
                dados.mensagem,
                dados.imagem,
                dados.arquivo,
                dados.dataCad
            ];
            
            const resultado = await database.executeQuery(query, params);
            
            if (resultado.success) {
                return {
                    success: true,
                    insertId: resultado.data.insertId || null,
                    error: null
                };
            } else {
                return {
                    success: false,
                    insertId: null,
                    error: resultado.error
                };
            }
        } catch (error) {
            console.error('Erro ao inserir na tabela de destino:', error);
            return {
                success: false,
                insertId: null,
                error: error.message
            };
        }
    }

    /**
     * Endpoint para verificar status do webhook de grupos
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     */
    static async verificarStatusGrupo(req, res) {
        try {
            return res.status(200).json({
                success: true,
                message: 'Webhook de grupos ativo',
                timestamp: new Date().toISOString(),
                environment: process.env.NODE_ENV || 'development',
                version: require('../../package.json').version,
                service: 'webhook-group-controller'
            });
        } catch (error) {
            console.error('Erro ao verificar status de grupos:', error);
            return res.status(500).json({
                success: false,
                error: 'Erro interno do servidor'
            });
        }
    }

    /**
     * Middleware para log de requisições de grupos
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Function} next - Next function
     */
    static logRequestGroup(req, res, next) {
        const timestamp = new Date().toISOString();
        const ip = req.ip || req.connection.remoteAddress;
        
        console.log(`📊 [${timestamp}] GRUPO ${req.method} ${req.path} - IP: ${ip}`);
        
        // Log detalhado apenas em desenvolvimento
        if (process.env.NODE_ENV === 'development') {
            console.log(`📊 Grupo Headers:`, req.headers);
        }

        return next();
    }
}

module.exports = WebhookGroupController;