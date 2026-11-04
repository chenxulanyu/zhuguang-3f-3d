import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { TessellateModifier } from './vendor/TessellateModifier.js';

const $=s=>document.querySelector(s);
const host=$('#scene'), viewport=$('#viewport');
const mobileLayout=matchMedia('(max-width:800px), (max-width:1000px) and (max-height:500px)'),touchDevice=matchMedia('(pointer:coarse)').matches;
function showSettings(open){document.body.classList.toggle('controls-open',open);$('#mobile-controls').setAttribute('aria-expanded',String(open));$('#mobile-controls').textContent=open?'收起设置':'场景设置';}
$('#mobile-controls').onclick=()=>showSettings(!document.body.classList.contains('controls-open'));
const data=await fetch('./plan.json').then(r=>{if(!r.ok)throw new Error('plan load');return r.json()});
for(const d of data.doors)if(d.id==='M05'||d.id==='M06')d.name=d.name.replace('折叠门','平开门');
const MW=data.meeting_width_m,L=MW+.1,R=data.main_width_m,D=data.depth_m,MAX=R+.1+data.warehouse_width_m,NECK=2.974504249291783,RD=8.779036827195467;
const [FX,FZ,FW,FD]=data.fitting_block,HEIGHT=data.height_m;
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});}catch(e){$('#loading').style.display='none';$('#error').hidden=false;throw e;}
renderer.setPixelRatio(Math.min(window.devicePixelRatio,touchDevice?1.25:1.65));renderer.setSize(host.clientWidth,host.clientHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#e9eef0');
const camera=new THREE.PerspectiveCamera(42,host.clientWidth/host.clientHeight,.05,300);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.075;controls.maxPolarAngle=Math.PI/2-.03;controls.minDistance=3;controls.maxDistance=150;controls.enablePan=true;
const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;scene.environmentIntensity=.28;
scene.add(new THREE.HemisphereLight('#e8f4ff','#b6aaa0',1.9));
const sun=new THREE.DirectionalLight('#fff4df',3.3);sun.position.set(1,17,-7);sun.target.position.set(13,0,4);sun.castShadow=true;
sun.shadow.mapSize.set(touchDevice?1024:2048,touchDevice?1024:2048);Object.assign(sun.shadow.camera,{left:-20,right:20,top:15,bottom:-15,near:.1,far:60});sun.shadow.normalBias=.045;sun.shadow.bias=-.0003;sun.shadow.radius=3;scene.add(sun,sun.target);
const fill=new THREE.DirectionalLight('#ffffff',1.1);fill.position.set(12,8,18);scene.add(fill);
const model=new THREE.Group();scene.add(model);const roof=new THREE.Group();model.add(roof);
const wallGroups=Object.fromEntries(['north','corridor','west','east','glass','warehouse','fitting'].map(id=>{const g=new THREE.Group();g.userData.wall=id;model.add(g);return [id,g]}));
const wallNames={north:'北侧窗墙',corridor:'走廊侧墙',west:'西侧墙',east:'东侧墙',glass:'315/303磨砂玻璃隔断',warehouse:'仓库隔墙',fitting:'试衣间隔墙'};
const doorControllers=[],wallColliders=[];let sensorDemoStart=0;
const frontWalls=[],roomLabels=[],dimLabels=[],hitTargets=[],allBatches=[];let selected=null,currentView='overview',transition=null,isIndoor=false,lastTime=0;
const keys=new Set(),metrics={chairs:0,hanging:0,folded:0,fixtures:0};
let seed=27;function rnd(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;}
function texture(kind){const cv=document.createElement('canvas');cv.width=cv.height=512;const ct=cv.getContext('2d');
 if(kind==='wood'){ct.fillStyle='#c4a779';ct.fillRect(0,0,512,512);for(let i=0;i<2100;i++){const x=rnd()*512;ct.strokeStyle=`rgba(${rnd()>.5?'90,59,27':'242,227,190'},${.03+rnd()*.12})`;ct.lineWidth=.25+rnd()*1.4;ct.beginPath();ct.moveTo(x,0);for(let y=0;y<=512;y+=16)ct.lineTo(x+Math.sin(y*.012+x)*2+rnd()*2,y);ct.stroke();}}
 else if(kind==='fabric'){ct.fillStyle='#d8d5ce';ct.fillRect(0,0,512,512);for(let i=0;i<512;i+=3){ct.strokeStyle=i%2?'#c0beb535':'#ffffff70';ct.lineWidth=1;ct.beginPath();ct.moveTo(i,0);ct.lineTo(i,512);ct.moveTo(0,i);ct.lineTo(512,i);ct.stroke();}}
 else{ct.fillStyle='#d8d9d5';ct.fillRect(0,0,512,512);for(let i=0;i<18000;i++){const r=rnd();ct.fillStyle=r>.5?'#b6bcb722':'#ffffff60';ct.fillRect(rnd()*512,rnd()*512,.6+rnd()*2,.6+rnd()*2);}ct.strokeStyle='#a7afab50';ct.lineWidth=1.3;ct.strokeRect(1,1,510,510);}
 const tx=new THREE.CanvasTexture(cv);tx.colorSpace=THREE.SRGBColorSpace;tx.wrapS=tx.wrapT=THREE.RepeatWrapping;tx.anisotropy=renderer.capabilities.getMaxAnisotropy();return tx;}
const woodTex=texture('wood'),fabricTex=texture('fabric'),floorTex=texture('tile');floorTex.repeat.set(1,1);woodTex.repeat.set(1,3);fabricTex.repeat.set(5,5);
const mat={wall:new THREE.MeshStandardMaterial({color:'#f3f2ee',roughness:.88}),trim:new THREE.MeshStandardMaterial({color:'#d4d7d2',roughness:.65}),white:new THREE.MeshStandardMaterial({color:'#eeeeea',roughness:.65}),wood:new THREE.MeshStandardMaterial({map:woodTex,color:'#e0cda6',roughness:.42}),woodDark:new THREE.MeshStandardMaterial({color:'#8b7555',roughness:.5}),metal:new THREE.MeshStandardMaterial({color:'#c2c9c9',metalness:.82,roughness:.26}),dark:new THREE.MeshStandardMaterial({color:'#313f41',metalness:.5,roughness:.4}),black:new THREE.MeshStandardMaterial({color:'#252f31',roughness:.6}),fabric:new THREE.MeshStandardMaterial({map:fabricTex,color:'#425b59',roughness:.95}),carpet:new THREE.MeshStandardMaterial({map:fabricTex,color:'#929b9b',roughness:1}),floor:new THREE.MeshStandardMaterial({map:floorTex,color:'#e2e4df',roughness:.63}),glass:new THREE.MeshStandardMaterial({color:'#cbe0df',transparent:true,opacity:.16,metalness:.1,roughness:.08,depthWrite:false}),light:new THREE.MeshStandardMaterial({color:'#fffdf1',emissive:'#fff2dd',emissiveIntensity:2.2}),mirror:new THREE.MeshStandardMaterial({color:'#a9c1c5',metalness:.75,roughness:.16,emissive:'#9fb6ba',emissiveIntensity:.10}),box:new THREE.MeshStandardMaterial({color:'#b69b76',roughness:1})};
const boxGeo=new THREE.BoxGeometry(1,1,1);
mat.frosted=new THREE.MeshPhysicalMaterial({color:'#d2dedb',roughness:.68,metalness:.04,clearcoat:.35,clearcoatRoughness:.6,transmission:0,opacity:1});
function box(w,h,d,x,y,z,material=mat.wall,parent=model,shadow=true){const o=new THREE.Mesh(boxGeo,material);o.scale.set(w,h,d);o.position.set(x,y,z);o.castShadow=shadow;o.receiveShadow=true;parent.add(o);return o;}
const cylGeos=new Map();
function cylinder(radius,height,x,y,z,material=mat.metal,parent=model,segments=10){const k=`${radius}:${height}:${segments}`;if(!cylGeos.has(k))cylGeos.set(k,new THREE.CylinderGeometry(radius,radius,height,segments));const m=new THREE.Mesh(cylGeos.get(k),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function rod(a,b,r=.012,material=mat.metal,parent=model){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),m=cylinder(r,av.distanceTo(bv),0,0,0,material,parent);m.position.copy(av).add(bv).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),bv.sub(av).normalize());return m;}
function roundGeo(w,h,d,r=.04){const sh=new THREE.Shape();sh.moveTo(-w/2+r,-h/2);sh.lineTo(w/2-r,-h/2);sh.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);sh.lineTo(w/2,h/2-r);sh.quadraticCurveTo(w/2,h/2,w/2-r,h/2);sh.lineTo(-w/2+r,h/2);sh.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);sh.lineTo(-w/2,-h/2+r);sh.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);const g=new THREE.ExtrudeGeometry(sh,{depth:d,bevelEnabled:true,bevelSize:.008,bevelThickness:.008,bevelSegments:1,steps:1,curveSegments:4});g.translate(0,0,-d/2);return g;}
function rounded(w,h,d,x,y,z,material,parent=model,r=.04){const m=new THREE.Mesh(roundGeo(w,h,d,r),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function floorShape(points,material,y=.002,parent=model){const s=new THREE.Shape();points.forEach(([x,z],i)=>i?s.lineTo(x,-z):s.moveTo(x,-z));s.closePath();const g=new THREE.ShapeGeometry(s);const u=g.attributes.uv;for(let i=0;i<u.count;i++){u.setXY(i,u.getX(i)/.9,u.getY(i)/.9);}const m=new THREE.Mesh(g,material);m.rotation.x=-Math.PI/2;m.position.y=y;m.receiveShadow=true;parent.add(m);return m;}
const baseShape=new THREE.Shape();data.polygons.merged.forEach(([x,z],i)=>i?baseShape.lineTo(x,-z):baseShape.moveTo(x,-z));baseShape.closePath();const slab=new THREE.Mesh(new THREE.ExtrudeGeometry(baseShape,{depth:.18,bevelEnabled:false}),mat.white);slab.rotation.x=-Math.PI/2;slab.position.y=-.18;slab.receiveShadow=true;model.add(slab);
floorShape(data.polygons.merged,mat.floor);floorShape(data.polygons.meeting,mat.carpet,.005);
box(R,.14,1.9,R/2,-.08,D+.95,mat.floor);box(R,.03,.07,R/2,.01,D+1.8,mat.trim);
const ground=box(200,.12,200,12,-.27,4,new THREE.MeshStandardMaterial({color:'#e9eef0',roughness:1}),scene,false);
function softShadow(w,d,x,z,opacity=.2,parent=model){const cv=document.createElement('canvas');cv.width=cv.height=64;const cx=cv.getContext('2d'),g=cx.createRadialGradient(32,32,4,32,32,32);g.addColorStop(0,'rgba(25,35,33,.8)');g.addColorStop(1,'rgba(25,35,33,0)');cx.fillStyle=g;cx.fillRect(0,0,64,64);const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv),transparent:true,opacity,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(x,.018,z);parent.add(m);}
// The exact source footprint retains the notches around existing columns.
const windowRanges=data.windows.map(w=>[w.start,w.end]);
const entrances=data.doors.filter(d=>d.axis==='x').map(d=>[d.start,d.end]);
function wallSegment(a,b,cut=false){const [x,z]=a,[xx,zz]=b;if(Math.hypot(xx-x,zz-z)<.001)return;const horizontal=Math.abs(z-zz)<.001;const len=Math.hypot(xx-x,zz-z);const group=new THREE.Group();model.add(group);
 const midpoint=[(x+xx)/2,(z+zz)/2];
 const key=midpoint[1]<.5?'north':midpoint[1]>8.3?'corridor':midpoint[0]<.4?'west':'east';wallGroups[key].add(group);
 function piece(start,end,bottom,top){if(end-start<.001)return;return horizontal?box(end-start,top-bottom,.13,(start+end)/2,(top+bottom)/2,z,mat.wall,group):box(.13,top-bottom,end-start,x,(top+bottom)/2,(start+end)/2,mat.wall,group);}
 const lo=horizontal?Math.min(x,xx):Math.min(z,zz),hi=horizontal?Math.max(x,xx):Math.max(z,zz);
 const openings=[];if(horizontal&&z<.03){for(const [wa,wb]of windowRanges){if(wb>lo&&wa<hi)openings.push([Math.max(wa,lo),Math.min(wb,hi),.85,2.85,'window']);}}
 if(horizontal&&Math.abs(z-D)<.001)for(const[a,b]of entrances){if(b>lo&&a<hi)openings.push([Math.max(a,lo),Math.min(b,hi),0,2.4,'door']);}
 let pos=lo;for(const [a,b,bot,top,type]of openings.sort((a,b)=>a[0]-b[0])){piece(pos,a,0,HEIGHT);piece(a,b,0,bot);piece(a,b,top,HEIGHT);
 if(type==='window'){
  box(b-a,top-bot,.018,(a+b)/2,(top+bot)/2,z,mat.glass,group,false);
  for(const yy of [bot,top])box(b-a+.06,.045,.085,(a+b)/2,yy,z,mat.dark,group);
  const count=Math.ceil((b-a)/1.3);for(let i=0;i<=count;i++)box(.04,top-bot,.07,a+(b-a)*i/count,(top+bot)/2,z,mat.dark,group);
  box(b-a+.08,.055,.25,(a+b)/2,bot-.01,z+.05,mat.white,group);
 }else{for(const t of [a,b])box(.045,2.4,.17,t,1.2,z,mat.dark,group);box(b-a,.055,.17,(a+b)/2,2.4,z,mat.dark,group);}
 pos=b;}piece(pos,hi,0,HEIGHT);
 let collisionStart=lo;for(const[a,b,bot,top,type]of openings){if(type!=='door')continue;wallColliders.push({axis:horizontal?'x':'z',fixed:horizontal?z:x,a:collisionStart,b:a});collisionStart=b;}wallColliders.push({axis:horizontal?'x':'z',fixed:horizontal?z:x,a:collisionStart,b:hi});
 if(horizontal&&!openings.some(o=>o[4]==='door'))box(len,.085,.025,midpoint[0],.043,z+((z>D/2)?-.08:.08),mat.trim,group);else if(!horizontal)box(.025,.085,len,x+((x>R/2)?-.08:.08),.043,midpoint[1],mat.trim,group);
 if(cut)frontWalls.push(group);return group;}
const outline=data.polygons.merged;
for(let i=0;i<outline.length;i++){const a=outline[i],b=outline[(i+1)%outline.length];const cut=(a[1]>8.3&&b[1]>8.3)||(a[0]===0&&b[0]===0)||(a[0]>=R-.02&&b[0]>=R-.02&&a[1]>2.97&&b[1]>2.97);wallSegment(a,b,cut);}
// New partitions follow the drawing; no glass partition is substituted.
const md=(D-1.8)/2;
for(const v of data.partitions){
 const g=wallGroups[v.id==='Q01'?'glass':v.id==='Q02'?'warehouse':'fitting'],axis=v.d>v.w?'z':'x',fixed=axis==='z'?v.x+v.w/2:v.z+v.d/2,lo=axis==='z'?v.z:v.x,hi=lo+(axis==='z'?v.d:v.w),material=v.id==='Q01'?mat.frosted:mat.wall;
 const openings=data.doors.filter(d=>v.openings.includes(d.id)).sort((a,b)=>a.start-b.start);
 const part=(a,b,bottom,top)=>{if(b<=a)return;axis==='z'?box(v.w,top-bottom,b-a,fixed,(bottom+top)/2,(a+b)/2,material,g):box(b-a,top-bottom,v.d,(a+b)/2,(bottom+top)/2,fixed,material,g);};
 let pos=lo;for(const d of openings){part(pos,d.start,0,HEIGHT);part(d.start,d.end,2.4,HEIGHT);wallColliders.push({axis,fixed,a:pos,b:d.start});pos=d.end;}part(pos,hi,0,HEIGHT);wallColliders.push({axis,fixed,a:pos,b:hi});
 if(v.id==='Q01'){
  for(const z of [0,1.25,2.5,md,md+1.8,6.8,8.05,D])box(.115,HEIGHT,.025,fixed,HEIGHT/2,z,mat.metal,g);
  for(const y of [.025,HEIGHT-.025])box(.12,.05,D,fixed,y,D/2,mat.metal,g);
  box(.12,.04,1.8,fixed,2.42,md+.9,mat.metal,g);
 }
}
function createDoor(d){
 const group=new THREE.Group();group.userData.door=d.id;model.add(group);
 const c={...d,group,panels:[],progress:0,target:0,automatic:d.type==='automatic'};doorControllers.push(c);
 if(d.type==='automatic'){
  const middle=(d.start+d.end)/2;
  for(const side of [-1,1]){const leaf=new THREE.Group();leaf.position.set(middle+side*.75,0,d.fixed-.13);group.add(leaf);box(1.48,2.36,.024,0,1.2,0,mat.glass,leaf,false);for(const x of [-.74,.74])box(.025,2.38,.055,x,1.2,0,mat.metal,leaf);for(const y of [.025,2.38])box(1.5,.04,.055,0,y,0,mat.metal,leaf);box(1.48,.035,.03,0,1.05,0,mat.white,leaf,false);c.panels.push({object:leaf,side,baseX:leaf.position.x});}
  box(6,.16,.18,middle,2.50,d.fixed,mat.metal,group);box(.13,.06,.10,middle,2.42,d.fixed+.14,mat.black,group);box(.035,.012,.01,middle,2.42,d.fixed+.197,mat.light,group);
 }else{
  const double=d.id==='M01'||d.id==='M02',width=d.width/(double?2:1),material=d.id==='M02'?mat.frosted:mat.wood;
  const base=d.axis==='x'?0:-Math.PI/2;
  for(let i=0;i<(double?2:1);i++){
   const sign=i===0?1:-1,hinge=i===0?d.start:d.end,g=new THREE.Group();g.position.set(d.axis==='x'?hinge:d.fixed+.05,0,d.axis==='x'?d.fixed:hinge);g.rotation.y=base;group.add(g);
   box(width-.025,2.36,.045,sign*width/2,1.20,0,material,g);for(const x of [sign*.02,sign*(width-.02)])box(.025,2.38,.06,x,1.20,0,mat.metal,g);for(const y of [.025,2.38])box(width,.025,.06,sign*width/2,y,0,mat.metal,g);
   for(const side of [-1,1])rod([sign*(width-.13),1.04,side*.065],[sign*(width-.25),1.04,side*.065],.012,mat.metal,g);
   const angle=(d.id==='M05'||d.id==='M06'?-1:1)*sign*Math.PI/2;c.panels.push({object:g,baseAngle:base,angle});
  }
 }
 return c;
}
data.doors.forEach(createDoor);
const visitor=new THREE.Group();model.add(visitor);visitor.visible=false;
const visitorMat=new THREE.MeshStandardMaterial({color:'#456b70',roughness:.85});
const head=new THREE.Mesh(new THREE.SphereGeometry(.11,14,10),mat.wood);head.position.y=1.58;visitor.add(head);box(.34,.53,.20,0,1.16,0,visitorMat,visitor);for(const s of [-1,1]){cylinder(.045,.63,s*.10,.57,0,mat.dark,visitor);cylinder(.035,.51,s*.22,1.1,0,visitorMat,visitor);}
function updateDoors(dt,time){
 const automatic=doorControllers.find(d=>d.type==='automatic'),mid=(automatic.start+automatic.end)/2;
 let demoNear=false;
 if(sensorDemoStart){const elapsed=(time-sensorDemoStart)/1000;visitor.visible=elapsed<10;const z=elapsed<4?D+1.6-Math.max(0,elapsed-1)*.8:elapsed<6?D-.8:D-.8+(elapsed-6)*.6;visitor.position.set(mid,0,z);demoNear=visitor.visible&&Math.abs(z-D)<1.7;if(elapsed>=10)sensorDemoStart=0;}
 if(automatic.automatic){const near=isIndoor&&Math.abs(camera.position.x-mid)<1.8&&Math.abs(camera.position.z-D)<1.7;automatic.target=near||demoNear?1:0;}
 for(const d of doorControllers){d.progress=THREE.MathUtils.clamp(d.progress+Math.sign(d.target-d.progress)*dt/(d.type==='automatic'?1.2:.8),Math.min(d.progress,d.target),Math.max(d.progress,d.target));const t=d.progress*d.progress*(3-2*d.progress);for(const p of d.panels){if(d.type==='automatic')p.object.position.x=p.baseX+p.side*1.5*t;else p.object.rotation.y=p.baseAngle+p.angle*t;}}
}
// Fitting cubicles: depth 1.5m across X, width 1.2m along Z.
for(const z of [FZ,FZ+1.3]){
 box(.035,1.9,.68,R-.065,1.4,z+.7,mat.dark);box(.045,1.8,.59,R-.09,1.4,z+.7,mat.mirror);
 rounded(.65,.1,.34,R-.8,.43,z+1.1,mat.fabric);for(const x of [R-1.03,R-.56])box(.035,.38,.035,x,.19,z+1.08,mat.woodDark);
 cylinder(.12,.025,R-.75,HEIGHT-.04,z+.7,mat.light,roof);}
// Meeting table, 20 upholstered task chairs, display and conferencing details.
const tx=MW/2,tz=D/2;rounded(1.5,.08,7.2,tx,.71,tz,mat.wood,model,.06);
for(const z of [tz-2.9,tz+2.9]){box(1.1,.68,.09,tx,.35,z,mat.dark);box(1.3,.05,.35,tx,.03,z,mat.dark);}
for(const z of [tz-1.75,tz+1.75]){rounded(.19,.012,.34,tx,.758,z,mat.dark,model,.02);for(let k=0;k<3;k++)box(.034,.004,.04,tx-.055+k*.055,.766,z,mat.black);}
const seatGeo=roundGeo(.48,.09,.47,.055),backGeo=roundGeo(.48,.46,.07,.07),armGeo=roundGeo(.05,.035,.31,.018);
function chair(x,z,rotation){const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rotation;model.add(g);
 const seat=new THREE.Mesh(seatGeo,mat.fabric);seat.position.set(0,.46,0);seat.castShadow=true;g.add(seat);
 const back=new THREE.Mesh(backGeo,mat.fabric);back.position.set(0,.75,-.21);back.rotation.x=-.10;back.castShadow=true;g.add(back);
 cylinder(.032,.28,0,.24,0,mat.metal,g);
 for(let i=0;i<5;i++){const t=i*Math.PI*2/5;rod([0,.16,0],[Math.cos(t)*.27,.1,Math.sin(t)*.27],.018,mat.metal,g);const wheel=cylinder(.037,.04,Math.cos(t)*.27,.047,Math.sin(t)*.27,mat.black,g);wheel.rotation.x=Math.PI/2;}
 for(const s of [-1,1]){rod([s*.235,.45,.10],[s*.27,.65,.1],.012,mat.dark,g);const arm=new THREE.Mesh(armGeo,mat.black);arm.position.set(s*.27,.65,-.02);g.add(arm);}
 softShadow(.8,.8,x,z,.22);metrics.chairs++;}
for(let i=0;i<10;i++){const z=(D-7.2)/2+.36+i*.72;chair(tx-1.12,z,Math.PI/2);chair(tx+1.12,z,-Math.PI/2);}
const projector=new THREE.Group();projector.position.set(tx,3,3);model.add(projector);box(.32,.13,.25,0,0,0,mat.white,projector);const lens=cylinder(.043,.06,.075,0,-.14,mat.black,projector,18);lens.rotation.x=Math.PI/2;rod([0,.065,0],[0,HEIGHT-3,0],.018,mat.metal,projector);box(.11,.025,.11,0,HEIGHT-3,0,mat.metal,projector);
const projectionCanvas=document.createElement('canvas');projectionCanvas.width=1024;projectionCanvas.height=576;const pc=projectionCanvas.getContext('2d');pc.fillStyle='#f4f1e9';pc.fillRect(0,0,1024,576);pc.fillStyle='#274f55';pc.font='42px sans-serif';pc.fillText('珠光  /  会议空间',75,125);pc.font='22px sans-serif';pc.fillStyle='#6b807b';pc.fillText('服装展示与空间设计',75,178);for(let i=0;i<4;i++){pc.fillStyle=['#8ca7a0','#b6bba5','#5b7c7f','#d4c6aa'][i];pc.fillRect(75+i*220,260,175,170-i*24);}pc.fillStyle='#526660';pc.font='18px sans-serif';pc.fillText('315 会议室     20 SEATS',75,520);const projectionTexture=new THREE.CanvasTexture(projectionCanvas);projectionTexture.colorSpace=THREE.SRGBColorSpace;
const projection=new THREE.Mesh(new THREE.PlaneGeometry(3,1.688),new THREE.MeshBasicMaterial({map:projectionTexture,transparent:true,opacity:.88}));projection.position.set(tx,.913+.844,.072);wallGroups.north.add(projection);
const projectorLight=new THREE.SpotLight('#fff8e9',12,5,.5,.65,1.3);projectorLight.position.set(tx,3,2.85);projectorLight.target.position.set(tx,1.757,.08);model.add(projectorLight,projectorLight.target);
function sign(text,x,y,z,w=.8,h=.22,rotation=0,parent=model,bg='#f3f2ed',color='#3f554f'){const cv=document.createElement('canvas');cv.width=512;cv.height=Math.round(512*h/w);const ct=cv.getContext('2d');ct.fillStyle=bg;ct.fillRect(0,0,cv.width,cv.height);ct.fillStyle=color;ct.font=`500 ${Math.floor(cv.height*.45)}px -apple-system, sans-serif`;ct.textAlign='center';ct.textBaseline='middle';ct.fillText(text,cv.width/2,cv.height/2);const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:t,side:THREE.DoubleSide}));m.position.set(x,y,z);m.rotation.y=rotation;parent.add(m);return m;}
sign('会议室',L+.07,2.64,md+.9,.7,.18,Math.PI/2,wallGroups.glass);
// Fabric assets are actual 3D silhouettes with a shallow, waved surface.
const colors=['#d7d2c3','#c4b59b','#647b78','#9aacae','#b98c80','#384b57','#e6dfd1','#a7a18d','#7c8a9b','#c5a897'];
function garmentGeometry(style){const s=new THREE.Shape();const pts=style===3?[[-.21,0],[.21,0],[.23,-1.02],[.055,-1.02],[0,-.40],[-.055,-1.02],[-.23,-1.02]]:style===4?[[-.20,0],[.20,0],[.28,-.75],[-.28,-.75]]:style===2?[[-.10,0],[-.24,-.05],[-.31,-.30],[-.23,-.33],[-.17,-.20],[-.31,-1.12],[.31,-1.12],[.17,-.20],[.23,-.33],[.31,-.30],[.24,-.05],[.10,0],[.07,-.06],[-.07,-.06]]:[[-.09,0],[-.23,-.04],[-.34,-.23],[-.25,-.29],[-.19,-.18],[-.20,-.64],[.20,-.64],[.19,-.18],[.25,-.29],[.34,-.23],[.23,-.04],[.09,0],[.065,-.06],[-.065,-.06]];
 pts.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();const base=new THREE.ExtrudeGeometry(s,{depth:.018,bevelEnabled:true,bevelSize:.008,bevelThickness:.004,bevelSegments:1,steps:1});const g=new TessellateModifier(.065,6).modify(base);base.dispose();g.translate(0,0,-.009);const pos=g.attributes.position;for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i);pos.setZ(i,pos.getZ(i)+(.008*Math.sin(x*54+y*9)+.004*Math.sin(x*23-y*14))*(y<-.16?1:.2));}g.computeVertexNormals();return g;}
