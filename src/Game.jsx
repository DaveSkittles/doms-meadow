import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import * as Tone from "tone";

// ─── Physics & Camera ─────────────────────────────────────────
const SPD=0.06,SPRINT_SPD=0.10,JMP=0.18,GRV=0.005;
const MAX_JUMPS=2,COYOTE=6,JUMP_BUF=6;
const CAM_D=6,CAM_S=0.08,MS=0.003,PMIN=-0.15,PMAX=1.3,PR=0.2,PH=0.7;
const STEP=1.5,HALF=STEP/2;
const CHAR_FOOT=0.17;

// ─── Color Palette ────────────────────────────────────────────
const C={
  skin:0x8B5E3C,hair:0x2C1A0E,hairH:0x3D2617,dress:0xF2A6C1,dressA:0xE8789A,
  shoes:0xD4956A,eyes:0x1A1A2E,eyeW:0xFFFBF0,cheek:0xE8967A,
  g1:0x7EC87E,g2:0x5BA85B,g3:0x8FD88F,
  dirt:0x9B7653,sand:0xE8D5A3,sandD:0xD4C090,
  water:0x5BB8E0,waterD:0x3A95C4,waterS:0xA8E0FF,
  st:0xB0A898,stD:0x8A7F72,stL:0xC8BEB0,
  f1:0xFFB7D5,f2:0xFFE066,f3:0xC9A0FF,f4:0xFF9E9E,f5:0xFF8080,fC:0xFFE066,
  leaf:0x4A9E4A,leafL:0x6BBF6B,
  bl1:0xFFB7D5,bl2:0xFFA0C8,bl3:0xFFCDE0,bl4:0xFF8FB8,blW:0xFFF0F5,
  trunk:0x6B4D2A,trunkL:0x7A5639,
  cot:0xFFF5E6,roof:0xD4735E,door:0x8B6539,win:0xADD8E6,woodD:0x8B6539,
  fence:0xC9A87C,cloud:0xFFFFFF,cloudS:0xE8E8F0,
  letter:0xFFF0E0,letterSeal:0xE85A7A,heart:0xFF6B8A,heartGlow:0xFFB7D5,
  platform:0xFFE4EC,platformAcc:0xF8BBD0,platformWood:0xC9A87C,
};

// ─── Geometry & Material Cache ────────────────────────────────
const _geos=new Map(),_mats=new Map();
function geo(w,h,d){const k=w+","+h+","+d;if(!_geos.has(k))_geos.set(k,new THREE.BoxGeometry(w,h,d));return _geos.get(k);}
function mat(c){if(!_mats.has(c))_mats.set(c,new THREE.MeshLambertMaterial({color:c}));return _mats.get(c);}
function bx(w,h,d,c){return new THREE.Mesh(geo(w,h,d),mat(c));}

// ─── Terrain Height System ────────────────────────────────────
function rawH(x,z){
  const flat=Math.max(0,1-Math.sqrt(x*x+z*z)/5);
  return(Math.sin(x*0.1)*Math.cos(z*0.08)*1.2+Math.sin(x*0.05+2)*Math.sin(z*0.06+1)*0.8+Math.cos(x*0.15-z*0.12)*0.4)*(1-flat*0.7);
}
function snapG(v){return Math.floor(v/STEP)*STEP+HALF;}
const hMap=new Map();
function hmK(x,z){return x+","+z;}
function getH(gx,gz){const k=hmK(gx,gz);return hMap.has(k)?hMap.get(k):rawH(gx,gz);}
function surfY(x,z){
  const gx=snapG(x),gz=snapG(z);
  const gx2=gx+(x>gx?STEP:-STEP),gz2=gz+(z>gz?STEP:-STEP);
  const tx=Math.abs(x-gx)/STEP,tz=Math.abs(z-gz)/STEP;
  const h00=getH(gx,gz),h10=getH(gx2,gz),h01=getH(gx,gz2),h11=getH(gx2,gz2);
  const a=h00*(1-tx)+h10*tx,b=h01*(1-tx)+h11*tx;
  return a*(1-tz)+b*tz;
}

// ─── Ponds ────────────────────────────────────────────────────
const pondDefs=[[6,4,2.8],[-11,9,2.2],[-5,-11,2],[13,-6,2]];
const pondWY=[]; // {px,pz,pr,wY} populated by mkTerrain
function inPond(x,z){for(const p of pondDefs)if(Math.sqrt((x-p[0])**2+(z-p[1])**2)<p[2])return true;return false;}
function getWaterY(x,z){for(const p of pondWY)if(Math.sqrt((x-p.px)**2+(z-p.pz)**2)<p.pr)return p.wY;return null;}

// ─── Collision System ─────────────────────────────────────────
let colls=[];
function addC(x,z,hw,hd,topY){colls.push({x,z,hw,hd,topY});}
function landY(px,pz,py,prevY){
  const checkTop=prevY!==undefined?Math.max(py,prevY):py;
  let b=-999;
  for(const c of colls){
    if(px+PR>c.x-c.hw&&px-PR<c.x+c.hw&&pz+PR>c.z-c.hd&&pz-PR<c.z+c.hd){
      if(c.topY<=checkTop+0.15&&c.topY>b)b=c.topY;
    }
  }
  return b;
}
function hColl(px,pz,py){for(const c of colls)if(px+PR>c.x-c.hw&&px-PR<c.x+c.hw&&pz+PR>c.z-c.hd&&pz-PR<c.z+c.hd&&py<c.topY&&py+PH>c.topY-1.5)return true;return false;}

// ─── Love Letters ─────────────────────────────────────────────
const LETTERS=[
  {msg:"You make every ordinary moment feel magical",x:2,z:5,y:0,type:"ground"},
  {msg:"My favorite place in the world is next to you",x:-4,z:3,y:0,type:"ground"},
  {msg:"You're the reason I believe in forever",x:8,z:-3,y:0,type:"ground"},
  {msg:"Every love song makes sense because of you",x:-7,z:-5,y:0,type:"ground"},
  {msg:"I fall for you a little more every single day",x:3,z:12,y:0,type:"ground"},
  {msg:"You climbed all the way up here for me? That's love",x:-14,z:-3,y:8,type:"sky"},
  {msg:"From up here I can see our whole future together",x:10,z:-10,y:10,type:"sky"},
  {msg:"You're my greatest adventure, always",x:-8,z:12,y:7,type:"sky"},
  {msg:"The view is beautiful, but not as beautiful as you",x:15,z:8,y:12,type:"sky"},
  {msg:"You reached the top! Just like you've reached my heart",x:0,z:-14,y:9,type:"sky"},
  {msg:"You found my secret note! I love your curiosity",x:-15,z:-12,y:0,type:"ground"},
  {msg:"Some treasures are worth searching for... like you",x:16,z:14,y:0,type:"ground"},
];

// ─── World Builders ───────────────────────────────────────────
function mkCherry(x,z,size){
  const g=new THREE.Group();const sc={small:0.6,med:0.85,large:1.3,giant:2.0}[size]||0.85;
  const gy=surfY(x,z);g.position.set(x,gy,z);
  const th=1.2*sc,tw=0.12*sc;
  const tr=bx(tw*2,th,tw*2,C.trunk);tr.position.y=th/2;g.add(tr);
  const bData=[];const bCnt=size==="giant"?5:size==="large"?4:size==="med"?3:2;
  for(let i=0;i<bCnt;i++){
    const ang=(i/bCnt)*Math.PI*2+(Math.random()-0.5)*0.5;
    const bY=th*(0.6+i*0.08),bLen=(0.5+Math.random()*0.4)*sc,rise=0.3*sc;
    const ex=Math.cos(ang)*bLen,ez=Math.sin(ang)*bLen;
    const bM=bx(0.08*sc,bLen*1.1,0.08*sc,C.trunkL);
    bM.position.set(ex*0.5,bY+rise*0.5,ez*0.5);bM.lookAt(new THREE.Vector3(ex,bY+rise,ez));bM.rotateX(Math.PI/2);g.add(bM);
    bData.push({x:ex,y:bY+rise,z:ez,len:bLen});
    if(size!=="small"&&Math.random()>0.3){
      const sA=ang+(Math.random()-0.5),sL=bLen*0.45;
      const sx=ex+Math.cos(sA)*sL,sz2=ez+Math.sin(sA)*sL,sy=bY+rise+0.15*sc;
      const sb=bx(0.05*sc,sL*1.1,0.05*sc,C.trunk);sb.position.set((ex+sx)/2,(bY+rise+sy)/2,(ez+sz2)/2);
      sb.lookAt(new THREE.Vector3(sx,sy,sz2));sb.rotateX(Math.PI/2);g.add(sb);
      bData.push({x:sx,y:sy,z:sz2,len:sL*0.6});
    }
  }
  const bCols=[C.bl1,C.bl2,C.bl3,C.bl4,C.blW];
  bData.forEach(b=>{const cR=(0.25+b.len*0.3)*sc;
    for(let j=0;j<(size==="giant"?5:3);j++){const s=cR*(0.5+Math.random()*0.5);
      const cl=bx(s,s*0.65,s,Math.random()>0.8?C.leafL:bCols[Math.floor(Math.random()*5)]);
      cl.position.set(b.x+(Math.random()-0.5)*cR*0.7,b.y+(Math.random()-0.3)*cR*0.5,b.z+(Math.random()-0.5)*cR*0.7);g.add(cl);}});
  for(let i=0;i<(size==="giant"?4:2);i++){const s=0.4*sc*(0.6+Math.random()*0.5);
    const cl=bx(s,s*0.6,s,bCols[Math.floor(Math.random()*5)]);
    cl.position.set((Math.random()-0.5)*0.3*sc,th+0.1*sc,(Math.random()-0.5)*0.3*sc);g.add(cl);}
  g.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true;}});
  addC(x,z,tw*3,tw*3,gy+th);addC(x,z,0.5*sc,0.5*sc,gy+th*0.85);return g;
}

