--[[
  Pure-Lua 5.1 HMAC-SHA256 (Lightroom Classic has no native crypto / bitops).

  Produces the same customer-facing reference the LAN origin + shop Worker use:
    gmpRef(id, secret) == 'GMP-' .. HMAC_SHA256(secret, id) hex, first 7, upper.
  Verified byte-identical to Node's createHmac('sha256', secret).update(id).
]]

local FLOOR = math.floor

-- Byte-wise XOR / AND tables (built once at load).
local xb, ab = {}, {}
for i = 0, 255 do
  xb[i] = {}; ab[i] = {}
  for j = 0, 255 do
    local a, b, p, x, an = i, j, 1, 0, 0
    for _ = 1, 8 do
      local ai, bi = a % 2, b % 2
      if ai ~= bi then x = x + p end
      if ai == 1 and bi == 1 then an = an + p end
      a = (a - ai) / 2; b = (b - bi) / 2; p = p * 2
    end
    xb[i][j] = x; ab[i][j] = an
  end
end

local function split(n)
  local b0 = n % 256; n = FLOOR(n / 256)
  local b1 = n % 256; n = FLOOR(n / 256)
  local b2 = n % 256; local b3 = FLOOR(n / 256) % 256
  return b0, b1, b2, b3
end
local function bxor(a, b)
  local a0, a1, a2, a3 = split(a); local b0, b1, b2, b3 = split(b)
  return xb[a0][b0] + xb[a1][b1] * 256 + xb[a2][b2] * 65536 + xb[a3][b3] * 16777216
end
local function band(a, b)
  local a0, a1, a2, a3 = split(a); local b0, b1, b2, b3 = split(b)
  return ab[a0][b0] + ab[a1][b1] * 256 + ab[a2][b2] * 65536 + ab[a3][b3] * 16777216
end
local function bnot(a) return 4294967295 - a end
local function rrot(n, b) local lo = n % (2 ^ b); return FLOOR(n / (2 ^ b)) + lo * (2 ^ (32 - b)) end
local function shr(n, b) return FLOOR(n / (2 ^ b)) end
local function add32(...)
  local s = 0
  for _, v in ipairs({ ... }) do s = s + v end
  return s % 4294967296
end

local K = {
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
}

local function sha256_bytes(msg)
  local h = { 0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19 }
  local len = #msg
  msg = msg .. string.char(128)
  while #msg % 64 ~= 56 do msg = msg .. string.char(0) end
  local bitlen = len * 8
  local lenbytes = ''
  for i = 7, 0, -1 do lenbytes = lenbytes .. string.char(FLOOR(bitlen / (2 ^ (8 * i))) % 256) end
  msg = msg .. lenbytes

  for chunk = 1, #msg, 64 do
    local w = {}
    for i = 0, 15 do
      local a, b, c, d = msg:byte(chunk + i * 4, chunk + i * 4 + 3)
      w[i] = a * 16777216 + b * 65536 + c * 256 + d
    end
    for i = 16, 63 do
      local s0 = bxor(bxor(rrot(w[i-15], 7), rrot(w[i-15], 18)), shr(w[i-15], 3))
      local s1 = bxor(bxor(rrot(w[i-2], 17), rrot(w[i-2], 19)), shr(w[i-2], 10))
      w[i] = add32(w[i-16], s0, w[i-7], s1)
    end
    local a,b,c,d,e,f,g,hh = h[1],h[2],h[3],h[4],h[5],h[6],h[7],h[8]
    for i = 0, 63 do
      local S1 = bxor(bxor(rrot(e, 6), rrot(e, 11)), rrot(e, 25))
      local ch = bxor(band(e, f), band(bnot(e), g))
      local t1 = add32(hh, S1, ch, K[i+1], w[i])
      local S0 = bxor(bxor(rrot(a, 2), rrot(a, 13)), rrot(a, 22))
      local maj = bxor(bxor(band(a, b), band(a, c)), band(b, c))
      local t2 = add32(S0, maj)
      hh=g; g=f; f=e; e=add32(d, t1); d=c; c=b; b=a; a=add32(t1, t2)
    end
    h[1]=add32(h[1],a); h[2]=add32(h[2],b); h[3]=add32(h[3],c); h[4]=add32(h[4],d)
    h[5]=add32(h[5],e); h[6]=add32(h[6],f); h[7]=add32(h[7],g); h[8]=add32(h[8],hh)
  end

  local out = ''
  for i = 1, 8 do
    for j = 3, 0, -1 do out = out .. string.char(FLOOR(h[i] / (2 ^ (8 * j))) % 256) end
  end
  return out
end

local function hmac_sha256(key, msg)
  if #key > 64 then key = sha256_bytes(key) end
  key = key .. string.rep('\0', 64 - #key)
  local ipad, opad = '', ''
  for i = 1, 64 do
    local kb = key:byte(i)
    ipad = ipad .. string.char(xb[kb][0x36])
    opad = opad .. string.char(xb[kb][0x5c])
  end
  return sha256_bytes(opad .. sha256_bytes(ipad .. msg))
end

local function tohex(s)
  return (s:gsub('.', function(c) return string.format('%02x', c:byte()) end))
end

local M = {}

--- Customer-facing photo reference, matching the origin/Worker.
--- Empty secret falls back to 'dev' (the origin's dev default).
function M.gmpRef(id, secret)
  local key = (secret and secret ~= '') and secret or 'dev'
  return 'GMP-' .. tohex(hmac_sha256(key, id)):sub(1, 7):upper()
end

return M
