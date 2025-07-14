// 放在文件顶部，与其它全局函数并列
function handleGoalZone() {
  // 计算过去了多少秒
  const elapsed = (millis() - startTime) / 1000;
  // 时间到且还没创建
  if (elapsed >= goalComingTime && !goalZone) {
    // 取最后一段河道的 y 坐标：
    const lastSeg = riverSegments[riverSegments.length - 1];
    goalZone = {
      x: width + 100,
      y: lastSeg.cy,               // 用 riverSegments 里的 cy
      r: 60,
      arrived: false,
      targetX: width * 0.8,        // 漂到屏幕 80% 处
      targetY: lastSeg.cy          // 同一个 y
    };
  }
  // 如果已经创建但还没到位，就缓动过去
  if (goalZone && !goalZone.arrived) {
    goalZone.x = lerp(goalZone.x, goalZone.targetX, 0.02);
    goalZone.y = lerp(goalZone.y, goalZone.targetY, 0.02);
    if (abs(goalZone.x - goalZone.targetX) < 1) {
      goalZone.arrived = true;
    }
  }
}



function saveLevelRecord(level) {
  const timeTaken  = ((millis() - startTime) / 1000).toFixed(2);
  const aliveCount = boids.length;
  const rec = {
    level,
    time:      parseFloat(timeTaken),
    alive:     aliveCount,
    collected: collectCount,
    retries:   retryCount    // 新增这一项
  };
  const tmp = JSON.parse(localStorage.getItem('tmpRecord') || '[]');
  tmp.push(rec);
  localStorage.setItem('tmpRecord', JSON.stringify(tmp));
  retryCount = 0;  // 重置，为下关准备
}


// 在文件最顶端，已有 let collectCount = 0; 这一行附近，新增：
let retryCount = 0;  // 本关重试次数
// ✅ challenge2.js - 第二关：逆流而上（含手绘路径、可收集道具、曲线河道、即时失败判定、持久河道、反弹边界修正 & 暂停菜单）
const PATH_INFLUENCE_RADIUS = 100;
const PATH_STRENGTH         = 0.3;


let boids            = [];
let attractMode      = false;
let obstacles        = [];
let explosions       = [];
let bubbles          = [];
let showResult       = false;
let hasStarted       = false;
let isPaused         = false;   // 暂停状态
let showPauseUI      = false;   // 暂停菜单显示

let scrollOffset     = 0;
let scrollSpeed      = 2;
let obstacleSpacing  = 400;
let totalBoids       = 100;
const navHeight      = 100;

let maxTime          = 45;
let startTime        = 0;
let resultText       = "";
let levelPassed      = false;

let goalZone         = null;
let goalComingTime   = 35;

// —— 曲线河道控制点 —— 
let riverSegments    = [];

// —— 手绘路径 & 道具状态 —— 
let drawPathMode     = false;
let isDrawingPath    = false;
let currentPath      = [];
let pathQueue        = [];
const PATH_WIDTH     = 20;     // 路径线宽

let collectibles     = [];     // 可收集道具
let collectCount     = 0;      // 道具计数
let flashEffects     = [];     // 闪光效果

let pathBtn;                   // 绘制路径按钮

// —— 覆盖 Boid.prototype.edges，反弹式边界 —— 
Boid.prototype.edges = function() {
  let closest, minD = Infinity;
  for (let seg of riverSegments) {
    const A    = createVector(seg.x - scrollOffset, seg.y);
    const B    = createVector(seg.cx - scrollOffset, seg.cy);
    const AB   = p5.Vector.sub(B, A);
    const AP   = p5.Vector.sub(this.position, A);
    const t    = constrain(AP.dot(AB) / AB.dot(AB), 0, 1);
    const proj = p5.Vector.add(A, AB.mult(t));
    const d    = p5.Vector.dist(this.position, proj);
    if (d < minD) {
      minD    = d;
      closest = { seg, proj };
    }
  }
  const halfW = closest.seg.w / 2;
  if (minD > halfW) {
    const normal   = p5.Vector.sub(this.position, closest.proj).normalize();
    const vdotn    = this.velocity.dot(normal);
    this.velocity  = p5.Vector.sub(this.velocity, p5.Vector.mult(normal, 2 * vdotn));
    this.position  = p5.Vector.add(closest.proj, p5.Vector.mult(normal, halfW - 1));
  }
};

