import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2';

env.allowLocalModels = false;
env.useBrowserCache = true;

const urlInput = document.getElementById('urlInput');
const urlBtn = document.getElementById('urlBtn');
const fileInput = document.getElementById('fileInput');
const screenInput = document.getElementById('screenInput');
const mediaBtn = document.getElementById('mediaBtn');
const screenBtn = document.getElementById('screenBtn');
const fileMeta = document.getElementById('fileMeta');
const startBtn = document.getElementById('startBtn');
const statusText = document.getElementById('statusText');
const progressBar = document.getElementById('progressBar');
const resultText = document.getElementById('resultText');
const rawText = document.getElementById('rawText');
const copyBtn = document.getElementById('copyBtn');
const clearBtn = document.getElementById('clearBtn');

let selectedFile = null;
let selectedBuffer = null;
let selectedSource = '';
let transcriber = null;

screenBtn.addEventListener('click', () => screenInput.click());
mediaBtn.addEventListener('click', () => fileInput.click());
urlBtn.addEventListener('click', importFromUrl);
urlInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') importFromUrl();
});

screenInput.addEventListener('change', async () => {
  await selectFile(screenInput.files?.[0] ?? null, '画面録画');
});
fileInput.addEventListener('change', async () => {
  await selectFile(fileInput.files?.[0] ?? null, '動画・音声');
});

async function importFromUrl() {
  const rawValue = urlInput.value.trim();
  const url = extractUrl(rawValue);

  if (!url) {
    setStatus('Instagramの投稿URLを貼り付けてください。', 'err');
    return;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    setStatus('URLの形式を確認してください。', 'err');
    return;
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    setStatus('http または https のURLを使ってください。', 'err');
    return;
  }

  resetSelection();
  lockUi(true);
  progressBar.value = 5;
  setStatus('投稿URLから動画を取得できるか確認しています…');

  try {
    const media = await resolveMediaFromUrl(parsed.href);
    progressBar.value = 35;

    if (!media?.blob || !isPlayableMedia(media.blob.type, media.url)) {
      throw new Error('動画データを取得できませんでした');
    }

    const fileName = buildRemoteFileName(media.blob.type, media.url);
    const file = new File([media.blob], fileName, { type: media.blob.type || 'video/mp4' });
    selectedFile = file;
    selectedBuffer = await readFileImmediately(file);
    selectedSource = parsed.href;

    const mb = (file.size / 1024 / 1024).toFixed(1);
    fileMeta.textContent = `URL取得: ${fileName} / ${mb} MB`;
    progressBar.value = 45;
    setStatus('URLから動画を読み込めました。文字起こしできます', 'ok');
  } catch (error) {
    console.warn('URL import failed:', error);
    resetSelection();
    fileMeta.textContent = 'URLからの自動取得はできませんでした';
    setStatus('Instagram側の制限で動画を直接取得できませんでした。下の「画面録画を選ぶ」を使ってください。', 'err');
  } finally {
    lockUi(false);
  }
}

function extractUrl(value) {
  const match = value.match(/https?:\/\/[^\s]+/i);
  if (!match) return '';
  return match[0].replace(/[)\]}>、。]+$/g, '');
}

async function resolveMediaFromUrl(url) {
  const direct = await fetchWithTimeout(url, 15000);
  const directType = direct.headers.get('content-type') || '';

  if (direct.ok && (/^(video|audio)\//i.test(directType) || looksLikeMediaUrl(direct.url))) {
    return { blob: await direct.blob(), url: direct.url };
  }

  if (direct.ok && /text\/html/i.test(directType)) {
    const html = await direct.text();
    const candidate = findMediaUrlInHtml(html);
    if (candidate) {
      const mediaResponse = await fetchWithTimeout(candidate, 20000);
      if (mediaResponse.ok) {
        return { blob: await mediaResponse.blob(), url: mediaResponse.url || candidate };
      }
    }
  }

  throw new Error(`URL取得に失敗しました (${direct.status || 'network'})`);
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'video/*,audio/*,text/html;q=0.9,*/*;q=0.8' },
    });
  } finally {
    clearTimeout(timer);
  }
}

function findMediaUrlInHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const meta = doc.querySelector('meta[property="og:video:secure_url"],meta[property="og:video"],meta[name="twitter:player:stream"]');
  if (meta?.content) return decodeEscapedUrl(meta.content);

  const patterns = [
    /"video_url"\s*:\s*"([^"]+)"/,
    /"contentUrl"\s*:\s*"([^"]+)"/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEscapedUrl(match[1]);
  }

  return '';
}

function decodeEscapedUrl(value) {
  return value
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&');
}

