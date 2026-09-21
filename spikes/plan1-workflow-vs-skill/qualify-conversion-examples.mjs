#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorkflowService } from '../../plugins/codex-agents-workflow/control-plane/lib/workflow-service.mjs';
import { importCoarseSkill } from '../../plugins/codex-agents-workflow/control-plane/lib/skill-import/coarse-compiler.mjs';
import { sourceSectionInventory } from '../../plugins/codex-agents-workflow/control-plane/lib/skill-import/source-dispositions.mjs';
import { observedSourceRequirements } from '../../plugins/codex-agents-workflow/control-plane/lib/skill-import/source-requirements.mjs';
import { requireCurrentConversionCertificate } from '../../plugins/codex-agents-workflow/control-plane/lib/skill-import/conversion-certificate.mjs';
import { resolveConfigPath } from '../../plugins/codex-agents-workflow/control-plane/lib/config.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const pluginRoot=resolve(here,'../../plugins/codex-agents-workflow');
const defaultConfigPath=join(pluginRoot,'control-plane','default-config.json');
const outputPath=resolve(process.argv[2] ?? join(here,'conversion-qualification-results.json'));
const requested=new Set(process.argv.slice(3));
const examples=[
  {id:'zenonzard',skillPath:'D:/Zenonzard_game/.agents/skills/write-zenonzard-cards/SKILL.md'},
  {id:'video-use',skillPath:'C:/Users/tgy23/Documents/Codex/2026-09-04/wo-m/outputs/sol-video-workflow-lab/.agents/skills/video-use/SKILL.md'},
].filter(item=>requested.size===0 || requested.has(item.id));
const service=new WorkflowService({configPath:resolveConfigPath(),defaultConfigPath});
const delay=ms=>new Promise(resolveDelay=>setTimeout(resolveDelay,ms));

function assert(condition,message){if(!condition)throw Object.assign(new Error(message),{code:'CONVERSION_QUALIFICATION_FAILED'});}

