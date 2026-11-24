'use strict';
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const {TextEncoder,TextDecoder}=require('node:util');
const html=readFileSync('kaginote/index.html','utf8');
const installer=readFileSync('kaginote/install.html','utf8');
const worker=readFileSync('kaginote/sw.js','utf8');
const manifest=JSON.parse(readFileSync('kaginote/manifest.webmanifest','utf8'));
const script=readFileSync('kaginote/app.js','utf8');
const installScript=readFileSync('kaginote/install.js','utf8');
new vm.Script(script,{filename:'kaginote/app.js'});
new vm.Script(installScript,{filename:'kaginote/install.js'});
assert.ok(!html.includes('<script>')&&!installer.includes('<script>'),'inline executable scripts removed');
assert.ok(html.includes("script-src 'self'")&&installer.includes("script-src 'self'"),'CSP restricts to same-origin scripts');
assert.match(html,/AES-256-GCM/);
assert.match(html,/PBKDF2-SHA-256/);
assert.match(script,/ITERATIONS=600000/);
assert.match(html,/connect-src 'none'/);
assert.match(html,/default-src 'none'/);
assert.ok(!script.includes('randomPassword')&&!html.includes('id="generate"'),'password generator removed');
assert.ok(!installer.includes('type="password"'),'install page has no master-password input');
assert.ok(html.includes('id="restore-pass" type="password"'),'backup restore uses masked password field');
assert.ok(!script.includes('pass=prompt('),'backup restore no longer uses an unmasked browser prompt');
assert.equal(manifest.display,'standalone');
assert.equal(manifest.start_url,'./index.html');
for(const url of ['./index.html','./install.html','./app.js','./install.js','./manifest.webmanifest'])assert.ok(worker.includes("'"+url+"'"),'offline cache includes '+url);
console.log('PASS: static crypto configuration, CSP, install screen and offline assets');
const store=new Map();
const storage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const all=new Map(),userEvents=new Map(),docEvents=new Map(),windowEvents=new Map();
function element(id){
 if(all.has(id))return all.get(id);
 const ev=new Map(),classes=new Set(['hidden']);
 const o={id,value:'',textContent:'',type:'',checked:false,disabled:false,hidden:false,files:[],style:{},
  classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,bool)=>{if(bool===undefined)bool=!classes.has(x);if(bool)classes.add(x);else classes.delete(x);return bool;}},
  addEventListener:(event,callback)=>ev.set(event,callback),
  getHandler:event=>ev.get(event),focus(){},reset(){this.value='';},
  close(){this.open=false},showModal(){this.open=true},
  append(){},replaceChildren(){},querySelector(){return element('query-'+id)},remove(){},select(){}
 };
 all.set(id,o);return o;
}
const document={getElementById:element,createElement:(name)=>element('created-'+name+'-'+all.size),addEventListener:(event,fn)=>docEvents.set(event,fn),body:{append(){}}};
const mql={matches:true,addEventListener(){}};
const window={
 isSecureContext:true,PublicKeyCredential:function(){},
 localStorage:storage,matchMedia:()=>mql,addEventListener:(event,fn)=>windowEvents.set(event,fn)
};
const credentialId=new Uint8Array(16).fill(4);
let allowAuth=true;
const authenticatorOutput=()=>new Uint8Array(32).fill(7).buffer;
const navigator={userAgent:'Android Chrome (automated test)',platform:'Linux',credentials:{
 create:async()=>({rawId:credentialId.buffer,getClientExtensionResults:()=>({prf:{enabled:true}})}),
 get:async()=>{if(!allowAuth){const e=new Error('cancel');e.name='NotAllowedError';throw e;}return {rawId:credentialId.buffer,getClientExtensionResults:()=>({prf:{results:{first:authenticatorOutput()}}})};}
 },clipboard:{writeText:async()=>{}}
};
const location={protocol:'https:',hostname:'localhost',replace(){throw new Error('unexpected redirect')}};
const context={document,window,navigator,localStorage:storage,location,crypto:webcrypto,TextEncoder,TextDecoder,
 Uint8Array,ArrayBuffer,Date,Math,JSON,Number,String,Object,Error,Blob,URL,Promise,
 btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),
 setInterval:()=>0,setTimeout:()=>0,clearTimeout:()=>{},structuredClone,
 confirm:()=>true,prompt:()=>null,console};
