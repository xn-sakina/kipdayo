import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Textarea } from "./components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./components/ui/dialog";
import { Alert, AlertDescription } from "./components/ui/alert";
import { Toaster, toast } from "sonner";
import { Loader2, Copy, X, HelpCircle, CheckCircle2, AlertCircle } from "lucide-react";
import { encrypt, decrypt } from "./lib/crypto";

interface ParseResult {
  url: string;
  format: string;
}

function App() {
  const [cookie, setCookie] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [store, setStore] = useState<Store | null>(null);

  // Initialize store and load saved cookie on mount
  useEffect(() => {
    const initStore = async () => {
      try {
        console.log("Initializing store...");
        const storeInstance = await Store.load("settings.json");
        setStore(storeInstance);
        console.log("Store initialized successfully");
        
        // Load saved cookie (encrypted)
        const encryptedCookie = await storeInstance.get<string>("sessdata");
        console.log("Loaded encrypted cookie from store:", encryptedCookie ? "Found" : "Not found");
        if (encryptedCookie) {
          try {
            // 解密 cookie
            const decryptedCookie = await decrypt(encryptedCookie);
            setCookie(decryptedCookie);
            console.log("Cookie decrypted and restored successfully");
          } catch (err) {
            console.error("Failed to decrypt cookie:", err);
            toast.error("Cookie 解密失败，请重新输入");
            // 清除无效的加密数据
            await storeInstance.delete("sessdata");
            await storeInstance.save();
          }
        }
      } catch (err) {
        console.error("Failed to initialize store:", err);
        toast.error("初始化安全存储失败");
      }
    };
    
    initStore();
  }, []);

  const handleCookieChange = async (value: string) => {
    setCookie(value);
    console.log("Cookie changed, encrypting and saving to store...");
    
    // Save to store (encrypted)
    if (store) {
      try {
        if (value) {
          // 加密 cookie 后再保存
          const encryptedCookie = await encrypt(value);
          await store.set("sessdata", encryptedCookie);
          await store.save();
          console.log("Cookie encrypted and saved successfully");
        } else {
          // 如果值为空，删除存储的 cookie
          await store.delete("sessdata");
          await store.save();
          console.log("Cookie removed from store");
        }
      } catch (err) {
        console.error("Failed to save cookie:", err);
        toast.error("Cookie 保存失败");
      }
    } else {
      console.warn("Store not initialized yet");
    }
  };

  const validateInputs = (): boolean => {
    setError(null);
    setDebugInfo(null);

    if (!url.trim()) {
      setError("请输入视频 URL");
      return false;
    }

    // Basic URL validation
    try {
      const urlObj = new URL(url);
      if (!urlObj.hostname.includes("bilibili.com")) {
        setError("请输入有效的 Bilibili 视频 URL");
        return false;
      }
    } catch {
      setError("请输入有效的 URL 格式");
      return false;
    }

    return true;
  };

  const handleParse = async () => {
    if (!validateInputs()) return;

    setLoading(true);
    setResult(null);
    setError(null);
    setDebugInfo(null);

    try {
      const resultStr = await invoke<string>("parse_bilibili_url", {
        videoUrl: url,
        sessdata: cookie,
      });
      
      const parseResult: ParseResult = JSON.parse(resultStr);
      setResult(parseResult);
    } catch (err: any) {
      const errorMsg = typeof err === 'string' ? err : err.toString();
      setError(errorMsg);
      setDebugInfo(JSON.stringify(err, null, 2));
    } finally {
      setLoading(false);
    }
  };

  const handleClearUrl = () => {
    setUrl("");
    setResult(null);
    setError(null);
    setDebugInfo(null);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <Toaster position="top-center" richColors />
      
      <div className="max-w-4xl mx-auto space-y-4">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-3xl font-bold text-center">
              Bilibili 视频 URL 解析器
            </CardTitle>
            <CardDescription className="text-center">
              解析 Bilibili 视频的真实播放地址
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {/* URL Input */}
            <div className="space-y-2">
              <Label htmlFor="url">视频 URL</Label>
              <div className="relative">
                <Input
                  id="url"
                  type="text"
                  placeholder="https://www.bilibili.com/video/BVxxxxxxxxx"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={loading}
                  className="pr-10"
                />
                {url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                    onClick={handleClearUrl}
                    disabled={loading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Parse Button */}
            <Button
              onClick={handleParse}
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  解析中...
                </>
              ) : (
                "解析"
              )}
            </Button>

            {/* Cookie Input (Optional) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label htmlFor="cookie">Cookie (SESSDATA)</Label>
                  <span className="text-xs text-muted-foreground">(可选)</span>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="link" size="sm" className="text-xs">
                      <HelpCircle className="w-4 h-4 mr-1" />
                      不知道如何获取 Cookie 点我
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>如何获取 Cookie (SESSDATA)</DialogTitle>
                      <DialogDescription>
                        按照以下步骤获取您的 Bilibili Cookie
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 text-sm">
                      <div className="space-y-2">
                        <h4 className="font-semibold">步骤 1: 打开 Bilibili 网站</h4>
                        <p>在浏览器中打开 <a href="https://www.bilibili.com" target="_blank" className="text-blue-500 underline">www.bilibili.com</a> 并登录您的账号。</p>
                      </div>
                      
                      <div className="space-y-2">
                        <h4 className="font-semibold">步骤 2: 打开开发者工具</h4>
                        <ul className="list-disc list-inside space-y-1 pl-4">
                          <li>Windows/Linux: 按 <kbd className="px-2 py-1 bg-muted rounded">F12</kbd> 或 <kbd className="px-2 py-1 bg-muted rounded">Ctrl+Shift+I</kbd></li>
                          <li>Mac: 按 <kbd className="px-2 py-1 bg-muted rounded">Cmd+Option+I</kbd></li>
                        </ul>
                      </div>
                      
                      <div className="space-y-2">
                        <h4 className="font-semibold">步骤 3: 找到 Application/应用 标签</h4>
                        <p>在开发者工具的顶部菜单中,点击 "Application"(或 "应用")标签。</p>
                      </div>
                      
                      <div className="space-y-2">
                        <h4 className="font-semibold">步骤 4: 查找 Cookie</h4>
                        <ul className="list-disc list-inside space-y-1 pl-4">
                          <li>在左侧菜单中,展开 "Cookies" 选项</li>
                          <li>点击 "https://www.bilibili.com"</li>
                          <li>在右侧列表中找到名为 <strong>SESSDATA</strong> 的 Cookie</li>
                        </ul>
                      </div>
                      
                      <div className="space-y-2">
                        <h4 className="font-semibold">步骤 5: 复制 Cookie 值</h4>
                        <p>双击 SESSDATA 对应的 Value(值)列,复制整个值,然后粘贴到上面的输入框中。</p>
                      </div>
                      
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          <strong>注意:</strong> Cookie 是您的登录凭证,请勿分享给他人!
                        </AlertDescription>
                      </Alert>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <Input
                id="cookie"
                type="password"
                placeholder="请输入您的 SESSDATA Cookie"
                value={cookie}
                onChange={(e) => handleCookieChange(e.target.value)}
                disabled={loading}
                className="font-mono"
              />
              <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <p>
                  提供 Cookie 可获取更高清晰度视频。Cookie 将被加密后安全存储在本地。
                </p>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <Alert variant="destructive" className="py-3">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Debug Info */}
            {debugInfo && (
              <div className="space-y-1.5">
                <Label>调试信息:</Label>
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
                  {debugInfo}
                </pre>
              </div>
            )}

            {/* Results Display */}
            {result && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <Label className="text-lg font-semibold">解析结果</Label>
                  <span className="text-xs text-muted-foreground">({result.format})</span>
                  
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="ml-auto bg-blue-600 hover:bg-blue-700"
                    onClick={() => copyToClipboard(result.url)}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    复制
                  </Button>
                </div>
                
                <Textarea
                  value={result.url}
                  readOnly
                  className="font-mono text-xs resize-none min-h-[100px] break-all"
                  rows={4}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default App;
