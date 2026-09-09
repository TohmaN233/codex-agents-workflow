import test from 'node:test';
import assert from 'node:assert/strict';
import { REVIEW_IDS, evaluateReview } from '../lib/skill-import/review-checklist.mjs';

const proposal={nodes:[{id:'work',type:'agent'},{id:'confirm',type:'human_gate'}],edges:[{id:'work-confirm'}]};
const resources={'source/SKILL.md':Buffer.from('Perform work.\nConfirm it.')};
const result=()=>({checks:REVIEW_IDS.map(id=>({id,status:'pass',evidence:'The cited source is preserved in work and its confirmation.',node_ids:['work','confirm'],edge_ids:['work-confirm'],source_spans:[{resource:'source/SKILL.md',start_line:1,end_line:2}]}))});

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
