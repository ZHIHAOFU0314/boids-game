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


// ✅ challenge3.js - 第三关：深海征途（含手绘路径引导 & 可收集道具）
// 在文件最顶端，已有 let collectCount = 0; 这一行附近，新增：
let retryCount = 0;  // 本关重试次数
// —— 全局变量 —— 

// —— 路径引导参数 —— 
const PATH_INFLUENCE_RADIUS = 100;  // 流场影响半径
const PATH_STRENGTH         = 0.3;  // （虽然在本关暂时没用到强度，但保持和前两关一致）

let boids          = [];
let attractMode    = false;
let obstacles      = [];
let explosions     = [];
let bubbles        = [];
let showResult     = false;
let hasStarted     = false;
let isPaused       = false;   // 暂停状态
let showPauseUI    = false;   // 暂停菜单显示
let pauseTime = 0;


let scrollOffset   = 0;
let scrollSpeed    = 2;
let obstacleSpacing= 400;
const totalBoids   = 100;
const navHeight    = 100;

let maxTime        = 60;
let startTime      = 0;
let resultText     = "";
let levelPassed    = false;

let goalZone       = null;
let goalComingTime = 45; // 45s 后出现终点

let predators      = [];
const predatorSpawnTimes = [10, 30];  // 单位：秒
const chaseDuration       = 8 * 1000; // 毫秒

// —— 地震逻辑 —— 
const quakeTimes    = [10, 40];   // 触发秒点
const quakeDuration = 2000;       // 持续毫秒
let quakeStart      = null;
let inQuake         = false;

// —— 手绘路径 & 道具状态 —— 
let drawPathMode   = false;
let isDrawingPath  = false;
let currentPath    = [];
let pathQueue      = [];
const PATH_WIDTH   = 20;

let collectibles   = [];
let collectCount   = 0;
let flashEffects   = [];
let pathBtn;                     // “绘制路径”按钮

// —— 改写 Boid 边界 —— 
Boid.prototype.edges = function() {
  const bounce = -0.8;
  // 左边界：scrollOffset
  if (this.position.x < scrollOffset && this.velocity.x < 0) {
    this.position.x = scrollOffset;
    this.velocity.x *= bounce;
  }
  // 上边界：navHeight
  if (this.position.y < navHeight) {
    this.position.y = navHeight;
    if (this.velocity.y < 0) this.velocity.y *= bounce;
  }
  // 下边界：canvas 底部
  if (this.position.y > height) {
    this.position.y = height;
    if (this.velocity.y > 0) this.velocity.y *= bounce;
  }
  // 右侧不处理
};

