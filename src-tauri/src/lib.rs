use anyhow::{anyhow, Result};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::time::Duration;

// ==================== 数据结构定义 ====================

#[derive(Debug, Serialize, Deserialize)]
pub struct VideoInfo {
    pub cid: u64,
    pub aid: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VideoPlayUrl {
    pub url: String,
    pub format: String,
}

#[derive(Debug, Deserialize)]
struct ApiResponse<T> {
    code: i32,
    message: Option<String>,
    data: Option<T>,
}

#[derive(Debug, Deserialize)]
struct ViewData {
    cid: u64,
    aid: u64,
}

#[derive(Debug, Deserialize)]
struct PlayUrlData {
    dash: Option<DashData>,
    durl: Option<Vec<DurlData>>,
}

#[derive(Debug, Deserialize)]
struct DashData {
    video: Option<Vec<VideoStream>>,
}

#[derive(Debug, Deserialize)]
struct VideoStream {
    #[serde(rename = "baseUrl")]
    base_url: Option<String>,
    #[serde(rename = "base_url")]
    base_url_alt: Option<String>,
}

impl VideoStream {
    fn get_url(&self) -> Option<String> {
        self.base_url.clone().or_else(|| self.base_url_alt.clone())
    }
}

#[derive(Debug, Deserialize)]
struct DurlData {
    url: String,
}

// ==================== 工具函数 ====================

/// 清理URL,去除查询参数
fn clean_url(url: &str) -> String {
    // 移除 ? 及其后面的所有内容
    url.split('?').next().unwrap_or(url).to_string()
}

/// 从URL中提取BV号
fn extract_bvid(url: &str) -> Result<String> {
    // 先清理URL
    let clean = clean_url(url);
    let re = Regex::new(r"BV[a-zA-Z0-9]+")?;
    re.find(&clean)
        .map(|m| m.as_str().to_string())
        .ok_or_else(|| anyhow!("无法从URL中提取BV号"))
}

/// 生成浏览器请求头
fn generate_headers(sessdata: &str, referer: &str) -> reqwest::header::HeaderMap {
    let mut headers = reqwest::header::HeaderMap::new();
    
    headers.insert(
        reqwest::header::USER_AGENT,
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            .parse()
            .unwrap(),
    );
    headers.insert(
        reqwest::header::ACCEPT,
        "application/json, text/plain, */*".parse().unwrap(),
    );
    headers.insert(
        reqwest::header::ACCEPT_LANGUAGE,
        "zh-CN,zh;q=0.9,en;q=0.8".parse().unwrap(),
    );
    headers.insert(
        reqwest::header::ACCEPT_ENCODING,
        "gzip, deflate, br".parse().unwrap(),
    );
    headers.insert(reqwest::header::REFERER, referer.parse().unwrap());
    headers.insert(
        reqwest::header::ORIGIN,
        "https://www.bilibili.com".parse().unwrap(),
    );
    headers.insert(
        reqwest::header::COOKIE,
        format!("SESSDATA={}", sessdata).parse().unwrap(),
    );
    headers.insert(
        "Sec-Ch-Ua",
        "\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\", \"Google Chrome\";v=\"120\""
            .parse()
            .unwrap(),
    );
    headers.insert("Sec-Ch-Ua-Mobile", "?0".parse().unwrap());
    headers.insert("Sec-Ch-Ua-Platform", "\"macOS\"".parse().unwrap());
    headers.insert("Sec-Fetch-Dest", "empty".parse().unwrap());
    headers.insert("Sec-Fetch-Mode", "cors".parse().unwrap());
    headers.insert("Sec-Fetch-Site", "same-site".parse().unwrap());
    headers.insert("DNT", "1".parse().unwrap());

    headers
}

/// 获取视频CID
async fn get_video_cid(bvid: &str, sessdata: &str) -> Result<VideoInfo> {
    let url = format!("https://api.bilibili.com/x/web-interface/view?bvid={}", bvid);
    let referer = format!("https://www.bilibili.com/video/{}", bvid);
    let headers = generate_headers(sessdata, &referer);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .gzip(true)
        .build()?;

    let response = client
        .get(&url)
        .headers(headers)
        .send()
        .await?;

    let api_response: ApiResponse<ViewData> = response.json().await?;

    if api_response.code == 0 {
        if let Some(data) = api_response.data {
            Ok(VideoInfo {
                cid: data.cid,
                aid: data.aid,
            })
        } else {
            Err(anyhow!("响应中未找到数据"))
        }
    } else {
        let msg = api_response.message.unwrap_or_else(|| "未知错误".to_string());
        Err(anyhow!("获取视频信息失败: {}", msg))
    }
}

/// 获取视频播放URL
async fn get_play_url(bvid: &str, cid: u64, sessdata: &str) -> Result<VideoPlayUrl> {
    let url = format!(
        "https://api.bilibili.com/x/player/playurl?bvid={}&cid={}&qn=80&fnval=16&fourk=1",
        bvid, cid
    );
    let referer = format!("https://www.bilibili.com/video/{}", bvid);
    let headers = generate_headers(sessdata, &referer);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .gzip(true)
        .build()?;

    let response = client
        .get(&url)
        .headers(headers)
        .send()
        .await?;

    let api_response: ApiResponse<PlayUrlData> = response.json().await?;

    if api_response.code == 0 {
        if let Some(data) = api_response.data {
            // 优先使用DASH格式
            if let Some(dash) = data.dash {
                if let Some(video) = dash.video {
                    if let Some(first_video) = video.first() {
                        if let Some(url) = first_video.get_url() {
                            return Ok(VideoPlayUrl {
                                url,
                                format: "DASH".to_string(),
                            });
                        }
                    }
                }
            }

            // 降级使用MP4格式
            if let Some(durl) = data.durl {
                if let Some(first_durl) = durl.first() {
                    return Ok(VideoPlayUrl {
                        url: first_durl.url.clone(),
                        format: "MP4".to_string(),
                    });
                }
            }

            Err(anyhow!("响应中未找到视频URL"))
        } else {
            Err(anyhow!("响应中未找到数据"))
        }
    } else {
        let msg = api_response.message.unwrap_or_else(|| "未知错误".to_string());
        Err(anyhow!("获取播放URL失败: {}", msg))
    }
}

// ==================== Tauri Commands ====================

#[tauri::command]
async fn parse_bilibili_url(video_url: String, sessdata: String) -> Result<String, String> {
    // 提取BV号
    let bvid = extract_bvid(&video_url).map_err(|e| e.to_string())?;

    // 如果 sessdata 为空,使用空字符串(未登录状态)
    let cookie = if sessdata.trim().is_empty() {
        ""
    } else {
        &sessdata
    };

    // 获取视频信息
    let video_info = get_video_cid(&bvid, cookie)
        .await
        .map_err(|e| e.to_string())?;

    // 获取播放URL
    let play_url = get_play_url(&bvid, video_info.cid, cookie)
        .await
        .map_err(|e| e.to_string())?;

    // 返回JSON字符串
    serde_json::to_string(&play_url).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![parse_bilibili_url])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
