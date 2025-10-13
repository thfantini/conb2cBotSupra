#!/bin/sh
# script-startup.sh - Script robusto de inicialização para o container

set -e  # Para na primeira falha

echo "🚀 === INICIANDO FOXBOT ===" 
echo "📅 Data/Hora: $(date)"
echo "🏗️ Node Version: $(node --version)"
echo "📦 NPM Version: $(npm --version)"

# Informações do ambiente
echo ""
echo "🔧 === CONFIGURAÇÕES ==="
echo "Bot: ${BOT_NAME:-'Não definido'}"
echo "Env: ${NODE_ENV:-'development'}"
echo "Port: ${PORT:-3000}"
echo "DB Host: ${DB_HOST:-'Não definido'}"
echo "Evolution API: ${EVOLUTION_API_URL:-'Não definido'}"
echo "SMTP: ${SMTP_HOST:-'Não definido'}:${SMTP_PORT:-587}"
echo "SMTP Secure: ${SMTP_SECURE:-false}"
echo "Skip SMTP Test: ${SKIP_SMTP_TEST:-false}"

# Verificar conectividade de rede
echo ""
echo "🌐 === TESTANDO CONECTIVIDADE ==="

# Teste DNS
echo "🔍 Testando DNS..."
if nslookup google.com > /dev/null 2>&1; then
    echo "✅ DNS OK"
else
    echo "❌ DNS FALHOU"
    exit 1
fi

# Teste conectividade com DB
echo "🗄️ Testando conectividade com banco..."
if [ -n "$DB_HOST" ]; then
    if nc -z "$DB_HOST" "${DB_PORT:-3306}" 2>/dev/null; then
        echo "✅ Banco acessível: $DB_HOST:${DB_PORT:-3306}"
    else
        echo "⚠️ Banco não acessível: $DB_HOST:${DB_PORT:-3306}"
        echo "   Continuando mesmo assim..."
    fi
else
    echo "⚠️ DB_HOST não definido"
fi

# Teste conectividade com Evolution API
echo "📱 Testando conectividade com Evolution API..."
if [ -n "$EVOLUTION_API_URL" ]; then
    EVOLUTION_HOST=$(echo "$EVOLUTION_API_URL" | sed 's|https\?://||' | sed 's|/.*||')
    if nc -z "$EVOLUTION_HOST" 443 2>/dev/null; then
        echo "✅ Evolution API acessível: $EVOLUTION_HOST"
    else
        echo "⚠️ Evolution API não acessível: $EVOLUTION_HOST"
        echo "   Continuando mesmo assim..."
    fi
else
    echo "⚠️ EVOLUTION_API_URL não definido"
fi

# Teste conectividade com SMTP
echo "📧 Testando conectividade com SMTP..."
if [ -n "$SMTP_HOST" ] && [ "$SKIP_SMTP_TEST" != "true" ]; then
    if nc -z "$SMTP_HOST" "${SMTP_PORT:-587}" 2>/dev/null; then
        echo "✅ SMTP acessível: $SMTP_HOST:${SMTP_PORT:-587}"
    else
        echo "⚠️ SMTP não acessível: $SMTP_HOST:${SMTP_PORT:-587}"
        echo "   Definindo SKIP_SMTP_TEST=true para continuar..."
        export SKIP_SMTP_TEST=true
    fi
else
    echo "⏭️ Teste SMTP ignorado"
fi

# Instalação de dependências
echo ""
echo "📦 === INSTALANDO DEPENDÊNCIAS ==="

# Verificar se package.json existe
if [ ! -f "package.json" ]; then
    echo "❌ package.json não encontrado!"
    exit 1
fi

echo "📋 Instalando pacotes npm..."
if npm install --only=production --no-audit --no-fund; then
    echo "✅ Dependências instaladas com sucesso"
else
    echo "❌ Falha na instalação de dependências"
    exit 1
fi

# Verificar estrutura de diretórios
echo ""
echo "📁 === VERIFICANDO ESTRUTURA ==="

REQUIRED_DIRS=("src" "logs")
for dir in "${REQUIRED_DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
        echo "📁 Criando diretório: $dir"
        mkdir -p "$dir"
    else
        echo "✅ Diretório existe: $dir"
    fi
done

REQUIRED_FILES=("src/index.js")
for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ Arquivo existe: $file"
    else
        echo "❌ Arquivo não encontrado: $file"
        exit 1
    fi
done

# Verificar permissões
echo ""
echo "🔐 === VERIFICANDO PERMISSÕES ==="
if [ -w "logs" ]; then
    echo "✅ Diretório logs tem permissão de escrita"
else
    echo "⚠️ Diretório logs sem permissão de escrita"
    chmod 755 logs
fi

# Criar arquivo de teste de log
echo "$(date): Container iniciado" > logs/startup.log
if [ $? -eq 0 ]; then
    echo "✅ Log de inicialização criado"
else
    echo "⚠️ Não foi possível criar log de inicialização"
fi

# Inicialização da aplicação
echo ""
echo "🎯 === INICIANDO APLICAÇÃO ==="
echo "⏰ $(date): Executando node src/index.js"

# Usar exec para substituir o processo shell
exec node src/index.js