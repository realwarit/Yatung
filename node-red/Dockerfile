FROM nodered/node-red:4.0

# ติดตั้ง palette nodes + library ที่ function node ใช้ ลงใน image
# (ไม่ลงใน /data เพราะ /data เป็น bind mount)
WORKDIR /usr/src/node-red
COPY package.json /tmp/yatung-deps.json
RUN node -e "const d=require('/tmp/yatung-deps.json').dependencies; console.log(Object.entries(d).map(([k,v])=>k+'@'+v).join(' '))" > /tmp/deps.txt \
 && npm install --no-audit --no-fund --omit=dev $(cat /tmp/deps.txt)

# ให้ settings.js ใน /data require โมดูลที่ติดตั้งไว้ข้างบนได้
ENV NODE_PATH=/usr/src/node-red/node_modules
