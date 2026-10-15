# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
# cache mount (BuildKit) : แคช npm อยู่นอก layer → lockfile เปลี่ยนก็ไม่ต้องโหลดแพ็กเกจเดิมซ้ำ ; timeout สั้น + retry = สะดุดแล้วลองใหม่เร็ว (ค่าเริ่มต้นของ npm รอ 300 วินาทีต่อครั้ง)
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --fetch-timeout=60000 --fetch-retries=5 --fetch-retry-mintimeout=2000
COPY . .
RUN npx ng build --configuration production

# ---------- serve ----------
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Angular 17+ (application builder) เขียนผลไว้ที่ dist/<project>/browser
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80
