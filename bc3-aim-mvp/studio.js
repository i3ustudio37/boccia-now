/* BC3 AIM LAB — Six throwing boxes, fixed-screen cockpit */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const svg = $("court"), ns = "http://www.w3.org/2000/svg";
  const state = {
    selected: 3,
    pivot: Array.from({length: 6}, () => ({x:"0.00",back:"1.25",angle:"0.00"})),
    showGrid: true, showV: true, showHeading: true,
    dragging: null
  };
  // Global coordinates: 0 at centre of shared throwing line,
  // x positive right, y positive forward, throwing boxes y=-2.5..0.
  const CX = box => box - 3.5;
  const X = x => 75 + (x+3)*70;
  const Y = y => 52 + (10-y)*72;
  const globalX = px => (px-75)/70 - 3;
  const globalY = py => 10 - (py-52)/72;
  const safeNum = raw => {
    if (raw == null || String(raw).trim()==="") return NaN;
    return Number(raw);
  };
  const clamp=(v,a,b)=>Math.min(Math.max(v,a),b);
  const wrap180=v=>{const a=((v+180)%360+360)%360-180;return a===-180?180:a;};
  const fmt=v=> (v>0?"+":"")+v.toFixed(2)+"°";
  const coord=v=>v.toFixed(2);
  const attrs=(tag,obj={},text)=>{
    const n=document.createElementNS(ns,tag);
    Object.entries(obj).forEach(([k,v])=>n.setAttribute(k,String(v)));
    if(text!=null)n.textContent=text;
    svg.append(n);return n;
  };
  const line=(x1,y1,x2,y2,extra={})=>attrs("line",{x1,y1,x2,y2,stroke:"#4d6464","stroke-width":1,...extra});
  const text=(x,y,s,extra={})=>attrs("text",{x,y,fill:"#a0b7ae","text-anchor":"middle","font-size":13,"font-family":"system-ui,sans-serif",...extra},s);
  function readPivotInput(){
    state.pivot[state.selected-1] = {x:$("pivotX").value,back:$("pivotBack").value,angle:$("currentAngle").value};
  }
  function setPivotInputs(){
    const p=state.pivot[state.selected-1];
    $("pivotX").value=p.x;$("pivotBack").value=p.back;$("currentAngle").value=p.angle;
  }
  function jackCoordinates(){
    return {x:safeNum($("jackX").value), y:safeNum($("jackForward").value)};
  }
  function calculate(box){
    const j=jackCoordinates(),p=state.pivot[box-1];
    const localX=safeNum(p.x),back=safeNum(p.back),now=safeNum(p.angle);
    let error="";
    if (![j.x,j.y,localX,back,now].every(Number.isFinite))
      error="請輸入完整、有效的數值。";
    else if (j.x < -3 || j.x > 3 || j.y < 0 || j.y > 10)
      error="白球超出球場：左右應為 −3～+3 m，前方應為 0～10 m。";
    else if (localX < -.5 || localX > .5 || back < 0 || back > 2.5)
      error="旋轉中心超出投擲區：左右 −0.50～+0.50 m，後退 0～2.50 m。";
    const px=CX(box)+localX,py=-back,dx=j.x-px,dy=j.y-py,d=Math.hypot(dx,dy);
    if (!error && (!Number.isFinite(d) || d < 1e-9 || dy <= 0))
      error="白球必須在軌道旋轉中心前方，且不能與中心重合。";
    const angle=error?NaN:Math.atan2(dx,dy)*180/Math.PI;
    return {box,j,px,py,d,angle,rotation:error?NaN:wrap180(angle-now),error};
  }
  function selectBox(box){
    if (!Number.isInteger(box) || box<1 || box>6) return;
    readPivotInput();
    state.selected=box;
    setPivotInputs();
    $("boxSelect").value=String(box);
    render();
  }
  function displayResults(a){
    $("boxReadout").textContent="第 "+state.selected+" 投擲區";
    $("inputError").hidden=!a.error;$("inputError").textContent=a.error;
    $("aimAngle").textContent=a.error?"—":fmt(a.angle);
    $("aimDir").textContent=a.error?"請修正輸入":Math.abs(a.angle)<1e-7?"正前方，不需偏轉":a.angle>0?"順時針／向右":"逆時針／向左";
    $("rotateBy").textContent=a.error?"—":fmt(a.rotation);
    $("rotateDir").textContent=a.error?"":Math.abs(a.rotation)<1e-7?"不需旋轉":a.rotation>0?"順時針向右":"逆時針向左";
    $("distance").textContent=a.error?"—":a.d.toFixed(2)+" m";
    $("globalJack").textContent=Number.isFinite(a.j.x)&&Number.isFinite(a.j.y)?coord(a.j.x)+", "+coord(a.j.y):"—";
    $("globalPivot").textContent=Number.isFinite(a.px)&&Number.isFinite(a.py)?coord(a.px)+", "+coord(a.py):"—";
    const status=$("jackState"),j=a.j;
    if(j.x>=-3&&j.x<=3&&j.y>=0&&j.y<=10){
      const lineY=1.5+Math.abs(j.x)*.5;
      const invalid=j.y<=lineY+1e-8;
      status.hidden=false;
      status.className="jack-state"+(invalid?" warn":"");
      status.textContent=invalid?"白球中心位於 V 字線或後方的無效區（僅作幾何提醒）。":"白球中心在 V 字線前方（未計球體半徑及標線寬度）。";
    } else status.hidden=true;
    $("boxSelect").value=String(state.selected);
  }
  function renderComparison(){
    const root=$("compareGrid");root.replaceChildren();
    for(let b=1;b<=6;b++){
      const r=calculate(b),button=document.createElement("button");
      button.className="compare-button";button.type="button";
      button.setAttribute("aria-current",String(b===state.selected));
      const title=document.createElement("small");title.textContent="投擲區 "+b;
      const angle=document.createElement("strong");angle.textContent=r.error?"—":fmt(r.angle);
      const rotating=document.createElement("em");rotating.textContent=r.error?"座標無效":"旋轉 "+fmt(r.rotation);
      button.append(title,angle,rotating);
      button.addEventListener("click",()=>{selectBox(b);$("settingsDialog").close();});
      root.append(button);
    }
  }
  function draw(a){
    svg.replaceChildren();
    // Court = 6m x 12.5m, including throwing boxes.
    const L=X(-3),R=X(3),T=Y(10),F=Y(0),B=Y(-2.5);
    attrs("rect",{x:L,y:T,width:R-L,height:B-T,fill:"#173137",stroke:"#aacac0","stroke-width":3});
    if(state.showGrid){
      for(let n=0;n<=10;n+=2){
        line(L,Y(n),R,Y(n),{stroke:n===0?"#c7f28a":"#315157","stroke-width":n===0?2.5:1,"stroke-dasharray":n===0?"none":"4 7"});
        text(L-22,Y(n)+5,n+"m",{fill:"#9fb5b0"});
      }
      for(let n=-2;n<=2;n+=1)line(X(n),T,X(n),F,{stroke:"#2a484b","stroke-dasharray":"4 10"});
      line(X(0),T,X(0),F,{stroke:"#496b64","stroke-dasharray":"6 9"});
    }
    if(state.showV){
      const vertices=[[-3,0],[-3,3],[0,1.5],[3,3],[3,0]].map(([x,y])=>X(x)+","+Y(y)).join(" ");
      attrs("polygon",{points:vertices,fill:"#a57b53","fill-opacity":".13"});
      attrs("polyline",{points:[[-3,3],[0,1.5],[3,3]].map(([x,y])=>X(x)+","+Y(y)).join(" "),stroke:"#f0ad7f",fill:"none","stroke-width":3.5});
      text(X(0),Y(1.5)+30,"V 字線",{fill:"#f5be91","font-size":12});
    }
    // The penalty cross and 35cm x 35cm marked target.
    const square=.35*70;
    attrs("rect",{x:X(0)-square/2,y:Y(5)-square/2,width:square,height:square,stroke:"#d7eee6",fill:"none","stroke-width":2});
    line(X(0)-14,Y(5),X(0)+14,Y(5),{stroke:"#e2f1ea","stroke-width":2});
    line(X(0),Y(5)-14,X(0),Y(5)+14,{stroke:"#e2f1ea","stroke-width":2});
    text(R-3,T-16,"← 6.00 m →",{fill:"#afc9c0","text-anchor":"end","font-size":12});
    // Box overlays, full-bounds clickable (each 1m x 2.5m).
    for(let b=1;b<=6;b++){
      attrs("rect",{x:X(-3+b-1),y:F,width:70,height:B-F,
        fill:state.selected===b?"#385a3b":"#224443",
        stroke:state.selected===b?"#c5f47f":"#699b91",
        "stroke-width":state.selected===b?3:1.2,
        "data-box":b,style:"cursor:pointer"});
      text(X(CX(b)),B-19,String(b),{"font-size":22,"font-weight":800,fill:state.selected===b?"#e0f7ac":"#b1cbc4",style:"pointer-events:none"});
    }
    text(X(0),B+31,"1 → 6 號投擲區　|　2.50 m",{fill:"#b2cec4","font-size":12});
    text(X(0),T-38,"球場前端",{fill:"#a7c4b9","font-size":12});
    // Main aim and direction.
    const pivotX=Number.isFinite(a.px)?a.px:CX(state.selected),
          pivotY=Number.isFinite(a.py)?a.py:-1.25;
    const jackX=Number.isFinite(a.j.x)?a.j.x:0,
          jackY=Number.isFinite(a.j.y)?a.j.y:6;
    const p={x:X(pivotX),y:Y(pivotY)},j={x:X(jackX),y:Y(jackY)};
    if(!a.error){
      line(p.x,p.y,j.x,j.y,{stroke:"#c5f47f","stroke-width":4,"stroke-linecap":"round"});
      if(state.showHeading){
        const theta=safeNum(state.pivot[state.selected-1].angle)*Math.PI/180;
        line(p.x,p.y,p.x+Math.sin(theta)*88,p.y-Math.cos(theta)*88,{stroke:"#e5f0e8","stroke-width":2,"stroke-dasharray":"5 6"});
      }
    }
    if(jackX>=-3&&jackX<=3&&jackY>=0&&jackY<=10){
      attrs("circle",{cx:j.x,cy:j.y,r:20,fill:"#ffdb82","fill-opacity":".17",stroke:"#f6d47b","stroke-dasharray":"3 4"});
      attrs("circle",{cx:j.x,cy:j.y,r:10,fill:"#ffdb82",stroke:"#1f3032","stroke-width":2.5});
      attrs("circle",{cx:j.x,cy:j.y,r:29,fill:"transparent","data-drag":"jack",style:"cursor:grab"});
      text(clamp(j.x+22,100,485),j.y-22,"白球",{fill:"#ffdb82","text-anchor":"start","font-size":13,style:"pointer-events:none"});
    }
    attrs("circle",{cx:p.x,cy:p.y,r:22,fill:"#7bc8ed","fill-opacity":".18",stroke:"#7bc8ed","stroke-opacity":".65"});
    attrs("circle",{cx:p.x,cy:p.y,r:9,fill:"#7bc8ed",stroke:"#0b1d23","stroke-width":2.5});
    attrs("circle",{cx:p.x,cy:p.y,r:32,fill:"transparent","data-drag":"pivot",style:"cursor:grab"});
    text(p.x,p.y+39,"中心",{fill:"#91d8fb","font-size":12,style:"pointer-events:none"});
  }
  function render(){
    readPivotInput();
    const result=calculate(state.selected);
    displayResults(result);
    renderComparison();
    draw(result);
  }
  function dragAt(event,which){
    const ctm=svg.getScreenCTM();if(!ctm)return;
    const position=svg.createSVGPoint();
    position.x=event.clientX;position.y=event.clientY;
    const local=position.matrixTransform(ctm.inverse());
    const x=globalX(local.x),y=globalY(local.y);
    if(which==="jack"){
      $("jackX").value=(Math.round(clamp(x,-3,3)*100)/100).toFixed(2);
      $("jackForward").value=(Math.round(clamp(y,0,10)*100)/100).toFixed(2);
    } else {
      $("pivotX").value=(Math.round(clamp(x-CX(state.selected),-.5,.5)*100)/100).toFixed(2);
      $("pivotBack").value=(Math.round(clamp(-y,0,2.5)*100)/100).toFixed(2);
    }
    render();
  }
  svg.addEventListener("pointerdown",e=>{
    const handle=e.target.closest("[data-drag]");
    if(!handle)return;
    e.preventDefault();
    state.dragging=handle.getAttribute("data-drag");
    svg.setPointerCapture(e.pointerId);
    dragAt(e,state.dragging);
  });
  svg.addEventListener("pointermove",e=>{if(state.dragging)dragAt(e,state.dragging);});
  svg.addEventListener("pointerup",()=>{state.dragging=null;});
  svg.addEventListener("pointercancel",()=>{state.dragging=null;});
  svg.addEventListener("click",e=>{
    if(state.dragging)return;
    const cell=e.target.closest("[data-box]");
    if(cell)selectBox(Number(cell.getAttribute("data-box")));
  });
  ["jackForward","jackX","pivotX","pivotBack","currentAngle"].forEach(id=>{
    $(id).addEventListener("input",render);$(id).addEventListener("change",render);
  });
  $("showGrid").addEventListener("change",e=>{state.showGrid=e.target.checked;render();});
  $("showV").addEventListener("change",e=>{state.showV=e.target.checked;render();});
  $("showHeading").addEventListener("change",e=>{state.showHeading=e.target.checked;render();});
  const dialog=$("settingsDialog");
  $("settingsBtn").addEventListener("click",()=>dialog.showModal());
  $("compareBtn").addEventListener("click",()=>dialog.showModal());
  $("modalClose").addEventListener("click",()=>dialog.close());
  dialog.addEventListener("click",e=>{if(e.target===dialog)dialog.close();});
  $("resetBtn").addEventListener("click",()=>{
    state.selected=3;
    state.pivot=Array.from({length:6},()=>({x:"0.00",back:"1.25",angle:"0.00"}));
    $("jackForward").value="6.00";$("jackX").value="0.00";
    setPivotInputs();render();dialog.close();
  });
  $("boxSelect").addEventListener("change",event=>selectBox(Number(event.target.value)));
  setPivotInputs();render();
})();