const garmentGeos=[0,1,2,3,4].map(garmentGeometry);const clothMats=colors.map(c=>new THREE.MeshStandardMaterial({color:c,map:fabricTex,roughness:.93}));
const dummy=new THREE.Object3D();const batches=new Map();
function instance(key,geo,material,x,y,z,ry=0,sx=1,sy=1,sz=1){if(!batches.has(key))batches.set(key,{geo,material,items:[]});batches.get(key).items.push([x,y,z,ry,sx,sy,sz]);}
const hangerPoints=[];
function hanger(x,y,z){const p=[[0,0,0],[0,.055,0],[0,.055,.025],[0,.02,.028],[0,-.02,0],[0,-.16,-.22],[0,-.16,.22],[0,-.02,0]];for(let i=0;i<p.length-1;i++)hangerPoints.push(x+p[i][0],y+p[i][1],z+p[i][2],x+p[i+1][0],y+p[i+1][1],z+p[i+1][2]);}
const foldedGeo=roundGeo(.335,.024,.39,.022);
for(const f of data.fixtures){const g=new THREE.Group();model.add(g);g.name=f.id;g.userData.fixture=f;const cx=f.x+1,cz=f.y+f.h/2;
 softShadow(2.5,f.h+1,cx,cz,.3);metrics.fixtures++;
 if(f.kind==='H'){
  for(const side of [-1,1]){const z=cz+side*.29;
   for(const x of [f.x+.055,f.x+1.945]){cylinder(.018,f.model_height-.05,x,(f.model_height-.05)/2+.025,z,mat.metal,g);box(.12,.025,.43,x,.035,z,mat.metal,g);}
   rod([f.x+.04,f.rail_height,z],[f.x+1.96,f.rail_height,z],.017,mat.metal,g);rod([f.x+.055,.16,z],[f.x+1.945,.16,z],.011,mat.metal,g);
   for(let j=0;j<50;j++){const x=f.x+.04+j*.0392;const col=(Math.floor(j/10)+Number(f.id.slice(1))*2+(side>0?2:0))%colors.length;const style=f.clothing==='连衣裙'?2:f.clothing==='长裤'?3:f.clothing==='半身裙'?4:0;instance('g'+style+'c'+col,garmentGeos[style],clothMats[col],x,f.rail_height-.15,z,Math.PI/2,.82,1,1);hanger(x,f.rail_height,z);metrics.hanging++;}
  }
  rod([f.x+.055,.16,cz-.29],[f.x+.055,.16,cz+.29],.014,mat.metal,g);rod([f.x+1.945,.16,cz-.29],[f.x+1.945,.16,cz+.29],.014,mat.metal,g);
  sign(f.id+' '+f.clothing+' / 100件',cx,.4,f.y+f.h/2+.51,.9,.16,0,g);
 }else{
  for(const x of [f.x+.025,f.x+1.975]){for(const z of [f.y+.025,f.y+.975])box(.035,1.8,.035,x,.9,z,mat.dark,g);}
  box(1.94,1.62,.035,cx,.9,cz,mat.wood,g);
  for(let level=0;level<5;level++){
   const y=.13+level*.335;box(2,.035,1,cx,y,cz,mat.wood,g);
   for(const side of [-1,1])for(let pile=0;pile<5;pile++)for(let k=0;k<6;k++){
    const col=(Number(f.id.slice(1))*2+pile+level+(side>0?1:0))%colors.length;
    const x=f.x+.2+pile*.4+(rnd()-.5)*.015,z=cz+side*.255+(rnd()-.5)*.01;
    instance('fold'+col,foldedGeo,clothMats[col],x,y+.035+k*.03,z,(rnd()-.5)*.035);metrics.folded++;
   }
  }
  box(2,.045,1,cx,1.78,cz,mat.wood,g);sign(f.id+' '+f.clothing+' / 300件',cx,1.72,f.y+1.023,.9,.14,0,g);
 }
 const pick=new THREE.Mesh(new THREE.BoxGeometry(2,f.kind==='H'?1.8:1.86,f.h),new THREE.MeshBasicMaterial({visible:false}));pick.position.set(cx,.93,cz);pick.userData.fixture=f;model.add(pick);hitTargets.push(pick);
}
for(const {geo,material,items}of batches.values()){const m=new THREE.InstancedMesh(geo,material,items.length);for(let i=0;i<items.length;i++){const[x,y,z,ry,sx,sy,sz]=items[i];dummy.position.set(x,y,z);dummy.rotation.set(0,ry,0);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);}m.castShadow=true;m.receiveShadow=true;model.add(m);allBatches.push(m);}
const hangGeo=new THREE.BufferGeometry();hangGeo.setAttribute('position',new THREE.Float32BufferAttribute(hangerPoints,3));model.add(new THREE.LineSegments(hangGeo,new THREE.LineBasicMaterial({color:'#9ca9a9'})));
// Two warehouse shelves with folded goods and cartons, not included in 2000 display pieces.
for(const z of [.55,NECK-.4]){const wx=(R+.1+MAX)/2;for(const x of [R+.45,MAX-.35])for(const zz of [z-.23,z+.23])box(.025,2.05,.025,x,1.025,zz,mat.dark);
 for(let lev=0;lev<4;lev++){const y=.18+lev*.49;box(MAX-R-.7,.035,.5,wx,y,z,mat.white);for(let k=0;k<4;k++){const x=R+.72+k*.56;box(.45,.34,.36,x,y+.19,z,mat.box);box(.455,.008,.035,x,y+.365,z,mat.woodDark);sign('STOCK',x,y+.21,z+.182,.21,.075);}}}
