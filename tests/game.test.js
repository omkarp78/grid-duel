const assert=require('node:assert/strict');
const G=require('../dist/game.js');
let state=G.createMatch();
assert.equal(state.playerEnergy,10);
state=G.resolveBattle(state,4,2);assert.equal(state.playerScore,1);assert.equal(state.playerEnergy,6);assert.equal(state.territories[0],'player');
state=G.resolveBattle(state,2,2);assert.equal(state.round,2);assert.equal(state.territories[1],'draw');
state=G.resolveBattle(state,2,3);assert.equal(state.rivalScore,1);
state=G.resolveBattle(state,0,2);assert.equal(state.rivalScore,2);
state=G.resolveBattle(state,0,1);assert.equal(state.status,'lost');
assert.equal(G.clampBid(99,4),4);assert.equal(G.clampBid(-2,4),0);assert.equal(G.clampBid('x',4),0);
for(let i=0;i<100;i++){const fresh=G.createMatch();const bid=G.chooseBotBid(fresh);assert.ok(bid>=0&&bid<=fresh.rivalEnergy)}
let tied=G.createMatch();tied=G.resolveBattle(tied,1,1);tied=G.resolveBattle(tied,1,1);tied=G.resolveBattle(tied,1,1);tied=G.resolveBattle(tied,1,1);tied=G.resolveBattle(tied,1,1);assert.equal(tied.status,'playing');assert.equal(tied.tiebreak,true);assert.equal(tied.territories.length,8);
console.log('All game-engine tests passed.');
