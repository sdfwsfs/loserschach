
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

const turnInfo = document.getElementById("turnInfo");
const statusText = document.getElementById("statusText");
const modeInfo = document.getElementById("modeInfo");
const winnerText = document.getElementById("winnerText");

const moveModeBtn = document.getElementById("moveModeBtn");
const abilityModeBtn = document.getElementById("abilityModeBtn");
const cancelBtn = document.getElementById("cancelBtn");
const resetBtn = document.getElementById("resetBtn");
const rotateBtn = document.getElementById("rotateBtn");
const endTurnBtn = document.getElementById("endTurnBtn");

const promotionModal = document.getElementById("promotionModal");
const promoButtons = [...document.querySelectorAll(".promoBtn")];

const TILE = 100;

const COLORS = {
  light: "#d9c7a6", dark: "#79654e", selected: "#d7b56d", move: "#4aa3ff",
  capture: "#ff5f5f", ability: "#7a63ff", frozen:"#49b9ff", primed:"#ff4d73",
  loaded:"#f39c12", kingstart:"#d93636", redjump:"#ff3b30", whitePiece:"#f4f7fb", blackPiece:"#111317",
  whiteAccent:"#d6dde9", blackAccent:"#313948",
};

let rotated = false;
let board = [];
let turn = "w";
let selected = null;
let mode = null;
let hints = [];
let queenSwapState = null;
let kingChainState = null; // {x,y,startX,startY,visited:Set,canWrap,phase:"jump"|"step",captured}
let knightChainState = null; // {x,y}
let gameOver = false;
let promotionState = null;
let primedThisTurn = false;
let actionCommittedThisTurn = false;
let pendingEndTurn = null; // {type:'queen'|'king'|'knight'}

function makePiece(color, type){
  return { color, type, frozenBy: null, primed: false, loadedPawn: false };
}
function inBounds(x,y){ return x>=0 && x<8 && y>=0 && y<8; }
function getPiece(x,y){ return inBounds(x,y) ? board[y][x] : null; }
function setPiece(x,y,p){ if(inBounds(x,y)) board[y][x] = p; }
function coordKey(x,y){ return `${x},${y}`; }

function initBoard(){
  board = Array.from({length:8}, () => Array(8).fill(null));
  turn = "w"; selected = null; mode = null; hints = [];
  queenSwapState = null; kingChainState = null; knightChainState = null;
  promotionState = null; gameOver = false; rotated = false;
  primedThisTurn = false; actionCommittedThisTurn = false;
  pendingEndTurn = null;
  winnerText.textContent = "";

  for(let x=0;x<8;x++){
    board[1][x] = makePiece("b","p");
    board[6][x] = makePiece("w","p");
  }
  const back = ["r","n","m","q","k","m","n","r"];
  for(let x=0;x<8;x++){
    board[0][x] = makePiece("b", back[x]);
    board[7][x] = makePiece("w", back[x]);
  }

  hidePromotion();
  setStatus("Figur auswählen.");
  updateTurnUI();
  draw();
}

function updateTurnUI(){
  turnInfo.textContent = turn === "w" ? "Weiß am Zug" : "Schwarz am Zug";
}
function setStatus(text){ statusText.textContent = text; }
function setMode(newMode){
  mode = newMode;
  moveModeBtn.classList.toggle("active", mode === "move");
  abilityModeBtn.classList.toggle("active", mode === "ability");
  if(!selected){ modeInfo.textContent = "Noch keine Figur ausgewählt."; return; }
  const p = getPiece(selected.x, selected.y);
  if(!p){ modeInfo.textContent = "Noch keine Figur ausgewählt."; return; }
  const names = {p:"Bauer", r:"Turm", n:"Springer", m:"Magier", q:"Dame", k:"König"};
  if(mode === "move") modeInfo.textContent = `${names[p.type]} – Bewegungsmodus`;
  else if(mode === "ability") modeInfo.textContent = `${names[p.type]} – Fähigkeitsmodus`;
  else modeInfo.textContent = `${names[p.type]} ausgewählt.`;
}

function beginTurn(){
  primedThisTurn = false;
  actionCommittedThisTurn = false;
  explodePrimedPawnsForColor(turn);
  thawForColor(turn);
  updateTurnUI();
  evaluateWinner();
}

function endTurn(reason="Zug beendet."){
  selected = null; hints = []; mode = null;
  queenSwapState = null; kingChainState = null; knightChainState = null; pendingEndTurn = null;
  turn = turn === "w" ? "b" : "w";
  beginTurn();
  if(!gameOver) setStatus(reason);
  draw();
}

