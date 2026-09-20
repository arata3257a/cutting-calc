import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const el = id => document.getElementById(id);
const frontInput = el('frontInput');
const sourcePreview = el('sourcePreview');
const previewWrap = el('previewWrap');
const quickBtn = el('quickBtn');
const aiBtn = el('aiBtn');
const savePngBtn = el('savePngBtn');
const saveGlbBtn = el('saveGlbBtn');
const statusText = el('statusText');
const progress = el('progress');
const depthStrength = el('depthStrength');
const depthOut = el('depthOut');
const meshSize = el('meshSize');
const viewer = el('viewer');
const viewerHint = el('viewerHint');

let sourceFile = null;
let sourceUrl = null;
let deferredPrompt = null;
let scene, camera, renderer, controls, relief;
let lastStrength = .75;
let renderQueued = false;
let depthEstimatorCache = null;

function setStatus(text, value = null) {
  statusText.textContent = text;
  if (value !== null) progress.value = value;
}

function initThree() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
  camera.position.set(0, 0.15, 3.1);

  renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  const mobile = matchMedia('(max-width: 800px)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1 : 1.35));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  viewer.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.minDistance = 1.2;
  controls.maxDistance = 7;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x203050, 2.0));

  const key = new THREE.DirectionalLight(0xffffff, 2.8);
  key.position.set(2.5, 3.5, 4);
  scene.add(key);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(1.15, 24),
    new THREE.MeshStandardMaterial({ color: 0x0a1020, roughness: .72, metalness: .1, transparent: true, opacity: .72 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.18;
  scene.add(ground);

  const resize = () => {
    const rect = viewer.getBoundingClientRect();
    camera.aspect = rect.width / Math.max(1, rect.height);
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height, false);
    requestRender();
  };
  new ResizeObserver(resize).observe(viewer);
  resize();

  controls.addEventListener('change', requestRender);
  requestRender();
}