function setup() {
  createCanvas(windowWidth, windowHeight);
  frameRate(60);
  //initRiver();
  initBoids();
  generateObstacles();
  generateBubbles();
  generateCollectibles();

  // 只创建，不定位
  pathBtn = createButton('Drawing paths');
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
  // —— 0. 地震更新 —— 
  let elapsed = (millis() - startTime) / 1000;
  // 触发地震
  for (let qt of quakeTimes) {
    if (elapsed >= qt && elapsed < qt + 0.1 && quakeStart === null) {
      quakeStart = millis();
      boids.forEach(b => {
        b.position.x += random(-50, 50);
        b.position.y += random(-50, 50);
        b.velocity = p5.Vector.random2D().mult(random(2, 4));
        b.acceleration.mult(0);
      });
    }
  }
  // 地震状态
  if (quakeStart !== null && millis() - quakeStart < quakeDuration) {
    inQuake = true;
  } else {
    inQuake = false;
    if (quakeStart !== null && millis() - quakeStart >= quakeDuration) {
      quakeStart = null;
    }
  }

  // —— 1. 世界内容（背景+气泡+障碍+爆炸+道具+闪光+路径+Boids）——
  push();
    if (inQuake) {
      // 整个世界抖动
      translate(random(-10, 10), random(-10, 10));
    }
    drawDeepSeaBackground();
    drawBubbles();
    drawObstacles();
    drawExplosions();
    renderCollectibles();
    renderFlash();
    drawPaths();
    boids.forEach(b => b.show(drawFish));
  pop();

  // —— 2. UI（顶栏 + 暂停/结果弹窗）——
  drawTopBar();

  // —— 3. 暂停分支 —— 
  if (showPauseUI) {
    drawPauseScreen();
    return;
  }
  // —— 4. 结果分支 —— 
  if (showResult) {
    drawResultScreen();
    return;
  }

  // —— 5. 正常更新 —— 

  // 5.1 滚动 & 刷新障碍（当终点圈尚未出现时才滚动）
  if (hasStarted && !goalZone) {
    scrollOffset += scrollSpeed;
    if (scrollOffset % obstacleSpacing < scrollSpeed) spawnObstacle();
    if (frameCount % 120 === 0) spawnObstacle();
    obstacles.forEach(obs => {
      obs.x -= scrollSpeed * 0.5;
      obs.y += sin((millis() + obs.offset) / 1000) * 0.5;
      if (obs.x < -50) {
        obs.x = scrollOffset + width + random(100,300);
        obs.y = random(navHeight+50, height-50);
      }
    });
  }

  // 5.2 捕食者逻辑
  let t2 = (millis() - startTime) / 1000;
  for (let spawnSec of predatorSpawnTimes) {
    if (t2 >= spawnSec && predators.length < predatorSpawnTimes.indexOf(spawnSec) + 1) {
      predators.push({
        x: scrollOffset + width + 100,
        y: random(navHeight+50, height-50),
        size: 80, speed: 1.5,
        spawnTime: millis(), state: 'chase'
      });
    }
  }
  predators.forEach(p => {
    let age = millis() - p.spawnTime;
    if (age < chaseDuration && boids.length) {
      let target = boids.reduce((best, b) =>
        !best ||
        p5.Vector.dist(createVector(p.x,p.y), b.position) <
        p5.Vector.dist(createVector(p.x,p.y), best.position)
        ? b : best
      , null);
      let dir = createVector(target.position.x - p.x, target.position.y - p.y)
                .normalize().mult(p.speed*2);
      p.x += dir.x; p.y += dir.y;
      if (p5.Vector.dist(createVector(p.x,p.y), target.position) < (p.size/2+4)) {
        boids = boids.filter(b => p5.Vector.dist(createVector(p.x,p.y), b.position) > p.size/2);
      }
    } else {
      p.x -= p.speed;
    }
    push();
      translate(p.x - scrollOffset, p.y);
      noStroke(); fill(100,100,120);
      ellipse(0,0,p.size);
      fill(255,200,0); ellipse(p.size/4,0,12);
    pop();
  });

  // 5.3 定期产生黄色道具
  if (frameCount % 180 === 0) {
    spawnCollectible();
  }

  // 5.4 再次渲染道具 & 闪光（可选，保持流畅）
  renderCollectibles();
  renderFlash();

  // 5.5 路径 UI
  drawPaths();

  // 5.6 Boids 行为分支
  if (pathQueue.length) {
    runPathGuidance();
  } else {
    updateBoids();

    // —— 60% 存活判失败 —— 
    if (boids.length / totalBoids < 0.6) {
      resultText  = "Challenge failed！";
      levelPassed = false;
      showResult  = true;
      return;
    }
    // 70% 到达判成功
    let reachedCount = boids.filter(b => b.reachedGoal).length;
    if (reachedCount / totalBoids >= 0.7) {
      resultText  = "successful migration！";
      levelPassed = true;
      showResult  = true;
      return;
    }
    // 超时判定
    if (elapsed >= maxTime) {
      resultText  = boids.length/totalBoids >= 0.7
                  ? "successful migration！"
                  : "migration failure";
      levelPassed = boids.length/totalBoids >= 0.7;
      showResult  = true;
      return;
    }

    // 生成 & 移动终点圈
    if (elapsed >= goalComingTime && !goalZone) {
      goalZone = { x: scrollOffset + width + 100, y: height/2, r:60, arrived:false };
    }
    if (goalZone && !goalZone.arrived) {
      goalZone.x = lerp(goalZone.x, scrollOffset + width*0.8, 0.02);
      if (abs(goalZone.x - (scrollOffset + width*0.8)) < 1) {
        goalZone.arrived = true;
        goalZone.x = scrollOffset + width*0.8;
      }
    }
    if (goalZone) drawGoal();
  }
}