function thawForColor(color){
  for(let y=0;y<8;y++) for(let x=0;x<8;x++){
    const p = getPiece(x,y);
    if(p && p.frozenBy === color) p.frozenBy = null;
  }
}

function explodePrimedPawnsForColor(color){
  const primed = [];
  for(let y=0;y<8;y++) for(let x=0;x<8;x++){
    const p = getPiece(x,y);
    if(p && p.type === "p" && p.color === color && p.primed && !p.frozenBy){
      primed.push({x,y});
    }
  }
  if(primed.length){
    for(const pos of primed) explodeAt(pos.x, pos.y);
    setStatus("Primed-Bauer explodiert zu Beginn des Zuges.");
  }
}

function explodeAt(cx,cy){
  for(let y=cy-1;y<=cy+1;y++){
    for(let x=cx-1;x<=cx+1;x++){
      if(!inBounds(x,y)) continue;
      const p = getPiece(x,y);
      if(!p || p.frozenBy) continue;
      setPiece(x,y,null);
    }
  }
}

function evaluateWinner(){
  let white = 0, black = 0;
  for(let y=0;y<8;y++) for(let x=0;x<8;x++){
    const p = getPiece(x,y);
    if(!p) continue;
    if(p.color === "w") white++; else black++;
  }
  if(white === 0 && black === 0){
    gameOver = true; winnerText.textContent = "Remis – keine Figuren mehr auf dem Brett."; setStatus("Spiel beendet.");
  } else if(white === 0){
    gameOver = true; winnerText.textContent = "Schwarz gewinnt."; setStatus("Spiel beendet.");
  } else if(black === 0){
    gameOver = true; winnerText.textContent = "Weiß gewinnt."; setStatus("Spiel beendet.");
  } else {
    gameOver = false; winnerText.textContent = "";
  }
}

function maybeTriggerPromotion(x,y,onDoneText){
  const p = getPiece(x,y);
  if(!p || p.type !== "p") return false;
  if((p.color === "w" && y !== 0) || (p.color === "b" && y !== 7)) return false;
  promotionState = {x,y,onDoneText};
  showPromotion();
  return true;
}
function showPromotion(){ promotionModal.classList.remove("hidden"); }
function hidePromotion(){ promotionModal.classList.add("hidden"); }
function applyPromotion(newType){
  if(!promotionState) return;
  const {x,y,onDoneText} = promotionState;
  const p = getPiece(x,y);
  if(p && p.type === "p"){ p.type = newType; p.primed = false; }
  promotionState = null;
  hidePromotion();
  evaluateWinner();
  if(!gameOver) endTurn(onDoneText || "Bauer umgewandelt. Zug beendet.");
  else draw();
}

function displayToBoard(dx,dy){ return rotated ? {x:7-dx, y:7-dy} : {x:dx, y:dy}; }
function boardToDisplay(bx,by){ return rotated ? {x:7-bx, y:7-by} : {x:bx, y:by}; }

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  for(let dy=0;dy<8;dy++){
    for(let dx=0;dx<8;dx++){
      const {x,y} = displayToBoard(dx,dy);
      ctx.fillStyle = ((x+y)%2===0) ? COLORS.light : COLORS.dark;
      ctx.fillRect(dx*TILE, dy*TILE, TILE, TILE);

      if(kingChainState && kingChainState.startX === x && kingChainState.startY === y){
        ctx.strokeStyle = COLORS.kingstart; ctx.lineWidth = 6;
        ctx.strokeRect(dx*TILE+5, dy*TILE+5, TILE-10, TILE-10);
      }
      if(selected && selected.x === x && selected.y === y){
        ctx.strokeStyle = COLORS.selected; ctx.lineWidth = 6;
        ctx.strokeRect(dx*TILE+3, dy*TILE+3, TILE-6, TILE-6);
      }
    }
  }

  for(const h of hints){
    const d = boardToDisplay(h.x,h.y);
    const cx = d.x*TILE + TILE/2, cy = d.y*TILE + TILE/2;
    ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI*2);
    ctx.fillStyle = h.kind === "move" ? COLORS.move : h.kind === "capture" ? COLORS.capture : COLORS.ability;
    ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1;
  }

  for(let y=0;y<8;y++) for(let x=0;x<8;x++){
    const p = getPiece(x,y);
    if(p) drawPiece(x,y,p);
  }
  drawCoords();
}