async function runExample(example,index){
  const suffix=`${Date.now().toString(36)}-${index}`;
  const workflowId=`qualification-${example.id}-${suffix}`;
  const runId=`qualify-${example.id}-${suffix}`;
  const {store}=await service.open();
  let latest=null;
  let control=null;
  try {
    const coarse=await importCoarseSkill(store,example.skillPath,{id:workflowId,name:`Qualification: ${example.id}`,providerId:'native-terra',role:'implementer'});
    const resources=await store.resources(workflowId,coarse.revision_hash);
    const sourceInventory=sourceSectionInventory(resources);
    const observed=observedSourceRequirements(resources);
    const started=await service.call('start_generation',{workflow_id:workflowId,revision_hash:coarse.revision_hash,run_id:runId,provider_id:'native-terra'},{human:true});
    control={run_id:started.run_id,control_token:started.control_token};
    let accepted=null;
    for(let step=0;;step++){
      const state=await service.call('advance_generation',control,{human:true});
      process.stderr.write(`${JSON.stringify({example:example.id,step,phase:state.phase,error:state.error?.code ?? null})}\n`);
      if(['review_required','ready_to_apply'].includes(state.phase)){
        accepted=await service.call('accept_generation',{...control,accepted:true},{human:true});
        break;
      }
      if(state.phase==='attention')throw Object.assign(new Error(`${example.id}: ${state.error?.code ?? state.status}: ${state.error?.message ?? 'generation needs attention'}`),{code:state.error?.code ?? 'GENERATION_ATTENTION',details:state});
      if(state.phase==='authentication_required')throw Object.assign(new Error(`${example.id}: managed authentication is required`),{code:'GENERATION_AUTH_REQUIRED'});
      await delay(3000);
    }
    assert(accepted,`${example.id}: generation did not reach review acceptance`);
    latest=await store.snapshot(workflowId);
    requireCurrentConversionCertificate(latest.workflow,latest.resources,latest.import_report);
    const {runtime}=await service.open();
    const record=await runtime.runs.read(runId);
    const dispositions=latest.import_report.expansion.source_dispositions;
    const bySection=new Map(dispositions.map(item=>[item.section_id,item]));
    const required=sourceInventory.filter(item=>item.authority==='required');
    const candidates=sourceInventory.filter(item=>item.authority!=='required');
    assert(required.every(item=>['workflow','conditional'].includes(bySection.get(item.section_id)?.disposition)),`${example.id}: a required section was weakened or omitted`);
    assert(!latest.workflow.import_status.requirement_coverage.some(item=>item.status==='unsupported'),`${example.id}: an explicit source requirement remains unsupported`);
    if(example.id==='zenonzard') assert(dispositions.length===5 && dispositions.every(item=>['workflow','conditional'].includes(item.disposition)),'zenonzard: all five workflow-contract sections must remain actionable');
    if(example.id==='video-use'){
      assert(candidates.every(item=>bySection.get(item.section_id)?.disposition!=='workflow'),'video-use: a worked-example section was incorrectly promoted to a universal rule');
      assert(candidates.some(item=>['reference','omit'].includes(bySection.get(item.section_id)?.disposition)),'video-use: no optional worked example was pruned or demoted');
    }
    const plannerAttempts=record.state.nodes.expand.attempts.length;
    const reviewerAttempts=record.state.nodes.final.attempts.length;
    assert(plannerAttempts<=2,`${example.id}: conversion required more than one bounded semantic repair`);
    const result={
      example:example.id,
      source:{path:example.skillPath,revision:coarse.revision_hash,sections:sourceInventory,observed_requirements:observed},
      workflow:{id:workflowId,revision:latest.revision_hash,conversion_level:latest.workflow.import_status.conversion_level,nodes:latest.workflow.nodes.filter(node=>!['start','final','end'].includes(node.id)).map(node=>({id:node.id,name:node.name ?? null,type:node.type,executor:node.executor,prompt_template:node.prompt_template ?? null,source_requirements:node.source_requirements ?? [],resources:node.resources ?? []})),edges:latest.workflow.edges.filter(edge=>edge.id!=='final-end'),requirement_coverage:latest.workflow.import_status.requirement_coverage,source_dispositions:dispositions},
      validation:{certificate:latest.import_report.expansion.certificate,certificate_valid:true,planner_attempts:plannerAttempts,reviewer_attempts:reviewerAttempts,repair_actions:record.state.generation_projection?.repair_actions ?? [],last_repair:record.state.generation_repair ?? null,required_sections_retained:required.length,candidate_sections_demoted:candidates.filter(item=>['reference','omit'].includes(bySection.get(item.section_id)?.disposition)).length,status:'PASS'},
    };
    return result;
  } finally {
    const cleanupErrors=[];
    if(control){
      try {const {runtime}=await service.open(),record=await runtime.runs.read(runId);if(['running','blocked','paused'].includes(record.state.status))await service.call('cancel',control,{human:true});}
      catch(error){if(error.code!=='RUN_MISSING')cleanupErrors.push(error);}
    }
    try {const current=latest ?? await store.snapshot(workflowId).catch(error=>error.code==='WORKFLOW_NOT_FOUND'?null:Promise.reject(error));if(current)await service.call('delete',{workflow_id:workflowId,expected_revision:current.revision_hash});}
    catch(error){cleanupErrors.push(error);}
    if(cleanupErrors.length)throw Object.assign(new AggregateError(cleanupErrors,`${example.id}: qualification cleanup failed`),{code:'CONVERSION_QUALIFICATION_CLEANUP'});
  }
}

async function settleExample(example,index){
  try{return await runExample(example,index);}
  catch(error){return {example:example.id,source:{path:example.skillPath},validation:{status:'FAIL',error:{code:error.code ?? 'CONVERSION_QUALIFICATION_FAILED',message:error.message,details:error.details ?? null}}};}
}

const results=await Promise.all(examples.map(settleExample));
const report={version:1,kind:'skill2workflow_conversion_qualification',generated_at:new Date().toISOString(),experiment_rerun:false,planner:{provider_id:'native-terra'},reviewer:{provider_id:'native-generation-reviewer'},status:results.every(item=>item.validation.status==='PASS')?'PASS':'FAIL',results};
await mkdir(dirname(outputPath),{recursive:true});
await writeFile(outputPath,JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify({output:outputPath,status:report.status,results:results.map(item=>({example:item.example,conversion_level:item.workflow?.conversion_level ?? null,planner_attempts:item.validation.planner_attempts ?? null,reviewer_attempts:item.validation.reviewer_attempts ?? null,required_sections_retained:item.validation.required_sections_retained ?? null,candidate_sections_demoted:item.validation.candidate_sections_demoted ?? null,error:item.validation.error ?? null}))},null,2)+'\n');
if(report.status!=='PASS')process.exitCode=1;
