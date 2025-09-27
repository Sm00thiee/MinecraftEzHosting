FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
COPY tsconfig*.json ./

RUN npm install

COPY . .

RUN npm run build:server

EXPOSE 3001

CMD [ "node", "dist/api/server.js" ]
