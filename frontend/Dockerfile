# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
# cache mount (BuildKit) : แคช npm อยู่นอก layer → lockfile เปลี่ยนก็ไม่ต้องโหลดแพ็กเกจเดิมซ้ำ ; retry 5 ครั้ง + maxsockets=4 (เน็ตบางที่รีเซ็ตการเชื่อมต่อเมื่อเปิดพร้อมกันเยอะ) ; ห้ามตั้ง --fetch-timeout สั้น : 60 วินาทีทำให้เกิด EIDLETIMEOUT ซึ่งไม่ถูก retry
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=2000 --maxsockets=4
COPY . .
RUN npx ng build --configuration production

# ---------- serve ----------
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Angular 17+ (application builder) เขียนผลไว้ที่ dist/<project>/browser
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80
