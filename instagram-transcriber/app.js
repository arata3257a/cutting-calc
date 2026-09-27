import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2';

env.allowLocalModels = false;
env.useBrowserCache = true;

const fileInput = document.getElementById('fileInput');
const screenInput = document.getElementById('screenInput');
const mediaBtn = document.getElementById('mediaBtn');
const screenBtn = document.getElementById('screenBtn');
const fileMeta = document.getElementById('fileMeta');
const startBtn = document.getElementById('startBtn');
const statusText = document.getElementById('statusText');
const progressBar = document.getElementById('progressBar');
const resultText = document.getElementById('resultText');
const copyBtn = document.getElementById('copyBtn');
const clearBtn = document.getElementById('clearBtn');

let selectedFile = null;
let transcriber = null;

screenBtn.addEventListener('click', () => screenInput.click());
mediaBtn.addEventListener('click', () => fileInput.click());

screenInput.addEventListener('change', () => selectFile(screenInput.files?.[0] ?? null, '画面録画'));
fileInput.addEventListener('change', () => selectFile(fileInput.files?.[0] ?? null, '動画・音声'));

function selectFile(file, kind) {
  selectedFile = file;
  startBtn.disabled = !selectedFile;
  resultText.value = '';
  copyBtn.disabled = true;
  progressBar.value = 0;

  if (!selectedFile) {
    fileMeta.textContent = 'まだファイルが選ばれていません';
    setStatus('準備待ち');
    return;
  }

  const mb = (selectedFile.size / 1024 / 1024).toFixed(1);
  fileMeta.textContent = `${kind}: ${selectedFile.name} / ${mb} MB`;
  setStatus('文字起こしできます');
}

clearBtn.addEventListener('click', () => {
  resultText.value = '';
  copyBtn.disabled = true;
  setStatus(selectedFile ? '文字起こしできます' : '準備待ち');
  progressBar.value = 0;
});

copyBtn.addEventListener('click', async () => {
  if (!resultText.value.trim()) return;
  await navigator.clipboard.writeText(resultText.value);
  setStatus('コピーしました', 'ok');
});

startBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  try {
    lockUi(true);
    setStatus('動画の音声を読み込んでいます…');
    progressBar.value = 5;

    const audio = await fileToMono16k(selectedFile);
    if (!audio.length) throw new Error('音声を読み取れませんでした。');

    progressBar.value = 20;

    if (!transcriber) {
      setStatus('Whisper AIを準備しています… 初回は少し時間がかかります');
      transcriber = await pipeline('automatic-speech-recognition','onnx-community/whisper-tiny',{
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

    const output = await transcriber(audio,{
      language:'japanese',
      task:'transcribe',
      chunk_length_s:30,
      stride_length_s:5,
    });

    const text = (output?.text ?? '').trim();
    if (!text) throw new Error('音声は読み取れましたが、文字を認識できませんでした。');

    resultText.value = cleanupText(text);
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
  startBtn.disabled = busy || !selectedFile;
  fileInput.disabled = busy;
  screenInput.disabled = busy;
  mediaBtn.disabled = busy;
  screenBtn.disabled = busy;
  startBtn.textContent = busy ? '処理中…' : '② 文字起こし開始';
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

async function fileToMono16k(file) {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('このブラウザは音声処理に対応していません。');

  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const mono = mixToMono(decoded);
    return resampleLinear(mono, decoded.sampleRate, 16000);
  } catch (e) {
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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}