function setup() {
  createCanvas(windowWidth, windowHeight);
  frameRate(60);
  initRiver();
  initBoids();
  generateObstacles();
  generateBubbles();
  generateCollectibles();

  // 手绘路径切换按钮 —— 只创建，不设固定位置
pathBtn = createButton('draw the path');
pathBtn.style('padding','4px 10px')
       .style('background','#fff')
       .mousePressed(() => {
         drawPathMode = !drawPathMode;
         pathBtn.style('background', drawPathMode ? '#ccc' : '#fff');
         if (!drawPathMode) {
           isDrawingPath = false;
           currentPath   = [];
           pathQueue     = [];
         }
       });
}

function draw() {
  // —— 先重置任何矩阵变换 —— 
  drawingContext.resetTransform();
  resetMatrix();

  // —— 1. 背景 & 河道 —— 
  for (let y = 0; y < height; y++) {
    const t = map(y, 0, height, 0, 1);
    const topSoil    = color(150, 120, 90);
    const bottomSoil = color( 80,  70,  60);
    stroke(lerpColor(topSoil, bottomSoil, t));
    line(0, y, width, y);
  }
  drawRiver();

  // —— 2. 如果游戏已结束——只渲染静态然后画结果界面 —— 
  if (showResult) {
    // 把最后一帧的世界渲染出来（障碍／气泡／爆炸／道具／闪光／路径／Boids）
    drawObstacles();
    drawBubbles();
    drawExplosions();
    renderCollectibles();
    renderFlash();
    drawPaths();
    boids.forEach(b => b.show(drawFish));

    // 画顶栏 + 结果弹窗
    drawTopBar();
    drawResultScreen();
    return;
  }

  // —— 3. 如果处于暂停态 —— 
  if (showPauseUI) {
    // 静态渲染上述内容
    drawObstacles();
    drawBubbles();
    drawExplosions();
    renderCollectibles();
    renderFlash();
    drawPaths();
    boids.forEach(b => b.show(drawFish));

    // 顶栏 + 暂停弹窗
    drawTopBar();
    drawPauseScreen();
    return;
  }

  // —— 4. 正常运行态：更新世界 & 渲染 —— 

  // 4.1 滚动 & 生成障碍 & 气泡 & 爆炸
  scrollOffset += scrollSpeed;
  if (scrollOffset % obstacleSpacing < scrollSpeed) spawnObstacle();
  if (frameCount % 120 === 0) spawnObstacle();
  drawBubbles();
  drawObstacles();
  drawExplosions();

  // 4.2 可收集道具 & 闪光
  renderCollectibles();
  renderFlash();

  // 4.3 手绘路径 UI
  drawPaths();

  // 4.4 Boids 行为
  if (pathQueue.length) runPathGuidance();
  else              runOriginalLogic();

  // —— 5. 最后画顶栏 —— 
  drawTopBar();
}





// —— 初始化河道控制点 —— 
function initRiver() {
  riverSegments = [];
  const totalDist = scrollSpeed * maxTime * 60 + width;
  const pts = [
    { x: 0,             y: height * 0.50 },
    { x: totalDist*0.20, y: height * 0.40 },
    { x: totalDist*0.40, y: height * 0.60 },
    { x: totalDist*0.60, y: height * 0.45 },
    { x: totalDist*0.80, y: height * 0.55 },
    { x: totalDist*1.00, y: height * 0.50 }
  ];
  const widths = [300,260,300,280,320];
  for (let i=0; i<pts.length-1; i++) {
    riverSegments.push({
      x: pts[i].x, y: pts[i].y,
      cx: pts[i+1].x, cy: pts[i+1].y,
      w: widths[i]
    });
  }
}