function drawCoords(){
  ctx.font = "16px sans-serif";
  ctx.fillStyle = "rgba(20,20,20,0.55)";
  for(let dy=0;dy<8;dy++) for(let dx=0;dx<8;dx++){
    const {x,y} = displayToBoard(dx,dy);
    const file = "abcdefgh"[x], rank = 8-y;
    if(dy === 7) ctx.fillText(file, dx*TILE + 6, dy*TILE + TILE - 8);
    if(dx === 0) ctx.fillText(String(rank), dx*TILE + 6, dy*TILE + 18);
  }
}

function drawPiece(x,y,p){
  const d = boardToDisplay(x,y);
  const cx = d.x*TILE + TILE/2, cy = d.y*TILE + TILE/2;
  const fill = p.color === "w" ? COLORS.whitePiece : COLORS.blackPiece;
  const accent = p.color === "w" ? COLORS.whiteAccent : COLORS.blackAccent;

  ctx.save(); ctx.translate(cx, cy);
  ctx.globalAlpha = 0.22; ctx.fillStyle = "#000";
  ctx.beginPath(); ctx.ellipse(0, 30, 23, 10, 0, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = fill; ctx.strokeStyle = accent; ctx.lineWidth = 3;

  switch(p.type){
    case "p": drawPawn(); break;
    case "r": drawRook(); break;
    case "n": drawKnight(); break;
    case "m": drawMage(); break;
    case "q": drawQueen(); break;
    case "k": drawKing(); break;
  }

  if(p.frozenBy){
    ctx.strokeStyle = COLORS.frozen; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0,0,34,0,Math.PI*2); ctx.stroke();
  }
  if(p.primed){
    ctx.strokeStyle = COLORS.primed; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0,0,42,0,Math.PI*2); ctx.stroke();
  }
  if(p.type === "r" && p.loadedPawn){
    ctx.strokeStyle = COLORS.loaded; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0,0,26,0,Math.PI*2); ctx.stroke();
  }
  if(kingChainState && kingChainState.visited && kingChainState.visited.has(coordKey(x,y))){
    ctx.strokeStyle = COLORS.redjump; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0,0,48,0,Math.PI*2); ctx.stroke();
  }
  ctx.restore();

  function fillStroke(fn){ ctx.beginPath(); fn(); ctx.fill(); ctx.stroke(); }
  function drawPawn(){
    fillStroke(() => {
      ctx.arc(0,-20,14,0,Math.PI*2);
      ctx.moveTo(-18,24); ctx.lineTo(18,24); ctx.lineTo(12,-4);
      ctx.quadraticCurveTo(0,6,-12,-4); ctx.closePath();
    });
  }
  function drawRook(){
    fillStroke(() => {
      ctx.moveTo(-22,26); ctx.lineTo(22,26); ctx.lineTo(18,-24);
      ctx.lineTo(10,-24); ctx.lineTo(10,-34); ctx.lineTo(2,-34);
      ctx.lineTo(2,-24); ctx.lineTo(-2,-24); ctx.lineTo(-2,-34);
      ctx.lineTo(-10,-34); ctx.lineTo(-10,-24); ctx.lineTo(-18,-24); ctx.closePath();
    });
  }
  function drawKnight(){
    fillStroke(() => {
      ctx.moveTo(-18,26); ctx.lineTo(18,26); ctx.lineTo(16,10);
      ctx.lineTo(8,0); ctx.lineTo(10,-20); ctx.lineTo(0,-30);
      ctx.lineTo(-10,-26); ctx.lineTo(-4,-10); ctx.lineTo(-18,4); ctx.closePath();
    });
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(3,-14,2.5,0,Math.PI*2); ctx.fill();
  }
  function drawMage(){
    fillStroke(() => {
      ctx.moveTo(-18,26); ctx.lineTo(18,26); ctx.lineTo(10,6);
      ctx.lineTo(16,-2); ctx.lineTo(0,-34); ctx.lineTo(-16,-2); ctx.lineTo(-10,6); ctx.closePath();
    });
    ctx.beginPath(); ctx.arc(0,-36,6,0,Math.PI*2); ctx.fill(); ctx.stroke();
  }
  function drawQueen(){
    fillStroke(() => {
      ctx.moveTo(-22,26); ctx.lineTo(22,26); ctx.lineTo(14,-8);
      ctx.lineTo(8,-26); ctx.lineTo(0,-8); ctx.lineTo(-8,-26); ctx.lineTo(-14,-8); ctx.closePath();
    });
    [-12,0,12].forEach(x=>{ ctx.beginPath(); ctx.arc(x,-30,5,0,Math.PI*2); ctx.fill(); ctx.stroke();});
  }
  function drawKing(){
    fillStroke(() => {
      ctx.moveTo(-20,26); ctx.lineTo(20,26); ctx.lineTo(12,-14); ctx.lineTo(-12,-14); ctx.closePath();
    });
    ctx.beginPath(); ctx.moveTo(0,-38); ctx.lineTo(0,-14); ctx.moveTo(-10,-26); ctx.lineTo(10,-26); ctx.stroke();
  }
}

