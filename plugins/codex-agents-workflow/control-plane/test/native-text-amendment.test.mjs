import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTextAmendment,textLineCount,validateTextRepairScope,validateTextAmendmentDeclaration} from '../lib/execution/native-text-amendment.mjs';

const config={fields:['markdown'],repair_scope_field:'repair_scope',max_edits:8,max_replacement_bytes:100};
const baseline={markdown:'first\r\n😀 middle\nlast',conclusion:'unchanged'};
const scope={markdown:[{start_line:1,end_line:3}]};
const edit=(start_line,end_line,replacement,field='markdown')=>({field,start_line,end_line,replacement});
const merge=amendments=>applyTextAmendment(baseline,scope,config,{amendments});

test('text amendment splices exact physical lines with CRLF LF CR nonBMP and no final newline',()=>{
  assert.deepEqual(merge([edit(2,2,'新😀\r\n')]),{markdown:'first\r\n新😀\r\nlast',conclusion:'unchanged'});
  assert.equal(merge([edit(3,3,'end')]).markdown,'first\r\n😀 middle\nend');
  assert.equal(merge([edit(3,3,'end\r')]).markdown,'first\r\n😀 middle\nend\r');
  assert.equal(merge([edit(2,2,'')]).markdown,'first\r\nlast');
  assert.equal(merge([edit(1,1,'new\r'),edit(3,3,'tail')]).markdown,'new\r😀 middle\ntail');
  for(const text of ['', 'a', 'a\r\n','a\n','a\r'])assert.equal(textLineCount(text),1);
  assert.equal(textLineCount('a\r\n\r\n'),2);assert.equal(textLineCount('😀\rx\ny\r\nz'),4);
  assert.equal(baseline.markdown,'first\r\n😀 middle\nlast');
});

test('text amendment rejects extra keys unknown fields overlap range limits and implicit joined lines',()=>{
  for(const payload of [[],[edit(1,1,'no newline')],[edit(3,2,'x')],[edit(0,1,'x')],[edit(4,4,'x')],
    [edit(1,2,'x\n'),edit(2,2,'x\n')],[edit(2,2,'x\n'),edit(1,1,'x\n')],[edit(1,1,'x\n','conclusion')],
    [{...edit(1,1,'x\n'),extra:true}],[edit(3,3,'😀'.repeat(30))],[edit(3,3,'\ud800')]]){
    assert.throws(()=>merge(payload),{code:'NATIVE_TEXT_AMENDMENT'});
  }
  assert.throws(()=>applyTextAmendment(baseline,scope,config,{amendments:[edit(3,3,'x')],other:true}),{code:'NATIVE_TEXT_AMENDMENT'});
  assert.throws(()=>applyTextAmendment(baseline,{markdown:[{start_line:2,end_line:2}]},config,{amendments:[edit(1,1,'x\n')]}),{code:'NATIVE_TEXT_AMENDMENT'});
  assert.throws(()=>applyTextAmendment(baseline,scope,{...config,max_edits:1},{amendments:[edit(1,1,'x\n'),edit(3,3,'z')]}),{code:'NATIVE_TEXT_AMENDMENT'});
});

test('text repair scope rejects empty unknown malformed unordered and out of bounds ranges',()=>{
  for(const bad of [{},{markdown:[]},{conclusion:[{start_line:1,end_line:1}]},{markdown:[{start_line:1,end_line:4}]},
    {markdown:[{start_line:1,end_line:2},{start_line:2,end_line:3}]},{markdown:[{start_line:1,end_line:1,extra:true}]},
    {markdown:[{start_line:1.5,end_line:2}]}])assert.throws(()=>validateTextRepairScope(baseline,bad,config),{code:'NATIVE_TEXT_AMENDMENT'});
});

test('text amendment declaration requires native mode required strings and typed checker scope',()=>{
  const line={type:'integer',minimum:1};
  const tool={output_schema:{type:'object',required:['repair_scope'],properties:{repair_scope:{type:'object',additionalProperties:false,properties:{markdown:{type:'array',items:{type:'object',additionalProperties:false,required:['start_line','end_line'],properties:{start_line:line,end_line:line}}}}}}}};
  const node={outputs_schema:{type:'object',required:['markdown'],properties:{markdown:{type:'string'}}},completion_contract:{host_check:{text_amendment:config}}};
  assert.doesNotThrow(()=>validateTextAmendmentDeclaration(node,tool,true));
  assert.throws(()=>validateTextAmendmentDeclaration(node,tool,false),{code:'NATIVE_TEXT_AMENDMENT_MODE'});
  const main={...node,executor:{kind:'main',mode:'worker'},outputs_schema:{type:'object',properties:{results:{type:'array',items:node.outputs_schema}}},
    fanout:{result_mode:'per_item',distribution:'one_per_item',result_output:'results'}};
  assert.doesNotThrow(()=>validateTextAmendmentDeclaration(main,tool,false));
  assert.throws(()=>validateTextAmendmentDeclaration({...node,executor:{kind:'main',mode:'worker'}},tool,false),{code:'NATIVE_TEXT_AMENDMENT_MODE'});
  assert.throws(()=>validateTextAmendmentDeclaration({...main,fanout:{...main.fanout,distribution:'partition'}},tool,false),{code:'NATIVE_TEXT_AMENDMENT_MODE'});
  const large=structuredClone(main);large.completion_contract.host_check.text_amendment.max_replacement_bytes=2097152;
  assert.doesNotThrow(()=>validateTextAmendmentDeclaration(large,tool,false));
  large.completion_contract.host_check.text_amendment.max_replacement_bytes++;assert.throws(()=>validateTextAmendmentDeclaration(large,tool,false),{code:'NATIVE_TEXT_AMENDMENT_CONTRACT'});
  for(const change of [n=>n.outputs_schema.required=[],n=>n.outputs_schema.properties.markdown.type='number',n=>n.completion_contract.host_check.text_amendment.max_edits=65,
    n=>n.completion_contract.host_check.text_amendment.extra=true]){const changed=structuredClone(node);change(changed);assert.throws(()=>validateTextAmendmentDeclaration(changed,tool,true),{code:'NATIVE_TEXT_AMENDMENT_CONTRACT'});}
  const partition={...node,fanout:{distribution:'partition'}};assert.throws(()=>validateTextAmendmentDeclaration(partition,tool,true),{code:'NATIVE_TEXT_AMENDMENT_MODE'});
  const badTool=structuredClone(tool);badTool.output_schema.properties.repair_scope.required=['markdown'];assert.throws(()=>validateTextAmendmentDeclaration(node,badTool,true),{code:'NATIVE_TEXT_AMENDMENT_SCOPE_SCHEMA'});
});
