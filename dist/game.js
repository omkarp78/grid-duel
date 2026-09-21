(function(global){
  const TOTAL_ENERGY=10;
  const TOTAL_TERRITORIES=5;
  const TIEBREAK_TERRITORIES=3;
  const TARGET_SCORE=3;

  function createMatch(){return{playerEnergy:TOTAL_ENERGY,rivalEnergy:TOTAL_ENERGY,playerScore:0,rivalScore:0,round:0,territories:Array(TOTAL_TERRITORIES).fill(null),history:[],tiebreak:false,status:'playing'}}
  function clampBid(value,energy){const parsed=Number(value);return Number.isFinite(parsed)?Math.max(0,Math.min(energy,Math.floor(parsed))):0}
  function resolveBattle(state,playerBid,rivalBid){
    if(state.status!=='playing')throw new Error('Match is already complete');
    const p=clampBid(playerBid,state.playerEnergy),r=clampBid(rivalBid,state.rivalEnergy);
    let winner='draw';
    if(p>r)winner='player';else if(r>p)winner='rival';
    const next={...state,playerEnergy:state.playerEnergy-p,rivalEnergy:state.rivalEnergy-r,playerScore:state.playerScore+(winner==='player'?1:0),rivalScore:state.rivalScore+(winner==='rival'?1:0),territories:[...state.territories],history:[...state.history,{round:state.round+1,playerBid:p,rivalBid:r,winner}]};
    next.territories[state.round]=winner;
    const played=state.round+1,total=state.territories.length,remaining=total-played;
    if(played===TOTAL_TERRITORIES&&total===TOTAL_TERRITORIES&&next.playerScore===next.rivalScore){next.territories.push(...Array(TIEBREAK_TERRITORIES).fill(null));next.tiebreak=true;next.round=played;return next}
    const decided=next.playerScore>=TARGET_SCORE||next.rivalScore>=TARGET_SCORE||Math.abs(next.playerScore-next.rivalScore)>remaining||played===total;
    if(decided){next.status=next.playerScore>next.rivalScore?'won':next.rivalScore>next.playerScore?'lost':'draw'}else next.round=state.round+1;
    return next;
  }
  function chooseBotBid(state,random=Math.random){
    if(state.rivalEnergy<=0)return 0;
    const roundsLeft=state.territories.length-state.round;
    const rivalNeeds=TARGET_SCORE-state.rivalScore;
    const playerAverage=state.history.length?state.history.reduce((sum,item)=>sum+item.playerBid,0)/state.history.length:2;
    const affordablePace=Math.ceil(state.rivalEnergy/roundsLeft);
    let target;
    if(rivalNeeds>=roundsLeft)target=affordablePace;
    else if(state.playerScore===TARGET_SCORE-1)target=Math.round(playerAverage)+1;
    else if(random()<.18&&roundsLeft>1)target=0;
    else target=Math.round(playerAverage+(random()*3-1));
    return clampBid(Math.min(target,affordablePace+2),state.rivalEnergy);
  }
  const api={TOTAL_ENERGY,TOTAL_TERRITORIES,TIEBREAK_TERRITORIES,TARGET_SCORE,createMatch,clampBid,resolveBattle,chooseBotBid};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  global.GridDuel=api;
})(typeof window!=='undefined'?window:globalThis);