function mkGreen(x,z,s=1){
  const g=new THREE.Group();const gy=surfY(x,z);g.position.set(x,gy,z);g.scale.set(s,s,s);
  const tr=bx(0.2,1.3,0.2,C.trunk);tr.position.set(0,0.65,0);g.add(tr);
  [[1.3,.4,1.3,1.1],[1.5,.4,1.5,1.4],[1.1,.35,1.1,1.7],[.7,.3,.7,2],[.4,.25,.4,2.2]].forEach(([w,h,d,y])=>{
    const l=bx(w,h,d,Math.random()>.5?C.leaf:C.leafL);l.position.set((Math.random()-.5)*.08,y,(Math.random()-.5)*.08);g.add(l);});
  g.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true;}});
  addC(x,z,0.2*s,0.2*s,gy+1.3*s);addC(x,z,0.5*s,0.5*s,gy+1.0*s);return g;
}

function mkCottage(x,z){
  const g=new THREE.Group();const gy=surfY(x,z);g.position.set(x,gy,z);
  const a=(w,h,d,c,px,py,pz)=>{const m=bx(w,h,d,c);m.position.set(px,py,pz);g.add(m);};
  a(2.5,1.5,2,C.cot,0,.75,0);a(2.8,.15,2.3,C.roof,0,1.55,0);
  for(let i=1;i<=4;i++)a(2.8-i*.35,.15,2.3-i*.28,C.roof,0,1.55+i*.14,0);
  a(.35,.6,.05,C.door,0,.3,1.02);a(.04,.04,.04,C.fC,.1,.35,1.05);
  [[-0.6,.9,1.02],[.6,.9,1.02]].forEach(([wx,wy,wz])=>{a(.35,.3,.05,C.win,wx,wy,wz);a(.4,.04,.06,C.woodD,wx,wy+.17,wz);a(.4,.04,.06,C.woodD,wx,wy-.17,wz);});
  a(.3,.7,.3,C.st,.8,2,-.5);a(.36,.08,.36,C.stD,.8,2.38,-.5);
  g.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true;}});
  addC(x,z,1.25,1,gy+1.5);addC(x,z,1.4,1.15,gy+2.1);return g;
}

function mkFence(x,z,rot=0){
  const g=new THREE.Group();const gy=surfY(x,z);g.position.set(x,gy,z);g.rotation.y=rot;
  for(let i=0;i<3;i++){const p=bx(.08,.5,.08,C.fence);p.position.set(i*.5-.5,.25,0);g.add(p);}
  const r1=bx(1.1,.06,.06,C.fence);r1.position.set(0,.38,0);g.add(r1);
  const r2=bx(1.1,.06,.06,C.fence);r2.position.set(0,.2,0);g.add(r2);
  g.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true;}});addC(x,z,.55,.1,gy+.5);return g;
}

function mkCloud(x,y,z,s,shape){
  const cg=new THREE.Group();cg.position.set(x,y,z);cg.scale.set(s,s,s);
  const sh={puffy:[[0,0,0,1.6,.7,1.3],[-.7,.15,0,1.1,.6,1],[.8,.1,0,1.2,.55,1.1],[-.2,.35,.15,.9,.45,.8]],
    long:[[0,0,0,2.4,.4,.8],[-1.1,.06,0,1,.35,.7],[1.2,.04,0,.9,.3,.65]],small:[[0,0,0,1,.5,.8],[-.45,.1,0,.6,.4,.6]],
    big:[[0,0,0,2,.85,1.7],[-.9,.2,0,1.4,.7,1.4],[1,.15,0,1.3,.65,1.3],[-.4,.5,.2,1.1,.5,1],[0,.65,0,.8,.35,.7]],
    tower:[[0,0,0,1.8,1.2,1.5],[-.6,.5,0,1.3,.9,1.2],[0,.9,0,1,.7,1]]};
  (sh[shape]||sh.puffy).forEach(([px,py,pz,pw,ph,pd])=>{
    const p=new THREE.Mesh(geo(pw,ph,pd),new THREE.MeshLambertMaterial({color:py<=0?C.cloudS:C.cloud,transparent:true,opacity:.93}));
    p.position.set(px,py,pz);cg.add(p);});
  cg.userData={bx:x,sp:.006+Math.random()*.014};return cg;
}

function mkLetter(scene,ldata,idx,letterMeshes){
  const g=new THREE.Group();
  const env=bx(0.3,0.22,0.05,C.letter);g.add(env);
  const seal=bx(0.1,0.1,0.03,C.letterSeal);seal.position.set(0,0,0.03);g.add(seal);
  const h1=bx(0.04,0.04,0.02,C.heart);h1.position.set(-0.015,0.01,0.045);g.add(h1);
  const h2=bx(0.04,0.04,0.02,C.heart);h2.position.set(0.015,0.01,0.045);g.add(h2);
  const h3=bx(0.03,0.03,0.02,C.heart);h3.position.set(0,-0.015,0.045);g.add(h3);
  const glow=new THREE.Mesh(geo(0.45,0.35,0.08),new THREE.MeshLambertMaterial({color:C.heartGlow,transparent:true,opacity:0.2}));
  g.add(glow);
  // Warm glow light on each letter
  const light=new THREE.PointLight(0xFFB7D5,0.5,3);g.add(light);
  const wy=ldata.type==="ground"?surfY(ldata.x,ldata.z)+0.5:ldata.y;
  g.position.set(ldata.x,wy,ldata.z);
  g.userData={idx,collected:false,baseY:wy};
  scene.add(g);letterMeshes.push(g);
}

function mkObstacleCourse(scene,targetX,targetZ,targetY){
  const baseY=surfY(targetX,targetZ);
  const totalH=targetY-baseY;
  const steps=Math.ceil(totalH/1.2);
  const colors=[C.platform,C.platformAcc,C.platformWood,C.blW,C.bl1];
  for(let i=0;i<steps;i++){
    const t=i/steps;
    const angle=t*Math.PI*2+(Math.random()-0.5)*0.3;
    const radius=1.2+Math.sin(t*Math.PI)*1.5;
    const px=targetX+Math.cos(angle)*radius;
    const pz=targetZ+Math.sin(angle)*radius;
    const py=baseY+t*totalH+0.5;
    const isRest=(i%4===0);
    const pw=isRest?1.0+Math.random()*0.3:0.6+Math.random()*0.3;
    const pd=isRest?1.0+Math.random()*0.3:0.6+Math.random()*0.3;
    const col=colors[i%colors.length];
    const plat=bx(pw,0.18,pd,col);plat.position.set(px,py,pz);
    plat.castShadow=true;plat.receiveShadow=true;scene.add(plat);
    addC(px,pz,pw/2,pd/2,py+0.09);
    if(Math.random()>0.5){
      const post=bx(0.06,0.3,0.06,C.fence);post.position.set(px+(Math.random()-.5)*pw*0.5,py+0.24,pz+(Math.random()-.5)*pd*0.5);
      post.castShadow=true;scene.add(post);
    }
    if(Math.random()>0.6){
      const blos=bx(0.12,0.08,0.12,[C.bl1,C.bl2,C.bl3][Math.floor(Math.random()*3)]);
      blos.position.set(px+(Math.random()-.5)*0.2,py+0.14,pz+(Math.random()-.5)*0.2);scene.add(blos);
    }
  }
  const topPlat=bx(1.4,0.22,1.4,C.heartGlow);topPlat.position.set(targetX,targetY-0.2,targetZ);
  topPlat.castShadow=true;topPlat.receiveShadow=true;scene.add(topPlat);
  addC(targetX,targetZ,0.7,0.7,targetY-0.09);
  const arch1=bx(0.08,0.7,0.08,C.letterSeal);arch1.position.set(targetX-0.5,targetY+0.25,targetZ);scene.add(arch1);
  const arch2=bx(0.08,0.7,0.08,C.letterSeal);arch2.position.set(targetX+0.5,targetY+0.25,targetZ);scene.add(arch2);
  const archTop=bx(1.1,0.08,0.08,C.heart);archTop.position.set(targetX,targetY+0.6,targetZ);scene.add(archTop);
}