// —————— 帮助函数 ——————

function drawDeepSeaBackground() {
  for (let y = 0; y < height; y++) {
    let t = map(y, 0, height, 0, 1);
    let topC    = color(0,0,20);
    let bottomC = color(10,10,60);
    stroke(lerpColor(topC, bottomC, t));
    line(0,y,width,y);
  }
}

function initBoids() {
  
  // —— 新增这一行，清掉上局的 goalZone —— 
  goalZone = null;

  boids = [];
  predators = [];
  for (let i = 0; i < totalBoids; i++) {
    let x = random(scrollOffset, scrollOffset + width);
    let y = random(navHeight+50, height-50);
    let b = new Boid(x, y);
    b.reachedGoal = false;
    boids.push(b);
  }
  hasStarted   = true;
  showResult   = false;
  startTime    = millis();
  collectCount = 0;
}

function drawTopBar() {
  push();
    resetMatrix();
    noStroke();
    fill(20,30,70);
    rect(0,0,width,navHeight);

    // 暂停按钮
    textSize(28);
    fill(255);
    textAlign(LEFT,CENTER);
    text("≡",24,navHeight/2);

    // 血条
    drawHealthBar(width/2, navHeight/2);

    // 道具计数
    fill(255,223,0);
    textSize(16);
    textAlign(LEFT,CENTER);
    text(`🔶 ${collectCount}`, width/2 + 120, navHeight/2);

    // **倒计时：如果正在暂停，就用 pauseTime；否则用真实的 millis()。**
    const now     = showPauseUI ? pauseTime : millis();
    const elapsed = (now - startTime) / 1000;
    const rem     = hasStarted
                    ? max(0, floor(maxTime - elapsed))
                    : maxTime;
    textSize(22);
    textAlign(RIGHT, CENTER);
    fill(255);
    text(`⏱️ ${rem}s`, width - 24, navHeight/2);
  pop();
  // —— 按钮布局 —— 
  {
    // drawHealthBar 用的是 200px 宽
    const barWidth = 200;
    // 血条两侧留 20px 间距
    const spacing = 20;
    // 按钮实际尺寸（clientWidth 在 p5.dom 里可用）
    const btnW = pathBtn.elt.clientWidth;
    const btnH = pathBtn.elt.clientHeight;
    // x: 血条中心 width/2，向左半条宽，再减 spacing，再减 btnW，正好让按钮右边缘对准血条左侧 spacing 处
    const x = width / 2 - barWidth / 2 - spacing - btnW;
    // y: 导航栏垂直居中
    const y = (navHeight - btnH) / 2;
    pathBtn.position(x, y);
  }
}

function drawHealthBar(x,y) {
  const w=200, h=18;
  const curr=boids.length, ratio=curr/totalBoids;
  let col=color(0,220,100);
  if (ratio<0.6) col=color(255,165,0);
  if (ratio<0.3) col=(frameCount%20<10?color(255,60,60):color(120,0,0));
  rectMode(CENTER);
  fill(50,50,50,220);
  stroke(80); strokeWeight(2);
  rect(x,y,w,h,10);
  noStroke(); fill(col);
  rect(x,y,w*ratio,h,10);
  fill(255); textSize(14); textAlign(CENTER,CENTER);
  text(`${curr} / ${totalBoids}`, x,y);
}

// 气泡
function generateBubbles() {
  bubbles = [];
  for (let i=0; i<40; i++){
    bubbles.push({
      x: random(scrollOffset, scrollOffset+width),
      y: random(navHeight, height),
      r: random(2,6),
      alpha: random(80,150),
      speed: random(0.3,1.0)
    });
  }
}
function drawBubbles() {
  noStroke(); fill(200,200,255,120);
  for (let b of bubbles) {
    ellipse(b.x-scrollOffset, b.y, b.r);
    b.y -= b.speed;
    if (b.y < navHeight) {
      b.y = height;
      b.x = random(scrollOffset, scrollOffset+width);
    }
  }
}