sign('仓库',R-.065,2.56,1.5,.54,.18,-Math.PI/2);
// Lighting: ceiling fittings are visible from inside; open-roof overview remains readable.
const ceilingMat=new THREE.MeshStandardMaterial({color:'#f3f4ef',side:THREE.DoubleSide,roughness:.9});floorShape(data.polygons.merged,ceilingMat,HEIGHT,roof).castShadow=true;
for(const z of [1.7,5.0,7.5]){box(14.8,.035,.07,L+8,HEIGHT-.10,z,mat.dark,roof);for(const x of [L+1.8,L+5,L+8.2,L+11.4,L+14.3]){const lamp=cylinder(.055,.18,x,HEIGHT-.22,z,mat.dark,roof,12);lamp.rotation.z=.15;const lens=cylinder(.044,.01,x+.015,HEIGHT-.32,z,mat.light,roof,12);const light=new THREE.PointLight('#fff4e5',1.8,5,2);light.position.set(x,HEIGHT-.45,z);roof.add(light);}}
for(const z of [2.1,4.6,7.1]){box(.08,.06,1.1,tx,HEIGHT-.29,z,mat.dark,roof);box(.065,.012,1.07,tx,HEIGHT-.33,z,mat.light,roof);for(const x of [tx-.02,tx+.02])rod([x,HEIGHT,z-.46],[x,HEIGHT-.24,z-.46],.004,mat.dark,roof);}
const indoorFill=new THREE.AmbientLight('#fff7ef',.5);roof.add(indoorFill);
for(const [id,x,z,r]of data.antennas){cylinder(.10,.035,x,HEIGHT-.03,z,mat.white,roof,18);}
const coverageGroup=new THREE.Group();model.add(coverageGroup);coverageGroup.visible=false;
for(const [id,x,z,r]of data.antennas){const g=new THREE.CircleGeometry(r,100);const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:id==='A1'||id==='A2'?'#3f9cc0':'#72ac77',transparent:true,opacity:.13,depthWrite:false,side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;m.position.set(x,.055,z);coverageGroup.add(m);const pts=[];for(let i=0;i<=120;i++){const t=i/120*Math.PI*2;pts.push(new THREE.Vector3(x+Math.cos(t)*r,.065,z+Math.sin(t)*r));}const ring=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineDashedMaterial({color:'#478e9e',dashSize:.13,gapSize:.08,transparent:true,opacity:.85}));ring.computeLineDistances();coverageGroup.add(ring);rod([x-.12,.06,z],[x+.12,.06,z],.01,mat.dark,coverageGroup);rod([x,.06,z-.12],[x,.06,z+.12],.01,mat.dark,coverageGroup);}
const dimsGroup=new THREE.Group();dimsGroup.visible=false;model.add(dimsGroup);
function label(text,x,y,z,kind='room'){const el=document.createElement('div');el.className=kind==='dim'?'dim-label':'room-label';el.innerHTML=text;$('#labels').appendChild(el);const l={el,pos:new THREE.Vector3(x,y,z)};(kind==='dim'?dimLabels:roomLabels).push(l);return l;}
label('会议室 <small>20座</small>',MW/2,.14,D+.5);label('服装展示厅 <small>138.7 m²</small>',L+8,.14,D+1.0);label('仓库 <small>9.7 m²</small>',R+1.8,.14,-.5);label('试衣间 <small>F1 / F2</small>',R+.8,.14,7.6);
function dimension(a,b,text,pos){const points=[new THREE.Vector3(...a),new THREE.Vector3(...b)];dimsGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:'#3b817a'})));for(const p of [a,b])rod([p[0]-.08,p[1],p[2]-.11],[p[0]+.08,p[1],p[2]+.11],.012,new THREE.MeshBasicMaterial({color:'#3b817a'}),dimsGroup);label(text,...pos,'dim');}
dimension([L,.05,-.65],[R,.05,-.65],'展示厅净宽 16.00m',[L+8,.09,-.72]);dimension([0,.05,-.65],[MW,.05,-.65],'会议室净宽 ≈5.03m',[MW/2,.09,-.72]);dimension([-.65,.05,0],[-.65,.05,D],'进深 ≈9.19m',[-.8,.1,D/2]);dimension([L+8,.08,4.3],[L+8,.08,6],'主通道 ≈1.70m',[L+8,.1,5.15]);
const selectionOutline=new THREE.Box3Helper(new THREE.Box3(),new THREE.Color('#286e62'));selectionOutline.visible=false;scene.add(selectionOutline);
const originalInfo=$('#info').innerHTML;
const views={
 overview:{pos:[29,23,31],target:[11.8,0,4.8],title:'从平面, 走进空间.',kicker:'空间总览',desc:'按确认方案的实际比例建模'},
 top:{pos:[12.2,33,4.6],target:[12.2,0,4.59],title:'每一处, 都有尺度.',kicker:'俯视布局',desc:'查看通道、隔断与陈列位置'},
 meeting:{pos:[4.15,1.62,8.2],target:[1.85,1.22,1.1],title:'20人, 一桌共议.',kicker:'会议室 / 约45.9 m²',desc:'7.2m会议桌, 两侧各10座',indoor:true},
 showroom:{pos:[14.8,1.65,8.7],target:[10.8,1.30,2.8],title:'走进服装展示厅.',kicker:'服装展示厅 / 约138.7 m²',desc:'八组挂装, 四组叠装, 2000件方案陈列',indoor:true},
 aisle:{pos:[10.9,1.62,5.25],target:[12.6,1.19,3.7],title:'看见面料与层次.',kicker:'陈列近景',desc:'点击货架, 查看每个位置的陈列数量',indoor:true},
 warehouse:{pos:[R+1.15,1.63,1.5],target:[MAX-.25,1.3,1.5],title:'有序收纳.',kicker:'仓库 / 约9.7 m²',desc:'双排仓储货架, 与展厅独立分区',indoor:true},
 fitting:{pos:[R-1.30,1.58,FZ+.63],target:[R-.10,1.1,FZ+.75],title:'私密的试衣空间.',kicker:'试衣间 / 各1.8 m²',desc:'两间独立试衣间, 配镜面、坐凳与平开门',indoor:true},
 entrance:{pos:[12.989,1.65,D+1.5],target:[12.989,1.65,5.3],title:'感应开启, 双向通行.',kicker:'301 / 303 共用入口',desc:'3m净开口, 两扇玻璃向两侧横移',indoor:true}
};
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),4000);}
function syncVisibility(){roof.visible=$('#toggle-roof').checked;for(const input of document.querySelectorAll('[data-wall]'))wallGroups[input.dataset.wall].visible=input.checked;for(const d of doorControllers){const key=d.id==='M01'||d.id==='M03'?'corridor':d.id==='M02'?'glass':d.id==='M04'?'warehouse':'fitting';d.group.visible=wallGroups[key].visible;}}
function setView(name,immediate=false){const v=views[name];if(!v)return;currentView=name;isIndoor=!!v.indoor;$('#view-kicker').textContent=v.kicker;$('#view-title').textContent=v.title;$('#view-desc').textContent=v.desc;viewport.classList.toggle('indoor',isIndoor);$('#toggle-roof').checked=isIndoor;for(const input of document.querySelectorAll('[data-wall]'))input.checked=isIndoor||!['corridor','west'].includes(input.dataset.wall);syncVisibility();
 controls.enabled=!isIndoor;controls.maxPolarAngle=name==='top'?Math.PI*.499:Math.PI*.49;camera.fov=isIndoor?64:42;camera.updateProjectionMatrix();
 const vp=new THREE.Vector3(...v.pos),vt=new THREE.Vector3(...v.target);if(!isIndoor)vp.sub(vt).multiplyScalar(Math.max(1,1.3/camera.aspect)).add(vt);
 if(immediate||matchMedia('(prefers-reduced-motion: reduce)').matches){camera.position.copy(vp);controls.target.copy(vt);camera.lookAt(vt);transition=null;}else transition={from:camera.position.clone(),targetFrom:controls.target.clone(),to:vp,targetTo:vt,start:performance.now()};
 document.querySelectorAll('#view-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
 $('#interaction-hint').innerHTML=touchDevice?(isIndoor?'<span>单指环顾</span><span>双指缩放</span><span>箭头移动</span>':'<span>单指旋转</span><span>双指缩放 / 平移</span>'):(isIndoor?'<span>拖动环顾</span><span>WASD / 方向键移动</span>':'<span>拖动旋转</span><span>滚轮缩放</span><span>右键平移</span>');
 $('#selection-hint').hidden=!isIndoor||name==='meeting';viewport.dataset.view=name;clearSelection();}
function selectFixture(f,pick){if(mobileLayout.matches)showSettings(true);selected=f;viewport.dataset.selected=f.id;selectionOutline.box.setFromObject(pick);selectionOutline.visible=true;$('#clear-selection').hidden=false;const hang=f.kind==='H';$('#info').innerHTML=`<span class="detail-chip">${hang?'双面挂装':'双面叠装'}</span><h2 class="selected-name">${f.id} / ${f.clothing}</h2><p class="intro">${hang?'金属双杆挂架, 衣物按色系分组.':'木质层板与金属框架, 双面开放陈列.'}</p><div class="selected-specs"><div><span>方案数量</span><b>${f.qty} 件</b></div><div><span>平面尺寸</span><b>2.00 × ${hang?'1.10':'1.00'}m</b></div><div><span>陈列方式</span><b>${hang?'每面50件':'双面各5层'}</b></div><div><span>容量依据</span><b>${hang?'挂装中心距40mm':'5叠 × 6件 / 层'}</b></div></div><p class="selected-note">${hang?'轻薄衣物按4cm间距排列, 两条挂杆共100件.':'每面5层, 每层5叠、每叠6件. 两面合计300件.'} 厚重衣物需要减少陈列数量.</p>`;}
function clearSelection(){selected=null;delete viewport.dataset.selected;selectionOutline.visible=false;$('#info').innerHTML=originalInfo;$('#clear-selection').hidden=true;}
function pickAt(event){const r=renderer.domElement.getBoundingClientRect();const pointer=new THREE.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);const ray=new THREE.Raycaster();ray.setFromCamera(pointer,camera);const hits=ray.intersectObjects([model],true);return hits.find(h=>{let o=h.object;while(o){if(!o.visible)return false;o=o.parent;}return true;});}
function pickedOwner(object){let o=object;while(o){if(o.userData.door||o.userData.wall||o.userData.fixture)return o;o=o.parent;}return null;}
function toggleDoor(id){const d=doorControllers.find(v=>v.id===id);d.automatic=false;d.target=d.target?0:1;renderDoorControls();toast((d.target?'正在打开':'正在关闭')+' '+d.name);}
function renderDoorControls(){document.querySelector('.door-options').innerHTML=doorControllers.map(d=>`<div class="door-row"><span>${d.id==='M01'?'会议室走廊双开门':d.id==='M02'?'会议室玻璃双开门':d.id==='M03'?'展厅感应移门':d.id==='M04'?'仓库单开门':d.id==='M05'?'试衣间 F1':'试衣间 F2'}</span><button data-door="${d.id}" aria-pressed="${!!d.target}">${d.target?'关闭':'打开'}</button></div>`).join('')+'<div class="door-actions"><button id="sensor-mode">'+(doorControllers.find(d=>d.id==='M03').automatic?'感应模式已开启':'恢复自动感应')+'</button><button id="sensor-demo">模拟来人</button></div><button data-view="entrance" class="entry-view">走到主入口</button>';}
renderDoorControls();
$('#door-controls').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.door)toggleDoor(b.dataset.door);if(b.id==='sensor-mode'){doorControllers.find(d=>d.id==='M03').automatic=true;renderDoorControls();toast('靠近入口时自动开启, 离开后关闭');}if(b.id==='sensor-demo'){doorControllers.find(d=>d.id==='M03').automatic=true;sensorDemoStart=performance.now();renderDoorControls();toast('正在演示来人感应开门');}};
let pointerStart=null,drag=null,yaw=0,pitch=0;
const touches=new Map();let pinchDistance=0;
renderer.domElement.addEventListener('pointerdown',e=>{if(!isIndoor||e.pointerType!=='touch')return;touches.set(e.pointerId,[e.clientX,e.clientY]);if(touches.size>1){const [a,b]=[...touches.values()];pinchDistance=Math.hypot(a[0]-b[0],a[1]-b[1]);pointerStart=null;drag=null;renderer.domElement.setPointerCapture(e.pointerId);e.stopImmediatePropagation();}},{capture:true});
renderer.domElement.addEventListener('pointermove',e=>{if(!touches.has(e.pointerId))return;touches.set(e.pointerId,[e.clientX,e.clientY]);if(touches.size>1){const [a,b]=[...touches.values()],distance=Math.hypot(a[0]-b[0],a[1]-b[1]);if(distance>0&&pinchDistance>0){camera.fov=THREE.MathUtils.clamp(camera.fov*pinchDistance/distance,40,80);camera.updateProjectionMatrix();}pinchDistance=distance;e.stopImmediatePropagation();}},{capture:true});
for(const type of ['pointerup','pointercancel'])renderer.domElement.addEventListener(type,e=>{if(touches.size>1||pinchDistance){pointerStart=null;drag=null;pinchDistance=0;}touches.delete(e.pointerId);},{capture:true});
renderer.domElement.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};if(isIndoor&&e.button===0){transition=null;const dir=new THREE.Vector3();camera.getWorldDirection(dir);yaw=Math.atan2(dir.x,dir.z);pitch=Math.asin(dir.y);drag={x:e.clientX,y:e.clientY,yaw,pitch};renderer.domElement.setPointerCapture(e.pointerId);}});
renderer.domElement.addEventListener('pointermove',e=>{if(drag&&isIndoor){yaw=drag.yaw-(e.clientX-drag.x)*.004;pitch=THREE.MathUtils.clamp(drag.pitch-(e.clientY-drag.y)*.003,-1.3,1.3);const dir=new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));controls.target.copy(camera.position).addScaledVector(dir,5);camera.lookAt(controls.target);}else if(!pointerStart){const hit=pickAt(e);renderer.domElement.style.cursor=hit?'pointer':isIndoor?'grab':'default';}});
renderer.domElement.addEventListener('pointerup',e=>{if(pointerStart&&Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)<5){const hit=pickAt(e),owner=hit&&pickedOwner(hit.object);if(owner?.userData.door)toggleDoor(owner.userData.door);else if(owner?.userData.wall){if(mobileLayout.matches)showSettings(true);const id=owner.userData.wall;clearSelection();$('#info').innerHTML=`<span class="detail-chip">选中墙面</span><h2>${wallNames[id]}</h2><p class="intro">${id==='glass'?'哑光磨砂玻璃, 不可看穿.':'室内净高 3.50m.'}</p><button class="primary" id="hide-selected-wall">隐藏这面墙</button>`;$('#hide-selected-wall').onclick=()=>{document.querySelector(`[data-wall="${id}"]`).checked=false;syncVisibility();clearSelection();};$('#clear-selection').hidden=false;}else if(owner?.userData.fixture)selectFixture(owner.userData.fixture,owner);else clearSelection();}pointerStart=null;drag=null;});renderer.domElement.addEventListener('pointercancel',()=>{drag=null;pointerStart=null});
function inside(x,z,points){let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
function walkable(x,z){if(!inside(x,z,data.polygons.merged)&&!(x>.2&&x<R-.2&&z>D&&z<D+1.65))return false;
 for(const w of wallColliders){const along=w.axis==='x'?x:z,cross=w.axis==='x'?z:x;if(along>w.a-.11&&along<w.b+.11&&Math.abs(cross-w.fixed)<.13)return false;}
 for(const d of doorControllers){const along=d.axis==='x'?x:z,cross=d.axis==='x'?z:x;if(along>d.start-.1&&along<d.end+.1&&Math.abs(cross-d.fixed)<.16&&d.progress<.88)return false;}
 if(Math.abs(x-(MW+.05))<.20&&!(z>md+.18&&z<md+1.62))return false;
 if(x<R+.22&&x>R-.13&&z<NECK&&!(z>1.2&&z<1.80))return false;
 if(x<MW&&x>tx-.95&&x<tx+.95&&z>(D-7.2)/2-.22&&z<(D+7.2)/2+.22)return false;
 for(const f of data.fixtures)if(x>f.x-.16&&x<f.x+f.w+.16&&z>f.y-.16&&z<f.y+f.h+.16)return false;
 if(x>R+.27&&(z<.94||z>NECK-.04-.85))return false;
 if(x>FX-.15){if(Math.abs(z-FZ)<.18||Math.abs(z-FZ-1.3)<.18)return false;if(Math.abs(x-FX)<.18&&!((z>FZ+.42&&z<FZ+.98)||(z>FZ+1.72&&z<FZ+2.28)))return false;}
 return true;}
window.addEventListener('keydown',e=>{if($('#help-dialog').open||['INPUT','TEXTAREA'].includes(e.target.tagName))return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'].includes(e.key)&&isIndoor){keys.add(e.key.toLowerCase());e.preventDefault();}});window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>keys.clear());
renderer.domElement.addEventListener('wheel',e=>{if(!isIndoor)return;e.preventDefault();camera.fov=THREE.MathUtils.clamp(camera.fov+e.deltaY*.025,40,80);camera.updateProjectionMatrix();},{passive:false});
document.addEventListener('click',e=>{const b=e.target.closest('button[data-view]');if(b)setView(b.dataset.view);});$('.brand').addEventListener('click',e=>{e.preventDefault();setView('overview')});$('#clear-selection').onclick=clearSelection;$('#reset').onclick=()=>setView(currentView);$('#toggle-roof').onchange=syncVisibility;document.querySelectorAll('[data-wall]').forEach(input=>input.onchange=syncVisibility);$('#toggle-labels').onchange=()=>{};$('#toggle-dims').onchange=e=>{dimsGroup.visible=e.target.checked;if(isIndoor&&e.target.checked)toast('尺寸在整体鸟瞰或俯视布局中查看更清晰')};$('#toggle-antennas').onchange=e=>{coverageGroup.visible=e.target.checked;if(e.target.checked)toast('主厅4个直径8m圆, 几何覆盖约96.2%. 小圆分别服务仓库与两间试衣间.')};
for(const [id,factor]of [['zoom-in',.82],['zoom-out',1.22]])$('#'+id).onclick=()=>{if(isIndoor){camera.fov=THREE.MathUtils.clamp(camera.fov*factor,35,85);camera.updateProjectionMatrix();}else{camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);}};
$('#help').onclick=()=>$('#help-dialog').showModal();document.querySelectorAll('#help-dialog .close').forEach(b=>b.onclick=()=>$('#help-dialog').close());
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await viewport.requestFullscreen();}catch{toast('当前浏览器不支持全屏, 可放大浏览器窗口查看')}};
$('#capture').onclick=()=>{renderer.render(scene,camera);renderer.domElement.toBlob(blob=>{if(!blob){toast('截图失败, 请重试');return;}const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`珠光3F-${currentView}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);toast('已保存当前3D视角截图');},'image/png');};
const vec=new THREE.Vector3();function updateLabels(){const bounds=host.getBoundingClientRect();for(const [list,visible]of [[roomLabels,$('#toggle-labels').checked&&!isIndoor],[dimLabels,$('#toggle-dims').checked]])for(const l of list){vec.copy(l.pos).project(camera);const show=visible&&vec.z<1&&vec.z>-1&&Math.abs(vec.x)<1&&Math.abs(vec.y)<1;l.el.style.display=show?'block':'none';if(show)l.el.style.transform=`translate(${(vec.x*.5+.5)*bounds.width}px,${(-vec.y*.5+.5)*bounds.height}px) translate(-50%,-50%)`;}}
function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;const aspect=w/h,scale=Math.max(1,1.3/aspect)/Math.max(1,1.3/camera.aspect);if(!isIndoor){camera.position.sub(controls.target).multiplyScalar(scale).add(controls.target);if(transition){transition.from.sub(transition.targetFrom).multiplyScalar(scale).add(transition.targetFrom);transition.to.sub(transition.targetTo).multiplyScalar(scale).add(transition.targetTo);}}renderer.setSize(w,h);camera.aspect=aspect;camera.updateProjectionMatrix();}new ResizeObserver(resize).observe(host);
function stepWalk(dx,dz){const dir=new THREE.Vector3();camera.getWorldDirection(dir);dir.y=0;dir.normalize();const right=new THREE.Vector3(-dir.z,0,dir.x),move=dir.multiplyScalar(dz).addScaledVector(right,dx);const p=camera.position;if(walkable(p.x+move.x,p.z)){p.x+=move.x;controls.target.x+=move.x;}if(walkable(p.x,p.z+move.z)){p.z+=move.z;controls.target.z+=move.z;}camera.lookAt(controls.target);}
for(const b of document.querySelectorAll('[data-step]'))b.onclick=()=>{if(isIndoor&&!transition){const d=b.dataset.step;stepWalk(d==='left'?-.35:d==='right'?.35:0,d==='forward'?.35:d==='back'?-.35:0);}};
let frames=0;function animate(time){requestAnimationFrame(animate);const dt=Math.min((time-lastTime)/1000,.05);lastTime=time;
 updateDoors(dt,time);
 if(transition){const t=Math.min((time-transition.start)/1050,1),ease=t*t*(3-2*t);camera.position.lerpVectors(transition.from,transition.to,ease);controls.target.lerpVectors(transition.targetFrom,transition.targetTo,ease);camera.lookAt(controls.target);if(t===1)transition=null;}
 else if(!isIndoor)controls.update();
 if(isIndoor&&keys.size&&!transition){const dir=new THREE.Vector3();camera.getWorldDirection(dir);dir.y=0;dir.normalize();const right=new THREE.Vector3(-dir.z,0,dir.x);const move=new THREE.Vector3();if(keys.has('w')||keys.has('arrowup'))move.add(dir);if(keys.has('s')||keys.has('arrowdown'))move.sub(dir);if(keys.has('a')||keys.has('arrowleft'))move.sub(right);if(keys.has('d')||keys.has('arrowright'))move.add(right);move.normalize().multiplyScalar(dt*1.7);const p=camera.position;if(walkable(p.x+move.x,p.z)) {p.x+=move.x;controls.target.x+=move.x;}if(walkable(p.x,p.z+move.z)){p.z+=move.z;controls.target.z+=move.z;}camera.lookAt(controls.target);}
 updateLabels();if(++frames%15===0){viewport.dataset.camera=camera.position.toArray().map(v=>v.toFixed(3)).join(',');for(const d of doorControllers){const b=document.querySelector(`[data-door="${d.id}"]`);b.dataset.progress=d.progress.toFixed(3);b.setAttribute('aria-pressed',String(!!d.target));b.textContent=d.target?'关闭':'打开';b.title=d.name+' / '+(d.progress===0?'已关闭':d.progress===1?'已开启':'开合中');}viewport.dataset.renderCalls=renderer.info.render.calls;}renderer.render(scene,camera);}
setView('overview',true);requestAnimationFrame(animate);$('#loading').style.display='none';
window.__spatialQA={metrics,dimensions:{meetingWidth:MW,showroomWidth:R-L,depth:D,height:HEIGHT},fixtures:data.fixtures,views:Object.keys(views),getState:()=>({view:currentView,indoor:isIndoor,roof:roof.visible,walls:Object.fromEntries(Object.entries(wallGroups).map(([k,g])=>[k,g.visible])),doors:doorControllers.map(d=>({id:d.id,type:d.type,progress:d.progress,target:d.target,automatic:d.automatic,panels:d.panels.map(p=>({position:p.object.position.toArray(),rotation:p.object.rotation.y}))})),selected:selected?.id,camera:camera.position.toArray(),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles})};
if(metrics.chairs!==20||metrics.hanging!==800||metrics.folded!==1200||metrics.fixtures!==12)throw Error('Model quantity mismatch');

viewport.dataset.modelCounts=JSON.stringify(metrics);viewport.dataset.modelDimensions=JSON.stringify({meetingWidth:MW,showroomWidth:R-L,depth:D,height:HEIGHT});