function mkTerrain(scene){
  // Base layers
  const base=bx(60,3,60,0x5BA85B);base.position.y=-2;base.receiveShadow=true;scene.add(base);
  const dirtBase=bx(60,2,60,C.dirt);dirtBase.position.y=-4.5;scene.add(dirtBase);

  // Instanced terrain pillars — single draw call instead of ~550 individual meshes
  const greens=[0x7EC87E,0x6BB86B,0x8FD88F,0x5BA85B,0x9BE49B,0x72C472];
  const greenColors=greens.map(c=>new THREE.Color(c));
  const sz=36,cells=[];
  for(let x=-sz/2;x<sz/2;x+=STEP){for(let z=-sz/2;z<sz/2;z+=STEP){
    const cx=x+HALF,cz=z+HALF;if(inPond(cx,cz))continue;
    const h=rawH(cx,cz);hMap.set(hmK(cx,cz),h);
    cells.push({cx,cz,h,pH:h+3,ci:Math.abs(Math.floor(cx*3.7+cz*5.3))%6});
  }}
  const tGeo=new THREE.BoxGeometry(1,1,1);
  const tMat=new THREE.MeshLambertMaterial();
  const tMesh=new THREE.InstancedMesh(tGeo,tMat,cells.length);
  tMesh.receiveShadow=true;
  const dummy=new THREE.Object3D();
  cells.forEach((c,i)=>{
    dummy.position.set(c.cx,c.h-c.pH/2,c.cz);
    dummy.scale.set(STEP+0.02,c.pH,STEP+0.02);
    dummy.updateMatrix();
    tMesh.setMatrixAt(i,dummy.matrix);
    tMesh.setColorAt(i,greenColors[c.ci]);
  });
  tMesh.instanceMatrix.needsUpdate=true;
  if(tMesh.instanceColor)tMesh.instanceColor.needsUpdate=true;
  scene.add(tMesh);

  // Terrain detail patches
  for(let i=0;i<25;i++){const px=(Math.random()-.5)*30,pz=(Math.random()-.5)*30;if(inPond(px,pz))continue;
    const patch=bx(1.5+Math.random()*2,.04,1.5+Math.random()*2,greens[Math.floor(Math.random()*6)]);
    patch.position.set(px,surfY(px,pz)+0.02,pz);patch.receiveShadow=true;scene.add(patch);}

  // Rocks
  [[-8,-14,2,1.8,1.5],[10,12,1.8,2,1.2],[16,-12,1.5,1.5,2],[-14,10,2.2,1.6,1.8],[0,16,1.5,3,1],[-16,-4,1.8,1.2,2.5]].forEach(([rx,rz,rw,rd,rh])=>{
    const gy=surfY(rx,rz);const r1=bx(rw,rh,rd,C.st);r1.position.set(rx,gy+rh/2,rz);r1.receiveShadow=true;r1.castShadow=true;scene.add(r1);
    const r2=bx(rw*0.7,rh*0.6,rd*0.7,C.stD);r2.position.set(rx+0.2,gy+rh+rh*0.3,rz-0.1);r2.receiveShadow=true;r2.castShadow=true;scene.add(r2);
    const moss=bx(rw*0.5,.08,rd*0.5,C.g2);moss.position.set(rx,gy+rh+rh*0.6+.05,rz);scene.add(moss);
    addC(rx,rz,rw/2,rd/2,gy+rh+rh*0.6);});

  // Ponds — organic sand ring with polygonOffset to fix z-fighting, store water Y
  pondWY.length=0;
  const sandMat1=new THREE.MeshLambertMaterial({color:C.sand,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
  const sandMat2=new THREE.MeshLambertMaterial({color:C.sandD,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
  pondDefs.forEach(([px,pz,pr])=>{let es=0,ec=0;for(let a=0;a<Math.PI*2;a+=0.5){es+=surfY(px+Math.cos(a)*(pr+0.5),pz+Math.sin(a)*(pr+0.5));ec++;}
    const eH=es/ec,wY=eH-0.4;
    pondWY.push({px,pz,pr,wY});
    for(let a=0;a<Math.PI*2;a+=0.35){const r=pr+0.2+Math.random()*0.4,sw=0.7+Math.random()*0.5;
      const sb=new THREE.Mesh(geo(sw,.12,sw),Math.random()>.5?sandMat1:sandMat2);
      sb.position.set(px+Math.cos(a)*r,eH-0.1,pz+Math.sin(a)*r);sb.receiveShadow=true;scene.add(sb);}
    const wS=new THREE.Mesh(geo(pr*1.8,.08,pr*1.8),new THREE.MeshLambertMaterial({color:C.water,transparent:true,opacity:.75}));
    wS.position.set(px,wY,pz);scene.add(wS);
    const wD=new THREE.Mesh(geo(pr*1.1,.06,pr*1.1),new THREE.MeshLambertMaterial({color:C.waterD,transparent:true,opacity:.5}));
    wD.position.set(px,wY+.03,pz);scene.add(wD);
    for(let i=0;i<3;i++){const lp=bx(.22,.03,.22,0x4A9E4A);lp.position.set(px+(Math.random()-.5)*pr,wY+.05,pz+(Math.random()-.5)*pr);scene.add(lp);}});

  // Flowers
  const fCols=[C.f1,C.f2,C.f3,C.f4,C.f5];
  for(let p=0;p<8;p++){const pcx=(Math.random()-.5)*22,pcz=(Math.random()-.5)*22,pcol=fCols[Math.floor(Math.random()*5)];
    for(let i=0;i<5+Math.floor(Math.random()*5);i++){const fx=pcx+(Math.random()-.5)*3,fz=pcz+(Math.random()-.5)*3;
      if(!inPond(fx,fz)){const fl=new THREE.Group();fl.position.set(fx,surfY(fx,fz),fz);const sc2=0.4+Math.random()*0.3;fl.scale.set(sc2,sc2,sc2);
        const st=bx(.04,.3,.04,C.g2);st.position.set(0,.15,0);fl.add(st);
        [[.08,0],[-.08,0],[0,.08],[0,-.08]].forEach(([a,b])=>{const pp=bx(.08,.08,.08,pcol);pp.position.set(a,.35,b);fl.add(pp);});
        const cn=bx(.07,.07,.07,C.fC);cn.position.set(0,.35,0);fl.add(cn);scene.add(fl);}}}

  // Grass tufts
  for(let i=0;i<60;i++){const gx=(Math.random()-.5)*26,gz=(Math.random()-.5)*26;if(inPond(gx,gz))continue;
    const gg=new THREE.Group();gg.position.set(gx,surfY(gx,gz),gz);
    for(let j=0;j<2;j++){const b=bx(.04,.12+Math.random()*.12,.04,[C.g1,C.g3][j]);b.position.set((Math.random()-.5)*.12,.08,(Math.random()-.5)*.12);gg.add(b);}scene.add(gg);}
}

function mkChar(){
  const r=new THREE.Group();
  const add=(grp,w,h,d,c,x=0,y=0,z=0)=>{const m=bx(w,h,d,c);m.position.set(x,y,z);grp.add(m);return m;};

  // ── Dress body (0-4) ──
  add(r,.42,.48,.28,C.dress,0,.25,0);       // 0: torso
  add(r,.52,.18,.36,C.dress,0,.07,0);       // 1: skirt
  add(r,.44,.05,.30,C.dressA,0,.37,0);      // 2: waist ribbon
  add(r,.54,.04,.38,C.dressA,0,-.01,0);     // 3: hem trim
  add(r,.30,.04,.22,C.blW,0,.46,.04);       // 4: collar

  // ── Body (5) ──
  add(r,.36,.36,.30,C.skin,0,.72,0);        // 5: neck/upper body

  // ── Hair group with bow (6) ──
  const hg=new THREE.Group();hg.position.y=.82;
  add(hg,.54,.36,.48,C.hair,0,.12,0);       // main volume
  add(hg,.50,.20,.44,C.hair,0,.32,0);       // top layer
  add(hg,.42,.10,.38,C.hairH,0,.40,0);      // highlights top
  add(hg,.14,.28,.40,C.hair,-.28,.06,0);    // side L
  add(hg,.14,.28,.40,C.hair,.28,.06,0);     // side R
  add(hg,.18,.10,.18,C.hairH,.14,.36,.10);  // highlight accent
  add(hg,.16,.08,.16,C.hairH,-.10,.38,-.04);// highlight back
  // Hair bow
  const bow=new THREE.Group();bow.position.set(.20,.30,.10);
  const bwL=bx(.07,.05,.05,C.dressA);bwL.position.set(-.04,0,0);bwL.rotation.z=.3;bow.add(bwL);
  const bwR=bx(.07,.05,.05,C.dressA);bwR.position.set(.04,0,0);bwR.rotation.z=-.3;bow.add(bwR);
  add(bow,.035,.035,.035,C.letterSeal);
  hg.add(bow);
  r.add(hg);                                // 6

  // ── Face (7-13) ──
  add(r,.10,.10,.04,C.eyes,-.09,.76,.175);   // 7: eye L
  add(r,.10,.10,.04,C.eyes,.09,.76,.175);    // 8: eye R
  add(r,.045,.045,.02,C.eyeW,-.07,.78,.19);  // 9: eye shine L (bigger shine = cuter)
  add(r,.045,.045,.02,C.eyeW,.11,.78,.19);   // 10: eye shine R
  add(r,.09,.06,.03,C.cheek,-.14,.68,.17);   // 11: cheek L
  add(r,.09,.06,.03,C.cheek,.14,.68,.17);    // 12: cheek R
  add(r,.08,.025,.02,C.dressA,0,.67,.185);   // 13: smile

  // ── Arms as groups — rotate from shoulder joint (14, 15) ──
  const armL=new THREE.Group();armL.position.set(-.26,.40,0);
  add(armL,.10,.26,.10,C.skin,0,-.13,0);     // upper arm
  add(armL,.12,.10,.12,C.dress,0,.01,0);     // sleeve
  add(armL,.07,.07,.07,C.skin,0,-.28,0);     // hand
  r.add(armL);                               // 14

  const armR=new THREE.Group();armR.position.set(.26,.40,0);
  add(armR,.10,.26,.10,C.skin,0,-.13,0);
  add(armR,.12,.10,.12,C.dress,0,.01,0);
  add(armR,.07,.07,.07,C.skin,0,-.28,0);
  r.add(armR);                               // 15

  // ── Legs as groups — rotate from hip joint (16, 17) ──
  const legL=new THREE.Group();legL.position.set(-.10,-.02,0);
  add(legL,.12,.22,.14,C.skin,0,-.11,0);     // thigh
  add(legL,.14,.09,.18,C.shoes,0,-.24,.02);  // shoe
  r.add(legL);                               // 16

  const legR=new THREE.Group();legR.position.set(.10,-.02,0);
  add(legR,.12,.22,.14,C.skin,0,-.11,0);
  add(legR,.14,.09,.18,C.shoes,0,-.24,.02);
  r.add(legR);                               // 17

  r.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true;}});return r;
}

// ─── Start Screen ─────────────────────────────────────────────
export default function Game(){
  const [on,setOn]=useState(false);
  return(<div style={{width:"100%",height:"100vh",position:"relative",overflow:"hidden",background:"#1a1a2e"}}>
    {on?<GC/>:(
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",height:"100%",flexDirection:"column",gap:20,
        background:"linear-gradient(135deg,#2a1a3e 0%,#1a2a3e 50%,#2a1a2e 100%)",position:"relative",overflow:"hidden"}}>
        {/* Floating petals on start screen */}
        <div style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden"}}>
          {[...Array(8)].map((_,i)=>(
            <div key={i} style={{
              position:"absolute",width:8+i*2,height:8+i*2,borderRadius:"50% 0 50% 50%",
              background:["#FFB7D5","#FFA0C8","#FFE4EC","#FFF0F5","#FFCDE0","#FF8FB8","#FFB7D5","#FFA0C8"][i],
              opacity:0.4+Math.random()*0.3,
              left:`${10+i*11}%`,
              animation:`petalFloat ${6+i*1.5}s ease-in-out infinite`,
              animationDelay:`${i*0.8}s`,
            }}/>
          ))}
        </div>

        <div style={{fontSize:56,marginBottom:4,filter:"drop-shadow(0 0 20px rgba(255,183,213,0.6))",zIndex:1}}>🌸</div>
        <h1 style={{color:"#FFB7D5",fontSize:28,fontFamily:"'Georgia',serif",fontWeight:"normal",letterSpacing:3,margin:0,zIndex:1,
          textShadow:"0 0 30px rgba(255,183,213,0.3)"}}>Cherry Blossom Meadow</h1>
        <div style={{color:"#8888aa",fontSize:13,fontFamily:"'Segoe UI',sans-serif",letterSpacing:2,textTransform:"uppercase",zIndex:1}}>
          A Meadow Made For You</div>
        <button onClick={async()=>{await Tone.start();setOn(true);}} style={{
          background:"linear-gradient(135deg,#F2A6C1,#E8789A)",border:"none",borderRadius:20,padding:"18px 40px",
          color:"#fff",fontSize:18,fontWeight:"bold",cursor:"pointer",fontFamily:"'Segoe UI',sans-serif",
          boxShadow:"0 4px 24px rgba(232,120,154,0.4),inset 0 1px 0 rgba(255,255,255,0.2)",
          transition:"all 0.3s ease",zIndex:1,letterSpacing:1}}
          onMouseEnter={e=>{e.target.style.transform="scale(1.06) translateY(-2px)";e.target.style.boxShadow="0 8px 32px rgba(232,120,154,0.5),inset 0 1px 0 rgba(255,255,255,0.2)";}}
          onMouseLeave={e=>{e.target.style.transform="scale(1)";e.target.style.boxShadow="0 4px 24px rgba(232,120,154,0.4),inset 0 1px 0 rgba(255,255,255,0.2)";}}>
          Enter the Meadow</button>
        <div style={{color:"#666688",fontSize:11,fontFamily:"'Segoe UI',sans-serif",zIndex:1,marginTop:4}}>
          WASD move &middot; Mouse look &middot; Space jump &middot; Shift sprint</div>

        <style>{`
          @keyframes petalFloat {
            0% { transform: translateY(100vh) rotate(0deg); opacity: 0; }
            10% { opacity: 0.5; }
            90% { opacity: 0.3; }
            100% { transform: translateY(-20vh) rotate(360deg); opacity: 0; }
          }
        `}</style>
      </div>
    )}
  </div>);
}