// 障碍：水母
function generateObstacles() {
  obstacles = [];
  for (let i=0; i<12; i++){
    obstacles.push({
      type:'jelly',
      x: scrollOffset + random(width, width*2),
      y: random(navHeight+50, height-50),
      offset: random(1000)
    });
  }
}
function spawnObstacle() {
  obstacles.push({
    type:'jelly',
    x: scrollOffset + width + random(100,300),
    y: random(navHeight+50, height-50),
    offset: random(1000)
  });
}
function drawObstacles() {
  noStroke(); fill(200,100,200,150);
  for (let obs of obstacles) {
    let sx = obs.x - scrollOffset;
    if (sx < -50 || sx > width+50) continue;
    ellipse(sx, obs.y, 30, 40);
  }
}

function drawExplosions() {
  for (let i=explosions.length-1; i>=0; i--){
    let e = explosions[i];
    noStroke(); fill(255,100,0,e.alpha);
    ellipse(e.x-scrollOffset, e.y, e.size);
    e.size += 1.5; e.alpha -= 6;
    if (e.alpha <= 0) explosions.splice(i,1);
  }
}

// Boids 更新（原始逻辑）
function updateBoids() {
  for (let i=boids.length-1; i>=0; i--){
    let b = boids[i];
    // 碰撞水母
    for (let obs of obstacles) {
      if (dist(b.position.x,b.position.y, obs.x,obs.y) < 20) {
        boids.splice(i,1);
        continue;
      }
    }
    b.edges();
    if (!inQuake) b.flock(boids);
    if (attractMode) b.attract(mouseX+scrollOffset, mouseY);
    // 受捕食者排斥
    for (let p of predators) {
      let d = p5.Vector.dist(createVector(b.position.x,b.position.y), createVector(p.x,p.y));
      if (d < 200) {
        b.velocity.add(createVector(b.position.x-p.x, b.position.y-p.y).setMag(0.5));
      }
    }
    b.update();
    // 终点吸附
    if (goalZone && goalZone.arrived) b.attract(goalZone.x, goalZone.y);
    // 到达判定
    if (goalZone && !b.reachedGoal) {
      if (p5.Vector.dist(createVector(b.position.x,b.position.y),
                         createVector(goalZone.x,goalZone.y)) < goalZone.r) {
        b.reachedGoal = true;
      }
    }
    b.show(drawFish);
  }
}

// 终点圈
function drawGoal() {
  push();
    translate(goalZone.x-scrollOffset, goalZone.y);
    noFill(); stroke(0,255,100); strokeWeight(4);
    ellipse(0,0,goalZone.r*2);
  pop();
}


// —— 结果弹框 —— 
function drawResultScreen() {
  push();
    resetMatrix();                 // 重置坐标系到画布左上角
    fill(0,0,0,150);               // 半透明黑色遮罩
    rect(0, 0, width, height);
    
    const boxW = 400, boxH = 300;
    const bx   = width/2  - boxW/2;
    const by   = height/2 - boxH/2;
    noStroke();
    fill('#1e2a47');               // 弹框背景色
    rect(bx, by, boxW, boxH, 20);
    
    // 标题文字
    fill('#ffffff');
    textAlign(CENTER, TOP);
    textSize(32);
    text(resultText, width/2, by + 30);
    
    // 按钮
    const btnW = boxW * 0.8, btnH = 50;
    const btnX = width/2 - btnW/2;
    
    // “Try again”
    fill('#2a3b61');
    rect(btnX, by + 100, btnW, btnH, 10);
    fill('#ffffff');
    textSize(20);
    textAlign(CENTER, CENTER);
    text('Try again', width/2, by + 100 + btnH/2);
    
    // “查看记录” 或 “Return to home page”
    const label = levelPassed ? 'View data record' : 'Return to home page';
    fill('#2a3b61');
    rect(btnX, by + 180, btnW, btnH, 10);
    fill('#ffffff');
    text(label, width/2, by + 180 + btnH/2);
  pop();
}

