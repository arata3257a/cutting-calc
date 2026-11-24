(()=>{'use strict';
    const STORE='kaginote.encrypted.v1'; const ITERATIONS=600000; const LOCK_MS=3*60*1000;
    const encoder=new TextEncoder(),decoder=new TextDecoder();
    const $=id=>document.getElementById(id);
    const views=['unsupported','install-required','setup','unlock','bio-enroll','bio-verify','dashboard'];
    let vault=null,key=null,root=null,pendingAuth=null,editingId=null,lastActivity=Date.now(),busy=false,toastTimeout=null,installPrompt=null;

    function installGateSatisfied(){if(installedMode())return true;try{return localStorage.getItem('kaginote.install-confirmed.v1')==='yes'}catch{return false}}
    function showView(name){if(name!=='unsupported'&&name!=='install-required'&&!installGateSatisfied())name='install-required';views.forEach(id=>$(id).classList.toggle('hidden',id!==name));}
    function toast(message){const el=$('toast');el.textContent=message;el.classList.remove('hidden');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.add('hidden'),4000);}
    function bytesToB64(bytes){let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);}
    function b64ToBytes(s){if(typeof s!=='string'||!s||s.length>8_000_000)throw new Error('無効なデータです');let decoded=atob(s);return Uint8Array.from(decoded,c=>c.charCodeAt(0));}
    function randomBytes(n){const a=new Uint8Array(n);crypto.getRandomValues(a);return a;}
    function randomId(){return bytesToB64(randomBytes(16)).replace(/[^a-zA-Z0-9]/g,'');}
    function isValidRoot(x){if(!x||typeof x!=='object'||x.app!=='KagiNote'||x.version!==1||!x.kdf||!x.encryption||x.kdf.name!=='PBKDF2-SHA-256'||x.encryption.name!=='AES-256-GCM'||!Number.isInteger(x.kdf.iterations)||x.kdf.iterations<100000||x.kdf.iterations>1000000)return false;try{return b64ToBytes(x.kdf.salt).length===16&&b64ToBytes(x.encryption.iv).length===12&&b64ToBytes(x.encryption.ciphertext).length>16}catch{return false}}
    function readRoot(){const raw=localStorage.getItem(STORE);if(!raw)return null;const r=JSON.parse(raw);if(!isValidRoot(r))throw Error('保存データが破損しています');return r;}
    function writeRoot(r){localStorage.setItem(STORE,JSON.stringify(r));root=r;updateBiometricUI();}
    async function deriveBytes(pass,salt,iterations){const base=await crypto.subtle.importKey('raw',encoder.encode(pass),'PBKDF2',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations,hash:'SHA-256'},base,256));}
    async function importVaultKey(raw){return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);}
    async function derive(pass,salt,iterations){const raw=await deriveBytes(pass,salt,iterations);try{return await importVaultKey(raw)}finally{raw.fill(0)}}
    async function encryptVault(data,aesKey,oldRoot){const iv=randomBytes(12);const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},aesKey,encoder.encode(JSON.stringify(data))));return {...oldRoot,encryption:{name:'AES-256-GCM',iv:bytesToB64(iv),ciphertext:bytesToB64(ciphertext)}};}
    async function decryptVault(r,aesKey){const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(r.encryption.iv)},aesKey,b64ToBytes(r.encryption.ciphertext));const v=JSON.parse(decoder.decode(bytes));if(!v||!Array.isArray(v.entries)||v.entries.length>10000||!v.entries.every(e=>e&&typeof e.id==='string'&&typeof e.site==='string'&&typeof e.account==='string'&&typeof e.password==='string'&&typeof e.note==='string'))throw Error('バックアップの内容が不正です');return v;}
    async function save(){if(!vault||!key||!root)throw Error('ロックされています');writeRoot(await encryptVault(vault,key,root));lastActivity=Date.now();}
    function clearPending(){if(pendingAuth?.rawMaster)pendingAuth.rawMaster.fill(0);pendingAuth=null;}
    function lock(){clearPending();vault=null;key=null;editingId=null;$('unlock-pw').value='';$('search').value='';$('entries').replaceChildren();$('entry-form').reset();$('master-form').reset();$('entry-dialog').close?.();$('master-dialog').close?.();updateBiometricUI();showView(root?'unlock':'setup');}
    function activity(){if(vault||pendingAuth)lastActivity=Date.now();}
    function checkIdle(){if((vault||pendingAuth)&&Date.now()-lastActivity>LOCK_MS){lock();toast('一定時間操作がなかったためロックしました');}}
    function start(){if(!installGateSatisfied()){location.replace('./install.html?revision=20261124d');return;}if(!crypto?.subtle||!crypto.getRandomValues||!window.localStorage){showView('unsupported');return}try{root=readRoot();updateBiometricUI();showView(root?'unlock':'setup')}catch(e){showView('unsupported');$('unsupported').querySelector('p').textContent='保存データの読み取りに失敗しました。ブラウザーの保存設定をご確認ください。'}}
    function biometricApiAvailable(){return !!(window.isSecureContext&&window.PublicKeyCredential&&navigator.credentials?.create&&navigator.credentials?.get);}
    function updateBiometricUI(){$('bio-state').textContent=root?.biometric?'端末認証登録済み：このブラウザー・公開先に対応':'端末認証は未登録';}
    function beginSecondFactor(rawMaster,derivedKey,openedVault,stagedRoot=null){clearPending();pendingAuth={rawMaster,key:derivedKey,data:openedVault,stagedRoot};lastActivity=Date.now();showView(root?.biometric?'bio-verify':'bio-enroll');}
    function finishSecondFactor(){if(!pendingAuth)throw Error('認証が中断されました');vault=pendingAuth.data;key=pendingAuth.key;clearPending();lastActivity=Date.now();render();showView('dashboard');toast('2段階の確認が完了しました');}
    // WebAuthn PRF is used as a device-gated key-encryption key. No secret or passphrase is sent off-device.
    async function prfWrapKey(prfOutput){
      const seed=await crypto.subtle.importKey('raw',prfOutput,'HKDF',false,['deriveKey']);
      return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:new Uint8Array(32),info:encoder.encode('KagiNote WebAuthn PRF wrapping v1')},seed,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    }
    async function getBiometricPrf(credentialId,salt){
      const credential=await navigator.credentials.get({publicKey:{challenge:randomBytes(32),allowCredentials:[{type:'public-key',id:b64ToBytes(credentialId),transports:['internal']}],userVerification:'required',timeout:60000,extensions:{prf:{eval:{first:salt}}}}});
      if(!credential || bytesToB64(new Uint8Array(credential.rawId))!==credentialId)throw Error('credential-mismatch');
      const raw=credential.getClientExtensionResults()?.prf?.results?.first;
      if(!raw || raw.byteLength!==32)throw Error('prf-unsupported');
      return new Uint8Array(raw);
    }
    function constantTimeEqual(a,b){if(a.length!==b.length)return false;let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];return mismatch===0;}
    $('bio-enroll-action').addEventListener('click',async()=>{
      if(busy||!installGateSatisfied()||!pendingAuth||root?.biometric)return;
      if(!biometricApiAvailable()){toast('この端末では認証の登録に対応していません。対応端末で開いてください');return;}
      setBusy(true,['bio-enroll-action']);
      try{
        const salt=randomBytes(32);
        const registered=await navigator.credentials.create({publicKey:{challenge:randomBytes(32),rp:{name:'鍵ノート'},user:{id:randomBytes(16),name:'local-user',displayName:'鍵ノート'},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'preferred',userVerification:'required'},attestation:'none',timeout:60000,extensions:{prf:{eval:{first:salt}}}}});
        if(!registered||registered.getClientExtensionResults()?.prf?.enabled===false)throw Error('prf-unsupported');
        const credentialId=bytesToB64(new Uint8Array(registered.rawId));
        const prf=await getBiometricPrf(credentialId,salt);
        let wrapKey;try{wrapKey=await prfWrapKey(prf)}finally{prf.fill(0)}
        const iv=randomBytes(12);
        const wrapped=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},wrapKey,pendingAuth.rawMaster));
        if(!pendingAuth)throw Error('認証が中断されました');
        writeRoot({...(pendingAuth.stagedRoot||root),biometric:{type:'webauthn-prf-v1',credentialId,salt:bytesToB64(salt),iv:bytesToB64(iv),wrapped:bytesToB64(wrapped)}});
        finishSecondFactor();
      }catch(err){toast(err?.name==='NotAllowedError'?'端末認証が中止されました。登録は必須です':'登録できません。端末とブラウザーのWebAuthn PRF対応をご確認ください');}
      finally{setBusy(false,['bio-enroll-action']);}
    });
    $('bio-verify-action').addEventListener('click',async()=>{
      if(busy||!installGateSatisfied()||!pendingAuth||!root?.biometric)return;
      if(!biometricApiAvailable()){toast('この端末では本人確認ができません');return;}
      setBusy(true,['bio-verify-action']);let unwrapped=null;
      try{
        const b=root.biometric;if(b.type!=='webauthn-prf-v1')throw Error('biometric-format');
        const prf=await getBiometricPrf(b.credentialId,b64ToBytes(b.salt));
        let wrapKey;try{wrapKey=await prfWrapKey(prf)}finally{prf.fill(0)}
        unwrapped=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(b.iv)},wrapKey,b64ToBytes(b.wrapped)));
        if(!pendingAuth||!constantTimeEqual(unwrapped,pendingAuth.rawMaster))throw Error('auth-mismatch');
        finishSecondFactor();
      }catch(err){toast(err?.name==='NotAllowedError'?'端末認証が中止されました。認証は必須です':'端末本人確認に失敗しました。記録は開いていません');}
      finally{unwrapped?.fill(0);setBusy(false,['bio-verify-action']);}
    });
    $('bio-enroll-cancel').addEventListener('click',lock);
    $('bio-verify-cancel').addEventListener('click',lock);
    // Install banner stays available before initial setup and on the locked screen.
    // Chromium can display a native prompt; Safari and other browsers get device-specific instructions.
    function installedMode(){return !!(window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true);}
    function updateInstallUI(){
      const installed=installGateSatisfied();$('install-banner').classList.toggle('hidden',!!installed);
      if(installed)return;
      $('install-action').textContent=installPrompt?'アプリをインストール':'画面にアプリを追加';
      $('install-state').textContent=installPrompt?'このボタンからインストールできます。':'スマホ・PCの画面にアイコンを追加できます。';
    }
    function showInstallHelp(){
      const agent=navigator.userAgent||'';const ios=/iPad|iPhone|iPod/.test(agent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
      const android=/Android/i.test(agent);
      const onChrome=/Chrome|CriOS/i.test(agent);const edge=/Edg|EdgiOS/i.test(agent);
      let steps='';
      if(location.protocol==='file:'){
        steps='このHTMLファイルのままでは、アプリとしてインストールできません。\n\n① ZIP内のファイルをHTTPS対応のWebサーバー（GitHub Pagesなど）に配置\n② 公開URLをブラウザーで開く\n③ ブラウザーのメニューからインストール';
      }else if(ios){
        steps='① ブラウザーで鍵ノートを開く\n② 「共有」メニュー（四角から上向き矢印）を開く\n③ 「ホーム画面に追加」を選ぶ\n④ 「追加」を押す\n\nメニューが見当たらなければSafariで開き直してください。';
      }else if(android){
        steps='① Chromeで鍵ノートのURLを開く\n② 右上の「︙」をタップ\n③ 「アプリをインストール」または「ホーム画面に追加」を選択\n④ 「インストール」または「追加」をタップ\n\n※ アプリ内ブラウザーの場合はChromeで開いてください。';
      }else{
        steps='① ChromeまたはEdgeで鍵ノートのURLを開く\n② アドレスバー内のインストールアイコン、またはブラウザーの「︙」メニューを開く\n③ 「アプリをインストール」を選択\n④ 必要ならOSのアプリ一覧からデスクトップショートカットを作成\n\nメニューが出ない場合はHTTPSで公開されているか確認してください。';
      }
      $('install-instructions').textContent=steps;
      $('install-file-warning').hidden=location.protocol!=='file:';
      $('install-dialog').showModal();
    }
    window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;updateInstallUI()});
    window.addEventListener('appinstalled',()=>{installPrompt=null;updateInstallUI();toast('インストール完了。ホーム画面・アプリ一覧の「鍵ノート」から起動してください')});
    window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change',()=>{updateInstallUI();if(installGateSatisfied()&&!$('install-required').classList.contains('hidden')){showView(root?'unlock':'setup');}else if(!installGateSatisfied()){lock();}});
    $('install-first-action').addEventListener('click',()=>{$('install-action').click()});
    $('install-action').addEventListener('click',async()=>{
      if(installGateSatisfied())return;
      if(!installPrompt){showInstallHelp();return;}
      const pending=installPrompt;installPrompt=null;updateInstallUI();
      try{
        await pending.prompt();
        const choice=await pending.userChoice;
        if(choice?.outcome!=='accepted')showInstallHelp();
      }catch{showInstallHelp()}
    });
    $('install-close').addEventListener('click',()=>$('install-dialog').close());
    $('install-done').addEventListener('click',()=>$('install-dialog').close());
    updateInstallUI();
    function setBusy(flag,ids){busy=flag;for(const id of ids)$(id).disabled=flag;}
    $('setup-form').addEventListener('submit',async e=>{
      e.preventDefault();if(busy)return;
      if(!installGateSatisfied()){showView('install-required');toast('先にアプリをホーム画面に追加してください');return;}
      const pass=$('setup-pw').value;
      if(pass.length<12||pass.length>256){toast('12〜256文字で設定してください');return;}
      if(pass!==$('setup-pw2').value){toast('確認用パスワードが一致しません');return;}
      if(!biometricApiAvailable()){toast('本人確認が利用できないため設定できません。対応端末をお使いください');return;}
      setBusy(true,['setup-submit']);let raw=null;
      try{
        const salt=randomBytes(16);raw=await deriveBytes(pass,salt,ITERATIONS);
        const k=await importVaultKey(raw);
        const r={app:'KagiNote',version:1,kdf:{name:'PBKDF2-SHA-256',iterations:ITERATIONS,salt:bytesToB64(salt)}};
        const v={entries:[]};const stagedRoot=await encryptVault(v,k,r);
        beginSecondFactor(raw,k,v,stagedRoot);raw=null;
        $('setup-pw').value=$('setup-pw2').value='';
        toast('端末本人確認の登録が完了するまでアプリは作成されません');
      }catch(err){toast('作成できませんでした。ブラウザーの設定・保存容量をご確認ください');}
      finally{raw?.fill(0);setBusy(false,['setup-submit']);}
    });
    $('unlock-form').addEventListener('submit',async e=>{
      e.preventDefault();if(busy)return;
      if(!installGateSatisfied()){showView('install-required');toast('最初にインストール手順を完了してください');return;}
      if(!biometricApiAvailable()){toast('端末本人確認が利用できないため開けません');return;}
      setBusy(true,['unlock-submit']);let raw=null;
      try{
        raw=await deriveBytes($('unlock-pw').value,b64ToBytes(root.kdf.salt),root.kdf.iterations);
        const k=await importVaultKey(raw);const v=await decryptVault(root,k);
        beginSecondFactor(raw,k,v);raw=null;
        $('unlock-pw').value='';
        toast(root?.biometric?'続けて端末本人確認を行ってください':'端末本人確認の登録が必須です');
      }catch(err){toast('マスターパスワードが違うか、保存データが破損しています');}
      finally{raw?.fill(0);setBusy(false,['unlock-submit']);}
    });
    function button(txt,click,small=true){const b=document.createElement('button');b.type='button';b.className='btn'+(small?' small':'');b.textContent=txt;b.addEventListener('click',click);return b;}
    function render(){if(!vault)return;const term=$('search').value.trim().toLocaleLowerCase();const records=vault.entries.filter(e=>(e.site+' '+e.account).toLocaleLowerCase().includes(term)).sort((a,b)=>a.site.localeCompare(b.site,'ja'));$('entry-count').textContent=String(vault.entries.length);const container=$('entries');container.replaceChildren();if(!records.length){const empty=document.createElement('div');empty.className='empty';const glyph=document.createElement('div');glyph.className='empty-icon';glyph.textContent=term?'⌕':'🔑';const p=document.createElement('div');p.textContent=term?'見つかりませんでした':'まだ登録がありません。「＋ 追加」から登録できます。';empty.append(glyph,p);container.append(empty);return}for(const e of records){const item=document.createElement('article');item.className='entry';const av=document.createElement('div');av.className='avatar';av.textContent=(e.site.trim().charAt(0)||'鍵').toLocaleUpperCase();const body=document.createElement('div');body.className='entry-body';const n=document.createElement('div');n.className='entry-name';n.textContent=e.site;const a=document.createElement('div');a.className='entry-detail';a.textContent=e.account||'ユーザー名の登録なし';body.append(n,a);const actions=document.createElement('div');actions.className='entry-actions';actions.append(button('コピー',()=>copyText(e.password)),button('編集',()=>openEntry(e.id)));item.append(av,body,actions);container.append(item)}}
    async function copyText(s){if(!vault)return;try{await navigator.clipboard.writeText(s);toast('コピーしました。貼り付け後、クリップボードの履歴にご注意ください')}catch(err){toast('コピーに失敗しました。編集画面から確認してください')}}
    function openEntry(id=null){if(!vault)return;editingId=id;const e=id?vault.entries.find(e=>e.id===id):null;if(id&&!e)return;$('entry-dialog-title').textContent=e?'パスワードを編集':'パスワードを追加';$('site').value=e?.site||'';$('account').value=e?.account||'';$('password').value=e?.password||'';$('password').type='password';$('show-password').textContent='表示';$('note').value=e?.note||'';$('delete-entry').classList.toggle('hidden',!e);$('entry-dialog').showModal();$('site').focus()}
    function closeEntry(){editingId=null;$('entry-dialog').close();$('entry-form').reset();}
    $('add-entry').addEventListener('click',()=>openEntry());$('entry-close').addEventListener('click',closeEntry);$('entry-cancel').addEventListener('click',closeEntry);$('lock-now').addEventListener('click',()=>{lock();toast('ロックしました')});$('search').addEventListener('input',render);
    $('show-password').addEventListener('click',()=>{const i=$('password');i.type=i.type==='password'?'text':'password';$('show-password').textContent=i.type==='password'?'表示':'隠す'});
    $('copy-edit-password').addEventListener('click',()=>{if($('password').value)copyText($('password').value);else toast('パスワードが空欄です')});
    $('entry-form').addEventListener('submit',async e=>{e.preventDefault();if(busy||!vault)return;const entry={id:editingId||randomId(),site:$('site').value.trim(),account:$('account').value.trim(),password:$('password').value,note:$('note').value};if(!entry.site||!entry.password){toast('サービス名とパスワードは必須です');return}const previous=structuredClone(vault);const index=vault.entries.findIndex(x=>x.id===editingId);if(index>=0&&vault.entries[index].password!==entry.password&&!confirm('保存済みのログインパスワードを変更します。変更してよろしいですか？'))return;if(index>=0)vault.entries[index]=entry;else vault.entries.push(entry);setBusy(true,['entry-save']);try{await save();closeEntry();render();toast('暗号化して保存しました')}catch(err){vault=previous;toast('保存できませんでした。保存容量をご確認ください')}finally{setBusy(false,['entry-save'])}});
    $('delete-entry').addEventListener('click',async()=>{if(!vault||!editingId||!confirm('この登録を完全に削除しますか？\n削除したデータは、バックアップがなければ復元できません。'))return;const prev=structuredClone(vault);vault.entries=vault.entries.filter(e=>e.id!==editingId);try{await save();closeEntry();render();toast('削除しました')}catch{vault=prev;toast('削除を保存できませんでした')}});
    $('backup-export').addEventListener('click',async()=>{
      if(!root||!vault)return;
      try{
        // Passkeys are bound to this site/device. Never export the device-specific biometric credential/wrapper.
        const {biometric,...portable}=root;
        const backup={...portable,exportedAt:new Date().toISOString()};
        const data=JSON.stringify(backup,null,2);
        const file='kaginote-backup-'+new Date().toISOString().slice(0,10)+'.json';
        if('showSaveFilePicker' in window){
          try{const handle=await window.showSaveFilePicker({suggestedName:file,types:[{description:'暗号化バックアップ',accept:{'application/json':['.json']}}]});const writer=await handle.createWritable();await writer.write(data);await writer.close();toast('指定した場所に暗号化バックアップを保存しました');return}
          catch(err){if(err?.name==='AbortError')return;/* Fallback to normal browser download. */}
        }
        const blob=new Blob([data],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=file;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);toast('バックアップをダウンロードしました。保存先を確認してください');
      }catch{toast('バックアップを作成できませんでした')}
    });
    $('backup-import').addEventListener('click',()=>{$('import-input').click()});$('import-locked').addEventListener('click',()=>{$('import-input').click()});$('import-new').addEventListener('click',()=>{$('import-input').click()});
    $('import-input').addEventListener('change',async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;if(f.size>6000000){toast('バックアップが大きすぎます');return}let backup;try{backup=JSON.parse(await f.text());if(!isValidRoot(backup))throw Error('format')}catch{toast('鍵ノートの正しいバックアップではありません');return}const pass=prompt('復元するバックアップのマスターパスワードを入力してください。');if(pass===null)return;try{const k=await derive(pass,b64ToBytes(backup.kdf.salt),backup.kdf.iterations);await decryptVault(backup,k);}catch{toast('バックアップを開けません。パスワードまたはデータを確認してください');return}if(!confirm('現在の保存データをすべて置き換えます。\n必要なら先に暗号化バックアップを保存してください。\n本当に復元しますか？'))return;try{writeRoot({app:backup.app,version:backup.version,kdf:backup.kdf,encryption:backup.encryption});lock();toast('バックアップを復元しました。バックアップのマスターパスワードで解除してください')}catch{toast('復元できませんでした。保存容量をご確認ください')}});
    $('change-master').addEventListener('click',()=>{if(!vault)return;$('master-form').reset();$('master-dialog').showModal()});$('master-close').addEventListener('click',()=>$('master-dialog').close());$('master-cancel').addEventListener('click',()=>$('master-dialog').close());
    $('master-form').addEventListener('submit',async e=>{e.preventDefault();if(!vault||busy)return;const old=$('master-old').value,newPass=$('master-new').value;if(newPass.length<12||newPass.length>256){toast('新しいマスターパスワードは12〜256文字にしてください');return}if(newPass!==$('master-confirm').value){toast('確認用パスワードが一致しません');return}setBusy(true,['master-save']);try{const k=await derive(old,b64ToBytes(root.kdf.salt),root.kdf.iterations);await decryptVault(root,k);const salt=randomBytes(16),newKey=await derive(newPass,salt,ITERATIONS);const newRoot=await encryptVault(vault,newKey,{app:'KagiNote',version:1,kdf:{name:'PBKDF2-SHA-256',iterations:ITERATIONS,salt:bytesToB64(salt)}});writeRoot(newRoot);key=newKey;$('master-dialog').close();$('master-form').reset();lock();toast('パスワードを変更しました。次回の解除時に端末認証を再登録してください')}catch{toast('現在のパスワードが違うか、変更を保存できませんでした')}finally{setBusy(false,['master-save'])}});
    document.addEventListener('pointerdown',activity,{passive:true});document.addEventListener('keydown',activity);document.addEventListener('visibilitychange',()=>{if(document.hidden&&(vault||pendingAuth)&&!busy)lock()});window.addEventListener('pagehide',()=>{if(vault||pendingAuth)lock()});setInterval(checkIdle,15000);
    // This service worker caches only the app shell; no user secrets are sent to a server.
    if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{}));
    start();
  })();