function clearSelectionKeepTurn(text){
  selected = null; hints = []; setMode(null);
  if(text) setStatus(text);
  draw();
}

function handleBoardClick(evt){
  if(gameOver || promotionState) return;
  const rect = canvas.getBoundingClientRect();
  const dx = Math.floor((evt.clientX - rect.left) / (rect.width / 8));
  const dy = Math.floor((evt.clientY - rect.top) / (rect.height / 8));
  const {x,y} = displayToBoard(dx,dy);
  if(!inBounds(x,y)) return;

  if(queenSwapState){ handleQueenSwapClick(x,y); return; }
  if(kingChainState){ handleKingChainClick(x,y); return; }
  if(knightChainState){ handleKnightChainClick(x,y); return; }

  const clicked = getPiece(x,y);

  if(selected && mode){
    const hit = hints.find(h => h.x === x && h.y === y);
    if(hit){
      if(mode === "move") executeMove(selected.x, selected.y, x, y, hit);
      else executeAbility(selected.x, selected.y, x, y, hit);
      return;
    }
  }

  if(clicked && clicked.color === turn){
    if(clicked.frozenBy){ setStatus("Diese Figur ist eingefroren und kann gerade nicht ziehen."); return; }
    selected = {x,y}; hints = []; setMode(null);
    const names = {p:"Bauer",r:"Turm",n:"Springer",m:"Magier",q:"Dame",k:"König"};
    setStatus(`${names[clicked.type]} ausgewählt. Aktion wählen.`);
    draw(); return;
  }

  clearSelectionKeepTurn("Figur auswählen.");
}

function executeMove(x1,y1,x2,y2,hit){
  const p = getPiece(x1,y1);
  if(!p) return;
  const target = getPiece(x2,y2);

  setPiece(x2,y2,p); setPiece(x1,y1,null);
  actionCommittedThisTurn = true;

  if(maybeTriggerPromotion(x2,y2,"Bauer umgewandelt. Zug beendet.")){
    selected = null; hints = []; mode = null; evaluateWinner(); draw(); return;
  }

  if(p.type === "q" && target && target.color !== p.color){
    queenSwapState = { x:x2, y:y2, color:p.color };
    pendingEndTurn = {type:"queen"};
    selected = null; hints = getFriendlySwapTargets(p.color, x2, y2); setMode(null);
    setStatus("Dame hat geschlagen. Eigene Figur zum Tauschen anklicken oder Zug beenden.");
    evaluateWinner(); draw(); return;
  }

  if(p.type === "n"){
    const chainHints = computeKnightContinuationHints(x2, y2, hit.meta?.dx || 0, hit.meta?.dy || 0, x1, y1);
    if(chainHints.length && !(target && target.color !== p.color)){
      knightChainState = { x:x2, y:y2, startX:x1, startY:y1, firstDx: hit.meta.dx, firstDy: hit.meta.dy };
      selected = {x:x2, y:y2};
      mode = "move";
      hints = chainHints;
      pendingEndTurn = {type:"knight"};
      setStatus("Springer-Zusatzsprung freigeschaltet: genau noch ein Springerzug oder Zug beenden.");
      draw();
      return;
    }
    evaluateWinner();
    if(!gameOver) endTurn("Springerzug beendet.");
    else draw();
    return;
  }

  evaluateWinner();
  if(!gameOver) endTurn("Zug beendet.");
  else draw();
}

