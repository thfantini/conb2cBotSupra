const nodemailer = require('nodemailer');

/**
 * Serviço específico para envio de mensagens via Email
 * Módulo independente para o micro-serviço de mensagens
 */
class EmailMessageService {

    /**
     * Configuração do transportador de email
     * @returns {Object} Transporter do nodemailer
     */
    static criarTransporter() {
        try {
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST || 'localhost',
                port: process.env.SMTP_PORT || 587,
                secure: process.env.SMTP_SECURE === 'true', // true para 465, false para outros
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                },
                tls: {
                    rejectUnauthorized: false
                }
            });

            return transporter;

        } catch (error) {
            console.error('❌ Erro ao criar transporter de email:', error);
            throw new Error('Falha na configuração do serviço de email');
        }
    }

    /**
     * Envia mensagem via Email para cliente autorizado
     * @param {Object} dadosEnvio - Dados consolidados para envio
     * @returns {Promise<Object>} Resultado do envio
     */
    static async enviarMensagem(dadosEnvio) {
        try {
            const { cnpj, email, mensagem, timestamp } = dadosEnvio;
            
            console.log(`📧 Iniciando envio Email para: ${email}`);

            // Validar email
            if (!EmailMessageService.validarEmail(email)) {
                console.error(`❌ Email inválido: ${email}`);
                return {
                    success: false,
                    status: 'erro',
                    error: 'Endereço de email inválido',
                    timestamp: new Date().toISOString()
                };
            }

            // Verificar disponibilidade do serviço
            const servicoDisponivel = await EmailMessageService.verificarDisponibilidade();
            if (!servicoDisponivel) {
                console.error(`❌ Serviço de email indisponível`);
                return {
                    success: false,
                    status: 'erro',
                    error: 'Serviço de email temporariamente indisponível',
                    timestamp: new Date().toISOString()
                };
            }

            let resultadoEnvio;

            // Determinar tipo de mensagem e enviar
            if (mensagem.texto && !mensagem.imagem) {
                // Envio de email de texto
                resultadoEnvio = await EmailMessageService.enviarTexto(email, mensagem.texto, cnpj);
            } 
            else if (mensagem.imagem && !mensagem.texto) {
                // Envio de email com imagem
                resultadoEnvio = await EmailMessageService.enviarImagem(email, mensagem.imagem, cnpj);
            }
            else if (mensagem.texto && mensagem.imagem) {
                // Envio de email com texto e imagem
                resultadoEnvio = await EmailMessageService.enviarTextoComImagem(email, mensagem.texto, mensagem.imagem, cnpj);
            }
            else {
                console.error(`❌ Tipo de mensagem não suportado para email`);
                return {
                    success: false,
                    status: 'erro',
                    error: 'Tipo de mensagem não suportado',
                    timestamp: new Date().toISOString()
                };
            }

            // Log do resultado
            if (resultadoEnvio.success) {
                console.log(`✅ Email enviado com sucesso para: ${email}`);
            } else {
                console.error(`❌ Falha no envio de email para: ${email} - ${resultadoEnvio.error}`);
            }

            return {
                success: resultadoEnvio.success,
                status: resultadoEnvio.success ? 'enviado' : 'erro',
                messageId: resultadoEnvio.messageId || null,
                error: resultadoEnvio.error || null,
                email: email,
                tipoMensagem: EmailMessageService.obterTipoMensagem(mensagem),
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Erro no serviço Email:', error);
            return {
                success: false,
                status: 'erro',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Envia email com texto simples
     * @param {string} email - Endereço de email
     * @param {string} texto - Texto da mensagem
     * @param {string} cnpj - CNPJ do cliente para referência
     * @returns {Promise<Object>} Resultado do envio
     */
    static async enviarTexto(email, texto, cnpj) {
        try {
            console.log(`📝 Enviando email texto para: ${email}`);
            
            const transporter = EmailMessageService.criarTransporter();
            
            const assunto = `${process.env.COMPANY_NAME || 'Sistema'} - Nova Mensagem`;
            const corpoEmail = EmailMessageService.construirCorpoTexto(texto, cnpj);
            
            const mailOptions = {
                from: `"${process.env.COMPANY_NAME || 'Sistema'}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
                to: email,
                subject: assunto,
                html: corpoEmail,
                text: EmailMessageService.converterHtmlParaTexto(corpoEmail)
            };

            const resultado = await transporter.sendMail(mailOptions);
            
            return {
                success: true,
                messageId: resultado.messageId,
                error: null
            };

        } catch (error) {
            console.error('Erro no envio de email texto:', error);
            return {
                success: false,
                messageId: null,
                error: error.message
            };
        }
    }

    /**
     * Envia email com imagem
     * @param {string} email - Endereço de email
     * @param {Object} imagem - Dados da imagem
     * @param {string} cnpj - CNPJ do cliente para referência
     * @returns {Promise<Object>} Resultado do envio
     */
    static async enviarImagem(email, imagem, cnpj) {
        try {
            console.log(`🖼️ Enviando email imagem para: ${email}`);
            
            const transporter = EmailMessageService.criarTransporter();
            
            const assunto = `${process.env.COMPANY_NAME || 'Sistema'} - Nova Imagem`;
            const corpoEmail = EmailMessageService.construirCorpoImagem(imagem, cnpj);
            
            const mailOptions = {
                from: `"${process.env.COMPANY_NAME || 'Sistema'}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
                to: email,
                subject: assunto,
                html: corpoEmail,
                text: EmailMessageService.converterHtmlParaTexto(corpoEmail)
            };

            // Anexar imagem se necessário
            await EmailMessageService.adicionarAnexoImagem(mailOptions, imagem);

            const resultado = await transporter.sendMail(mailOptions);
            
            return {
                success: true,
                messageId: resultado.messageId,
                error: null
            };

        } catch (error) {
            console.error('Erro no envio de email imagem:', error);
            return {
                success: false,
                messageId: null,
                error: error.message
            };
        }
    }

    /**
     * Envia email com texto e imagem
     * @param {string} email - Endereço de email
     * @param {string} texto - Texto da mensagem
     * @param {Object} imagem - Dados da imagem
     * @param {string} cnpj - CNPJ do cliente para referência
     * @returns {Promise<Object>} Resultado do envio
     */
    static async enviarTextoComImagem(email, texto, imagem, cnpj) {
        try {
            console.log(`📝🖼️ Enviando email texto+imagem para: ${email}`);
            
            const transporter = EmailMessageService.criarTransporter();
            
            const assunto = `${process.env.COMPANY_NAME || 'Sistema'} - Nova Mensagem`;
            const corpoEmail = EmailMessageService.construirCorpoTextoComImagem(texto, imagem, cnpj);
            
            const mailOptions = {
                from: `"${process.env.COMPANY_NAME || 'Sistema'}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
                to: email,
                subject: assunto,
                html: corpoEmail,
                text: EmailMessageService.converterHtmlParaTexto(corpoEmail)
            };

            // Anexar imagem se necessário
            await EmailMessageService.adicionarAnexoImagem(mailOptions, imagem);

            const resultado = await transporter.sendMail(mailOptions);
            
            return {
                success: true,
                messageId: resultado.messageId,
                error: null
            };

        } catch (error) {
            console.error('Erro no envio de email texto+imagem:', error);
            return {
                success: false,
                messageId: null,
                error: error.message
            };
        }
    }

    /**
     * Constrói corpo do email para texto simples
     * @param {string} texto - Texto da mensagem
     * @param {string} cnpj - CNPJ do cliente
     * @returns {string} HTML do email
     */
    static construirCorpoTexto(texto, cnpj) {
        const agora = new Date().toLocaleString('pt-BR');
        
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Nova Mensagem</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #f4f4f4; }
                    .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
                    .header { background: #25D366; color: white; padding: 15px; text-align: center; border-radius: 5px; margin-bottom: 20px; }
                    .content { background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0; }
                    .footer { font-size: 12px; color: #666; text-align: center; margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h2>${process.env.COMPANY_NAME || 'Sistema'}</h2>
                        <p>Nova mensagem recebida</p>
                    </div>
                    
                    <div class="content">
                        <h3>📱 Mensagem:</h3>
                        <p>${texto.replace(/\n/g, '<br>')}</p>
                    </div>
                    
                    <div class="footer">
                        <p><strong>CNPJ:</strong> ${cnpj}</p>
                        <p><strong>Data/Hora:</strong> ${agora}</p>
                        <p>Esta é uma cópia da mensagem enviada via WhatsApp</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    /**
     * Constrói corpo do email para imagem
     * @param {Object} imagem - Dados da imagem
     * @param {string} cnpj - CNPJ do cliente
     * @returns {string} HTML do email
     */
    static construirCorpoImagem(imagem, cnpj) {
        const agora = new Date().toLocaleString('pt-BR');
        const legenda = imagem.legenda || '';
        
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Nova Imagem</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #f4f4f4; }
                    .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
                    .header { background: #25D366; color: white; padding: 15px; text-align: center; border-radius: 5px; margin-bottom: 20px; }
                    .content { background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0; text-align: center; }
                    .footer { font-size: 12px; color: #666; text-align: center; margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; }
                    .imagem { max-width: 100%; height: auto; border-radius: 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h2>${process.env.COMPANY_NAME || 'Sistema'}</h2>
                        <p>Nova imagem recebida</p>
                    </div>
                    
                    <div class="content">
                        <h3>🖼️ Imagem:</h3>
                        ${imagem.url ? `<img src="${imagem.url}" alt="Imagem enviada" class="imagem">` : '<p>Imagem anexada ao email</p>'}
                        ${legenda ? `<p><strong>Legenda:</strong> ${legenda}</p>` : ''}
                    </div>
                    
                    <div class="footer">
                        <p><strong>CNPJ:</strong> ${cnpj}</p>
                        <p><strong>Data/Hora:</strong> ${agora}</p>
                        <p>Esta é uma cópia da mensagem enviada via WhatsApp</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    /**
     * Constrói corpo do email para texto com imagem
     * @param {string} texto - Texto da mensagem
     * @param {Object} imagem - Dados da imagem
     * @param {string} cnpj - CNPJ do cliente
     * @returns {string} HTML do email
     */
    static construirCorpoTextoComImagem(texto, imagem, cnpj) {
        const agora = new Date().toLocaleString('pt-BR');
        
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Nova Mensagem</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #f4f4f4; }
                    .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
                    .header { background: #25D366; color: white; padding: 15px; text-align: center; border-radius: 5px; margin-bottom: 20px; }
                    .content { background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0; }
                    .footer { font-size: 12px; color: #666; text-align: center; margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; }
                    .imagem { max-width: 100%; height: auto; border-radius: 5px; text-align: center; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h2>${process.env.COMPANY_NAME || 'Sistema'}</h2>
                        <p>Nova mensagem recebida</p>
                    </div>
                    
                    <div class="content">
                        <h3>📱 Mensagem:</h3>
                        <p>${texto.replace(/\n/g, '<br>')}</p>
                        
                        <h3>🖼️ Imagem:</h3>
                        <div class="imagem">
                            ${imagem.url ? `<img src="${imagem.url}" alt="Imagem enviada" style="max-width: 100%; height: auto; border-radius: 5px;">` : '<p>Imagem anexada ao email</p>'}
                        </div>
                    </div>
                    
                    <div class="footer">
                        <p><strong>CNPJ:</strong> ${cnpj}</p>
                        <p><strong>Data/Hora:</strong> ${agora}</p>
                        <p>Esta é uma cópia da mensagem enviada via WhatsApp</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    /**
     * Adiciona anexo de imagem ao email se necessário
     * @param {Object} mailOptions - Opções do email
     * @param {Object} imagem - Dados da imagem
     */
    static async adicionarAnexoImagem(mailOptions, imagem) {
        try {
            if (imagem.base64) {
                // Anexar imagem base64
                mailOptions.attachments = mailOptions.attachments || [];
                mailOptions.attachments.push({
                    filename: 'imagem.png',
                    content: imagem.base64.split(',')[1] || imagem.base64,
                    encoding: 'base64'
                });
            }
            // Para URLs, a imagem já está incluída no HTML
        } catch (error) {
            console.warn('⚠️ Erro ao anexar imagem:', error);
        }
    }

    /**
     * Converte HTML para texto simples
     * @param {string} html - HTML a ser convertido
     * @returns {string} Texto simples
     */
    static converterHtmlParaTexto(html) {
        return html
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .trim();
    }

    /**
     * Valida formato do email
     * @param {string} email - Email a ser validado
     * @returns {boolean} Válido ou não
     */
    static validarEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    }

    /**
     * Determina o tipo de mensagem baseado no conteúdo
     * @param {Object} mensagem - Objeto da mensagem
     * @returns {string} Tipo da mensagem
     */
    static obterTipoMensagem(mensagem) {
        if (mensagem.texto && mensagem.imagem) {
            return 'texto_com_imagem';
        } else if (mensagem.imagem) {
            return 'imagem';
        } else if (mensagem.texto) {
            return 'texto';
        } else {
            return 'desconhecido';
        }
    }

    /**
     * Verifica se o serviço de Email está disponível
     * @returns {Promise<boolean>} Status do serviço
     */
    static async verificarDisponibilidade() {
        try {
            // Validar se as configurações SMTP estão presentes
            if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
                console.warn('⚠️ Configurações SMTP não encontradas');
                return false;
            }

            console.log('🔍 Verificando disponibilidade do serviço Email...');

            const transporter = EmailMessageService.criarTransporter();

            // Verificar com timeout
            const verifyPromise = transporter.verify();
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout na verificação SMTP')), 5000)
            );

            await Promise.race([verifyPromise, timeoutPromise]);

            console.log('✅ Serviço Email disponível');
            return true;

        } catch (error) {
            console.warn(`⚠️ Verificação de Email falhou: ${error.message}`);
            // Não retornar false automaticamente - assumir que está disponível se configs estão presentes
            return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
        }
    }

    /**
     * Obtém estatísticas de envio (placeholder para futuras implementações)
     * @returns {Object} Estatísticas básicas
     */
    static obterEstatisticas() {
        return {
            servicoAtivo: true,
            tiposSuportados: ['texto', 'imagem', 'texto_com_imagem'],
            formatosImagem: ['url', 'base64'],
            templateHtml: true,
            anexosSuportados: true,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = EmailMessageService;