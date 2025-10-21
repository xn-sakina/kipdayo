/**
 * 简单的加密工具，使用 AES-GCM 加密算法
 * 用于保护敏感的 Cookie 数据
 */

// 固定的盐值（用于密钥派生）
// NOTE: keep the legacy `vidio` name for compatibility
const SALT = "vidio-bilibili-parser-v1-salt-2025";

// 从盐值派生密钥
async function deriveKey(salt: string): Promise<CryptoKey> {
  // 将盐值转换为固定长度的密钥材料
  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode(salt.padEnd(32, '0').slice(0, 32));
  
  // 导入密钥材料
  const key = await crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  
  return key;
}

/**
 * 加密文本
 * @param plaintext 要加密的明文
 * @returns Base64 编码的加密文本（包含 IV）
 */
export async function encrypt(plaintext: string): Promise<string> {
  if (!plaintext) return "";
  
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    
    // 生成随机 IV（初始化向量）
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // 派生密钥
    const key = await deriveKey(SALT);
    
    // 加密数据
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );
    
    // 将 IV 和加密数据组合在一起
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    // 转换为 Base64
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error("加密失败");
  }
}

/**
 * 解密文本
 * @param ciphertext Base64 编码的加密文本
 * @returns 解密后的明文
 */
export async function decrypt(ciphertext: string): Promise<string> {
  if (!ciphertext) return "";
  
  try {
    // 从 Base64 解码
    const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
    
    // 提取 IV 和加密数据
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    
    // 派生密钥
    const key = await deriveKey(SALT);
    
    // 解密数据
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encrypted
    );
    
    // 转换为文本
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error("解密失败");
  }
}
