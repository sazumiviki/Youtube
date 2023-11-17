FROM node:18

RUN apt-get update && apt-get install -y \
    webp \
    ffmpeg \
    neofetch \
    imagemagick \
  && rm -rf /var/lib/apt/lists/*

RUN npm install yt-search

WORKDIR /app

COPY package.json .

RUN npm install

COPY . .

EXPOSE 7860

CMD ["node", "index.js"]