// ─── Game Core ────────────────────────────────────────────────
function GC(){
  const ref=useRef(null);const ft=useRef(0);
  const keys=useRef({}).current;
  const [collected,setCollected]=useState([]);
  const [showMsg,setShowMsg]=useState(null);
  const [journal,setJournal]=useState(false);
  const [showHints,setShowHints]=useState(true);
  const collectedRef=useRef(new Set());
  const S=useRef({md:false,dx:0,dy:0,yaw:0,pitch:.45,vy:0,px:0,py:0,pz:2,gnd:true,t:0,mv:false,
    jumps:0,coyote:0,jumpBuf:0,sprint:false,walkCycle:0,inWater:false,landSquash:0}).current;

  // Fade out control hints after 8 seconds
  useEffect(()=>{const t=setTimeout(()=>setShowHints(false),8000);return()=>clearTimeout(t);},[]);

  const playCollect=useCallback(()=>{
    const synth=new Tone.Synth({oscillator:{type:"triangle"},envelope:{attack:.01,decay:.3,sustain:.1,release:.5},volume:-8}).toDestination();
    synth.triggerAttackRelease("E5","8n");
    setTimeout(()=>{synth.triggerAttackRelease("G5","8n");},120);
    setTimeout(()=>{synth.triggerAttackRelease("B5","8n");},240);
    setTimeout(()=>{synth.triggerAttackRelease("E6","4n");},360);
  },[]);

  useEffect(()=>{
    const el=ref.current;if(!el)return;
    colls=[];hMap.clear();_geos.clear();_mats.clear();
    const W=el.clientWidth,H=el.clientHeight;
    const ren=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
    ren.setSize(W,H);ren.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
    ren.shadowMap.enabled=true;ren.shadowMap.type=THREE.PCFSoftShadowMap;
    el.appendChild(ren.domElement);

    const sc=new THREE.Scene();sc.fog=new THREE.FogExp2(0xD0E8F5,.012);
    const cam=new THREE.PerspectiveCamera(50,W/H,.1,150);
    sc.add(new THREE.AmbientLight(0xFFEEDD,.55));
    const sun=new THREE.DirectionalLight(0xFFF5E0,1.1);sun.position.set(10,15,8);sun.castShadow=true;
    sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.near=.5;sun.shadow.camera.far=50;
    sun.shadow.camera.left=-22;sun.shadow.camera.right=22;sun.shadow.camera.top=22;sun.shadow.camera.bottom=-22;
    sun.shadow.bias=-.002;sc.add(sun);
    const fill1=new THREE.DirectionalLight(0xBBCCFF,.25);fill1.position.set(-6,8,-5);sc.add(fill1);
    const fill2=new THREE.DirectionalLight(0xFFDDBB,.15);fill2.position.set(-10,2,10);sc.add(fill2);

    // Sky
    const sky=new THREE.Mesh(new THREE.SphereGeometry(80,20,20),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,
      uniforms:{cTop:{value:new THREE.Color(0x4A90D9)},cMid:{value:new THREE.Color(0x87CEEB)},cHor:{value:new THREE.Color(0xE8F0FF)},
        cSun:{value:new THREE.Color(0xFFE4B5)},cSunC:{value:new THREE.Color(0xFFF8E7)},sDir:{value:new THREE.Vector3(.6,.25,.5).normalize()},time:{value:0}},
      vertexShader:`varying vec3 vD;void main(){vD=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform vec3 cTop,cMid,cHor,cSun,cSunC,sDir;uniform float time;varying vec3 vD;void main(){
        vec3 d=normalize(vD);float h=d.y;vec3 col;if(h>.3)col=mix(cMid,cTop,smoothstep(.3,.8,h));else if(h>0.)col=mix(cHor,cMid,smoothstep(0.,.3,h));else col=cHor;
        float sd=max(0.,dot(d,sDir));col=mix(col,cSun,pow(sd,4.)*.6);col=mix(col,cSunC,pow(sd,32.)*.8);
        col+=vec3(1,.5,.8)*sin(h*12.+time*.1)*.015;col=mix(col,cSun*1.1,smoothstep(.15,-.05,h)*.25);gl_FragColor=vec4(col,1.);}`,
    }));sc.add(sky);

    // Clouds
    const clds=[];
    [[-6,8,-8,1.1,"big"],[8,9,-5,.8,"puffy"],[-10,7.5,4,1.2,"long"],[4,9,8,.7,"small"],
     [12,8,-2,.9,"tower"],[-4,9.5,10,1,"big"],[0,8,-14,.85,"long"],[-14,7.5,-3,.75,"small"],
     [15,9,10,1.3,"big"],[-16,9.5,-10,1,"puffy"],[10,8,16,.9,"long"],[-12,8.5,14,.8,"tower"],
     [18,9.5,0,1.1,"puffy"],[-18,8,8,1,"big"],[6,10,-18,.7,"long"],[-8,9,-18,.9,"puffy"],
     [22,9,-15,1.4,"big"],[-22,10,12,1.2,"long"],[0,10,25,1.3,"big"],[20,9,18,.8,"puffy"],
    ].forEach(([x,y,z,s,sh])=>{const c=mkCloud(x,y,z,s,sh);clds.push(c);sc.add(c);});

    // World
    mkTerrain(sc);
    [[-5,-3,"giant"],[7,5,"large"],[-8,7,"med"],[3,-7,"large"],[-3,10,"giant"],
     [10,-4,"med"],[-12,-8,"large"],[12,9,"small"],[-6,-10,"med"],[8,12,"giant"],
     [15,-8,"small"],[-15,4,"large"],[0,14,"med"],[-10,13,"small"],[14,2,"med"],
    ].forEach(([x,z,sz])=>sc.add(mkCherry(x,z,sz)));
    [[6,-9,.9],[-9,0,1.1],[11,11,.8],[-14,-5,1],[5,-14,.7],[-7,14,.9],[16,6,.85],[-16,10,1.05]
    ].forEach(([x,z,s])=>sc.add(mkGreen(x,z,s)));
    sc.add(mkCottage(0,-8));
    [[-2.5,-5.5,0],[-2.5,-6.5,0],[2.5,-5.5,0],[2.5,-6.5,0]].forEach(([x,z])=>sc.add(mkFence(x,z,0)));
    sc.add(mkFence(-3,-5,Math.PI/2));sc.add(mkFence(3,-5,Math.PI/2));

    // Obstacle courses for sky letters
    LETTERS.filter(l=>l.type==="sky").forEach(l=>mkObstacleCourse(sc,l.x,l.z,l.y));

    // Letters
    const letterMeshes=[];
    LETTERS.forEach((l,i)=>mkLetter(sc,l,i,letterMeshes));

    // Character
    S.py=surfY(S.px,S.pz);
    const chr=mkChar();chr.scale.set(.5,.5,.5);sc.add(chr);
    const shd=new THREE.Mesh(new THREE.CircleGeometry(.12,12),new THREE.MeshBasicMaterial({color:0,transparent:true,opacity:.3,depthWrite:false}));
    shd.rotation.x=-Math.PI/2;sc.add(shd);

    // Petals — Points instead of individual meshes
    const petalCount=60;
    const petalPos=new Float32Array(petalCount*3);
    const petalCols=new Float32Array(petalCount*3);
    const petalData=[];
    const bColors=[new THREE.Color(C.bl1),new THREE.Color(C.bl2),new THREE.Color(C.bl3),new THREE.Color(C.blW)];
    for(let i=0;i<petalCount;i++){
      petalPos[i*3]=(Math.random()-.5)*20;
      petalPos[i*3+1]=2+Math.random()*4;
      petalPos[i*3+2]=(Math.random()-.5)*20;
      const c=bColors[Math.floor(Math.random()*4)];
      petalCols[i*3]=c.r;petalCols[i*3+1]=c.g;petalCols[i*3+2]=c.b;
      petalData.push({sp:.002+Math.random()*.005,dr:Math.random()*Math.PI*2});
    }
    const petalGeo=new THREE.BufferGeometry();
    petalGeo.setAttribute("position",new THREE.BufferAttribute(petalPos,3));
    petalGeo.setAttribute("color",new THREE.BufferAttribute(petalCols,3));
    const petalMat=new THREE.PointsMaterial({size:.08,vertexColors:true,transparent:true,opacity:.85,sizeAttenuation:true});
    const petals=new THREE.Points(petalGeo,petalMat);
    sc.add(petals);

    // Fireflies — glowing additive-blend points
    const ffCount=20;
    const ffPos=new Float32Array(ffCount*3);
    const ffData=[];
    for(let i=0;i<ffCount;i++){
      const fx=(Math.random()-.5)*24,fz=(Math.random()-.5)*24;
      ffPos[i*3]=fx;ffPos[i*3+1]=surfY(fx,fz)+0.5+Math.random()*1.5;ffPos[i*3+2]=fz;
      ffData.push({ph:Math.random()*Math.PI*2,sp:0.3+Math.random()*0.5,bx:fx,bz:fz});
    }
    const ffGeo=new THREE.BufferGeometry();
    ffGeo.setAttribute("position",new THREE.BufferAttribute(ffPos,3));
    const ffMat=new THREE.PointsMaterial({size:.12,color:0xFFFF88,transparent:true,opacity:.7,blending:THREE.AdditiveBlending,sizeAttenuation:true});
    const fireflies=new THREE.Points(ffGeo,ffMat);
    sc.add(fireflies);

    // Butterflies
    const butterflies=[];
    const bfCols=[0xFFB7D5,0xC9A0FF,0xFFE066,0xADD8E6,0xFFA0C8,0xFFCDE0];
    for(let i=0;i<8;i++){
      const bg=new THREE.Group();const col=bfCols[i%bfCols.length];
      const w1=bx(0.06,0.01,0.05,col);w1.position.x=-0.035;
      const w2=bx(0.06,0.01,0.05,col);w2.position.x=0.035;
      bg.add(w1,w2);
      const sx=(Math.random()-.5)*20,sz=(Math.random()-.5)*20;
      bg.position.set(sx,surfY(sx,sz)+0.5+Math.random()*1.5,sz);
      bg.userData={ph:Math.random()*Math.PI*2,sp:0.008+Math.random()*0.008,cx:sx,cz:sz,radius:1+Math.random()*2};
      butterflies.push(bg);sc.add(bg);
    }

    // Collection particle pool
    const collParticles=[];

    // Audio setup
    const vol=new Tone.Volume(-6).toDestination();const rev=new Tone.Reverb({decay:3,wet:.4}).connect(vol);
    const dly=new Tone.FeedbackDelay({delayTime:"8n",feedback:.15,wet:.2}).connect(rev);
    const pad=new Tone.PolySynth(Tone.Synth,{oscillator:{type:"sine"},envelope:{attack:3,decay:2,sustain:.8,release:4},volume:-22}).connect(rev);
    const ch=[["C4","E4","G4","B4"],["A3","C4","E4","G4"],["F3","A3","C4","E4"],["G3","B3","D4","F4"]];let ci=0;
    new Tone.Loop(t=>{pad.triggerAttackRelease(ch[ci],"4m",t,.3);ci=(ci+1)%ch.length;},"4m").start(0);
    const mb=new Tone.Synth({oscillator:{type:"triangle"},envelope:{attack:.01,decay:.8,sustain:0,release:1.2},volume:-18}).connect(dly);
    const ml=["E5","G5","A5","B5","D6","E6","G5","B5","A5","D6","E5","G6"];let ni=0;
    const mll=new Tone.Loop(t=>{if(Math.random()>.35)mb.triggerAttackRelease(ml[ni],"8n",t,.25+Math.random()*.15);ni=(ni+1)%ml.length;},"4n");mll.start(0);mll.humanize="16n";
    const brd=new Tone.Synth({oscillator:{type:"sine"},envelope:{attack:.01,decay:.15,sustain:0,release:.2},volume:-20}).connect(rev);
    const bns=["E6","G6","A6","C7","D7"];
    new Tone.Loop(t=>{if(Math.random()>.5){brd.triggerAttackRelease(bns[Math.floor(Math.random()*5)],"32n",t,.2);
      if(Math.random()>.4)brd.triggerAttackRelease(bns[Math.floor(Math.random()*5)],"32n",t+.12,.15);}},"2m").start(0);
    const wnd=new Tone.Noise({type:"pink",volume:-30});const wndf=new Tone.AutoFilter({frequency:.08,baseFrequency:200,octaves:2,wet:1}).connect(vol);wnd.connect(wndf);wnd.start();
    const wtn=new Tone.Noise({type:"white",volume:-42});const wtv=new Tone.Volume(-42).connect(vol);const wtf2=new Tone.AutoFilter({frequency:.5,baseFrequency:800,octaves:1.5,wet:1}).connect(wtv);wtn.connect(wtf2);wtn.start();
    const fsf=new Tone.NoiseSynth({noise:{type:"brown"},envelope:{attack:.005,decay:.06,sustain:0,release:.03},volume:-16}).connect(vol);
    const jsf=new Tone.Synth({oscillator:{type:"sine"},envelope:{attack:.01,decay:.2,sustain:0,release:.1},volume:-14}).connect(rev);
    const lsf=new Tone.NoiseSynth({noise:{type:"brown"},envelope:{attack:.01,decay:.12,sustain:0,release:.08},volume:-12}).connect(vol);
    // Double-jump whoosh
    const djSf=new Tone.NoiseSynth({noise:{type:"white"},envelope:{attack:.01,decay:.08,sustain:0,release:.06},volume:-18}).connect(rev);
    // Water splash
    const splSf=new Tone.NoiseSynth({noise:{type:"white"},envelope:{attack:.005,decay:.12,sustain:0,release:.08},volume:-14}).connect(rev);
    Tone.getTransport().bpm.value=72;Tone.getTransport().start();

    // Input
    const clearKeys=()=>{for(const k in keys)keys[k]=false;S.md=false;};
    const onKD=e=>{keys[e.key.toLowerCase()]=true;if(e.key==="Shift")S.sprint=true;};
    const onKU=e=>{keys[e.key.toLowerCase()]=false;if(e.key==="Shift")S.sprint=false;};
    const onMD=e=>{if(e.button===0||e.button===2){S.md=true;ren.domElement.requestPointerLock?.();}};
    const onMU=()=>{S.md=false;document.exitPointerLock?.();};
    const onMM=e=>{if(document.pointerLockElement===ren.domElement||S.md){S.dx+=e.movementX;S.dy+=e.movementY;}};
    const onCtxMenu=e=>e.preventDefault();
    const onVisChange=()=>{if(document.hidden)clearKeys();};
    const onPLChange=()=>{if(!document.pointerLockElement)clearKeys();};
    window.addEventListener("keydown",onKD);window.addEventListener("keyup",onKU);
    ren.domElement.addEventListener("mousedown",onMD);window.addEventListener("mouseup",onMU);
    window.addEventListener("mousemove",onMM);ren.domElement.addEventListener("contextmenu",onCtxMenu);
    window.addEventListener("blur",clearKeys);document.addEventListener("visibilitychange",onVisChange);
    document.addEventListener("pointerlockchange",onPLChange);

    const onResize=()=>{
      const w=el.clientWidth,h=el.clientHeight;
      ren.setSize(w,h);cam.aspect=w/h;cam.updateProjectionMatrix();
    };
    window.addEventListener("resize",onResize);

    // Animation
    let raf;const tv=new THREE.Vector3();
    const animate=()=>{
      raf=requestAnimationFrame(animate);S.t+=.016;

      // Camera
      S.yaw-=S.dx*MS;S.pitch+=S.dy*MS;S.pitch=Math.max(PMIN,Math.min(PMAX,S.pitch));S.dx=0;S.dy=0;
      sky.material.uniforms.time.value=S.t;

      // Movement (S.inWater carries from previous frame for speed)
      let imx=0,imz=0;
      if(keys["w"]||keys["arrowup"])imz=1;if(keys["s"]||keys["arrowdown"])imz=-1;
      if(keys["a"]||keys["arrowleft"])imx=-1;if(keys["d"]||keys["arrowright"])imx=1;
      S.mv=imx!==0||imz!==0;
      const spd=(S.sprint?SPRINT_SPD:SPD)*(S.inWater?0.55:1);
      if(S.mv){const l=Math.sqrt(imx*imx+imz*imz);imx/=l;imz/=l;
        const cy=Math.cos(S.yaw),sy=Math.sin(S.yaw),fx=-sy,fz=-cy,rx=cy,rz=-sy;
        const wx=fx*imz+rx*imx,wz=fz*imz+rz*imx,nx=S.px+wx*spd,nz=S.pz+wz*spd;
        if(!hColl(nx,nz,S.py)){S.px=nx;S.pz=nz;}else{if(!hColl(nx,S.pz,S.py))S.px=nx;if(!hColl(S.px,nz,S.py))S.pz=nz;}
        chr.rotation.y=Math.atan2(wx,wz);}

      // Coyote time + jump buffering
      if(S.gnd){S.coyote=COYOTE;S.jumps=0;}else{S.coyote=Math.max(0,S.coyote-1);}
      if(keys[" "]||keys["space"])S.jumpBuf=JUMP_BUF;else S.jumpBuf=Math.max(0,S.jumpBuf-1);

      // Jump execution
      const canJump=S.gnd||S.coyote>0||S.jumps<MAX_JUMPS;
      if(S.jumpBuf>0&&canJump&&!(S.gnd&&S.vy>0)){
        const isDouble=S.jumps>=1;
        S.vy=JMP*(isDouble?0.85:1);S.gnd=false;S.coyote=0;S.jumpBuf=0;S.jumps++;
        if(isDouble){djSf.triggerAttackRelease("16n",undefined,.3);}
        else{jsf.triggerAttackRelease("C5","16n",undefined,.4);}
      }

      // Variable jump height — release early for short hop
      if(!keys[" "]&&!keys["space"]&&S.vy>JMP*0.35)S.vy*=0.65;

      // Gravity + landing — water surface acts as a physics floor
      const prevY=S.py;
      S.vy-=GRV;S.py+=S.vy;
      const gT=surfY(S.px,S.pz),gC=landY(S.px,S.pz,S.py,prevY);
      let gY=Math.max(gT,gC>-900?gC:-999);
      const wY=getWaterY(S.px,S.pz);
      const wFloor=wY!==null?wY:-999;
      const landOnWater=wFloor>gY;
      gY=Math.max(gY,wFloor);

      if(S.py<=gY){
        if(!S.gnd&&S.vy<-0.02){
          if(landOnWater){splSf.triggerAttackRelease("16n",undefined,.3);S.landSquash=0.4;}
          else{lsf.triggerAttackRelease("16n",undefined,.3);S.landSquash=1;}
        }
        S.py=gY;S.vy=0;S.gnd=true;
      }else if(S.gnd&&S.py-gY<0.15&&S.vy<=0){
        S.py=gY;S.vy=0;
      }else{S.gnd=false;}

      // Water state — only in water when standing on the water surface
      const wasInWater=S.inWater;
      S.inWater=wY!==null&&S.gnd&&S.py<=wY+0.05&&landOnWater;
      if(S.inWater&&!wasInWater&&S.landSquash<=0){splSf.triggerAttackRelease("16n",undefined,.2);}

      // ── Character animation ──
      // Water: partially submerged — sink her so water is at shin level
      if(S.inWater){
        const wadeBob=Math.sin(S.t*3)*.02;
        chr.position.set(S.px,S.py+CHAR_FOOT-0.10+wadeBob,S.pz);
      }else{
        const breathe=Math.sin(S.t*2)*.015;
        chr.position.set(S.px,S.py+CHAR_FOOT+breathe,S.pz);
      }

      // Landing squash & stretch
      if(S.landSquash>0){
        const sq=S.landSquash;
        chr.scale.set(.5*(1+sq*.15),.5*(1-sq*.12),.5*(1+sq*.15));
        S.landSquash=Math.max(0,S.landSquash-.07);
      }else{chr.scale.set(.5,.5,.5);}

      // Limb animation — arms[14,15] legs[16,17] hair[6] skirt[1]
      if(!S.gnd&&!S.inWater){
        // Airborne poses
        if(S.vy>0){
          // Ascending — tuck legs, arms up
          chr.children[14].rotation.x=-.6;chr.children[15].rotation.x=-.6;
          chr.children[16].rotation.x=-.4;chr.children[17].rotation.x=-.4;
        }else{
          // Descending — legs down, arms out
          chr.children[14].rotation.x=-.3;chr.children[15].rotation.x=-.3;
          chr.children[16].rotation.x=.15;chr.children[17].rotation.x=.15;
        }
        chr.children[6].rotation.z=Math.sin(S.t*3)*.04;
      }else if(S.mv){
        // Walking / wading
        const wadeRate=S.inWater?0.10:S.sprint?0.22:0.16;
        S.walkCycle+=wadeRate;
        const wc=S.walkCycle;
        // Legs swing from hip
        chr.children[16].rotation.x=Math.sin(wc)*.55;
        chr.children[17].rotation.x=-Math.sin(wc)*.55;
        // Arms swing opposite
        chr.children[14].rotation.x=-Math.sin(wc)*.4;
        chr.children[15].rotation.x=Math.sin(wc)*.4;
        // Skirt sway
        chr.children[1].rotation.z=Math.sin(wc)*.03;
        // Hair bounce
        chr.children[6].rotation.z=Math.sin(wc*.5)*.04;
        chr.children[6].position.y=.82+Math.sin(wc*2)*.01;
      }else{
        // Idle — gentle sway
        chr.children[14].rotation.x=Math.sin(S.t*1.2)*.03;
        chr.children[15].rotation.x=Math.sin(S.t*1.2+.5)*.03;
        chr.children[16].rotation.x=0;chr.children[17].rotation.x=0;
        chr.children[1].rotation.z=0;
        chr.children[6].rotation.z=Math.sin(S.t*.5)*.02;
        chr.children[6].position.y=.82;
      }

      // Shadow
      shd.position.set(S.px,gY+.02,S.pz);const ha=Math.max(0,S.py-gY),ss=Math.max(.5,1-ha*.4);
      shd.scale.set(ss,ss,ss);shd.material.opacity=.3*ss;

      // Footsteps — splash in water, thud on land
      if(S.mv&&(S.gnd||S.inWater)){
        ft.current+=.016;
        const stepRate=S.inWater?.38:S.sprint?.2:.28;
        if(ft.current>stepRate){
          if(S.inWater){splSf.triggerAttackRelease("32n",undefined,.06+Math.random()*.04);}
          else{fsf.triggerAttackRelease("32n",undefined,.08+Math.random()*.06);}
          ft.current=0;
        }
      }else ft.current=0;

      // Water proximity
      let minWD=99;pondDefs.forEach(([px,pz])=>{const d=Math.sqrt((S.px-px)**2+(S.pz-pz)**2);if(d<minWD)minWD=d;});
      wtv.volume.rampTo(Math.max(-50,-18-minWD*3),.5);

      // Letters
      letterMeshes.forEach(lm=>{
        if(lm.userData.collected)return;
        lm.rotation.y=S.t*1.5;
        lm.position.y=lm.userData.baseY+Math.sin(S.t*2+lm.userData.idx)*0.15;
        const glow=lm.children[5];if(glow)glow.material.opacity=0.15+Math.sin(S.t*3+lm.userData.idx)*0.1;
        const dx=S.px-lm.position.x,dz=S.pz-lm.position.z,dy=S.py-lm.position.y;
        if(Math.sqrt(dx*dx+dz*dz+dy*dy)<0.8&&!collectedRef.current.has(lm.userData.idx)){
          lm.userData.collected=true;lm.visible=false;
          collectedRef.current.add(lm.userData.idx);
          const msg=LETTERS[lm.userData.idx].msg;
          setCollected(prev=>[...prev,msg]);
          setShowMsg(msg);
          playCollect();
          // Spawn collection particles (use own geometry, not shared cache)
          for(let i=0;i<12;i++){
            const p=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.05),new THREE.MeshLambertMaterial({
              color:[C.heart,C.heartGlow,C.bl1,C.letterSeal][i%4],transparent:true}));
            p.position.set(lm.position.x,lm.position.y,lm.position.z);
            p.userData={vx:(Math.random()-.5)*.15,vy:.05+Math.random()*.1,vz:(Math.random()-.5)*.15,life:0};
            sc.add(p);collParticles.push(p);
          }
          setTimeout(()=>setShowMsg(null),3500);
        }
      });

      // Collection particle animation
      for(let i=collParticles.length-1;i>=0;i--){
        const p=collParticles[i];
        p.userData.life+=.03;
        p.position.x+=p.userData.vx;p.position.y+=p.userData.vy;p.position.z+=p.userData.vz;
        p.userData.vy-=.003;
        p.material.opacity=Math.max(0,1-p.userData.life);
        const s=Math.max(.01,1-p.userData.life*.8);p.scale.set(s,s,s);
        if(p.userData.life>1){sc.remove(p);p.geometry.dispose?.();p.material.dispose();collParticles.splice(i,1);}
      }

      // Camera
      tv.set(S.px+Math.sin(S.yaw)*Math.cos(S.pitch)*CAM_D,S.py+CHAR_FOOT+Math.sin(S.pitch)*CAM_D+1,S.pz+Math.cos(S.yaw)*Math.cos(S.pitch)*CAM_D);
      cam.position.lerp(tv,CAM_S);cam.lookAt(S.px,S.py+CHAR_FOOT+.5,S.pz);
      sky.position.set(cam.position.x,0,cam.position.z);

      // Clouds
      clds.forEach(c=>{c.position.x=c.userData.bx+S.t*c.userData.sp*6;if(c.position.x>c.userData.bx+35)c.position.x-=70;});

      // Petals (Points-based)
      const pPos=petals.geometry.attributes.position.array;
      for(let i=0;i<petalCount;i++){
        const d=petalData[i];
        pPos[i*3]+=Math.sin(S.t*.5+d.dr)*d.sp;
        pPos[i*3+2]+=Math.cos(S.t*.3+d.dr)*d.sp;
        pPos[i*3+1]-=d.sp*.5;
        if(pPos[i*3+1]<0){pPos[i*3+1]=3+Math.random()*3;pPos[i*3]=S.px+(Math.random()-.5)*15;pPos[i*3+2]=S.pz+(Math.random()-.5)*15;}
      }
      petals.geometry.attributes.position.needsUpdate=true;

      // Fireflies
      const fPos=fireflies.geometry.attributes.position.array;
      for(let i=0;i<ffCount;i++){
        const d=ffData[i];
        fPos[i*3]=d.bx+Math.sin(S.t*d.sp+d.ph)*1.5;
        fPos[i*3+2]=d.bz+Math.cos(S.t*d.sp*0.7+d.ph)*1.5;
        fPos[i*3+1]=surfY(fPos[i*3],fPos[i*3+2])+0.5+Math.sin(S.t*d.sp*2+d.ph)*0.3;
      }
      fireflies.geometry.attributes.position.needsUpdate=true;
      ffMat.opacity=0.4+Math.sin(S.t*1.5)*0.3;

      // Butterflies
      butterflies.forEach(b=>{
        const d=b.userData;
        const t2=S.t*d.sp*60;
        b.position.x=d.cx+Math.sin(t2+d.ph)*d.radius;
        b.position.z=d.cz+Math.cos(t2*0.7+d.ph)*d.radius;
        b.position.y=surfY(b.position.x,b.position.z)+0.5+Math.sin(t2*2)*0.3;
        b.children[0].rotation.z=Math.sin(S.t*12+d.ph)*0.5;
        b.children[1].rotation.z=-Math.sin(S.t*12+d.ph)*0.5;
        b.rotation.y=Math.atan2(Math.cos(t2+d.ph),-(Math.sin(t2*0.7+d.ph)));
      });

      ren.render(sc,cam);
    };
    animate();

    return()=>{
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown",onKD);window.removeEventListener("keyup",onKU);
      ren.domElement.removeEventListener("mousedown",onMD);window.removeEventListener("mouseup",onMU);
      window.removeEventListener("mousemove",onMM);window.removeEventListener("blur",clearKeys);
      window.removeEventListener("resize",onResize);
      ren.domElement.removeEventListener("contextmenu",onCtxMenu);
      document.removeEventListener("visibilitychange",onVisChange);
      document.removeEventListener("pointerlockchange",onPLChange);
      document.exitPointerLock?.();
      Tone.getTransport().stop();Tone.getTransport().cancel();
      sc.traverse(obj=>{if(obj.geometry)obj.geometry.dispose();
        if(obj.material){const m=Array.isArray(obj.material)?obj.material:[obj.material];m.forEach(x=>x.dispose());}});
      _geos.clear();_mats.clear();
      ren.dispose();
      if(el.contains(ren.domElement))el.removeChild(ren.domElement);
    };
  },[]);

  const totalLetters=LETTERS.length;
  const groundCount=LETTERS.filter(l=>l.type==="ground").length;
  const skyCount=LETTERS.filter(l=>l.type==="sky").length;
  const collectedGround=collected.filter(m=>LETTERS.find(l=>l.msg===m&&l.type==="ground")).length;
  const collectedSky=collected.filter(m=>LETTERS.find(l=>l.msg===m&&l.type==="sky")).length;
  const allFound=collected.length===totalLetters;

  return(
    <div style={{width:"100%",height:"100%",position:"relative"}}>
      <div ref={ref} style={{width:"100%",height:"100%"}}/>

      {/* HUD */}
      <div style={{position:"absolute",top:16,left:16,display:"flex",gap:10,alignItems:"center"}}>
        <div style={{background:"rgba(0,0,0,0.45)",backdropFilter:"blur(10px)",borderRadius:14,padding:"8px 16px",
          color:"#fff",fontFamily:"'Segoe UI',sans-serif",fontSize:14,display:"flex",alignItems:"center",gap:8,
          border:"1px solid rgba(255,255,255,0.08)",boxShadow:"0 2px 12px rgba(0,0,0,0.2)"}}>
          <span style={{fontSize:18}}>💌</span>
          <span style={{fontWeight:600}}>{collected.length}<span style={{opacity:0.5,fontWeight:400}}>/{totalLetters}</span></span>
        </div>
        <button onClick={()=>setJournal(j=>!j)} style={{background:"rgba(0,0,0,0.45)",backdropFilter:"blur(10px)",
          borderRadius:14,padding:"8px 16px",border:"1px solid rgba(255,183,213,0.2)",color:"#FFB7D5",
          fontFamily:"'Segoe UI',sans-serif",fontSize:13,cursor:"pointer",transition:"all 0.2s",
          boxShadow:"0 2px 12px rgba(0,0,0,0.2)"}}
          onMouseEnter={e=>{e.target.style.background="rgba(255,183,213,0.15)";e.target.style.borderColor="rgba(255,183,213,0.4)";}}
          onMouseLeave={e=>{e.target.style.background="rgba(0,0,0,0.45)";e.target.style.borderColor="rgba(255,183,213,0.2)";}}>
          📖 Journal
        </button>
      </div>

      {/* Sprint indicator */}
      {S.sprint&&S.mv&&(
        <div style={{position:"absolute",top:16,right:16,background:"rgba(0,0,0,0.45)",backdropFilter:"blur(10px)",
          borderRadius:14,padding:"6px 14px",color:"#FFE066",fontFamily:"'Segoe UI',sans-serif",fontSize:12,
          border:"1px solid rgba(255,224,102,0.2)"}}>
          ⚡ Sprint
        </div>
      )}

      {/* Controls hint — fades out */}
      <div style={{position:"absolute",bottom:16,left:16,background:"rgba(0,0,0,0.35)",backdropFilter:"blur(8px)",
        borderRadius:12,padding:"6px 14px",color:"rgba(255,255,255,0.5)",fontFamily:"'Segoe UI',sans-serif",fontSize:11,
        opacity:showHints?1:0,transition:"opacity 2s ease-out",pointerEvents:"none"}}>
        WASD move · Mouse look · Space jump · Shift sprint · Double-tap space for double jump
      </div>

      {/* Letter collection popup */}
      {showMsg&&(
        <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
          background:"linear-gradient(135deg,rgba(255,240,224,0.95),rgba(255,183,213,0.9))",
          backdropFilter:"blur(16px)",borderRadius:24,padding:"28px 36px",maxWidth:420,textAlign:"center",
          boxShadow:"0 12px 48px rgba(232,90,122,0.35),0 0 0 1px rgba(255,183,213,0.3)",
          animation:"letterPopIn 0.5s cubic-bezier(0.34,1.56,0.64,1)"}}>
          <div style={{fontSize:32,marginBottom:10}}>💌</div>
          <div style={{color:"#5a3040",fontFamily:"'Georgia',serif",fontSize:17,lineHeight:1.7,fontStyle:"italic"}}>
            "{showMsg}"
          </div>
          <div style={{marginTop:12,color:"#9a6878",fontSize:11,fontFamily:"'Segoe UI',sans-serif"}}>
            {collected.length}/{totalLetters} letters found
          </div>
        </div>
      )}

      {/* Journal overlay */}
      {journal&&(
        <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(6px)",
          display:"flex",alignItems:"center",justifyContent:"center",zIndex:10,
          animation:"fadeIn 0.3s ease-out"}}
          onClick={e=>{if(e.target===e.currentTarget)setJournal(false);}}>
          <div style={{background:"linear-gradient(135deg,#FFF5E6,#FFE4EC)",borderRadius:28,padding:"32px 36px",
            maxWidth:500,width:"90%",maxHeight:"80vh",overflow:"auto",
            boxShadow:"0 24px 64px rgba(0,0,0,0.35),0 0 0 1px rgba(255,183,213,0.3)",
            animation:"journalIn 0.4s cubic-bezier(0.34,1.56,0.64,1)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
              <h2 style={{margin:0,color:"#5a3040",fontFamily:"'Georgia',serif",fontSize:24,fontWeight:"normal"}}>
                Love Letter Journal
              </h2>
              <button onClick={()=>setJournal(false)} style={{background:"rgba(90,48,64,0.1)",border:"none",
                width:32,height:32,borderRadius:10,fontSize:16,cursor:"pointer",color:"#5a3040",
                display:"flex",alignItems:"center",justifyContent:"center",transition:"background 0.2s"}}
                onMouseEnter={e=>e.target.style.background="rgba(90,48,64,0.2)"}
                onMouseLeave={e=>e.target.style.background="rgba(90,48,64,0.1)"}>✕</button>
            </div>

            {/* Progress bars */}
            <div style={{display:"flex",gap:16,marginBottom:20}}>
              <div style={{flex:1}}>
                <div style={{color:"#7a5060",fontFamily:"'Segoe UI',sans-serif",fontSize:12,marginBottom:6,display:"flex",justifyContent:"space-between"}}>
                  <span>🌿 Meadow</span><span>{collectedGround}/{groundCount}</span>
                </div>
                <div style={{height:6,background:"rgba(90,48,64,0.1)",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${(collectedGround/groundCount)*100}%`,background:"linear-gradient(90deg,#7EC87E,#5BA85B)",
                    borderRadius:3,transition:"width 0.5s ease"}}/>
                </div>
              </div>
              <div style={{flex:1}}>
                <div style={{color:"#7a5060",fontFamily:"'Segoe UI',sans-serif",fontSize:12,marginBottom:6,display:"flex",justifyContent:"space-between"}}>
                  <span>☁️ Sky</span><span>{collectedSky}/{skyCount}</span>
                </div>
                <div style={{height:6,background:"rgba(90,48,64,0.1)",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${(collectedSky/skyCount)*100}%`,background:"linear-gradient(90deg,#87CEEB,#4A90D9)",
                    borderRadius:3,transition:"width 0.5s ease"}}/>
                </div>
              </div>
            </div>

            {collected.length===0?(
              <div style={{textAlign:"center",padding:"40px 0",color:"#9a7080",fontFamily:"'Georgia',serif",fontStyle:"italic",fontSize:15}}>
                Explore the meadow to find love letters...
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {collected.map((msg,i)=>(
                  <div key={i} style={{background:"rgba(255,255,255,0.6)",borderRadius:14,padding:"14px 20px",
                    border:"1px solid rgba(232,90,122,0.12)",fontFamily:"'Georgia',serif",fontSize:14,
                    color:"#5a3040",lineHeight:1.6,fontStyle:"italic",
                    animation:`fadeIn 0.3s ease-out ${i*0.05}s both`}}>
                    "{msg}"
                  </div>
                ))}
              </div>
            )}

            {allFound&&(
              <div style={{textAlign:"center",marginTop:24,padding:"24px",background:"linear-gradient(135deg,#FFB7D5,#FF8FB8)",
                borderRadius:20,color:"#fff",fontFamily:"'Georgia',serif",fontSize:17,lineHeight:1.6,
                boxShadow:"0 4px 20px rgba(255,143,184,0.3)"}}>
                🌸 You found every letter! 🌸<br/>
                <span style={{fontSize:14,opacity:0.9}}>You are my everything, always and forever.</span>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes letterPopIn {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes journalIn {
          from { opacity: 0; transform: scale(0.9) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