function requestRender(){
  if(renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(()=>{
    renderQueued = false;
    renderer.render(scene, camera);
  });
}

function resetView(){
  camera.position.set(0, .15, 3.1);
  controls.target.set(0, 0, 0);
  controls.update();
  requestRender();
}

async function fileToImage(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return { img, url };
}

function drawImageFit(img, w, h, gray = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#000'; x.fillRect(0,0,w,h);
  const s = Math.min(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  x.drawImage(img, (w-dw)/2, (h-dh)/2, dw, dh);
  if (gray) {
    const d = x.getImageData(0,0,w,h);
    for(let i=0;i<d.data.length;i+=4){
      const g = d.data[i]*.2126 + d.data[i+1]*.7152 + d.data[i+2]*.0722;
      d.data[i]=d.data[i+1]=d.data[i+2]=g;
    }
    x.putImageData(d,0,0);
  }
  return c;
}

function createRelief(textureImage, depthCanvas, strength = .75, segments = 64) {
  if (relief) {
    scene.remove(relief);
    relief.geometry.dispose();
    relief.material.map?.dispose();
    relief.material.dispose();
  }

  const aspect = textureImage.width / textureImage.height;
  const h = 2.15;
  const w = h * aspect;
  const geometry = new THREE.PlaneGeometry(w, h, segments, Math.max(24, Math.round(segments/aspect)));
  const depthCtx = depthCanvas.getContext('2d', { willReadFrequently: true });
  const depthData = depthCtx.getImageData(0,0,depthCanvas.width,depthCanvas.height).data;
  const pos = geometry.attributes.position;

  for(let i=0;i<pos.count;i++){
    const u = geometry.attributes.uv.getX(i);
    const v = geometry.attributes.uv.getY(i);
    const px = Math.min(depthCanvas.width-1, Math.max(0, Math.floor(u*(depthCanvas.width-1))));
    const py = Math.min(depthCanvas.height-1, Math.max(0, Math.floor((1-v)*(depthCanvas.height-1))));
    const idx = (py*depthCanvas.width+px)*4;
    const d = depthData[idx] / 255;
    pos.setZ(i, (d - .42) * strength);
  }

  pos.needsUpdate = true;
  geometry.computeVertexNormals();

  const maxTex = matchMedia('(max-width: 800px)').matches ? 512 : 768;
  const texCanvas = drawImageFit(textureImage, maxTex, Math.max(192, Math.round(maxTex/aspect)));
  const texture = new THREE.CanvasTexture(texCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: .55,
    metalness: .12,
    side: THREE.DoubleSide
  });

  relief = new THREE.Mesh(geometry, material);
  relief.name = 'GeneratedRelief';
  relief.rotation.x = -.05;
  relief.userData.originalStrength = strength;
  lastStrength = strength;
  scene.add(relief);

  viewerHint.style.display = 'none';
  savePngBtn.disabled = false;
  saveGlbBtn.disabled = false;
  resetView();
  requestRender();
}

async function quickRelief(){
  if(!sourceFile) return;
  setStatus('簡易深度を作成中', 25);
  const {img, url} = await fileToImage(sourceFile);
  const size = Number(meshSize.value);
  const d = drawImageFit(img, size, size, true);
  const ctx = d.getContext('2d', {willReadFrequently:true});
  const id = ctx.getImageData(0,0,d.width,d.height);

  for(let y=0;y<d.height;y++){
    for(let x=0;x<d.width;x++){
      const i=(y*d.width+x)*4;
      const lum=id.data[i]/255;
      const nx=(x/(d.width-1))*2-1, ny=(y/(d.height-1))*2-1;
      const radial=Math.max(0,1-Math.sqrt(nx*nx+ny*ny));
      const val=Math.max(0,Math.min(1, lum*.48 + radial*.52));
      id.data[i]=id.data[i+1]=id.data[i+2]=Math.round(val*255);
    }
  }

  ctx.putImageData(id,0,0);
  setStatus('立体メッシュ生成中', 70);
  createRelief(img, d, Number(depthStrength.value), size);
  setStatus('完了', 100);
  URL.revokeObjectURL(url);
}

async function aiRelief(){
  if(!sourceFile) return;
  aiBtn.disabled = true; quickBtn.disabled = true;

  try {
    setStatus('AIモデル準備中（スマホでは重い処理です）', 10);
    if(!depthEstimatorCache){
      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
      env.allowLocalModels = false;
      depthEstimatorCache = await pipeline('depth-estimation', 'Xenova/dpt-hybrid-midas', {
        progress_callback: p => {
          if (p && typeof p.progress === 'number') {
            setStatus('AIモデル読込み中', Math.min(55, 10 + p.progress*.45));
          }
        }
      });
    }

    const {img, url} = await fileToImage(sourceFile);
    const aiCanvas = drawImageFit(img, 384, 384, false);
    const aiInput = aiCanvas.toDataURL('image/jpeg', .82);
    setStatus('AIで奥行きを解析中', 62);
    const result = await depthEstimatorCache(aiInput);
    setStatus('深度マップ変換中', 78);

    const size = Number(meshSize.value);
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const x = c.getContext('2d', {willReadFrequently:true});

    const depthSource = result.depth || result.predicted_depth;
    let depthImage = null;

    if (depthSource && typeof depthSource.toCanvas === 'function') {
      depthImage = await depthSource.toCanvas();
    } else if (depthSource && depthSource.data && depthSource.dims) {
      const [dh, dw] = depthSource.dims.slice(-2);
      const temp = document.createElement('canvas');
      temp.width = dw; temp.height = dh;
      const tx = temp.getContext('2d');
      const im = tx.createImageData(dw, dh);
      let min=Infinity,max=-Infinity;

      for(const v of depthSource.data){ if(v<min)min=v; if(v>max)max=v; }
      const span = Math.max(1e-6,max-min);

      for(let i=0;i<depthSource.data.length;i++){
        const g = Math.round(((depthSource.data[i]-min)/span)*255);
        im.data[i*4]=im.data[i*4+1]=im.data[i*4+2]=g;
        im.data[i*4+3]=255;
      }
      tx.putImageData(im,0,0);
      depthImage=temp;
    }

    if (!depthImage) throw new Error('深度データの形式を認識できませんでした');

    x.drawImage(depthImage,0,0,size,size);
    setStatus('3Dメッシュ生成中', 92);
    createRelief(img, c, Number(depthStrength.value), size);
    setStatus('AI立体化 完了', 100);
    URL.revokeObjectURL(url);

  } catch (e) {
    console.error(e);
    setStatus('AI深度に失敗：簡易立体化は使用できます', 0);
    alert('AI高精度処理を完了できませんでした。通常は「軽量で立体化」を使ってください。');
  } finally {
    aiBtn.disabled = !sourceFile;
    quickBtn.disabled = !sourceFile;
  }
}

function downloadBlob(blob, filename){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=filename;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function saveGlb(){
  if(!relief) return;

  const oldRot=relief.rotation.clone();
  relief.rotation.set(0,0,0);

  try{
    setStatus('GLBを書き出し中', 92);
    const exporter=new GLTFExporter();
    exporter.parse(
      relief,
      result=>{
        const blob = result instanceof ArrayBuffer
          ? new Blob([result],{type:'model/gltf-binary'})
          : new Blob([JSON.stringify(result)],{type:'model/gltf+json'});
        downloadBlob(blob,'ai-3d-maker.glb');
        setStatus('GLB保存 完了',100);
      },
      err=>{
        console.error(err);
        setStatus('GLB保存に失敗',0);
        alert('GLBの保存に失敗しました。');
      },
      {binary:true,onlyVisible:true,maxTextureSize:2048}
    );
  } finally {
    relief.rotation.copy(oldRot);
  }
}

frontInput.addEventListener('change', e => {
  const f = e.target.files?.[0];
  if(!f) return;

  sourceFile = f;
  if(sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = URL.createObjectURL(f);

  sourcePreview.src = sourceUrl;
  previewWrap.classList.remove('empty');
  quickBtn.disabled = false;
  aiBtn.disabled = false;
  setStatus('画像読込み完了', 0);
});

depthStrength.addEventListener('input', () => {
  const val=Number(depthStrength.value);
  depthOut.value = val.toFixed(2);
  if(relief){
    relief.scale.z = val / Math.max(.001,lastStrength);
    requestRender();
  }
});

quickBtn.addEventListener('click', quickRelief);
aiBtn.addEventListener('click', aiRelief);
el('resetViewBtn').addEventListener('click', resetView);

savePngBtn.addEventListener('click', () => {
  renderer.render(scene,camera);
  const a=document.createElement('a');
  a.href=renderer.domElement.toDataURL('image/png');
  a.download='ai-3d-maker.png';
  a.click();
});

saveGlbBtn.addEventListener('click', saveGlb);

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt=e;
  el('installBtn').hidden=false;
});

el('installBtn').addEventListener('click', async()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt=null;
  el('installBtn').hidden=true;
});

if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
}

initThree();