function drawRiver() {
  noStroke();
  fill(170,215,235,200);
  const left = [], right = [];
  for (let seg of riverSegments) {
    const dx=seg.cx-seg.x, dy=seg.cy-seg.y,
          len=sqrt(dx*dx+dy*dy),
          px=-dy/len*(seg.w/2),
          py= dx/len*(seg.w/2);
    left.push({ x: seg.x+px-scrollOffset, y: seg.y+py });
    right.push({ x: seg.x-px-scrollOffset, y: seg.y-py });
  }
  const last=riverSegments[riverSegments.length-1];
  const dx=last.cx-last.x, dy=last.cy-last.y,
        len=sqrt(dx*dx+dy*dy),
        px=-dy/len*(last.w/2),
        py= dx/len*(last.w/2);
  left.push({ x:last.cx+px-scrollOffset, y:last.cy+py });
  right.push({ x:last.cx-px-scrollOffset, y:last.cy-py });

  beginShape();
    left.forEach(p=>vertex(p.x,p.y));
    right.reverse().forEach(p=>vertex(p.x,p.y));
  endShape(CLOSE);
}

// Boids 初始化
function initBoids() {
  boids = [];
  for (let i=0; i<totalBoids; i++) {
    const seg = riverSegments[0],
          t   = random(),
          bx  = lerp(seg.x,seg.cx,t),
          by  = lerp(seg.y,seg.cy,t),
          ang = atan2(seg.cy-seg.y,seg.cx-seg.x)+HALF_PI,
          off = random(-seg.w/2+20,seg.w/2-20);
    boids.push(new Boid(bx+cos(ang)*off, by+sin(ang)*off));
  }
  attractMode   = false;
  showResult    = false;
  hasStarted    = true;
  isPaused      = false;
  showPauseUI   = false;
  scrollOffset  = 0;
  resultText    = "";
  levelPassed   = false;
  goalZone      = null;
  collectCount  = 0;
  collectibles  = [];
  flashEffects  = [];
  generateCollectibles();
  startTime     = millis();
}

function drawTopBar() {
  push();
    resetMatrix();
    noStroke();
    fill(30,144,255);
    rect(0, 0, width, navHeight);

    // 菜单图标
    textSize(28);
    textAlign(LEFT, CENTER);
    fill(255);
    text("≡", 24, navHeight/2);

    // 血条
    drawHealthBar(width/2, navHeight/2);

    // 道具计数
    fill(255,223,0);
    textSize(16);
    textAlign(LEFT, CENTER);
    text(`🔶 ${collectCount}`, width/2 + 120, navHeight/2);

    // 倒计时
    if (hasStarted && !showResult) {
      const now = showPauseUI ? pauseStart : millis();
      const elapsed = (now - startTime) / 1000;
      const remaining = max(0, floor(maxTime - elapsed));
      textSize(22);
      textAlign(RIGHT, CENTER);
      fill(255);
      text("⏱️ " + remaining + "s", width - 40, navHeight/2);
    }
  pop();

  // —— 把“绘制路径”按钮放在血条左侧，与道具计数器左右对称 —— 
  {
    // 血条本身宽度是在 drawHealthBar 里写死为 200px
    const barWidth = 200;
    // 距离血条左右两侧我们想留的间距
    const spacing = 20;
    // 按钮的真实尺寸
    const btnW = pathBtn.elt.clientWidth;
    const btnH = pathBtn.elt.clientHeight;
    // 计算 x, y
    const x = width/2 - barWidth/2 - spacing - btnW;
    const y = (navHeight - btnH) / 2;
    pathBtn.position(x, y);
}
}



// 可收集道具初始化
function generateCollectibles() {
  collectibles = [];
  for (let i = 0; i < 10; i++) {
    let cx = scrollOffset + width + random(200,800);
    let cy = random(navHeight+20, height-20);
    collectibles.push({ x: cx, y: cy, r: 12 });
  }
}

