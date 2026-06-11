# Usamos la imagen oficial de Playwright basada en Ubuntu Jammy que ya contiene Chromium
# y todas las dependencias nativas del sistema operativo (libnss3, libatk, etc.)
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

# Directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiamos los manifiestos de dependencias
COPY package*.json ./

# Instalamos las dependencias del proyecto (incluye playwright, p-limit, node-cron, etc.)
RUN npm ci

# Copiamos el resto de los archivos del crawler
COPY . .

# Comando de arranque (inicia el cron que luego dispara el crawler)
CMD ["npm", "start"]
