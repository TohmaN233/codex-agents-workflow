import { useState } from 'react';
import { api, Field, useLocale, type Json } from './shared';

export function WorkflowInstallPanel({act,busy,installed,back}:{act:(operation:()=>Promise<void>)=>void,busy:number,installed:(pack:Json)=>Promise<void>,back:()=>void}){
  const t=useLocale();const [sourceUrl,setSourceUrl]=useState(''),[packageJson,setPackageJson]=useState(''),[expectedSha256,setExpectedSha256]=useState('');
  const install=()=>act(async()=>{
    const args:Json={};
    if(sourceUrl.trim()){args.source_url=sourceUrl.trim();if(expectedSha256.trim())args.expected_sha256=expectedSha256.trim();}
    else {if(!packageJson.trim())throw new Error(t('请粘贴安装包 JSON 或填写 HTTPS 地址。','Paste package JSON or enter an HTTPS URL.'));args.package=JSON.parse(packageJson);}
    await installed(await api('install_workflow_package',args));
  });
  return <main className="detail-page scroll"><span className="eyebrow">{t('Workflow 生态','Workflow ecosystem')}</span><h1>{t('安装 Workflow','Install a Workflow')}</h1><p>{t('安装经过内容哈希、格式版本、Workflow Schema、资源清单和依赖清单校验。远程安装只接受 HTTPS；可选 SHA-256 用于固定下载内容。','Installation verifies the content digest, package format, Workflow schema, resources, and dependency manifest. Remote installation accepts HTTPS only; an optional SHA-256 pins the downloaded bytes.')}</p><Field label={t('云端安装包 HTTPS 地址','Cloud package HTTPS URL')} value={sourceUrl} onChange={setSourceUrl}/><Field label={t('下载文件 SHA-256（可选）','Downloaded file SHA-256 (optional)')} value={expectedSha256} onChange={setExpectedSha256}/><Field label={t('或粘贴本地安装包 JSON','Or paste a local package JSON')} value={packageJson} multiline onChange={setPackageJson}/><button className="primary" disabled={busy>0} onClick={install}>{t('校验并安装','Validate and install')}</button><button disabled={busy>0} onClick={back}>{t('返回流程库','Back to library')}</button></main>;
}