// 渲染 & 收集道具
// 渲染 & 收集道具 —— 在 boids 碰到黄球时，不仅 ++collectCount，还要长出新 boid（上限 totalBoids）
function renderCollectibles() {
  noStroke(); fill(255,223,0);
  for (let i = collectibles.length - 1; i >= 0; i--) {
    let c  = collectibles[i];
    let sx = c.x - scrollOffset;
    if (sx > -20 && sx < width + 20) ellipse(sx, c.y, c.r * 2);

    for (let b of boids) {
      if (dist(b.position.x, b.position.y, sx, c.y) < b.maxSpeed + c.r) {
        // 播闪光
        flashEffects.push({ x: sx, y: c.y, t: millis() });
        // 从列表移除这个黄球
        collectibles.splice(i, 1);
        // 道具计数 +1
        collectCount++;

        // 如果当前鸟少于上限，就长出一只新鸟并自动加入血条
        if (boids.length < totalBoids) {
          // 在当前碰撞点生成一只新鸟
          // worldX = c.x, worldY = c.y
          const newBoid = new Boid(c.x, c.y);
          boids.push(newBoid);
        }

        // 一旦吃到就 break，不要重复处理同一个球
        break;
      }
    }
  }
}


// 渲染闪光
function renderFlash() {
  for (let i = flashEffects.length - 1; i >= 0; i--) {
    let f = flashEffects[i], d = millis() - f.t;
    if (d > 300) { flashEffects.splice(i,1); continue; }
    let alpha = map(d,0,300,255,0), rad = map(d,0,300,8,32);
    noFill(); stroke(255,255,0,alpha); strokeWeight(2);
    ellipse(f.x, f.y, rad*2);
  }
}

// 渲染手绘路径
function drawPaths() {
  drawingContext.setLineDash([12,8]);
  stroke(255); strokeWeight(PATH_WIDTH); noFill();
  for (let path of pathQueue) {
    for (let i = 0; i < path.length - 1; i++) {
      let a = map(i, 0, path.length - 1, 255, 50);
      stroke(255, a);
      let p1 = path[i], p2 = path[i + 1];
      line(p1.x, p1.y, p2.x, p2.y);
    }
  }
  drawingContext.setLineDash([]);
  if (isDrawingPath && currentPath.length > 1) {
    drawingContext.setLineDash([12,8]);
    stroke(255,200); strokeWeight(PATH_WIDTH);
    beginShape();
      currentPath.forEach(p => vertex(p.x, p.y));
    endShape();
    drawingContext.setLineDash([]);
  }
}




function runPathGuidance() {

  // —— 先更新/生成终点 —— 
  handleGoalZone();
  // 1. 画终点（如果已有）
  if (goalZone) drawGoal();

  // 2. 对每个 boid：碰撞→群体→吸引→更新→渲染
  for (let i = boids.length - 1; i >= 0; i--) {
    let b = boids[i];

    // 碰撞检测
    for (let obs of obstacles) {
      let sx = obs.x - scrollOffset;
      if (dist(b.position.x, b.position.y, sx, obs.y) < obs.avoidRadius) {
        explosions.push({ x: b.position.x, y: b.position.y, size: 2, alpha: 255 });
        boids.splice(i, 1);
        break; // 跳出 obs 循环
      }
    }

    // 群体 & 边界
    b.edges();
    b.flock(boids);

    // 距离起点判断
    let startPt = pathQueue[0][0];
    let dStart  = dist(b.position.x, b.position.y, startPt.x, startPt.y);

    if (dStart > PATH_INFLUENCE_RADIUS) {
      b.attract(startPt.x, startPt.y);
    } else {
      b.followPath(pathQueue[0]);
    }

    // 更新 & 渲染
    b.update();
    b.velocity.limit(b.maxSpeed);
    b.show(drawFish);
  }

  // **中途存活率判定**：如果小于 50%，立刻失败
  if (boids.length / totalBoids < 0.5) {
    resultText  = "Challenge failed！";
    levelPassed = false;
    showResult  = true;
    // 渲染一次画面然后直接 return
    drawTopBar();
    drawResultScreen();
    return;
  }

  // 3. 路径走完就移除
  // 3. 检查：如果所有 boid 都进入了路径末端范围，就立刻清掉玩家画的那条线
let endPt = pathQueue[0][pathQueue[0].length - 1];
if (boids.every(b => dist(b.position.x, b.position.y, endPt.x, endPt.y) < PATH_INFLUENCE_RADIUS/2)) {
  pathQueue = [];
}


  // 4. 到达终点绿圈后，用 50% 判定胜负
  if (pathQueue.length === 0 && goalZone && goalZone.arrived) {
    const arrivedCount = boids.filter(b =>
      dist(b.position.x, b.position.y, goalZone.x, goalZone.y) < goalZone.r
    ).length;
    if (arrivedCount / totalBoids >= 0.5) {
      resultText  = "successful migration！";
      levelPassed = true;
    } else {
      resultText  = "Challenge failed！";
      levelPassed = false;
    }
    showResult = true;
  }

  // 5. 最后渲染顶部和弹窗
  drawTopBar();
  if (showResult)      drawResultScreen();
  else if (showPauseUI) drawPauseScreen();
}