function executeAbility(x1,y1,x2,y2,hit){
  const p = getPiece(x1,y1);
  if(!p) return;

  if(p.type === "m"){
    const target = getPiece(x2,y2);
    if(!target) return;
    target.frozenBy = p.color;
    actionCommittedThisTurn = true;
    evaluateWinner();
    if(!gameOver) endTurn("Magier hat eine Figur eingefroren.");
    else draw();
    return;
  }

  if(p.type === "p"){
    if(primedThisTurn){ setStatus("In diesem Zug wurde bereits ein Bauer scharf gestellt."); return; }
    p.primed = true;
    primedThisTurn = true;
    actionCommittedThisTurn = true;
    clearSelectionKeepTurn("Bauer scharf gestellt. Du darfst in diesem Zug noch eine Figur bewegen.");
    return;
  }

  if(p.type === "r"){
    if(!p.loadedPawn){
      const target = getPiece(x2,y2);
      if(!target || target.type !== "p") return;
      p.loadedPawn = true;
      setPiece(x2,y2,p); setPiece(x1,y1,null);
      actionCommittedThisTurn = true;
      evaluateWinner();
      if(!gameOver) endTurn("Turm hat einen Bauern geladen.");
      else draw();
      return;
    } else {
      const landing = getPiece(x2,y2);
      p.loadedPawn = false;
      actionCommittedThisTurn = true;
      if(landing){
        explodeAt(x2,y2);
        evaluateWinner();
        if(!gameOver) endTurn("Geladener Bauer geworfen: Aufprall mit Explosion.");
        else draw();
      } else {
        const newPawn = makePiece(p.color,"p");
        setPiece(x2,y2,newPawn);
        if(maybeTriggerPromotion(x2,y2,"Geworfener Bauer umgewandelt. Zug beendet.")){
          selected = null; hints = []; mode = null; evaluateWinner(); draw(); return;
        }
        evaluateWinner();
        if(!gameOver) endTurn("Geladener Bauer geworfen: Neuer Bauer entstanden.");
        else draw();
      }
      return;
    }
  }

  if(p.type === "k"){
    startKingChain(x1,y1);
    return;
  }

  clearSelectionKeepTurn("Diese Fähigkeit ist in dieser Alpha noch nicht eingebaut.");
}

function getFriendlySwapTargets(color, qx, qy){
  const arr = [];
  for(let y=0;y<8;y++) for(let x=0;x<8;x++){
    const p = getPiece(x,y);
    if(p && p.color === color && !(x===qx && y===qy)) arr.push({x,y,kind:"ability"});
  }
  return arr;
}

function handleQueenSwapClick(x,y){
  const q = queenSwapState;
  if(!q) return;
  const target = getPiece(x,y);
  if(target && target.color === q.color && !(x===q.x && y===q.y)){
    const queen = getPiece(q.x,q.y);
    setPiece(q.x,q.y,target); setPiece(x,y,queen);

    if(maybeTriggerPromotion(q.x,q.y,"Damen-Tausch mit Umwandlung. Zug beendet.")){
      queenSwapState = null; hints = []; evaluateWinner(); draw(); return;
    }

    pendingEndTurn = null;
    queenSwapState = null; hints = [];
    evaluateWinner();
    if(!gameOver) endTurn("Dame hat getauscht. Zug beendet.");
    else draw();
    return;
  }
  setStatus("Nur eigene Figur als Tauschziel anklicken oder 'Abbrechen' drücken.");
}

function startKingChain(x,y){
  const king = getPiece(x,y);
  if(!king || king.type !== "k") return;
  kingChainState = {
    x, y, startX:x, startY:y, visited:new Set(),
    canWrap:false, phase:"jump", captured:false
  };
  selected = null; mode = "ability";
  hints = computeKingChainHints();
  setStatus(hints.length ? "König: Sprungziel wählen. Übersprungene Figuren werden rot markiert." : "Keine Sprungoptionen.");
  draw();
}

function handleKingChainClick(x,y){
  const hit = hints.find(h => h.x === x && h.y === y);
  if(!hit){ setStatus("Nur markierte Königsziel-Felder anklicken oder 'Abbrechen'."); return; }
  const st = kingChainState;
  const king = getPiece(st.x, st.y);
  if(!king || king.type !== "k"){ kingChainState = null; hints = []; draw(); return; }

  if(hit.action === "jump"){
    const jumped = getPiece(hit.overX, hit.overY);
    if(jumped){
      st.visited.add(coordKey(hit.overX, hit.overY));
      if(jumped.color !== king.color){
        st.canWrap = true;
      }
    }
    setPiece(hit.x, hit.y, king); setPiece(st.x, st.y, null);
    st.x = hit.x; st.y = hit.y;
    actionCommittedThisTurn = true;
    selected = {x:st.x, y:st.y};
    st.phase = "jump_or_step";
    evaluateWinner();
    if(gameOver){ kingChainState = null; hints = []; draw(); return; }
    hints = computeKingChainHints();
    setStatus("König: weiter springen oder genau 1 Feld ziehen. Übersprungene Figuren sind rot markiert.");
    draw();
    return;
  }

  if(hit.action === "step"){
    const target = getPiece(hit.x, hit.y);
    if(target && target.color !== king.color){
      st.captured = true;
    }
    setPiece(hit.x, hit.y, king); setPiece(st.x, st.y, null);
    st.x = hit.x; st.y = hit.y;
    actionCommittedThisTurn = true;
    evaluateWinner();
    if(gameOver){ kingChainState = null; hints = []; draw(); return; }

    // After the step, if a capture happened, offer optional return; otherwise end the turn.
    if(st.captured && !getPiece(st.startX, st.startY)){
      pendingEndTurn = {type:"king"};
      hints = [{x:st.startX, y:st.startY, kind:"capture", action:"return"}];
      selected = {x:st.x, y:st.y};
      setStatus("König hat geschlagen. Startfeld anklicken für Rückkehr oder Zug beenden.");
      draw();
      return;
    }

    kingChainState = null;
    hints = [];
    endTurn("Königszug beendet.");
    return;
  }

  if(hit.action === "return"){
    setPiece(st.startX, st.startY, king); setPiece(st.x, st.y, null);
    pendingEndTurn = null;
    kingChainState = null;
    hints = [];
    evaluateWinner();
    if(!gameOver) endTurn("König kehrt auf sein Startfeld zurück. Zug beendet.");
    else draw();
    return;
  }
}