// —— 手绘路径相关 —— 

function mousePressed() {
  // —— 1. 左上角“三条杠”切入/退出暂停 —— 
  // 区域：x < 50 且 y < navHeight
  if (!showResult && mouseX < 50 && mouseY < navHeight) {
    if (!showPauseUI) {
      // 切入暂停，记录此刻的毫秒数
      pauseTime = millis();
    } else {
      // 退出暂停，将暂停的这段时间加回 startTime
      startTime += millis() - pauseTime;
    }
    showPauseUI = !showPauseUI;
    return;
  }

  // —— 2. 暂停菜单内部按钮 —— 
  if (showPauseUI) {
    // “Continue playing”
    if (
      mouseX > width/2 - 80 && mouseX < width/2 + 80 &&
      mouseY > height/2 - 20 && mouseY < height/2 + 20
    ) {
      // 恢复时间计时
      startTime   += millis() - pauseTime;
      showPauseUI  = false;
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

  // —— 3. 结果弹框内部按钮 —— 
  if (showResult) {
    const boxW = 400, boxH = 300;
    const bx   = width/2 - boxW/2, by = height/2 - boxH/2;
    const btnW = boxW * 0.8, btnH = 50, btnX = width/2 - btnW/2;

    // “Try again”
    if (
      mouseX > btnX && mouseX < btnX + btnW &&
      mouseY > by + 100 && mouseY < by + 100 + btnH
    ) {
      retryCount++;
      initBoids();
      generateObstacles();
      generateBubbles();
      generateCollectibles();
      showResult = false;
    }
    // “查看记录” 或 “Return to home page”
    else if (
      mouseX > btnX && mouseX < btnX + btnW &&
      mouseY > by + 180 && mouseY < by + 180 + btnH
    ) {
      if (levelPassed) {
        saveLevelRecord(3);
        localStorage.setItem('lastRecord', localStorage.getItem('tmpRecord'));
        localStorage.removeItem('tmpRecord');
        window.location.href = 'record.html';
      } else {
        localStorage.removeItem('tmpRecord');
        window.location.href = 'main.html';
      }
    }
    return;
  }

  // —— 4. 手绘路径模式 —— 
  if (drawPathMode) {
    isDrawingPath = true;
    currentPath   = [{ x: mouseX + scrollOffset, y: mouseY }];
    return;
  }

  // —— 5. 普通模式下吸附切换 —— 
  attractMode = !attractMode;
}


function mouseDragged() {
  if (drawPathMode && isDrawingPath) {
    const worldX = mouseX + scrollOffset;
    const worldY = mouseY;
    const last   = currentPath[currentPath.length - 1];
    if (dist(worldX, worldY, last.x, last.y) > 10) {
      currentPath.push({ x: worldX, y: worldY });
    }
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

function drawPaths() {
  // 已提交的路径
  drawingContext.setLineDash([12,8]);
  stroke(255); strokeWeight(PATH_WIDTH);
  for (let path of pathQueue) {
    for (let i = 0; i < path.length - 1; i++) {
      let p1 = path[i], p2 = path[i+1];
      line(p1.x - scrollOffset, p1.y, p2.x - scrollOffset, p2.y);
    }
  }
  drawingContext.setLineDash([]);

  // 正在绘制
  if (isDrawingPath && currentPath.length > 1) {
    drawingContext.setLineDash([12,8]);
    stroke(255,200); strokeWeight(PATH_WIDTH);
    beginShape();
      for (let p of currentPath) vertex(p.x - scrollOffset, p.y);
    endShape();
    drawingContext.setLineDash([]);
  }
}

// —— 道具逻辑 —— 
function generateCollectibles() {
  collectibles = [];
  for (let i = 0; i < 10; i++) {
    let cx = scrollOffset + width + random(200,800);
    let cy = random(navHeight+50, height-50);
    collectibles.push({ x: cx, y: cy, r: 12 });
  }
}

function renderCollectibles() {
  noStroke();
  fill(255, 223, 0);
  for (let i = collectibles.length - 1; i >= 0; i--) {
    let c = collectibles[i];
    let sx = c.x - scrollOffset;
    if (sx > -20 && sx < width + 20) {
      ellipse(sx, c.y, c.r * 2);
    }
    // 碰撞检测
    for (let b of boids) {
      if (dist(b.position.x, b.position.y, c.x, c.y) < b.maxSpeed + c.r) {
        flashEffects.push({ x: c.x, y: c.y, t: millis() });
        collectibles.splice(i, 1);
        collectCount++;
        // —— 新增逻辑：吃到黄球后，如果总数 < totalBoids 则生成一条新 boid —— 
        if (boids.length < totalBoids) {
          // 在可见区域右侧生成新鱼，Y 位置和被吃掉的道具一样
          let newBoid = new Boid(scrollOffset + width + 50, c.y);
          // 给它设置个小速度，让它“游进来”
          newBoid.velocity = createVector(-1, 0).mult(newBoid.maxSpeed * 0.5);
          boids.push(newBoid);
        }
        break;
      }
    }
  }
}


// 单个可收集道具生成
function spawnCollectible() {
  let cx = scrollOffset + width + random(200, 800);
  let cy = random(navHeight + 50, height - 50);
  collectibles.push({ x: cx, y: cy, r: 12 });
}

function renderFlash() {
  for (let i = flashEffects.length - 1; i >= 0; i--) {
    let f = flashEffects[i], d = millis() - f.t;
    if (d > 300) { flashEffects.splice(i,1); continue; }
    let alpha = map(d,0,300,255,0), rad = map(d,0,300,8,32);
    noFill(); stroke(255,255,0,alpha); strokeWeight(2);
    ellipse(f.x - scrollOffset, f.y, rad*2);
  }
}



function runPathGuidance() {

  // —— 0a. 超时判定：60s 用尽直接失败 —— 
  if ((millis() - startTime) / 1000 >= maxTime) {
    resultText  = "Challenge failed！";
    levelPassed = false;
    showResult  = true;
    return;
  }
  
  // —— 0. 生成 & 漂移 终点（跟原始模式保持一致） —— 
  const elapsed = (millis() - startTime) / 1000;
  if (elapsed >= goalComingTime && !goalZone) {
    goalZone = {
      x: scrollOffset + width + 100,
      y: height / 2,
      r: 60,
      arrived: false
    };
  }
  if (goalZone && !goalZone.arrived) {
    goalZone.x = lerp(goalZone.x, scrollOffset + width * 0.8, 0.02);
    if (abs(goalZone.x - (scrollOffset + width * 0.8)) < 1) {
      goalZone.arrived = true;
      goalZone.x = scrollOffset + width * 0.8;
    }
  }

  // —— 1. 画出终点圈 —— 
  if (goalZone) drawGoal();

  // —— 2. 拿当前要跟随的路径 —— 
  const path = pathQueue[0];
  if (!path) return;

  // —— 3. 按照力场吸引、碰撞、更新、绘制每个 boid —— 
  for (let i = boids.length - 1; i >= 0; i--) {
    let b = boids[i];
    // 碰撞水母
    for (let obs of obstacles) {
      if (dist(b.position.x, b.position.y, obs.x, obs.y) < 20) {
        explosions.push({ x: b.position.x, y: b.position.y, size: 2, alpha: 255 });
        boids.splice(i, 1);
        continue;
      }
    }
    // 碰撞捕食者
    for (let p of predators) {
      if (p5.Vector.dist(
            createVector(b.position.x, b.position.y),
            createVector(p.x, p.y)
          ) < p.size / 2) {
        explosions.push({ x: b.position.x, y: b.position.y, size: 2, alpha: 255 });
        boids.splice(i, 1);
        continue;
      }
    }

    b.edges();
    b.flock(boids);

    // 力场吸引：先吸到起点，再 followPath
    const startPt = createVector(path[0].x, path[0].y);
    const dStart  = p5.Vector.dist(b.position, startPt);
    if (dStart > PATH_INFLUENCE_RADIUS) {
      b.attract(startPt.x, startPt.y);
    } else {
      b.followPath(path);
    }

    b.update();
    b.velocity.limit(b.maxSpeed);
    b.show(drawFish);
  }

  // —— 4. 路径走完就移除 —— 
  const pathEnd   = createVector(path[path.length - 1].x, path[path.length - 1].y);
  const finishThr = PATH_INFLUENCE_RADIUS / 2;
  if (boids.length > 0 && boids.every(b => p5.Vector.dist(b.position, pathEnd) < finishThr)) {
    pathQueue.shift();
  }

  // —— 5. 生命不足 60% 立刻判失败 —— 
  if (boids.length / totalBoids < 0.6) {
    resultText  = "Challenge failed！";
    levelPassed = false;
    showResult  = true;
  }
  // —— 6. 【关键改动】路径跑完 + goalZone 存在 即刻做成败判定 —— 
  //      不再 require goalZone.arrived === true
  else if (pathQueue.length === 0 && goalZone) {
    const arrivedCount = boids.filter(b =>
      dist(b.position.x, b.position.y, goalZone.x, goalZone.y) < goalZone.r
    ).length;
    if (arrivedCount / totalBoids >= 0.6) {
      resultText  = "successful migration！";
      levelPassed = true;
    } else {
      resultText  = "Challenge failed！";
      levelPassed = false;
    }
    showResult = true;
  }

  // —— 7. 再画一次顶栏 & 弹窗 —— 
  drawTopBar();
  if (showResult)      drawResultScreen();
  else if (showPauseUI) drawPauseScreen();
}








// —— 窗口大小改变 —— 
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// —— 鱼形状绘制 —— 
function drawFish(x, y, angle) {
  push();
    translate(x - scrollOffset, y);
    rotate(angle);
    noStroke(); fill(200,200,255);
    beginShape();
      vertex(10,0);
      vertex(-10,6);
      vertex(-8,0);
      vertex(-10,-6);
    endShape(CLOSE);
  pop();
}
 function drawPauseScreen() {
  push();
    // 半透明全屏遮罩
    resetMatrix();
    fill(0, 0, 0, 150);
    noStroke();
    rect(0, 0, width, height);

    // --- 准备参数 ---
    // 对话框尺寸：宽度要大于最宽按钮 + 两侧边距
    const padding = 20;         // 对话框内侧留白
    textSize(18);
    const labels = ['Continue playing', 'Return to home page'];
    // 测量最宽文字
    let maxLabelW = 0;
    for (let lab of labels) {
      maxLabelW = max(maxLabelW, textWidth(lab));
    }
    const btnH = 36;            // 按钮高度固定
    const btnW = maxLabelW + 40; // 文字宽度 + 左右各 20px 内边距
    const btnGap = 16;          // 两个按钮之间的垂直间距

    const boxW = btnW + padding * 2;
    const boxH = 80 + btnH * labels.length + btnGap * (labels.length - 1);

    const bx = width/2  - boxW/2;
    const by = height/2 - boxH/2;

    // --- 绘制对话框背景 ---
    fill('#1e2a47');
    stroke(80);
    strokeWeight(2);
    rect(bx, by, boxW, boxH, 12);

    // --- 标题 ---
    noStroke();
    fill('#ffffff');
    textSize(24);
    textAlign(CENTER, TOP);
    text('Game suspended', width/2, by + 16);

    // --- 按钮 ---
    textSize(18);
    textAlign(CENTER, CENTER);
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];
      const x = width/2 - btnW/2;
      const y = by + 60 + i * (btnH + btnGap);

      // 按钮背景
      fill('#2a3b61');
      noStroke();
      rect(x, y, btnW, btnH, 8);

      // 按钮文字
      fill('#ffffff');
      text(label, width/2, y + btnH/2);
    }
  pop();
}