// —————— 新增函数：关卡结束判定 ——————
function checkGameState() {
  const alive = boids.length;
  // 存活率 ≥ 50% 视为成功
  if (alive / totalBoids >= 0.5) {
    resultText  = "successful migration！";
    levelPassed = true;
  } else {
    resultText  = "Challenge failed！";
    levelPassed = false;
  }
  // 弹出结果界面
  showResult = true;
}
// 原始游戏逻辑分支
function runOriginalLogic() {
  const elapsed = (millis() - startTime) / 1000;
  if (elapsed >= goalComingTime && !goalZone) {
    const last = riverSegments[riverSegments.length - 2];
    goalZone = { x: width+200, y: last.cy, r:60, arrived:false, targetX:width*0.8, targetY:last.cy };
  }
  if (goalZone && !goalZone.arrived) {
    goalZone.x = lerp(goalZone.x, goalZone.targetX, 0.02);
    goalZone.y = lerp(goalZone.y, goalZone.targetY, 0.02);
    if (abs(goalZone.x - goalZone.targetX) < 1) goalZone.arrived = true;
  }
  if (goalZone) drawGoal();

  if (!showResult) {
    updateBoids();
    const reached = boids.filter(b=>b.reachedGoal).length;
    if (reached/totalBoids >= 0.5) { resultText="successful migration！"; levelPassed=true; showResult=true; return; }
    if (boids.length/totalBoids < 0.5)   { resultText="Challenge failed！"; levelPassed=false; showResult=true; return; }
    if (elapsed>=maxTime) {
      if (boids.length/totalBoids>=0.5) { resultText="successful migration！"; levelPassed=true; }
      else                              { resultText="Timeout ！";               levelPassed=false; }
      showResult = true;
    }
  }
}

// 以下所有函数与原 challenge2.js 完全一致：

function spawnObstacle() {
  const seg = random(riverSegments),
        t   = random(),
        bx  = lerp(seg.x,seg.cx,t),
        by  = lerp(seg.y,seg.cy,t),
        ang = atan2(seg.cy-seg.y,seg.cx-seg.x)+HALF_PI,
        off = random(-seg.w/2+20,seg.w/2-20);
  const ox=bx+cos(ang)*off, oy=by+sin(ang)*off;
  if (random()<0.5) {
    const r=random(20,50);
    obstacles.push({type:'rock',x:ox,y:oy,r,avoidRadius:r*0.8});
  } else {
    obstacles.push({type:'drift_debris',x:ox,y:oy,vx:-30,vy:0,avoidRadius:20});
  }
}

function generateObstacles() {
  obstacles=[];
  for (let i=0; i<15; i++) spawnObstacle();
}

function generateBubbles() {
  bubbles=[];
  for (let i=0; i<40; i++) {
    bubbles.push({
      x: random(width*2.5),
      y: random(navHeight, height),
      r: random(3,8),
      alpha: random(100,200),
      speed: random(0.5,1.5)
    });
  }
}

function drawBubbles() {
  noStroke();
  for (let b of bubbles) {
    fill(255,255,255,b.alpha);
    ellipse(b.x-scrollOffset,b.y,b.r);
    b.y -= b.speed;
    if (b.y < navHeight) {
      b.y = height;
      b.x = random(width*2.5);
    }
  }
}

function drawObstacles() {
  for (let obs of obstacles) {
    const sx = obs.x - scrollOffset;
    if (sx < -100 || sx > width+100) continue;
    if (obs.type==='rock') {
      noStroke(); fill(80);
      ellipse(sx,obs.y,obs.r*2);
    } else {
      stroke(139,69,19); strokeWeight(4);
      line(sx-15,obs.y,sx+15,obs.y);
      for (let i=-1;i<=1;i++) line(sx+i*10,obs.y-10,sx+i*10,obs.y+10);
    }
  }
}

