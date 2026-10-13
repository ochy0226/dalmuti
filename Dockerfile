# 달무티 배포용 Dockerfile (서버 + 화면을 한 번에 빌드해서 하나의 주소로 서비스)
#
# 1) 화면(React)을 빌드  2) 서버(TypeScript)를 컴파일  3) 둘을 합쳐 실행 이미지를 만든다.
# 서버가 client/build 를 같은 주소로 서비스하므로 주소가 하나면 된다.

# ----- 1) 화면 빌드 -----
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
ENV CI=false \
    GENERATE_SOURCEMAP=false \
    DISABLE_ESLINT_PLUGIN=true \
    NODE_OPTIONS=--max-old-space-size=1536
RUN npm run build

# ----- 2) 서버 컴파일 -----
FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# ----- 3) 실행 이미지 -----
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=client-build /app/client/build ./client/build

WORKDIR /app/server
# Render 등은 PORT 환경 변수로 포트를 알려준다 (서버가 process.env.PORT 를 사용)
EXPOSE 3000
CMD ["node", "dist/server.js"]