function handleKnightChainClick(x,y){
  // Zweiter Springerzug: danach ist der Zug IMMER beendet.
  const hit = hints.find(h => h.x === x && h.y === y);
  if(!hit){ setStatus("Nur markierte Springerfelder anklicken oder 'Abbrechen'."); return; }
  const st = knightChainState;
  const knight = getPiece(st.x, st.y);
  if(!knight || knight.type !== "n"){ knightChainState = null; hints = []; draw(); return; }

  setPiece(hit.x, hit.y, knight);
  setPiece(st.x, st.y, null);

  pendingEndTurn = null;
  knightChainState = null;
  selected = null; hints = []; mode = null;
  actionCommittedThisTurn = true;

  evaluateWinner();
  if(!gameOver) endTurn("Springerzug beendet.");
  else draw();
}

function computeMoveHints(x,y){
  const p = getPiece(x,y);
  if(!p || p.frozenBy) return [];
  switch(p.type){
    case "p": return pawnMoves(x,y,p.color);
    case "r": return sliderMoves(x,y,p.color, [[1,0],[-1,0],[0,1],[0,-1]]);
    case "n": return knightBaseMoves(x,y,p.color);
    case "m": return kingStepMoves(x,y,p.color);
    case "q": return sliderMoves(x,y,p.color, [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]);
    case "k": return kingStepMoves(x,y,p.color);
    default: return [];
  }
}

function computeAbilityHints(x,y){
  const p = getPiece(x,y);
  if(!p || p.frozenBy) return [];
  switch(p.type){
    case "m": return mageFreezeTargets(x,y,p.color);
    case "p": return [{x,y,kind:"ability"}];
    case "r": return p.loadedPawn ? rookThrowTargets(x,y,p.color) : rookLoadTargets(x,y,p.color);
    case "k": return [{x,y,kind:"ability"}];
    default: return [];
  }
}

function pushIfValid(arr,x,y,color,asAbility=false,meta=null,action=null){
  if(!inBounds(x,y)) return;
  const t = getPiece(x,y);
  if(!t) arr.push({x,y,kind: asAbility ? "ability" : "move", meta, action});
  else if(t.color !== color) arr.push({x,y,kind: asAbility ? "ability" : "capture", meta, action});
}

function pawnMoves(x,y,color){
  const arr = [];
  const dir = color === "w" ? -1 : 1;
  const startRank = color === "w" ? 6 : 1;
  if(inBounds(x,y+dir) && !getPiece(x,y+dir)){
    arr.push({x, y:y+dir, kind:"move"});
    if(y === startRank && !getPiece(x,y+2*dir)) arr.push({x, y:y+2*dir, kind:"move"});
  }
  for(const dx of [-1,1]){
    const tx=x+dx, ty=y+dir, t=getPiece(tx,ty);
    if(t && t.color !== color) arr.push({x:tx,y:ty,kind:"capture"});
  }
  return arr;
}

function sliderMoves(x,y,color,dirs){
  const arr = [];
  for(const [dx,dy] of dirs){
    let nx=x+dx, ny=y+dy;
    while(inBounds(nx,ny)){
      const t = getPiece(nx,ny);
      if(!t) arr.push({x:nx,y:ny,kind:"move"});
      else { if(t.color !== color) arr.push({x:nx,y:ny,kind:"capture"}); break; }
      nx += dx; ny += dy;
    }
  }
  return arr;
}

function kingStepMoves(x,y,color){
  const arr = [];
  for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++){
    if(dx===0 && dy===0) continue;
    pushIfValid(arr,x+dx,y+dy,color);
  }
  return arr;
}