function updateBoids() {
  for (let i = boids.length - 1; i >= 0; i--) {
    const b = boids[i];
    for (let obs of obstacles) {
      const d = dist(b.position.x,b.position.y,obs.x-scrollOffset,obs.y);
      if (d < obs.avoidRadius) { boids.splice(i,1); continue; }
    }
    b.edges();
    b.flock(boids);
    if (attractMode) b.attract(mouseX,mouseY);
    b.update();
    if (goalZone && !b.reachedGoal) {
      const dG = dist(b.position.x,b.position.y,goalZone.x,goalZone.y);
      if (dG < goalZone.r) b.reachedGoal = true;
    }
    b.show(drawFish);
  }
}

function drawGoal() {
  push();
    fill(0,255,100,80);
    stroke(0,255,100); strokeWeight(4);
    ellipse(goalZone.x,goalZone.y,goalZone.r*2);
  pop();
}

function drawExplosions() {
  for (let i=explosions.length-1;i>=0;i--) {
    const e=explosions[i];
    fill(255,150,0,e.alpha); noStroke();
    ellipse(e.x,e.y,e.size);
    e.size+=1.5; e.alpha-=6;
    if (e.alpha<=0) explosions.splice(i,1);
  }
}

function drawHealthBar(x,y) {
  const w=200,h=18,curr=boids.length,ratio=curr/totalBoids;
  let col=color(0,220,100);
  if (ratio<0.6) col=color(255,165,0);
  if (ratio<0.3) col=(frameCount%20<10?color(255,60,60):color(120,0,0));
  rectMode(CENTER); fill(50,50,50,220); stroke(80); strokeWeight(2);
  rect(x,y,w,h,10); noStroke(); fill(col);
  rect(x,y,w*ratio,h,10);
  fill(255); textSize(14); textAlign(CENTER,CENTER);
  text(`${curr} / ${totalBoids}`, x,y);
}

// 替换 drawResultScreen()
function drawResultScreen() {
  push();
    // 半透明遮罩
    fill(0, 0, 0, 150);
    noStroke();
    rect(0, 0, width, height);
  pop();

  // 中心对话框
  const boxW = 400, boxH = 260;
  const bx = width/2 - boxW/2, by = height/2 - boxH/2;
  push();
    rectMode(CORNER);
    // 淡蓝色背景
    fill(173, 216, 230);
    stroke(80, 120, 150);
    strokeWeight(2);
    rect(bx, by, boxW, boxH, 12);

    // 结果文字
    noStroke();
    fill(30, 30, 30);
    textAlign(CENTER, TOP);
    textSize(32);
    text(resultText, width/2, by + 24);

    // 第一按钮 “Try again”
    const btnW = boxW * 0.6, btnH = 44;
    const btnX = width/2 - btnW/2;
    const btnY1 = by + 80;
    fill(100, 149, 237);
    rect(btnX, btnY1, btnW, btnH, 8);
    fill(255);
    textSize(18);
    textAlign(CENTER, CENTER);
    text("Try again", width/2, btnY1 + btnH/2);

    // 第二按钮 “Next round” / “Return to home page”
    const btnY2 = btnY1 + btnH + 20;
    fill(100, 149, 237);
    rect(btnX, btnY2, btnW, btnH, 8);
    fill(255);
    const label = levelPassed ? "Next round" : "Return to home page";
    text(label, width/2, btnY2 + btnH/2);
  pop();
}

