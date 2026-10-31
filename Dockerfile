# 正和老师 bot 镜像（常驻 Node 进程，非 Cloudflare Pages）
FROM node:22-slim

WORKDIR /app

# 仅复制依赖清单先装，利用层缓存
COPY package.json ./
RUN npm install --no-audit --no-fund

# 复制源码（bot/ 为必需；其余文件无害）
COPY . .

# 常驻运行；环境变量（LIVEKIT_* / RPC_URL 等）在运行时通过 -e 或编排平台注入
CMD ["npm", "run", "bot"]