function computeKingStepContinuationHints(x,y,color){
  const arr = [];
  for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++){
    if(dx===0 && dy===0) continue;
    pushIfValid(arr,x+dx,y+dy,color,false,null,"step");
  }
  return arr;
}

function knightBaseMoves(x,y,color){
  const arr = [];
  const jumps = [
    {dx:1, dy:2}, {dx:2, dy:1}, {dx:2, dy:-1}, {dx:1, dy:-2},
    {dx:-1, dy:-2}, {dx:-2, dy:-1}, {dx:-2, dy:1}, {dx:-1, dy:2},
  ];
  for(const j of jumps){
    pushIfValid(arr,x+j.dx,y+j.dy,color,false,{dx:j.dx,dy:j.dy});
  }
  return arr;
}


function hasKnightDirectionJumpSource(startX,startY,dx,dy){
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const candidates = [];
  // Prüfung erfolgt IMMER relativ zum STARTFELD des ersten Sprungs.
  // Bei horizontal betonter L-Bewegung prüfen wir den seitlichen 3er-Streifen.
  if(Math.abs(dx) === 2 && Math.abs(dy) === 1){
    candidates.push([startX+sx, startY-1], [startX+sx, startY], [startX+sx, startY+1]);
  }
  // Bei vertikal betonter L-Bewegung prüfen wir den oberen/unteren 3er-Streifen.
  else if(Math.abs(dx) === 1 && Math.abs(dy) === 2){
    candidates.push([startX-1, startY+sy], [startX, startY+sy], [startX+1, startY+sy]);
  }
  for(const [cx,cy] of candidates){
    if(inBounds(cx,cy) && getPiece(cx,cy)) return true;
  }
  return false;
}

function computeKnightContinuationHints(fromX,fromY,firstDx,firstDy,startX,startY){
  // Zusatzsprung nur nach erster Bewegung, nur einmal, und nur wenn
  // am STARTFELD in Sprungrichtung eine Figur im relevanten 3x3-Streifen steht.
  if(!hasKnightDirectionJumpSource(startX,startY,firstDx,firstDy)) return [];
  const piece = getPiece(fromX,fromY);
  if(!piece || piece.type !== "n") return [];
  return knightBaseMoves(fromX,fromY,piece.color);
}

function mageFreezeTargets(x,y,color){
  const arr = [];
  const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  for(const [dx,dy] of dirs){
    let nx=x+dx, ny=y+dy;
    let ownSeen = false;
    while(inBounds(nx,ny)){
      const t = getPiece(nx,ny);
      if(t){
        if(t.color !== color){
          arr.push({x:nx,y:ny,kind:"ability"});
          break;
        } else {
          ownSeen = true;
          nx += dx; ny += dy;
          continue;
        }
      }
      nx += dx; ny += dy;
    }
  }
  // own pieces may also be directly targeted for protection
  for(const [dx,dy] of dirs){
    let nx=x+dx, ny=y+dy;
    while(inBounds(nx,ny)){
      const t = getPiece(nx,ny);
      if(t && t.color === color){
        arr.push({x:nx,y:ny,kind:"ability"});
      }
      if(t && t.color !== color) break;
      nx += dx; ny += dy;
    }
  }
  // dedupe
  const map = new Map();
  for(const a of arr) map.set(coordKey(a.x,a.y), a);
  return [...map.values()];
}

function rookLoadTargets(x,y,color){
  const arr = [];
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for(const [dx,dy] of dirs){
    let nx=x+dx, ny=y+dy;
    while(inBounds(nx,ny)){
      const t = getPiece(nx,ny);
      if(t){ if(t.type === "p") arr.push({x:nx,y:ny,kind:"ability"}); break; }
      nx += dx; ny += dy;
    }
  }
  return arr;
}

function rookThrowTargets(x,y,color){
  const arr = [];
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for(const [dx,dy] of dirs){
    const tx=x+dx*2, ty=y+dy*2;
    if(!inBounds(tx,ty)) continue;
    const between = getPiece(x+dx,y+dy);
    if(between) continue;
    arr.push({x:tx,y:ty,kind:"ability"});
  }
  return arr;
}