// 替换 drawPauseScreen()
function drawPauseScreen() {
  push();
    // 半透明遮罩
    fill(0, 0, 0, 150);
    noStroke();
    rect(0, 0, width, height);
  pop();

  // 中心对话框
  const boxW = 360, boxH = 220;
  const bx = width/2 - boxW/2, by = height/2 - boxH/2;
  push();
    rectMode(CORNER);
    // 淡蓝色背景
    fill(173, 216, 230);
    stroke(80, 120, 150);
    strokeWeight(2);
    rect(bx, by, boxW, boxH, 12);

    // 标题
    noStroke();
    fill(30, 30, 30);
    textAlign(CENTER, TOP);
    textSize(28);
    text("Game suspended", width/2, by + 20);

    // “Continue playing” 按钮
    const btnW = boxW * 0.7, btnH = 42;
    const btnX = width/2 - btnW/2;
    const btnY1 = by + 80;
    fill(100, 149, 237);
    rect(btnX, btnY1, btnW, btnH, 8);
    fill(255);
    textSize(18);
    textAlign(CENTER, CENTER);
    text("Continue playing", width/2, btnY1 + btnH/2);

    // “Return to home page” 按钮
    const btnY2 = btnY1 + btnH + 16;
    fill(100, 149, 237);
    rect(btnX, btnY2, btnW, btnH, 8);
    fill(255);
    text("Return to home page", width/2, btnY2 + btnH/2);
  pop();
}

function mousePressed() {
  // —— 1. 如果结果界面已弹出，则优先处理“再玩一次”或“下一关/返回” —— 
  if (showResult) {
    const boxW = 400, boxH = 300;
    const bx   = width/2 - boxW/2;
    const by   = height/2 - boxH/2;
    const btnW = boxW * 0.8, btnH = 50;
    const btnX = width/2 - btnW/2;

    // “Try again”
    if (
      mouseX > btnX && mouseX < btnX + btnW &&
      mouseY > by + 100 && mouseY < by + 100 + btnH
    ) {
      retryCount++;
      initBoids();
      generateObstacles();
      generateBubbles();
      showResult = false;
    }
    // “Next round” / “Return to home page”
    else if (
      mouseX > btnX && mouseX < btnX + btnW &&
      mouseY > by + 180 && mouseY < by + 180 + btnH
    ) {
      if (levelPassed) {
        saveLevelRecord(2);
        window.location.href = 'level3intro.html';
      } else {
        localStorage.removeItem('tmpRecord');
        window.location.href = 'main.html';
      }
    }
    return;
  }

  // —— 2. 如果点击左上角（菜单/暂停按钮） —— 切换暂停/恢复 —— 
  //     区域：x<50 且 y<navHeight
  if (mouseX < 50 && mouseY < navHeight) {
    // “进入”暂停前记录当前时刻
    if (!showPauseUI) {
      pauseStart = millis();
    }
    // “退出”暂停时，补偿 startTime
    else {
      startTime += (millis() - pauseStart);
    }
    showPauseUI = !showPauseUI;
    return;
  }

  // —— 3. 如果在暂停菜单里，再处理“继续”或“返回主页”按钮 —— 
  if (showPauseUI) {
    // “Continue playing”
    if (
      mouseX > width/2 - 80 && mouseX < width/2 + 80 &&
      mouseY > height/2 - 20 && mouseY < height/2 + 20
    ) {
      // 跳出暂停
      startTime += (millis() - pauseStart);
      showPauseUI = false;
    }
    // “Return to home page”
    else if (
      mouseX > width/2 - 80 && mouseX < width/2 + 80 &&
      mouseY > height/2 + 40 && mouseY < height/2 + 100
    ) {
      window.location.href = 'main.html';
    }
    return;
  }

  // —— 4. 绘制路径模式 —— 
  if (drawPathMode) {
    isDrawingPath = true;
    currentPath   = [{ x: mouseX, y: mouseY }];
    return;
  }

  // —— 5. 普通吸附切换 —— 
  if (!hasStarted) {
    hasStarted = true;
    startTime  = millis();
  }
  attractMode = !attractMode;
}



function mouseDragged() {
  if (drawPathMode && isDrawingPath) {
    currentPath.push({ x: mouseX, y: mouseY });
  }
}

function mouseReleased() {
  if (drawPathMode && isDrawingPath) {
    isDrawingPath = false;
    if (currentPath.length > 1) {
      pathQueue = [ currentPath.slice() ];
    }
    currentPath = [];
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function drawFish(x,y,angle) {
  push();
    translate(x,y);
    rotate(angle);
    noStroke(); fill(255,200,100);
    beginShape();
      vertex(12,0); vertex(-10,6);
      vertex(-8,0); vertex(-10,-6);
    endShape(CLOSE);
  pop();
}
