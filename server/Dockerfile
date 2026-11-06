FROM node:22-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY server.mjs .
USER node
EXPOSE 8787
CMD ["node", "server.mjs"]