vm.runInNewContext(script,context,{filename:'kaginote.js'});
const submit=(id)=>element(id).getHandler('submit')({preventDefault(){}});
const click=(id)=>element(id).getHandler('click')();
const visible=(id)=>!element(id).classList.contains('hidden');
(async()=>{
 assert.ok(visible('setup'),'initial setup visible');
 element('setup-pw').value='TEST-MASTER-Password@32';
 element('setup-pw2').value='TEST-MASTER-Password@32';
 await submit('setup-form');
 assert.ok(visible('bio-enroll'),'enrollment required after master password');
 assert.ok(!visible('dashboard'),'not unlocked before device verification');
 assert.equal(store.get('kaginote.encrypted.v1'),undefined,'no persisted vault before device enrollment');
 await click('bio-enroll-action');
 assert.ok(visible('dashboard'),'enrollment and device verification unlocks');
 const root=JSON.parse(store.get('kaginote.encrypted.v1'));
 assert.equal(root.biometric.type,'webauthn-prf-v1');
 assert.equal(root.kdf.iterations,600000);
 assert.equal(root.encryption.iv.length,16,'12-byte IV in base64');
 element('site').value='Test Service';
 element('account').value='test@example.invalid';
 element('password').value='SECRET-TEST-PASSWORD-DO-NOT-USE';
 element('note').value='fake data';
 await submit('entry-form');
 const stored=store.get('kaginote.encrypted.v1');
 assert.ok(!stored.includes('SECRET-TEST-PASSWORD-DO-NOT-USE'),'password not stored in plaintext');
 assert.ok(!stored.includes('test@example.invalid'),'account not stored in plaintext');
 // Demonstrate the backup-security limitation: master passphrase alone decrypts the local vault.
 // The mock hardware authenticator is NOT involved in the following independent decryption.
 const rootFromDisk=JSON.parse(stored);
 const baseKey=await webcrypto.subtle.importKey('raw',new TextEncoder().encode('TEST-MASTER-Password@32'),'PBKDF2',false,['deriveBits']);
 const raw=await webcrypto.subtle.deriveBits({name:'PBKDF2',salt:Buffer.from(rootFromDisk.kdf.salt,'base64'),iterations:rootFromDisk.kdf.iterations,hash:'SHA-256'},baseKey,256);
 const aes=await webcrypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
 const iv=Buffer.from(rootFromDisk.encryption.iv,'base64');
 const ciphertext=Buffer.from(rootFromDisk.encryption.ciphertext,'base64');
 const plaintext=await webcrypto.subtle.decrypt({name:'AES-GCM',iv},aes,ciphertext);
 assert.equal(JSON.parse(new TextDecoder().decode(plaintext)).entries[0].password,'SECRET-TEST-PASSWORD-DO-NOT-USE','master-only offline decrypt works');
 const tampered=Buffer.from(ciphertext);tampered[0]^=1;
 await assert.rejects(()=>webcrypto.subtle.decrypt({name:'AES-GCM',iv},aes,tampered),'tampered data must fail authentication');
 console.log('PASS: AES-GCM detects ciphertext tampering');
 console.log('RISK CONFIRMED: stolen encrypted vault + master password can decrypt WITHOUT biometrics');

 click('lock-now');
 assert.ok(visible('unlock')&&!visible('dashboard'),'lock closes vault');
 element('unlock-pw').value='wrong-password1234';
 await submit('unlock-form');
 assert.ok(visible('unlock')&&!visible('dashboard'),'incorrect master password rejected');
 element('unlock-pw').value='TEST-MASTER-Password@32';
 await submit('unlock-form');
 assert.ok(visible('bio-verify')&&!visible('dashboard'),'master password alone not enough');
 allowAuth=false;
 await click('bio-verify-action');
 assert.ok(visible('bio-verify')&&!visible('dashboard'),'cancelled biometric keeps locked');
 allowAuth=true;
 await click('bio-verify-action');
 assert.ok(visible('dashboard'),'master+device verification unlocks');
 assert.equal(element('entry-count').textContent,'1','saved record round-trip');
 console.log('PASS: initial enrollment, no pre-biometric storage, encrypted record roundtrip');
 console.log('PASS: lock, reject wrong master, reject canceled device verification');
 console.log('PASS: correct master + device verification restores record');
 console.log('WARNING: device authenticator is mocked; this is not Android hardware verification');
})().catch(e=>{console.error(e);process.exitCode=1});