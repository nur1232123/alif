FROM node:22-alpine
# ffmpeg переводит запись голоса в формат для распознавания
RUN apk add --no-cache ffmpeg
ENV NODE_ENV=production FFMPEG_PATH=ffmpeg
WORKDIR /app
COPY server.mjs .
USER node
# Облако само задаёт порт через PORT, локально 8787
EXPOSE 8787
CMD ["node", "server.mjs"]
