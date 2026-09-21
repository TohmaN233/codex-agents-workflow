import test from 'node:test';
import assert from 'node:assert/strict';
import { REVIEW_IDS, evaluateReview, reviewIds, reviewSchema } from '../lib/skill-import/review-checklist.mjs';

const proposal={source_requirements:[{requirement_id:'approval_2',requirement_kind:'approval',source_spans:[{resource:'source/SKILL.md',start_line:2,end_line:2}],trigger:'before completion',required_result:'approved'}],requirement_mappings:[{requirement_id:'approval_2',node_ids:['work','confirm'],status:'compiled'}],source_dispositions:[{section_id:'section_01_overview',disposition:'workflow',node_ids:['work','confirm'],requirement_ids:['approval_2'],rationale:'The entrypoint defines the work and confirmation boundary.'}],nodes:[{id:'work',type:'agent',requirement_ids:['approval_2']},{id:'confirm',type:'human_gate',requirement_ids:['approval_2']}],edges:[{id:'work-confirm'}]};
const resources={'source/SKILL.md':Buffer.from('Perform work.\nConfirm it.')};
const result=(ids=REVIEW_IDS)=>({checks:ids.map(id=>({id,status:'pass',evidence:'The cited source is preserved in work and its confirmation.',node_ids:['work','confirm'],edge_ids:['work-confirm'],source_spans:[{resource:'source/SKILL.md',start_line:1,end_line:2}]}))});

test('verdict is computed from complete checks rather than a model approval flag',()=>{
  assert.equal(evaluateReview(result(),proposal,resources).approved,true);
  const failed=result();failed.checks[0].status='fail';failed.checks[0].evidence='Separate independent inputs before synthesis.';
  const verdict=evaluateReview(failed,proposal,resources);assert.equal(verdict.approved,false);assert.match(verdict.findings[0],/^\[parallelism\]/);
  assert.throws(()=>evaluateReview({...result(),approved:true},proposal,resources),{code:'GENERATION_CHECKLIST_INVALID'});
});

test('missing, duplicate, invented, empty and ungrounded checklist entries are rejected',()=>{
  for(const mutate of [
    r=>r.checks.pop(), r=>r.checks[1].id=r.checks[0].id,r=>r.checks[0].id='invented',
    r=>r.checks[0].evidence=' ',r=>r.checks[0].node_ids=['nonexistent'],r=>r.checks[0].edge_ids=['nonexistent'],
    r=>r.checks[0].source_spans[0].end_line=100,r=>r.checks[0].source_spans[0].resource='missing',
    r=>r.checks.find(c=>c.id==='source_support').node_ids.pop(),
    r=>r.checks.find(c=>c.id==='phase_order').source_spans=[],
    r=>r.checks.find(c=>c.id==='human_confirmation').status='not_applicable',
  ]){const value=result();mutate(value);assert.throws(()=>evaluateReview(value,proposal,resources),{code:'GENERATION_CHECKLIST_INVALID'});}
});

test('not-applicable requires an allowed rule and still retains its explanation',()=>{
  const value=result();value.checks.find(c=>c.id==='conditional_dependencies').status='not_applicable';
  assert.equal(evaluateReview(value,proposal,resources).approved,true);
  value.checks.find(c=>c.id==='model_selection').status='not_applicable';
  assert.throws(()=>evaluateReview(value,proposal,resources),{code:'GENERATION_CHECKLIST_INVALID'});
});

test('persisted v2, v3, and v4 review contracts retain their pinned checklist shape',()=>{
  for(const version of [2,3,4]) { const ids=reviewIds(version); const value={checks:ids.map(id=>({id,status:'pass',evidence:'Pinned legacy review.',node_ids:['work','confirm'],edge_ids:['work-confirm'],source_spans:[{resource:'source/SKILL.md',start_line:1,end_line:2}]}))}; assert.equal(evaluateReview(value,proposal,resources,{version}).approved,true); assert.equal(reviewSchema(version).properties.checks.minItems,ids.length); }
});

test('v4 all-pass model review cannot approve an explicitly unsupported requirement',()=>{
  const unsupported=structuredClone(proposal);unsupported.requirement_mappings[0].status='unsupported';
  const ids=reviewIds(4); const review={checks:ids.map(id=>({id,status:'pass',evidence:'Pinned v4 review.',node_ids:['work','confirm'],edge_ids:['work-confirm'],source_spans:[{resource:'source/SKILL.md',start_line:1,end_line:2}]}))};
  const verdict=evaluateReview(review,unsupported,resources,{version:4});
  assert.equal(verdict.approved,false);assert(verdict.findings.some(finding=>finding.includes('remains unsupported')));
});

test('v5 replay remains pinned and does not receive current host projection',()=>{
  const current=structuredClone(proposal);
  current.source_requirements.push({requirement_id:'canonical_time',requirement_kind:'canonicalization',source_spans:[{resource:'source/SKILL.md',start_line:1,end_line:1}],trigger:'before final validation',required_result:'whole-second UTC'});
  current.requirement_mappings.push({requirement_id:'canonical_time',node_ids:['work'],status:'compiled'});
  current.nodes[0].requirement_ids.push('canonical_time');
  const verdict=evaluateReview(result(reviewIds(5)),current,resources,{version:5});
  assert.equal(verdict.approved,false);assert(verdict.findings.some(finding=>finding.includes('canonical_time')));
});

test('a mapped producer output satisfies a requirement binding without a fake input echo',()=>{
  const current=structuredClone(proposal);
  current.source_requirements.push({requirement_id:'produced_result',requirement_kind:'data_dependency',source_spans:[{resource:'source/SKILL.md',start_line:1,end_line:1}],trigger:'produce',required_result:'Produce result.',resource_refs:[],details:{}});
  current.requirement_mappings.push({requirement_id:'produced_result',node_ids:['work'],binding_names:['result'],runtime_guards:[],resource_refs:[],status:'compiled',rationale:'The work node produces result.'});
  current.nodes[0].outputs_schema={type:'object',properties:{result:{type:'string'}},required:['result']};
  current.nodes[0].requirement_ids.push('produced_result');
  assert.equal(evaluateReview(result(),current,resources).approved,true);
});
