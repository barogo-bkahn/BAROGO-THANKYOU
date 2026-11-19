import test from 'node:test';
import assert from 'node:assert/strict';
import {homeView} from '../../src/blocks.mjs';
test('Slack exchange CTA only renders with a configured safe production URL',()=>{
 const links=url=>homeView({exchange_url:url}).blocks.flatMap(b=>b.elements??[]).filter(b=>b.action_id==='exchange_open');
 assert.equal(links().length,0);assert.equal(links('javascript:alert(1)').length,0);assert.equal(links('http://127.0.0.1:7341').length,0);assert.equal(links('https://username:password@example.com').length,0);assert.equal(links('https://exchange.example.com')[0].url,'https://exchange.example.com/');
});
test('localhost test CTA is restricted to the configured signed-in user and exact approved URL',()=>{
 const links=context=>homeView({},context).blocks.flatMap(b=>b.elements??[]).filter(b=>b.action_id==='exchange_open');
 const config={user:'UTEST',testUser:'UTEST',testUrl:'http://127.0.0.1:7341'};
 assert.equal(links(config)[0].url,config.testUrl);
 assert.equal(links({...config,user:'UOTHER'}).length,0);
 assert.equal(links({...config,testUrl:'http://evil.example'}).length,0);
 assert.equal(links({...config,testUser:undefined}).length,0);
});

test('Dev LAN link renders only for private http addresses',()=>{
 const links=url=>homeView({exchange_lan_url:url}).blocks.flatMap(x=>x.elements??[]).filter(x=>x.action_id==='exchange_open');
 assert.equal(links('http://10.10.20.31:5000').length,1);assert.equal(links('http://192.168.0.5:5000').length,1);assert.equal(links('http://172.20.1.2:5000').length,1);
 for(const bad of ['http://8.8.8.8:5000','https://10.10.20.31:5000','http://user:pw@10.10.20.31:5000','http://127.0.0.1:5000','http://172.40.1.2:5000','javascript:alert(1)',undefined])assert.equal(links(bad).length,0);
});
