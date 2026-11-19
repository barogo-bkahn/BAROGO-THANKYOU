import test from 'node:test';
import assert from 'node:assert/strict';
import {sameOrganization,orgValue} from '../src/organization.mjs';
test('part3 takes precedence and part1/part2 do not override it',()=>{
 assert.equal(sameOrganization({part1:'A',part2:'X',part3:'팀A'},{part1:'B',part2:'Y',part3:'팀A'}),true);
 assert.equal(sameOrganization({part2:'X',part3:'팀A'},{part2:'X',part3:'팀B'}),false);
});
test('empty sender part3 compares part2 even when recipient has part3',()=>{
 assert.equal(sameOrganization({part2:'실A',part3:''},{part2:'실A',part3:'팀A'}),true);
 assert.equal(sameOrganization({part2:'실A',part3:'-'},{part2:'실B',part3:'팀A'}),false);
});
test('mixed levels preserve directionality',()=>{
 const manager={part2:'실A',part3:null},member={part2:'실A',part3:'팀A'};
 assert.equal(sameOrganization(manager,member),true);
 assert.equal(sameOrganization(member,manager),false);
});
test('dash and whitespace are empty; missing both cannot be classified',()=>{
 assert.equal(orgValue(' - '),null);assert.equal(orgValue(' 팀A '),'팀A');
 assert.equal(sameOrganization({part2:'-',part3:''},{part2:'실A',part3:'팀A'}),null);
});
test('explicit exception bypasses only organization restriction',()=>{
 assert.equal(sameOrganization({org_exempt:true,part2:'A',part3:'X'},{part2:'A',part3:'X'}),false);
 assert.equal(sameOrganization({org_exempt:true},{part2:'A'}),false);
});