function computeKingChainHints(){
  const st = kingChainState;
  if(!st) return [];
  const arr = [];
  const king = getPiece(st.x, st.y);
  if(!king) return arr;

  for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++){
    if(dx===0 && dy===0) continue;
    const mx = st.x + dx, my = st.y + dy;
    const lx = st.x + dx*2, ly = st.y + dy*2;
    if(!inBounds(mx,my) || !inBounds(lx,ly)) continue;
    const mid = getPiece(mx,my);
    const land = getPiece(lx,ly);
    if(!mid) continue;
    if(st.visited.has(coordKey(mx,my))) continue;
    if(land) continue;
    arr.push({x:lx,y:ly,kind:"ability",action:"jump",overX:mx,overY:my});
  }

  if(st.canWrap){
    for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++){
      if(dx===0 && dy===0) continue;
      let mx = st.x + dx, my = st.y + dy;
      let wrappedMid = false;
      if(!inBounds(mx,my)){ wrappedMid = true; mx=(mx+8)%8; my=(my+8)%8; }
      const mid = getPiece(mx,my);
      if(!mid) continue;
      if(st.visited.has(coordKey(mx,my))) continue;

      let lx = st.x + dx*2, ly = st.y + dy*2;
      if(!inBounds(lx,ly) || wrappedMid){ lx=(lx+8)%8; ly=(ly+8)%8; }
      if(getPiece(lx,ly)) continue;

      const dup = arr.some(h => h.x===lx && h.y===ly && h.overX===mx && h.overY===my);
      if(!dup) arr.push({x:lx,y:ly,kind:"ability",action:"jump",overX:mx,overY:my});
    }
  }

  // Optional return to start after a real capture during the step phase
  if(st.captured && !(st.x === st.startX && st.y === st.startY) && !getPiece(st.startX, st.startY)){
    arr.push({x:st.startX, y:st.startY, kind:"capture", action:"return"});
  }

  return arr;
}

moveModeBtn.addEventListener("click", () => {
  if(gameOver || promotionState || !selected) return;
  setMode("move");
  hints = computeMoveHints(selected.x, selected.y);
  setStatus(hints.length ? "Zielfeld anklicken." : "Keine legalen Bewegungsfelder.");
  draw();
});

abilityModeBtn.addEventListener("click", () => {
  if(gameOver || promotionState || !selected) return;
  setMode("ability");
  hints = computeAbilityHints(selected.x, selected.y);
  const p = getPiece(selected.x, selected.y);
  if(p && p.type === "k"){
    setStatus("König: auf den König klicken, um die Sprungphase zu starten.");
  } else if(p && p.type === "p" && primedThisTurn){
    setStatus("In diesem Zug wurde bereits ein Bauer scharf gestellt.");
    hints = [];
  } else {
    setStatus(hints.length ? "Fähigkeitsziel anklicken." : "Diese Figur hat hier keine nutzbare Fähigkeit.");
  }
  draw();
});

cancelBtn.addEventListener("click", () => {
  if(gameOver || promotionState) return;

  if(queenSwapState){
    queenSwapState = null;
    hints = [];
    selected = null;
    mode = null;
    setStatus("Damen-Tausch abgebrochen. Zug noch nicht beendet.");
    draw();
    return;
  }

  if(kingChainState){
    kingChainState = null;
    hints = [];
    selected = null;
    mode = null;
    setStatus("Königskette abgebrochen. Kein Zugwechsel.");
    draw();
    return;
  }

  if(knightChainState){
    knightChainState = null;
    hints = [];
    selected = null;
    mode = null;
    setStatus("Zusatz-Springerzug abgebrochen. Zug noch nicht beendet.");
    draw();
    return;
  }

  clearSelectionKeepTurn("Aktion abgebrochen.");
});

endTurnBtn.addEventListener("click", () => {
  if(gameOver || promotionState) return;
  if(!actionCommittedThisTurn){
    setStatus("Ein Zug kann nur nach einer echten Aktion beendet werden.");
    draw();
    return;
  }
  if(pendingEndTurn){
    const t = pendingEndTurn.type;
    pendingEndTurn = null;
    queenSwapState = null;
    kingChainState = null;
    knightChainState = null;
    hints = [];
    selected = null;
    mode = null;
    if(t === "queen") endTurn("Dame beendet den Zug ohne Tausch.");
    else if(t === "king") endTurn("König beendet den Zug ohne Rückkehr.");
    else if(t === "knight") endTurn("Springer beendet den Zug ohne zweiten Sprung.");
    else endTurn("Zug beendet.");
    return;
  }
  endTurn("Zug beendet.");
});

rotateBtn.addEventListener("click", () => { if(!promotionState){ rotated = !rotated; draw(); } });
canvas.addEventListener("click", handleBoardClick);
promoButtons.forEach(btn => btn.addEventListener("click", () => applyPromotion(btn.dataset.piece)));

initBoard();