function looksLikeMediaUrl(url) {
  return /\.(mp4|m4a|mp3|wav|webm|ogg)(?:$|[?#])/i.test(url || '');
}

function isPlayableMedia(type, url) {
  return /^(video|audio)\//i.test(type || '') || looksLikeMediaUrl(url);
}

function buildRemoteFileName(type, url) {
  const extFromUrl = (url.match(/\.(mp4|m4a|mp3|wav|webm|ogg)(?:$|[?#])/i)?.[1] || '').toLowerCase();
  if (extFromUrl) return `instagram-url.${extFromUrl}`;
  if (/audio\/mpeg/i.test(type)) return 'instagram-url.mp3';
  if (/audio\/mp4/i.test(type)) return 'instagram-url.m4a';
  if (/audio\/wav/i.test(type)) return 'instagram-url.wav';
  if (/video\/webm/i.test(type)) return 'instagram-url.webm';
  return 'instagram-url.mp4';
}

async function selectFile(file, kind) {
  resetSelection();
  selectedFile = file;

  if (!selectedFile) {
    fileMeta.textContent = 'まだファイルが選ばれていません';
    setStatus('準備待ち');
    return;
  }

  const mb = (selectedFile.size / 1024 / 1024).toFixed(1);
  fileMeta.textContent = `${kind}: ${selectedFile.name} / ${mb} MB`;
  setStatus('動画を読み込んでいます…');

  try {
    selectedBuffer = await readFileImmediately(selectedFile);
    selectedSource = kind;
    startBtn.disabled = false;
    setStatus('読み込み完了。文字起こしできます', 'ok');
  } catch (error) {
    console.error(error);
    resetSelection();
    startBtn.disabled = true;
    setStatus('動画を読み込めませんでした。もう一度ファイルを選んでください。', 'err');
  }
}

function resetSelection() {
  selectedFile = null;
  selectedBuffer = null;
  selectedSource = '';
  resultText.value = '';
  rawText.value = '';
  copyBtn.disabled = true;
  startBtn.disabled = true;
  progressBar.value = 0;
}

function readFileImmediately(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('ファイルを読み込めませんでした'));
    reader.onabort = () => reject(new Error('ファイルの読み込みが中断されました'));
    reader.readAsArrayBuffer(file);
  });
}

clearBtn.addEventListener('click', () => {
  resultText.value = '';
  rawText.value = '';
  copyBtn.disabled = true;
  setStatus(selectedBuffer ? '文字起こしできます' : '準備待ち');
  progressBar.value = 0;
});

copyBtn.addEventListener('click', async () => {
  if (!resultText.value.trim()) return;
  await navigator.clipboard.writeText(resultText.value);
  setStatus('コピーしました', 'ok');
});

startBtn.addEventListener('click', async () => {
  if (!selectedBuffer) {
    setStatus('動画をもう一度選んでください。', 'err');
    return;
  }

  try {
    lockUi(true);
    resultText.value = '';
    copyBtn.disabled = true;
    setStatus('動画の音声を読み込んでいます…');
    progressBar.value = 5;

    const audio = await bufferToMono16k(selectedBuffer);
    if (!audio.length) throw new Error('音声を読み取れませんでした。');

    progressBar.value = 20;

    if (!transcriber) {
      setStatus('高精度Whisper smallを準備しています… 初回は時間がかかります');
      transcriber = await pipeline('automatic-speech-recognition','onnx-community/whisper-small',{
        dtype:'q8',
        device:'wasm',
        progress_callback:(p)=>{
          if (typeof p?.progress === 'number') {
            progressBar.value = Math.max(20, Math.min(55, 20 + p.progress * 0.35));
          }
        },
      });
    }

    setStatus('日本語を文字起こししています…');
    progressBar.value = Math.max(progressBar.value, 60);

    const seconds = audio.length / 16000;
    const options = {
      language:'japanese',
      task:'transcribe',
      num_beams:3,
      temperature:0,
      return_timestamps:true,
    };

    if (seconds > 28) {
      options.chunk_length_s = 25;
      options.stride_length_s = 5;
    }

    const output = await transcriber(audio, options);

    const text = (output?.text ?? '').trim();
    if (!text) throw new Error('音声は読み取れましたが、文字を認識できませんでした。');

    const raw = cleanupText(text);
    rawText.value = raw;
    resultText.value = formatTranscript(output, raw);
    copyBtn.disabled = false;
    progressBar.value = 100;
    setStatus('文字起こし完了', 'ok');
  } catch (error) {
    console.error(error);
    progressBar.value = 0;
    setStatus(`エラー: ${error?.message ?? '処理できませんでした'}`, 'err');
  } finally {
    lockUi(false);
  }
});

function lockUi(busy) {
  startBtn.disabled = busy || !selectedBuffer;
  urlInput.disabled = busy;
  urlBtn.disabled = busy;
  fileInput.disabled = busy;
  screenInput.disabled = busy;
  mediaBtn.disabled = busy;
  screenBtn.disabled = busy;
  startBtn.textContent = busy ? '処理中…' : '③ 文字起こし開始';
}

function setStatus(message, className='') {
  statusText.textContent = message;
  statusText.className = className;
}

function cleanupText(text) {
  return text
    .replace(/\s+([、。！？])/g,'$1')
    .replace(/([、。！？])\s+/g,'$1')
    .replace(/\s{2,}/g,' ')
    .trim();
}

function correctCommonMisrecognitions(text) {
  const replacements = [
    [/一寸ペーパー/g, 'キッチンペーパー'],
    [/いっすんペーパー/g, 'キッチンペーパー'],
    [/キチンペーパー/g, 'キッチンペーパー'],
    [/フライパンー/g, 'フライパン'],
  ];
  return replacements.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
}

function formatTranscript(output, fallbackText) {
  const chunks = Array.isArray(output?.chunks) ? output.chunks : [];
  let formatted = '';

  if (chunks.length > 1) {
    let previousEnd = null;

    for (const chunk of chunks) {
      const piece = cleanupText(chunk?.text ?? '');
      if (!piece) continue;

      const ts = Array.isArray(chunk?.timestamp) ? chunk.timestamp : [];
      const start = Number.isFinite(ts[0]) ? ts[0] : null;
      const end = Number.isFinite(ts[1]) ? ts[1] : null;

      if (formatted && previousEnd !== null && start !== null) {
        const gap = start - previousEnd;
        if (gap >= 0.65 && !/[。！？]\n?$/.test(formatted)) {
          formatted += '。\n';
        } else if (gap >= 0.28 && !/[、。！？]\n?$/.test(formatted)) {
          formatted += '、';
        }
      }

      formatted += piece.replace(/^\s+/, '');
      if (end !== null) previousEnd = end;
    }
  } else {
    formatted = fallbackText;
  }

  formatted = correctCommonMisrecognitions(formatted);

  if (!/[。！？]/.test(formatted)) {
    formatted = formatted
      .replace(/(と思ってない)(?=\S)/g, '$1？\n')
      .replace(/(するかも)(?=\S)/g, '$1。\n')
      .replace(/(入れます|炒めていきます|擦っていきます|洗います|してください|してみてね)(?=\S|$)/g, '$1。\n');
  }

  formatted = formatted
    .replace(/。{2,}/g, '。')
    .replace(/、{2,}/g, '、')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (formatted && !/[。！？]$/.test(formatted)) {
    formatted += '。';
  }

  return formatted;
}

async function bufferToMono16k(arrayBuffer) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('このブラウザは音声処理に対応していません。');

  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const mono = mixToMono(decoded);
    const resampled = resampleLinear(mono, decoded.sampleRate, 16000);
    return normalizeAudio(resampled);
  } catch (e) {
    console.error(e);
    throw new Error('動画の音声形式を読み取れません。ChromeでMP4またはM4Aを試してください。');
  } finally {
    await ctx.close();
  }
}

function mixToMono(audioBuffer) {
  const channels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const mono = new Float32Array(length);

  for (let c=0;c<channels;c++) {
    const data = audioBuffer.getChannelData(c);
    for (let i=0;i<length;i++) mono[i] += data[i] / channels;
  }
  return mono;
}

function resampleLinear(input,inputRate,outputRate) {
  if (inputRate === outputRate) return input;

  const ratio = inputRate / outputRate;
  const outLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outLength);

  for (let i=0;i<outLength;i++) {
    const pos = i * ratio;
    const left = Math.floor(pos);
    const right = Math.min(left + 1, input.length - 1);
    const frac = pos - left;
    output[i] = input[left] * (1-frac) + input[right] * frac;
  }
  return output;
}

function normalizeAudio(input) {
  if (!input.length) return input;

  let peak = 0;
  let sumSquares = 0;

  for (let i=0;i<input.length;i++) {
    const v = input[i];
    const a = Math.abs(v);
    if (a > peak) peak = a;
    sumSquares += v * v;
  }

  if (peak < 0.00001) return input;

  const rms = Math.sqrt(sumSquares / input.length);
  const targetRms = 0.12;
  const gainByRms = rms > 0 ? targetRms / rms : 1;
  const gainByPeak = 0.95 / peak;
  const gain = Math.max(1, Math.min(8, gainByRms, gainByPeak));

  if (gain <= 1.01) return input;

  const output = new Float32Array(input.length);
  for (let i=0;i<input.length;i++) {
    output[i] = Math.max(-1, Math.min(1, input[i] * gain));
  }
  return output;
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js?v=9'));
}
